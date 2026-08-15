(function (C) {
    "use strict";

    C.INSTALLATION_TYPES = {
        cannon: {
            id: "cannon",
            name: "Canon de campagne",
            icon: "✹",
            maximumPerMap: 2,
            fireIntervalMs: 8000,
            hitChance: 0.5,
            damage: 1,
            rangeHops: 1,
            bonusLabel: "Tire automatiquement sur un territoire ennemi adjacent · 50 % de toucher"
        }
    };
})(window.Conquest = window.Conquest || {});
