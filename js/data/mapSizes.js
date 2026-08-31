(function (C) {
    "use strict";

    const definitions = {
        standard: Object.freeze({
            id: "standard",
            name: "Carte actuelle",
            width: 2800,
            height: 1800,
            minimumTerritories: 110,
            maximumTerritories: 120,
            minimumLakes: 4,
            maximumLakes: 6,
            minimumAirports: 4
        }),
        large: Object.freeze({
            id: "large",
            name: "Grande carte",
            width: 3600,
            height: 2300,
            minimumTerritories: 165,
            maximumTerritories: 180,
            minimumLakes: 6,
            maximumLakes: 9,
            minimumAirports: 6
        })
    };

    C.MAP_SIZE_DEFINITIONS = Object.freeze(definitions);
    C.normalizeMapSize = (value) => value === "large" ? "large" : "standard";
    C.getMapSizeDefinition = (value) => definitions[C.normalizeMapSize(value)];
    C.normalizeMapType = (value) => ["hourglass", "archipelago"].includes(value) ? value : "standard";
    C.getMapTypeLabel = (value) => ({
        standard: "CONTINENT",
        hourglass: "SABLIER",
        archipelago: "ARCHIPEL"
    })[C.normalizeMapType(value)];
})(window.Conquest = window.Conquest || {});
