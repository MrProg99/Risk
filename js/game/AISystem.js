(function (C) {
    "use strict";

    const PROFILES = {
        1: {
            name: "militaire",
            intervalMin: 2500,
            intervalMax: 3900,
            garrison: 5,
            safety: 1.12,
            sendFraction: 0.7,
            preferredTerrains: ["fortress", "industry", "mine"]
        },
        2: {
            name: "analytique",
            intervalMin: 3000,
            intervalMax: 4700,
            garrison: 5,
            safety: 1.3,
            sendFraction: 0.62,
            preferredTerrains: ["science", "power", "industry"]
        },
        3: {
            name: "agressif",
            intervalMin: 2100,
            intervalMax: 3400,
            garrison: 3,
            safety: 1.05,
            sendFraction: 0.76,
            preferredTerrains: ["agriculture", "plain"]
        },
        4: {
            name: "mobile",
            intervalMin: 2500,
            intervalMax: 3900,
            garrison: 4,
            safety: 1.16,
            sendFraction: 0.68,
            preferredTerrains: ["radar", "mine", "agriculture"]
        }
    };

    class AICoordination {
        constructor(ai) {
            this.ai = ai;
            this.signals = new Map();
        }

        reset() {
            this.signals.clear();
        }

        publish(factionId, domain, data) {
            const id = Number(factionId);
            const current = this.signals.get(id) || {};
            this.signals.set(id, { ...current, [domain]: data });
        }

        read(factionId, domain) {
            return this.signals.get(Number(factionId))?.[domain] || null;
        }

        getReservedTerritoryIds(factionId) {
            const plan = this.ai.offensivePlans.get(Number(factionId));
            const reserved = new Set(plan
                ? [plan.stagingTerritoryId, ...(plan.contributorIds || [])]
                : []);
            this.publish(factionId, "combat", { reservedTerritoryIds: [...reserved] });
            return reserved;
        }
    }

    class AISystem {
        constructor(game, options = {}) {
            this.game = game;
            this.enabled = options.enabled !== false;
            this.factionIds = options.factionIds || [2, 3, 4];
            this.research = new C.AIResearch(this);
            this.construction = new C.AIConstruction(this);
            this.combat = new C.AICombat(this);
            this.coordination = new AICoordination(this);
            // Keep the existing public handles for game setup and diagnostics.
            this.thinkTimers = this.combat.thinkTimers;
            this.rearSweepTimers = this.combat.rearSweepTimers;
            this.economyTimers = this.construction.economyTimers;
            this.offensivePlans = new Map();
            this.alliedAidCooldowns = new Map();
            this.ordersIssued = 0;
            this.continuousRoutesCreated = 0;
            this.offensivePlansCreated = 0;
            this.coordinatedAttacksLaunched = 0;
            this.decisiveAttacksLaunched = 0;
            this.opportunisticExpansionsLaunched = 0;
            this.rearRedistributionsSent = 0;
            this.researchChoicesMade = 0;
            this.abilitiesUsed = 0;
            this.alliedDefenseConvoysSent = 0;
            this.railroadsConstructed = 0;
            this.farmsConstructed = 0;
            this.minefieldsDeployed = 0;
            this.wondersConstructed = 0;
            this.reset();
        }

        reset() {
            this.ordersIssued = 0;
            this.continuousRoutesCreated = 0;
            this.offensivePlansCreated = 0;
            this.coordinatedAttacksLaunched = 0;
            this.decisiveAttacksLaunched = 0;
            this.opportunisticExpansionsLaunched = 0;
            this.rearRedistributionsSent = 0;
            this.researchChoicesMade = 0;
            this.abilitiesUsed = 0;
            this.alliedDefenseConvoysSent = 0;
            this.railroadsConstructed = 0;
            this.farmsConstructed = 0;
            this.minefieldsDeployed = 0;
            this.wondersConstructed = 0;
            this.thinkTimers.clear();
            this.rearSweepTimers.clear();
            this.economyTimers.clear();
            this.offensivePlans.clear();
            this.alliedAidCooldowns.clear();
            this.coordination.reset();
            this.factionIds.forEach((factionId, index) => {
                // Stagger the first decisions so several opponents do not act on one frame.
                this.thinkTimers.set(factionId, 1200 + index * 650 + this.randomBetween(0, 900));
                this.rearSweepTimers.set(factionId, 6000 + index * 850 + this.randomBetween(0, 1800));
                this.economyTimers.set(factionId, 900 + index * 420 + this.randomBetween(0, 700));
            });
            this.research.reset(this.factionIds, this.economyTimers);
            this.construction.reset(this.factionIds, this.thinkTimers);
        }

        update(deltaMs) {
            if (!this.enabled) return;
            this.factionIds.forEach((factionId) => {
                this.research.chooseNext(factionId);
                this.construction.updateEconomy(factionId, deltaMs);
                this.research.updateAllocation(factionId, deltaMs);
                this.combat.updateFaction(factionId, deltaMs);
                this.construction.updateProjects(factionId, deltaMs);
            });
        }

        getProfile(factionId) {
            const faction = this.game.state.getFaction(factionId);
            // Runtime IDs identify lobby slots; definitionId identifies the chosen race.
            const definitionId = faction?.definitionId ?? factionId;
            return PROFILES[definitionId] || PROFILES[2];
        }

        randomBetween(min, max) {
            const random = this.game && this.game.random ? this.game.random() : Math.random();
            return C.Geometry.lerp(min, max, random);
        }
    }

    // Decision code lives in the modules; the shared coordinator remains the
    // execution context so existing game commands and direct AI calls still work.
    for (const [field, Module, privateMethods] of [
        ["research", C.AIResearch, new Set(["constructor", "reset", "chooseNext", "updateAllocation"])],
        ["construction", C.AIConstruction, new Set(["constructor", "reset", "updateEconomy", "updateProjects"])],
        ["combat", C.AICombat, new Set(["constructor", "updateFaction"])]
    ]) {
        Object.getOwnPropertyNames(Module.prototype).forEach((name) => {
            if (privateMethods.has(name)) return;
            AISystem.prototype[name] = function (...args) {
                return this[field][name].apply(this, args);
            };
        });
    }

    C.AISystem = AISystem;
})(window.Conquest = window.Conquest || {});
