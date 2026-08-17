(function (C) {
    "use strict";

    const results = [];
    function check(condition, label) {
        if (!condition) throw new Error(label);
        results.push(`✓ ${label}`);
    }

    function graphIsConnected(territories, respectBlockedPaths = false) {
        const relevantTerritories = respectBlockedPaths
            ? territories.filter((territory) => !territory.isImpassable)
            : territories;
        const visited = new Set();
        const pending = [relevantTerritories[0].id];
        while (pending.length) {
            const id = pending.pop();
            if (visited.has(id)) continue;
            visited.add(id);
            const territory = territories.find((candidate) => candidate.id === id);
            territory.neighbors.forEach((neighborId) => {
                const neighbor = territories.find((candidate) => candidate.id === neighborId);
                if (respectBlockedPaths && neighbor.isImpassable) return;
                if (!respectBlockedPaths || !territory.isPathBlocked(neighborId)) pending.push(neighborId);
            });
        }
        return visited.size === relevantTerritories.length;
    }

    function findPathWithMinimumHops(territories, startId, minimumHops) {
        const pending = [[startId]];
        const visited = new Set([startId]);
        while (pending.length) {
            const path = pending.shift();
            if (path.length - 1 >= minimumHops) return path;
            const current = territories.find((territory) => territory.id === path[path.length - 1]);
            current.neighbors.forEach((neighborId) => {
                if (visited.has(neighborId) || current.isPathBlocked(neighborId)) return;
                const neighbor = territories.find((territory) => territory.id === neighborId);
                if (neighbor.isImpassable) return;
                visited.add(neighborId);
                pending.push(path.concat(neighborId));
            });
        }
        return null;
    }

    function getGraphDistances(territories, startIds) {
        const distances = new Map();
        const pending = startIds.slice();
        pending.forEach((territoryId) => distances.set(territoryId, 0));
        for (let cursor = 0; cursor < pending.length; cursor += 1) {
            const territoryId = pending[cursor];
            const territory = territories.find((candidate) => candidate.id === territoryId);
            if (!territory) continue;
            territory.neighbors.forEach((neighborId) => {
                if (distances.has(neighborId)) return;
                distances.set(neighborId, distances.get(territoryId) + 1);
                pending.push(neighborId);
            });
        }
        return distances;
    }

    try {
        const pacedGame = new C.Game({ playerId: 1, enableAI: false });
        check(pacedGame.unitProductionMultiplier === 0.875, "la production globale d’unités est réduite de 12,5 %");
        check(pacedGame.timeScale < 1, "le rythme par défaut est ralenti pour laisser le temps de réagir");

        const game = new C.Game({ playerId: 1, enableAI: false, enableWorldEvents: false, timeScale: 1 });
        game.newGame(424242);
        const state = game.state;

        check(state.mapWidth === 2800 && state.mapHeight === 1800, "la carte étendue mesure 2800 par 1800 unités");
        check(state.territories.length >= 110 && state.territories.length <= 120, "la carte étendue contient entre 110 et 120 territoires");
        check(state.territories.every((territory) => territory.polygon.length >= 3), "chaque territoire possède un polygone valide");
        check(state.territories.every((territory) => territory.neighbors.length >= 2), "chaque territoire possède plusieurs voisins");
        check(state.territories.every((territory) => territory.neighbors.every((id) => state.getTerritory(id).neighbors.includes(territory.id))), "les relations de voisinage sont réciproques");
        check(graphIsConnected(state.territories), "le graphe territorial est entièrement connecté");
        const generatedLakes = state.territories.filter((territory) => territory.isImpassable);
        check(generatedLakes.length >= 4 && generatedLakes.length <= 6, "la carte contient entre quatre et six lacs intérieurs");
        check(generatedLakes.every((lake) => lake.terrain === "lake" && lake.ownerId === null && lake.units === 0), "les lacs restent neutres, vides et identifiés comme zones d’eau");
        const lakeGenerationIsStable = [10101, 20202, 30303, 40404, 50505, 60606].every((seed) => {
            const generatedMap = game.mapGenerator.generate(seed);
            const lakes = generatedMap.territories.filter((territory) => territory.isImpassable);
            return lakes.length >= 4 && lakes.length <= 6 && graphIsConnected(generatedMap.territories, true);
        });
        check(lakeGenerationIsStable, "plusieurs générations conservent de quatre à six lacs sans couper les terres jouables");
        const mountainPassages = state.territories.reduce((sum, territory) => sum + territory.blockedNeighbors.length, 0) / 2;
        check(mountainPassages >= 26, "plusieurs grandes chaînes montagneuses sont générées sur la carte étendue");
        check(state.territories.every((territory) => territory.blockedNeighbors.every((id) => state.getTerritory(id).isPathBlocked(territory.id))), "les blocages montagneux sont réciproques");
        check(graphIsConnected(state.territories, true), "la carte reste entièrement accessible en contournant les montagnes");
        check(graphIsConnected(state.territories, true), "les terres jouables restent connectées autour des lacs");
        check(state.factions.length === 4, "les quatre factions sont créées");
        check(state.factions.every((faction) => state.getTerritoriesOwnedBy(faction.id).length === 1), "chaque faction possède un territoire de départ");
        check(state.factions.every((faction) => state.getTerritoriesOwnedBy(faction.id)[0].units === 20), "chaque faction commence avec 20 unités");
        check(state.territories.filter((territory) => territory.rareSite).length === 6, "six sites stratégiques rares sont placés");
        const generatedCannons = state.territories.filter((territory) => territory.installation?.type === "cannon");
        check(generatedCannons.length === 2, "exactement deux canons rares sont placés sur la grande carte");
        check(C.INSTALLATION_TYPES.cannon.fireIntervalMs === 5000 && C.INSTALLATION_TYPES.cannon.hitChance === 0.75 && C.INSTALLATION_TYPES.cannon.damage === 3, "les canons infligent trois pertes avec 75 % de précision toutes les cinq secondes");
        check(generatedCannons.every((territory) => territory.ownerId === null && !territory.rareSite), "les canons apparaissent sur des territoires neutres distincts des sites rares");
        check(state.toJSON().territories.filter((territory) => territory.installation?.type === "cannon").length === 2, "les canons sont inclus dans l’état sérialisable");
        check(state.toJSON().territories.filter((territory) => territory.isImpassable).length === generatedLakes.length, "les lacs infranchissables sont inclus dans l’état sérialisable");

        const lobbyFactionIds = C.LobbyController.buildActiveFactionIds(3, 2);
        check(lobbyFactionIds.join(",") === "3,4", "le lobby compose le bon nombre de factions à partir de la race choisie");
        const lobbyFixture = document.createElement("div");
        lobbyFixture.innerHTML = `
            <section id="game-lobby">
                <form id="lobby-form">
                    <input type="radio" name="playerCount" value="2">
                    <input type="radio" name="playerCount" value="3" checked>
                    <input type="radio" name="playerCount" value="4">
                    <div id="lobby-factions"></div>
                    <p id="lobby-summary"></p>
                    <button id="start-game" type="submit"></button>
                </form>
            </section>
            <div id="game-app"></div>`;
        document.body.append(lobbyFixture);
        const lobbyController = new C.LobbyController();
        const technocratChoice = lobbyFixture.querySelector('input[name="playerFaction"][value="2"]');
        technocratChoice.checked = true;
        technocratChoice.dispatchEvent(new Event("change", { bubbles: true }));
        let submittedLobbyConfiguration = null;
        lobbyController.onStart((configuration) => { submittedLobbyConfiguration = configuration; });
        lobbyController.form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        check(Boolean(submittedLobbyConfiguration && submittedLobbyConfiguration.playerId === 2 && submittedLobbyConfiguration.playerCount === 3), "le formulaire du lobby transmet la race et le nombre de joueurs sélectionnés");
        check(submittedLobbyConfiguration.activeFactionIds.join(",") === "2,3,4", "la validation du lobby transmet la liste des participants au moteur");
        lobbyController.close();
        lobbyFixture.remove();
        const duelGame = new C.Game({ playerId: 4, activeFactionIds: [4, 1], enableAI: true, timeScale: 1 });
        duelGame.newGame(565656);
        check(duelGame.state.factions.map((faction) => faction.id).join(",") === "4,1", "une partie peut démarrer avec seulement deux factions choisies dans le lobby");
        check(duelGame.aiSystem.factionIds.length === 1 && duelGame.aiSystem.factionIds[0] === 1, "l’ordinateur contrôle tous les participants sauf la faction du joueur");
        check(duelGame.state.getTerritoriesOwnedBy(4).length === 1 && duelGame.state.getTerritoriesOwnedBy(1).length === 1, "chaque participant du lobby reçoit un territoire de départ");

        const playerStart = state.getTerritoriesOwnedBy(game.playerId)[0];
        const playerTerritoryIds = state.getTerritoriesOwnedBy(game.playerId).map((territory) => territory.id);
        const graphDistances = getGraphDistances(state.territories, playerTerritoryIds);
        const visibilityMap = game.getTerritoryVisibilityMap(game.playerId);
        const distanceTwoTerritory = state.territories.find((territory) => graphDistances.get(territory.id) === 2);
        const hiddenTerritory = state.territories.find((territory) => graphDistances.get(territory.id) > 2);
        check(game.visibilityRange === 2 && visibilityMap.get(playerStart.id) === 0, "le brouillard utilise une portée de deux distances depuis chaque territoire allié");
        check(Boolean(distanceTwoTerritory && game.isTerritoryVisible(distanceTwoTerritory.id, game.playerId, visibilityMap)), "un territoire situé à deux passages reste visible");
        check(Boolean(hiddenTerritory && !game.isTerritoryVisible(hiddenTerritory.id, game.playerId, visibilityMap)), "un territoire situé au-delà de deux passages reste caché");
        const distantEnemyArmy = {
            ownerId: 2,
            fromTerritoryId: hiddenTerritory.id,
            toTerritoryId: hiddenTerritory.neighbors.find((neighborId) => !visibilityMap.has(neighborId)) || hiddenTerritory.id
        };
        check(!game.isArmyVisible(distantEnemyArmy, game.playerId, visibilityMap), "une armée ennemie entièrement dans le brouillard reste invisible");
        const previousHiddenOwner = hiddenTerritory.ownerId;
        hiddenTerritory.ownerId = game.playerId;
        check(game.getTerritoryVisibilityMap(game.playerId).get(hiddenTerritory.id) === 0, "une conquête étend immédiatement la zone visible");
        hiddenTerritory.ownerId = previousHiddenOwner;
        const lake = generatedLakes[0];
        const lakeShore = state.getTerritory(lake.neighbors[0]);
        const previousShoreState = { ownerId: lakeShore.ownerId, units: lakeShore.units };
        lakeShore.ownerId = game.playerId;
        lakeShore.units = 20;
        const lakeCrossing = game.executeCommand({
            type: "SEND_ARMY",
            playerId: game.playerId,
            fromTerritoryId: lakeShore.id,
            toTerritoryId: lake.id,
            units: 5
        });
        check(!lakeCrossing.ok && /lac/i.test(lakeCrossing.error), "une armée ne peut ni entrer dans un lac ni le conquérir");
        lakeShore.ownerId = previousShoreState.ownerId;
        lakeShore.units = previousShoreState.units;

        check(Object.keys(C.WORLD_EVENT_DEFINITIONS).length === 3, "trois types d’événements mondiaux sont définis");
        const eventGame = new C.Game({ playerId: 1, activeFactionIds: [1, 2, 3, 4], enableAI: false, timeScale: 1 });
        const worldNotifications = [];
        eventGame.subscribe((change) => worldNotifications.push(change));
        eventGame.newGame(737373);
        check(eventGame.eventSystem.enabled && eventGame.state.nextWorldEventAtMs >= 60000 && eventGame.state.nextWorldEventAtMs <= 90000, "le premier événement est planifié lentement dans l’état de jeu");
        eventGame.state.scheduledWorldEventType = "famine";
        eventGame.state.nextWorldEventAtMs = eventGame.state.elapsedMs + 7000;
        eventGame.state.worldEventWarningIssued = false;
        eventGame.update(1000);
        check(worldNotifications.some((change) => change.type === "WORLD_EVENT_WARNING" && change.eventType === "famine"), "une alerte prévient les joueurs avant l’événement");
        eventGame.state.nextWorldEventAtMs = Infinity;

        const famine = eventGame.eventSystem.triggerEvent("famine");
        const famineTarget = eventGame.state.getTerritory(famine.territoryIds[0]);
        const famineUnits = famineTarget.units;
        famineTarget.productionProgress = 0.99;
        eventGame.update(1000);
        check(eventGame.getProductionMultiplier(famineTarget) === 0 && famineTarget.units === famineUnits, "la famine suspend complètement la production du territoire");
        eventGame.state.elapsedMs = famine.endsAtMs;
        eventGame.eventSystem.expireEvents();
        check(eventGame.getProductionMultiplier(famineTarget) > 0 && eventGame.state.events.some((event) => /production reprend/.test(event.message)), "la production reprend automatiquement à la fin de la famine");

        eventGame.state.getTerritoriesOwnedBy(1).concat(
            eventGame.state.getTerritoriesOwnedBy(2),
            eventGame.state.getTerritoriesOwnedBy(3),
            eventGame.state.getTerritoriesOwnedBy(4)
        ).forEach((territory) => { territory.units = 20; });
        const wildfire = eventGame.eventSystem.triggerEvent("wildfire");
        const wildfireTarget = eventGame.state.getTerritory(wildfire.territoryIds[0]);
        check(wildfire.data.damage >= 2 && wildfire.data.damage <= 5 && wildfireTarget.units === 20 - wildfire.data.damage, "le feu de forêt détruit entre 10 et 25 % de la garnison");
        check(wildfireTarget.units >= 1, "un feu de forêt ne vide jamais entièrement un territoire");

        const barbarianRaid = eventGame.eventSystem.triggerEvent("barbarianRaid");
        const barbarianArmies = eventGame.state.armies.filter((army) => army.isBarbarian && army.worldEventId === barbarianRaid.id);
        check(barbarianRaid.territoryIds.length >= 2 && barbarianRaid.territoryIds.length <= 4 && barbarianArmies.length === barbarianRaid.territoryIds.length, "une attaque barbare lance simultanément de vraies armées vers plusieurs territoires");
        const overwhelmingRaid = barbarianArmies[0];
        const raidedTerritory = eventGame.state.getTerritory(overwhelmingRaid.toTerritoryId);
        overwhelmingRaid.units = 500;
        raidedTerritory.units = 1;
        eventGame.resolveArmyArrival(overwhelmingRaid);
        check(raidedTerritory.ownerId === null && !eventGame.state.armies.includes(overwhelmingRaid), "une victoire barbare met le territoire à sac et le rend neutre");
        const serializedEvents = eventGame.state.toJSON();
        check(serializedEvents.worldEvents.length >= 2 && serializedEvents.armies.some((army) => army.isBarbarian), "les événements et armées barbares sont sérialisables pour le multijoueur");

        const initialUnits = playerStart.units;
        for (let tick = 0; tick < 7; tick += 1) game.update(1000);
        check(playerStart.units > initialUnits, "la production temps réel ajoute des unités");

        const target = state.getTerritory(playerStart.neighbors.find((id) => {
            const neighbor = state.getTerritory(id);
            return neighbor && !neighbor.isImpassable && neighbor.ownerId !== game.playerId && !playerStart.isPathBlocked(id);
        }));
        target.units = 1;
        const sent = game.executeCommand({
            type: "SEND_ARMY",
            playerId: game.playerId,
            fromTerritoryId: playerStart.id,
            toTerritoryId: target.id,
            units: Math.min(10, playerStart.units - 1)
        });
        check(sent.ok && state.armies.length === 1, "une commande SEND_ARMY valide crée une armée mobile");
        for (let tick = 0; tick < 8; tick += 1) game.update(1000);
        check(state.armies.length === 0 && target.ownerId === game.playerId, "l’arrivée résout le combat et change le propriétaire");

        const unitsBeforeReinforcement = target.units;
        const reinforcement = game.executeCommand({
            type: "SEND_ARMY",
            playerId: game.playerId,
            fromTerritoryId: playerStart.id,
            toTerritoryId: target.id,
            units: 1
        });
        check(reinforcement.ok, "une armée peut être déplacée vers un territoire allié voisin");
        for (let tick = 0; tick < 8; tick += 1) game.update(1000);
        check(target.units > unitsBeforeReinforcement, "les renforts rejoignent le territoire allié à l’arrivée");

        const convoyPath = findPathWithMinimumHops(state.territories, playerStart.id, 3);
        convoyPath.slice(1).forEach((territoryId) => {
            state.getTerritory(territoryId).ownerId = game.playerId;
        });
        const convoyDestination = state.getTerritory(convoyPath[convoyPath.length - 1]);
        const convoyDestinationUnits = convoyDestination.units;
        const convoy = game.executeCommand({
            type: "SEND_REINFORCEMENT_ROUTE",
            playerId: game.playerId,
            fromTerritoryId: playerStart.id,
            toTerritoryId: convoyDestination.id,
            units: 1
        });
        check(convoy.ok && convoy.path.length >= 4 && convoy.army.route.length >= 2, "un convoi calcule un itinéraire allié de plusieurs étapes");
        for (let tick = 0; tick < 30; tick += 1) game.update(1000);
        check(!state.armies.some((army) => army.id === convoy.army.id) && convoyDestination.units > convoyDestinationUnits, "le convoi rejoint sa destination territoire par territoire");

        const interruptedConvoy = game.executeCommand({
            type: "SEND_REINFORCEMENT_ROUTE",
            playerId: game.playerId,
            fromTerritoryId: playerStart.id,
            toTerritoryId: convoyDestination.id,
            units: 1
        });
        const unsafeTerritory = state.getTerritory(interruptedConvoy.army.route[0]);
        const previousUnsafeOwner = unsafeTerritory.ownerId;
        unsafeTerritory.ownerId = 2;
        for (let tick = 0; tick < 8; tick += 1) game.update(1000);
        check(!state.armies.some((army) => army.id === interruptedConvoy.army.id), "un convoi s’arrête si un relais de sa route n’est plus allié");
        unsafeTerritory.ownerId = previousUnsafeOwner;

        const blockedSource = state.territories.find((territory) => territory.blockedNeighbors.length > 0);
        const blockedTarget = state.getTerritory(blockedSource.blockedNeighbors[0]);
        const previousBlockedOwner = blockedSource.ownerId;
        const previousBlockedUnits = blockedSource.units;
        blockedSource.ownerId = game.playerId;
        blockedSource.units = 5;
        const blockedOrder = game.executeCommand({
            type: "SEND_ARMY",
            playerId: game.playerId,
            fromTerritoryId: blockedSource.id,
            toTerritoryId: blockedTarget.id,
            units: 1
        });
        check(!blockedOrder.ok && /montagnes/.test(blockedOrder.error), "les montagnes refusent le passage d’une armée");
        blockedSource.ownerId = previousBlockedOwner;
        blockedSource.units = previousBlockedUnits;

        const nonNeighbor = state.territories.find((territory) => territory.id !== playerStart.id && !playerStart.neighbors.includes(territory.id));
        const rejected = game.executeCommand({
            type: "SEND_ARMY",
            playerId: game.playerId,
            fromTerritoryId: playerStart.id,
            toTerritoryId: nonNeighbor.id,
            units: 1
        });
        check(!rejected.ok, "une attaque non adjacente est refusée");
        check(Boolean(JSON.stringify(state.toJSON())), "l’état complet est sérialisable");

        const cannonGame = new C.Game({ playerId: 1, enableAI: false, enableWorldEvents: false, timeScale: 1 });
        cannonGame.newGame(484848);
        const cannonState = cannonGame.state;
        const cannonTerritory = cannonState.territories.find((territory) =>
            territory.installation?.type === "cannon" &&
            territory.neighbors.some((neighborId) => !territory.isPathBlocked(neighborId)));
        const cannonTarget = cannonState.getTerritory(cannonTerritory.neighbors.find((neighborId) =>
            !cannonTerritory.isPathBlocked(neighborId)));
        cannonTerritory.ownerId = 1;
        cannonTerritory.units = 10;
        cannonTerritory.productionProgress = 0;
        cannonTerritory.neighbors.forEach((neighborId) => {
            const neighbor = cannonState.getTerritory(neighborId);
            neighbor.ownerId = 1;
            neighbor.units = 10;
            neighbor.productionProgress = 0;
        });
        cannonTarget.ownerId = 2;
        cannonTarget.units = 5;
        cannonTarget.productionProgress = 0;
        const cannonChanges = [];
        cannonGame.subscribe((change) => {
            if (change.type === "CANNON_FIRED") cannonChanges.push(change);
        });
        cannonTerritory.installationProgressMs = C.INSTALLATION_TYPES.cannon.fireIntervalMs - 1000;
        cannonGame.random = () => 0.1;
        cannonGame.update(1000);
        check(cannonTarget.units === 2 && cannonChanges.some((change) => change.hit && change.damage === 3), "un canon contrôlé détruit trois unités ennemies lorsque son tir à 75 % réussit");
        cannonTerritory.installationProgressMs = C.INSTALLATION_TYPES.cannon.fireIntervalMs - 1000;
        cannonGame.random = () => 0.9;
        cannonGame.update(1000);
        check(cannonTarget.units === 2 && cannonChanges[cannonChanges.length - 1].hit === false && cannonChanges[cannonChanges.length - 1].damage === 0, "un tir de canon manqué ne retire aucune unité");
        cannonTerritory.installationProgressMs = C.INSTALLATION_TYPES.cannon.fireIntervalMs - 1000;
        cannonGame.random = () => 0.1;
        cannonGame.update(1000);
        check(cannonTarget.units === 1 && cannonChanges[cannonChanges.length - 1].damage === 1, "les dégâts du canon sont limités pour préserver le dernier défenseur");
        const shotCountBeforeLastDefender = cannonChanges.length;
        cannonTarget.units = 1;
        cannonTerritory.installationProgressMs = C.INSTALLATION_TYPES.cannon.fireIntervalMs - 1000;
        cannonGame.random = () => 0.1;
        cannonGame.update(1000);
        check(cannonTarget.units === 1 && cannonChanges.length === shotCountBeforeLastDefender, "un canon ne détruit jamais la dernière unité et ne conquiert pas à distance");

        cannonTarget.units = 100;
        cannonTerritory.units = 1;
        cannonTerritory.installationProgressMs = 0;
        cannonGame.random = () => 0.5;
        const cannonCapture = cannonGame.executeCommand({
            type: "SEND_ARMY",
            playerId: 2,
            fromTerritoryId: cannonTarget.id,
            toTerritoryId: cannonTerritory.id,
            units: 70
        });
        for (let tick = 0; tick < 8 && cannonTerritory.ownerId !== 2; tick += 1) cannonGame.update(1000);
        check(cannonCapture.ok && cannonTerritory.ownerId === 2 && cannonTerritory.installation?.type === "cannon", "le canon reste en place et change de camp lorsque son territoire est capturé");
        check(cannonTerritory.installationProgressMs === 0 && cannonState.events.some((event) => /contrôle du canon/.test(event.message)), "la capture du canon est annoncée et réinitialise sa cadence de tir");

        check(C.TECHNOLOGY_BRANCHES.length === 3 && Object.keys(C.TECHNOLOGIES).length === 12, "l’arbre propose trois axes de quatre technologies");
        const researchGame = new C.Game({ playerId: 1, enableAI: false, enableWorldEvents: false, timeScale: 1 });
        researchGame.newGame(818181);
        const researchFaction = researchGame.state.getFaction(1);
        const researchTerritory = researchGame.state.getTerritoriesOwnedBy(1)[0];
        const productionBeforeResearch = researchGame.getProductionMultiplier(researchTerritory);
        const lockedResearch = researchGame.executeCommand({
            type: "START_RESEARCH",
            playerId: 1,
            technologyId: "construction-2"
        });
        check(!lockedResearch.ok, "un palier de recherche verrouillé ne peut pas être lancé avant son prérequis");
        const startedResearch = researchGame.executeCommand({
            type: "START_RESEARCH",
            playerId: 1,
            technologyId: "construction-1"
        });
        check(startedResearch.ok && researchFaction.research.activeTechnologyId === "construction-1", "START_RESEARCH lance une recherche sérialisable pour la faction");
        for (let tick = 0; tick < 100 && researchFaction.research.activeTechnologyId; tick += 1) researchGame.update(1000);
        check(researchFaction.research.completedTechnologyIds.includes("construction-1") && !researchFaction.research.activeTechnologyId, "une recherche lente se termine progressivement en temps réel");
        check(researchGame.getProductionMultiplier(researchTerritory) > productionBeforeResearch * 1.07, "une technologie de construction améliore réellement la production");
        researchFaction.research.completedTechnologyIds.push("attack-1", "defense-1", "construction-3");
        check(C.getFactionTechnologyBonus(researchFaction, "attackMultiplier") === 0.05 && researchGame.getDefenseMultiplier(researchTerritory) > C.TERRITORY_TYPES[researchTerritory.terrain].defenseMultiplier, "les technologies d’attaque et de défense alimentent les multiplicateurs de combat");
        check(Boolean(researchGame.state.toJSON().factions[0].research.completedTechnologyIds.length), "l’état technologique est inclus dans la sérialisation multijoueur");

        const playedFrequencies = [];
        const startedNotes = [];
        const fakeAudioContext = {
            state: "running",
            currentTime: 4,
            destination: {},
            createOscillator: () => ({
                type: "sine",
                frequency: { setValueAtTime: (frequency) => playedFrequencies.push(frequency) },
                connect: () => {},
                start: (time) => startedNotes.push(time),
                stop: () => {}
            }),
            createGain: () => ({
                gain: {
                    setValueAtTime: () => {},
                    exponentialRampToValueAtTime: () => {}
                },
                connect: () => {}
            })
        };
        const audioManager = new C.AudioManager({ contextFactory: () => fakeAudioContext });
        check(audioManager.playResearchComplete() && startedNotes.length === 4 && playedFrequencies.length === 4, "la fin d’une recherche déclenche un carillon synthétique de quatre notes");
        let playerResearchSounds = 0;
        let researchToast = "";
        const researchUiStub = {
            game: { playerId: 1 },
            audio: { playResearchComplete: () => { playerResearchSounds += 1; } },
            researchTreeKey: null,
            refreshResearchStatus: () => {},
            showToast: (message) => { researchToast = message; }
        };
        C.UIController.prototype.handleGameChange.call(researchUiStub, {
            type: "RESEARCH_COMPLETED",
            factionId: 1,
            technologyId: "construction-1"
        });
        C.UIController.prototype.handleGameChange.call(researchUiStub, {
            type: "RESEARCH_COMPLETED",
            factionId: 2,
            technologyId: "construction-1"
        });
        check(playerResearchSounds === 1 && /Recherche terminée/.test(researchToast), "le signal sonore est réservé à la recherche terminée du joueur humain");

        const aiGame = new C.Game({ playerId: 1, enableAI: true, timeScale: 1 });
        aiGame.newGame(707070);
        for (let tick = 0; tick < 24; tick += 1) aiGame.update(1000);
        check(aiGame.aiSystem.ordersIssued > 0, "les factions contrôlées par l’ordinateur prennent des décisions");
        check(aiGame.aiSystem.researchChoicesMade > 0 && aiGame.state.factions.filter((faction) => faction.id !== 1).every((faction) => faction.research.activeTechnologyId || faction.research.completedTechnologyIds.length), "chaque IA choisit et fait progresser sa propre recherche");
        check(aiGame.state.events.some((event) => /Technocrates|Horde|Nomades/.test(event.message) && /attaque|renforce/.test(event.message)), "les ordres de l’ordinateur apparaissent dans le journal tactique");

        const aiLogisticsGame = new C.Game({ playerId: 1, enableAI: true, timeScale: 1 });
        aiLogisticsGame.newGame(515151);
        const technocratStart = aiLogisticsGame.state.getTerritoriesOwnedBy(2)[0];
        const technocratNetwork = findPathWithMinimumHops(aiLogisticsGame.state.territories, technocratStart.id, 3);
        technocratNetwork.slice(1).forEach((territoryId) => {
            aiLogisticsGame.state.getTerritory(territoryId).ownerId = 2;
        });
        aiLogisticsGame.aiSystem.think(2);
        const aiRoute = aiLogisticsGame.state.reinforcementRoutes.find((route) => route.active && route.ownerId === 2);
        check(Boolean(aiRoute) && aiLogisticsGame.aiSystem.continuousRoutesCreated > 0, "l’ordinateur ouvre une ligne de renfort continue vers une frontière");
        const aiRouteSource = aiLogisticsGame.state.getTerritory(aiRoute.fromTerritoryId);
        aiRouteSource.productionProgress = 0.99;
        aiLogisticsGame.update(1000);
        check(aiRoute.unitsDispatched > 0, "la production de l’IA alimente automatiquement sa ligne logistique");

        const tacticalGame = new C.Game({ playerId: 1, enableAI: true, timeScale: 1 });
        tacticalGame.newGame(919191);
        const hordeSource = tacticalGame.state.getTerritoriesOwnedBy(3)[0];
        hordeSource.units = 100;
        for (let index = 0; index < 5; index += 1) {
            tacticalGame.state.armies.push(new C.Army({
                id: tacticalGame.state.nextArmyId++,
                ownerId: 3,
                fromTerritoryId: hordeSource.id,
                toTerritoryId: hordeSource.id,
                units: 1,
                durationMs: 5000,
                start: hordeSource.center,
                end: hordeSource.center,
                reinforcementRouteId: 900 + index,
                isConvoy: true
            }));
        }
        tacticalGame.aiSystem.think(3);
        check(tacticalGame.state.armies.some((army) =>
            army.ownerId === 3 && !army.reinforcementRouteId && army.toTerritoryId !== hordeSource.id),
        "les convois automatiques ne bloquent plus les attaques de l’IA");

        const concentrationGame = new C.Game({
            playerId: 1,
            activeFactionIds: [1, 2],
            enableAI: true,
            timeScale: 1
        });
        concentrationGame.newGame(626262);
        const concentrationState = concentrationGame.state;
        let concentrationChain = null;
        for (const staging of concentrationState.territories) {
            const openNeighbors = staging.neighbors
                .map((territoryId) => concentrationState.getTerritory(territoryId))
                .filter((territory) => territory && !staging.isPathBlocked(territory.id));
            if (openNeighbors.length >= 2) {
                concentrationChain = [openNeighbors[0], staging, openNeighbors[1]];
                break;
            }
        }
        const [concentrationDonor, concentrationFront, concentrationTarget] = concentrationChain;
        concentrationState.territories.forEach((territory) => {
            territory.ownerId = 1;
            territory.units = 1000;
            territory.productionProgress = 0;
        });
        concentrationDonor.ownerId = 2;
        concentrationDonor.units = 100;
        concentrationFront.ownerId = 2;
        concentrationFront.units = 100;
        concentrationTarget.ownerId = 1;
        concentrationTarget.units = 150;
        concentrationTarget.terrain = "plain";
        concentrationTarget.rareSite = null;
        concentrationGame.aiSystem.reset();
        const concentratedTotalBefore = concentrationGame.getFactionStats(2).totalUnits;
        concentrationGame.aiSystem.think(2);
        const offensivePlan = concentrationGame.aiSystem.offensivePlans.get(2);
        const gatheringArmy = offensivePlan && concentrationState.armies.find((army) =>
            army.ownerId === 2 && army.isConvoy && army.finalTerritoryId === offensivePlan.stagingTerritoryId);
        check(Boolean(offensivePlan && gatheringArmy && gatheringArmy.units >= 70), "l’IA rassemble une grande armée lorsqu’aucun territoire isolé ne peut vaincre la cible");
        check(concentrationGame.getFactionStats(2).totalUnits === concentratedTotalBefore, "le rassemblement de l’IA déplace les unités sans en créer artificiellement");
        const armiesWhileGathering = concentrationState.armies.length;
        concentrationGame.aiSystem.think(2);
        check(concentrationState.armies.length === armiesWhileGathering && !concentrationState.armies.some((army) => !army.isConvoy && army.toTerritoryId === offensivePlan.targetTerritoryId), "l’IA n’attaque pas avant l’arrivée du convoi de rassemblement");
        concentrationGame.aiSystem.enabled = false;
        for (let tick = 0; tick < 12 && concentrationState.armies.some((army) => army.id === gatheringArmy.id); tick += 1) {
            concentrationGame.update(1000);
        }
        concentrationGame.aiSystem.think(2);
        const coordinatedAttack = concentrationState.armies.find((army) =>
            army.ownerId === 2 && !army.isConvoy && army.toTerritoryId === offensivePlan.targetTerritoryId);
        check(Boolean(coordinatedAttack && coordinatedAttack.units > concentrationTarget.units), "l’IA attend les renforts puis attaque les 150 unités avec sa force combinée");
        check(concentrationGame.aiSystem.coordinatedAttacksLaunched === 1 && !concentrationGame.aiSystem.offensivePlans.has(2), "le plan offensif se termine lorsque l’attaque coordonnée est lancée");

        check(typeof C.InputManager.prototype.onTerritoryRightClick === "function", "l’interface expose la sélection de destination au clic droit");
        check(typeof C.InputManager.prototype.onQuickTransfer === "function", "l’interface expose le transfert rapide par glisser droit");
        check(typeof C.InputManager.prototype.onContinuousTransfer === "function", "l’interface expose le flux continu par Alt + glisser droit");
        check(typeof C.UIController.prototype.handleTerritoryRightClick === "function", "le contrôleur sait préparer un itinéraire de convoi");
        check(typeof C.MapRenderer.prototype.setTransferPreview === "function", "le rendu sait afficher l’aperçu des transferts ponctuels et continus");
        check(typeof C.MapRenderer.prototype.fireCannon === "function", "le rendu expose l’animation des tirs de canon");
        check(typeof C.UIController.prototype.openResearchScreen === "function" && typeof C.UIController.prototype.renderResearchTree === "function", "l’interface expose un écran d’arbre technologique interactif");
        check(typeof C.MapRenderer.prototype.panByScreenDelta === "function" && typeof C.MapRenderer.prototype.zoomAt === "function", "la caméra expose le déplacement et le zoom de la grande carte");

        const gestureCanvas = document.createElement("canvas");
        const gestureTerritories = [{ id: 1 }, { id: 2 }];
        let previewUpdates = 0;
        const previewModes = [];
        let previewCleared = false;
        const gestureRenderer = {
            game: {
                state: {
                    getTerritory: (territoryId) => gestureTerritories.find((territory) => territory.id === territoryId)
                }
            },
            getTerritoryAt: (clientX) => clientX < 50 ? gestureTerritories[0] : gestureTerritories[1],
            setHovered: () => {},
            setTransferPreview: (_sourceId, _x, _y, _targetId, mode) => {
                previewUpdates += 1;
                previewModes.push(mode);
            },
            clearTransferPreview: () => { previewCleared = true; },
            panByScreenDelta: () => {},
            zoomAt: () => {}
        };
        const gestureInput = new C.InputManager(gestureCanvas, gestureRenderer);
        let quickGesture = null;
        let continuousGesture = null;
        let regularRightClicks = 0;
        gestureInput.onQuickTransfer((source, target) => { quickGesture = [source.id, target.id]; });
        gestureInput.onContinuousTransfer((source, target) => { continuousGesture = [source.id, target.id]; });
        gestureInput.onTerritoryRightClick(() => { regularRightClicks += 1; });
        gestureCanvas.dispatchEvent(new PointerEvent("pointerdown", { button: 2, ctrlKey: true, clientX: 10, clientY: 10, pointerId: 41 }));
        gestureCanvas.dispatchEvent(new PointerEvent("pointermove", { buttons: 2, ctrlKey: true, clientX: 90, clientY: 10, pointerId: 41 }));
        gestureCanvas.dispatchEvent(new PointerEvent("pointerup", { button: 2, ctrlKey: true, clientX: 90, clientY: 10, pointerId: 41 }));
        gestureCanvas.dispatchEvent(new MouseEvent("contextmenu", { button: 2, ctrlKey: true, clientX: 90, clientY: 10 }));
        gestureCanvas.dispatchEvent(new MouseEvent("contextmenu", { button: 2, clientX: 90, clientY: 10 }));
        check(Boolean(quickGesture && quickGesture[0] === 1 && quickGesture[1] === 2 && previewUpdates >= 2 && previewCleared), "Ctrl + glisser droit produit un ordre entre l’origine et la destination");
        check(regularRightClicks === 1, "le clic droit simple reste disponible après un transfert rapide");
        gestureCanvas.dispatchEvent(new PointerEvent("pointerdown", { button: 2, altKey: true, clientX: 10, clientY: 10, pointerId: 42 }));
        gestureCanvas.dispatchEvent(new PointerEvent("pointermove", { buttons: 2, altKey: true, clientX: 90, clientY: 10, pointerId: 42 }));
        gestureCanvas.dispatchEvent(new PointerEvent("pointerup", { button: 2, altKey: true, clientX: 90, clientY: 10, pointerId: 42 }));
        gestureCanvas.dispatchEvent(new MouseEvent("contextmenu", { button: 2, altKey: true, clientX: 90, clientY: 10 }));
        check(Boolean(continuousGesture && continuousGesture[0] === 1 && continuousGesture[1] === 2 && previewModes.includes("continuous")), "Alt + glisser droit produit un ordre de flux continu distinct");

        const cameraCanvas = document.createElement("canvas");
        cameraCanvas.style.width = "800px";
        cameraCanvas.style.height = "600px";
        document.body.append(cameraCanvas);
        const cameraRenderer = new C.MapRenderer(cameraCanvas, game);
        cameraRenderer.resize();
        const zoomBefore = cameraRenderer.zoom;
        cameraRenderer.zoomBy(1.2);
        check(cameraRenderer.zoom > zoomBefore, "le contrôle de zoom modifie réellement l’échelle de la caméra");
        const cameraXBefore = cameraRenderer.cameraX;
        cameraRenderer.panByScreenDelta(-80, 0);
        check(cameraRenderer.cameraX > cameraXBefore, "le glisser déplace réellement la caméra sur le monde");
        cameraRenderer.resizeObserver.disconnect();
        cameraCanvas.remove();

        const flowGame = new C.Game({ playerId: 1, enableAI: false, enableWorldEvents: false, timeScale: 1 });
        flowGame.newGame(303303);
        const flowState = flowGame.state;
        const flowSource = flowState.getTerritoriesOwnedBy(flowGame.playerId)[0];
        const flowPath = findPathWithMinimumHops(flowState.territories, flowSource.id, 3);
        flowPath.slice(1).forEach((territoryId) => {
            flowState.getTerritory(territoryId).ownerId = flowGame.playerId;
        });
        const flowDestination = flowState.getTerritory(flowPath[flowPath.length - 1]);
        const standingUnits = flowSource.units;
        const createdFlow = flowGame.executeCommand({
            type: "CREATE_CONTINUOUS_REINFORCEMENT_ROUTE",
            playerId: flowGame.playerId,
            fromTerritoryId: flowSource.id,
            toTerritoryId: flowDestination.id
        });
        check(createdFlow.ok && createdFlow.route.active, "une ligne de renfort continue peut être activée");
        for (let tick = 0; tick < 6; tick += 1) flowGame.update(1000);
        check(createdFlow.route.unitsDispatched > 0 && flowSource.units === standingUnits, "les nouvelles unités produites partent automatiquement sans vider la garnison");
        for (let tick = 0; tick < 30; tick += 1) flowGame.update(1000);
        check(createdFlow.route.unitsDelivered > 0, "les unités du flux continu atteignent leur destination");

        const interruptedRelay = flowState.getTerritory(flowPath[1]);
        const relayOwner = interruptedRelay.ownerId;
        interruptedRelay.ownerId = 2;
        for (let tick = 0; tick < 6; tick += 1) flowGame.update(1000);
        check(createdFlow.route.isPaused, "la ligne continue se met en pause si son réseau allié est coupé");
        interruptedRelay.ownerId = relayOwner;
        const dispatchedBeforeResume = createdFlow.route.unitsDispatched;
        for (let tick = 0; tick < 6; tick += 1) flowGame.update(1000);
        check(!createdFlow.route.isPaused && createdFlow.route.unitsDispatched > dispatchedBeforeResume, "la ligne continue reprend quand le passage est rétabli");

        const cancelledFlow = flowGame.executeCommand({
            type: "CANCEL_CONTINUOUS_REINFORCEMENT_ROUTE",
            playerId: flowGame.playerId,
            routeId: createdFlow.route.id
        });
        const dispatchedAtCancellation = createdFlow.route.unitsDispatched;
        for (let tick = 0; tick < 7; tick += 1) flowGame.update(1000);
        check(cancelledFlow.ok && !createdFlow.route.active && createdFlow.route.unitsDispatched === dispatchedAtCancellation, "un flux continu peut être arrêté sans rappeler les convois déjà partis");

        const firstDirection = flowGame.executeCommand({
            type: "CREATE_CONTINUOUS_REINFORCEMENT_ROUTE",
            playerId: flowGame.playerId,
            fromTerritoryId: flowSource.id,
            toTerritoryId: flowPath[flowPath.length - 2]
        });
        const redirectedFlow = flowGame.executeCommand({
            type: "CREATE_CONTINUOUS_REINFORCEMENT_ROUTE",
            playerId: flowGame.playerId,
            fromTerritoryId: flowSource.id,
            toTerritoryId: flowDestination.id
        });
        check(firstDirection.ok && redirectedFlow.ok && !firstDirection.route.active && redirectedFlow.route.active, "une nouvelle destination redirige les productions futures de la même origine");
        flowGame.executeCommand({
            type: "CANCEL_CONTINUOUS_REINFORCEMENT_ROUTE",
            playerId: flowGame.playerId,
            routeId: redirectedFlow.route.id
        });
        flowSource.units = 21;
        const quickTransferArmyId = flowState.nextArmyId;
        let quickTransferCleared = false;
        let quickTransferToast = "";
        C.UIController.prototype.handleQuickTransfer.call({
            game: flowGame,
            clearSelection: () => { quickTransferCleared = true; },
            showToast: (message) => { quickTransferToast = message; }
        }, flowSource, flowDestination);
        const quickTransferArmy = flowState.armies.find((army) => army.id === quickTransferArmyId);
        check(Boolean(quickTransferArmy && quickTransferArmy.units === 16 && quickTransferArmy.finalTerritoryId === flowDestination.id), "le transfert rapide envoie 80 % des unités disponibles sur le trajet allié");
        check(flowSource.units === 5 && quickTransferCleared && quickTransferToast.includes(flowDestination.name), "le transfert rapide laisse une garnison puis désélectionne le territoire");
        const continuousTransferRouteId = flowState.nextReinforcementRouteId;
        let continuousTransferCleared = false;
        let continuousTransferToast = "";
        C.UIController.prototype.handleContinuousTransfer.call({
            game: flowGame,
            clearSelection: () => { continuousTransferCleared = true; },
            showToast: (message) => { continuousTransferToast = message; }
        }, flowSource, flowDestination);
        const continuousTransferRoute = flowState.getReinforcementRoute(continuousTransferRouteId);
        check(Boolean(continuousTransferRoute && continuousTransferRoute.active && continuousTransferRoute.toTerritoryId === flowDestination.id), "Alt + glisser droit crée une ligne de renfort continue sur le trajet allié");
        check(continuousTransferCleared && continuousTransferToast.includes(flowDestination.name), "la création rapide du flux confirme la destination puis désélectionne le territoire");

        const hubGame = new C.Game({ playerId: 1, activeFactionIds: [1, 2], enableAI: false, enableWorldEvents: false, timeScale: 1 });
        hubGame.newGame(858585);
        const hubState = hubGame.state;
        const hubTerritory = hubState.territories.find((territory) =>
            !territory.isImpassable && territory.neighbors.filter((neighborId) => {
                const neighbor = hubState.getTerritory(neighborId);
                return neighbor && !neighbor.isImpassable && !territory.isPathBlocked(neighborId);
            }).length >= 2);
        const hubNeighbors = hubTerritory.neighbors
            .map((neighborId) => hubState.getTerritory(neighborId))
            .filter((territory) => territory && !territory.isImpassable && !hubTerritory.isPathBlocked(territory.id));
        const hubDonor = hubNeighbors[0];
        const hubDestination = hubNeighbors[1];
        [hubTerritory, hubDonor, hubDestination].forEach((territory) => { territory.ownerId = 1; });
        hubTerritory.units = 11;
        hubDonor.units = 21;
        hubDestination.units = 1;
        const hubRouteResult = hubGame.executeCommand({
            type: "CREATE_CONTINUOUS_REINFORCEMENT_ROUTE",
            playerId: 1,
            fromTerritoryId: hubTerritory.id,
            toTerritoryId: hubDestination.id,
            relayAllReinforcements: true
        });
        const hubRoute = hubRouteResult.route;
        const initialHubArmy = hubState.armies.find((army) => army.reinforcementRouteId === hubRoute.id);
        check(hubRouteResult.ok && hubRoute.relayAllReinforcements && hubTerritory.units === 1, "le mode hub envoie immédiatement toute la garnison disponible en laissant une unité");
        check(initialHubArmy.units === 10 && hubRoute.initialGarrisonDispatched === 10, "l’envoi initial du hub est comptabilisé dans la ligne continue");
        const incomingHubArmy = hubGame.executeCommand({
            type: "SEND_ARMY",
            playerId: 1,
            fromTerritoryId: hubDonor.id,
            toTerritoryId: hubTerritory.id,
            units: 10
        }).army;
        hubGame.resolveArmyArrival(incomingHubArmy);
        const relayedHubArmy = hubState.armies.find((army) => army.relayCount === 1 && army.reinforcementRouteId === hubRoute.id);
        check(Boolean(relayedHubArmy && relayedHubArmy.units === 10 && relayedHubArmy.finalTerritoryId === hubDestination.id), "un hub redirige automatiquement tous les renforts qui lui arrivent");
        check(hubTerritory.units === 1 && hubRoute.unitsRelayed === 10, "les renforts relayés ne s’accumulent pas dans le hub et sont suivis séparément");
        const reverseHubRoute = hubGame.executeCommand({
            type: "CREATE_CONTINUOUS_REINFORCEMENT_ROUTE",
            playerId: 1,
            fromTerritoryId: hubDestination.id,
            toTerritoryId: hubTerritory.id,
            relayAllReinforcements: true
        }).route;
        hubGame.resolveArmyArrival(initialHubArmy);
        check(reverseHubRoute.relayAllReinforcements && hubDestination.units === 11 && hubState.events.some((event) => /boucle logistique/.test(event.message)), "l’historique des convois empêche une boucle infinie entre deux hubs");
        check(hubState.toJSON().reinforcementRoutes.some((route) => route.relayAllReinforcements), "le mode hub et ses compteurs sont inclus dans l’état sérialisable");
        check(Boolean(JSON.stringify(flowState.toJSON())), "les lignes continues sont incluses dans l’état sérialisable");

        document.getElementById("result").textContent = `PASS — ${results.length} tests\n${results.join("\n")}`;
        document.body.dataset.status = "pass";
    } catch (error) {
        document.getElementById("result").textContent = `FAIL\n${error.stack || error.message}`;
        document.body.dataset.status = "fail";
    }
})(window.Conquest = window.Conquest || {});
