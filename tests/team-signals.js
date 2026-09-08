(function (C) {
    "use strict";
    C.runTeamSignalTests = function (check) {
        function fixture(playerId = 1) {
            const game = new C.Game({ playerId, activeFactionIds: [1, 2, 3, 4], aiFactionIds: [], enableAI: false, enableWorldEvents: false, timeScale: 1 });
            game.state.factions = C.FACTION_DEFINITIONS.map((definition, index) => new C.Faction({
                ...definition, teamId: index < 2 ? 1 : 2, playerName: `Joueur ${index + 1}`, isAI: false
            }));
            game.state.territories = [1, 2, 3, null, 4, null, null].map((ownerId, index) => {
                const x = index * 90 + 60;
                const t = new C.Territory({ id: index + 1, name: `Position ${index + 1}`, terrain: "plain", center: { x, y: 140 },
                    polygon: [{ x: x - 40, y: 100 }, { x: x + 40, y: 100 }, { x: x + 40, y: 180 }, { x: x - 40, y: 180 }] });
                t.ownerId = ownerId;
                t.units = 20;
                t.neighbors = [index, index + 2].filter((id) => id >= 1 && id <= 7);
                return t;
            });
            return game;
        }
        const host = fixture();
        const command = { type: "SEND_TEAM_SIGNAL", playerId: 1, signalType: "attack", targetTerritoryId: 3 };
        const logCount = host.state.events.length;
        const unitsBefore = host.state.territories.map((territory) => territory.units).join(",");
        const sent = host.executeCommand(command);
        check(sent.ok && sent.signal.teamId === 1 && sent.signal.expiresAtMs === 15000, "un humain signale une cible visible à son équipe pendant quinze secondes");
        check(host.state.events.length === logCount && host.state.armies.length === 0 && host.state.territories.map((t) => t.units).join(",") === unitsBefore, "un signal ne donne aucun ordre militaire et ne remplit pas le journal global");
        check(!host.executeCommand(command).ok, "l’hôte refuse les signaux espacés de moins de trois secondes");
        for (let index = 1; index <= 3; index += 1) {
            host.state.elapsedMs = index * 3000;
            host.executeCommand(command);
        }
        check(host.state.teamSignals.length === 3 && host.state.teamSignals[0].id === 2, "le quatrième signal remplace le plus ancien des trois signaux du joueur");
        check(host.executeCommand({ ...command, playerId: 2, signalType: "reinforce", targetTerritoryId: 1 }).ok, "un équipier peut demander des renforts indépendamment du délai de l’auteur précédent");
        const ally = fixture(2);
        const enemy = fixture(3);
        let allyAnnouncements = 0;
        let enemyAnnouncements = 0;
        ally.subscribe((change) => { if (change.type === "TEAM_SIGNAL_CREATED") allyAnnouncements += 1; });
        enemy.subscribe((change) => { if (change.type === "TEAM_SIGNAL_CREATED") enemyAnnouncements += 1; });
        const snapshot = JSON.parse(JSON.stringify(host.createNetworkSnapshot()));
        ally.applyNetworkSnapshot(snapshot);
        enemy.applyNetworkSnapshot(snapshot);
        check(ally.teamSignals.getVisibleSignals().length === 4 && allyAnnouncements === 4, "les signaux des équipiers sont reproduits depuis l’instantané réseau");
        check(enemy.teamSignals.getVisibleSignals().length === 0 && enemyAnnouncements === 0, "un adversaire n’affiche ni notification ni marqueur des signaux de l’autre équipe");
        ally.applyNetworkSnapshot(snapshot);
        check(allyAnnouncements === 4, "un instantané répété ne rejoue pas les notifications et les sons des signaux");
        check(JSON.stringify(host.state.toJSON().teamSignals) === JSON.stringify(snapshot.teamSignals), "les signaux sont inclus dans la sérialisation complète et les instantanés légers");
        host.state.elapsedMs = 25000;
        const revision = host.state.revision;
        host.update(1);
        check(host.state.teamSignals.length === 0 && host.state.revision > revision, "l’expiration retire les signaux et provoque la synchronisation de leur disparition");
        ally.state.elapsedMs = 25000;
        ally.updateRemotePresentation(1);
        check(ally.teamSignals.getVisibleSignals().length === 0, "un client fait aussi disparaître les signaux expirés entre deux instantanés");

        const validationGame = fixture();
        check(!validationGame.executeCommand({ ...command, targetTerritoryId: 7 }).ok, "un signal ne peut pas cibler une position sous le brouillard");
        check(!validationGame.executeCommand({ ...command, targetTerritoryId: 2 }).ok && !validationGame.executeCommand({ ...command, signalType: "defend" }).ok, "attaque et défense respectent le propriétaire de la cible");
        check(!validationGame.executeCommand({ ...command, signalType: "__proto__" }).ok, "un type de signal inconnu est refusé par le moteur");
        validationGame.state.getTerritory(3).isImpassable = true;
        check(!validationGame.executeCommand(command).ok, "un lac ne peut pas recevoir de signal tactique");
        validationGame.state.getTerritory(3).isImpassable = false;
        check(validationGame.executeCommand({ ...command, signalType: "defend", targetTerritoryId: 2 }).ok, "un signal de défense est accepté sur un territoire allié");
        validationGame.state.factions[1].isAI = true;
        check(!validationGame.executeCommand({ ...command, playerId: 2 }).ok, "les IA ne créent pas de signaux dans cette première version");
        validationGame.state.factions[1].isAI = false;
        validationGame.state.winnerTeamId = 1;
        check(!validationGame.executeCommand(command).ok, "aucun nouveau signal n’est accepté après la victoire");
        const fogGame = fixture();
        fogGame.executeCommand(command);
        fogGame.state.getTerritory(1).ownerId = 3;
        fogGame.state.getTerritory(2).ownerId = 3;
        check(fogGame.teamSignals.getVisibleSignals().length === 0, "un marqueur disparaît si sa position quitte la vision de l’équipe");

        const client = fixture(2);
        const authority = fixture();
        let transported = null;
        client.setCommandTransport((payload) => { transported = payload; return { ok: true, pending: true }; });
        check(client.executeCommand({ ...command, playerId: 2 }).pending && client.state.teamSignals.length === 0 && transported.type === "SEND_TEAM_SIGNAL", "un client envoie une commande et attend la confirmation de l’hôte avant d’afficher son signal");
        authority.executeAuthoritativeCommand(transported);
        client.applyNetworkSnapshot(authority.createNetworkSnapshot());
        check(client.teamSignals.getVisibleSignals().length === 1, "le signal confirmé par l’hôte revient au client par la synchronisation habituelle");

        // Exercise the actual input/controller path without replacing the game rules.
        const uiGame = fixture();
        const card = document.createElement("section");
        card.className = "map-card";
        card.style.cssText = "position:relative;width:760px;height:420px";
        const canvas = document.createElement("canvas");
        canvas.width = 760; canvas.height = 420;
        card.append(canvas); document.body.append(card);
        let ordinaryClicks = 0;
        let focused = null;
        let sounds = 0;
        const renderer = {
            game: uiGame,
            getTerritoryAt: () => uiGame.state.getTerritory(3),
            setHovered() {}, clearTransferPreview() {}, panByScreenDelta() {},
            worldToScreen: () => ({ clientX: card.getBoundingClientRect().left + 300, clientY: card.getBoundingClientRect().top + 180 }),
            focusTerritory: (id) => { focused = id; }
        };
        const input = new C.InputManager(canvas, renderer);
        input.onTerritoryClick(() => { ordinaryClicks += 1; });
        const controller = new C.TeamSignalController(uiGame, renderer, input,
            { elements: { researchScreen: { hidden: true } }, cancelAttackTarget() {}, showToast() {} },
            { playTeamSignal() { sounds += 1; } });
        document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyG", key: "g", bubbles: true }));
        canvas.dispatchEvent(new PointerEvent("pointerdown", { button: 0, pointerId: 22, clientX: 100, clientY: 100 }));
        document.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyG", key: "g", bubbles: true }));
        canvas.dispatchEvent(new PointerEvent("pointerup", { button: 0, pointerId: 22, clientX: 100, clientY: 100 }));
        check(!controller.menu.hidden && ordinaryClicks === 0 && !controller.choices.get("attack").disabled && controller.choices.get("defend").disabled, "G + clic ouvre le bon menu sans sélectionner le territoire ni lancer une offensive");
        controller.choices.get("attack").click();
        controller.refresh();
        check(controller.menu.hidden && uiGame.state.teamSignals.length === 1 && !input.signalMode, "le bouton du menu crée le signal et quitte le mode de signalement");
        controller.feed.firstElementChild.click();
        check(focused === 3, "cliquer sur la notification recentre la carte sur la position signalée");
        uiGame.executeCommand({ ...command, playerId: 2 });
        check(sounds === 1, "un signal d’un équipier joue un son discret mais le signal de l’auteur reste silencieux");
        controller.button.click();
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
        check(!input.signalMode && controller.menu.hidden, "Échap annule le mode de signalement");
        const ctx = canvas.getContext("2d");
        C.drawTeamSignals(ctx, uiGame, (territory) => territory.center, 1000);
        C.drawTeamSignals(ctx, uiGame, (territory) => territory.center, 1000, 1, true);
        check(ctx.getImageData(225, 90, 35, 55).data.some((value) => value > 0), "le Canvas dessine réellement les marqueurs de signal sur la carte et en format mini-carte");
        card.remove();
    };
})(window.Conquest = window.Conquest || {});
