(function (C) {
    "use strict";

    function averageDuration(iterations, operation) {
        const startedAt = performance.now();
        for (let index = 0; index < iterations; index += 1) operation(index);
        return (performance.now() - startedAt) / iterations;
    }

    function percentile(values, ratio) {
        const ordered = values.slice().sort((first, second) => first - second);
        return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * ratio))];
    }

    function run() {
        const game = new C.Game({
            playerId: 1,
            activeFactionIds: [1, 2, 3, 4],
            aiFactionIds: [2, 3, 4],
            mapSize: "large",
            enableAI: true,
            enableWorldEvents: false,
            timeScale: 1
        });
        game.newGame(808080);

        const passable = game.state.territories.filter((territory) => !territory.isImpassable);
        passable.forEach((territory, index) => {
            territory.ownerId = index % 4 + 1;
            territory.units = 15 + index % 120;
            territory.railroad = index % 4 === 0;
            if (index % 13 === 0 && territory.terrain === "plain") territory.buildings = ["farm"];
        });
        for (let index = 0; index < Math.min(70, passable.length - 1); index += 1) {
            const source = passable[index];
            const destination = passable[(index * 7 + 23) % passable.length];
            game.state.armies.push(new C.Army({
                id: game.state.nextArmyId++,
                ownerId: source.ownerId,
                fromTerritoryId: source.id,
                toTerritoryId: destination.id,
                units: 5 + index % 45,
                durationMs: 60000,
                start: source.center,
                end: destination.center
            }));
        }

        const renderer = new C.MapRenderer(document.getElementById("benchmark-canvas"), game);
        renderer.setCameraPosition(game.state.mapWidth / 2, game.state.mapHeight / 2);
        for (let index = 0; index < 12; index += 1) renderer.render(index * 16.667);

        const renderSamples = [];
        for (let index = 0; index < 90; index += 1) {
            const startedAt = performance.now();
            renderer.render(1000 + index * 16.667);
            renderSamples.push(performance.now() - startedAt);
        }

        const networkBaseline = game.createNetworkSnapshot();
        const simulationAverageMs = averageDuration(600, () => game.update(16.667));
        const snapshotAverageMs = averageDuration(80, () => JSON.stringify(game.createNetworkSnapshot()));
        const currentSnapshot = game.createNetworkSnapshot();
        const snapshotBytes = new Blob([JSON.stringify(currentSnapshot)]).size;
        const patchAverageMs = averageDuration(80, () => JSON.stringify(game.createNetworkPatch(networkBaseline, currentSnapshot)));
        const patchBytes = new Blob([JSON.stringify(game.createNetworkPatch(networkBaseline, currentSnapshot))]).size;
        const result = {
            territories: game.state.territories.length,
            visibleTerritories: renderer.frameTerritories.length,
            armies: game.state.armies.length,
            renderAverageMs: Number((renderSamples.reduce((sum, value) => sum + value, 0) / renderSamples.length).toFixed(3)),
            renderMedianMs: Number(percentile(renderSamples, 0.50).toFixed(3)),
            renderP90Ms: Number(percentile(renderSamples, 0.90).toFixed(3)),
            renderP95Ms: Number(percentile(renderSamples, 0.95).toFixed(3)),
            simulationAverageMs: Number(simulationAverageMs.toFixed(3)),
            snapshotAverageMs: Number(snapshotAverageMs.toFixed(3)),
            snapshotBytes,
            patchAverageMs: Number(patchAverageMs.toFixed(3)),
            patchBytes,
            patchReductionPercent: Number(((1 - patchBytes / snapshotBytes) * 100).toFixed(1))
        };
        document.getElementById("result").textContent = JSON.stringify(result, null, 2);
        document.body.dataset.status = "pass";
    }

    run();
})(window.Conquest = window.Conquest || {});
