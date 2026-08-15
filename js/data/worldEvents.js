(function (C) {
    "use strict";

    C.WORLD_EVENT_DEFINITIONS = {
        famine: {
            id: "famine",
            name: "Famine",
            icon: "∅",
            color: "#d4b76b",
            weight: 3,
            durationMinMs: 30000,
            durationMaxMs: 45000,
            warning: "Des récoltes inquiétantes annoncent une famine prochaine."
        },
        barbarianRaid: {
            id: "barbarianRaid",
            name: "Attaque barbare",
            icon: "⚔",
            color: "#c66b43",
            weight: 2,
            targetMin: 2,
            targetMax: 4,
            warning: "Des éclaireurs signalent plusieurs bandes barbares aux frontières."
        },
        wildfire: {
            id: "wildfire",
            name: "Feu de forêt",
            icon: "♨",
            color: "#ff844d",
            weight: 3,
            damageMinRatio: 0.10,
            damageMaxRatio: 0.25,
            visualDurationMs: 9000,
            warning: "Une sécheresse extrême augmente fortement le risque d’incendie."
        }
    };

    C.BARBARIAN_FACTION = {
        id: 0,
        name: "Barbares",
        color: "#b95f3d",
        accent: "#ffb07b",
        bonuses: {
            attackMultiplier: 1,
            combatMultiplier: 0.95,
            recruitmentMultiplier: 1,
            travelSpeedMultiplier: 1,
            sciencePowerBonusMultiplier: 1
        },
        research: { completedTechnologyIds: [], activeTechnologyId: null, progressMs: 0 }
    };
})(window.Conquest = window.Conquest || {});
