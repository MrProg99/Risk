(function (C) {
    "use strict";

    class Army {
        constructor({ id, ownerId, fromTerritoryId, toTerritoryId, units, durationMs, start, end, route = [], finalTerritoryId = null, isConvoy = false, reinforcementRouteId = null }) {
            this.id = id;
            this.ownerId = ownerId;
            this.fromTerritoryId = fromTerritoryId;
            this.toTerritoryId = toTerritoryId;
            this.units = units;
            this.durationMs = durationMs;
            this.elapsedMs = 0;
            this.start = { ...start };
            this.end = { ...end };
            this.route = route.slice();
            this.finalTerritoryId = finalTerritoryId || toTerritoryId;
            this.isConvoy = isConvoy;
            this.reinforcementRouteId = reinforcementRouteId;
        }

        get progress() {
            return C.Geometry.clamp(this.elapsedMs / this.durationMs, 0, 1);
        }

        toJSON() {
            return {
                id: this.id,
                ownerId: this.ownerId,
                fromTerritoryId: this.fromTerritoryId,
                toTerritoryId: this.toTerritoryId,
                units: this.units,
                durationMs: this.durationMs,
                elapsedMs: this.elapsedMs,
                start: this.start,
                end: this.end,
                route: this.route.slice(),
                finalTerritoryId: this.finalTerritoryId,
                isConvoy: this.isConvoy,
                reinforcementRouteId: this.reinforcementRouteId
            };
        }
    }

    C.Army = Army;
})(window.Conquest = window.Conquest || {});
