(function (C) {
    "use strict";

    class AIConstruction {
        constructor(ai) {
            this.ai = ai;
            this.economyTimers = new Map();
            this.projectTimers = new Map();
        }

        reset(factionIds, tacticalTimers) {
            this.projectTimers.clear();
            factionIds.forEach((id) => this.projectTimers.set(id, tacticalTimers.get(id) || 0));
        }

        updateEconomy(factionId, deltaMs) {
            let remaining = (this.economyTimers.get(factionId) || 0) - deltaMs;
            if (remaining <= 0) {
                const farmsBefore = this.ai.farmsConstructed;
                this.ai.runEconomicMaintenance(factionId);
                remaining = this.ai.farmsConstructed > farmsBefore
                    ? this.ai.randomBetween(700, 1100)
                    : this.ai.randomBetween(2800, 4300);
            }
            this.economyTimers.set(factionId, remaining);
        }

        updateProjects(factionId, deltaMs) {
            let remaining = (this.projectTimers.get(factionId) || 0) - deltaMs;
            if (remaining <= 0) {
                const faction = this.ai.game.state.getFaction(factionId);
                const owned = this.ai.game.state.getTerritoriesOwnedBy(factionId);
                let started = false;
                if (faction && owned.length) {
                    started = (!this.ai.game.isFactionBlackoutActive(factionId) &&
                        this.ai.manageWonderConstruction(faction, owned)) ||
                        this.ai.manageRailroadConstruction(faction, owned);
                }
                const profile = this.ai.getProfile(factionId);
                remaining = started
                    ? this.ai.randomBetween(700, 1100)
                    : this.ai.randomBetween(profile.intervalMin, profile.intervalMax);
            }
            this.projectTimers.set(factionId, remaining);
        }

        getConstructionLimit(ownedCount) {
            return C.Geometry.clamp(Math.ceil(ownedCount / 4), 1, 10);
        }

        canStartProductionSuspendingProject(territory, food) {
            if (food.demand <= 0) return true;
            if (food.ratio < 0.72) return false;
            const suspendedFood = this.game.getTerritoryPassiveFoodCapacity(territory) +
                this.game.getTerritoryFoodCapacity(territory);
            const projectedRatio = (food.capacity - suspendedFood) / food.demand;
            const minimumRatio = Math.min(0.98, Math.max(food.ratio >= 0.80 ? 0.80 : 0.72, food.ratio - 0.08));
            return projectedRatio >= minimumRatio;
        }

        canBuildFarmOn(territory, definition, food) {
            return definition.allowedTerrains.includes(territory.terrain) &&
                !territory.buildings.includes(definition.id) &&
                !this.game.isTerritoryUnderConstruction(territory) &&
                ["units", "food", "research"].includes(territory.productionMode) &&
                this.canStartProductionSuspendingProject(territory, food);
        }

        canBuildRailroadOn(territory, factionId, food, offensiveReservations) {
            return !offensiveReservations.has(territory.id) && !territory.railroad &&
                !this.game.isTerritoryUnderConstruction(territory) &&
                ["units", "food", "research"].includes(territory.productionMode) &&
                !this.game.state.armies.some((army) => army.toTerritoryId === territory.id &&
                    !this.game.areAllied(army.ownerId, factionId)) &&
                this.canStartProductionSuspendingProject(territory, food);
        }

        runEconomicMaintenance(factionId) {
            const state = this.game.state;
            const faction = state.getFaction(factionId);
            const owned = state.getTerritoriesOwnedBy(factionId);
            if (!faction || !owned.length) return false;

            const foodAdjusted = this.manageFoodSupply(faction, owned);
            const farmStarted = this.manageFarmConstruction(faction, owned);
            const minefieldStarted = this.manageMinefieldDeployment(faction, owned);
            const food = this.game.getFactionFoodState(factionId);
            const agricultureUnlocked = faction.research.completedTechnologyIds.includes("construction-agriculture");
            this.coordination.publish(factionId, "construction", {
                foodRatio: food.ratio,
                requestedTechnologyIds: food.demand > 0 && food.ratio < 0.90 && !agricultureUnlocked
                    ? ["construction-1", "construction-2", "construction-agriculture"]
                    : []
            });
            return foodAdjusted || farmStarted || minefieldStarted;
        }

        getFoodTerritoryLimit(territoryCount, foodRatio) {
            if (territoryCount <= 0) return 0;
            const maximumShare = foodRatio < 0.70 ? 0.40 : foodRatio < 0.85 ? 0.30 : 0.20;
            return Math.max(1, Math.ceil(territoryCount * maximumShare));
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
                            .filter((neighbor) => neighbor && !neighbor.isImpassable && !territory.isPathBlocked(neighbor.id) && !this.game.areAllied(neighbor.ownerId, faction.id)).length;
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
                            .filter((neighbor) => neighbor && !neighbor.isImpassable && !territory.isPathBlocked(neighbor.id) && !this.game.areAllied(neighbor.ownerId, faction.id)).length;
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
            const food = this.game.getFactionFoodState(faction.id);
            const activeProjects = owned.filter((territory) => this.game.isTerritoryUnderConstruction(territory));
            const limit = this.getConstructionLimit(owned.length);
            if (activeProjects.length >= limit) return false;
            if (limit > 1 && activeProjects.length === limit - 1 &&
                activeProjects.some((territory) => territory.buildingConstruction?.buildingId === "farm") &&
                !activeProjects.some((territory) => territory.railroadConstructionActive) &&
                faction.research.completedTechnologyIds.includes("construction-railroad")) {
                const offensiveReservations = this.coordination.getReservedTerritoryIds(faction.id);
                if (owned.some((territory) => this.canBuildRailroadOn(territory, faction.id, food, offensiveReservations))) return false;
            }

            const candidates = owned
                .filter((territory) => this.canBuildFarmOn(territory, definition, food))
                .map((territory) => {
                    return {
                        territory,
                        // Aucune position stratégique n'interdit une ferme. Le score sert
                        // seulement à choisir quelle plaine aménager en premier.
                        score: (territory.productionMode === "food" ? 80 : 0) - this.game.getProductionMultiplier(territory) * 5
                    };
                })
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

        manageMinefieldDeployment(faction, owned) {
            if (!faction.research.completedTechnologyIds.includes("defense-minefields")) return false;
            if (owned.some((territory) => territory.minefieldConstructionActive)) return false;
            if (this.game.getFactionMinefieldCount(faction.id) >= this.game.minefieldMaximumPerFaction) return false;

            const state = this.game.state;
            const incomingByTerritory = new Map();
            state.armies.forEach((army) => {
                if (army.isConvoy || army.logisticsPurpose === "paratrooper" || this.game.areAllied(army.ownerId, faction.id)) return;
                incomingByTerritory.set(army.finalTerritoryId, (incomingByTerritory.get(army.finalTerritoryId) || 0) + army.units);
            });
            const candidates = owned
                .filter((territory) => !territory.minefield && !territory.minefieldConstructionActive && !territory.isImpassable)
                .map((territory) => {
                    const hostiles = territory.neighbors
                        .filter((neighborId) => !territory.isPathBlocked(neighborId))
                        .map((neighborId) => state.getTerritory(neighborId))
                        .filter((neighbor) => neighbor && !neighbor.isImpassable && neighbor.ownerId !== null && !this.game.areAllied(neighbor.ownerId, faction.id));
                    const hostilePower = hostiles.reduce((sum, neighbor) => sum + neighbor.units, 0);
                    const incomingPower = incomingByTerritory.get(territory.id) || 0;
                    const strategicValue =
                        (territory.isChokePoint ? 65 : 0) +
                        (territory.isCapital ? 60 : 0) +
                        (territory.wonderId || territory.wonderConstruction ? 75 : 0) +
                        (territory.installation ? 28 : 0) +
                        (territory.terrain === "airport" ? 22 : 0) +
                        (territory.rareSite ? 20 : 0) +
                        (territory.buildings.includes("farm") ? 16 : 0);
                    return {
                        territory,
                        score: strategicValue + hostiles.length * 38 + Math.min(80, hostilePower * 0.22) + Math.min(100, incomingPower * 0.6) - territory.units * 0.05
                    };
                })
                .filter((candidate) => candidate.score >= 42)
                .sort((first, second) => second.score - first.score);
            const selected = candidates[0]?.territory;
            if (!selected) return false;
            const result = this.game.executeCommand({
                type: "BUILD_MINEFIELD",
                playerId: faction.id,
                territoryId: selected.id
            });
            if (!result.ok) return false;
            this.ordersIssued += 1;
            this.minefieldsDeployed += 1;
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
            const abilityLevels = ["missile", "reinforcement", "paratrooper", "nuclear", "blackout"]
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
            const offensiveReservations = this.coordination.getReservedTerritoryIds(faction.id);
            const routeTerritoryIds = new Set(state.reinforcementRoutes
                .filter((route) => route.active && route.ownerId === faction.id)
                .flatMap((route) => route.path));
            const candidates = owned
                .filter((territory) => !territory.wonderId && !this.game.isTerritoryUnderConstruction(territory) && !offensiveReservations.has(territory.id))
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

        manageRailroadConstruction(faction, owned) {
            if (!faction.research.completedTechnologyIds.includes("construction-railroad")) return false;
            const state = this.game.state;
            const activeProjects = owned.filter((territory) => this.game.isTerritoryUnderConstruction(territory));
            const limit = this.getConstructionLimit(owned.length);
            if (activeProjects.length >= limit) return false;
            const food = this.game.getFactionFoodState(faction.id);
            const farm = C.getBuildingType("farm");
            if (limit > 1 && activeProjects.length === limit - 1 &&
                activeProjects.some((territory) => territory.railroadConstructionActive) &&
                !activeProjects.some((territory) => territory.buildingConstruction?.buildingId === "farm") &&
                farm && faction.research.completedTechnologyIds.includes(farm.prerequisiteTechnologyId) &&
                owned.some((territory) => this.canBuildFarmOn(territory, farm, food))) return false;
            const offensiveReservations = this.coordination.getReservedTerritoryIds(faction.id);
            const activeRouteSources = new Set(state.reinforcementRoutes
                .filter((route) => route.active && route.ownerId === faction.id)
                .map((route) => route.fromTerritoryId));
            const candidates = owned
                .filter((territory) => this.canBuildRailroadOn(territory, faction.id, food, offensiveReservations))
                .map((territory) => {
                    const alliedNeighbors = territory.neighbors
                        .map((neighborId) => state.getTerritory(neighborId))
                        .filter((neighbor) => neighbor && !neighbor.isImpassable && !territory.isPathBlocked(neighbor.id) && this.game.areAllied(neighbor.ownerId, faction.id));
                    const railroadNeighbors = alliedNeighbors.filter((neighbor) => neighbor.railroad).length;
                    const hostileNeighbors = territory.neighbors
                        .filter((neighborId) => !territory.isPathBlocked(neighborId))
                        .map((neighborId) => state.getTerritory(neighborId))
                        .filter((neighbor) => neighbor && !neighbor.isImpassable && neighbor.ownerId !== null &&
                            !this.game.areAllied(neighbor.ownerId, faction.id)).length;
                    const connectedRoute = activeRouteSources.has(territory.id) ? 1 : 0;
                    const capitalValue = territory.isCapital ? 1 : 0;
                    const strategicValue = (territory.rareSite ? 12 : 0) + (territory.installation ? 10 : 0) + (territory.terrain === "airport" ? 8 : 0);
                    return {
                        territory,
                        score: railroadNeighbors * 70 + connectedRoute * 60 + capitalValue * 55 + alliedNeighbors.length * 8 +
                            strategicValue - hostileNeighbors * 90 - (territory.productionMode === "food" ? 35 : 0) -
                            this.game.getProductionMultiplier(territory) * 4
                    };
                })
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
    }

    C.AIConstruction = AIConstruction;
})(window.Conquest = window.Conquest || {});
