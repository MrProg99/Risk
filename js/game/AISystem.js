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
            this.researchChoicesMade = 0;
            this.abilitiesUsed = 0;
            this.alliedDefenseConvoysSent = 0;
            this.reset();
        }

        reset() {
            this.ordersIssued = 0;
            this.continuousRoutesCreated = 0;
            this.offensivePlansCreated = 0;
            this.coordinatedAttacksLaunched = 0;
            this.researchChoicesMade = 0;
            this.abilitiesUsed = 0;
            this.alliedDefenseConvoysSent = 0;
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

            if (this.manageFoodSupply(faction, owned)) return true;

            this.chooseResearch(faction);

            if (this.considerAbilities(faction, owned)) return true;

            if (this.considerAlliedDefense(faction, owned)) return true;

            if (this.considerAirstrike(faction, owned)) return true;

            const plannedAction = this.advanceOffensivePlan(faction, owned);
            if (plannedAction !== null) return plannedAction;

            if (this.manageContinuousReinforcements(faction, owned)) return true;

            // Les convois d'une ligne continue ne consomment pas les créneaux
            // d'ordres tactiques. Sans cette distinction, quelques unités de
            // production en transit suffisent à bloquer toutes les offensives.
            const movingArmies = state.armies.filter((army) =>
                army.ownerId === factionId && !army.reinforcementRouteId).length;
            const maximumArmies = C.Geometry.clamp(Math.ceil(owned.length / 3), 1, 4);
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

        manageFoodSupply(faction, owned) {
            const state = this.game.state;
            const food = this.game.getFactionFoodState(faction.id);
            const minimumModeDurationMs = 45000;
            // L'IA accepte une armée allant jusqu'à 110 % de sa capacité
            // alimentaire avant de sacrifier une ville au mode nourriture.
            const toleratedFoodLoad = 1.10;
            const conversionThreshold = 1 / toleratedFoodLoad;
            const emergencyThreshold = 0.75;
            const returnThreshold = 1.15;
            const returnSafetyFloor = 0.98;
            const canChange = (territory) =>
                state.elapsedMs - (territory.productionModeChangedAtMs || 0) >= minimumModeDurationMs;

            if (food.demand > 0 && food.ratio < conversionThreshold) {
                const emergency = food.ratio < emergencyThreshold;
                const candidates = owned
                    .filter((territory) => territory.productionMode === "units" && (emergency || canChange(territory)))
                    .filter((territory) => emergency || (!territory.isCapital && !territory.installation && !territory.rareSite && territory.terrain !== "airport"))
                    .map((territory) => {
                        const hostileNeighbors = territory.neighbors
                            .map((id) => state.getTerritory(id))
                            .filter((neighbor) => neighbor && !neighbor.isImpassable && !this.game.areAllied(neighbor.ownerId, faction.id)).length;
                        const capacity = this.game.getPotentialTerritoryFoodCapacity(territory);
                        const strategicPenalty = (territory.isCapital ? 80 : 0) + (territory.installation ? 50 : 0) + (territory.rareSite ? 35 : 0);
                        return { territory, score: capacity * 2 - hostileNeighbors * 90 - strategicPenalty };
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

            if (food.ratio > returnThreshold) {
                const candidates = owned
                    .filter((territory) => territory.productionMode === "food" && canChange(territory))
                    .map((territory) => {
                        const contribution = this.game.getTerritoryFoodCapacity(territory);
                        const capacityAfterChange = food.capacity - contribution;
                        if (food.demand > 0 && capacityAfterChange / food.demand < returnSafetyFloor) return null;
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
                    (target.terrain === "airport" ? 12 : 0) +
                    (target.productionMode === "food" ? 18 : 0);
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
                const food = this.game.getFactionFoodState(faction.id);
                const targets = owned.map((territory) => {
                    const hostileStrength = territory.neighbors
                        .map((id) => this.game.state.getTerritory(id))
                        .filter((neighbor) => neighbor && !neighbor.isImpassable && !this.game.areAllied(neighbor.ownerId, faction.id))
                        .reduce((sum, neighbor) => sum + neighbor.units, 0);
                    const danger = hostileStrength / Math.max(1, territory.units);
                    const strategic = (territory.isCapital ? 45 : 0) + (territory.installation ? 14 : 0) + (territory.rareSite ? 10 : 0);
                    return { territory, danger, score: danger * 35 + strategic - territory.units * 0.12 };
                }).sort((a, b) => b.score - a.score);
                const best = targets[0];
                const freeCapacity = food.capacity - food.demand;
                const emergency = best && best.territory.isCapital && best.danger >= 0.9;
                if (best && best.danger >= 1.15 && (freeCapacity >= C.ABILITY_DEFINITIONS.reinforcement.units || emergency)) {
                    const result = this.game.executeCommand({ type: "USE_ABILITY", playerId: faction.id, abilityId: "reinforcement", targetTerritoryId: best.territory.id });
                    if (result.ok) {
                        this.abilitiesUsed += 1;
                        this.ordersIssued += 1;
                        return true;
                    }
                }
            }

            if (completed.includes(C.ABILITY_DEFINITIONS.nuclear.technologyId) && (cooldowns.nuclear || 0) <= 0) {
                const definition = C.ABILITY_DEFINITIONS.nuclear;
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
                        const strategicValue = (territory.isCapital ? 18 : 0) + (territory.installation ? 9 : 0) + (territory.rareSite ? 7 : 0);
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
                        score: territory.units + (territory.isCapital ? 28 : 0) + (territory.installation ? 16 : 0) + (territory.terrain === "airport" ? 14 : 0) + (territory.productionMode === "food" ? 10 : 0) + (territory.rareSite ? 12 : 0)
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

            const maximumArmies = C.Geometry.clamp(Math.ceil(owned.length / 3), 1, 4);
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
                const reserve = profile.garrison + Math.min(8, hostileNeighbors.length * 3);
                const surplus = territory.units - reserve;
                if (surplus < 2) return null;
                const preferred = preferredContributorIds.includes(territory.id) ? 12 : 0;
                const score = surplus - (path.length - 1) * 4 - hostileNeighbors.length * 7 + preferred;
                return { territory, path, surplus, score };
            }).filter(Boolean).sort((a, b) => b.score - a.score);
        }

        getCoordinatedAttackRequirement(faction, target) {
            const profile = this.getProfile(faction.id);
            const attackMultiplier = faction.bonuses.attackMultiplier * faction.bonuses.combatMultiplier *
                (1 + C.getFactionTechnologyBonus(faction, "attackMultiplier"));
            const defensePower = Math.max(1, target.units * this.game.getDefenseMultiplier(target));
            const coordinationSafety = C.Geometry.clamp(profile.safety, 1.08, 1.18);
            return Math.ceil((defensePower / Math.max(attackMultiplier, 0.1)) * coordinationSafety) + 1;
        }

        manageContinuousReinforcements(faction, owned) {
            if (owned.length < 3) return false;
            const state = this.game.state;
            const activeRoutes = state.reinforcementRoutes.filter((route) => route.active && route.ownerId === faction.id);
            const desiredRouteCount = Math.min(3, 1 + Math.floor((owned.length - 3) / 7));
            const targets = this.rankLogisticsTargets(faction, owned);
            if (!targets.length) return false;

            // Une ligne âgée peut être réorientée vers une frontière devenue
            // sensiblement plus urgente. Les convois déjà partis continuent.
            const bestTarget = targets[0].territory;
            const staleRoute = activeRoutes.find((route) =>
                this.game.state.elapsedMs - route.createdAt >= 28000 && route.toTerritoryId !== bestTarget.id);
            if (staleRoute) {
                const source = state.getTerritory(staleRoute.fromTerritoryId);
                const path = source && this.game.findOwnedPath(faction.id, source.id, bestTarget.id);
                if (path) return this.createContinuousRoute(faction.id, source.id, bestTarget.id);
            }

            if (activeRoutes.length >= desiredRouteCount) return false;
            const usedSources = new Set(activeRoutes.map((route) => route.fromTerritoryId));
            const usedTargets = new Set(activeRoutes.map((route) => route.toTerritoryId));
            const preferredTargets = targets.filter((entry) => !usedTargets.has(entry.territory.id));
            const targetPool = preferredTargets.length ? preferredTargets : targets;

            for (const targetEntry of targetPool) {
                const target = targetEntry.territory;
                const sources = owned.filter((territory) => territory.id !== target.id && !usedSources.has(territory.id))
                    .map((territory) => {
                        const path = this.game.findOwnedPath(faction.id, territory.id, target.id);
                        if (!path) return null;
                        const exposedBorders = territory.neighbors.filter((neighborId) => {
                            const neighbor = state.getTerritory(neighborId);
                            return neighbor && !neighbor.isImpassable && !this.game.areAllied(neighbor.ownerId, faction.id) && !territory.isPathBlocked(neighbor.id);
                        }).length;
                        const production = this.game.getProductionMultiplier(territory);
                        const score = production * 12 + territory.units * 0.06 - exposedBorders * 5 - path.length * 0.35;
                        return { territory, score };
                    })
                    .filter(Boolean)
                    .sort((a, b) => b.score - a.score);

                if (sources.length) {
                    return this.createContinuousRoute(faction.id, sources[0].territory.id, target.id);
                }
            }
            return false;
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
                const score = danger * 9 + hostileNeighbors.length * 2.5 + (territory.rareSite ? 4 : 0) + preferred;
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

        findBestAttack(faction, owned) {
            const state = this.game.state;
            const profile = this.getProfile(faction.id);
            const attackMultiplier = faction.bonuses.attackMultiplier * faction.bonuses.combatMultiplier *
                (1 + C.getFactionTechnologyBonus(faction, "attackMultiplier"));
            const candidates = [];

            owned.forEach((source) => {
                const available = source.units - profile.garrison;
                if (available < 2) return;

                source.neighbors.forEach((neighborId) => {
                    const target = state.getTerritory(neighborId);
                    if (!target || target.isImpassable || this.game.areAllied(target.ownerId, faction.id)) return;
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
                    let score = powerRatio * 7 - required * 0.08;
                    score += target.ownerId === null ? 6 : 2;
                    score += (type.productionMultiplier - 1) * 18;
                    score += target.rareSite ? 18 : 0;
                    score += profile.preferredTerrains.includes(target.terrain) ? 5 : 0;
                    score += target.neighbors.filter((id) => state.getTerritory(id).ownerId === faction.id).length * 1.5;
                    score += this.game.random() * 2.5;

                    const desired = Math.max(required, Math.round(available * profile.sendFraction));
                    candidates.push({
                        source,
                        target,
                        units: C.Geometry.clamp(desired, 1, available),
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

        chooseResearch(faction) {
            if (faction.research.activeTechnologyId) return false;
            const completed = faction.research.completedTechnologyIds;
            const available = Object.values(C.TECHNOLOGIES).filter((technology) =>
                !completed.includes(technology.id) &&
                (!technology.prerequisiteId || completed.includes(technology.prerequisiteId)));
            if (!available.length) return false;

            const preferredBranch = {
                1: "attack",
                2: "construction",
                3: "attack",
                4: "defense"
            }[faction.id] || "construction";
            available.sort((a, b) => {
                const score = (technology) =>
                    (technology.branchId === preferredBranch ? 20 : 0) +
                    (technology.branchId === "abilities" ? 10 : 0) +
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
