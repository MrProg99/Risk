(function (C) {
    "use strict";

    class ReinforcementRoute {
        constructor({ id, ownerId, fromTerritoryId, toTerritoryId, path, createdAt = 0, relayAllReinforcements = false }) {
            this.id = id;
            this.ownerId = ownerId;
            this.fromTerritoryId = fromTerritoryId;
            this.toTerritoryId = toTerritoryId;
            this.path = path.slice();
            this.createdAt = createdAt;
            this.active = true;
            this.isPaused = false;
            this.pauseReason = null;
            this.unitsDispatched = 0;
            this.unitsDelivered = 0;
            this.relayAllReinforcements = relayAllReinforcements;
            this.unitsRelayed = 0;
            this.initialGarrisonDispatched = 0;
        }

        toJSON() {
            return {
                id: this.id,
                ownerId: this.ownerId,
                fromTerritoryId: this.fromTerritoryId,
                toTerritoryId: this.toTerritoryId,
                path: this.path.slice(),
                createdAt: this.createdAt,
                active: this.active,
                isPaused: this.isPaused,
                pauseReason: this.pauseReason,
                unitsDispatched: this.unitsDispatched,
                unitsDelivered: this.unitsDelivered,
                relayAllReinforcements: this.relayAllReinforcements,
                unitsRelayed: this.unitsRelayed,
                initialGarrisonDispatched: this.initialGarrisonDispatched
            };
        }
    }

    C.ReinforcementRoute = ReinforcementRoute;
})(window.Conquest = window.Conquest || {});
