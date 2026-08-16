(function (C) {
    "use strict";

    C.INSTALLATION_TYPES = {
        cannon: {
            id: "cannon",
            name: "Canon de campagne",
            icon: "✹",
            maximumPerMap: 2,
            fireIntervalMs: 5000,
            hitChance: 0.75,
            damage: 1,
            rangeHops: 1,
            bonusLabel: "Tire automatiquement sur un territoire ennemi adjacent · 75 % de toucher · recharge en 5 s"
        }
    };
})(window.Conquest = window.Conquest || {});
