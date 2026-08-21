// Fichier historique non chargé par index.html.
// La source officielle des terrains est ../data/territoryTypes.js.
(function (C) {
    "use strict";

    C.TERRITORY_TYPES = {
        lake: {
            id: "lake",
            name: "Lac",
            icon: "≈",
            resource: "Eau profonde",
            weight: 0,
            color: "#1d5968",
            productionMultiplier: 0,
            defenseMultiplier: 1,
            bonuses: ["Zone naturelle totalement infranchissable"]
        },
        plain: {
            id: "plain",
            name: "Plaine",
            icon: "◇",
            resource: null,
            weight: 26,
            color: "#758b78",
            productionMultiplier: 1,
            defenseMultiplier: 1,
            bonuses: ["Territoire équilibré, sans modificateur"]
        },
        agriculture: {
            id: "agriculture",
            name: "Agriculture",
            icon: "♨",
            resource: "Vivres",
            weight: 16,
            color: "#89a85d",
            productionMultiplier: 1.25,
            defenseMultiplier: 1,
            bonuses: ["25 % de production d’unités"]
        },
        mine: {
            id: "mine",
            name: "Mine",
            icon: "◆",
            resource: "Minerai",
            weight: 12,
            color: "#8d8478",
            productionMultiplier: 1,
            defenseMultiplier: 1.05,
            economyMultiplier: 1.2,
            bonuses: ["20 % de production économique", "5 % de défense grâce au relief"]
        },
        industry: {
            id: "industry",
            name: "Industrie",
            icon: "⚙",
            resource: "Capacité industrielle",
            weight: 12,
            color: "#718a91",
            productionMultiplier: 1.3,
            defenseMultiplier: 1,
            bonuses: ["30 % de vitesse de recrutement"]
        },
        fortress: {
            id: "fortress",
            name: "Forteresse",
            icon: "♜",
            resource: null,
            weight: 10,
            color: "#69727f",
            productionMultiplier: 1,
            defenseMultiplier: 1.4,
            bonuses: ["40 % de puissance défensive"]
        },
        science: {
            id: "science",
            name: "Centre scientifique",
            icon: "✦",
            resource: "Recherche",
            weight: 8,
            color: "#628da1",
            productionMultiplier: 1.1,
            defenseMultiplier: 1,
            bonuses: ["10 % de production générale"]
        },
        power: {
            id: "power",
            name: "Centrale",
            icon: "ϟ",
            resource: "Énergie",
            weight: 9,
            color: "#a08c55",
            productionMultiplier: 1.08,
            defenseMultiplier: 1,
            bonuses: ["Produit de l’énergie", "8 % de production générale"]
        },
        radar: {
            id: "radar",
            name: "Radar",
            icon: "⌁",
            resource: "Renseignement",
            weight: 7,
            color: "#578c88",
            productionMultiplier: 1,
            defenseMultiplier: 1.08,
            bonuses: ["Surveillance des frontières", "8 % de puissance défensive"]
        },
        airport: {
            id: "airport",
            name: "Aéroport",
            icon: "✈",
            resource: "Piste aérienne",
            weight: 6,
            color: "#4a6fa5",
            productionMultiplier: 1,
            defenseMultiplier: 1,
            bonuses: ["Frappe aérienne : élimine 10 % des troupes d’une cible dans un rayon de 4 territoires (survole les montagnes)", "Recharge des bombardiers en ~38 s"]
        }
    };

    C.RARE_SITES = [
        {
            id: "titanium",
            name: "Gisement de titane",
            icon: "Ti",
            resource: "Titane",
            productionMultiplier: 1.2,
            defenseMultiplier: 1,
            bonuses: ["20 % de recrutement", "45 % de valeur économique"]
        },
        {
            id: "ancient-fortress",
            name: "Ancienne forteresse",
            icon: "♛",
            resource: "Relique militaire",
            productionMultiplier: 1,
            defenseMultiplier: 1.75,
            bonuses: ["75 % de puissance défensive"]
        },
        {
            id: "great-dam",
            name: "Grand barrage",
            icon: "≋",
            resource: "Énergie majeure",
            productionMultiplier: 1.5,
            defenseMultiplier: 1.1,
            bonuses: ["50 % de recrutement", "10 % de puissance défensive"]
        },
        {
            id: "space-center",
            name: "Centre spatial",
            icon: "△",
            resource: "Données orbitales",
            productionMultiplier: 1.35,
            defenseMultiplier: 1,
            bonuses: ["35 % de production générale", "Site technologique majeur"]
        },
        {
            id: "metropolis",
            name: "Métropole",
            icon: "▥",
            resource: "Population",
            productionMultiplier: 1.7,
            defenseMultiplier: 1.12,
            bonuses: ["70 % de recrutement", "12 % de puissance défensive"]
        },
        {
            id: "industrial-complex",
            name: "Complexe industriel",
            icon: "▦",
            resource: "Industrie lourde",
            productionMultiplier: 1.55,
            defenseMultiplier: 1.08,
            bonuses: ["55 % de recrutement", "Production industrielle majeure"]
        }
    ];
})(window.Conquest = window.Conquest || {});
