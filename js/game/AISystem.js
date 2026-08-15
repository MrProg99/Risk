(function (C) {
    "use strict";

    const PROFILES = {
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
            this.ordersIssued = 0;
            this.continuousRoutesCreated = 0;
            this.reset();
        }

        reset() {
            this.ordersIssued = 0;
            this.continuousRoutesCreated = 0;
            this.thinkTimers.clear();
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

            const reinforcement = this.findBestReinforcement(faction, owned);
            if (reinforcement) {
                return this.issueOrder(factionId, reinforcement.source.id, reinforcement.target.id, reinforcement.units);
            }
            return false;
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
                            return neighbor && neighbor.ownerId !== faction.id && !territory.isPathBlocked(neighbor.id);
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
                    .filter((neighbor) => neighbor && neighbor.ownerId !== faction.id && !territory.isPathBlocked(neighbor.id));
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
            const attackMultiplier = faction.bonuses.attackMultiplier * faction.bonuses.combatMultiplier;
            const candidates = [];

            owned.forEach((source) => {
                const available = source.units - profile.garrison;
                if (available < 2) return;

                source.neighbors.forEach((neighborId) => {
                    const target = state.getTerritory(neighborId);
                    if (!target || target.ownerId === faction.id) return;
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
                    .filter((neighbor) => neighbor && neighbor.ownerId !== faction.id);
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
