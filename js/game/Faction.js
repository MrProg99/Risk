(function (C) {
    "use strict";

    class Faction {
        constructor(definition) {
            this.id = definition.id;
            this.name = definition.name;
            this.color = definition.color;
            this.accent = definition.accent;
            this.bonuses = { ...definition.bonuses };
            this.bonusLabel = definition.bonusLabel;
            this.specialAbility = definition.specialAbility;
            this.capitalTerritoryId = null;
            this.research = {
                completedTechnologyIds: [],
                activeTechnologyId: null,
                progressMs: 0
            };
        }

        toJSON() {
            return {
                id: this.id,
                name: this.name,
                color: this.color,
                accent: this.accent,
                bonuses: { ...this.bonuses },
                bonusLabel: this.bonusLabel,
                specialAbility: this.specialAbility,
                capitalTerritoryId: this.capitalTerritoryId,
                research: {
                    completedTechnologyIds: this.research.completedTechnologyIds.slice(),
                    activeTechnologyId: this.research.activeTechnologyId,
                    progressMs: this.research.progressMs
                }
            };
        }
    }

    C.Faction = Faction;
})(window.Conquest = window.Conquest || {});
