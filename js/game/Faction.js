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
        }

        toJSON() {
            return {
                id: this.id,
                name: this.name,
                color: this.color,
                accent: this.accent,
                bonuses: { ...this.bonuses },
                bonusLabel: this.bonusLabel,
                specialAbility: this.specialAbility
            };
        }
    }

    C.Faction = Faction;
})(window.Conquest = window.Conquest || {});
