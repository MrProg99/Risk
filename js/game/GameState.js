(function (C) {
    "use strict";

    class GameState {
        constructor() {
            this.seed = 0;
            this.mapWidth = 2800;
            this.mapHeight = 1800;
            this.islandPolygon = [];
            this.territories = [];
            this.factions = [];
            this.armies = [];
            this.reinforcementRoutes = [];
            this.worldEvents = [];
            this.abilityActions = [];
            this.events = [];
            this.elapsedMs = 0;
            this.nextArmyId = 1;
            this.nextReinforcementRouteId = 1;
            this.nextWorldEventId = 1;
            this.nextAbilityActionId = 1;
            this.nextWorldEventAtMs = 0;
            this.scheduledWorldEventType = null;
            this.worldEventWarningIssued = false;
            this.lastWorldEventType = null;
            this.revision = 0;
            this.winnerTeamId = null;
        }

        getTerritory(id) {
            return this.territories.find((territory) => territory.id === Number(id)) || null;
        }

        getFaction(id) {
            return this.factions.find((faction) => faction.id === Number(id)) || null;
        }

        getReinforcementRoute(id) {
            return this.reinforcementRoutes.find((route) => route.id === Number(id)) || null;
        }

        getTerritoriesOwnedBy(factionId) {
            return this.territories.filter((territory) => territory.ownerId === Number(factionId));
        }

        touch() {
            this.revision += 1;
        }

        toJSON() {
            return {
                seed: this.seed,
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
                events: this.events.slice(),
                elapsedMs: this.elapsedMs,
                nextArmyId: this.nextArmyId,
                nextReinforcementRouteId: this.nextReinforcementRouteId,
                nextWorldEventId: this.nextWorldEventId,
                nextAbilityActionId: this.nextAbilityActionId,
                nextWorldEventAtMs: this.nextWorldEventAtMs,
                scheduledWorldEventType: this.scheduledWorldEventType,
                worldEventWarningIssued: this.worldEventWarningIssued,
                lastWorldEventType: this.lastWorldEventType,
                revision: this.revision,
                winnerTeamId: this.winnerTeamId
            };
        }
    }

    C.GameState = GameState;
})(window.Conquest = window.Conquest || {});
