(function (C) {
    "use strict";

    const results = [];
    function check(condition, label) {
        if (!condition) throw new Error(label);
        results.push(`✓ ${label}`);
    }

    function graphIsConnected(territories, respectBlockedPaths = false) {
        const visited = new Set();
        const pending = [territories[0].id];
        while (pending.length) {
            const id = pending.pop();
            if (visited.has(id)) continue;
            visited.add(id);
            const territory = territories.find((candidate) => candidate.id === id);
            territory.neighbors.forEach((neighborId) => {
                if (!respectBlockedPaths || !territory.isPathBlocked(neighborId)) pending.push(neighborId);
            });
        }
        return visited.size === territories.length;
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
                visited.add(neighborId);
                pending.push(path.concat(neighborId));
            });
        }
        return null;
    }

    try {
        const pacedGame = new C.Game({ playerId: 1, enableAI: false });
        check(pacedGame.timeScale < 1, "le rythme par défaut est ralenti pour laisser le temps de réagir");

        const game = new C.Game({ playerId: 1, enableAI: false, timeScale: 1 });
        game.newGame(424242);
        const state = game.state;

        check(state.territories.length >= 78 && state.territories.length <= 86, "la très grande carte contient entre 78 et 86 territoires");
        check(state.territories.every((territory) => territory.polygon.length >= 3), "chaque territoire possède un polygone valide");
        check(state.territories.every((territory) => territory.neighbors.length >= 2), "chaque territoire possède plusieurs voisins");
        check(state.territories.every((territory) => territory.neighbors.every((id) => state.getTerritory(id).neighbors.includes(territory.id))), "les relations de voisinage sont réciproques");
        check(graphIsConnected(state.territories), "le graphe territorial est entièrement connecté");
        const mountainPassages = state.territories.reduce((sum, territory) => sum + territory.blockedNeighbors.length, 0) / 2;
        check(mountainPassages >= 18, "plusieurs grandes chaînes montagneuses sont générées");
        check(state.territories.every((territory) => territory.blockedNeighbors.every((id) => state.getTerritory(id).isPathBlocked(territory.id))), "les blocages montagneux sont réciproques");
        check(graphIsConnected(state.territories, true), "la carte reste entièrement accessible en contournant les montagnes");
        check(state.factions.length === 4, "les quatre factions sont créées");
        check(state.factions.every((faction) => state.getTerritoriesOwnedBy(faction.id).length === 1), "chaque faction possède un territoire de départ");
        check(state.factions.every((faction) => state.getTerritoriesOwnedBy(faction.id)[0].units === 20), "chaque faction commence avec 20 unités");
        check(state.territories.filter((territory) => territory.rareSite).length === 6, "six sites stratégiques rares sont placés");

        const playerStart = state.getTerritoriesOwnedBy(game.playerId)[0];
        const initialUnits = playerStart.units;
        for (let tick = 0; tick < 5; tick += 1) game.update(1000);
        check(playerStart.units > initialUnits, "la production temps réel ajoute des unités");

        const target = state.getTerritory(playerStart.neighbors.find((id) =>
            state.getTerritory(id).ownerId !== game.playerId && !playerStart.isPathBlocked(id)));
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

        const aiGame = new C.Game({ playerId: 1, enableAI: true, timeScale: 1 });
        aiGame.newGame(707070);
        for (let tick = 0; tick < 24; tick += 1) aiGame.update(1000);
        check(aiGame.aiSystem.ordersIssued > 0, "les factions contrôlées par l’ordinateur prennent des décisions");
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

        check(typeof C.InputManager.prototype.onTerritoryRightClick === "function", "l’interface expose la sélection de destination au clic droit");
        check(typeof C.UIController.prototype.handleTerritoryRightClick === "function", "le contrôleur sait préparer un itinéraire de convoi");
        check(typeof C.MapRenderer.prototype.panByScreenDelta === "function" && typeof C.MapRenderer.prototype.zoomAt === "function", "la caméra expose le déplacement et le zoom de la grande carte");

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

        const flowGame = new C.Game({ playerId: 1, enableAI: false, timeScale: 1 });
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
        check(Boolean(JSON.stringify(flowState.toJSON())), "les lignes continues sont incluses dans l’état sérialisable");

        document.getElementById("result").textContent = `PASS — ${results.length} tests\n${results.join("\n")}`;
        document.body.dataset.status = "pass";
    } catch (error) {
        document.getElementById("result").textContent = `FAIL\n${error.stack || error.message}`;
        document.body.dataset.status = "fail";
    }
})(window.Conquest = window.Conquest || {});
