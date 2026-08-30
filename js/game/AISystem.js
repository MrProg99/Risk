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

    class AISystem {
        constructor(game, options = {}) {
            this.game = game;
            this.enabled = options.enabled !== false;
            this.factionIds = options.factionIds || [2, 3, 4];
            this.thinkTimers = new Map();
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
            this.wondersConstructed = 0;
            this.thinkTimers.clear();
            this.offensivePlans.clear();
            this.alliedAidCooldowns.clear();
            this.factionIds.forEach((factionId, index) => {
                // Les premiers ordres sont décalés pour éviter que les trois IA
                // ne jouent exactement sur la même image de simulation.
                this.thinkTimers.set(factionId, 1200 + index * 650 + this.randomBetween(0, 900));
            });
        }

        update(deltaMs) {
            if (!this.enabled) return;
            this.factionIds.forEach((factionId) => {
                let remaining = (this.thinkTimers.get(factionId) || 0) - deltaMs;
                if (remaining > 0) {
                    this.thinkTimers.set(factionId, remaining);
                    return;
                }

                this.think(factionId);
                const profile = this.getProfile(factionId);
                remaining = this.randomBetween(profile.intervalMin, profile.intervalMax);
                this.thinkTimers.set(factionId, remaining);
            });
        }

        think(factionId) {
            const state = this.game.state;
            const faction = state.getFaction(factionId);
            const owned = state.getTerritoriesOwnedBy(factionId);
            if (!faction || !owned.length) return false;

            this.chooseResearch(faction);

            // Une victoire locale Ã©vidente ne doit pas attendre la crÃ©ation de
            // routes logistiques ni la fin d'un autre plan de rassemblement.
            if (this.launchDecisiveAttack(faction, owned)) return true;

            if (this.manageResearchAllocation(faction, owned)) return true;

            if (this.manageFoodSupply(faction, owned)) return true;

            if (this.manageWonderConstruction(faction, owned)) return true;

            if (this.manageWonderDefense(faction, owned)) return true;

            if (this.manageFarmConstruction(faction, owned)) return true;

            if (this.manageRailroadConstruction(faction, owned)) return true;

            if (this.launchOpportunisticNeutralExpansion(faction, owned)) return true;

            if (this.considerAbilities(faction, owned)) return true;

            if (this.considerAlliedDefense(faction, owned)) return true;

            if (this.considerAirstrike(faction, owned)) return true;

            const plannedAction = this.advanceOffensivePlan(faction, owned);
            if (plannedAction !== null) return plannedAction;

            if (this.redistributeRearSurplus(faction, owned)) return true;

            if (this.manageContinuousReinforcements(faction, owned)) return true;

            // Les convois d'une ligne continue ne consomment pas les créneaux
            // d'ordres tactiques. Sans cette distinction, quelques unités de
            // production en transit suffisent à bloquer toutes les offensives.
            const movingArmies = state.armies.filter((army) =>
                army.ownerId === factionId && !army.reinforcementRouteId).length;
            const maximumArmies = this.getMaximumTacticalArmies(owned.length);
            if (movingArmies >= maximumArmies) return false;

            const attack = this.findBestAttack(faction, owned);
            if (attack && this.issueOrder(factionId, attack.source.id, attack.target.id, attack.units)) {
                return true;
            }

            const newPlan = this.findOffensivePlan(faction, owned);
            if (newPlan) {
                this.offensivePlans.set(faction.id, newPlan);
                this.offensivePlansCreated += 1;
                const staging = state.getTerritory(newPlan.stagingTerritoryId);
                const target = state.getTerritory(newPlan.targetTerritoryId);
                this.game.addLogisticsEvent(`${faction.name} prépare une offensive contre ${target.name} et rassemble ses forces à ${staging.name}.`, faction.id, "combat");
                return this.advanceOffensivePlan(faction, owned) ?? false;
            }

            const reinforcement = this.findBestReinforcement(faction, owned);
            if (reinforcement) {
                return this.issueOrder(factionId, reinforcement.source.id, reinforcement.target.id, reinforcement.units);
            }
            return false;
        }

        launchDecisiveAttack(faction, owned) {
            const state = this.game.state;
            const movingArmies = state.armies.filter((army) =>
                army.ownerId === faction.id && !army.reinforcementRouteId).length;
            if (movingArmies >= this.getMaximumTacticalArmies(owned.length)) return false;

            const attack = this.findBestAttack(faction, owned, {
                enemyOnly: true,
                minimumPowerRatio: 1.35
            });
            if (!attack || !this.issueOrder(faction.id, attack.source.id, attack.target.id, attack.units)) return false;
            this.decisiveAttacksLaunched += 1;
            return true;
        }

        redistributeRearSurplus(faction, owned) {
            const state = this.game.state;
            const profile = this.getProfile(faction.id);
            const targets = this.rankLogisticsTargets(faction, owned);
            if (!targets.length) return false;

            const activeRedistributions = state.armies.filter((army) =>
                army.ownerId === faction.id && army.isConvoy && !army.reinforcementRouteId && army.logisticsPurpose === "rear-redistribution");
            if (activeRedistributions.length >= 2) return false;

            const activeSourceIds = new Set(activeRedistributions.map((army) => army.fromTerritoryId));
            const candidates = [];
            owned.forEach((source) => {
                if (activeSourceIds.has(source.id)) return;
                const hostileNeighbors = source.neighbors
                    .map((territoryId) => state.getTerritory(territoryId))
                    .filter((neighbor) => neighbor && !neighbor.isImpassable && !source.isPathBlocked(neighbor.id) && !this.game.areAllied(neighbor.ownerId, faction.id));
                if (hostileNeighbors.length) return;

                const reserve = profile.garrison +
                    (source.isCapital ? 15 : 0) +
                    (source.installation ? 8 : 0) +
                    (source.rareSite ? 5 : 0) +
                    (source.wonderId || source.wonderConstruction ? 28 : 0);
                const surplus = source.units - reserve;
                if (surplus < 12) return;

                targets.slice(0, 4).forEach((targetEntry) => {
                    const target = targetEntry.territory;
                    const path = this.game.findOwnedPath(faction.id, source.id, target.id);
                    if (!path || path.length < 3) return;
                    candidates.push({
                        source,
                        target,
                        path,
                        reserve,
                        surplus,
                        score: surplus * 1.4 + targetEntry.score * 6 - path.length * .55
                    });
                });
            });

            candidates.sort((first, second) => second.score - first.score);
            const best = candidates[0];
            if (!best) return false;
            const units = Math.max(8, Math.floor(best.surplus * .7));
            const result = this.game.executeCommand({
                type: "SEND_REINFORCEMENT_ROUTE",
                playerId: faction.id,
                fromTerritoryId: best.source.id,
                toTerritoryId: best.target.id,
                units
            });
            if (!result.ok) return false;
            result.army.logisticsPurpose = "rear-redistribution";
            this.ordersIssued += 1;
            this.rearRedistributionsSent += 1;
            return true;
        }

        launchOpportunisticNeutralExpansion(faction, owned) {
            const state = this.game.state;
            const profile = this.getProfile(faction.id);
            const attackMultiplier = this.game.getFactionAttackMultiplier(faction.id);
            const capital = state.getTerritory(faction.capitalTerritoryId);
            const mapMiddleX = state.mapWidth / 2;
            const capitalSide = capital ? Math.sign(capital.center.x - mapMiddleX) : 0;

            // Ce créneau d'expansion est indépendant de la limite habituelle des
            // armées tactiques, mais une seule conquête neutre peut l'utiliser.
            const expansionAlreadyMoving = state.armies.some((army) => {
                if (army.ownerId !== faction.id || army.isConvoy || army.reinforcementRouteId) return false;
                const destination = state.getTerritory(army.finalTerritoryId ?? army.toTerritoryId);
                return destination?.ownerId === null;
            });
            if (expansionAlreadyMoving) return false;

            const candidates = [];
            owned.forEach((source) => {
                const available = source.units - profile.garrison;
                if (available < 2) return;
                source.neighbors.forEach((neighborId) => {
                    const target = state.getTerritory(neighborId);
                    if (!target || target.isImpassable || target.ownerId !== null || source.isPathBlocked(target.id)) return;
                    const defensePower = Math.max(1, target.units * this.game.getDefenseMultiplier(target));
                    const required = Math.ceil((defensePower / Math.max(attackMultiplier, .1)) * profile.safety) + 1;
                    const projectedPower = available * attackMultiplier;
                    if (available < required || projectedPower < defensePower * 1.5) return;

                    const targetSide = Math.sign(target.center.x - mapMiddleX);
                    const sameHourglassSide = state.mapType === "hourglass" && capitalSide !== 0 && targetSide === capitalSide;
                    const type = C.TERRITORY_TYPES[target.terrain];
                    const decisiveUnits = Math.ceil((defensePower * 1.65) / Math.max(attackMultiplier, .1));
                    candidates.push({
                        source,
                        target,
                        units: C.Geometry.clamp(Math.max(required, decisiveUnits), 1, available),
                        score: (sameHourglassSide ? 100 : 0) +
                            (type.productionMultiplier - 1) * 18 +
                            (target.rareSite ? 20 : 0) +
                            (target.wonderId ? 90 : 0) +
                            projectedPower / defensePower * 5 -
                            target.units * .12
                    });
                });
            });

            candidates.sort((first, second) => second.score - first.score);
            const best = candidates[0];
            if (!best) return false;
            const result = this.game.executeCommand({
                type: "SEND_ARMY",
                playerId: faction.id,
                fromTerritoryId: best.source.id,
                toTerritoryId: best.target.id,
                units: best.units
            });
            if (!result.ok) return false;
            this.ordersIssued += 1;
            this.opportunisticExpansionsLaunched += 1;
            return true;
        }

        getFoodTerritoryLimit(territoryCount, foodRatio) {
            if (territoryCount <= 0) return 0;
            const maximumShare = foodRatio < 0.70 ? 0.40 : foodRatio < 0.85 ? 0.30 : 0.20;
            return Math.max(1, Math.ceil(territoryCount * maximumShare));
        }

        getResearchTerritoryLimit(territoryCount) {
            if (territoryCount < 6) return 0;
            if (territoryCount < 12) return 1;
            if (territoryCount <= 20) return 2;
            return 3;
        }

        getResearchThreat(factionId, origin, maximumDistance = 2) {
            const visited = new Set([origin.id]);
            let frontier = [origin];
            let hostileStrength = 0;
            let hostileCount = 0;
            for (let distance = 1; distance <= maximumDistance && frontier.length; distance += 1) {
                const next = [];
                frontier.forEach((territory) => {
                    territory.neighbors.forEach((neighborId) => {
                        if (visited.has(neighborId) || territory.isPathBlocked(neighborId)) return;
                        visited.add(neighborId);
                        const neighbor = this.game.state.getTerritory(neighborId);
                        if (!neighbor || neighbor.isImpassable) return;
                        if (neighbor.ownerId !== null && !this.game.areAllied(neighbor.ownerId, factionId)) {
                            hostileStrength += neighbor.units;
                            hostileCount += 1;
                            return;
                        }
                        if (this.game.areAllied(neighbor.ownerId, factionId)) next.push(neighbor);
                    });
                });
                frontier = next;
            }
            return { hostileStrength, hostileCount };
        }

        manageResearchAllocation(faction, owned) {
            const state = this.game.state;
            const food = this.game.getFactionFoodState(faction.id);
            const researchTerritories = owned.filter((territory) => territory.productionMode === "research");
            const limit = this.getResearchTerritoryLimit(owned.length);
            const activeResearch = Boolean(faction.research.activeTechnologyId);
            const minimumModeDurationMs = 45000;
            const canChange = (territory) =>
                state.elapsedMs - (territory.productionModeChangedAtMs || 0) >= minimumModeDurationMs;
            const hostileBorderIds = new Set();
            owned.forEach((territory) => territory.neighbors.forEach((neighborId) => {
                if (territory.isPathBlocked(neighborId)) return;
                const neighbor = state.getTerritory(neighborId);
                if (neighbor && !neighbor.isImpassable && neighbor.ownerId !== null && !this.game.areAllied(neighbor.ownerId, faction.id)) {
                    hostileBorderIds.add(neighbor.id);
                }
            }));
            const hostileBorderStrength = [...hostileBorderIds]
                .reduce((sum, territoryId) => sum + state.getTerritory(territoryId).units, 0);
            const ownStrength = owned.reduce((sum, territory) => sum + territory.units, 0) +
                state.armies.filter((army) => army.ownerId === faction.id).reduce((sum, army) => sum + army.units, 0);
            const underMilitaryPressure = hostileBorderStrength > ownStrength * 0.90;
            const foodStable = food.demand > 0 && food.ratio >= 1.20;
            const foodUnsafe = food.demand > 0 && food.ratio < 1.10;

            const unsafeResearch = researchTerritories.map((territory) => ({
                territory,
                threat: this.getResearchThreat(faction.id, territory)
            })).filter((entry) => entry.threat.hostileCount > 0);
            const mustReduce = !activeResearch || researchTerritories.length > limit || foodUnsafe || underMilitaryPressure;
            if (researchTerritories.length && (mustReduce || unsafeResearch.length)) {
                const candidates = researchTerritories
                    .filter((territory) => mustReduce || unsafeResearch.some((entry) => entry.territory.id === territory.id))
                    .filter((territory) => foodUnsafe || underMilitaryPressure || canChange(territory))
                    .map((territory) => {
                        const threat = this.getResearchThreat(faction.id, territory);
                        return {
                            territory,
                            score: threat.hostileStrength + threat.hostileCount * 60 - this.game.getTerritoryResearchBonus(territory) * 100
                        };
                    })
                    .sort((first, second) => second.score - first.score);
                if (candidates.length) {
                    const result = this.game.executeCommand({
                        type: "SET_TERRITORY_MODE",
                        playerId: faction.id,
                        territoryId: candidates[0].territory.id,
                        mode: "units"
                    });
                    if (result.ok) {
                        this.ordersIssued += 1;
                        return true;
                    }
                }
            }

            if (!activeResearch || researchTerritories.length >= limit || !foodStable || underMilitaryPressure) return false;
            const activeRouteSources = new Set(state.reinforcementRoutes
                .filter((route) => route.active && route.ownerId === faction.id)
                .map((route) => route.fromTerritoryId));
            const candidates = owned
                .filter((territory) => territory.productionMode === "units" && canChange(territory))
                .filter((territory) => !territory.isCapital && !territory.installation && territory.terrain !== "airport")
                .filter((territory) => !territory.rareSite || territory.rareSite.id === "space-center")
                .filter((territory) => !activeRouteSources.has(territory.id))
                .map((territory) => ({
                    territory,
                    threat: this.getResearchThreat(faction.id, territory),
                    bonus: territory.rareSite?.id === "space-center"
                        ? 0.35
                        : territory.terrain === "science"
                            ? 0.25
                            : territory.terrain === "power" ? 0.15 : 0.10
                }))
                .filter((entry) => entry.threat.hostileCount === 0)
                .map((entry) => ({
                    ...entry,
                    score: entry.bonus * 200 - this.game.getProductionMultiplier(entry.territory) * 8 + entry.territory.units * 0.03
                }))
                .sort((first, second) => second.score - first.score);
            if (!candidates.length) return false;
            const result = this.game.executeCommand({
                type: "SET_TERRITORY_MODE",
                playerId: faction.id,
                territoryId: candidates[0].territory.id,
                mode: "research"
            });
            if (result.ok) {
                this.ordersIssued += 1;
                return true;
            }
            return false;
        }

        manageFoodSupply(faction, owned) {
            const state = this.game.state;
            const food = this.game.getFactionFoodState(faction.id);
            const minimumModeDurationMs = 45000;
            // L'IA accepte une armée allant jusqu'à 110 % de sa capacité
            // alimentaire avant de sacrifier une ville au mode nourriture.
            const toleratedFoodLoad = 1.10;
            const conversionThreshold = 1 / toleratedFoodLoad;
            const criticalThreshold = 0.70;
            const returnThreshold = 1.15;
            const returnSafetyFloor = 0.98;
            const normalFoodLimit = this.getFoodTerritoryLimit(owned.length, 1);
            const currentFoodCount = owned.filter((territory) => territory.productionMode === "food").length;
            const foodTerritoryLimit = this.getFoodTerritoryLimit(owned.length, food.ratio);
            const canChange = (territory) =>
                state.elapsedMs - (territory.productionModeChangedAtMs || 0) >= minimumModeDurationMs;

            if (food.demand > 0 && food.ratio < conversionThreshold && currentFoodCount < foodTerritoryLimit) {
                const critical = food.ratio < criticalThreshold;
                const candidates = owned
                    .filter((territory) => territory.productionMode === "units" && (critical || canChange(territory)))
                    .filter((territory) => critical || (!territory.isCapital && !territory.installation && !territory.rareSite && territory.terrain !== "airport"))
                    .map((territory) => {
                        const hostileNeighbors = territory.neighbors
                            .map((id) => state.getTerritory(id))
                            .filter((neighbor) => neighbor && !neighbor.isImpassable && !this.game.areAllied(neighbor.ownerId, faction.id)).length;
                        const capacity = this.game.getPotentialTerritoryFoodCapacity(territory);
                        const strategicPenalty = (territory.isCapital ? 120 : 0) +
                            (territory.installation ? 70 : 0) +
                            (territory.rareSite ? 50 : 0) +
                            (territory.terrain === "airport" ? 45 : 0);
                        return { territory, score: capacity * 2 - hostileNeighbors * 110 - strategicPenalty };
                    })
                    .sort((first, second) => second.score - first.score);
                const selected = candidates[0]?.territory;
                if (selected) {
                    const result = this.game.executeCommand({
                        type: "SET_TERRITORY_MODE",
                        playerId: faction.id,
                        territoryId: selected.id,
                        mode: "food"
                    });
                    if (result.ok) {
                        this.ordersIssued += 1;
                        return true;
                    }
                }
            }

            const hasExcessFoodTerritories = currentFoodCount > normalFoodLimit;
            if (food.ratio > returnThreshold || hasExcessFoodTerritories) {
                const candidates = owned
                    .filter((territory) => territory.productionMode === "food" && canChange(territory))
                    .map((territory) => {
                        const contribution = this.game.getTerritoryFoodCapacity(territory);
                        const capacityAfterChange = food.capacity - contribution;
                        const requiredSafety = hasExcessFoodTerritories ? conversionThreshold : returnSafetyFloor;
                        if (food.demand > 0 && capacityAfterChange / food.demand < requiredSafety) return null;
                        const hostileNeighbors = territory.neighbors
                            .map((id) => state.getTerritory(id))
                            .filter((neighbor) => neighbor && !neighbor.isImpassable && !this.game.areAllied(neighbor.ownerId, faction.id)).length;
                        const militaryValue = this.game.getProductionMultiplier({ ...territory, productionMode: "units" });
                        return { territory, score: hostileNeighbors * 30 + militaryValue * 10 - contribution * 0.1 };
                    })
                    .filter(Boolean)
                    .sort((first, second) => second.score - first.score);
                const selected = candidates[0]?.territory;
                if (selected) {
                    const result = this.game.executeCommand({
                        type: "SET_TERRITORY_MODE",
                        playerId: faction.id,
                        territoryId: selected.id,
                        mode: "units"
                    });
                    if (result.ok) {
                        this.ordersIssued += 1;
                        return true;
                    }
                }
            }
            return false;
        }

        manageFarmConstruction(faction, owned) {
            const definition = C.getBuildingType("farm");
            if (!definition || !faction.research.completedTechnologyIds.includes(definition.prerequisiteTechnologyId)) return false;
            if (owned.some((territory) => territory.buildingConstruction)) return false;

            const food = this.game.getFactionFoodState(faction.id);
            // La ferme est une réserve pour la croissance prochaine, pas une réaction
            // de panique : sous 95 %, l'IA doit d'abord réaffecter des villes existantes.
            if (food.demand <= 0 || food.ratio >= 1.35) return false;
            const existingFarms = owned.filter((territory) => territory.buildings.includes(definition.id)).length;
            const farmLimit = C.Geometry.clamp(Math.ceil(owned.length / 8), 1, 8);
            if (existingFarms >= farmLimit) return false;

            const state = this.game.state;
            const routeSources = new Set(state.reinforcementRoutes
                .filter((route) => route.active && route.ownerId === faction.id)
                .map((route) => route.fromTerritoryId));
            const candidates = owned
                .filter((territory) => definition.allowedTerrains.includes(territory.terrain))
                .filter((territory) => !territory.buildings.includes(definition.id) && !this.game.isTerritoryUnderConstruction(territory))
                .filter((territory) => !territory.isCapital && !territory.installation && !territory.rareSite && !territory.railroad)
                .filter((territory) => !routeSources.has(territory.id) && ["units", "food"].includes(territory.productionMode))
                .map((territory) => {
                    const hostileNeighbors = territory.neighbors
                        .map((neighborId) => state.getTerritory(neighborId))
                        .filter((neighbor) => neighbor && !neighbor.isImpassable && !this.game.areAllied(neighbor.ownerId, faction.id)).length;
                    if (hostileNeighbors > 0) return null;
                    const suspendedFood = this.game.getTerritoryPassiveFoodCapacity(territory) + this.game.getTerritoryFoodCapacity(territory);
                    const constructionRatio = (food.capacity - suspendedFood) / food.demand;
                    if (constructionRatio < 0.95) return null;
                    const alliedNeighbors = territory.neighbors
                        .map((neighborId) => state.getTerritory(neighborId))
                        .filter((neighbor) => neighbor && !neighbor.isImpassable && this.game.areAllied(neighbor.ownerId, faction.id)).length;
                    return {
                        territory,
                        score: (territory.productionMode === "food" ? 80 : 0) + alliedNeighbors * 7 - territory.units * 0.15 - this.game.getProductionMultiplier(territory) * 5
                    };
                })
                .filter(Boolean)
                .sort((first, second) => second.score - first.score);
            const selected = candidates[0]?.territory;
            if (!selected) return false;
            const result = this.game.executeCommand({
                type: "BUILD_TERRITORY_BUILDING",
                playerId: faction.id,
                territoryId: selected.id,
                buildingId: definition.id
            });
            if (!result.ok) return false;
            this.ordersIssued += 1;
            this.farmsConstructed += 1;
            return true;
        }

        chooseWonder(faction, owned, definitions = C.getUnlockedWonderTypes(faction)) {
            if (!definitions.length) return null;
            const food = this.game.getFactionFoodState(faction.id);
            const demandToCapacity = food.capacity > 0 ? food.demand / food.capacity : 2;
            let hostilePower = 0;
            let borderPower = 0;
            owned.forEach((territory) => {
                const hostiles = territory.neighbors
                    .map((territoryId) => this.game.state.getTerritory(territoryId))
                    .filter((neighbor) => neighbor && !neighbor.isImpassable && !territory.isPathBlocked(neighbor.id) && !this.game.areAllied(neighbor.ownerId, faction.id));
                if (!hostiles.length) return;
                borderPower += territory.units;
                hostilePower += hostiles.reduce((sum, territory) => sum + territory.units, 0);
            });
            const pressure = hostilePower / Math.max(1, borderPower);
            const abilityLevels = ["missile", "reinforcement", "paratrooper", "nuclear"]
                .reduce((sum, abilityId) => sum + C.getFactionAbilityLevel(faction, abilityId), 0);
            const profileId = Number(faction.definitionId ?? faction.id);
            const visibility = this.game.getTerritoryVisibilityMap(faction.id);
            const largestVisibleEnemy = this.game.state.territories
                .filter((territory) =>
                    visibility.has(territory.id) &&
                    territory.ownerId !== null &&
                    !territory.isImpassable &&
                    !this.game.areAllied(territory.ownerId, faction.id))
                .reduce((largest, territory) => Math.max(largest, territory.units), 0);
            const controlledCannons = owned.filter((territory) => territory.installation?.type === "cannon").length;
            const scores = {
                megacity: 28 + Math.max(0, demandToCapacity - 0.72) * 85 + (profileId === 2 ? 16 : 0),
                "grand-arsenal": 30 + Math.max(0, 1.25 - pressure) * 22 + ([1, 3].includes(profileId) ? 18 : 0),
                "big-bertha": 24 + Math.min(45, largestVisibleEnemy * 0.12) + controlledCannons * 5 + ([1, 3].includes(profileId) ? 14 : profileId === 2 ? 8 : 0),
                "monumental-citadel": 25 + Math.min(2, pressure) * 42 + (profileId === 4 ? 10 : 0),
                "orbital-station": 18 + abilityLevels * 8 + (profileId === 2 ? 12 : 0)
            };
            return definitions.slice().sort((first, second) =>
                (scores[second.id] || 0) - (scores[first.id] || 0))[0] || null;
        }

        getWonderFrontDistance(factionId, origin, maximumDistance = 7) {
            const visited = new Set([origin.id]);
            let frontier = [origin];
            for (let distance = 0; distance <= maximumDistance && frontier.length; distance += 1) {
                const next = [];
                for (const territory of frontier) {
                    const touchesHostile = territory.neighbors.some((neighborId) => {
                        if (territory.isPathBlocked(neighborId)) return false;
                        const neighbor = this.game.state.getTerritory(neighborId);
                        return neighbor && !neighbor.isImpassable && !this.game.areAllied(neighbor.ownerId, factionId);
                    });
                    if (touchesHostile) return distance;
                    territory.neighbors.forEach((neighborId) => {
                        if (visited.has(neighborId) || territory.isPathBlocked(neighborId)) return;
                        const neighbor = this.game.state.getTerritory(neighborId);
                        if (!neighbor || neighbor.isImpassable || neighbor.ownerId !== factionId) return;
                        visited.add(neighborId);
                        next.push(neighbor);
                    });
                }
                frontier = next;
            }
            return maximumDistance + 1;
        }

        manageWonderConstruction(faction, owned) {
            if (faction.constructedWonderId || owned.some((territory) => territory.wonderConstruction?.builderFactionId === faction.id)) return false;
            const unlocked = C.getUnlockedWonderTypes(faction);
            if (!unlocked.length || owned.length < 6) return false;
            const definition = this.chooseWonder(faction, owned, unlocked);
            if (!definition) return false;
            const food = this.game.getFactionFoodState(faction.id);
            if (food.demand > 0 && food.ratio < 0.95) return false;
            const state = this.game.state;
            const routeTerritoryIds = new Set(state.reinforcementRoutes
                .filter((route) => route.active && route.ownerId === faction.id)
                .flatMap((route) => route.path));
            const candidates = owned
                .filter((territory) => !territory.wonderId && !this.game.isTerritoryUnderConstruction(territory))
                .filter((territory) => ["units", "food", "research"].includes(territory.productionMode) && territory.units >= 8)
                .map((territory) => {
                    const suspendedFood = this.game.getTerritoryPassiveFoodCapacity(territory) + this.game.getTerritoryFoodCapacity(territory);
                    if (food.demand > 0 && (food.capacity - suspendedFood) / food.demand < 0.92) return null;
                    const frontDistance = this.getWonderFrontDistance(faction.id, territory);
                    const alliedNeighbors = territory.neighbors
                        .map((territoryId) => state.getTerritory(territoryId))
                        .filter((neighbor) => neighbor && !neighbor.isImpassable && neighbor.ownerId === faction.id && !territory.isPathBlocked(neighbor.id)).length;
                    const base = alliedNeighbors * 8 + (territory.railroad ? 24 : 0) + (routeTerritoryIds.has(territory.id) ? 18 : 0) + Math.min(frontDistance, 5) * 9;
                    let specialization = 0;
                    if (definition.id === "megacity") specialization = (territory.isCapital ? 48 : 0) + (frontDistance >= 3 ? 25 : -40) + (territory.terrain === "agriculture" || territory.terrain === "plain" ? 12 : 0);
                    else if (definition.id === "grand-arsenal") specialization = (frontDistance >= 2 && frontDistance <= 4 ? 34 : 0) + (territory.railroad ? 30 : 0) + (territory.terrain === "industry" ? 24 : 0);
                    else if (definition.id === "big-bertha") {
                        const visibility = this.game.getTerritoryVisibilityMap(faction.id);
                        const targets = this.game.getTerritoriesWithinHops(territory, definition.siteEffects.rangeHops)
                            .filter((target) =>
                                visibility.has(target.id) &&
                                !target.isImpassable &&
                                target.ownerId !== null &&
                                !this.game.areAllied(target.ownerId, faction.id));
                        const bombardmentValue = targets.reduce((best, target) => Math.max(best,
                            this.game.getBigBerthaDamage(target) * 2 +
                            (target.wonderId ? 28 : 0) +
                            (target.isCapital ? 16 : 0)), 0);
                        specialization = (frontDistance >= 2 && frontDistance <= 3 ? 48 : frontDistance >= 4 ? 8 : -20) +
                            (territory.railroad ? 24 : 0) +
                            (["industry", "fortress"].includes(territory.terrain) ? 20 : 0) +
                            Math.min(55, bombardmentValue);
                    }
                    else if (definition.id === "monumental-citadel") specialization = (frontDistance === 1 ? 50 : frontDistance === 2 ? 38 : 0) + (territory.isChokePoint ? 65 : 0) + (territory.terrain === "fortress" ? 28 : 0);
                    else specialization = (territory.isCapital ? 25 : 0) + (frontDistance >= 3 ? 30 : -25) + (["science", "power", "radar"].includes(territory.terrain) ? 28 : 0);
                    return { territory, score: base + specialization + Math.min(territory.units, 45) * 0.4 };
                })
                .filter(Boolean)
                .sort((first, second) => second.score - first.score);
            const selected = candidates[0]?.territory;
            if (!selected) return false;
            const result = this.game.executeCommand({
                type: "BUILD_WONDER",
                playerId: faction.id,
                territoryId: selected.id,
                wonderId: definition.id
            });
            if (!result.ok) return false;
            this.ordersIssued += 1;
            this.wondersConstructed += 1;
            return true;
        }

        manageWonderDefense(faction, owned) {
            const state = this.game.state;
            const wonders = owned.filter((territory) => territory.wonderId || territory.wonderConstruction);
            if (!wonders.length) return false;
            const incomingWonderIds = new Set(state.armies
                .filter((army) => army.ownerId === faction.id && army.isConvoy)
                .map((army) => army.finalTerritoryId ?? army.toTerritoryId));
            const targets = wonders
                .filter((territory) => !incomingWonderIds.has(territory.id))
                .map((territory) => {
                    const definition = C.getWonderType(territory.wonderId || territory.wonderConstruction?.wonderId);
                    const desired = definition?.id === "monumental-citadel" ? 55 : definition?.id === "big-bertha" ? 52 : territory.wonderConstruction ? 38 : 45;
                    const hostileStrength = territory.neighbors
                        .map((territoryId) => state.getTerritory(territoryId))
                        .filter((neighbor) => neighbor && !neighbor.isImpassable && !territory.isPathBlocked(neighbor.id) && !this.game.areAllied(neighbor.ownerId, faction.id))
                        .reduce((sum, neighbor) => sum + neighbor.units, 0);
                    return { territory, desired, missing: Math.max(0, desired + Math.ceil(hostileStrength * 0.35) - territory.units) };
                })
                .filter((entry) => entry.missing >= 6)
                .sort((first, second) => second.missing - first.missing);
            const target = targets[0];
            if (!target) return false;
            const profile = this.getProfile(faction.id);
            const donors = owned
                .filter((territory) => territory.id !== target.territory.id && territory.units > profile.garrison + 10)
                .map((territory) => {
                    const path = this.game.findOwnedPath(faction.id, territory.id, target.territory.id);
                    if (!path) return null;
                    const hostileNeighbor = territory.neighbors.some((neighborId) => {
                        const neighbor = state.getTerritory(neighborId);
                        return neighbor && !neighbor.isImpassable && !territory.isPathBlocked(neighbor.id) && !this.game.areAllied(neighbor.ownerId, faction.id);
                    });
                    if (hostileNeighbor) return null;
                    const reserve = profile.garrison + (territory.isCapital ? 12 : 0) + (territory.wonderId ? 25 : 0);
                    const surplus = territory.units - reserve;
                    return surplus >= 6 ? { territory, path, surplus, score: surplus - path.length * 2 } : null;
                })
                .filter(Boolean)
                .sort((first, second) => second.score - first.score);
            const donor = donors[0];
            if (!donor) return false;
            const result = this.game.executeCommand({
                type: "SEND_REINFORCEMENT_ROUTE",
                playerId: faction.id,
                fromTerritoryId: donor.territory.id,
                toTerritoryId: target.territory.id,
                units: Math.min(donor.surplus, target.missing)
            });
            if (!result.ok) return false;
            result.army.logisticsPurpose = "wonder-defense";
            this.ordersIssued += 1;
            return true;
        }

        manageRailroadConstruction(faction, owned) {
            if (!faction.research.completedTechnologyIds.includes("construction-railroad")) return false;
            const state = this.game.state;
            const activeConstructions = owned.filter((territory) => territory.railroadConstructionActive);
            const simultaneousLimit = C.Geometry.clamp(Math.floor((owned.length + 5) / 10), 1, 3);
            if (activeConstructions.length >= simultaneousLimit) return false;

            const food = this.game.getFactionFoodState(faction.id);
            if (food.demand > 0 && food.ratio < 1.25) return false;
            const activeRouteSources = new Set(state.reinforcementRoutes
                .filter((route) => route.active && route.ownerId === faction.id)
                .map((route) => route.fromTerritoryId));
            const candidates = owned
                .filter((territory) => !territory.railroad && !territory.railroadConstructionActive && territory.productionMode === "units")
                .filter((territory) => !territory.neighbors.some((neighborId) => {
                    if (territory.isPathBlocked(neighborId)) return false;
                    const neighbor = state.getTerritory(neighborId);
                    return neighbor && !neighbor.isImpassable && neighbor.ownerId !== null && !this.game.areAllied(neighbor.ownerId, faction.id);
                }))
                .map((territory) => {
                    const suspendedFood = this.game.getTerritoryPassiveFoodCapacity(territory) + this.game.getTerritoryFoodCapacity(territory);
                    const projectedRatio = food.demand > 0 ? (food.capacity - suspendedFood) / food.demand : 1;
                    if (projectedRatio < 1.20) return null;
                    const alliedNeighbors = territory.neighbors
                        .map((neighborId) => state.getTerritory(neighborId))
                        .filter((neighbor) => neighbor && !neighbor.isImpassable && this.game.areAllied(neighbor.ownerId, faction.id));
                    const railroadNeighbors = alliedNeighbors.filter((neighbor) => neighbor.railroad).length;
                    const connectedRoute = activeRouteSources.has(territory.id) ? 1 : 0;
                    const capitalValue = territory.isCapital ? 1 : 0;
                    const strategicValue = (territory.rareSite ? 12 : 0) + (territory.installation ? 10 : 0) + (territory.terrain === "airport" ? 8 : 0);
                    return {
                        territory,
                        score: railroadNeighbors * 70 + connectedRoute * 60 + capitalValue * 55 + alliedNeighbors.length * 8 + strategicValue - this.game.getProductionMultiplier(territory) * 4
                    };
                })
                .filter(Boolean)
                .sort((first, second) => second.score - first.score);
            const selected = candidates[0]?.territory;
            if (!selected) return false;
            const result = this.game.executeCommand({
                type: "BUILD_RAILROAD",
                playerId: faction.id,
                territoryId: selected.id
            });
            if (!result.ok) return false;
            this.ordersIssued += 1;
            this.railroadsConstructed += 1;
            return true;
        }

        considerAlliedDefense(faction, owned) {
            const state = this.game.state;
            const profile = this.getProfile(faction.id);
            const alliedTargets = state.territories.filter((territory) =>
                territory.ownerId !== null &&
                territory.ownerId !== faction.id &&
                !territory.isImpassable &&
                this.game.areAllied(territory.ownerId, faction.id));
            if (!alliedTargets.length) return false;

            const activeAidArmies = state.armies.filter((army) => {
                if (army.ownerId !== faction.id || !army.isConvoy) return false;
                const destination = state.getTerritory(army.finalTerritoryId);
                return destination && destination.ownerId !== faction.id && this.game.areAllied(destination.ownerId, faction.id);
            });
            if (activeAidArmies.length >= 2) return false;

            const donorEntries = owned.map((territory) => {
                const hostileNeighbors = territory.neighbors
                    .map((id) => state.getTerritory(id))
                    .filter((neighbor) => neighbor && neighbor.ownerId !== null && !neighbor.isImpassable && !this.game.areAllied(neighbor.ownerId, faction.id)).length;
                const reserve = profile.garrison + hostileNeighbors * 3 + (territory.isCapital ? 5 : 0);
                const surplus = Math.max(0, territory.units - reserve);
                return { territory, surplus, hostileNeighbors };
            }).filter((entry) => entry.surplus >= 2);
            const totalSurplus = donorEntries.reduce((sum, entry) => sum + entry.surplus, 0);
            const activeAidUnits = activeAidArmies.reduce((sum, army) => sum + army.units, 0);
            const aidBudget = Math.max(0, Math.floor(totalSurplus * 0.25) - activeAidUnits);
            if (aidBudget < 2) return false;

            const candidates = alliedTargets.map((target) => {
                const adjacentHostiles = target.neighbors
                    .map((id) => state.getTerritory(id))
                    .filter((neighbor) => neighbor && neighbor.ownerId !== null && !neighbor.isImpassable && !target.isPathBlocked(neighbor.id) && !this.game.areAllied(neighbor.ownerId, faction.id));
                const incomingHostileUnits = state.armies
                    .filter((army) => army.finalTerritoryId === target.id && !this.game.areAllied(army.ownerId, faction.id))
                    .reduce((sum, army) => sum + army.units, 0);
                const incomingAidUnits = state.armies
                    .filter((army) => army.finalTerritoryId === target.id && this.game.areAllied(army.ownerId, faction.id))
                    .reduce((sum, army) => sum + army.units, 0);
                const hostileStrength = adjacentHostiles.reduce((sum, neighbor) => sum + neighbor.units, 0) + incomingHostileUnits;
                const effectiveDefense = Math.max(1, target.units + incomingAidUnits);
                const danger = hostileStrength / effectiveDefense;
                if (danger < 0.90) return null;
                const cooldownKey = `${faction.id}:${target.id}`;
                if (state.elapsedMs - (this.alliedAidCooldowns.get(cooldownKey) ?? -Infinity) < 20000) return null;
                const strategicValue = (target.isCapital ? 50 : 0) +
                    (target.installation ? 25 : 0) +
                    (target.rareSite ? 15 : 0) +
                    (target.wonderId || target.wonderConstruction ? 65 : 0) +
                    (target.terrain === "airport" ? 12 : 0) +
                    (target.productionMode === "food" ? 18 : target.productionMode === "research" ? 15 : 0);
                return { target, danger, hostileStrength, incomingAidUnits, cooldownKey, score: danger * 45 + strategicValue };
            }).filter(Boolean).sort((a, b) => b.score - a.score);

            for (const candidate of candidates) {
                const donors = donorEntries.map((entry) => {
                    const path = this.game.findAlliedPath(faction.id, entry.territory.id, candidate.target.id);
                    if (!path) return null;
                    const score = entry.surplus - (path.length - 1) * 2 - entry.hostileNeighbors * 9;
                    return { ...entry, path, score };
                }).filter(Boolean).sort((a, b) => b.score - a.score);
                const donor = donors[0];
                if (!donor) continue;

                const desired = Math.max(2, Math.ceil(candidate.hostileStrength * 1.10 - candidate.target.units - candidate.incomingAidUnits));
                let units = Math.min(donor.surplus, aidBudget, desired);
                const recipientFood = this.game.getFactionFoodState(candidate.target.ownerId);
                const capitalEmergency = candidate.target.isCapital && candidate.danger >= 1.15;
                const minimumFoodRatio = capitalEmergency ? 0.75 : 1;
                const maximumSupportedUnits = Math.floor(recipientFood.capacity / minimumFoodRatio - recipientFood.demand);
                units = Math.min(units, maximumSupportedUnits);
                if (units < 2) continue;

                const result = this.game.executeCommand({
                    type: "SEND_REINFORCEMENT_ROUTE",
                    playerId: faction.id,
                    fromTerritoryId: donor.territory.id,
                    toTerritoryId: candidate.target.id,
                    units
                });
                if (!result.ok) continue;
                this.alliedAidCooldowns.set(candidate.cooldownKey, state.elapsedMs);
                this.alliedDefenseConvoysSent += 1;
                this.ordersIssued += 1;
                return true;
            }
            return false;
        }

        considerAirstrike(faction, owned) {
            const airports = owned.filter((territory) =>
                territory.terrain === "airport" && territory.airstrikeCooldownMs <= 0);
            if (!airports.length) return false;

            let best = null;
            airports.forEach((airport) => {
                const candidates = this.game.getTerritoriesWithinHops(airport, this.game.airstrikeRangeHops)
                    .filter((target) => !target.isImpassable && !this.game.areAllied(target.ownerId, faction.id) && target.units > 1);

                candidates.forEach((target) => {
                    const priority = target.units +
                        (target.rareSite ? 15 : 0) +
                        (target.installation?.type === "cannon" ? 10 : 0) +
                        (target.isCapital ? 20 : 0) +
                        (target.wonderId ? 45 : 0) +
                        (target.ownerId !== null ? 5 : 0);
                    if (!best || priority > best.priority) {
                        best = { airport, target, priority };
                    }
                });
            });
            if (!best) return false;

            const result = this.game.executeCommand({
                type: "AIRSTRIKE",
                playerId: faction.id,
                fromTerritoryId: best.airport.id,
                toTerritoryId: best.target.id
            });
            if (result.ok) this.ordersIssued += 1;
            return result.ok;
        }

        considerAbilities(faction, owned) {
            const completed = faction.research.completedTechnologyIds;
            const cooldowns = faction.abilityCooldowns || {};

            if (completed.includes(C.ABILITY_DEFINITIONS.reinforcement.technologyId) && (cooldowns.reinforcement || 0) <= 0) {
                const definition = C.getFactionAbilityStats(faction, "reinforcement");
                const food = this.game.getFactionFoodState(faction.id);
                const targets = owned.map((territory) => {
                    const hostileStrength = territory.neighbors
                        .map((id) => this.game.state.getTerritory(id))
                        .filter((neighbor) => neighbor && !neighbor.isImpassable && !this.game.areAllied(neighbor.ownerId, faction.id))
                        .reduce((sum, neighbor) => sum + neighbor.units, 0);
                    const danger = hostileStrength / Math.max(1, territory.units);
                    const strategic = (territory.isCapital ? 45 : 0) + (territory.installation ? 14 : 0) + (territory.rareSite ? 10 : 0) + (territory.wonderId || territory.wonderConstruction ? 55 : 0);
                    return { territory, danger, score: danger * 35 + strategic - territory.units * 0.12 };
                }).sort((a, b) => b.score - a.score);
                const best = targets[0];
                const freeCapacity = food.capacity - food.demand;
                const emergency = best && best.territory.isCapital && best.danger >= 0.9;
                if (best && best.danger >= 1.15 && (freeCapacity >= definition.units || emergency)) {
                    const result = this.game.executeCommand({ type: "USE_ABILITY", playerId: faction.id, abilityId: "reinforcement", targetTerritoryId: best.territory.id });
                    if (result.ok) {
                        this.abilitiesUsed += 1;
                        this.ordersIssued += 1;
                        return true;
                    }
                }
            }

            if (completed.includes(C.ABILITY_DEFINITIONS.paratrooper.technologyId) && (cooldowns.paratrooper || 0) <= 0) {
                const definition = C.getFactionAbilityStats(faction, "paratrooper");
                const visibility = this.game.getTerritoryVisibilityMap(faction.id);
                const attackMultiplier = this.game.getFactionAttackMultiplier(faction.id);
                const candidates = this.game.state.territories
                    .filter((territory) => territory.ownerId !== null && !territory.isImpassable &&
                        !this.game.areAllied(territory.ownerId, faction.id) && visibility.has(territory.id))
                    .map((territory) => {
                        const defensePower = Math.max(1, territory.units * this.game.getDefenseMultiplier(territory));
                        const powerRatio = definition.units * attackMultiplier / defensePower;
                        const alliedNeighbors = territory.neighbors
                            .map((territoryId) => this.game.state.getTerritory(territoryId))
                            .filter((neighbor) => neighbor && this.game.areAllied(neighbor.ownerId, faction.id)).length;
                        const deepStrikeValue = alliedNeighbors === 0 ? 18 : alliedNeighbors === 1 ? 7 : 0;
                        const strategicValue = (territory.isCapital ? 18 : 0) +
                            (territory.installation ? 13 : 0) +
                            (territory.terrain === "airport" ? 12 : 0) +
                            (territory.productionMode === "food" ? 9 : territory.productionMode === "research" ? 8 : 0) +
                            (territory.rareSite ? 10 : 0) +
                            (territory.wonderId ? 70 : 0);
                        return { territory, powerRatio, score: powerRatio * 14 + deepStrikeValue + strategicValue - territory.units * 0.12 };
                    })
                    .filter((candidate) => candidate.powerRatio >= 1.25)
                    .sort((first, second) => second.score - first.score);
                if (candidates.length) {
                    const result = this.game.executeCommand({
                        type: "USE_ABILITY",
                        playerId: faction.id,
                        abilityId: "paratrooper",
                        targetTerritoryId: candidates[0].territory.id
                    });
                    if (result.ok) {
                        this.abilitiesUsed += 1;
                        this.ordersIssued += 1;
                        return true;
                    }
                }
            }

            if (completed.includes(C.ABILITY_DEFINITIONS.nuclear.technologyId) && (cooldowns.nuclear || 0) <= 0) {
                const definition = C.getFactionAbilityStats(faction, "nuclear");
                const visibility = this.game.getTerritoryVisibilityMap(faction.id);
                const candidates = this.game.state.territories
                    .filter((territory) => territory.ownerId !== null && !territory.isImpassable && !this.game.areAllied(territory.ownerId, faction.id) && visibility.has(territory.id))
                    .map((territory) => {
                        const impactZone = [territory, ...territory.neighbors
                            .map((territoryId) => this.game.state.getTerritory(territoryId))
                            .filter((neighbor) => neighbor && !neighbor.isImpassable)];
                        let enemyLosses = 0;
                        let alliedLosses = 0;
                        impactZone.forEach((affected) => {
                            const ratio = affected.id === territory.id ? definition.centerDamageRatio : definition.adjacentDamageRatio;
                            const expectedLoss = affected.units > 1
                                ? Math.min(affected.units - 1, Math.max(1, Math.round(affected.units * ratio)))
                                : 0;
                            if (this.game.areAllied(affected.ownerId, faction.id)) alliedLosses += expectedLoss;
                            else enemyLosses += expectedLoss;
                        });
                        const strategicValue = (territory.isCapital ? 18 : 0) + (territory.installation ? 9 : 0) + (territory.rareSite ? 7 : 0) + (territory.wonderId ? 45 : 0);
                        return { territory, enemyLosses, alliedLosses, score: enemyLosses + strategicValue - alliedLosses * 3 };
                    })
                    .filter((candidate) => candidate.enemyLosses >= 12 && candidate.alliedLosses <= candidate.enemyLosses * 0.2)
                    .sort((a, b) => b.score - a.score);
                if (candidates.length && candidates[0].score >= 14) {
                    const result = this.game.executeCommand({ type: "USE_ABILITY", playerId: faction.id, abilityId: "nuclear", targetTerritoryId: candidates[0].territory.id });
                    if (result.ok) {
                        this.abilitiesUsed += 1;
                        this.ordersIssued += 1;
                        return true;
                    }
                }
            }

            if (completed.includes(C.ABILITY_DEFINITIONS.missile.technologyId) && (cooldowns.missile || 0) <= 0) {
                const visibility = this.game.getTerritoryVisibilityMap(faction.id);
                const candidates = this.game.state.territories
                    .filter((territory) => !territory.isImpassable && !this.game.areAllied(territory.ownerId, faction.id) && visibility.has(territory.id) && territory.units >= 12)
                    .map((territory) => ({
                        territory,
                        score: territory.units + (territory.isCapital ? 28 : 0) + (territory.installation ? 16 : 0) + (territory.terrain === "airport" ? 14 : 0) + (territory.productionMode === "food" ? 10 : territory.productionMode === "research" ? 9 : 0) + (territory.rareSite ? 12 : 0) + (territory.wonderId ? 55 : 0)
                    }))
                    .sort((a, b) => b.score - a.score);
                if (candidates.length) {
                    const result = this.game.executeCommand({ type: "USE_ABILITY", playerId: faction.id, abilityId: "missile", targetTerritoryId: candidates[0].territory.id });
                    if (result.ok) {
                        this.abilitiesUsed += 1;
                        this.ordersIssued += 1;
                        return true;
                    }
                }
            }
            return false;
        }

        advanceOffensivePlan(faction, owned) {
            const plan = this.offensivePlans.get(faction.id);
            if (!plan) return null;

            const state = this.game.state;
            const profile = this.getProfile(faction.id);
            const staging = state.getTerritory(plan.stagingTerritoryId);
            const target = state.getTerritory(plan.targetTerritoryId);
            const planExpired = state.elapsedMs >= plan.expiresAt;
            const frontStillOpen = staging && target &&
                !target.isImpassable &&
                staging.ownerId === faction.id &&
                !this.game.areAllied(target.ownerId, faction.id) &&
                staging.isNeighbor(target.id) &&
                !staging.isPathBlocked(target.id);
            if (planExpired || !frontStillOpen) {
                this.offensivePlans.delete(faction.id);
                return null;
            }

            const requiredUnits = this.getCoordinatedAttackRequirement(faction, target);
            plan.requiredUnits = requiredUnits;
            const availableAtFront = Math.max(0, staging.units - profile.garrison);
            const tacticalArmies = state.armies.filter((army) =>
                army.ownerId === faction.id && !army.reinforcementRouteId);
            const attackAlreadyLaunched = tacticalArmies.some((army) =>
                !army.isConvoy && army.toTerritoryId === target.id);
            if (attackAlreadyLaunched) return true;

            const maximumArmies = this.getMaximumTacticalArmies(owned.length);
            if (availableAtFront >= requiredUnits) {
                if (tacticalArmies.length >= maximumArmies) return true;
                const attackUnits = Math.min(
                    availableAtFront,
                    Math.max(requiredUnits, Math.floor(availableAtFront * 0.92))
                );
                if (this.issueOrder(faction.id, staging.id, target.id, attackUnits)) {
                    this.offensivePlans.delete(faction.id);
                    this.coordinatedAttacksLaunched += 1;
                    return true;
                }
                this.offensivePlans.delete(faction.id);
                return null;
            }

            const incomingUnits = tacticalArmies
                .filter((army) => army.finalTerritoryId === staging.id)
                .reduce((sum, army) => sum + army.units, 0);
            if (availableAtFront + incomingUnits >= requiredUnits) return true;
            if (tacticalArmies.length >= maximumArmies) return true;

            const donors = this.rankOffensiveDonors(faction, owned, staging, plan.contributorIds);
            const donor = donors[0];
            if (!donor) {
                this.offensivePlans.delete(faction.id);
                return null;
            }

            const missingUnits = requiredUnits - availableAtFront - incomingUnits;
            const buffer = Math.max(2, Math.ceil(requiredUnits * 0.06));
            const units = Math.min(donor.surplus, Math.max(2, missingUnits + buffer));
            const result = this.game.executeCommand({
                type: "SEND_REINFORCEMENT_ROUTE",
                playerId: faction.id,
                fromTerritoryId: donor.territory.id,
                toTerritoryId: staging.id,
                units
            });
            if (!result.ok) {
                this.offensivePlans.delete(faction.id);
                return null;
            }

            plan.lastActionAt = state.elapsedMs;
            this.ordersIssued += 1;
            return true;
        }

        findOffensivePlan(faction, owned) {
            const state = this.game.state;
            const profile = this.getProfile(faction.id);
            const candidates = [];

            owned.forEach((staging) => {
                staging.neighbors.forEach((neighborId) => {
                    const target = state.getTerritory(neighborId);
                    if (!target || target.isImpassable || this.game.areAllied(target.ownerId, faction.id) || staging.isPathBlocked(target.id)) return;
                    if (state.armies.some((army) =>
                        army.ownerId === faction.id && !army.isConvoy && army.toTerritoryId === target.id)) return;

                    const requiredUnits = this.getCoordinatedAttackRequirement(faction, target);
                    const availableAtFront = Math.max(0, staging.units - profile.garrison);
                    const donors = this.rankOffensiveDonors(faction, owned, staging).slice(0, 3);
                    const combinedUnits = availableAtFront + donors.reduce((sum, donor) => sum + donor.surplus, 0);
                    if (combinedUnits < requiredUnits) return;

                    const type = C.TERRITORY_TYPES[target.terrain];
                    const strategicValue = (type.productionMultiplier - 1) * 12 +
                        (target.rareSite ? 12 : 0) +
                        (target.wonderId ? 85 : 0) +
                        (target.ownerId === null ? 1 : 5);
                    const pathCost = donors.reduce((sum, donor) => sum + donor.path.length - 1, 0);
                    const concentrationRatio = combinedUnits / Math.max(1, requiredUnits);
                    candidates.push({
                        stagingTerritoryId: staging.id,
                        targetTerritoryId: target.id,
                        requiredUnits,
                        contributorIds: donors.map((donor) => donor.territory.id),
                        createdAt: state.elapsedMs,
                        lastActionAt: state.elapsedMs,
                        expiresAt: state.elapsedMs + 90000,
                        score: strategicValue + concentrationRatio * 9 - pathCost * 0.8 - requiredUnits * 0.012
                    });
                });
            });

            candidates.sort((a, b) => b.score - a.score);
            return candidates[0] || null;
        }

        rankOffensiveDonors(faction, owned, staging, preferredContributorIds = []) {
            const state = this.game.state;
            const profile = this.getProfile(faction.id);
            return owned.map((territory) => {
                if (territory.id === staging.id) return null;
                const path = this.game.findOwnedPath(faction.id, territory.id, staging.id);
                if (!path) return null;
                const hostileNeighbors = territory.neighbors
                    .map((neighborId) => state.getTerritory(neighborId))
                    .filter((neighbor) => neighbor &&
                        !neighbor.isImpassable &&
                        !this.game.areAllied(neighbor.ownerId, faction.id) &&
                        !territory.isPathBlocked(neighbor.id));
                const reserve = profile.garrison + Math.min(8, hostileNeighbors.length * 3) + (territory.wonderId || territory.wonderConstruction ? 28 : 0);
                const surplus = territory.units - reserve;
                if (surplus < 2) return null;
                const preferred = preferredContributorIds.includes(territory.id) ? 12 : 0;
                const score = surplus - (path.length - 1) * 4 - hostileNeighbors.length * 7 + preferred;
                return { territory, path, surplus, score };
            }).filter(Boolean).sort((a, b) => b.score - a.score);
        }

        getCoordinatedAttackRequirement(faction, target) {
            const profile = this.getProfile(faction.id);
            const attackMultiplier = this.game.getFactionAttackMultiplier(faction.id);
            const defensePower = Math.max(1, target.units * this.game.getDefenseMultiplier(target));
            const coordinationSafety = C.Geometry.clamp(profile.safety, 1.08, 1.18);
            return Math.ceil((defensePower / Math.max(attackMultiplier, 0.1)) * coordinationSafety) + 1;
        }

        manageContinuousReinforcements(faction, owned) {
            if (owned.length < 3) return false;
            const state = this.game.state;
            const activeRoutes = state.reinforcementRoutes.filter((route) => route.active && route.ownerId === faction.id);
            const targets = this.rankLogisticsTargets(faction, owned);
            if (!targets.length) return false;

            const eligibleSources = owned.filter((territory) => this.isSafeLogisticsSource(faction.id, territory));
            const eligibleSourceIds = new Set(eligibleSources.map((territory) => territory.id));
            const desiredRouteCount = Math.min(18, eligibleSources.length);

            const obsoleteRoute = activeRoutes.find((route) => !eligibleSourceIds.has(route.fromTerritoryId));
            if (obsoleteRoute) {
                const result = this.game.executeCommand({
                    type: "CANCEL_CONTINUOUS_REINFORCEMENT_ROUTE",
                    playerId: faction.id,
                    routeId: obsoleteRoute.id
                });
                return result.ok;
            }

            // Une ligne âgée peut être réorientée vers une frontière devenue
            // sensiblement plus urgente. Les convois déjà partis continuent.
            const priorityTargetCount = Math.min(3, Math.max(1, Math.ceil(desiredRouteCount / 6)));
            const priorityTargets = targets.slice(0, priorityTargetCount);
            const priorityTargetIds = new Set(priorityTargets.map((entry) => entry.territory.id));
            const staleRoute = activeRoutes.find((route) =>
                this.game.state.elapsedMs - route.createdAt >= 45000 && !priorityTargetIds.has(route.toTerritoryId));
            if (staleRoute) {
                const source = state.getTerritory(staleRoute.fromTerritoryId);
                const target = priorityTargets
                    .map((entry) => entry.territory)
                    .find((candidate) => source && this.game.findOwnedPath(faction.id, source.id, candidate.id));
                if (target) return this.createContinuousRoute(faction.id, source.id, target.id);
            }

            if (activeRoutes.length >= desiredRouteCount) return false;
            const usedSources = new Set(activeRoutes.map((route) => route.fromTerritoryId));
            const targetUseCounts = new Map();
            activeRoutes.forEach((route) => targetUseCounts.set(route.toTerritoryId, (targetUseCounts.get(route.toTerritoryId) || 0) + 1));
            const candidates = [];
            eligibleSources.filter((territory) => !usedSources.has(territory.id)).forEach((source) => {
                priorityTargets.forEach((targetEntry) => {
                    const target = targetEntry.territory;
                    if (source.id === target.id) return;
                    const path = this.game.findOwnedPath(faction.id, source.id, target.id);
                    if (!path) return;
                    const production = this.game.getProductionMultiplier(source);
                    const targetCongestion = targetUseCounts.get(target.id) || 0;
                    candidates.push({
                        source,
                        target,
                        score: production * 14 + source.units * .04 + targetEntry.score * 3 - path.length * .3 - targetCongestion * 4
                    });
                });
            });
            candidates.sort((first, second) => second.score - first.score);
            const best = candidates[0];
            return best ? this.createContinuousRoute(faction.id, best.source.id, best.target.id) : false;
        }

        isSafeLogisticsSource(factionId, territory) {
            if (!territory || territory.ownerId !== factionId || territory.productionMode !== "units") return false;
            return !territory.neighbors.some((neighborId) => {
                const neighbor = this.game.state.getTerritory(neighborId);
                return neighbor && !neighbor.isImpassable && !territory.isPathBlocked(neighbor.id) && !this.game.areAllied(neighbor.ownerId, factionId);
            });
        }

        rankLogisticsTargets(faction, owned) {
            const state = this.game.state;
            return owned.map((territory) => {
                const hostileNeighbors = territory.neighbors
                    .map((id) => state.getTerritory(id))
                    .filter((neighbor) => neighbor && !neighbor.isImpassable && !this.game.areAllied(neighbor.ownerId, faction.id) && !territory.isPathBlocked(neighbor.id));
                if (!hostileNeighbors.length) return null;
                const hostileStrength = hostileNeighbors.reduce((sum, neighbor) => sum + neighbor.units, 0);
                const danger = hostileStrength / Math.max(1, territory.units);
                const preferred = this.getProfile(faction.id).preferredTerrains.includes(territory.terrain) ? 1.5 : 0;
                const score = danger * 9 + hostileNeighbors.length * 2.5 + (territory.rareSite ? 4 : 0) + (territory.wonderId || territory.wonderConstruction ? 22 : 0) + preferred;
                return { territory, score };
            }).filter(Boolean).sort((a, b) => b.score - a.score);
        }

        createContinuousRoute(factionId, fromTerritoryId, toTerritoryId) {
            const result = this.game.executeCommand({
                type: "CREATE_CONTINUOUS_REINFORCEMENT_ROUTE",
                playerId: factionId,
                fromTerritoryId,
                toTerritoryId
            });
            if (result.ok) {
                this.ordersIssued += 1;
                this.continuousRoutesCreated += 1;
            }
            return result.ok;
        }

        findBestAttack(faction, owned, options = {}) {
            const state = this.game.state;
            const profile = this.getProfile(faction.id);
            const enemyOnly = options.enemyOnly === true;
            const minimumPowerRatio = Math.max(0, Number(options.minimumPowerRatio) || 0);
            const attackMultiplier = this.game.getFactionAttackMultiplier(faction.id);
            const candidates = [];

            owned.forEach((source) => {
                const available = source.units - profile.garrison;
                if (available < 2) return;

                source.neighbors.forEach((neighborId) => {
                    const target = state.getTerritory(neighborId);
                    if (!target || target.isImpassable || this.game.areAllied(target.ownerId, faction.id)) return;
                    if (enemyOnly && target.ownerId === null) return;
                    if (source.isPathBlocked(target.id)) return;
                    if (state.armies.some((army) =>
                        army.ownerId === faction.id &&
                        !army.isConvoy &&
                        army.toTerritoryId === target.id)) return;

                    const defensePower = Math.max(1, target.units * this.game.getDefenseMultiplier(target));
                    const required = Math.ceil((defensePower / Math.max(attackMultiplier, 0.1)) * profile.safety) + 1;
                    if (available < required) return;

                    const type = C.TERRITORY_TYPES[target.terrain];
                    const projectedPower = available * attackMultiplier;
                    const powerRatio = projectedPower / defensePower;
                    if (powerRatio < minimumPowerRatio) return;
                    let score = powerRatio * 7 - required * 0.08;
                    score += target.ownerId === null ? 6 : 2;
                    score += (type.productionMultiplier - 1) * 18;
                    score += target.rareSite ? 18 : 0;
                    score += target.wonderId ? 95 : 0;
                    score += profile.preferredTerrains.includes(target.terrain) ? 5 : 0;
                    score += target.neighbors.filter((id) => state.getTerritory(id).ownerId === faction.id).length * 1.5;
                    score += this.game.random() * 2.5;

                    const desired = Math.max(required, Math.round(available * profile.sendFraction));
                    candidates.push({
                        source,
                        target,
                        units: C.Geometry.clamp(desired, 1, available),
                        powerRatio,
                        score
                    });
                });
            });

            candidates.sort((a, b) => b.score - a.score);
            return candidates[0] || null;
        }

        findBestReinforcement(faction, owned) {
            const state = this.game.state;
            const profile = this.getProfile(faction.id);
            const borderTerritories = owned.map((territory) => {
                const hostileNeighbors = territory.neighbors
                    .map((id) => state.getTerritory(id))
                    .filter((neighbor) => neighbor && !neighbor.isImpassable && !this.game.areAllied(neighbor.ownerId, faction.id));
                const hostileStrength = hostileNeighbors.reduce((sum, neighbor) => sum + neighbor.units, 0);
                return { territory, hostileNeighbors, hostileStrength };
            }).filter((entry) => entry.hostileNeighbors.length > 0);

            borderTerritories.sort((a, b) => {
                const dangerA = a.hostileStrength / Math.max(1, a.territory.units);
                const dangerB = b.hostileStrength / Math.max(1, b.territory.units);
                return dangerB - dangerA;
            });

            for (const border of borderTerritories) {
                const target = border.territory;
                const danger = border.hostileStrength / Math.max(1, target.units);
                if (danger < 0.8 && target.units >= 10) continue;

                const sources = target.neighbors
                    .map((id) => state.getTerritory(id))
                    .filter((territory) => territory &&
                        territory.ownerId === faction.id &&
                        !territory.isPathBlocked(target.id) &&
                        territory.units > profile.garrison + 3)
                    .sort((a, b) => b.units - a.units);
                if (!sources.length) continue;

                const source = sources[0];
                const surplus = source.units - profile.garrison;
                const units = Math.max(2, Math.floor(surplus * 0.48));
                return { source, target, units };
            }
            return null;
        }

        issueOrder(factionId, fromTerritoryId, toTerritoryId, units) {
            const result = this.game.executeCommand({
                type: "SEND_ARMY",
                playerId: factionId,
                fromTerritoryId,
                toTerritoryId,
                units
            });
            if (result.ok) this.ordersIssued += 1;
            return result.ok;
        }

        getMaximumTacticalArmies(territoryCount) {
            return C.Geometry.clamp(Math.ceil(Math.max(0, territoryCount) / 3), 1, 8);
        }

        chooseResearch(faction) {
            if (faction.research.activeTechnologyId) return false;
            const completed = faction.research.completedTechnologyIds;
            const available = Object.values(C.TECHNOLOGIES).filter((technology) =>
                !completed.includes(technology.id) &&
                (!technology.effects?.unlockWonder || !faction.constructedWonderId) &&
                (!technology.prerequisiteId || completed.includes(technology.prerequisiteId)));
            if (!available.length) return false;

            const profileId = Number(faction.definitionId ?? faction.id);
            const preferredBranch = {
                1: "attack",
                2: "construction",
                3: "attack",
                4: "defense"
            }[profileId] || "construction";
            const availableWonderDefinitions = available
                .map((technology) => C.getWonderType(technology.effects?.unlockWonder))
                .filter(Boolean);
            const preferredWonder = this.chooseWonder(faction, this.game.state.getTerritoriesOwnedBy(faction.id), availableWonderDefinitions);
            available.sort((a, b) => {
                const score = (technology) =>
                    (technology.branchId === preferredBranch ? 20 : 0) +
                    (technology.branchId === "abilities" ? 10 : 0) +
                    (technology.id === "construction-railroad" ? 18 : 0) +
                    (technology.id === "construction-agriculture" ? 16 : 0) +
                    (technology.effects?.unlockWonder === preferredWonder?.id ? 85 : technology.effects?.unlockWonder ? -12 : 0) +
                    technology.tier * 3 + this.randomBetween(0, 2);
                return score(b) - score(a);
            });

            const result = this.game.executeCommand({
                type: "START_RESEARCH",
                playerId: faction.id,
                technologyId: available[0].id
            });
            if (result.ok) this.researchChoicesMade += 1;
            return result.ok;
        }

        getProfile(factionId) {
            return PROFILES[factionId] || PROFILES[2];
        }

        randomBetween(min, max) {
            const random = this.game && this.game.random ? this.game.random() : Math.random();
            return C.Geometry.lerp(min, max, random);
        }
    }

    C.AISystem = AISystem;
})(window.Conquest = window.Conquest || {});
