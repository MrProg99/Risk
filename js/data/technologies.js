(function (C) {
    "use strict";

    C.TECHNOLOGY_BRANCHES = [
        {
            id: "construction",
            name: "Construction",
            icon: "◆",
            color: "#e9bd63",
            description: "Développer la production et les réseaux logistiques.",
            technologyIds: ["construction-1", "construction-2", "construction-3", "construction-4"]
        },
        {
            id: "attack",
            name: "Attaque",
            icon: "⚔",
            color: "#ff766d",
            description: "Améliorer la puissance et la mobilité des offensives.",
            technologyIds: ["attack-1", "attack-2", "attack-3", "attack-4"]
        },
        {
            id: "defense",
            name: "Défense",
            icon: "⬟",
            color: "#57d8d0",
            description: "Renforcer les garnisons et les installations défensives.",
            technologyIds: ["defense-1", "defense-2", "defense-3", "defense-4"]
        }
    ];

    C.TECHNOLOGIES = {
        "construction-1": {
            id: "construction-1",
            branchId: "construction",
            tier: 1,
            name: "Planification rurale",
            description: "Recensement des ressources et organisation des premiers ateliers.",
            durationMs: 90000,
            prerequisiteId: null,
            effects: { productionMultiplier: 0.08 },
            effectLabel: "+8 % de production d’unités"
        },
        "construction-2": {
            id: "construction-2",
            branchId: "construction",
            tier: 2,
            name: "Chaînes d’assemblage",
            description: "Standardiser les pièces et accélérer la sortie des recrues.",
            durationMs: 135000,
            prerequisiteId: "construction-1",
            effects: { productionMultiplier: 0.10 },
            effectLabel: "+10 % de production d’unités"
        },
        "construction-3": {
            id: "construction-3",
            branchId: "construction",
            tier: 3,
            name: "Génie logistique",
            description: "Des routes militaires rendent tous les convois plus rapides.",
            durationMs: 195000,
            prerequisiteId: "construction-2",
            effects: { travelSpeedMultiplier: 0.10 },
            effectLabel: "+10 % de vitesse de déplacement"
        },
        "construction-4": {
            id: "construction-4",
            branchId: "construction",
            tier: 4,
            name: "Complexes autonomes",
            description: "Des centres intégrés soutiennent durablement l’effort de guerre.",
            durationMs: 270000,
            prerequisiteId: "construction-3",
            effects: { productionMultiplier: 0.15 },
            effectLabel: "+15 % de production d’unités"
        },
        "attack-1": {
            id: "attack-1",
            branchId: "attack",
            tier: 1,
            name: "Armes normalisées",
            description: "Un équipement uniforme augmente l’efficacité des troupes.",
            durationMs: 90000,
            prerequisiteId: null,
            effects: { attackMultiplier: 0.05 },
            effectLabel: "+5 % de puissance d’attaque"
        },
        "attack-2": {
            id: "attack-2",
            branchId: "attack",
            tier: 2,
            name: "Doctrine offensive",
            description: "Les formations coordonnées percent plus facilement les lignes ennemies.",
            durationMs: 135000,
            prerequisiteId: "attack-1",
            effects: { attackMultiplier: 0.07 },
            effectLabel: "+7 % de puissance d’attaque"
        },
        "attack-3": {
            id: "attack-3",
            branchId: "attack",
            tier: 3,
            name: "Colonnes motorisées",
            description: "La motorisation réduit le temps d’arrivée des armées.",
            durationMs: 195000,
            prerequisiteId: "attack-2",
            effects: { travelSpeedMultiplier: 0.10 },
            effectLabel: "+10 % de vitesse de déplacement"
        },
        "attack-4": {
            id: "attack-4",
            branchId: "attack",
            tier: 4,
            name: "Guerre combinée",
            description: "L’infanterie et les unités d’appui frappent comme une seule force.",
            durationMs: 270000,
            prerequisiteId: "attack-3",
            effects: { attackMultiplier: 0.10 },
            effectLabel: "+10 % de puissance d’attaque"
        },
        "defense-1": {
            id: "defense-1",
            branchId: "defense",
            tier: 1,
            name: "Ouvrages de campagne",
            description: "Des positions préparées protègent chaque garnison.",
            durationMs: 90000,
            prerequisiteId: null,
            effects: { defenseMultiplier: 0.06 },
            effectLabel: "+6 % de puissance défensive"
        },
        "defense-2": {
            id: "defense-2",
            branchId: "defense",
            tier: 2,
            name: "Réseaux fortifiés",
            description: "Les points d’appui se couvrent mutuellement sur tout le territoire.",
            durationMs: 135000,
            prerequisiteId: "defense-1",
            effects: { defenseMultiplier: 0.08 },
            effectLabel: "+8 % de puissance défensive"
        },
        "defense-3": {
            id: "defense-3",
            branchId: "defense",
            tier: 3,
            name: "Batteries protégées",
            description: "Les équipes de canon opèrent depuis des positions aménagées.",
            durationMs: 195000,
            prerequisiteId: "defense-2",
            effects: { cannonReloadMultiplier: 0.15 },
            effectLabel: "+15 % de cadence pour les canons"
        },
        "defense-4": {
            id: "defense-4",
            branchId: "defense",
            tier: 4,
            name: "Défense en profondeur",
            description: "Plusieurs lignes absorbent les offensives les plus puissantes.",
            durationMs: 270000,
            prerequisiteId: "defense-3",
            effects: { defenseMultiplier: 0.12 },
            effectLabel: "+12 % de puissance défensive"
        }
    };

    C.getFactionTechnologyBonus = function (faction, effectName) {
        if (!faction || !faction.research) return 0;
        return faction.research.completedTechnologyIds.reduce((sum, technologyId) => {
            const technology = C.TECHNOLOGIES[technologyId];
            return sum + (technology?.effects?.[effectName] || 0);
        }, 0);
    };
})(window.Conquest = window.Conquest || {});
