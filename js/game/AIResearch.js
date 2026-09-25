(function (C) {
    "use strict";

    class AIResearch {
        constructor(ai) {
            this.ai = ai;
            this.allocationTimers = new Map();
        }

        reset(factionIds, economyTimers) {
            this.allocationTimers.clear();
            factionIds.forEach((id) => this.allocationTimers.set(id, economyTimers.get(id) || 0));
        }

        chooseNext(factionId) {
            const faction = this.ai.game.state.getFaction(factionId);
            if (!faction || faction.research.activeTechnologyId) return false;
            if (!this.ai.game.state.getTerritoriesOwnedBy(factionId).length) return false;
            return this.ai.chooseResearch(faction);
        }

        updateAllocation(factionId, deltaMs) {
            let remaining = (this.allocationTimers.get(factionId) || 0) - deltaMs;
            if (remaining <= 0) {
                const faction = this.ai.game.state.getFaction(factionId);
                const owned = this.ai.game.state.getTerritoriesOwnedBy(factionId);
                if (faction && owned.length) this.ai.manageResearchAllocation(faction, owned);
                remaining = this.ai.randomBetween(2800, 4300);
            }
            this.allocationTimers.set(factionId, remaining);
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
            const offensiveReservations = this.coordination.getReservedTerritoryIds(faction.id);
            const activeRouteSources = new Set(state.reinforcementRoutes
                .filter((route) => route.active && route.ownerId === faction.id)
                .map((route) => route.fromTerritoryId));
            const candidates = owned
                .filter((territory) => territory.productionMode === "units" && canChange(territory))
                .filter((territory) => !offensiveReservations.has(territory.id))
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
            const hasUnlockedAbility = completed.some((technologyId) =>
                Boolean(C.TECHNOLOGIES[technologyId]?.effects?.unlockAbility));
            const needsOpeningAbility = !hasUnlockedAbility && completed.length >= 2;
            const preferredOpeningAbility = [1, 2].includes(profileId)
                ? "ability-missile"
                : "ability-reinforcement";
            const airportCount = this.game.state.getTerritoriesOwnedBy(faction.id)
                .filter((territory) => territory.terrain === "airport").length;
            const availableWonderDefinitions = available
                .map((technology) => C.getWonderType(technology.effects?.unlockWonder))
                .filter(Boolean);
            const preferredWonder = this.chooseWonder(faction, this.game.state.getTerritoriesOwnedBy(faction.id), availableWonderDefinitions);
            const constructionRequests = this.coordination.read(faction.id, "construction")?.requestedTechnologyIds || [];
            available.sort((a, b) => {
                const score = (technology) =>
                    (technology.branchId === preferredBranch ? 20 : 0) +
                    (technology.branchId === "abilities" ? 10 : 0) +
                    (needsOpeningAbility && technology.effects?.unlockAbility
                        ? 34 + (technology.id === preferredOpeningAbility ? 8 : 0)
                        : 0) +
                    (technology.id === "construction-railroad" ? 18 : 0) +
                    (technology.id === "construction-agriculture" ? 16 : 0) +
                    (technology.id === "defense-minefields" ? 18 : 0) +
                    (technology.id === "ability-blackout" ? 14 : 0) +
                    (technology.id === "attack-heavy-bomber" ? airportCount > 0 ? 42 + Math.min(airportCount, 3) * 6 : -16 : 0) +
                    (constructionRequests.includes(technology.id) ? 55 : 0) +
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
    }

    C.AIResearch = AIResearch;
})(window.Conquest = window.Conquest || {});
