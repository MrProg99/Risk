(function (C) {
    "use strict";

    // Les bâtiments sont définis dans les données plutôt que dans la simulation.
    // Ajouter un futur bâtiment consiste donc à déclarer ses terrains, sa recherche,
    // sa durée et ses effets, puis à enseigner à l'IA comment valoriser ces effets.
    C.BUILDING_TYPES = {
        farm: {
            id: "farm",
            name: "Ferme aménagée",
            icon: "▦",
            allowedTerrains: ["plain"],
            prerequisiteTechnologyId: "construction-agriculture",
            constructionDurationMs: 40000,
            effects: {
                foodCapacityWhenAssigned: 50
            },
            description: "Ajoute 50 nourritures lorsque cette plaine est affectée à la production alimentaire."
        }
    };

    C.getBuildingType = function getBuildingType(buildingId) {
        return C.BUILDING_TYPES[buildingId] || null;
    };
})(window.Conquest = window.Conquest || {});
