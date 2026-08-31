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
            this.airstrikeLastAction = null;
            this.productionMode = "units";
            this.productionModeChangedAtMs = 0;
            this.railroad = false;
            this.railroadConstructionActive = false;
            this.railroadConstructionProgressMs = 0;
            this.railroadPreviousProductionMode = null;
            this.buildings = [];
            this.buildingConstruction = null;
            this.wonderId = null;
            this.wonderBuilderFactionId = null;
            this.wonderConstruction = null;
            this.wonderActivationRemainingMs = 0;
            this.wonderActionProgressMs = 0;
            this.wonderLastAction = null;
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
                airstrikeLastAction: this.airstrikeLastAction ? { ...this.airstrikeLastAction } : null,
                productionMode: this.productionMode,
                productionModeChangedAtMs: this.productionModeChangedAtMs,
                railroad: this.railroad,
                railroadConstructionActive: this.railroadConstructionActive,
                railroadConstructionProgressMs: this.railroadConstructionProgressMs,
                railroadPreviousProductionMode: this.railroadPreviousProductionMode,
                buildings: this.buildings.slice(),
                buildingConstruction: this.buildingConstruction ? { ...this.buildingConstruction } : null,
                wonderId: this.wonderId,
                wonderBuilderFactionId: this.wonderBuilderFactionId,
                wonderConstruction: this.wonderConstruction ? { ...this.wonderConstruction } : null,
                wonderActivationRemainingMs: this.wonderActivationRemainingMs,
                wonderActionProgressMs: this.wonderActionProgressMs,
                wonderLastAction: this.wonderLastAction ? { ...this.wonderLastAction } : null
            };
        }
    }

    C.Territory = Territory;
})(window.Conquest = window.Conquest || {});
