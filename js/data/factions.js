(function (C) {
    "use strict";

    C.FACTION_DEFINITIONS = [
        {
            id: 1,
            name: "Empire",
            color: "#f0b84d",
            accent: "#ffe0a0",
            bonuses: {
                attackMultiplier: 1.15,
                combatMultiplier: 1,
                recruitmentMultiplier: 1,
                travelSpeedMultiplier: 1,
                sciencePowerBonusMultiplier: 1
            },
            bonusLabel: "+15 % de puissance d’attaque",
            specialAbility: null
        },
        {
            id: 2,
            name: "Technocrates",
            color: "#3fd1c7",
            accent: "#a4fff7",
            bonuses: {
                attackMultiplier: 1,
                combatMultiplier: 1,
                recruitmentMultiplier: 1,
                travelSpeedMultiplier: 1,
                sciencePowerBonusMultiplier: 1.2
            },
            bonusLabel: "+20 % aux bonus scientifiques et énergétiques",
            specialAbility: null
        },
        {
            id: 3,
            name: "Horde",
            color: "#ef655f",
            accent: "#ffb2ad",
            bonuses: {
                attackMultiplier: 1,
                combatMultiplier: 0.9,
                recruitmentMultiplier: 1.3,
                travelSpeedMultiplier: 1,
                sciencePowerBonusMultiplier: 1
            },
            bonusLabel: "+30 % recrutement, −10 % puissance de combat",
            specialAbility: null
        },
        {
            id: 4,
            name: "Nomades",
            color: "#8d78e8",
            accent: "#cfc4ff",
            bonuses: {
                attackMultiplier: 1,
                combatMultiplier: 1,
                recruitmentMultiplier: 1,
                travelSpeedMultiplier: 1.4,
                sciencePowerBonusMultiplier: 1
            },
            bonusLabel: "+40 % de vitesse de déplacement",
            specialAbility: null
        }
    ];
})(window.Conquest = window.Conquest || {});
