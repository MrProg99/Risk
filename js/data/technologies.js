(function (C) {
    "use strict";

    C.TECHNOLOGY_BRANCHES = [
        {
            id: "construction",
            name: "Construction",
            icon: "◆",
            color: "#e9bd63",
            description: "Développer la production et les réseaux logistiques.",
            technologyIds: ["construction-1", "construction-2", "construction-agriculture", "construction-3", "construction-4"]
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
        },
        {
            id: "abilities",
            name: "Capacités",
            icon: "☄",
            color: "#b58cff",
            description: "Débloquer puis améliorer des interventions stratégiques à long délai de récupération.",
            technologyIds: [
                "ability-missile", "ability-missile-2",
                "ability-reinforcement", "ability-reinforcement-2",
                "ability-paratrooper", "ability-paratrooper-2",
                "ability-nuclear", "ability-nuclear-2"
            ]
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
        "construction-agriculture": {
            id: "construction-agriculture",
            branchId: "construction",
            tier: 3,
            name: "Agriculture intensive",
            description: "Des cultures organisées augmentent la nourriture produite autour de chaque ville.",
            durationMs: 150000,
            prerequisiteId: "construction-2",
            effects: { territoryBaseFoodCapacityBonus: 10 },
            effectLabel: "Nourriture passive : 10 → 20 par territoire"
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
        },
        "ability-missile": {
            id: "ability-missile",
            branchId: "abilities",
            tier: 1,
            name: "Missile tactique",
            description: "Autorise une frappe mondiale sur un territoire ennemi visible.",
            durationMs: 240000,
            prerequisiteId: null,
            effects: { unlockAbility: "missile" },
            effectLabel: "Débloque le missile · recharge 3 min"
        },
        "ability-missile-2": {
            id: "ability-missile-2",
            branchId: "abilities",
            tier: 2,
            name: "Missile tactique II",
            description: "Une charge améliorée frappe plus durement les grandes concentrations ennemies.",
            durationMs: 300000,
            prerequisiteId: "ability-missile",
            effects: { upgradeAbility: "missile" },
            effectLabel: "Dégâts : 25 % → 35 % · maximum 40 → 60"
        },
        "ability-reinforcement": {
            id: "ability-reinforcement",
            branchId: "abilities",
            tier: 1,
            name: "Mobilisation d’urgence",
            description: "Mobilise immédiatement une réserve sur un territoire contrôlé.",
            durationMs: 210000,
            prerequisiteId: null,
            effects: { unlockAbility: "reinforcement" },
            effectLabel: "+35 unités · recharge 2 min 30"
        },
        "ability-reinforcement-2": {
            id: "ability-reinforcement-2",
            branchId: "abilities",
            tier: 2,
            name: "Mobilisation d’urgence II",
            description: "Des réserves régionales supplémentaires répondent à l’appel de mobilisation.",
            durationMs: 270000,
            prerequisiteId: "ability-reinforcement",
            effects: { upgradeAbility: "reinforcement" },
            effectLabel: "Renforts : 35 → 50 unités"
        },
        "ability-paratrooper": {
            id: "ability-paratrooper",
            branchId: "abilities",
            tier: 2,
            name: "Parachutistes",
            description: "Forme une unité aéroportée capable d’attaquer un territoire ennemi visible sans emprunter les frontières.",
            durationMs: 270000,
            prerequisiteId: "ability-reinforcement",
            effects: { unlockAbility: "paratrooper" },
            effectLabel: "Largage de 35 unités · recharge 4 min"
        },
        "ability-paratrooper-2": {
            id: "ability-paratrooper-2",
            branchId: "abilities",
            tier: 3,
            name: "Parachutistes II",
            description: "Une seconde vague accompagne chaque opération aéroportée.",
            durationMs: 330000,
            prerequisiteId: "ability-paratrooper",
            effects: { upgradeAbility: "paratrooper" },
            effectLabel: "Largage : 35 → 50 unités"
        },
        "ability-nuclear": {
            id: "ability-nuclear",
            branchId: "abilities",
            tier: 2,
            name: "Arme nucléaire",
            description: "Développe une ogive stratégique dont le souffle touche aussi les territoires voisins, sans distinction de camp.",
            durationMs: 360000,
            prerequisiteId: "ability-missile",
            effects: { unlockAbility: "nuclear" },
            effectLabel: "−30 % au centre · −15 % autour · recharge 5 min"
        },
        "ability-nuclear-2": {
            id: "ability-nuclear-2",
            branchId: "abilities",
            tier: 3,
            name: "Arme nucléaire II",
            description: "Une ogive thermonucléaire amplifie la destruction au point d’impact et dans sa périphérie.",
            durationMs: 450000,
            prerequisiteId: "ability-nuclear",
            effects: { upgradeAbility: "nuclear" },
            effectLabel: "Dégâts : 40 % au centre · 20 % autour"
        }
    };

    C.ABILITY_DEFINITIONS = {
        missile: {
            id: "missile",
            name: "Missile tactique",
            technologyId: "ability-missile",
            cooldownMs: 180000,
            warningMs: 5000,
            damageRatio: 0.25,
            maximumDamage: 40,
            level2: { damageRatio: 0.35, maximumDamage: 60 }
        },
        reinforcement: {
            id: "reinforcement",
            name: "Mobilisation d’urgence",
            technologyId: "ability-reinforcement",
            cooldownMs: 150000,
            units: 35,
            level2: { units: 50 }
        },
        paratrooper: {
            id: "paratrooper",
            name: "Parachutistes",
            technologyId: "ability-paratrooper",
            cooldownMs: 240000,
            warningMs: 7000,
            units: 35,
            level2: { units: 50 }
        },
        nuclear: {
            id: "nuclear",
            name: "Bombe nucléaire",
            technologyId: "ability-nuclear",
            cooldownMs: 300000,
            warningMs: 8000,
            effectDurationMs: 3200,
            centerDamageRatio: 0.30,
            adjacentDamageRatio: 0.15,
            level2: { centerDamageRatio: 0.40, adjacentDamageRatio: 0.20 }
        }
    };

    C.getFactionAbilityLevel = function (faction, abilityId) {
        const definition = C.ABILITY_DEFINITIONS[abilityId];
        if (!definition || !faction?.research?.completedTechnologyIds.includes(definition.technologyId)) return 0;
        return faction.research.completedTechnologyIds.includes(`${definition.technologyId}-2`) ? 2 : 1;
    };

    C.getFactionAbilityStats = function (faction, abilityId) {
        const definition = C.ABILITY_DEFINITIONS[abilityId];
        if (!definition) return null;
        return C.getFactionAbilityLevel(faction, abilityId) >= 2
            ? { ...definition, ...definition.level2 }
            : definition;
    };

    C.getFactionTechnologyBonus = function (faction, effectName) {
        if (!faction || !faction.research) return 0;
        return faction.research.completedTechnologyIds.reduce((sum, technologyId) => {
            const technology = C.TECHNOLOGIES[technologyId];
            return sum + (technology?.effects?.[effectName] || 0);
        }, 0);
    };
})(window.Conquest = window.Conquest || {});
