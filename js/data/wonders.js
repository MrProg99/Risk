(function (C) {
    "use strict";

    // Une merveille est construite une seule fois par faction, mais elle demeure
    // attachée à son territoire et peut donc changer de propriétaire.
    C.WONDER_TYPES = {
        megacity: {
            id: "megacity",
            name: "Mégapole",
            icon: "▤",
            branchId: "construction",
            prerequisiteTechnologyId: "wonder-megacity",
            constructionDurationMs: 180000,
            globalEffects: { productionMultiplier: 0.12 },
            siteEffects: { foodCapacity: 300 },
            description: "+12 % de recrutement global et +300 de capacité alimentaire par Mégapole contrôlée."
        },
        "grand-arsenal": {
            id: "grand-arsenal",
            name: "Grand Arsenal",
            icon: "⚒",
            branchId: "attack",
            prerequisiteTechnologyId: "wonder-grand-arsenal",
            constructionDurationMs: 180000,
            globalEffects: { attackMultiplier: 0.10 },
            siteEffects: { productionMultiplier: 0.30 },
            description: "+10 % d’attaque globale et +30 % de recrutement sur le territoire de l’Arsenal."
        },
        "big-bertha": {
            id: "big-bertha",
            name: "Grosse Bertha",
            icon: "☄",
            branchId: "attack",
            prerequisiteTechnologyId: "wonder-big-bertha",
            constructionDurationMs: 180000,
            globalEffects: { cannonReloadMultiplier: 0.15 },
            siteEffects: {
                fireIntervalMs: 15000,
                rangeHops: 3,
                hitChance: 0.75,
                flatDamage: 8,
                damageRatio: 0.05,
                maximumDamage: 18
            },
            description: "Bombarde automatiquement à trois territoires avec 75 % de précision et accélère de 15 % les canons ordinaires."
        },
        "monumental-citadel": {
            id: "monumental-citadel",
            name: "Citadelle monumentale",
            icon: "♜",
            branchId: "defense",
            prerequisiteTechnologyId: "wonder-monumental-citadel",
            constructionDurationMs: 180000,
            globalEffects: { defenseMultiplier: 0.10 },
            siteEffects: { adjacentDefenseMultiplier: 0.25 },
            description: "+10 % de défense globale et +25 % sur la Citadelle et ses territoires voisins contrôlés."
        },
        "orbital-station": {
            id: "orbital-station",
            name: "Station orbitale",
            icon: "✦",
            branchId: "abilities",
            prerequisiteTechnologyId: "wonder-orbital-station",
            constructionDurationMs: 180000,
            globalEffects: { abilityCooldownReduction: 0.15 },
            siteEffects: { visibilityRangeBonus: 1 },
            description: "−15 % sur les recharges des capacités et +1 de vision autour de la Station."
        }
    };

    C.getWonderType = function getWonderType(wonderId) {
        return C.WONDER_TYPES[wonderId] || null;
    };

    C.getUnlockedWonderTypes = function getUnlockedWonderTypes(faction) {
        if (!faction?.research) return [];
        return Object.values(C.WONDER_TYPES).filter((definition) =>
            faction.research.completedTechnologyIds.includes(definition.prerequisiteTechnologyId));
    };
})(window.Conquest = window.Conquest || {});
