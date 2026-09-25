"use strict";

global.window = globalThis;

[
    "../js/data/territoryTypes.js",
    "../js/data/factions.js",
    "../js/data/installations.js",
    "../js/data/technologies.js",
    "../js/data/wonders.js",
    "../js/data/buildings.js",
    "../js/data/worldEvents.js",
    "../js/data/mapSizes.js",
    "../js/utils/geometry.js",
    "../js/game/Territory.js",
    "../js/game/Faction.js",
    "../js/game/Army.js",
    "../js/game/ReinforcementRoute.js",
    "../js/game/MatchTimeline.js",
    "../js/game/GameState.js",
    "../js/game/MapGenerator.js",
    "../js/game/CombatSystem.js",
    "../js/game/EventSystem.js",
    "../js/game/AIResearch.js",
    "../js/game/AIConstruction.js",
    "../js/game/AICombat.js",
    "../js/game/AISystem.js",
    "../js/game/TeamSignalSystem.js",
    "../js/game/Game.js"
].forEach(require);

const assert = require("node:assert/strict");
const C = globalThis.Conquest;
const game = new C.Game({
    playerId: 1,
    activeFactionIds: [1, 2],
    enableAI: false,
    enableWorldEvents: false,
    timeScale: 1
});
game.newGame(919191);

const passable = game.state.territories.filter((territory) => !territory.isImpassable);
const source = passable[0];
const destination = passable
    .filter((territory) => territory.id !== source.id && !source.isNeighbor(territory.id))
    .sort((first, second) => C.Geometry.distance(source.center, second.center) - C.Geometry.distance(source.center, first.center))[0];

passable.forEach((territory) => {
    territory.ownerId = null;
});
source.terrain = "airport";
source.ownerId = 1;
source.units = 100;
destination.terrain = "airport";
destination.ownerId = 1;
destination.units = 10;

assert.equal(game.findAlliedPath(1, source.id, destination.id), null);
assert.deepEqual(game.findReinforcementPath(1, source.id, destination.id), [source.id, destination.id]);

const sent = game.sendReinforcementRoute({
    playerId: 1,
    fromTerritoryId: source.id,
    toTerritoryId: destination.id,
    units: 20
});
assert.equal(sent.ok, true);
assert.equal(sent.army.isAirlift, true);
assert.equal(sent.army.route.length, 0);
assert.equal(sent.army.toJSON().isAirlift, true);

const remote = new C.Game({
    playerId: 2,
    activeFactionIds: [1, 2],
    enableAI: false,
    enableWorldEvents: false,
    timeScale: 1
});
remote.newGame(919191);
remote.applyNetworkSnapshot(game.createNetworkSnapshot());
assert.equal(remote.state.armies[0].isAirlift, true);

while (game.state.armies.includes(sent.army)) game.update(1000);
assert.ok(destination.units >= 30);

const continuous = game.createContinuousReinforcementRoute({
    playerId: 1,
    fromTerritoryId: source.id,
    toTerritoryId: destination.id
});
assert.equal(continuous.ok, true);
assert.equal(continuous.route.usesAirlift, true);
assert.equal(continuous.route.toJSON().usesAirlift, true);
remote.applyNetworkSnapshot(game.createNetworkSnapshot());
assert.equal(remote.state.reinforcementRoutes[0].usesAirlift, true);

destination.ownerId = 2;
assert.equal(game.canUseAirlift(1, source, destination), false);
assert.equal(game.sendReinforcementRoute({
    playerId: 1,
    fromTerritoryId: source.id,
    toTerritoryId: destination.id,
    units: 5
}).ok, false);

console.log("Pont aérien : tests réussis.");
