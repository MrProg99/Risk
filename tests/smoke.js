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
        foodCapital.units = 230;
        const shortFoodState = foodGame.getFactionFoodState(1);
        check(shortFoodState.productionMultiplier === 0.8 && Math.abs(foodGame.getProductionMultiplier(foodCapital) - fedProduction * 0.8) < 0.0001, "une légère pénurie réduit le recrutement à 80 %");
        foodCapital.units = 300;
        foodCapital.productionProgress = 0;
        foodFarm.productionProgress = 0;
        const unitsBeforeFoodAttrition = foodGame.getFactionStats(1).totalUnits;
        foodGame.update(1000);
        foodGame.update(1000);
        check(foodGame.getFactionStats(1).totalUnits < unitsBeforeFoodAttrition, "une capacité inférieure à 75 % provoque une attrition progressive");
        check(foodCapital.units >= 1 && foodFarm.units >= 1, "l’attrition alimentaire ne vide jamais entièrement une garnison territoriale");
        check(foodGame.state.toJSON().territories.some((territory) => territory.productionMode === "units"), "le mode de production est inclus dans l’état sérialisable");
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
        check(submittedLobbyConfiguration.activeFactionIds.join(",") === "2,3,4", "la validation du lobby transmet la liste des participants au moteur");
        lobbyController.close();
        lobbyFixture.remove();
        const duelGame = new C.Game({ playerId: 4, activeFactionIds: [4, 1], enableAI: true, timeScale: 1 });
        duelGame.newGame(565656);
        check(duelGame.state.factions.map((faction) => faction.id).join(",") === "4,1", "une partie peut démarrer avec seulement deux factions choisies dans le lobby");
        check(duelGame.aiSystem.factionIds.length === 1 && duelGame.aiSystem.factionIds[0] === 1, "l’ordinateur contrôle tous les participants sauf la faction du joueur");
        check(duelGame.state.getTerritoriesOwnedBy(4).length === 1 && duelGame.state.getTerritoriesOwnedBy(1).length === 1, "chaque participant du lobby reçoit un territoire de départ");

        const multiplayerRoom = {
            players: {
                a: { uid: "a", name: "Alpha", raceId: 1, teamId: 1, slot: 1, color: "#f0b84d" },
                b: { uid: "b", name: "Bravo", raceId: 1, teamId: 1, slot: 2, color: "#43cde0" },
                c: { uid: "c", name: "Charlie", raceId: 3, teamId: 2, slot: 3, color: "#ef655f" }
            }
        };
        const multiplayerSetups = C.FirebaseMultiplayer.buildFactionSetups(multiplayerRoom);
        check(multiplayerSetups[0].definitionId === multiplayerSetups[1].definitionId && multiplayerSetups[0].color !== multiplayerSetups[1].color, "deux joueurs peuvent choisir la même race tout en conservant des couleurs distinctes");
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

        check(C.TECHNOLOGY_BRANCHES.length === 4 && Object.keys(C.TECHNOLOGIES).length === 15, "l’arbre propose trois axes progressifs et un axe de capacités");
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
        researchFaction.research.completedTechnologyIds.push("ability-missile", "ability-reinforcement");
        const missileLaunch = researchGame.executeCommand({ type: "USE_ABILITY", playerId: 1, abilityId: "missile", targetTerritoryId: abilityTarget.id });
        check(missileLaunch.ok && researchGame.state.abilityActions.length === 1 && abilityTarget.units === 100, "le missile crée une alerte différée de cinq secondes");
        for (let tick = 0; tick < 5; tick += 1) researchGame.update(1000);
        check(abilityTarget.units === 75 && researchGame.state.abilityActions.length === 0, "le missile retire 25 % des forces à l’impact");
        abilityTarget.units = 500;
        researchFaction.abilityCooldowns.missile = 0;
        researchGame.executeCommand({ type: "USE_ABILITY", playerId: 1, abilityId: "missile", targetTerritoryId: abilityTarget.id });
        for (let tick = 0; tick < 5; tick += 1) researchGame.update(1000);
        check(abilityTarget.units === 460, "les dommages du missile sont plafonnés à 40 unités");
        const unitsBeforeMobilization = researchTerritory.units;
        const mobilization = researchGame.executeCommand({ type: "USE_ABILITY", playerId: 1, abilityId: "reinforcement", targetTerritoryId: researchTerritory.id });
        check(mobilization.ok && researchTerritory.units === unitsBeforeMobilization + 35, "la mobilisation d’urgence ajoute 35 unités sur un territoire contrôlé");
        const abilitySnapshot = researchGame.createNetworkSnapshot();
        check(abilitySnapshot.factions[0].abilityCooldowns.missile > 0 && abilitySnapshot.factions[0].abilityCooldowns.reinforcement > 0, "les recharges de capacités sont incluses dans l’instantané multijoueur");

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
        let loadedMusicSource = "";
        let musicPlayCount = 0;
        const fakeMusic = {
            loop: false,
            preload: "none",
            volume: 1,
            play: () => { musicPlayCount += 1; }
        };
        const musicAudioManager = new C.AudioManager({
            mediaFactory: (source) => {
                loadedMusicSource = source;
                return fakeMusic;
            },
            contextFactory: () => fakeAudioContext
        });
        check(musicAudioManager.startBackgroundMusic() && loadedMusicSource === "Musique/Music1.mp3" && fakeMusic.loop && fakeMusic.preload === "auto" && musicPlayCount === 1, "Music1.mp3 démarre en boucle avec un préchargement adapté au jeu");
        musicAudioManager.duckBackgroundMusic();
        check(fakeMusic.volume < musicAudioManager.backgroundMusicVolume, "la musique baisse temporairement pendant le carillon de recherche");
        clearTimeout(musicAudioManager.musicRestoreTimer);
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

        const aiGame = new C.Game({ playerId: 1, enableAI: true, timeScale: 1 });
        aiGame.newGame(707070);
        for (let tick = 0; tick < 24; tick += 1) aiGame.update(1000);
        check(aiGame.aiSystem.ordersIssued > 0, "les factions contrôlées par l’ordinateur prennent des décisions");
        check(aiGame.aiSystem.researchChoicesMade > 0 && aiGame.state.factions.filter((faction) => faction.id !== 1).every((faction) => faction.research.activeTechnologyId || faction.research.completedTechnologyIds.length), "chaque IA choisit et fait progresser sa propre recherche");
        check(aiGame.state.events.some((event) => /Technocrates|Horde|Nomades/.test(event.message) && /attaque|renforce/.test(event.message)), "les ordres de l’ordinateur apparaissent dans le journal tactique");

        const abilityAiFaction = aiGame.state.getFaction(2);
        const abilityAiSource = aiGame.state.getTerritoriesOwnedBy(2)[0];
        const abilityAiTarget = abilityAiSource.neighbors.map((id) => aiGame.state.getTerritory(id)).find((territory) => territory && !territory.isImpassable);
        abilityAiTarget.ownerId = 1;
        abilityAiTarget.units = 80;
        abilityAiFaction.research.completedTechnologyIds.push("ability-missile");
        abilityAiFaction.abilityCooldowns.missile = 0;
        const abilityAiDecision = aiGame.aiSystem.considerAbilities(abilityAiFaction, aiGame.state.getTerritoriesOwnedBy(2));
        check(abilityAiDecision && aiGame.state.abilityActions.some((action) => action.factionId === 2 && action.targetTerritoryId === abilityAiTarget.id), "l’IA utilise son missile contre une concentration ennemie visible");

        const foodAiGame = new C.Game({ playerId: 1, activeFactionIds: [1, 2], enableAI: true, enableWorldEvents: false, timeScale: 1 });
        foodAiGame.newGame(747474);
        const foodAiCapital = foodAiGame.state.getTerritoriesOwnedBy(2)[0];
        const foodAiFarm = foodAiGame.state.territories.find((territory) => territory.terrain === "agriculture" && !territory.rareSite && territory.id !== foodAiCapital.id);
        foodAiFarm.ownerId = 2;
        foodAiFarm.units = 1;
        foodAiGame.state.elapsedMs = 50000;
        foodAiCapital.units = 229;
        const toleratedFoodDeficit = foodAiGame.aiSystem.manageFoodSupply(foodAiGame.state.getFaction(2), foodAiGame.state.getTerritoriesOwnedBy(2));
        check(!toleratedFoodDeficit && foodAiFarm.productionMode === "units", "l’IA conserve le recrutement lorsqu’elle ne dépasse que légèrement sa capacité alimentaire");
        foodAiCapital.units = 249;
        const foodAiDecision = foodAiGame.aiSystem.manageFoodSupply(foodAiGame.state.getFaction(2), foodAiGame.state.getTerritoriesOwnedBy(2));
        check(foodAiDecision && foodAiFarm.productionMode === "food", "l’IA tolère une légère pénurie et ne convertit un territoire qu’à moins de 90 % de couverture");
        check(foodAiGame.getFactionFoodState(2).capacity >= 280, "la décision alimentaire de l’IA augmente réellement sa capacité de ravitaillement");

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

        document.getElementById("result").textContent = `PASS — ${results.length} tests\n${results.join("\n")}`;
        document.body.dataset.status = "pass";
    } catch (error) {
        document.getElementById("result").textContent = `FAIL\n${error.stack || error.message}`;
        document.body.dataset.status = "fail";
    }
})(window.Conquest = window.Conquest || {});
