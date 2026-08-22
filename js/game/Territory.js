(function (C) {
    "use strict";

    class Territory {
        constructor({ id, name, polygon, center, terrain, resource = null, production = 1 }) {
            this.id = id;
            this.name = name;
            this.polygon = polygon;
            this.center = center;
            this.neighbors = [];
            this.blockedNeighbors = [];
            this.ownerId = null;
            this.units = 0;
            this.terrain = terrain;
            this.resource = resource;
            this.production = production;
            this.productionProgress = 0;
            this.rareSite = null;
            this.installation = null;
            this.installationProgressMs = 0;
            this.isImpassable = false;
            this.isCapital = false;
            this.isChokePoint = false;
            this.airstrikeCooldownMs = 0;
            this.productionMode = "units";
            this.productionModeChangedAtMs = 0;
        }

        isNeighbor(territoryId) {
            return this.neighbors.includes(Number(territoryId));
        }

        isPathBlocked(territoryId) {
            return this.blockedNeighbors.includes(Number(territoryId));
        }

        toJSON() {
            return {
                id: this.id,
                name: this.name,
                polygon: this.polygon,
                center: this.center,
                neighbors: this.neighbors,
                blockedNeighbors: this.blockedNeighbors,
                ownerId: this.ownerId,
                units: this.units,
                terrain: this.terrain,
                resource: this.resource,
                production: this.production,
                productionProgress: this.productionProgress,
                rareSite: this.rareSite,
                installation: this.installation,
                installationProgressMs: this.installationProgressMs,
                isImpassable: this.isImpassable,
                isCapital: this.isCapital,
                isChokePoint: this.isChokePoint,
                airstrikeCooldownMs: this.airstrikeCooldownMs,
                productionMode: this.productionMode,
                productionModeChangedAtMs: this.productionModeChangedAtMs
            };
        }
    }

    C.Territory = Territory;
})(window.Conquest = window.Conquest || {});
