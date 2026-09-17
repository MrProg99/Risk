(function (C) {
    "use strict";

    class GameState {
        constructor(options = {}) {
            const mapSize = C.getMapSizeDefinition(options.mapSize);
            this._territoryById = new Map();
            this._factionById = new Map();
            this._reinforcementRouteById = new Map();
            this._territories = [];
            this._factions = [];
            this._reinforcementRoutes = [];
            this.seed = 0;
            this.mapType = "standard";
            this.mapSize = mapSize.id;
            this.chokeEdges = [];
            this.mapWidth = mapSize.width;
            this.mapHeight = mapSize.height;
            this.islandPolygon = [];
            this.territories = [];
            this.factions = [];
            this.armies = [];
            this.reinforcementRoutes = [];
            this.worldEvents = [];
            this.abilityActions = [];
            this.blackoutStates = [];
            this.teamSignals = [];
            this.nextTeamSignalId = 1;
            this.lastTeamSignalAtMs = {};
            this.events = [];
            this.matchTimeline = new C.MatchTimeline();
            this.elapsedMs = 0;
            this.nextArmyId = 1;
            this.nextReinforcementRouteId = 1;
            this.nextWorldEventId = 1;
            this.nextAbilityActionId = 1;
            this.nextWorldEventAtMs = 0;
            this.scheduledWorldEventType = null;
            this.worldEventWarningIssued = false;
            this.lastWorldEventType = null;
            this.nextVolcanicEruptionAtMs = 0;
            this.volcanicWarningIssued = false;
            this.scheduledVolcanicTerritoryIds = [];
            this.revision = 0;
            this.winnerTeamId = null;
            this.victoryAtMs = null;
        }

        get territories() {
            return this._territories;
        }

        set territories(territories) {
            this._territories = Array.isArray(territories) ? territories : [];
            this._territoryById = this.createIdIndex(this._territories);
        }

        get factions() {
            return this._factions;
        }

        set factions(factions) {
            this._factions = Array.isArray(factions) ? factions : [];
            this._factionById = this.createIdIndex(this._factions);
        }

        get reinforcementRoutes() {
            return this._reinforcementRoutes;
        }

        set reinforcementRoutes(routes) {
            this._reinforcementRoutes = Array.isArray(routes) ? routes : [];
            this._reinforcementRouteById = this.createIdIndex(this._reinforcementRoutes);
        }

        createIdIndex(collection) {
            const index = new Map();
            collection.forEach((item) => {
                const id = Number(item?.id);
                if (!Number.isNaN(id) && !index.has(id)) index.set(id, item);
            });
            return index;
        }

        rebuildIndexes() {
            this._territoryById = this.createIdIndex(this._territories);
            this._factionById = this.createIdIndex(this._factions);
            this._reinforcementRouteById = this.createIdIndex(this._reinforcementRoutes);
        }

        findAndCacheById(collection, index, id) {
            const normalizedId = Number(id);
            if (Number.isNaN(normalizedId)) return null;
            const indexed = index.get(normalizedId);
            if (indexed) return indexed;
            const found = collection.find((item) => item.id === normalizedId) || null;
            if (found) index.set(normalizedId, found);
            return found;
        }

        getTerritory(id) {
            return this.findAndCacheById(this._territories, this._territoryById, id);
        }

        getFaction(id) {
            return this.findAndCacheById(this._factions, this._factionById, id);
        }

        getReinforcementRoute(id) {
            return this.findAndCacheById(this._reinforcementRoutes, this._reinforcementRouteById, id);
        }

        getTerritoriesOwnedBy(factionId) {
            return this.territories.filter((territory) => territory.ownerId === Number(factionId));
        }

        touch() {
            this.revision += 1;
        }

        toJSON() {
            return {
                teamSignals: this.teamSignals.map((signal) => ({ ...signal })),
                nextTeamSignalId: this.nextTeamSignalId,
                lastTeamSignalAtMs: { ...this.lastTeamSignalAtMs },
                seed: this.seed,
                mapType: this.mapType,
                mapSize: this.mapSize,
                chokeEdges: this.chokeEdges.map((edge) => edge.slice()),
                mapWidth: this.mapWidth,
                mapHeight: this.mapHeight,
                islandPolygon: this.islandPolygon,
                territories: this.territories.map((territory) => territory.toJSON()),
                factions: this.factions.map((faction) => faction.toJSON()),
                armies: this.armies.map((army) => army.toJSON()),
                reinforcementRoutes: this.reinforcementRoutes.map((route) => route.toJSON()),
                worldEvents: this.worldEvents.map((worldEvent) => ({
                    ...worldEvent,
                    territoryIds: worldEvent.territoryIds.slice(),
                    data: { ...worldEvent.data }
                })),
                abilityActions: this.abilityActions.map((action) => ({ ...action })),
                blackoutStates: this.blackoutStates.map((blackout) => ({ ...blackout })),
                events: this.events.slice(),
                matchTimeline: this.matchTimeline.toJSON(),
                elapsedMs: this.elapsedMs,
                nextArmyId: this.nextArmyId,
                nextReinforcementRouteId: this.nextReinforcementRouteId,
                nextWorldEventId: this.nextWorldEventId,
                nextAbilityActionId: this.nextAbilityActionId,
                nextWorldEventAtMs: this.nextWorldEventAtMs,
                scheduledWorldEventType: this.scheduledWorldEventType,
                worldEventWarningIssued: this.worldEventWarningIssued,
                lastWorldEventType: this.lastWorldEventType,
                nextVolcanicEruptionAtMs: this.nextVolcanicEruptionAtMs,
                volcanicWarningIssued: this.volcanicWarningIssued,
                scheduledVolcanicTerritoryIds: this.scheduledVolcanicTerritoryIds.slice(),
                revision: this.revision,
                winnerTeamId: this.winnerTeamId,
                victoryAtMs: this.victoryAtMs
            };
        }
    }

    C.GameState = GameState;
})(window.Conquest = window.Conquest || {});
