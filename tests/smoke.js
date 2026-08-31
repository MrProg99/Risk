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

    function countArchipelagoIslands(territories) {
        const relevant = territories.filter((territory) => !territory.isImpassable && !territory.isArchipelagoPassage);
        const relevantIds = new Set(relevant.map((territory) => territory.id));
        const remaining = new Set(relevantIds);
        let components = 0;
        while (remaining.size) {
            components += 1;
            const pending = [remaining.values().next().value];
            remaining.delete(pending[0]);
            while (pending.length) {
                const territoryId = pending.pop();
                const territory = territories.find((candidate) => candidate.id === territoryId);
                territory.neighbors.forEach((neighborId) => {
                    if (!remaining.has(neighborId) || territory.isPathBlocked(neighborId)) return;
                    remaining.delete(neighborId);
                    pending.push(neighborId);
                });
            }
        }
        return components;
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

        check(state.mapSize === "standard" && state.mapWidth === 2800 && state.mapHeight === 1800, "la carte actuelle mesure 2800 par 1800 unités");
        check(state.territories.length >= 110 && state.territories.length <= 120, "la carte étendue contient entre 110 et 120 territoires");
        check(state.territories.every((territory) => territory.polygon.length >= 3), "chaque territoire possède un polygone valide");
        check(state.territories.every((territory) => territory.neighbors.length >= 2), "chaque territoire possède plusieurs voisins");
        check(state.territories.every((territory) => territory.neighbors.every((id) => state.getTerritory(id).neighbors.includes(territory.id))), "les relations de voisinage sont réciproques");
        check(graphIsConnected(state.territories), "le graphe territorial est entièrement connecté");
        const generatedLakes = state.territories.filter((territory) => territory.isImpassable);
        check(generatedLakes.length >= 4 && generatedLakes.length <= 6, "la carte contient entre quatre et six lacs intérieurs");
        check(generatedLakes.every((lake) => lake.terrain === "lake" && lake.ownerId === null && lake.units === 0), "les lacs restent neutres, vides et identifiés comme zones d’eau");
        const generatedAirports = state.territories.filter((territory) => territory.terrain === "airport");
        check(Boolean(C.TERRITORY_TYPES.airport), "le terrain aéroport est chargé depuis les données du jeu");
        check(generatedAirports.length >= 4, "chaque carte contient au moins quatre aéroports");
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
        const largeMapGame = new C.Game({ playerId: 1, activeFactionIds: [1, 2, 3], mapSize: "large", enableAI: false, enableWorldEvents: false });
        largeMapGame.newGame(424244);
        check(largeMapGame.state.mapSize === "large" && largeMapGame.state.mapWidth === 3600 && largeMapGame.state.mapHeight === 2300, "la grande carte mesure 3600 par 2300 unités");
        check(largeMapGame.state.territories.length >= 165 && largeMapGame.state.territories.length <= 180, "la grande carte contient entre 165 et 180 territoires");
        check(largeMapGame.state.territories.filter((territory) => territory.isImpassable).length >= 6 && largeMapGame.state.territories.filter((territory) => territory.isImpassable).length <= 9, "la grande carte contient entre six et neuf lacs");
        check(largeMapGame.state.territories.filter((territory) => territory.terrain === "airport").length >= 6, "la grande carte contient au moins six aéroports");
        check(graphIsConnected(largeMapGame.state.territories, true), "la grande carte reste entièrement accessible autour de ses obstacles");
        check(largeMapGame.state.toJSON().mapSize === "large", "la taille de carte est incluse dans l’état sérialisable");
        const largeHourglassMap = largeMapGame.mapGenerator.generate(424245, undefined, "hourglass");
        check(largeHourglassMap.mapType === "hourglass" && graphIsConnected(largeHourglassMap.territories, true), "la grande carte Sablier conserve son passage central franchissable");
        const archipelagoMap = game.mapGenerator.generate(424246, undefined, "archipelago");
        const archipelagoPassages = archipelagoMap.territories.filter((territory) => territory.isArchipelagoPassage);
        const separatedArchipelagoIslands = countArchipelagoIslands(archipelagoMap.territories);
        check(archipelagoMap.mapType === "archipelago" && graphIsConnected(archipelagoMap.territories, true), "la carte Archipel relie toutes ses terres par des passages franchissables");
        check(new Set(archipelagoMap.territories.filter((territory) => territory.archipelagoIslandId !== null && !territory.isImpassable).map((territory) => territory.archipelagoIslandId)).size === 4, "la carte actuelle Archipel contient quatre îles terrestres");
        check(separatedArchipelagoIslands === 4 && archipelagoPassages.length >= 4, `les quatre îles redeviennent distinctes lorsque les passages interinsulaires sont retirés (${separatedArchipelagoIslands} composantes, ${archipelagoPassages.length} passages)`);
        check(archipelagoPassages.every((territory) => !territory.isImpassable && territory.isChokePoint && territory.blockedNeighbors.length === 0), "les montagnes ne ferment jamais les passages de l’Archipel");
        const largeArchipelagoMap = largeMapGame.mapGenerator.generate(424247, undefined, "archipelago");
        check(graphIsConnected(largeArchipelagoMap.territories, true) && countArchipelagoIslands(largeArchipelagoMap.territories) === 6, "la grande carte Archipel contient six îles toutes accessibles");
        check(largeArchipelagoMap.territories.filter((territory) => territory.isArchipelagoPassage).length >= 7, "la grande carte ouvre au moins sept corridors entre ses six îles");
        const stableArchipelagoGeneration = [11111, 22222, 33333, 44444, 55555].every((seed) => {
            const generatedMap = game.mapGenerator.generate(seed, undefined, "archipelago");
            return graphIsConnected(generatedMap.territories, true) &&
                countArchipelagoIslands(generatedMap.territories) === 4 &&
                generatedMap.territories.filter((territory) => territory.isArchipelagoPassage).length >= 4;
        });
        check(stableArchipelagoGeneration, "plusieurs graines Archipel conservent quatre îles et un réseau terrestre complet");
        const archipelagoGame = new C.Game({ playerId: 1, mapType: "archipelago", enableAI: false, enableWorldEvents: false });
        archipelagoGame.newGame(424246);
        const archipelagoStarts = archipelagoGame.state.factions.map((faction) => archipelagoGame.state.getTerritoriesOwnedBy(faction.id)[0]);
        check(new Set(archipelagoStarts.map((territory) => territory.archipelagoIslandId)).size === 4 && archipelagoStarts.every((territory) => !territory.isArchipelagoPassage), "les quatre factions commencent sur quatre îles différentes, loin des ponts");
        const archipelagoTeamSetups = C.FACTION_DEFINITIONS.map((definition, index) => ({
            ...definition,
            bonuses: { ...definition.bonuses },
            teamId: index < 2 ? 1 : 2,
            isAI: index !== 0
        }));
        const archipelagoTeamGame = new C.Game({ playerId: 1, mapType: "archipelago", factionSetups: archipelagoTeamSetups, enableAI: false, enableWorldEvents: false });
        archipelagoTeamGame.newGame(424248);
        const archipelagoTeamRows = archipelagoTeamGame.state.factions.map((faction) => {
            const start = archipelagoTeamGame.state.getTerritoriesOwnedBy(faction.id)[0];
            return Math.floor(start.archipelagoIslandId / 2);
        });
        check(archipelagoTeamRows.slice(0, 2).every((row) => row === 0) && archipelagoTeamRows.slice(2).every((row) => row === 1), "en 2v2, les alliés commencent sur la même rangée d’îles face à l’équipe adverse");
        const hourglassMap = game.mapGenerator.generate(424243, 115, "hourglass");
        const hourglassCenterX = game.state.mapWidth / 2;
        const openHourglassCrossings = hourglassMap.territories.reduce((edges, territory) => {
            territory.neighbors.forEach((neighborId) => {
                if (territory.id >= neighborId || territory.isImpassable || territory.isPathBlocked(neighborId)) return;
                const neighbor = hourglassMap.territories.find((candidate) => candidate.id === neighborId);
                if (!neighbor || neighbor.isImpassable) return;
                const crossesCenter = (territory.center.x < hourglassCenterX && neighbor.center.x >= hourglassCenterX) ||
                    (neighbor.center.x < hourglassCenterX && territory.center.x >= hourglassCenterX);
                if (crossesCenter) edges.push([territory.id, neighbor.id]);
            });
            return edges;
        }, []);
        check(hourglassMap.mapType === "hourglass" && openHourglassCrossings.length >= 1 && openHourglassCrossings.length <= 2, "la carte Sablier ne conserve qu’un passage central entre ses deux moitiés");
        check(graphIsConnected(hourglassMap.territories, true) && hourglassMap.territories.filter((territory) => territory.isChokePoint).length >= 2, "le point d’étranglement du Sablier reste franchissable et clairement identifié");
        check(state.factions.length === 4, "les quatre factions sont créées");
        check(state.factions.every((faction) => state.getTerritoriesOwnedBy(faction.id).length === 1), "chaque faction possède un territoire de départ");
        check(state.factions.every((faction) => state.getTerritoriesOwnedBy(faction.id)[0].units === 20), "chaque faction commence avec 20 unités");
        const foodGame = new C.Game({
            playerId: 1,
            enableAI: false,
            enableWorldEvents: false,
            timeScale: 1,
            foodAttritionIntervalMs: 2000
        });
        foodGame.newGame(737373);
        const foodCapital = foodGame.state.getTerritoriesOwnedBy(1)[0];
        const foodFarm = foodGame.state.territories.find((territory) => territory.terrain === "agriculture" && !territory.rareSite && territory.id !== foodCapital.id);
        check(foodGame.getFactionFoodState(1).capacity === 200 && foodGame.getFactionFoodState(1).demand === 20, "la capitale fournit une capacité permanente de 200 nourritures");
        foodFarm.ownerId = 1;
        foodFarm.units = 1;
        foodFarm.productionProgress = 0;
        const foodModeCommand = foodGame.executeCommand({ type: "SET_TERRITORY_MODE", playerId: 1, territoryId: foodFarm.id, mode: "food" });
        check(foodModeCommand.ok && foodFarm.productionMode === "food" && foodGame.getFactionFoodState(1).capacity === 290, "un territoire agricole fournit 10 nourritures par défaut puis 80 de plus en mode alimentaire");
        foodGame.update(6000);
        check(foodFarm.units === 1 && foodFarm.productionProgress === 0, "un territoire alimentaire ne produit plus d’unités");
        foodGame.eventSystem.registerEvent("famine", [foodFarm.id], 30000);
        check(foodGame.getFactionFoodState(1).capacity === 200, "une famine suspend la contribution alimentaire locale sans retirer les 200 de la capitale");
        foodGame.state.worldEvents = [];
        foodGame.executeCommand({ type: "SET_TERRITORY_MODE", playerId: 1, territoryId: foodFarm.id, mode: "units" });
        foodCapital.units = 100;
        foodCapital.productionProgress = 0;
        const fedProduction = foodGame.getProductionMultiplier(foodCapital);
        foodCapital.units = 239;
        const shortFoodState = foodGame.getFactionFoodState(1);
        check(shortFoodState.productionMultiplier === 0.75 && Math.abs(foodGame.getProductionMultiplier(foodCapital) - fedProduction * 0.75) < 0.0001, "une légère pénurie réduit le recrutement à 75 %");
        foodCapital.units = 279;
        check(foodGame.getFactionFoodState(1).productionMultiplier === 0.4, "une charge alimentaire entre 125 % et 140 % réduit le recrutement à 40 %");
        foodCapital.units = 319;
        check(foodGame.getFactionFoodState(1).productionMultiplier === 0.10 && foodGame.getFactionFoodState(1).attritionRate === 0.05, "une charge alimentaire entre 140 % et 160 % réduit le recrutement à 10 % et renforce l’attrition");
        foodCapital.units = 339;
        check(foodGame.getFactionFoodState(1).productionMultiplier === 0 && foodGame.getFactionFoodState(1).attritionRate === 0.08, "une charge alimentaire supérieure à 160 % arrête le recrutement et provoque une forte attrition");
        foodCapital.units = 319;
        foodCapital.productionProgress = 0;
        foodFarm.productionProgress = 0;
        const unitsBeforeFoodAttrition = foodGame.getFactionStats(1).totalUnits;
        foodGame.update(1000);
        foodGame.update(1000);
        check(foodGame.getFactionStats(1).totalUnits < unitsBeforeFoodAttrition, "une capacité inférieure à 75 % provoque une attrition progressive");
        check(foodCapital.units >= 1 && foodFarm.units >= 1, "l’attrition alimentaire ne vide jamais entièrement une garnison territoriale");
        check(foodGame.state.toJSON().territories.some((territory) => territory.productionMode === "units"), "le mode de production est inclus dans l’état sérialisable");

        const researchModeGame = new C.Game({ playerId: 1, activeFactionIds: [1, 2], enableAI: false, enableWorldEvents: false, timeScale: 1 });
        researchModeGame.newGame(424243);
        researchModeGame.state.territories.forEach((territory) => {
            if (!territory.isImpassable) territory.ownerId = null;
            territory.isCapital = false;
            territory.productionMode = "units";
            territory.productionModeChangedAtMs = 0;
        });
        const researchModeTerritories = researchModeGame.state.territories
            .filter((territory) => !territory.isImpassable && !territory.installation && territory.terrain !== "airport" && !territory.rareSite)
            .slice(0, 6);
        researchModeTerritories.forEach((territory, index) => {
            territory.ownerId = 1;
            territory.units = 1;
            territory.terrain = "plain";
            territory.rareSite = null;
            territory.productionMode = index === 0 ? "units" : "research";
        });
        const researchModeFaction = researchModeGame.state.getFaction(1);
        researchModeFaction.capitalTerritoryId = researchModeTerritories[0].id;
        researchModeTerritories[0].isCapital = true;
        const researchModeCommand = researchModeGame.executeCommand({ type: "SET_TERRITORY_MODE", playerId: 1, territoryId: researchModeTerritories[0].id, mode: "research" });
        check(researchModeCommand.ok && researchModeTerritories[0].productionMode === "research" && researchModeGame.getProductionMultiplier(researchModeTerritories[0]) === 0, "un territoire peut abandonner le recrutement pour être affecté à la recherche");
        check(Math.abs(researchModeGame.getResearchRate(1) - 1.50) < 0.0001, "six laboratoires standards restent plafonnés à +50 % de vitesse scientifique");
        check(researchModeGame.getTerritoryPassiveFoodCapacity(researchModeTerritories[1]) === 10, "un laboratoire conserve la nourriture passive de son territoire");
        const researchModeSnapshot = researchModeGame.createNetworkSnapshot();
        check(researchModeSnapshot.territories.filter((territory) => territory.productionMode === "research").length === 6, "l’affectation Recherche est incluse dans les instantanés multijoueurs");
        researchModeTerritories.forEach((territory) => {
            territory.productionMode = "units";
            territory.productionModeChangedAtMs = 0;
        });
        researchModeFaction.research.activeTechnologyId = "construction-1";
        researchModeGame.state.elapsedMs = 50000;
        const conservativeResearchDecision = researchModeGame.aiSystem.manageResearchAllocation(researchModeFaction, researchModeTerritories);
        check(conservativeResearchDecision && researchModeTerritories.filter((territory) => territory.productionMode === "research").length === 1, "avec six territoires stables, l’IA n’ouvre qu’un seul laboratoire intérieur");
        check(!researchModeGame.aiSystem.manageResearchAllocation(researchModeFaction, researchModeTerritories), "l’IA respecte son plafond conservateur de laboratoires");
        researchModeTerritories.forEach((territory) => { territory.units = 100; });
        check(researchModeGame.aiSystem.manageResearchAllocation(researchModeFaction, researchModeTerritories) && !researchModeTerritories.some((territory) => territory.productionMode === "research"), "l’IA ferme son laboratoire lorsque la couverture alimentaire devient dangereuse");
        check(researchModeGame.aiSystem.getResearchTerritoryLimit(5) === 0 && researchModeGame.aiSystem.getResearchTerritoryLimit(6) === 1 && researchModeGame.aiSystem.getResearchTerritoryLimit(12) === 2 && researchModeGame.aiSystem.getResearchTerritoryLimit(21) === 3, "les plafonds de recherche de l’IA progressent prudemment avec son territoire");
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
                    <input type="radio" name="mapType" value="standard">
                    <input type="radio" name="mapType" value="hourglass" checked>
                    <input type="radio" name="mapType" value="archipelago">
                    <input type="radio" name="mapSize" value="standard">
                    <input type="radio" name="mapSize" value="large" checked>
                    <input type="radio" name="aiDifficulty" value="normal">
                    <input type="radio" name="aiDifficulty" value="hard" checked>
                    <div id="ai-difficulty-options"></div>
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
        check(submittedLobbyConfiguration.mapType === "hourglass", "le lobby transmet le type de carte Sablier au moteur");
        lobbyFixture.querySelector('input[name="mapType"][value="archipelago"]').checked = true;
        check(lobbyController.getConfiguration().mapType === "archipelago" && C.getMapTypeLabel("archipelago") === "ARCHIPEL", "le lobby et l’interface reconnaissent le type de carte Archipel");
        check(submittedLobbyConfiguration.mapSize === "large", "le lobby transmet le choix Grande carte au moteur");
        check(submittedLobbyConfiguration.aiDifficulty === "hard" && submittedLobbyConfiguration.aiProductionMultiplier === 1.20, "le lobby transmet le niveau Difficile et son bonus de production");
        check(submittedLobbyConfiguration.activeFactionIds.join(",") === "2,3,4", "la validation du lobby transmet la liste des participants au moteur");
        lobbyController.close();
        lobbyFixture.remove();
        const joinLobbyFixture = document.createElement("div");
        joinLobbyFixture.innerHTML = `
            <section id="game-lobby">
                <form id="lobby-form">
                    <input type="radio" name="gameMode" value="solo">
                    <input type="radio" name="gameMode" value="join" checked>
                    <input type="radio" name="playerCount" value="2" checked>
                    <input type="text" name="roomCode" value="abc123">
                    <div id="room-code-field"></div>
                    <div id="multiplayer-join-action" hidden><span id="join-code-help"></span><button id="join-room" type="submit">Rejoindre le salon</button></div>
                    <div id="lobby-factions"></div>
                    <p id="lobby-summary"></p>
                    <button id="start-game" type="submit">Lancer</button>
                    <section id="room-waiting" hidden><strong id="room-code-display"></strong><p id="room-status"></p><div id="room-player-list"></div><button id="leave-room" type="button">Quitter</button></section>
                </form>
            </section>
            <div id="game-app"></div>`;
        document.body.append(joinLobbyFixture);
        const joinLobbyController = new C.LobbyController();
        check(!joinLobbyController.joinAction.hidden && joinLobbyController.startButton.hidden && joinLobbyController.roomCodeInput.required, "le mode Rejoindre affiche un bouton dédié directement sous le code du salon");
        check(joinLobbyController.getConfiguration().roomCode === "ABC123", "le code saisi pour rejoindre un salon est normalisé en six caractères majuscules");
        joinLobbyController.network = { uid: "host", roomCode: "PN6EUD" };
        joinLobbyController.room = { meta: { hostUid: "host" }, players: {} };
        joinLobbyController.activeRoomMode = "host";
        joinLobbyController.refresh();
        check(!joinLobbyController.joinAction.hidden && joinLobbyController.roomWaiting.hidden && /quitter le salon PN6EUD/i.test(joinLobbyController.summary.textContent), "un ancien salon restauré ne masque plus l’action pour rejoindre un autre code");
        check(typeof C.FirebaseMultiplayer.prototype.leaveRoom === "function" && Boolean(joinLobbyController.leaveRoomButton), "le lobby permet de quitter proprement un salon mémorisé");
        joinLobbyController.close();
        joinLobbyFixture.remove();
        const duelGame = new C.Game({ playerId: 4, activeFactionIds: [4, 1], enableAI: true, timeScale: 1 });
        duelGame.newGame(565656);
        check(duelGame.state.factions.map((faction) => faction.id).join(",") === "4,1", "une partie peut démarrer avec seulement deux factions choisies dans le lobby");
        check(duelGame.aiSystem.factionIds.length === 1 && duelGame.aiSystem.factionIds[0] === 1, "l’ordinateur contrôle tous les participants sauf la faction du joueur");
        check(duelGame.state.getTerritoriesOwnedBy(4).length === 1 && duelGame.state.getTerritoriesOwnedBy(1).length === 1, "chaque participant du lobby reçoit un territoire de départ");
        const difficultyGame = new C.Game({ playerId: 1, activeFactionIds: [1, 2], enableAI: true, aiFactionIds: [2], aiProductionMultiplier: 1.40, enableWorldEvents: false, timeScale: 1 });
        difficultyGame.newGame(565657);
        const difficultyHumanTerritory = difficultyGame.state.getTerritoriesOwnedBy(1)[0];
        const difficultyAiTerritory = difficultyGame.state.getTerritoriesOwnedBy(2)[0];
        [difficultyHumanTerritory, difficultyAiTerritory].forEach((territory) => {
            territory.terrain = "plain";
            territory.rareSite = null;
            territory.production = 1;
            territory.productionMode = "units";
            territory.units = 20;
        });
        const humanProduction = difficultyGame.getProductionMultiplier(difficultyHumanTerritory);
        const aiProduction = difficultyGame.getProductionMultiplier(difficultyAiTerritory);
        check(Math.abs((aiProduction / humanProduction) - 1.40) < 0.0001, "le niveau Implacable augmente uniquement le recrutement territorial de l’IA de 40 %");
        difficultyGame.aiSystem.factionIds.push(1);
        check(difficultyGame.getProductionMultiplier(difficultyHumanTerritory) === humanProduction, "une faction humaine reprise temporairement par l’IA ne reçoit pas le bonus de difficulté");

        const multiplayerRoom = {
            players: {
                a: { uid: "a", name: "Alpha", raceId: 1, teamId: 1, slot: 1, color: "#f0b84d" },
                b: { uid: "b", name: "Bravo", raceId: 1, teamId: 1, slot: 2, color: "#43cde0" },
                c: { uid: "c", name: "Charlie", raceId: 3, teamId: 2, slot: 3, color: "#ef655f" }
            }
        };
        const multiplayerSetups = C.FirebaseMultiplayer.buildFactionSetups(multiplayerRoom);
        check(multiplayerSetups[0].definitionId === multiplayerSetups[1].definitionId && multiplayerSetups[0].color !== multiplayerSetups[1].color, "deux joueurs peuvent choisir la même race tout en conservant des couleurs distinctes");
        check(/règles Frontières/.test(C.FirebaseMultiplayer.formatError({ code: "PERMISSION_DENIED" })), "le lobby explique clairement un refus des regles Firebase");
        check(/réservation de votre place/.test(C.FirebaseMultiplayer.formatError({ code: "PERMISSION_DENIED", frontieresOperation: "la réservation de votre place" })), "un refus Firebase indique précisément l’étape de connexion bloquée");
        check(C.FirebaseMultiplayer.claimEmptySlot(null, "guest") === "guest" && C.FirebaseMultiplayer.claimEmptySlot("host", "guest") === undefined, "la réservation Firebase ignore un créneau occupé au lieu de provoquer un refus de permission");
        check(/authentification anonyme/.test(C.FirebaseMultiplayer.formatError({ code: "auth/operation-not-allowed" })), "le lobby explique clairement lorsque l'authentification anonyme est desactivee");
        const humanVsAiRoom = {
            meta: { teamSize: 2, maxPlayers: 4, opponentMode: "ai" },
            players: {
                a: { uid: "a", name: "Alpha", raceId: 1, teamId: 1, slot: 1, color: "#f0b84d" },
                b: { uid: "b", name: "Bravo", raceId: 2, teamId: 1, slot: 2, color: "#43cde0" }
            }
        };
        const humanVsAiSetups = C.FirebaseMultiplayer.buildFactionSetups(humanVsAiRoom);
        check(humanVsAiSetups.length === 4 && humanVsAiSetups.filter((setup) => setup.isAI && setup.teamId === 2).length === 2, "un salon 2v2 peut compléter toute l’équipe adverse avec des IA");
        const humanVsAiGame = new C.Game({ playerId: 1, factionSetups: humanVsAiSetups, enableAI: true, aiFactionIds: [3, 4], enableWorldEvents: false, mapType: "hourglass" });
        humanVsAiGame.newGame(313132);
        check(humanVsAiGame.aiSystem.factionIds.join(",") === "3,4" && humanVsAiGame.areAllied(3, 4) && !humanVsAiGame.areAllied(1, 3), "les deux adversaires IA sont actifs et coopèrent dans la même équipe");
        const humanTeamAverageX = humanVsAiGame.state.factions.filter((faction) => faction.teamId === 1)
            .reduce((sum, faction) => sum + humanVsAiGame.state.getTerritory(faction.capitalTerritoryId).center.x, 0) / 2;
        const aiTeamAverageX = humanVsAiGame.state.factions.filter((faction) => faction.teamId === 2)
            .reduce((sum, faction) => sum + humanVsAiGame.state.getTerritory(faction.capitalTerritoryId).center.x, 0) / 2;
        check(humanTeamAverageX < humanVsAiGame.state.mapWidth / 2 && aiTeamAverageX > humanVsAiGame.state.mapWidth / 2, "sur le Sablier, les deux équipes commencent de part et d’autre du point central");
        const teamGame = new C.Game({ playerId: 1, factionSetups: multiplayerSetups, enableAI: false, enableWorldEvents: false, timeScale: 1 });
        teamGame.newGame(313131);
        const groupGame = new C.Game({ playerId: 1, activeFactionIds: [1, 2], enableAI: false, enableWorldEvents: false, timeScale: 1 });
        groupGame.newGame(313133);
        const groupTerritories = groupGame.state.territories.filter((territory) => !territory.isImpassable);
        groupTerritories.forEach((territory) => {
            territory.ownerId = 1;
            territory.units = 5;
            territory.productionMode = "units";
        });
        const groupDestination = groupTerritories[0];
        const groupSources = groupTerritories.slice(1, 4);
        groupSources[0].units = 11;
        groupSources[1].units = 21;
        groupSources[2].units = 6;
        const batchMode = groupGame.executeCommand({
            type: "BATCH_SET_TERRITORY_MODE",
            playerId: 1,
            territoryIds: groupSources.map((territory) => territory.id),
            mode: "research"
        });
        check(batchMode.ok && batchMode.changedCount === 3 && groupSources.every((territory) => territory.productionMode === "research"), "une commande groupée affecte plusieurs territoires à la recherche");
        groupGame.executeCommand({ type: "BATCH_SET_TERRITORY_MODE", playerId: 1, territoryIds: groupSources.map((territory) => territory.id), mode: "units" });
        const batchReinforcement = groupGame.executeCommand({
            type: "BATCH_SEND_REINFORCEMENTS",
            playerId: 1,
            fromTerritoryIds: groupSources.map((territory) => territory.id).concat(groupDestination.id),
            toTerritoryId: groupDestination.id
        });
        check(batchReinforcement.ok && batchReinforcement.sentCount === 3 && batchReinforcement.skippedCount === 1 && batchReinforcement.totalUnits === 28, "le renfort groupé envoie 80 % depuis chaque source valide et ignore la destination");
        check(groupSources.map((territory) => territory.units).join(",") === "3,5,2", "le renfort groupé conserve au moins une garnison dans chaque territoire source");
        const batchContinuous = groupGame.executeCommand({
            type: "BATCH_CREATE_CONTINUOUS_REINFORCEMENT_ROUTES",
            playerId: 1,
            fromTerritoryIds: groupSources.map((territory) => territory.id).concat(groupDestination.id),
            toTerritoryId: groupDestination.id
        });
        check(batchContinuous.ok && batchContinuous.createdCount === 3 && batchContinuous.skippedCount === 1 && groupSources.every((source) => groupGame.state.reinforcementRoutes.some((route) => route.active && route.fromTerritoryId === source.id && route.toTerritoryId === groupDestination.id)), "Alt peut créer un flux continu depuis chaque territoire du groupe");
        const hostileGroupTarget = groupTerritories[4];
        hostileGroupTarget.ownerId = 2;
        check(!groupGame.executeCommand({ type: "BATCH_SEND_REINFORCEMENTS", playerId: 1, fromTerritoryIds: groupSources.map((territory) => territory.id), toTerritoryId: hostileGroupTarget.id }).ok, "un ordre groupé ne peut pas transformer un renfort en attaque accidentelle");
        const shiftSelectionStub = {
            game: groupGame,
            selectedTerritoryId: groupSources[0].id,
            multiSelectedTerritoryIds: new Set(),
            targetTerritoryId: null,
            plannedRoute: [],
            lastRouteKey: null,
            targetingAbilityId: null,
            airstrikeSourceId: null,
            syncSelection: () => {},
            showToast: () => {}
        };
        C.UIController.prototype.handleTerritoryClick.call(shiftSelectionStub, groupSources[1], { shiftKey: true });
        check(shiftSelectionStub.multiSelectedTerritoryIds.has(groupSources[0].id) && shiftSelectionStub.multiSelectedTerritoryIds.has(groupSources[1].id), "Shift + clic ajoute le territoire courant et le nouveau territoire à la sélection multiple");
        let selectionToggleClears = 0;
        const selectionToggleStub = {
            game: groupGame,
            selectedTerritoryId: groupSources[0].id,
            multiSelectedTerritoryIds: new Set(),
            targetTerritoryId: groupDestination.id,
            plannedRoute: [],
            lastRouteKey: null,
            targetingAbilityId: null,
            airstrikeSourceId: null,
            clearSelection() {
                this.selectedTerritoryId = null;
                this.targetTerritoryId = null;
                this.multiSelectedTerritoryIds.clear();
                selectionToggleClears += 1;
            },
            syncSelection: () => {},
            showToast: () => {}
        };
        C.UIController.prototype.handleTerritoryClick.call(selectionToggleStub, groupDestination, {});
        const targetToggleClears = selectionToggleClears === 1 && selectionToggleStub.selectedTerritoryId === null && selectionToggleStub.targetTerritoryId === null;
        selectionToggleStub.selectedTerritoryId = groupSources[0].id;
        selectionToggleStub.targetTerritoryId = groupDestination.id;
        C.UIController.prototype.handleTerritoryClick.call(selectionToggleStub, groupSources[0], {});
        check(targetToggleClears && selectionToggleClears === 2 && selectionToggleStub.selectedTerritoryId === null && selectionToggleStub.targetTerritoryId === null, "recliquer sur l'origine ou la cible désélectionne sans quitter la carte");
        const teamSource = teamGame.state.territories.find((territory) => !territory.isImpassable && territory.neighbors.some((id) => {
            const neighbor = teamGame.state.getTerritory(id);
            return neighbor && !neighbor.isImpassable && !territory.isPathBlocked(id);
        }));
        const teamDestination = teamSource.neighbors.map((id) => teamGame.state.getTerritory(id)).find((territory) => territory && !territory.isImpassable && !teamSource.isPathBlocked(territory.id));
        teamSource.ownerId = 1;
        teamSource.units = 20;
        teamDestination.ownerId = 2;
        teamDestination.units = 7;
        check(teamGame.areAllied(1, 2) && !teamGame.areAllied(1, 3), "les alliances sont déterminées par l’équipe et non par la race");
        check(teamGame.getTerritoryVisibilityMap(1).get(teamDestination.id) === 0, "les équipiers partagent la vision de leurs territoires");
        check(teamGame.findAlliedPath(1, teamSource.id, teamDestination.id)?.length === 2, "un convoi peut emprunter un territoire appartenant à un équipier");
        const alliedTransfer = teamGame.executeCommand({ type: "SEND_ARMY", playerId: 1, fromTerritoryId: teamSource.id, toTerritoryId: teamDestination.id, units: 5 });
        for (let tick = 0; tick < 8 && teamGame.state.armies.length; tick += 1) teamGame.update(1000);
        check(alliedTransfer.ok && teamDestination.ownerId === 2 && teamDestination.units >= 12, "un joueur peut donner des renforts à un territoire allié sans en prendre le contrôle");

        const existingTeamFixtureIds = new Set([teamSource.id, teamDestination.id]);
        const alliedAidTarget = teamGame.state.territories.find((territory) => !territory.isImpassable && !territory.isCapital && !existingTeamFixtureIds.has(territory.id) && territory.neighbors.filter((id) => {
            const neighbor = teamGame.state.getTerritory(id);
            return neighbor && !neighbor.isImpassable && !existingTeamFixtureIds.has(neighbor.id) && !territory.isPathBlocked(id);
        }).length >= 2);
        const alliedAidNeighbors = alliedAidTarget.neighbors
            .map((id) => teamGame.state.getTerritory(id))
            .filter((territory) => territory && !territory.isImpassable && !existingTeamFixtureIds.has(territory.id) && !alliedAidTarget.isPathBlocked(territory.id));
        const alliedAidSource = alliedAidNeighbors[0];
        const alliedAidEnemy = alliedAidNeighbors[1];
        alliedAidSource.ownerId = 1;
        alliedAidSource.units = 100;
        alliedAidTarget.ownerId = 2;
        alliedAidTarget.units = 10;
        alliedAidEnemy.ownerId = 3;
        alliedAidEnemy.units = 35;
        const alliedAidTotalSurplus = teamGame.state.getTerritoriesOwnedBy(1).reduce((sum, territory) => {
            const hostileNeighbors = territory.neighbors.map((id) => teamGame.state.getTerritory(id))
                .filter((neighbor) => neighbor && neighbor.ownerId !== null && !neighbor.isImpassable && !teamGame.areAllied(neighbor.ownerId, 1)).length;
            return sum + Math.max(0, territory.units - 5 - hostileNeighbors * 3 - (territory.isCapital ? 5 : 0));
        }, 0);
        const alliedAidStarted = teamGame.aiSystem.considerAlliedDefense(teamGame.state.getFaction(1), teamGame.state.getTerritoriesOwnedBy(1));
        const alliedAidArmy = teamGame.state.armies.find((army) => army.ownerId === 1 && army.isConvoy && army.finalTerritoryId === alliedAidTarget.id);
        check(alliedAidStarted && alliedAidArmy && alliedAidArmy.units <= Math.floor(alliedAidTotalSurplus * 0.25), "l’IA envoie au plus 25 % de son surplus vers un territoire allié gravement menacé");
        for (let tick = 0; tick < 8 && teamGame.state.armies.includes(alliedAidArmy); tick += 1) teamGame.update(1000);
        check(alliedAidTarget.ownerId === 2 && alliedAidTarget.units > 10 && teamGame.aiSystem.alliedDefenseConvoysSent === 1, "le convoi d’aide renforce le coéquipier sans prendre le contrôle de son territoire");

        teamGame.executeCommand({ type: "SET_TERRITORY_MODE", playerId: 1, territoryId: teamSource.id, mode: "food" });
        const networkSnapshot = teamGame.createNetworkSnapshot();
        const remoteTeamGame = new C.Game({ playerId: 2, factionSetups: multiplayerSetups, enableAI: false, enableWorldEvents: false, timeScale: 1 });
        remoteTeamGame.newGame(313131);
        check(remoteTeamGame.applyNetworkSnapshot(networkSnapshot) && remoteTeamGame.state.getTerritory(teamDestination.id).units === teamDestination.units, "un instantané réseau léger reproduit l’état dynamique chez un autre joueur");
        check(remoteTeamGame.state.getTerritory(teamSource.id).productionMode === "food", "le mode alimentaire est synchronisé dans les instantanés multijoueurs");

        const victoryGame = new C.Game({ playerId: 1, activeFactionIds: [1, 2], enableAI: false, aiFactionIds: [2], enableWorldEvents: false, timeScale: 1 });
        victoryGame.newGame(323232);
        const victoryLand = victoryGame.state.territories.filter((territory) => !territory.isImpassable);
        const victorySource = victoryLand.find((territory) => territory.neighbors.some((neighborId) => {
            const neighbor = victoryGame.state.getTerritory(neighborId);
            return neighbor && !neighbor.isImpassable && !territory.isPathBlocked(neighborId);
        }));
        const victoryTarget = victorySource.neighbors
            .map((neighborId) => victoryGame.state.getTerritory(neighborId))
            .find((territory) => territory && !territory.isImpassable && !victorySource.isPathBlocked(territory.id));
        victoryLand.forEach((territory) => {
            territory.ownerId = null;
            territory.units = 5;
            territory.isCapital = false;
        });
        victorySource.ownerId = 1;
        victorySource.units = 50;
        victorySource.isCapital = true;
        victoryTarget.ownerId = 2;
        victoryTarget.units = 1;
        victoryTarget.isCapital = true;
        victoryGame.state.getFaction(1).capitalTerritoryId = victorySource.id;
        victoryGame.state.getFaction(2).capitalTerritoryId = victoryTarget.id;
        victoryGame.random = () => 0.5;
        victorySource.productionProgress = 0.99;
        victoryGame.update(1000);
        const mobilizedBeforeBattle = victoryGame.state.getFaction(1).statistics.unitsProduced;
        let gameOverNotice = null;
        victoryGame.subscribe((change) => {
            if (change.type === "GAME_OVER") gameOverNotice = change;
        });
        const finalAttack = victoryGame.executeCommand({
            type: "SEND_ARMY",
            playerId: 1,
            fromTerritoryId: victorySource.id,
            toTerritoryId: victoryTarget.id,
            units: 20
        });
        victoryGame.resolveArmyArrival(finalAttack.army);
        const victorStats = victoryGame.state.getFaction(1).statistics;
        const defeatedStats = victoryGame.state.getFaction(2).statistics;
        check(mobilizedBeforeBattle > 0 && victorStats.unitsProduced === mobilizedBeforeBattle, "les unités produites pendant la campagne alimentent les statistiques du commandant");
        check(victorStats.attacksLaunched === 1 && victorStats.territoriesCaptured === 1 && victorStats.battlesWon === 1 && victorStats.enemyUnitsDestroyed === 1, "l’offensive finale comptabilise attaque, capture, victoire et défenseurs détruits");
        check(defeatedStats.territoriesLost === 1 && defeatedStats.unitsLost === 1, "le joueur éliminé conserve ses pertes dans le bilan final");
        check(victoryGame.state.winnerTeamId === 1 && victoryGame.paused && victoryGame.state.victoryAtMs !== null && gameOverNotice?.winnerTeamId === 1, "la domination de la dernière équipe termine et fige immédiatement la partie");
        check(victoryGame.setPaused(false) === false && victoryGame.paused, "une partie terminée ne peut pas être relancée depuis le bouton de pause");
        const finalStandings = victoryGame.getFinalStandings();
        check(finalStandings.length === 2 && finalStandings[0].factionId === 1 && finalStandings[1].isAI, "le classement final place les vainqueurs en tête et inclut les joueurs IA");
        const victorySnapshot = victoryGame.createNetworkSnapshot();
        const remoteVictoryGame = new C.Game({ playerId: 2, activeFactionIds: [1, 2], enableAI: false, enableWorldEvents: false, timeScale: 1 });
        remoteVictoryGame.newGame(323232);
        let remoteGameOverNotice = null;
        remoteVictoryGame.subscribe((change) => {
            if (change.type === "GAME_OVER") remoteGameOverNotice = change;
        });
        check(remoteVictoryGame.applyNetworkSnapshot(victorySnapshot) && remoteGameOverNotice?.winnerTeamId === 1 && remoteVictoryGame.state.getFaction(1).statistics.territoriesCaptured === 1, "la victoire et toutes les statistiques sont synchronisées vers les joueurs multijoueurs");

        const victoryElements = {
            victoryOutcome: document.createElement("p"),
            victoryTitle: document.createElement("h2"),
            victorySubtitle: document.createElement("p"),
            victoryDuration: document.createElement("span"),
            victoryMap: document.createElement("span"),
            victoryTeam: document.createElement("section"),
            victoryStandings: document.createElement("div")
        };
        C.UIController.prototype.renderVictoryScreen.call({
            game: victoryGame,
            elements: victoryElements,
            formatDuration: C.UIController.prototype.formatDuration
        });
        check(victoryElements.victoryTitle.textContent === "VICTOIRE" && victoryElements.victoryStandings.children.length === 2 && /IA/.test(victoryElements.victoryStandings.textContent), "l’écran de victoire affiche une fiche statistique pour chaque humain et chaque IA");

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
        const eventIdsBeforeReinforcementArrival = new Set(state.events.map((event) => event.id));
        for (let tick = 0; tick < 8; tick += 1) game.update(1000);
        check(target.units > unitsBeforeReinforcement, "les renforts rejoignent le territoire allié à l’arrivée");
        check(!state.events.filter((event) => !eventIdsBeforeReinforcementArrival.has(event.id)).some((event) => /renforce .+\(\+\d+\)/.test(event.message)), "l’arrivée d’un renfort simple n’ajoute rien au journal");

        const airportGame = new C.Game({ playerId: 1, enableAI: false, enableWorldEvents: false, timeScale: 1 });
        airportGame.newGame(424242);
        const airport = airportGame.state.territories.find((territory) => territory.terrain === "airport");
        const airstrikeTarget = airportGame.getTerritoriesWithinHops(airport, airportGame.airstrikeRangeHops)
            .find((territory) => !territory.isImpassable);
        airport.ownerId = 1;
        airport.airstrikeCooldownMs = 0;
        airstrikeTarget.ownerId = 2;
        airstrikeTarget.units = 100;
        const airstrike = airportGame.executeCommand({
            type: "AIRSTRIKE",
            playerId: 1,
            fromTerritoryId: airport.id,
            toTerritoryId: airstrikeTarget.id
        });
        check(airstrike.ok && airstrike.damage === 10 && airstrikeTarget.units === 90, "un aéroport contrôlé peut lancer une frappe aérienne à portée");
        check(airport.airstrikeCooldownMs === airportGame.airstrikeCooldownMs, "une frappe aérienne déclenche la recharge de l’aéroport");
        airportGame.state.territories.forEach((territory) => {
            if (territory.id === airport.id) return;
            territory.ownerId = null;
            territory.units = Math.max(2, territory.units);
        });
        airstrikeTarget.ownerId = 2;
        airstrikeTarget.units = 100;
        airport.airstrikeCooldownMs = 1000;
        const automaticAirstrikes = [];
        airportGame.subscribe((change) => {
            if (change.type === "AIRSTRIKE_RESOLVED" && change.automatic) automaticAirstrikes.push(change);
        });
        airportGame.update(1000);
        check(airstrikeTarget.units === 90 && automaticAirstrikes.length === 1 && automaticAirstrikes[0].sourceTerritoryId === airport.id, "un aéroport prêt bombarde automatiquement une force hostile visible");
        check(airport.airstrikeCooldownMs === airportGame.airstrikeCooldownMs && airport.airstrikeLastAction?.targetTerritoryId === airstrikeTarget.id, "la frappe automatique recharge l’escadrille et mémorise sa cible");
        const automaticSnapshot = airportGame.createNetworkSnapshot();
        const remoteAirportGame = new C.Game({ playerId: 2, enableAI: false, enableWorldEvents: false, timeScale: 1 });
        remoteAirportGame.newGame(424242);
        let remoteAutomaticAirstrikes = 0;
        remoteAirportGame.subscribe((change) => {
            if (change.type === "AIRSTRIKE_RESOLVED" && change.automatic) remoteAutomaticAirstrikes += 1;
        });
        remoteAirportGame.applyNetworkSnapshot(automaticSnapshot);
        remoteAirportGame.applyNetworkSnapshot(automaticSnapshot);
        check(remoteAutomaticAirstrikes === 1 && remoteAirportGame.state.getTerritory(airport.id).airstrikeLastAction?.damage === 10, "la frappe automatique et son animation sont reproduites une seule fois chez les clients Firebase");
        airstrikeTarget.ownerId = null;
        airstrikeTarget.units = 100;
        airport.airstrikeCooldownMs = 0;
        const automaticShotCount = automaticAirstrikes.length;
        airportGame.update(1000);
        check(airstrikeTarget.units === 100 && automaticAirstrikes.length === automaticShotCount, "un aéroport automatique ne bombarde pas les territoires neutres");

        const aiJournalGame = new C.Game({ playerId: 1, activeFactionIds: [1, 2], enableAI: true, enableWorldEvents: false });
        aiJournalGame.newGame(515151);
        const aiLogisticsSource = aiJournalGame.state.territories.find((territory) =>
            !territory.isImpassable && territory.neighbors.some((id) => {
                const neighbor = aiJournalGame.state.getTerritory(id);
                return neighbor && !neighbor.isImpassable && !territory.isPathBlocked(id);
            }));
        const aiLogisticsTarget = aiLogisticsSource.neighbors.map((id) => aiJournalGame.state.getTerritory(id))
            .find((territory) => territory && !territory.isImpassable && !aiLogisticsSource.isPathBlocked(territory.id));
        aiLogisticsSource.ownerId = 2;
        aiLogisticsTarget.ownerId = 2;
        aiLogisticsSource.units = 30;
        const eventsBeforeAiReinforcement = aiJournalGame.state.events.length;
        const silentAiReinforcement = aiJournalGame.executeCommand({
            type: "SEND_ARMY",
            playerId: 2,
            fromTerritoryId: aiLogisticsSource.id,
            toTerritoryId: aiLogisticsTarget.id,
            units: 5
        });
        check(silentAiReinforcement.ok && aiJournalGame.state.events.length === eventsBeforeAiReinforcement, "un renforcement de l’IA n’est pas ajouté au journal");
        const silentAiFlow = aiJournalGame.executeCommand({
            type: "CREATE_CONTINUOUS_REINFORCEMENT_ROUTE",
            playerId: 2,
            fromTerritoryId: aiLogisticsSource.id,
            toTerritoryId: aiLogisticsTarget.id
        });
        check(silentAiFlow.ok && aiJournalGame.state.events.length === eventsBeforeAiReinforcement, "les lignes logistiques de l’IA restent silencieuses dans le journal");
        aiLogisticsSource.ownerId = 1;
        aiLogisticsTarget.ownerId = 1;
        aiLogisticsSource.units = 30;
        const visibleHumanReinforcement = aiJournalGame.executeCommand({
            type: "SEND_ARMY",
            playerId: 1,
            fromTerritoryId: aiLogisticsSource.id,
            toTerritoryId: aiLogisticsTarget.id,
            units: 5
        });
        check(visibleHumanReinforcement.ok && aiJournalGame.state.events.length === eventsBeforeAiReinforcement + 1, "les renforcements du joueur humain restent visibles dans le journal");

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
        const territoryCaptureChanges = [];
        cannonGame.subscribe((change) => {
            if (change.type === "CANNON_FIRED") cannonChanges.push(change);
            if (change.type === "TERRITORY_CAPTURED") territoryCaptureChanges.push(change);
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
        check(territoryCaptureChanges.some((change) => change.territoryId === cannonTerritory.id && change.previousOwnerId === 1 && change.ownerId === 2), "une conquête indique l’ancien propriétaire pour détecter la perte d’un territoire");
        check(cannonTerritory.installationProgressMs === 0 && cannonState.events.some((event) => /contrôle du canon/.test(event.message)), "la capture du canon est annoncée et réinitialise sa cadence de tir");

        check(C.TECHNOLOGY_BRANCHES.length === 4 && Object.keys(C.TECHNOLOGIES).length === 27, "l’arbre propose quatre axes progressifs et cinq recherches ultimes de merveilles");
        check(Object.keys(C.WONDER_TYPES).length === 5 && Object.values(C.WONDER_TYPES).every((definition) => definition.constructionDurationMs === 180000), "cinq merveilles de trois minutes sont définies dans un catalogue extensible");
        const bigBerthaDefinition = C.WONDER_TYPES["big-bertha"];
        check(bigBerthaDefinition.siteEffects.fireIntervalMs === 15000 && bigBerthaDefinition.siteEffects.rangeHops === 3 && bigBerthaDefinition.siteEffects.hitChance === 0.75 && bigBerthaDefinition.siteEffects.maximumDamage === 18, "la Grosse Bertha possède sa cadence, sa portée, sa précision et son plafond de dégâts");
        check(C.TECHNOLOGY_BRANCHES.find((branch) => branch.id === "attack").technologyIds.includes("wonder-big-bertha") && C.TECHNOLOGIES["wonder-big-bertha"].prerequisiteId === "attack-4", "l’Artillerie super-lourde offre la Grosse Bertha comme choix final de l’axe Attaque");
        check(new C.Game({ enableAI: false, enableWorldEvents: false }).wonderCaptureActivationDelayMs === 20000, "une merveille capturée attend 20 secondes avant de changer de camp opérationnel");

        const wonderGame = new C.Game({ playerId: 1, activeFactionIds: [1, 2], enableAI: false, enableWorldEvents: false, timeScale: 1, wonderCaptureActivationDelayMs: 2000 });
        wonderGame.newGame(828282);
        const wonderFaction = wonderGame.state.getFaction(1);
        const wonderSite = wonderGame.state.getTerritoriesOwnedBy(1)[0];
        const wonderSupport = wonderSite.neighbors
            .map((territoryId) => wonderGame.state.getTerritory(territoryId))
            .find((territory) => territory && !territory.isImpassable && !wonderSite.isPathBlocked(territory.id));
        wonderSupport.ownerId = 1;
        wonderSupport.units = 8;
        wonderSupport.productionMode = "units";
        wonderSite.units = 12;
        const lockedWonder = wonderGame.executeCommand({ type: "BUILD_WONDER", playerId: 1, territoryId: wonderSite.id, wonderId: "megacity" });
        check(!lockedWonder.ok, "une merveille exige sa recherche ultime");
        wonderFaction.research.completedTechnologyIds.push("wonder-megacity");
        const wonderStarted = wonderGame.executeCommand({ type: "BUILD_WONDER", playerId: 1, territoryId: wonderSite.id, wonderId: "megacity" });
        check(wonderStarted.ok && wonderSite.wonderConstruction?.wonderId === "megacity" && wonderSite.productionMode === "construction", "BUILD_WONDER lance un chantier qui suspend toute production locale");
        const secondWonderSite = wonderGame.state.territories.find((territory) => !territory.isImpassable && territory.id !== wonderSite.id && territory.id !== wonderSupport.id);
        secondWonderSite.ownerId = 1;
        secondWonderSite.units = 10;
        check(!wonderGame.executeCommand({ type: "BUILD_WONDER", playerId: 1, territoryId: secondWonderSite.id, wonderId: "megacity" }).ok, "une nation ne peut pas ouvrir deux chantiers de merveille simultanément");
        wonderGame.updateWonderConstruction(90000);
        const wonderProgressSnapshot = wonderGame.createNetworkSnapshot();
        const remoteWonderGame = new C.Game({ playerId: 2, activeFactionIds: [1, 2], enableAI: false, enableWorldEvents: false, timeScale: 1, wonderCaptureActivationDelayMs: 2000 });
        remoteWonderGame.newGame(828282);
        let remoteWonderStarts = 0;
        let remoteWonderCompletions = 0;
        remoteWonderGame.subscribe((change) => {
            if (change.type === "WONDER_CONSTRUCTION_STARTED") remoteWonderStarts += 1;
            if (change.type === "WONDER_CONSTRUCTION_COMPLETED") remoteWonderCompletions += 1;
        });
        remoteWonderGame.applyNetworkSnapshot(wonderProgressSnapshot);
        remoteWonderGame.applyNetworkSnapshot(wonderProgressSnapshot);
        check(remoteWonderGame.state.getTerritory(wonderSite.id).wonderConstruction?.progressMs === 90000 && remoteWonderStarts === 1, "la progression et l’annonce d’un chantier monumental sont synchronisées une seule fois dans Firebase");
        wonderGame.updateWonderConstruction(90000);
        check(wonderSite.wonderId === "megacity" && !wonderSite.wonderConstruction && wonderFaction.constructedWonderId === "megacity" && wonderFaction.statistics.wondersConstructed === 1, "la Mégapole achevée consomme le choix unique de sa nation");
        const completedWonderSnapshot = wonderGame.createNetworkSnapshot();
        remoteWonderGame.applyNetworkSnapshot(completedWonderSnapshot);
        remoteWonderGame.applyNetworkSnapshot(completedWonderSnapshot);
        check(remoteWonderGame.state.getTerritory(wonderSite.id).wonderId === "megacity" && remoteWonderGame.state.getFaction(1).constructedWonderId === "megacity" && remoteWonderCompletions === 1, "la merveille achevée, son bâtisseur et son quota national sont reproduits une seule fois chez les clients");
        wonderSite.wonderActivationRemainingMs = 1;
        const productionWithoutMegacity = wonderGame.getProductionMultiplier(wonderSupport);
        wonderSite.wonderActivationRemainingMs = 0;
        const productionWithMegacity = wonderGame.getProductionMultiplier(wonderSupport);
        check(productionWithMegacity > productionWithoutMegacity * 1.11 && wonderGame.getFactionFoodState(1).wonderCapacity === 300, "la Mégapole fournit réellement +12 % de recrutement et +300 nourritures");
        secondWonderSite.wonderId = "megacity";
        secondWonderSite.wonderBuilderFactionId = 2;
        secondWonderSite.wonderActivationRemainingMs = 0;
        check(wonderGame.getWonderGlobalEffect(1, "productionMultiplier") === 0.12 && wonderGame.getFactionFoodState(1).wonderCapacity === 600, "deux Mégapoles contrôlées ne doublent pas le bonus global mais conservent leurs capacités alimentaires locales");

        const arsenalSite = wonderGame.state.territories.find((territory) => !territory.isImpassable && ![wonderSite.id, wonderSupport.id, secondWonderSite.id].includes(territory.id));
        arsenalSite.ownerId = 1;
        arsenalSite.units = 8;
        arsenalSite.productionMode = "units";
        arsenalSite.wonderId = "grand-arsenal";
        arsenalSite.wonderBuilderFactionId = 2;
        arsenalSite.wonderActivationRemainingMs = 1;
        const productionWithoutArsenal = wonderGame.getProductionMultiplier(arsenalSite);
        const attackWithoutArsenal = wonderGame.getFactionAttackMultiplier(1);
        arsenalSite.wonderActivationRemainingMs = 0;
        check(wonderGame.getProductionMultiplier(arsenalSite) > productionWithoutArsenal * 1.29 && wonderGame.getFactionAttackMultiplier(1) > attackWithoutArsenal * 1.09, "le Grand Arsenal applique son recrutement local et son attaque globale");

        const citadelTarget = arsenalSite.neighbors
            .map((territoryId) => wonderGame.state.getTerritory(territoryId))
            .find((territory) => territory && !territory.isImpassable && !arsenalSite.isPathBlocked(territory.id));
        citadelTarget.ownerId = 1;
        citadelTarget.wonderId = null;
        citadelTarget.wonderActivationRemainingMs = 0;
        arsenalSite.wonderId = "monumental-citadel";
        arsenalSite.wonderActivationRemainingMs = 1;
        const defenseWithoutCitadel = wonderGame.getDefenseMultiplier(citadelTarget);
        arsenalSite.wonderActivationRemainingMs = 0;
        check(wonderGame.getDefenseMultiplier(citadelTarget) > defenseWithoutCitadel * 1.36, "la Citadelle cumule sa défense nationale et son aura locale sans dupliquer les exemplaires identiques");
        arsenalSite.wonderId = "orbital-station";
        arsenalSite.wonderActivationRemainingMs = 0;
        check(wonderGame.getAbilityCooldownDuration(1, 300000) === 255000, "la Station orbitale réduit les recharges de capacités de 15 %");

        const visionWonderGame = new C.Game({ playerId: 1, activeFactionIds: [1, 2], enableAI: false, enableWorldEvents: false, timeScale: 1 });
        visionWonderGame.newGame(838383);
        visionWonderGame.state.territories.forEach((territory) => {
            if (!territory.isImpassable) territory.ownerId = null;
        });
        const visionStation = visionWonderGame.state.territories.find((territory) => !territory.isImpassable);
        const visionPath = findPathWithMinimumHops(visionWonderGame.state.territories, visionStation.id, 3);
        visionStation.ownerId = 1;
        visionStation.wonderId = "orbital-station";
        visionStation.wonderActivationRemainingMs = 1;
        const hiddenWithoutStation = !visionWonderGame.getTerritoryVisibilityMap(1).has(visionPath[3]);
        visionStation.wonderActivationRemainingMs = 0;
        check(hiddenWithoutStation && visionWonderGame.getTerritoryVisibilityMap(1).has(visionPath[3]), "la Station orbitale étend d’une frontière la vision autour de son territoire");

        const berthaGame = new C.Game({ playerId: 1, activeFactionIds: [1, 2], enableAI: false, enableWorldEvents: false, timeScale: 1 });
        berthaGame.newGame(838484);
        berthaGame.state.territories.forEach((territory) => {
            if (!territory.isImpassable) {
                territory.ownerId = null;
                territory.units = 1;
                territory.isCapital = false;
            }
            territory.wonderId = null;
            territory.wonderConstruction = null;
            territory.wonderActivationRemainingMs = 0;
            territory.wonderActionProgressMs = 0;
            territory.wonderLastAction = null;
        });
        const berthaSource = berthaGame.state.territories.find((territory) => {
            if (territory.isImpassable) return false;
            const distances = getGraphDistances(berthaGame.state.territories, [territory.id]);
            return berthaGame.state.territories.some((candidate) => !candidate.isImpassable && distances.get(candidate.id) === 3);
        });
        const berthaDistances = getGraphDistances(berthaGame.state.territories, [berthaSource.id]);
        const berthaTarget = berthaGame.state.territories.find((territory) => !territory.isImpassable && berthaDistances.get(territory.id) === 3);
        const berthaScout = berthaTarget.neighbors
            .map((territoryId) => berthaGame.state.getTerritory(territoryId))
            .find((territory) => territory && !territory.isImpassable && berthaDistances.get(territory.id) === 2);
        berthaSource.ownerId = 1;
        berthaSource.units = 20;
        berthaSource.isCapital = true;
        berthaSource.wonderId = "big-bertha";
        berthaSource.wonderBuilderFactionId = 1;
        berthaGame.state.getFaction(1).capitalTerritoryId = berthaSource.id;
        berthaTarget.ownerId = 2;
        berthaTarget.units = 100;
        const berthaShots = [];
        berthaGame.subscribe((change) => {
            if (change.type === "BIG_BERTHA_FIRED") berthaShots.push(change);
        });
        berthaGame.state.elapsedMs = 15000;
        berthaSource.wonderActionProgressMs = bigBerthaDefinition.siteEffects.fireIntervalMs;
        berthaGame.random = () => 0.1;
        berthaGame.updateWonderWeapons(1);
        check(berthaTarget.units === 100 && berthaShots.length === 0 && berthaSource.wonderActionProgressMs === 15000, "la Grosse Bertha conserve son obus lorsqu’aucune cible ennemie n’est visible");
        berthaScout.ownerId = 1;
        berthaScout.units = 1;
        berthaGame.updateWonderWeapons(1);
        check(berthaTarget.units === 87 && berthaShots.length === 1 && berthaShots[0].damage === 13 && berthaSource.wonderLastAction?.targetTerritoryId === berthaTarget.id, "un tir réussi de Grosse Bertha inflige 8 pertes plus 5 % de la garnison à trois territoires");
        check(berthaGame.getBigBerthaDamage({ units: 500 }) === 18 && berthaGame.getBigBerthaDamage({ units: 5 }) === 4, "les dégâts de la Bertha sont plafonnés à 18 et préservent toujours le dernier défenseur");

        const berthaSnapshot = berthaGame.createNetworkSnapshot();
        const remoteBerthaGame = new C.Game({ playerId: 2, activeFactionIds: [1, 2], enableAI: false, enableWorldEvents: false, timeScale: 1 });
        remoteBerthaGame.newGame(838484);
        let remoteBerthaShots = 0;
        remoteBerthaGame.subscribe((change) => {
            if (change.type === "BIG_BERTHA_FIRED") remoteBerthaShots += 1;
        });
        remoteBerthaGame.applyNetworkSnapshot(berthaSnapshot);
        remoteBerthaGame.applyNetworkSnapshot(berthaSnapshot);
        check(remoteBerthaGame.state.getTerritory(berthaSource.id).wonderLastAction?.damage === 13 && remoteBerthaShots === 1, "le tir de la Bertha et son animation sont reproduits une seule fois chez les clients Firebase");
        remoteBerthaGame.updateRemotePresentation(250);
        check(remoteBerthaGame.state.getTerritory(berthaSource.id).wonderActionProgressMs === 250, "le client multijoueur anime localement la recharge de la Bertha entre deux instantanés");

        berthaTarget.units = 100;
        berthaSource.wonderActionProgressMs = 15000;
        berthaGame.random = () => 0.9;
        berthaGame.updateWonderWeapons(1);
        check(berthaTarget.units === 100 && berthaShots.length === 2 && !berthaShots[1].hit, "les 25 % de tirs manqués de la Grosse Bertha ne causent aucun dégât");
        berthaTarget.units = 1;
        berthaSource.wonderActionProgressMs = 15000;
        berthaGame.updateWonderWeapons(1);
        check(berthaTarget.units === 1 && berthaShots.length === 2 && berthaSource.wonderActionProgressMs === 15000, "la Grosse Bertha ne tire pas sur le dernier défenseur et ne conquiert jamais à distance");

        const berthaCannon = berthaGame.state.territories.find((territory) => territory.installation?.type === "cannon");
        berthaCannon.ownerId = 1;
        berthaCannon.installationProgressMs = 0;
        berthaGame.updateInstallations(1000);
        check(berthaCannon.installationProgressMs === 1150, "contrôler la Grosse Bertha accélère les canons ordinaires de 15 %");
        berthaCannon.ownerId = null;
        berthaTarget.units = 500;
        berthaScout.ownerId = null;
        berthaSource.wonderId = "orbital-station";
        check(berthaGame.aiSystem.chooseWonder(berthaGame.state.getFaction(1), [berthaSource], Object.values(C.WONDER_TYPES))?.id === "big-bertha", "l’IA privilégie la Grosse Bertha lorsqu’une très grande concentration ennemie est visible à distance");
        const aiBerthaPlacementGame = new C.Game({ playerId: 1, activeFactionIds: [1, 2], enableAI: false, enableWorldEvents: false, timeScale: 1 });
        aiBerthaPlacementGame.newGame(838485);
        aiBerthaPlacementGame.state.territories.filter((territory) => !territory.isImpassable).forEach((territory) => {
            territory.ownerId = 2;
            territory.units = 8;
            territory.productionMode = "units";
            territory.isCapital = false;
        });
        const aiBerthaFaction = aiBerthaPlacementGame.state.getFaction(2);
        const aiBerthaCapital = aiBerthaPlacementGame.state.getTerritoriesOwnedBy(2)[0];
        aiBerthaCapital.isCapital = true;
        aiBerthaFaction.capitalTerritoryId = aiBerthaCapital.id;
        aiBerthaFaction.research.completedTechnologyIds.push("wonder-big-bertha");
        const aiBerthaBuilt = aiBerthaPlacementGame.aiSystem.manageWonderConstruction(aiBerthaFaction, aiBerthaPlacementGame.state.getTerritoriesOwnedBy(2));
        const aiBerthaSite = aiBerthaPlacementGame.state.territories.find((territory) => territory.wonderConstruction?.wonderId === "big-bertha");
        check(aiBerthaBuilt && aiBerthaSite && aiBerthaSite.units >= 8, "l’IA sait choisir un emplacement sûr et ouvrir le chantier de sa Grosse Bertha");
        berthaSource.wonderId = "big-bertha";
        berthaSource.wonderActionProgressMs = 9000;
        berthaSource.wonderLastAction = { type: "big-bertha", targetTerritoryId: berthaTarget.id, hit: true, damage: 18, firedAtMs: 40000 };
        berthaSource.ownerId = 2;
        berthaGame.handleWonderOwnershipChange(berthaSource, 1, 2);
        check(berthaSource.wonderActionProgressMs === 0 && !berthaSource.wonderLastAction && berthaSource.wonderActivationRemainingMs === 20000, "capturer la Grosse Bertha annule sa recharge et impose la réactivation normale de 20 secondes");

        wonderGame.random = () => 0.5;
        wonderSite.wonderId = "megacity";
        wonderSite.wonderActivationRemainingMs = 0;
        wonderSite.units = 1;
        const wonderCaptor = wonderSite.neighbors
            .map((territoryId) => wonderGame.state.getTerritory(territoryId))
            .find((territory) => territory && !territory.isImpassable && !wonderSite.isPathBlocked(territory.id));
        wonderCaptor.ownerId = 2;
        wonderCaptor.units = 500;
        const wonderCaptureAttack = wonderGame.executeCommand({ type: "SEND_ARMY", playerId: 2, fromTerritoryId: wonderCaptor.id, toTerritoryId: wonderSite.id, units: 400 });
        wonderGame.resolveArmyArrival(wonderCaptureAttack.army);
        check(wonderCaptureAttack.ok && wonderSite.ownerId === 2 && wonderSite.wonderId === "megacity" && wonderSite.wonderActivationRemainingMs === 2000, "une merveille achevée survit à la capture et respecte le délai de réactivation configuré");
        wonderGame.updateWonderActivation(2000);
        check(wonderGame.isWonderActive(wonderSite) && wonderFaction.constructedWonderId === "megacity" && wonderGame.state.getFaction(2).statistics.wondersCaptured === 1, "la merveille capturée s’active pour son nouveau propriétaire sans rendre le choix au bâtisseur");
        const captorFaction = wonderGame.state.getFaction(2);
        captorFaction.research.completedTechnologyIds.push("wonder-grand-arsenal");
        const captorOwnWonder = wonderGame.executeCommand({ type: "BUILD_WONDER", playerId: 2, territoryId: wonderCaptor.id, wonderId: "grand-arsenal" });
        check(captorOwnWonder.ok, "contrôler une merveille capturée n’empêche pas une nation de construire son propre choix");
        wonderCaptor.ownerId = 1;
        wonderGame.updateWonderConstruction(1);
        check(!wonderCaptor.wonderConstruction && !captorFaction.constructedWonderId, "la capture d’un chantier inachevé l’annule sans consommer le choix du bâtisseur");

        const aiWonderGame = new C.Game({ playerId: 1, activeFactionIds: [1, 2], enableAI: false, enableWorldEvents: false, timeScale: 1 });
        aiWonderGame.newGame(848484);
        const aiWonderFaction = aiWonderGame.state.getFaction(2);
        aiWonderGame.state.territories.filter((territory) => !territory.isImpassable).forEach((territory) => {
            territory.ownerId = 2;
            territory.units = 8;
            territory.productionMode = "units";
            territory.isCapital = false;
        });
        const aiWonderCapital = aiWonderGame.state.territories.find((territory) => !territory.isImpassable);
        aiWonderCapital.isCapital = true;
        aiWonderFaction.capitalTerritoryId = aiWonderCapital.id;
        aiWonderGame.state.getTerritoriesOwnedBy(2).forEach((territory) => { territory.units = 40; });
        check(aiWonderGame.aiSystem.chooseWonder(aiWonderFaction, aiWonderGame.state.getTerritoriesOwnedBy(2), Object.values(C.WONDER_TYPES))?.id === "megacity", "l’IA privilégie la Mégapole lorsqu’une armée trop vaste menace sa capacité alimentaire");
        aiWonderGame.state.getTerritoriesOwnedBy(2).forEach((territory) => { territory.units = 8; });
        aiWonderFaction.research.completedTechnologyIds.push("wonder-megacity");
        check(aiWonderGame.aiSystem.manageWonderConstruction(aiWonderFaction, aiWonderGame.state.getTerritoriesOwnedBy(2)) && aiWonderGame.state.territories.some((territory) => territory.wonderConstruction?.builderFactionId === 2), "l’IA choisit un emplacement sûr et lance sa merveille débloquée");

        const pressuredWonderGame = new C.Game({ playerId: 1, activeFactionIds: [1, 2], enableAI: false, enableWorldEvents: false, timeScale: 1 });
        pressuredWonderGame.newGame(858586);
        pressuredWonderGame.state.territories.forEach((territory) => {
            if (!territory.isImpassable) territory.ownerId = null;
            territory.isCapital = false;
        });
        const pressuredFaction = pressuredWonderGame.state.getFaction(2);
        const pressuredBorder = pressuredWonderGame.state.territories.find((territory) => !territory.isImpassable && territory.neighbors.some((territoryId) => {
            const neighbor = pressuredWonderGame.state.getTerritory(territoryId);
            return neighbor && !neighbor.isImpassable && !territory.isPathBlocked(neighbor.id);
        }));
        const pressuredEnemy = pressuredBorder.neighbors
            .map((territoryId) => pressuredWonderGame.state.getTerritory(territoryId))
            .find((territory) => territory && !territory.isImpassable && !pressuredBorder.isPathBlocked(territory.id));
        pressuredBorder.ownerId = 2;
        pressuredBorder.units = 10;
        pressuredBorder.isCapital = true;
        pressuredFaction.capitalTerritoryId = pressuredBorder.id;
        pressuredEnemy.ownerId = 1;
        pressuredEnemy.units = 200;
        check(pressuredWonderGame.aiSystem.chooseWonder(pressuredFaction, [pressuredBorder], Object.values(C.WONDER_TYPES))?.id === "monumental-citadel", "l’IA privilégie la Citadelle lorsqu’une frontière subit une pression militaire extrême");
        check(typeof C.UIController.prototype.renderWonderPanel === "function" && typeof C.MapRenderer.prototype.drawWonderMarkers === "function" && typeof C.MiniMapRenderer.prototype.drawWonderMarkers === "function", "l’interface principale et la mini-carte exposent un rendu dédié aux merveilles");
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
        researchFaction.research.completedTechnologyIds.push("construction-agriculture");
        const researchedFoodTerritory = researchGame.state.territories.find((territory) => !territory.isImpassable && !territory.isCapital);
        researchedFoodTerritory.ownerId = 1;
        researchedFoodTerritory.productionMode = "units";
        check(researchGame.getTerritoryPassiveFoodCapacity(researchedFoodTerritory) === 20, "Agriculture intensive fait passer la nourriture passive de 10 à 20 par territoire");
        check(Boolean(researchGame.state.toJSON().factions[0].research.completedTechnologyIds.length), "l’état technologique est inclus dans la sérialisation multijoueur");

        const abilityTarget = researchTerritory.neighbors.map((id) => researchGame.state.getTerritory(id)).find((territory) => territory && !territory.isImpassable);
        abilityTarget.ownerId = 2;
        abilityTarget.units = 100;
        abilityTarget.productionMode = "food";
        abilityTarget.installation = null;
        researchFaction.research.completedTechnologyIds.push("ability-missile", "ability-reinforcement", "ability-paratrooper", "ability-nuclear");
        const missileLaunch = researchGame.executeCommand({ type: "USE_ABILITY", playerId: 1, abilityId: "missile", targetTerritoryId: abilityTarget.id });
        check(missileLaunch.ok && researchGame.state.abilityActions.length === 1 && abilityTarget.units === 100, "le missile crée une alerte différée de cinq secondes");
        for (let tick = 0; tick < 5; tick += 1) researchGame.update(1000);
        check(abilityTarget.units === 75 && researchGame.state.abilityActions.length === 0, "le missile retire 25 % des forces à l’impact");
        abilityTarget.units = 500;
        researchFaction.abilityCooldowns.missile = 0;
        researchGame.executeCommand({ type: "USE_ABILITY", playerId: 1, abilityId: "missile", targetTerritoryId: abilityTarget.id });
        for (let tick = 0; tick < 5; tick += 1) researchGame.update(1000);
        check(abilityTarget.units === 460, "les dommages du missile sont plafonnés à 40 unités");
        abilityTarget.units = 100;
        abilityTarget.productionMode = "food";
        researchTerritory.units = 80;
        researchTerritory.productionMode = "food";
        const nuclearSplashTarget = abilityTarget.neighbors
            .map((id) => researchGame.state.getTerritory(id))
            .find((territory) => territory && !territory.isImpassable && territory.id !== researchTerritory.id);
        nuclearSplashTarget.ownerId = 2;
        nuclearSplashTarget.units = 40;
        nuclearSplashTarget.productionMode = "food";
        const nuclearLaunch = researchGame.executeCommand({ type: "USE_ABILITY", playerId: 1, abilityId: "nuclear", targetTerritoryId: abilityTarget.id });
        check(nuclearLaunch.ok && researchGame.state.abilityActions.some((action) => action.abilityId === "nuclear"), "la bombe nucléaire crée une alerte différée de huit secondes");
        for (let tick = 0; tick < 8; tick += 1) researchGame.update(1000);
        const resolvedNuclearAction = researchGame.state.abilityActions.find((action) => action.abilityId === "nuclear");
        check(abilityTarget.units === 70, "la bombe nucléaire retire 30 % des forces au centre de l’impact");
        check(researchTerritory.units === 68 && nuclearSplashTarget.units === 34, "le souffle retire 15 % aux territoires voisins, y compris aux forces alliées");
        check(Boolean(resolvedNuclearAction?.resolvedAtMs && resolvedNuclearAction.impacts.length >= 3), "la phase d’impact nucléaire reste sérialisée pour son animation multijoueur");
        for (let tick = 0; tick < 4; tick += 1) researchGame.update(1000);
        check(!researchGame.state.abilityActions.some((action) => action.abilityId === "nuclear"), "l’effet nucléaire est retiré après la fin de l’animation");
        const unitsBeforeMobilization = researchTerritory.units;
        const mobilization = researchGame.executeCommand({ type: "USE_ABILITY", playerId: 1, abilityId: "reinforcement", targetTerritoryId: researchTerritory.id });
        check(mobilization.ok && researchTerritory.units === unitsBeforeMobilization + 35, "la mobilisation d’urgence ajoute 35 unités sur un territoire contrôlé");
        abilityTarget.ownerId = 2;
        abilityTarget.units = 10;
        abilityTarget.terrain = "plain";
        abilityTarget.rareSite = null;
        abilityTarget.installation = null;
        abilityTarget.isCapital = false;
        const foodDemandBeforeParatroopers = researchGame.getFactionFoodState(1).demand;
        const paratrooperLaunch = researchGame.executeCommand({ type: "USE_ABILITY", playerId: 1, abilityId: "paratrooper", targetTerritoryId: abilityTarget.id });
        check(paratrooperLaunch.ok && paratrooperLaunch.army.units === 35 && paratrooperLaunch.army.logisticsPurpose === "paratrooper", "la capacité Parachutistes crée une force aéroportée de 35 unités sans route terrestre");
        check(researchGame.getFactionFoodState(1).demand === foodDemandBeforeParatroopers + 35, "les parachutistes en vol consomment immédiatement la nourriture de leur faction");
        const abilitySnapshot = researchGame.createNetworkSnapshot();
        check(abilitySnapshot.factions[0].abilityCooldowns.missile > 0 && abilitySnapshot.factions[0].abilityCooldowns.reinforcement > 0 && abilitySnapshot.factions[0].abilityCooldowns.paratrooper > 0 && abilitySnapshot.factions[0].abilityCooldowns.nuclear > 0, "les recharges de capacités sont incluses dans l’instantané multijoueur");
        check(abilitySnapshot.armies.some((army) => army.logisticsPurpose === "paratrooper"), "le largage en cours est inclus dans l’instantané Firebase");
        for (let tick = 0; tick < 7; tick += 1) researchGame.update(1000);
        check(abilityTarget.ownerId === 1 && abilityTarget.units > 0 && !researchGame.state.armies.some((army) => army.logisticsPurpose === "paratrooper"), "les parachutistes combattent à l’arrivée et capturent une cible insuffisamment défendue");

        const upgradedAbilityGame = new C.Game({ playerId: 1, activeFactionIds: [1, 2], enableAI: false, enableWorldEvents: false, timeScale: 1 });
        upgradedAbilityGame.newGame(818182);
        const upgradedFaction = upgradedAbilityGame.state.getFaction(1);
        upgradedFaction.research.completedTechnologyIds.push("ability-missile");
        const secondAbilityResearch = upgradedAbilityGame.executeCommand({ type: "START_RESEARCH", playerId: 1, technologyId: "ability-missile-2" });
        check(secondAbilityResearch.ok && upgradedFaction.research.activeTechnologyId === "ability-missile-2", "une capacité déjà débloquée peut être recherchée une seconde fois");
        upgradedFaction.research.activeTechnologyId = null;
        upgradedFaction.research.progressMs = 0;
        upgradedFaction.research.completedTechnologyIds.push(
            "ability-missile-2",
            "ability-reinforcement", "ability-reinforcement-2",
            "ability-paratrooper", "ability-paratrooper-2",
            "ability-nuclear", "ability-nuclear-2"
        );
        const upgradedHome = upgradedAbilityGame.state.getTerritoriesOwnedBy(1)[0];
        const upgradedTarget = upgradedHome.neighbors
            .map((id) => upgradedAbilityGame.state.getTerritory(id))
            .find((territory) => territory && !territory.isImpassable);
        upgradedTarget.ownerId = 2;
        upgradedTarget.units = 100;
        upgradedTarget.terrain = "plain";
        upgradedTarget.productionMode = "food";
        upgradedTarget.isCapital = false;
        const upgradedMissile = upgradedAbilityGame.executeCommand({ type: "USE_ABILITY", playerId: 1, abilityId: "missile", targetTerritoryId: upgradedTarget.id });
        check(upgradedMissile.ok && upgradedMissile.action.abilityLevel === 2 && upgradedMissile.action.damageRatio === 0.35 && upgradedMissile.action.maximumDamage === 60, "Missile tactique II mémorise 35 % de dégâts et un plafond de 60 dans la frappe");
        for (let tick = 0; tick < 5; tick += 1) upgradedAbilityGame.update(1000);
        check(upgradedTarget.units === 65, "Missile tactique II applique réellement 35 % de dégâts à l’impact");
        const upgradedHomeUnits = upgradedHome.units;
        const upgradedReinforcement = upgradedAbilityGame.executeCommand({ type: "USE_ABILITY", playerId: 1, abilityId: "reinforcement", targetTerritoryId: upgradedHome.id });
        check(upgradedReinforcement.ok && upgradedReinforcement.units === 50 && upgradedHome.units === upgradedHomeUnits + 50, "Mobilisation d’urgence II fournit 50 unités");
        const upgradedParatroopers = upgradedAbilityGame.executeCommand({ type: "USE_ABILITY", playerId: 1, abilityId: "paratrooper", targetTerritoryId: upgradedTarget.id });
        check(upgradedParatroopers.ok && upgradedParatroopers.army.units === 50, "Parachutistes II largue une force de 50 unités");
        const upgradedNuclear = upgradedAbilityGame.executeCommand({ type: "USE_ABILITY", playerId: 1, abilityId: "nuclear", targetTerritoryId: upgradedTarget.id });
        check(upgradedNuclear.ok && upgradedNuclear.action.centerDamageRatio === 0.40 && upgradedNuclear.action.adjacentDamageRatio === 0.20, "Arme nucléaire II mémorise un souffle de 40 % au centre et 20 % autour");
        const upgradedAbilitySnapshot = upgradedAbilityGame.createNetworkSnapshot();
        check(upgradedAbilitySnapshot.factions[0].research.completedTechnologyIds.includes("ability-nuclear-2") && upgradedAbilitySnapshot.abilityActions.some((action) => action.abilityLevel === 2), "les améliorations et les frappes de niveau II sont incluses dans l’instantané Firebase");
        const remoteAbilityGame = new C.Game({ playerId: 2, activeFactionIds: [1, 2], enableAI: false, enableWorldEvents: false, timeScale: 1 });
        remoteAbilityGame.newGame(818182);
        let remoteNuclearLaunches = 0;
        remoteAbilityGame.subscribe((change) => {
            if (change.type === "ABILITY_LAUNCHED" && change.abilityId === "nuclear") remoteNuclearLaunches += 1;
        });
        remoteAbilityGame.applyNetworkSnapshot(upgradedAbilitySnapshot);
        const firstRemoteSnapshotAnnouncedNuclear = remoteNuclearLaunches === 1;
        remoteAbilityGame.applyNetworkSnapshot(upgradedAbilitySnapshot);
        check(firstRemoteSnapshotAnnouncedNuclear && remoteNuclearLaunches === 1, "un client Firebase reçoit le lancement nucléaire une seule fois, même si l’instantané est répété");
        const upgradedAiFaction = upgradedAbilityGame.state.getFaction(2);
        upgradedAiFaction.research.completedTechnologyIds = Object.keys(C.TECHNOLOGIES).filter((technologyId) =>
            !(technologyId.startsWith("ability-") && technologyId.endsWith("-2")));
        check(upgradedAbilityGame.aiSystem.chooseResearch(upgradedAiFaction) && upgradedAiFaction.research.activeTechnologyId.endsWith("-2"), "l’IA sélectionne aussi une seconde recherche de capacité lorsqu’elle devient disponible");

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
        const noteCountBeforeTerritoryLoss = startedNotes.length;
        check(audioManager.playTerritoryLost() && startedNotes.length === noteCountBeforeTerritoryLoss + 3, "la perte d’un territoire déclenche une alerte descendante de trois notes");
        const noteCountBeforeBigBertha = startedNotes.length;
        check(audioManager.playBigBertha() && startedNotes.length === noteCountBeforeBigBertha + 3, "le tir de la Grosse Bertha déclenche un grondement synthétique de trois notes graves");
        let nuclearSoundSource = "";
        let nuclearSoundPlayCount = 0;
        const fakeNuclearSound = {
            currentTime: 12,
            preload: "none",
            volume: 1,
            play: () => { nuclearSoundPlayCount += 1; }
        };
        const nuclearAudioManager = new C.AudioManager({
            effectMediaFactory: (source) => {
                nuclearSoundSource = source;
                return fakeNuclearSound;
            },
            contextFactory: () => fakeAudioContext
        });
        check(nuclearAudioManager.playNuclearLaunch() && nuclearSoundSource === "Son/Nuclear.mp3" && nuclearSoundPlayCount === 1 && fakeNuclearSound.currentTime === 0 && fakeNuclearSound.preload === "auto", "le lancement nucléaire joue Nuclear.mp3 depuis le début");
        let loadedMusicSource = "";
        let musicPlayCount = 0;
        let musicLoadCount = 0;
        const musicListeners = {};
        const fakeMusic = {
            src: "",
            loop: false,
            preload: "none",
            volume: 1,
            play: () => { musicPlayCount += 1; },
            load: () => { musicLoadCount += 1; },
            addEventListener: (type, handler) => { musicListeners[type] = handler; }
        };
        const musicAudioManager = new C.AudioManager({
            mediaFactory: (source) => {
                loadedMusicSource = source;
                return fakeMusic;
            },
            contextFactory: () => fakeAudioContext
        });
        check(musicAudioManager.startBackgroundMusic() && loadedMusicSource === "Musique/Music1.mp3" && !fakeMusic.loop && fakeMusic.preload === "auto" && musicPlayCount === 1, "la playlist musicale démarre avec Music1.mp3 et un préchargement adapté au jeu");
        musicListeners.ended();
        check(fakeMusic.src === "Musique/Music2.mp3" && musicAudioManager.musicTrackIndex === 1 && musicLoadCount === 1 && musicPlayCount === 2, "Music2.mp3 succède automatiquement à Music1.mp3");
        musicListeners.ended();
        musicListeners.ended();
        musicListeners.ended();
        check(fakeMusic.src === "Musique/Music5.mp3" && musicAudioManager.musicTrackIndex === 4, "Music5.mp3 est inclus après les quatre morceaux existants");
        musicListeners.ended();
        check(fakeMusic.src === "Musique/Music6.mp3" && musicAudioManager.musicTrackIndex === 5, "Music6.mp3 suit automatiquement Music5.mp3");
        musicListeners.ended();
        check(fakeMusic.src === "Musique/Music1.mp3" && musicAudioManager.musicTrackIndex === 0 && musicPlayCount === 7, "la playlist recommence après Music6.mp3");
        musicAudioManager.duckBackgroundMusic();
        check(fakeMusic.volume < musicAudioManager.backgroundMusicVolume, "la musique baisse temporairement pendant le carillon de recherche");
        clearTimeout(musicAudioManager.musicRestoreTimer);
        let nuclearLaunchSounds = 0;
        let nuclearLaunchPulses = 0;
        const nuclearLaunchUiStub = {
            game: { playerId: 1 },
            renderer: { pulseTerritory: () => { nuclearLaunchPulses += 1; } },
            audio: { playNuclearLaunch: () => { nuclearLaunchSounds += 1; } },
            refreshDynamic: () => {},
            showToast: () => {}
        };
        C.UIController.prototype.handleGameChange.call(nuclearLaunchUiStub, {
            type: "ABILITY_LAUNCHED",
            abilityId: "nuclear",
            factionId: 2,
            targetTerritoryId: 14
        });
        C.UIController.prototype.handleGameChange.call(nuclearLaunchUiStub, {
            type: "ABILITY_LAUNCHED",
            abilityId: "missile",
            factionId: 2,
            targetTerritoryId: 15
        });
        check(nuclearLaunchSounds === 1 && nuclearLaunchPulses === 2, "la bombe nucléaire joue son alerte pour tous les joueurs, même lorsqu’un adversaire la lance");
        let berthaSounds = 0;
        let berthaAnimations = 0;
        let berthaToast = "";
        const berthaUiStub = {
            game: {
                playerId: 1,
                isTerritoryVisible: () => true,
                state: { getTerritory: () => ({ id: 42, ownerId: 1, name: "Val d’Onyx" }) }
            },
            renderer: {
                fireBigBertha: () => { berthaAnimations += 1; },
                pulseTerritory: () => {}
            },
            audio: { playBigBertha: () => { berthaSounds += 1; } },
            refreshDynamic: () => {},
            showToast: (message) => { berthaToast = message; }
        };
        C.UIController.prototype.handleGameChange.call(berthaUiStub, {
            type: "BIG_BERTHA_FIRED",
            fromTerritoryId: 10,
            targetTerritoryId: 42,
            hit: true,
            damage: 13
        });
        check(berthaSounds === 1 && berthaAnimations === 1 && /BOUM/.test(berthaToast), "un impact de Grosse Bertha visible anime l’obus, joue son grondement et avertit sa victime");
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
        let territoryLossSounds = 0;
        let territoryLossToast = "";
        const territoryLossUiStub = {
            game: {
                playerId: 1,
                state: {
                    getFaction: () => null,
                    getTerritory: () => ({ name: "Val d’Onyx" })
                }
            },
            renderer: { pulseTerritory: () => {} },
            audio: { playTerritoryLost: () => { territoryLossSounds += 1; } },
            refreshDynamic: () => {},
            showToast: (message) => { territoryLossToast = message; }
        };
        C.UIController.prototype.handleGameChange.call(territoryLossUiStub, {
            type: "TERRITORY_CAPTURED",
            territoryId: 12,
            previousOwnerId: 1,
            ownerId: 2
        });
        C.UIController.prototype.handleGameChange.call(territoryLossUiStub, {
            type: "TERRITORY_CAPTURED",
            territoryId: 13,
            previousOwnerId: 2,
            ownerId: 3
        });
        check(territoryLossSounds === 1 && territoryLossToast.includes("Val d’Onyx"), "seule la perte d’un territoire humain joue l’alerte et nomme la position perdue");

        check(territoryLossUiStub.lastLostTerritoryId === 12, "la derniere perte humaine est memorisee pour le raccourci de camera");

        let lossFocusId = null;
        let lossFocusZoom = null;
        let lossPulse = null;
        let lossPrevented = false;
        let lossZoomRendered = 0;
        const spaceLossUiStub = {
            lastLostTerritoryId: 12,
            game: {
                state: {
                    getTerritory: (territoryId) => territoryId === 12 ? { id: 12, name: "Val d'Onyx" } : null
                }
            },
            renderer: {
                zoom: 0.5,
                focusTerritory: (territoryId, zoom) => {
                    lossFocusId = territoryId;
                    lossFocusZoom = zoom;
                },
                pulseTerritory: (territoryId, color, force) => {
                    lossPulse = { territoryId, color, force };
                }
            },
            elements: { researchScreen: { hidden: true } },
            closeResearchScreen: () => {},
            renderZoomLevel: () => { lossZoomRendered += 1; },
            showToast: () => {},
            focusLastLostTerritory: C.UIController.prototype.focusLastLostTerritory
        };
        C.UIController.prototype.handleGlobalKeydown.call(spaceLossUiStub, {
            code: "Space",
            key: " ",
            target: { tagName: "BODY", isContentEditable: false },
            preventDefault: () => { lossPrevented = true; }
        });
        check(lossPrevented && lossFocusId === 12 && lossFocusZoom >= 0.78 && lossPulse?.territoryId === 12 && lossPulse.force === true && lossZoomRendered === 1, "Espace centre la camera et signale la derniere perte, meme sous le brouillard");
        let escapeClears = 0;
        let escapePrevented = false;
        const escapeSelectionUiStub = {
            elements: { researchScreen: { hidden: true } },
            selectedTerritoryId: 12,
            targetTerritoryId: 13,
            multiSelectedTerritoryIds: new Set(),
            targetingAbilityId: null,
            airstrikeSourceId: null,
            clearSelection() {
                this.selectedTerritoryId = null;
                this.targetTerritoryId = null;
                escapeClears += 1;
            }
        };
        C.UIController.prototype.handleGlobalKeydown.call(escapeSelectionUiStub, {
            code: "Escape",
            key: "Escape",
            target: { tagName: "BODY", isContentEditable: false },
            preventDefault: () => { escapePrevented = true; }
        });
        check(escapeClears === 1 && escapePrevented && escapeSelectionUiStub.selectedTerritoryId === null && escapeSelectionUiStub.targetTerritoryId === null, "Échap désélectionne également l'origine et la cible");
        lossFocusId = null;
        lossPrevented = false;
        C.UIController.prototype.handleGlobalKeydown.call(spaceLossUiStub, {
            code: "Space",
            key: " ",
            target: { tagName: "INPUT", isContentEditable: false },
            preventDefault: () => { lossPrevented = true; }
        });
        check(lossFocusId === null && !lossPrevented, "Espace conserve son comportement normal pendant la saisie dans un champ");

        const aiGame = new C.Game({ playerId: 1, enableAI: true, timeScale: 1 });
        aiGame.newGame(707070);
        for (let tick = 0; tick < 24; tick += 1) aiGame.update(1000);
        check(aiGame.aiSystem.ordersIssued > 0, "les factions contrôlées par l’ordinateur prennent des décisions");
        check(aiGame.aiSystem.getMaximumTacticalArmies(6) === 2 && aiGame.aiSystem.getMaximumTacticalArmies(15) === 5 && aiGame.aiSystem.getMaximumTacticalArmies(30) === 8, "la capacité tactique de l’IA progresse avec son empire jusqu’à huit armées simultanées");
        check(aiGame.aiSystem.researchChoicesMade > 0 && aiGame.state.factions.filter((faction) => faction.id !== 1).every((faction) => faction.research.activeTechnologyId || faction.research.completedTechnologyIds.length), "chaque IA choisit et fait progresser sa propre recherche");
        check(aiGame.state.events.some((event) => /Technocrates|Horde|Nomades/.test(event.message) && /attaque|renforce/.test(event.message)), "les ordres de l’ordinateur apparaissent dans le journal tactique");

        const expansionGame = new C.Game({ playerId: 1, activeFactionIds: [1, 2], mapType: "hourglass", enableAI: false, enableWorldEvents: false, timeScale: 1 });
        expansionGame.newGame(717171);
        const expansionFaction = expansionGame.state.getFaction(2);
        const expansionSource = expansionGame.state.getTerritoriesOwnedBy(2)[0];
        const expansionTarget = expansionSource.neighbors
            .map((id) => expansionGame.state.getTerritory(id))
            .find((territory) => territory && !territory.isImpassable && !expansionSource.isPathBlocked(territory.id));
        expansionSource.units = 55;
        expansionSource.neighbors
            .map((id) => expansionGame.state.getTerritory(id))
            .filter((territory) => territory && !territory.isImpassable)
            .forEach((territory) => { territory.ownerId = 1; });
        expansionTarget.ownerId = null;
        expansionTarget.units = 10;
        const occupiedDestination = expansionGame.state.getTerritoriesOwnedBy(1)[0];
        for (let index = 0; index < 4; index += 1) {
            expansionGame.state.armies.push(new C.Army({
                id: expansionGame.state.nextArmyId++,
                ownerId: 2,
                fromTerritoryId: expansionSource.id,
                toTerritoryId: occupiedDestination.id,
                finalTerritoryId: occupiedDestination.id,
                units: 1,
                durationMs: 60000,
                start: expansionSource.center,
                end: occupiedDestination.center
            }));
        }
        expansionGame.aiSystem.manageFoodSupply = () => false;
        expansionGame.aiSystem.launchDecisiveAttack = () => false;
        expansionGame.aiSystem.offensivePlans.set(2, { expiresAt: expansionGame.state.elapsedMs + 90000 });
        const opportunisticExpansion = expansionGame.aiSystem.think(2);
        const neutralExpansionArmy = expansionGame.state.armies.find((army) => army.ownerId === 2 && army.toTerritoryId === expansionTarget.id);
        check(opportunisticExpansion && neutralExpansionArmy && expansionSource.units < 55, "l’IA attaque immédiatement un territoire neutre de 10 unités depuis une garnison de 55");
        check(expansionGame.state.armies.length === 5 && expansionGame.aiSystem.opportunisticExpansionsLaunched === 1, "la conquête opportuniste possède son propre créneau malgré quatre armées et un plan offensif actifs");

        const decisiveGame = new C.Game({ playerId: 1, activeFactionIds: [1, 2], mapType: "hourglass", enableAI: false, enableWorldEvents: false, timeScale: 1 });
        decisiveGame.newGame(727272);
        const decisiveState = decisiveGame.state;
        const decisiveSource = decisiveState.territories.find((territory) =>
            !territory.isImpassable && territory.neighbors
                .map((id) => decisiveState.getTerritory(id))
                .filter((neighbor) => neighbor && !neighbor.isImpassable && !territory.isPathBlocked(neighbor.id)).length >= 3);
        const decisiveNeighbors = decisiveSource.neighbors
            .map((id) => decisiveState.getTerritory(id))
            .filter((neighbor) => neighbor && !neighbor.isImpassable && !decisiveSource.isPathBlocked(neighbor.id));
        const decisiveTarget = decisiveNeighbors[0];
        const decisiveSupporters = decisiveNeighbors.slice(1, 3);
        decisiveState.territories.filter((territory) => !territory.isImpassable).forEach((territory) => {
            territory.ownerId = 1;
            territory.units = 1000;
            territory.isCapital = false;
        });
        decisiveSource.ownerId = 2;
        decisiveSource.units = 93;
        decisiveSource.isCapital = true;
        decisiveState.getFaction(2).capitalTerritoryId = decisiveSource.id;
        decisiveTarget.ownerId = 1;
        decisiveTarget.units = 51;
        decisiveTarget.terrain = "plain";
        decisiveTarget.rareSite = null;
        decisiveSupporters[0].ownerId = 2;
        decisiveSupporters[0].units = 33;
        decisiveSupporters[1].ownerId = 2;
        decisiveSupporters[1].units = 32;
        decisiveGame.aiSystem.offensivePlans.set(2, { expiresAt: decisiveState.elapsedMs + 90000 });
        const decisiveDecision = decisiveGame.aiSystem.think(2);
        const decisiveArmy = decisiveState.armies.find((army) =>
            army.ownerId === 2 && !army.isConvoy && army.fromTerritoryId === decisiveSource.id && army.toTerritoryId === decisiveTarget.id);
        check(Boolean(decisiveDecision && decisiveArmy && decisiveArmy.units >= 68), "une garnison de 93 attaque immediatement une cible ennemie de 51 malgre un autre plan offensif actif");
        check(decisiveGame.aiSystem.decisiveAttacksLaunched === 1, "l'attaque locale decisive passe avant la nourriture, les capacites et la logistique");

        const abilityAiFaction = aiGame.state.getFaction(2);
        const abilityAiSource = aiGame.state.getTerritoriesOwnedBy(2)[0];
        const abilityAiTarget = abilityAiSource.neighbors.map((id) => aiGame.state.getTerritory(id)).find((territory) => territory && !territory.isImpassable);
        abilityAiTarget.ownerId = 1;
        abilityAiTarget.units = 80;
        abilityAiFaction.research.completedTechnologyIds.push("ability-missile");
        abilityAiFaction.abilityCooldowns.missile = 0;
        const abilityAiDecision = aiGame.aiSystem.considerAbilities(abilityAiFaction, aiGame.state.getTerritoriesOwnedBy(2));
        check(abilityAiDecision && aiGame.state.abilityActions.some((action) => action.factionId === 2 && action.targetTerritoryId === abilityAiTarget.id), "l’IA utilise son missile contre une concentration ennemie visible");
        abilityAiFaction.research.completedTechnologyIds.push("ability-nuclear");
        abilityAiFaction.abilityCooldowns.nuclear = 0;
        abilityAiTarget.units = 100;
        abilityAiTarget.neighbors
            .map((id) => aiGame.state.getTerritory(id))
            .filter((territory) => territory && !territory.isImpassable && territory.id !== abilityAiSource.id)
            .forEach((territory) => { territory.ownerId = 1; territory.units = 60; });
        const nuclearAiDecision = aiGame.aiSystem.considerAbilities(abilityAiFaction, aiGame.state.getTerritoriesOwnedBy(2));
        check(nuclearAiDecision && aiGame.state.abilityActions.some((action) => action.abilityId === "nuclear" && action.factionId === 2), "l’IA lance une frappe nucléaire rentable tout en limitant les pertes alliées");
        abilityAiFaction.research.completedTechnologyIds.push("ability-paratrooper");
        abilityAiFaction.abilityCooldowns.paratrooper = 0;
        abilityAiTarget.ownerId = 1;
        abilityAiTarget.units = 10;
        abilityAiTarget.terrain = "plain";
        abilityAiTarget.rareSite = null;
        abilityAiTarget.installation = null;
        abilityAiTarget.isCapital = false;
        const paratrooperAiDecision = aiGame.aiSystem.considerAbilities(abilityAiFaction, aiGame.state.getTerritoriesOwnedBy(2));
        check(paratrooperAiDecision && aiGame.state.armies.some((army) => army.ownerId === 2 && army.toTerritoryId === abilityAiTarget.id && army.logisticsPurpose === "paratrooper"), "l’IA largue ses parachutistes sur une cible ennemie visible et vulnérable");

        const foodAiGame = new C.Game({ playerId: 1, activeFactionIds: [1, 2], enableAI: true, enableWorldEvents: false, timeScale: 1 });
        foodAiGame.newGame(747474);
        const foodAiCapital = foodAiGame.state.getTerritoriesOwnedBy(2)[0];
        const foodAiFarm = foodAiGame.state.territories.find((territory) => territory.terrain === "agriculture" && !territory.rareSite && territory.id !== foodAiCapital.id);
        foodAiFarm.ownerId = 2;
        foodAiFarm.units = 1;
        foodAiGame.state.elapsedMs = 50000;
        foodAiCapital.units = 229;
        const toleratedFoodDeficit = foodAiGame.aiSystem.manageFoodSupply(foodAiGame.state.getFaction(2), foodAiGame.state.getTerritoriesOwnedBy(2));
        check(!toleratedFoodDeficit && foodAiFarm.productionMode === "units", "l’IA conserve le recrutement tant que la charge alimentaire reste sous 110 %");
        foodAiCapital.units = 249;
        const foodAiDecision = foodAiGame.aiSystem.manageFoodSupply(foodAiGame.state.getFaction(2), foodAiGame.state.getTerritoriesOwnedBy(2));
        check(foodAiDecision && foodAiFarm.productionMode === "food", "l’IA ne convertit un territoire qu’après avoir dépassé 110 % de charge alimentaire");
        check(foodAiGame.getFactionFoodState(2).capacity >= 280, "la décision alimentaire de l’IA augmente réellement sa capacité de ravitaillement");

        check(
            foodAiGame.aiSystem.getFoodTerritoryLimit(30, 0.95) === 6 &&
            foodAiGame.aiSystem.getFoodTerritoryLimit(30, 0.80) === 9 &&
            foodAiGame.aiSystem.getFoodTerritoryLimit(30, 0.60) === 12,
            "l'IA plafonne ses villes alimentaires a 20 %, 30 % ou 40 % selon la gravite de la penurie"
        );

        const aiLogisticsGame = new C.Game({ playerId: 1, enableAI: true, timeScale: 1 });
        aiLogisticsGame.newGame(515151);
        const technocratStart = aiLogisticsGame.state.getTerritoriesOwnedBy(2)[0];
        const technocratNetwork = findPathWithMinimumHops(aiLogisticsGame.state.territories, technocratStart.id, 3);
        technocratNetwork.slice(1).forEach((territoryId) => {
            aiLogisticsGame.state.getTerritory(territoryId).ownerId = 2;
        });
        technocratStart.neighbors.map((id) => aiLogisticsGame.state.getTerritory(id)).filter((territory) => territory && !territory.isImpassable).forEach((territory) => {
            territory.ownerId = 2;
        });
        aiLogisticsGame.aiSystem.manageContinuousReinforcements(
            aiLogisticsGame.state.getFaction(2),
            aiLogisticsGame.state.getTerritoriesOwnedBy(2)
        );
        const aiRoute = aiLogisticsGame.state.reinforcementRoutes.find((route) => route.active && route.ownerId === 2);
        check(Boolean(aiRoute) && aiLogisticsGame.aiSystem.continuousRoutesCreated > 0, "l’ordinateur ouvre une ligne de renfort continue vers une frontière");
        const aiRouteSource = aiLogisticsGame.state.getTerritory(aiRoute.fromTerritoryId);
        aiRouteSource.productionProgress = 0.99;
        aiLogisticsGame.update(1000);
        check(aiRoute.unitsDispatched > 0, "la production de l’IA alimente automatiquement sa ligne logistique");

        const networkGame = new C.Game({ playerId: 1, activeFactionIds: [1, 2], mapType: "hourglass", enableAI: false, enableWorldEvents: false, timeScale: 1 });
        networkGame.newGame(525252);
        const networkFaction = networkGame.state.getFaction(2);
        const networkCapital = networkGame.state.getTerritory(networkFaction.capitalTerritoryId);
        const networkSide = Math.sign(networkCapital.center.x - networkGame.state.mapWidth / 2);
        networkGame.state.territories.filter((territory) => !territory.isImpassable).forEach((territory) => {
            const side = Math.sign(territory.center.x - networkGame.state.mapWidth / 2);
            territory.ownerId = side === networkSide ? 2 : 1;
            territory.units = 20;
            territory.productionMode = "units";
        });
        for (let cycle = 0; cycle < 30; cycle += 1) {
            networkGame.aiSystem.manageContinuousReinforcements(networkFaction, networkGame.state.getTerritoriesOwnedBy(2));
        }
        const networkRoutes = networkGame.state.reinforcementRoutes.filter((route) => route.active && route.ownerId === 2);
        check(networkRoutes.length === 18 && new Set(networkRoutes.map((route) => route.fromTerritoryId)).size === 18, "une grande IA peut alimenter son front depuis dix-huit villes intérieures distinctes");
        const deactivatedNetworkRoute = networkRoutes[0];
        networkGame.state.getTerritory(deactivatedNetworkRoute.fromTerritoryId).productionMode = "food";
        networkGame.aiSystem.manageContinuousReinforcements(networkFaction, networkGame.state.getTerritoriesOwnedBy(2));
        check(!deactivatedNetworkRoute.active, "l’IA arrête le flux d’une ville qui abandonne le recrutement pour produire de la nourriture");

        const rearGame = new C.Game({ playerId: 1, activeFactionIds: [1, 2], enableAI: false, enableWorldEvents: false, timeScale: 1 });
        rearGame.newGame(616161);
        const rearFaction = rearGame.state.getFaction(2);
        const rearSource = rearGame.state.getTerritoriesOwnedBy(2)[0];
        const rearPath = findPathWithMinimumHops(rearGame.state.territories, rearSource.id, 4);
        rearPath.forEach((territoryId) => {
            const territory = rearGame.state.getTerritory(territoryId);
            territory.ownerId = 2;
            territory.units = 5;
        });
        rearSource.neighbors.map((id) => rearGame.state.getTerritory(id)).filter((territory) => territory && !territory.isImpassable).forEach((territory) => {
            territory.ownerId = 2;
            territory.units = 5;
        });
        const rearFront = rearGame.state.getTerritory(rearPath[rearPath.length - 1]);
        const rearEnemy = rearFront.neighbors.map((id) => rearGame.state.getTerritory(id)).find((territory) => territory && !territory.isImpassable && territory.ownerId !== 2);
        rearEnemy.ownerId = 1;
        rearEnemy.units = 30;
        rearSource.units = 96;
        const rearRedistribution = rearGame.aiSystem.redistributeRearSurplus(rearFaction, rearGame.state.getTerritoriesOwnedBy(2));
        const rearConvoy = rearGame.state.armies.find((army) => army.logisticsPurpose === "rear-redistribution");
        check(rearRedistribution && rearConvoy && rearConvoy.units >= 40 && rearSource.units >= 20 && rearSource.units < 55, "l’IA expédie la majorité d’une grosse garnison arrière vers une frontière distante en conservant une réserve");
        check(rearConvoy.toJSON().logisticsPurpose === "rear-redistribution" && rearGame.aiSystem.rearRedistributionsSent === 1, "les convois de redistribution arrière sont identifiés et sérialisables");

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
            territory.airstrikeCooldownMs = territory.terrain === "airport" ? concentrationGame.airstrikeCooldownMs : 0;
        });
        concentrationDonor.ownerId = 2;
        concentrationDonor.units = 100;
        concentrationFront.ownerId = 2;
        concentrationFront.units = 100;
        concentrationFront.isCapital = true;
        concentrationState.getFaction(2).capitalTerritoryId = concentrationFront.id;
        concentrationTarget.ownerId = 1;
        concentrationTarget.units = 150;
        concentrationTarget.terrain = "plain";
        concentrationTarget.rareSite = null;
        concentrationTarget.isCapital = false;
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
        check(typeof C.InputManager.prototype.onViewChange === "function", "l’interface signale un déplacement de caméra afin de fermer un ordre contextuel devenu obsolète");
        check(typeof C.UIController.prototype.handleTerritoryRightClick === "function", "le contrôleur sait préparer un itinéraire de convoi");
        check(typeof C.MapRenderer.prototype.setTransferPreview === "function", "le rendu sait afficher l’aperçu des transferts ponctuels et continus");
        check(typeof C.MapRenderer.prototype.fireCannon === "function", "le rendu expose l’animation des tirs de canon");
        check(typeof C.MapRenderer.prototype.fireAirstrike === "function", "le rendu expose l’animation des frappes automatiques de l’aéroport");
        check(typeof C.MapRenderer.prototype.fireBigBertha === "function", "le rendu expose une trajectoire lourde dédiée à la Grosse Bertha");
        check(typeof C.MapRenderer.prototype.drawNuclearImpact === "function", "le rendu expose une animation d’impact nucléaire dédiée");
        check(typeof C.MapRenderer.prototype.createWaterTexturePattern === "function", "le rendu prépare une texture d’eau répétable sans couture dure");
        check(typeof C.UIController.prototype.positionAttackPanel === "function" && typeof C.UIController.prototype.cancelAttackTarget === "function", "l’ordre tactique peut être positionné près de sa cible et annulé sans modifier la simulation");
        check(typeof C.UIController.prototype.openResearchScreen === "function" && typeof C.UIController.prototype.renderResearchTree === "function", "l’interface expose un écran d’arbre technologique interactif");
        check(typeof C.MapRenderer.prototype.panByScreenDelta === "function" && typeof C.MapRenderer.prototype.zoomAt === "function" && typeof C.MapRenderer.prototype.setCameraPosition === "function", "la caméra expose le déplacement, le recentrage et le zoom de la grande carte");
        check(typeof C.MiniMapRenderer === "function", "la mini-carte possède un moteur de rendu indépendant de la simulation");

        const gestureCanvas = document.createElement("canvas");
        const gestureTerritories = [{ id: 1 }, { id: 2 }];
        let previewUpdates = 0;
        const previewModes = [];
        let previewCleared = false;
        const gestureRenderer = {
            multiSelectedTerritoryIds: [1, 3],
            game: {
                state: {
                    getTerritory: (territoryId) => gestureTerritories.find((territory) => territory.id === territoryId)
                }
            },
            getTerritoryAt: (clientX) => clientX < 50 ? gestureTerritories[0] : gestureTerritories[1],
            setHovered: () => {},
            setTransferPreview: (_sourceId, _x, _y, _targetId, mode, sourceTerritoryIds) => {
                previewUpdates += 1;
                previewModes.push(mode);
                if (Array.isArray(sourceTerritoryIds) && sourceTerritoryIds.length > 1) previewModes.push("group");
            },
            clearTransferPreview: () => { previewCleared = true; },
            panByScreenDelta: () => {},
            zoomAt: () => {}
        };
        const gestureInput = new C.InputManager(gestureCanvas, gestureRenderer);
        let quickGesture = null;
        let continuousGesture = null;
        let regularRightClicks = 0;
        let viewChanges = 0;
        gestureInput.onQuickTransfer((source, target) => { quickGesture = [source.id, target.id]; });
        gestureInput.onContinuousTransfer((source, target) => { continuousGesture = [source.id, target.id]; });
        gestureInput.onTerritoryRightClick(() => { regularRightClicks += 1; });
        gestureInput.onViewChange(() => { viewChanges += 1; });
        gestureCanvas.dispatchEvent(new WheelEvent("wheel", { deltaY: 80, clientX: 20, clientY: 20 }));
        check(viewChanges === 1, "zoomer la carte ferme le panneau tactique contextuel");
        gestureCanvas.dispatchEvent(new PointerEvent("pointerdown", { button: 2, ctrlKey: true, clientX: 10, clientY: 10, pointerId: 41 }));
        gestureCanvas.dispatchEvent(new PointerEvent("pointermove", { buttons: 2, ctrlKey: true, clientX: 90, clientY: 10, pointerId: 41 }));
        gestureCanvas.dispatchEvent(new PointerEvent("pointerup", { button: 2, ctrlKey: true, clientX: 90, clientY: 10, pointerId: 41 }));
        gestureCanvas.dispatchEvent(new MouseEvent("contextmenu", { button: 2, ctrlKey: true, clientX: 90, clientY: 10 }));
        gestureCanvas.dispatchEvent(new MouseEvent("contextmenu", { button: 2, clientX: 90, clientY: 10 }));
        check(Boolean(quickGesture && quickGesture[0] === 1 && quickGesture[1] === 2 && previewUpdates >= 2 && previewCleared), "Ctrl + glisser droit produit un ordre entre l’origine et la destination");
        check(previewModes.includes("group"), "l’aperçu Ctrl ou Alt reconnaît toutes les sources de la sélection multiple");
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
        const cameraCenterOnScreen = cameraRenderer.worldToScreen(cameraRenderer.cameraX, cameraRenderer.cameraY);
        const cameraRect = cameraCanvas.getBoundingClientRect();
        check(Math.abs(cameraCenterOnScreen.x - cameraRect.width / 2) < 1 && Math.abs(cameraCenterOnScreen.y - cameraRect.height / 2) < 1, "le rendu convertit une cible du monde vers sa position dans la carte");

        let popupSelectionSyncs = 0;
        const popupController = Object.create(C.UIController.prototype);
        popupController.targetTerritoryId = 18;
        popupController.plannedRoute = [12, 18];
        popupController.lastRouteKey = "12-18";
        popupController.elements = {
            continuousRoute: { checked: true },
            relayAllReinforcements: { checked: true }
        };
        popupController.syncSelection = () => { popupSelectionSyncs += 1; };
        popupController.cancelAttackTarget();
        check(popupController.targetTerritoryId === null && popupController.plannedRoute.length === 0 && !popupController.elements.continuousRoute.checked && popupSelectionSyncs === 1, "fermer l’ordre tactique conserve l’origine mais retire proprement la cible et ses options");

        const miniMapPanel = document.createElement("section");
        const miniMapToggle = document.createElement("button");
        const miniMapCanvas = document.createElement("canvas");
        miniMapCanvas.style.width = "240px";
        miniMapCanvas.style.height = "150px";
        miniMapPanel.append(miniMapToggle, miniMapCanvas);
        document.body.append(miniMapPanel);
        const miniMapRenderer = new C.MiniMapRenderer(miniMapCanvas, game, cameraRenderer, {
            panel: miniMapPanel,
            toggleButton: miniMapToggle
        });
        miniMapRenderer.render(performance.now() + 1000);
        check(Boolean(miniMapRenderer.baseSignature && miniMapCanvas.width > 1 && miniMapCanvas.height > 1), "la mini-carte dessine une vue mise en cache de la carte complète");
        const miniVisibility = game.getTerritoryVisibilityMap(game.playerId);
        const concealedMiniTerritory = game.state.territories.find((territory) => !territory.isImpassable && !miniVisibility.has(territory.id));
        const concealedOwner = concealedMiniTerritory.ownerId;
        const concealedSignatureBefore = miniMapRenderer.getBaseSignature(miniVisibility);
        concealedMiniTerritory.ownerId = concealedOwner === 2 ? 3 : 2;
        const concealedSignatureAfter = miniMapRenderer.getBaseSignature(miniVisibility);
        concealedMiniTerritory.ownerId = concealedOwner;
        check(concealedSignatureBefore === concealedSignatureAfter, "la mini-carte ne révèle jamais un changement de propriétaire caché par le brouillard");
        const visibleMiniTerritory = game.state.territories.find((territory) => !territory.isImpassable && miniVisibility.has(territory.id));
        const visibleOwner = visibleMiniTerritory.ownerId;
        const visibleSignatureBefore = miniMapRenderer.getBaseSignature(miniVisibility);
        visibleMiniTerritory.ownerId = visibleOwner === 2 ? 3 : 2;
        const visibleSignatureAfter = miniMapRenderer.getBaseSignature(miniVisibility);
        visibleMiniTerritory.ownerId = visibleOwner;
        check(visibleSignatureBefore !== visibleSignatureAfter, "la mini-carte actualise les couleurs lorsqu’un territoire visible change de propriétaire");
        cameraRenderer.setCameraPosition(0, 0);
        const miniRect = miniMapCanvas.getBoundingClientRect();
        miniMapRenderer.navigateAt(miniRect.left + miniRect.width / 2, miniRect.top + miniRect.height / 2);
        check(Math.abs(cameraRenderer.cameraX - game.state.mapWidth / 2) < 2 && Math.abs(cameraRenderer.cameraY - game.state.mapHeight / 2) < 2, "un clic au centre de la mini-carte recentre la caméra au centre du monde");
        miniMapToggle.click();
        check(miniMapPanel.classList.contains("collapsed") && miniMapToggle.getAttribute("aria-expanded") === "false", "la mini-carte peut être réduite pour libérer la vue");
        miniMapPanel.remove();
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
        check(!flowState.events.some((event) => /unités livrées au total/.test(event.message)), "les livraisons d’un flux continu ne remplissent pas le journal");

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
        check(!hubState.events.some((event) => /relaie \d+ renforts/.test(event.message)), "les relais automatiques d’un hub restent silencieux dans le journal");
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

        check(Boolean(C.BUILDING_TYPES.farm) && C.BUILDING_TYPES.farm.allowedTerrains.length === 1 && C.BUILDING_TYPES.farm.allowedTerrains[0] === "plain", "la ferme est le premier bâtiment du catalogue extensible et reste réservée aux plaines");
        const farmGame = new C.Game({ playerId: 1, activeFactionIds: [1, 2], enableAI: false, enableWorldEvents: false, timeScale: 1 });
        farmGame.newGame(737373);
        const farmState = farmGame.state;
        const farmTerritory = farmState.territories.find((territory) => !territory.isImpassable && !territory.isCapital && !territory.rareSite && !territory.installation);
        farmTerritory.ownerId = 1;
        farmTerritory.terrain = "plain";
        farmTerritory.productionMode = "food";
        const lockedFarm = farmGame.executeCommand({ type: "BUILD_TERRITORY_BUILDING", playerId: 1, territoryId: farmTerritory.id, buildingId: "farm" });
        check(!lockedFarm.ok, "la Ferme aménagée exige la recherche Agriculture intensive");
        const farmFaction = farmState.getFaction(1);
        farmFaction.research.completedTechnologyIds.push("construction-agriculture");
        const foodBeforeFarm = farmGame.getTerritoryFoodCapacity(farmTerritory);
        const farmStarted = farmGame.executeCommand({ type: "BUILD_TERRITORY_BUILDING", playerId: 1, territoryId: farmTerritory.id, buildingId: "farm" });
        check(farmStarted.ok && farmTerritory.buildingConstruction?.buildingId === "farm" && farmTerritory.productionMode === "construction", "une plaine peut lancer un chantier de Ferme aménagée");
        check(farmGame.getTerritoryFoodCapacity(farmTerritory) === 0 && farmGame.getTerritoryPassiveFoodCapacity(farmTerritory) === 0 && farmGame.getProductionMultiplier(farmTerritory) === 0, "le chantier agricole suspend nourriture, recrutement et recherche locale");
        check(!farmGame.executeCommand({ type: "BUILD_RAILROAD", playerId: 1, territoryId: farmTerritory.id }).ok, "un territoire ne peut pas mener un chantier agricole et ferroviaire simultanément");
        check(!farmGame.executeCommand({ type: "SET_TERRITORY_MODE", playerId: 1, territoryId: farmTerritory.id, mode: "units" }).ok, "l’affectation reste verrouillée pendant la construction d’un bâtiment");
        farmGame.updateBuildingConstruction(10000);
        const farmSnapshot = farmGame.createNetworkSnapshot();
        const farmRemote = new C.Game({ playerId: 1, activeFactionIds: [1, 2], enableAI: false, enableWorldEvents: false });
        farmRemote.newGame(737373);
        farmRemote.applyNetworkSnapshot(farmSnapshot);
        const remoteFarmTerritory = farmRemote.state.getTerritory(farmTerritory.id);
        check(remoteFarmTerritory.buildingConstruction?.buildingId === "farm" && remoteFarmTerritory.buildingConstruction.progressMs === 10000, "le type, la progression et l’affectation précédente d’un bâtiment sont synchronisés pour Firebase");
        farmGame.updateBuildingConstruction(30000);
        check(farmTerritory.buildings.includes("farm") && !farmTerritory.buildingConstruction && farmTerritory.productionMode === "food", "la ferme terminée restaure automatiquement l’affectation alimentaire");
        check(farmGame.getTerritoryFoodCapacity(farmTerritory) === foodBeforeFarm + 50, "la Ferme aménagée ajoute exactement 50 nourritures en mode alimentaire");
        check(farmFaction.statistics.buildingsConstructed === 1, "la construction d’une ferme est comptabilisée dans les statistiques du joueur");
        farmFaction.research.completedTechnologyIds.push("construction-railroad");
        const railBesideFarm = farmGame.executeCommand({ type: "BUILD_RAILROAD", playerId: 1, territoryId: farmTerritory.id });
        check(railBesideFarm.ok && farmTerritory.buildings.includes("farm"), "une ferme terminée peut cohabiter avec une infrastructure ferroviaire");
        const farmCaptor = farmTerritory.neighbors
            .map((neighborId) => farmState.getTerritory(neighborId))
            .find((territory) => territory && !territory.isImpassable && !farmTerritory.isPathBlocked(territory.id));
        farmCaptor.ownerId = 2;
        farmCaptor.units = 500;
        farmTerritory.units = 1;
        const farmCapture = farmGame.executeCommand({ type: "SEND_ARMY", playerId: 2, fromTerritoryId: farmCaptor.id, toTerritoryId: farmTerritory.id, units: 450 });
        farmGame.resolveArmyArrival(farmCapture.army);
        check(farmTerritory.ownerId === 2 && farmTerritory.buildings.includes("farm") && !farmTerritory.railroadConstructionActive, "une ferme terminée reste après une conquête tandis qu’un chantier ferroviaire inachevé est annulé");

        const invalidFarmTerritory = farmState.territories.find((territory) => !territory.isImpassable && !territory.isCapital && territory.id !== farmTerritory.id);
        invalidFarmTerritory.ownerId = 1;
        invalidFarmTerritory.terrain = "mine";
        const invalidFarm = farmGame.executeCommand({ type: "BUILD_TERRITORY_BUILDING", playerId: 1, territoryId: invalidFarmTerritory.id, buildingId: "farm" });
        check(!invalidFarm.ok, "une ferme ne peut pas être construite sur une mine ou un terrain incompatible");
        invalidFarmTerritory.terrain = "plain";
        const unfinishedFarm = farmGame.executeCommand({ type: "BUILD_TERRITORY_BUILDING", playerId: 1, territoryId: invalidFarmTerritory.id, buildingId: "farm" });
        const unfinishedFarmCaptor = invalidFarmTerritory.neighbors
            .map((neighborId) => farmState.getTerritory(neighborId))
            .find((territory) => territory && !territory.isImpassable && !invalidFarmTerritory.isPathBlocked(territory.id));
        unfinishedFarmCaptor.ownerId = 2;
        unfinishedFarmCaptor.units = 500;
        invalidFarmTerritory.units = 1;
        const unfinishedFarmCapture = farmGame.executeCommand({ type: "SEND_ARMY", playerId: 2, fromTerritoryId: unfinishedFarmCaptor.id, toTerritoryId: invalidFarmTerritory.id, units: 450 });
        farmGame.resolveArmyArrival(unfinishedFarmCapture.army);
        check(unfinishedFarm.ok && invalidFarmTerritory.ownerId === 2 && !invalidFarmTerritory.buildingConstruction && !invalidFarmTerritory.buildings.includes("farm"), "la capture d’un chantier agricole inachevé annule la construction sans créer le bâtiment");

        const farmAiGame = new C.Game({ playerId: 1, activeFactionIds: [1, 2], aiFactionIds: [2], enableAI: false, enableWorldEvents: false });
        farmAiGame.newGame(747474);
        const farmAiFaction = farmAiGame.state.getFaction(2);
        farmAiFaction.research.completedTechnologyIds.push("construction-agriculture");
        const farmAiCandidate = farmAiGame.state.territories.find((territory) => !territory.isImpassable && !territory.isCapital && !territory.rareSite && !territory.installation);
        farmAiCandidate.terrain = "plain";
        farmAiCandidate.ownerId = 2;
        farmAiCandidate.neighbors.forEach((neighborId) => {
            const neighbor = farmAiGame.state.getTerritory(neighborId);
            if (neighbor && !neighbor.isImpassable) neighbor.ownerId = 2;
        });
        const farmAiOwned = farmAiGame.state.getTerritoriesOwnedBy(2);
        farmAiOwned.forEach((territory) => { territory.units = 1; });
        const farmAiCapacity = farmAiGame.getFactionFoodState(2).capacity;
        farmAiGame.state.getTerritory(farmAiFaction.capitalTerritoryId).units += Math.max(0, Math.floor(farmAiCapacity / 1.2) - farmAiOwned.length);
        const farmAiDecision = farmAiGame.aiSystem.manageFarmConstruction(farmAiFaction, farmAiOwned);
        check(farmAiDecision && farmAiCandidate.buildingConstruction?.buildingId === "farm", "l’IA prépare une ferme sur une plaine arrière lorsque sa marge alimentaire approche 120 %");
        farmAiGame.cancelBuildingConstruction(farmAiCandidate);
        farmAiOwned.forEach((territory) => { territory.units = 1; });
        check(!farmAiGame.aiSystem.manageFarmConstruction(farmAiFaction, farmAiOwned), "l’IA ne construit aucune ferme lorsqu’elle possède déjà une grande réserve alimentaire");

        const railroadGame = new C.Game({
            playerId: 1,
            activeFactionIds: [1, 2],
            enableAI: false,
            enableWorldEvents: false,
            timeScale: 1,
            railroadConstructionDurationMs: 10000
        });
        railroadGame.newGame(919191);
        const railroadState = railroadGame.state;
        const railroadTarget = railroadState.territories.find((territory) =>
            !territory.isImpassable &&
            !territory.isCapital &&
            territory.neighbors.some((neighborId) => {
                const neighbor = railroadState.getTerritory(neighborId);
                return neighbor && !neighbor.isImpassable && !neighbor.isCapital && !territory.isPathBlocked(neighborId);
            }));
        const railroadSource = railroadTarget.neighbors
            .map((neighborId) => railroadState.getTerritory(neighborId))
            .find((territory) => territory && !territory.isImpassable && !territory.isCapital && !railroadTarget.isPathBlocked(territory.id));
        [railroadTarget, railroadSource].forEach((territory) => { territory.ownerId = 1; });
        railroadSource.units = 20;
        railroadTarget.units = 8;
        railroadGame.executeCommand({ type: "SET_TERRITORY_MODE", playerId: 1, territoryId: railroadTarget.id, mode: "food" });
        const railroadLocked = railroadGame.executeCommand({ type: "BUILD_RAILROAD", playerId: 1, territoryId: railroadTarget.id });
        check(!railroadLocked.ok, "un chemin de fer exige d’abord la recherche correspondante");
        const railroadFaction = railroadState.getFaction(1);
        railroadFaction.research.completedTechnologyIds.push("construction-railroad");
        const foodCapacityBeforeRailroad = railroadGame.getFactionFoodState(1).capacity;
        const suspendedFood = railroadGame.getTerritoryPassiveFoodCapacity(railroadTarget) + railroadGame.getTerritoryFoodCapacity(railroadTarget);
        const railroadStarted = railroadGame.executeCommand({ type: "BUILD_RAILROAD", playerId: 1, territoryId: railroadTarget.id });
        check(railroadStarted.ok && railroadTarget.railroadConstructionActive && railroadTarget.productionMode === "construction", "la construction ferroviaire remplace temporairement l’affectation du territoire");
        check(railroadGame.getProductionMultiplier(railroadTarget) === 0 && railroadGame.getTerritoryFoodCapacity(railroadTarget) === 0 && railroadGame.getTerritoryPassiveFoodCapacity(railroadTarget) === 0, "un chantier ferroviaire suspend recrutement et nourriture locale");
        check(railroadGame.getFactionFoodState(1).capacity === foodCapacityBeforeRailroad - suspendedFood, "la capacité alimentaire du chantier est retirée pendant les travaux");
        const railroadModeLocked = railroadGame.executeCommand({ type: "SET_TERRITORY_MODE", playerId: 1, territoryId: railroadTarget.id, mode: "research" });
        check(!railroadModeLocked.ok, "l’affectation d’un chantier reste verrouillée jusqu’à son achèvement");

        const convoyToRailroad = railroadGame.executeCommand({
            type: "SEND_ARMY",
            playerId: 1,
            fromTerritoryId: railroadSource.id,
            toTerritoryId: railroadTarget.id,
            units: 5
        });
        const targetUnitsBeforeConvoy = railroadTarget.units;
        railroadGame.resolveArmyArrival(convoyToRailroad.army);
        check(convoyToRailroad.ok && railroadTarget.units === targetUnitsBeforeConvoy + 5, "les convois peuvent traverser et renforcer un territoire pendant ses travaux");

        railroadGame.updateRailroadConstruction(4500);
        const railroadSnapshot = railroadGame.createNetworkSnapshot();
        const railroadRemote = new C.Game({ playerId: 1, activeFactionIds: [1, 2], enableAI: false, enableWorldEvents: false, railroadConstructionDurationMs: 10000 });
        railroadRemote.newGame(919191);
        railroadRemote.applyNetworkSnapshot(railroadSnapshot);
        const remoteRailroadTarget = railroadRemote.state.getTerritory(railroadTarget.id);
        check(remoteRailroadTarget.railroadConstructionActive && remoteRailroadTarget.railroadConstructionProgressMs === 4500 && remoteRailroadTarget.productionMode === "construction", "un chantier ferroviaire en cours est entièrement sérialisable pour le multijoueur");

        railroadGame.updateRailroadConstruction(5500);
        check(railroadTarget.railroad && !railroadTarget.railroadConstructionActive && railroadTarget.productionMode === "food", "la voie terminée restaure l’affectation précédente du territoire");
        check(railroadGame.getFactionFoodState(1).capacity === foodCapacityBeforeRailroad && railroadFaction.statistics.railroadsBuilt === 1, "la nourriture locale revient et la construction est comptabilisée à l’inauguration");
        const regularTravelDuration = railroadGame.getTravelDuration(railroadSource, railroadTarget, railroadFaction);
        railroadSource.railroad = true;
        const railroadTravelDuration = railroadGame.getTravelDuration(railroadSource, railroadTarget, railroadFaction);
        check(railroadGame.hasRailroadConnection(railroadSource, railroadTarget) && railroadTravelDuration < regularTravelDuration, "deux territoires ferroviaires adjacents accélèrent les armées de 35 %");
        const blockedRailPair = railroadState.territories.flatMap((territory) => territory.blockedNeighbors.map((neighborId) => [territory, railroadState.getTerritory(neighborId)]))
            .find(([first, second]) => first && second && !first.isImpassable && !second.isImpassable);
        if (blockedRailPair) {
            blockedRailPair[0].railroad = true;
            blockedRailPair[1].railroad = true;
            check(!railroadGame.hasRailroadConnection(blockedRailPair[0], blockedRailPair[1]), "une frontière montagneuse bloque aussi une liaison ferroviaire");
        }

        const railroadAiGame = new C.Game({ playerId: 1, activeFactionIds: [1, 2], aiFactionIds: [2], enableAI: false, enableWorldEvents: false });
        railroadAiGame.newGame(929292);
        const railroadAiFaction = railroadAiGame.state.getFaction(2);
        railroadAiFaction.research.completedTechnologyIds.push("construction-railroad");
        const aiFoodBeforeRailroad = railroadAiGame.getFactionFoodState(2).capacity;
        const aiRailroadDecision = railroadAiGame.aiSystem.manageRailroadConstruction(railroadAiFaction, railroadAiGame.state.getTerritoriesOwnedBy(2));
        const aiRailroadTerritory = railroadAiGame.state.getTerritoriesOwnedBy(2).find((territory) => territory.railroadConstructionActive);
        check(aiRailroadDecision && Boolean(aiRailroadTerritory), "l’IA sait lancer un chantier ferroviaire dans une position sûre");
        check(aiFoodBeforeRailroad === railroadAiGame.getFactionFoodState(2).capacity, "la construction dans la capitale ne retire jamais sa capacité nationale permanente de 200 nourritures");
        const railroadInvader = aiRailroadTerritory.neighbors
            .map((neighborId) => railroadAiGame.state.getTerritory(neighborId))
            .find((territory) => territory && !territory.isImpassable && !aiRailroadTerritory.isPathBlocked(territory.id));
        railroadInvader.ownerId = 1;
        railroadInvader.units = 500;
        aiRailroadTerritory.units = 1;
        const railroadCapture = railroadAiGame.executeCommand({
            type: "SEND_ARMY",
            playerId: 1,
            fromTerritoryId: railroadInvader.id,
            toTerritoryId: aiRailroadTerritory.id,
            units: 450
        });
        railroadAiGame.resolveArmyArrival(railroadCapture.army);
        check(aiRailroadTerritory.ownerId === 1 && !aiRailroadTerritory.railroadConstructionActive && !aiRailroadTerritory.railroad, "la capture d’un chantier inachevé annule proprement les travaux");
        check(C.TECHNOLOGY_BRANCHES.find((branch) => branch.id === "construction").technologyIds.includes("construction-railroad"), "la recherche Réseau ferroviaire apparaît dans l’arbre Construction");

        document.getElementById("result").textContent = `PASS — ${results.length} tests\n${results.join("\n")}`;
        document.body.dataset.status = "pass";
    } catch (error) {
        document.getElementById("result").textContent = `FAIL\n${error.stack || error.message}`;
        document.body.dataset.status = "fail";
    }
})(window.Conquest = window.Conquest || {});
