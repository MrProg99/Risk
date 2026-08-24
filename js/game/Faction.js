(function (C) {
    "use strict";

    class Faction {
        constructor(definition) {
            this.id = definition.id;
            this.definitionId = Number(definition.definitionId ?? definition.id);
            this.playerUid = definition.playerUid || null;
            this.playerName = definition.playerName || null;
            this.isAI = Boolean(definition.isAI);
            this.teamId = Number(definition.teamId ?? definition.id);
            this.name = definition.name;
            this.color = definition.color;
            this.accent = definition.accent;
            this.bonuses = { ...definition.bonuses };
            this.bonusLabel = definition.bonusLabel;
            this.specialAbility = definition.specialAbility;
            this.capitalTerritoryId = null;
            this.foodAttritionProgressMs = 0;
            this.lastFoodEventAtMs = -30000;
            this.research = {
                completedTechnologyIds: [],
                activeTechnologyId: null,
                progressMs: 0
            };
            this.abilityCooldowns = { missile: 0, reinforcement: 0, paratrooper: 0, nuclear: 0 };
        }

        toJSON() {
            return {
                id: this.id,
                definitionId: this.definitionId,
                playerUid: this.playerUid,
                playerName: this.playerName,
                isAI: this.isAI,
                teamId: this.teamId,
                name: this.name,
                color: this.color,
                accent: this.accent,
                bonuses: { ...this.bonuses },
                bonusLabel: this.bonusLabel,
                specialAbility: this.specialAbility,
                capitalTerritoryId: this.capitalTerritoryId,
                foodAttritionProgressMs: this.foodAttritionProgressMs,
                lastFoodEventAtMs: this.lastFoodEventAtMs,
                research: {
                    completedTechnologyIds: this.research.completedTechnologyIds.slice(),
                    activeTechnologyId: this.research.activeTechnologyId,
                    progressMs: this.research.progressMs
                },
                abilityCooldowns: { ...this.abilityCooldowns }
            };
        }
    }

    C.Faction = Faction;
})(window.Conquest = window.Conquest || {});
