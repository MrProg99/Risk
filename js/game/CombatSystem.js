(function (C) {
    "use strict";

    class CombatSystem {
        static resolve({ army, territory, attackerFaction, defenderFaction, random = Math.random }) {
            const territoryType = C.TERRITORY_TYPES[territory.terrain];
            const rareDefense = territory.rareSite ? territory.rareSite.defenseMultiplier : 1;
            const attackerCombat = attackerFaction ? attackerFaction.bonuses.combatMultiplier : 1;
            const defenderCombat = defenderFaction ? defenderFaction.bonuses.combatMultiplier : 1;
            const attackTechnology = 1 + C.getFactionTechnologyBonus(attackerFaction, "attackMultiplier");
            const defenseTechnology = 1 + C.getFactionTechnologyBonus(defenderFaction, "defenseMultiplier");
            const attackMultiplier = (attackerFaction ? attackerFaction.bonuses.attackMultiplier : 1) * attackerCombat * attackTechnology;
            const defenseMultiplier = territoryType.defenseMultiplier * rareDefense * defenderCombat * defenseTechnology;
            const attackRoll = 0.88 + random() * 0.24;
            const defenseRoll = 0.88 + random() * 0.24;
            const attackPower = army.units * attackMultiplier * attackRoll;
            const defensePower = territory.units * defenseMultiplier * defenseRoll;

            if (attackPower > defensePower) {
                const losses = Math.min(
                    army.units - 1,
                    Math.round((territory.units * defenseMultiplier / Math.max(attackMultiplier, 0.1)) * (0.72 + random() * 0.22))
                );
                return {
                    attackerWon: true,
                    attackerSurvivors: Math.max(1, army.units - losses),
                    defenderSurvivors: 0,
                    attackPower,
                    defensePower,
                    attackMultiplier,
                    defenseMultiplier
                };
            }

            const losses = Math.min(
                Math.max(0, territory.units - 1),
                Math.round((army.units * attackMultiplier / Math.max(defenseMultiplier, 0.1)) * (0.72 + random() * 0.22))
            );
            return {
                attackerWon: false,
                attackerSurvivors: 0,
                defenderSurvivors: Math.max(1, territory.units - losses),
                attackPower,
                defensePower,
                attackMultiplier,
                defenseMultiplier
            };
        }
    }

    C.CombatSystem = CombatSystem;
})(window.Conquest = window.Conquest || {});
