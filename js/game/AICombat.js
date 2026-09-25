(function (C) {
    "use strict";

    class AICombat {
        constructor(ai) {
            this.ai = ai;
            this.thinkTimers = new Map();
            this.rearSweepTimers = new Map();
        }

        updateFaction(factionId, deltaMs) {
            let rearRemaining = (this.rearSweepTimers.get(factionId) || 0) - deltaMs;
            if (rearRemaining <= 0) {
                this.ai.runRearLogisticsSweep(factionId);
                rearRemaining = this.ai.randomBetween(9000, 13500);
            }
            this.rearSweepTimers.set(factionId, rearRemaining);

            let remaining = (this.thinkTimers.get(factionId) || 0) - deltaMs;
            if (remaining <= 0) {
                this.ai.think(factionId);
                const profile = this.ai.getProfile(factionId);
                remaining = this.ai.randomBetween(profile.intervalMin, profile.intervalMax);
            }
            this.thinkTimers.set(factionId, remaining);
        }

        runRearLogisticsSweep(factionId) {
            const state = this.game.state;
            const faction = state.getFaction(factionId);
            const owned = state.getTerritoriesOwnedBy(factionId);
            if (!faction || !owned.length) return false;
            if (state.mapType === "volcano" && state.volcanicWarningIssued) {
                return this.respondToVolcanicWarning(faction, owned);
            }

            const pendingPlan = this.offensivePlans.get(faction.id);
            const reservedSourceIds = new Set(pendingPlan
                ? [pendingPlan.stagingTerritoryId, ...(pendingPlan.contributorIds || [])]
                : []);
            const maximumOrders = C.Geometry.clamp(Math.ceil(owned.length / 12), 2, 4);
            const redistributed = this.redistributeRearSurplus(faction, owned, reservedSourceIds, maximumOrders);
            const routeAdjusted = this.manageContinuousReinforcements(faction, owned, reservedSourceIds);
            return redistributed || routeAdjusted;
        }

        think(factionId) {
            const state = this.game.state;
            const faction = state.getFaction(factionId);
            const owned = state.getTerritoriesOwnedBy(factionId);
            if (!faction || !owned.length) return false;

            if (this.respondToVolcanicWarning(faction, owned)) return true;

            if (this.game.isFactionBlackoutActive(faction.id)) {
                return this.respondToBlackout(faction, owned);
            }

            // Une victoire locale Ã©vidente ne doit pas attendre la crÃ©ation de
            // routes logistiques ni la fin d'un autre plan de rassemblement.
            if (this.launchDecisiveAttack(faction, owned)) return true;

            // Une enclave ennemie presque encerclée est une urgence locale. Elle doit
            // être réduite avant les changements de production et la logistique de fond.
            if (this.prioritizeEncircledEnemy(faction, owned) === true) return true;

            if (this.manageWonderDefense(faction, owned)) return true;

            if (this.launchOpportunisticNeutralExpansion(faction, owned)) return true;

            if (this.considerAbilities(faction, owned)) return true;

            if (this.considerAlliedDefense(faction, owned)) return true;

            const plannedAction = this.advanceOffensivePlan(faction, owned);
            if (plannedAction === true) return true;

            // Waiting for a convoy does not consume a decision. Keep the gathering
            // force and its contributors out of unrelated logistics while it travels.
            let pendingPlan = this.offensivePlans.get(faction.id);
            if (!pendingPlan && state.mapType === "archipelago") {
                const breakoutPlan = this.findOffensivePlan(faction, owned);
                const breakoutTarget = breakoutPlan && state.getTerritory(breakoutPlan.targetTerritoryId);
                if (breakoutPlan && this.getArchipelagoExpansionScore(faction.id, breakoutTarget) > 0) {
                    this.offensivePlans.set(faction.id, breakoutPlan);
                    this.offensivePlansCreated += 1;
                    const staging = state.getTerritory(breakoutPlan.stagingTerritoryId);
                    this.game.addLogisticsEvent(`${faction.name} ouvre la route des îles vers ${breakoutTarget.name} et rassemble ses forces à ${staging.name}.`, faction.id, "combat");
                    const breakoutAction = this.advanceOffensivePlan(faction, owned);
                    if (breakoutAction === true) return true;
                    pendingPlan = this.offensivePlans.get(faction.id) || null;
                }
            }
            const reservedSourceIds = new Set(pendingPlan
                ? [pendingPlan.stagingTerritoryId, ...(pendingPlan.contributorIds || [])]
                : []);

            if (this.redistributeRearSurplus(faction, owned, reservedSourceIds)) return true;

            if (this.manageContinuousReinforcements(faction, owned, reservedSourceIds)) return true;

            // Les convois d'une ligne continue ne consomment pas les créneaux
            // d'ordres tactiques. Sans cette distinction, quelques unités de
            // production en transit suffisent à bloquer toutes les offensives.
            const movingArmies = state.armies.filter((army) =>
                army.ownerId === factionId && !army.reinforcementRouteId &&
                army.logisticsPurpose !== "rear-redistribution").length;
            const maximumArmies = this.getMaximumTacticalArmies(owned.length);
            if (movingArmies >= maximumArmies) return false;

            const attack = this.findBestAttack(faction, owned.filter((territory) => !reservedSourceIds.has(territory.id)));
            if (attack && this.issueOrder(factionId, attack.source.id, attack.target.id, attack.units)) {
                return true;
            }

            const newPlan = pendingPlan ? null : this.findOffensivePlan(faction, owned);
            if (newPlan) {
                this.offensivePlans.set(faction.id, newPlan);
                this.offensivePlansCreated += 1;
                const staging = state.getTerritory(newPlan.stagingTerritoryId);
                const target = state.getTerritory(newPlan.targetTerritoryId);
                this.game.addLogisticsEvent(`${faction.name} prépare une offensive contre ${target.name} et rassemble ses forces à ${staging.name}.`, faction.id, "combat");
                return this.advanceOffensivePlan(faction, owned) ?? false;
            }

            const reinforcement = this.findBestReinforcement(faction, owned, reservedSourceIds);
            if (reinforcement) {
                return this.issueOrder(factionId, reinforcement.source.id, reinforcement.target.id, reinforcement.units);
            }
            return false;
        }

        respondToVolcanicWarning(faction, owned) {
            const dangerIds = this.game.eventSystem.getVolcanicDangerTerritoryIds();
            if (!dangerIds.size) return false;
            const state = this.game.state;
            const profile = this.getProfile(faction.id);

            let cancelledDangerousRoute = false;
            state.reinforcementRoutes.filter((route) =>
                route.active && route.ownerId === faction.id && dangerIds.has(route.toTerritoryId))
                .forEach((route) => {
                    const result = this.game.executeCommand({
                        type: "CANCEL_CONTINUOUS_REINFORCEMENT_ROUTE",
                        playerId: faction.id,
                        routeId: route.id
                    });
                    cancelledDangerousRoute = result.ok || cancelledDangerousRoute;
                });

            const evacuatingSourceIds = new Set(state.armies
                .filter((army) => army.ownerId === faction.id && army.logisticsPurpose === "volcanic-evacuation")
                .map((army) => army.fromTerritoryId));
            const endangered = owned.filter((territory) =>
                dangerIds.has(territory.id) &&
                !evacuatingSourceIds.has(territory.id) &&
                territory.units > profile.garrison + 5)
                .sort((first, second) => second.units - first.units);

            for (const source of endangered) {
                const destinations = owned.filter((territory) => territory.id !== source.id && !dangerIds.has(territory.id))
                    .map((territory) => {
                        const path = this.game.findReinforcementPath(faction.id, source.id, territory.id);
                        if (!path) return null;
                        const hostileNeighbors = territory.neighbors.filter((neighborId) => {
                            const neighbor = state.getTerritory(neighborId);
                            return neighbor && !neighbor.isImpassable && !territory.isPathBlocked(neighbor.id) && !this.game.areAllied(neighbor.ownerId, faction.id);
                        }).length;
                        return { territory, path, score: path.length * 10 + hostileNeighbors * 24 - Math.min(territory.units, 60) * 0.08 };
                    })
                    .filter(Boolean)
                    .sort((first, second) => first.score - second.score);
                const destination = destinations[0];
                if (!destination) continue;
                const localReserve = profile.garrison + (source.isCapital ? 8 : 0) + (source.wonderId ? 10 : 0);
                const units = Math.floor(Math.max(0, source.units - localReserve) * 0.68);
                if (units < 4) continue;
                const result = this.game.executeCommand({
                    type: "SEND_REINFORCEMENT_ROUTE",
                    playerId: faction.id,
                    fromTerritoryId: source.id,
                    toTerritoryId: destination.territory.id,
                    units
                });
                if (!result.ok) continue;
                result.army.logisticsPurpose = "volcanic-evacuation";
                this.ordersIssued += 1;
                return true;
            }
            return cancelledDangerousRoute;
        }

        respondToBlackout(faction, owned) {
            if (this.considerAlliedDefense(faction, owned)) return true;
            if (this.redistributeRearSurplus(faction, owned)) return true;
            if (this.manageContinuousReinforcements(faction, owned)) return true;
            const reinforcement = this.findBestReinforcement(faction, owned);
            return reinforcement
                ? this.issueOrder(faction.id, reinforcement.source.id, reinforcement.target.id, reinforcement.units)
                : false;
        }

        launchDecisiveAttack(faction, owned) {
            const state = this.game.state;
            const movingArmies = state.armies.filter((army) =>
                army.ownerId === faction.id && !army.reinforcementRouteId &&
                army.logisticsPurpose !== "rear-redistribution").length;
            if (movingArmies >= this.getMaximumTacticalArmies(owned.length)) return false;

            const attack = this.findBestAttack(faction, owned, {
                enemyOnly: true,
                minimumPowerRatio: 1.35
            });
            if (!attack || !this.issueOrder(faction.id, attack.source.id, attack.target.id, attack.units)) return false;
            this.decisiveAttacksLaunched += 1;
            return true;
        }

        prioritizeEncircledEnemy(faction, owned) {
            // An encircled hostile pocket must not wait behind food/research chores or
            // an unrelated long-distance offensive. Keep advancing an urgent pocket
            // plan first, even after its first donor has already left.
            const activePlan = this.offensivePlans.get(faction.id);
            if (activePlan?.encirclementPriority) {
                const action = this.advanceOffensivePlan(faction, owned);
                if (action !== null) return action;
            }

            const urgentPlan = this.findOffensivePlan(faction, owned, { encirclementOnly: true });
            if (!urgentPlan) return null;

            const currentPlan = this.offensivePlans.get(faction.id);
            if (currentPlan?.targetTerritoryId === urgentPlan.targetTerritoryId) {
                currentPlan.encirclementPriority = true;
                currentPlan.encirclementScore = urgentPlan.encirclementScore;
                return this.advanceOffensivePlan(faction, owned);
            }

            // A nearly closed pocket with overwhelming local superiority may replace
            // a normal plan elsewhere. Another urgent pocket is only replaced by a
            // clearly stronger encirclement, which prevents oscillation every think.
            if (currentPlan?.encirclementPriority &&
                (currentPlan.encirclementScore || currentPlan.score || 0) >= urgentPlan.encirclementScore - 8) {
                return this.advanceOffensivePlan(faction, owned);
            }

            urgentPlan.encirclementPriority = true;
            this.offensivePlans.set(faction.id, urgentPlan);
            this.offensivePlansCreated += 1;
            const target = this.game.state.getTerritory(urgentPlan.targetTerritoryId);
            this.game.addLogisticsEvent(`${faction.name} resserre l'encerclement de ${target.name}.`, faction.id, "combat");
            return this.advanceOffensivePlan(faction, owned);
        }

        redistributeRearSurplus(faction, owned, reservedSourceIds = new Set(), maximumOrders = 1) {
            const state = this.game.state;
            const targets = this.rankLogisticsTargets(faction, owned);
            if (!targets.length) return false;

            const activeRedistributions = state.armies.filter((army) =>
                army.ownerId === faction.id && army.isConvoy && !army.reinforcementRouteId && army.logisticsPurpose === "rear-redistribution");
            const maximumRedistributions = this.getMaximumRearRedistributions(owned.length);
            if (activeRedistributions.length >= maximumRedistributions) return false;
            const availableSlots = Math.min(
                Math.max(1, Math.floor(Number(maximumOrders) || 1)),
                maximumRedistributions - activeRedistributions.length
            );

            const activeSourceIds = new Set(activeRedistributions.map((army) => army.fromTerritoryId));
            const candidates = [];
            owned.forEach((source) => {
                if (activeSourceIds.has(source.id) || reservedSourceIds.has(source.id)) return;
                const hostileNeighbors = source.neighbors
                    .map((territoryId) => state.getTerritory(territoryId))
                    .filter((neighbor) => neighbor && !neighbor.isImpassable && !source.isPathBlocked(neighbor.id) && !this.game.areAllied(neighbor.ownerId, faction.id));
                if (hostileNeighbors.length) return;

                const reserve = this.getRearLogisticsReserve(faction.id, source);
                const surplus = source.units - this.getDefensiveReserve(faction.id, source, reserve);
                if (surplus < 8) return;

                targets.slice(0, 4).forEach((targetEntry) => {
                    const target = targetEntry.territory;
                    const path = this.game.findReinforcementPath(faction.id, source.id, target.id);
                    if (!path || path.length < 2) return;
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
            const dispatchedSourceIds = new Set();
            let dispatched = 0;
            for (const candidate of candidates) {
                if (dispatched >= availableSlots) break;
                if (dispatchedSourceIds.has(candidate.source.id)) continue;
                const units = Math.max(6, Math.floor(candidate.surplus * .85));
                const result = this.game.executeCommand({
                    type: "SEND_REINFORCEMENT_ROUTE",
                    playerId: faction.id,
                    fromTerritoryId: candidate.source.id,
                    toTerritoryId: candidate.target.id,
                    units
                });
                if (!result.ok) continue;
                result.army.logisticsPurpose = "rear-redistribution";
                dispatchedSourceIds.add(candidate.source.id);
                dispatched += 1;
                this.ordersIssued += 1;
                this.rearRedistributionsSent += 1;
            }
            return dispatched > 0;
        }

        launchOpportunisticNeutralExpansion(faction, owned) {
            const state = this.game.state;
            const profile = this.getProfile(faction.id);
            const attackMultiplier = this.game.getFactionAttackMultiplier(faction.id);
            const capital = state.getTerritory(faction.capitalTerritoryId);
            const mapMiddleX = state.mapWidth / 2;
            const capitalSide = capital ? Math.sign(capital.center.x - mapMiddleX) : 0;

            // Ces créneaux d'expansion sont indépendants de la limite habituelle des
            // armées tactiques. Leur nombre suit la taille de la carte et de l'empire.
            const activeExpansions = state.armies.filter((army) => {
                if (army.ownerId !== faction.id || army.isConvoy || army.reinforcementRouteId) return false;
                const destination = state.getTerritory(army.finalTerritoryId ?? army.toTerritoryId);
                return destination?.ownerId === null;
            });
            // Avant le premier débarquement, toutes les forces suivent le même axe de
            // sortie. Ensuite, plusieurs conquêtes peuvent déployer la tête de pont.
            const controlledIslandIds = new Set(owned
                .map((territory) => territory.archipelagoIslandId)
                .filter((islandId) => islandId !== null && islandId !== undefined));
            const hasArchipelagoLanding = controlledIslandIds.size > 1;
            const archipelagoOpening = state.mapType === "archipelago" && !hasArchipelagoLanding;
            const enemyBorderIds = new Set();
            const ownBorderTerritories = [];
            owned.forEach((territory) => {
                let touchesEnemy = false;
                territory.neighbors.forEach((neighborId) => {
                    const neighbor = state.getTerritory(neighborId);
                    if (!neighbor || neighbor.isImpassable || neighbor.ownerId === null ||
                        this.game.areAllied(neighbor.ownerId, faction.id) || territory.isPathBlocked(neighbor.id)) return;
                    enemyBorderIds.add(neighbor.id);
                    touchesEnemy = true;
                });
                if (touchesEnemy) ownBorderTerritories.push(territory);
            });
            const hasEnemyBorder = enemyBorderIds.size > 0;
            const hostileBorderPower = [...enemyBorderIds]
                .reduce((sum, territoryId) => sum + state.getTerritory(territoryId).units, 0);
            const ownBorderPower = ownBorderTerritories
                .reduce((sum, territory) => sum + territory.units * this.game.getDefenseMultiplier(territory), 0);
            const underEnemyPressure = hasEnemyBorder && hostileBorderPower > ownBorderPower * 1.10;
            // L'ouverture de l'Archipel reste concentrée; après le débarquement,
            // l'expansion neutre suit les mêmes limites dynamiques que les autres cartes.
            const maximumExpansions = archipelagoOpening
                ? 1
                : this.getMaximumNeutralExpansions(owned.length, { hasEnemyBorder, underEnemyPressure });
            if (activeExpansions.length >= maximumExpansions) return false;
            const activeTargetIds = new Set(activeExpansions.map((army) => army.finalTerritoryId ?? army.toTerritoryId));
            const activeSourceUseCounts = new Map();
            activeExpansions.forEach((army) => activeSourceUseCounts.set(
                army.fromTerritoryId,
                (activeSourceUseCounts.get(army.fromTerritoryId) || 0) + 1
            ));

            const candidates = [];
            owned.forEach((source) => {
                const defensiveReserve = this.getDefensiveReserve(faction.id, source, profile.garrison);
                const touchesEnemy = source.neighbors.some((neighborId) => {
                    const neighbor = state.getTerritory(neighborId);
                    return neighbor && !neighbor.isImpassable && neighbor.ownerId !== null &&
                        !this.game.areAllied(neighbor.ownerId, faction.id) && !source.isPathBlocked(neighbor.id);
                });
                source.neighbors.forEach((neighborId) => {
                    const target = state.getTerritory(neighborId);
                    if (!target || target.isImpassable || target.ownerId !== null || source.isPathBlocked(target.id)) return;
                    if (activeTargetIds.has(target.id)) return;
                    // Tant que l'IA n'a pas atteint la première liaison, une petite
                    // conquête latérale ne doit pas détourner toute l'expédition.
                    if (archipelagoOpening && !this.isArchipelagoGatewayAdvance(faction.id, source, target)) return;
                    const archipelagoScore = this.getArchipelagoExpansionScore(faction.id, target);
                    const safeExpeditionPush = state.mapType === "archipelago" && !hasArchipelagoLanding &&
                        archipelagoScore > 0 && !touchesEnemy && defensiveReserve <= profile.garrison;
                    const available = source.units - (safeExpeditionPush ? 1 : defensiveReserve);
                    if (available < 2) return;
                    const defensePower = Math.max(1, target.units * this.game.getDefenseMultiplier(target));
                    const expansionSafety = archipelagoScore > 0 ? Math.min(profile.safety, 1.08) : profile.safety;
                    const required = Math.ceil((defensePower / Math.max(attackMultiplier, .1)) * expansionSafety) + 1;
                    const projectedPower = available * attackMultiplier;
                    const minimumPowerRatio = archipelagoScore > 0 ? 1.12 : 1.5;
                    if (available < required || projectedPower < defensePower * minimumPowerRatio) return;

                    const targetSide = Math.sign(target.center.x - mapMiddleX);
                    const sameHourglassSide = state.mapType === "hourglass" && capitalSide !== 0 && targetSide === capitalSide;
                    const type = C.TERRITORY_TYPES[target.terrain];
                    const decisiveRatio = archipelagoScore > 0 ? 1.28 : 1.65;
                    const decisiveUnits = Math.ceil((defensePower * decisiveRatio) / Math.max(attackMultiplier, .1));
                    const expeditionUnits = archipelagoScore > 0 ? available : 0;
                    candidates.push({
                        source,
                        target,
                        units: C.Geometry.clamp(Math.max(required, decisiveUnits, expeditionUnits), 1, available),
                        score: (sameHourglassSide ? 100 : 0) +
                            archipelagoScore +
                            (type.productionMultiplier - 1) * 18 +
                            (target.rareSite ? 20 : 0) +
                            (target.wonderId ? 90 : 0) +
                            projectedPower / defensePower * 5 -
                            target.units * .12 -
                            (activeSourceUseCounts.get(source.id) || 0) * 10
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
            // Fill the remaining strategic axes in the same decision. Previously the
            // capacity was larger, but only one order left every several seconds.
            if (activeExpansions.length + 1 < maximumExpansions) {
                this.launchOpportunisticNeutralExpansion(faction, owned);
            }
            return true;
        }

        getArchipelagoExpansionScore(factionId, target) {
            const state = this.game.state;
            if (state.mapType !== "archipelago" || !target) return 0;
            const ownedIslandIds = new Set(state.getTerritoriesOwnedBy(factionId)
                .map((territory) => territory.archipelagoIslandId)
                .filter((islandId) => islandId !== null && islandId !== undefined));
            // Une liaison ou une tête de pont sur une nouvelle île doit passer
            // avant une ressource ordinaire située au fond de l'île actuelle.
            if (target.isArchipelagoPassage && !this.game.areAllied(target.ownerId, factionId)) return 320;
            if (target.archipelagoIslandId !== null && target.archipelagoIslandId !== undefined &&
                !ownedIslandIds.has(target.archipelagoIslandId)) return 380;

            const gatewayDistance = this.getArchipelagoGatewayDistance(factionId, target, 12);
            return Number.isFinite(gatewayDistance) ? Math.max(0, 13 - gatewayDistance) * 18 : 0;
        }

        isArchipelagoOpening(factionId) {
            const state = this.game.state;
            if (state.mapType !== "archipelago") return false;
            const owned = state.getTerritoriesOwnedBy(factionId);
            const controlledIslandIds = new Set(owned
                .map((territory) => territory.archipelagoIslandId)
                .filter((islandId) => islandId !== null && islandId !== undefined));
            return controlledIslandIds.size <= 1;
        }

        isArchipelagoGatewayAdvance(factionId, source, target) {
            if (!source || !target || this.game.state.mapType !== "archipelago") return false;
            if (target.isArchipelagoPassage && !this.game.areAllied(target.ownerId, factionId)) return true;

            const ownedIslandIds = new Set(this.game.state.getTerritoriesOwnedBy(factionId)
                .map((territory) => territory.archipelagoIslandId)
                .filter((islandId) => islandId !== null && islandId !== undefined));
            if (target.archipelagoIslandId !== null && target.archipelagoIslandId !== undefined &&
                !ownedIslandIds.has(target.archipelagoIslandId)) return true;

            const sourceDistance = this.getArchipelagoGatewayDistance(factionId, source, 12);
            const targetDistance = this.getArchipelagoGatewayDistance(factionId, target, 12);
            return Number.isFinite(targetDistance) && targetDistance < sourceDistance;
        }

        getArchipelagoGatewayDistance(factionId, origin, maximumDistance = 12) {
            if (this.game.state.mapType !== "archipelago" || !origin) return Infinity;
            const ownedIslandIds = new Set(this.game.state.getTerritoriesOwnedBy(factionId)
                .map((territory) => territory.archipelagoIslandId)
                .filter((islandId) => islandId !== null && islandId !== undefined));
            const visited = new Set([origin.id]);
            let frontier = [origin];
            for (let distance = 0; distance <= maximumDistance && frontier.length; distance += 1) {
                if (frontier.some((territory) =>
                    (territory.isArchipelagoPassage && !this.game.areAllied(territory.ownerId, factionId)) ||
                    (territory.archipelagoIslandId !== null && territory.archipelagoIslandId !== undefined &&
                        !ownedIslandIds.has(territory.archipelagoIslandId)))) return distance;
                const next = [];
                frontier.forEach((territory) => territory.neighbors.forEach((neighborId) => {
                    if (visited.has(neighborId) || territory.isPathBlocked(neighborId)) return;
                    visited.add(neighborId);
                    const neighbor = this.game.state.getTerritory(neighborId);
                    if (neighbor && !neighbor.isImpassable) next.push(neighbor);
                }));
                frontier = next;
            }
            return Infinity;
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
                    const path = this.game.findReinforcementPath(faction.id, territory.id, target.territory.id);
                    if (!path) return null;
                    const hostileNeighbor = territory.neighbors.some((neighborId) => {
                        const neighbor = state.getTerritory(neighborId);
                        return neighbor && !neighbor.isImpassable && !territory.isPathBlocked(neighbor.id) && !this.game.areAllied(neighbor.ownerId, faction.id);
                    });
                    if (hostileNeighbor) return null;
                    const reserve = profile.garrison + (territory.isCapital ? 12 : 0) + (territory.wonderId ? 25 : 0);
                    const surplus = territory.units - this.getDefensiveReserve(faction.id, territory, reserve);
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
                    .filter((neighbor) => neighbor && neighbor.ownerId !== null && !neighbor.isImpassable && !territory.isPathBlocked(neighbor.id) && !this.game.areAllied(neighbor.ownerId, faction.id)).length;
                const reserve = profile.garrison + hostileNeighbors * 3 + (territory.isCapital ? 5 : 0);
                const surplus = Math.max(0, territory.units - this.getDefensiveReserve(faction.id, territory, reserve));
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
                    const path = this.game.findReinforcementPath(faction.id, entry.territory.id, candidate.target.id);
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

        considerAbilities(faction, owned) {
            const completed = faction.research.completedTechnologyIds;
            const cooldowns = faction.abilityCooldowns || {};

            if (completed.includes(C.ABILITY_DEFINITIONS.reinforcement.technologyId) && (cooldowns.reinforcement || 0) <= 0) {
                const definition = C.getFactionAbilityStats(faction, "reinforcement");
                const targets = this.game.state.territories
                    .filter((territory) => !territory.isImpassable && territory.ownerId !== null && this.game.areAllied(territory.ownerId, faction.id))
                    .map((territory) => {
                        const hostileStrength = territory.neighbors
                            .map((id) => this.game.state.getTerritory(id))
                            .filter((neighbor) => neighbor && !neighbor.isImpassable && !territory.isPathBlocked(neighbor.id) && !this.game.areAllied(neighbor.ownerId, faction.id))
                            .reduce((sum, neighbor) => sum + neighbor.units, 0);
                        const danger = hostileStrength / Math.max(1, territory.units);
                        const strategic = (territory.isCapital ? 45 : 0) + (territory.installation ? 14 : 0) + (territory.rareSite ? 10 : 0) + (territory.wonderId || territory.wonderConstruction ? 55 : 0);
                        const alliedSupportPenalty = territory.ownerId === faction.id ? 0 : 6;
                        return { territory, danger, score: danger * 35 + strategic - territory.units * 0.12 - alliedSupportPenalty };
                    }).sort((a, b) => b.score - a.score);
                const best = targets[0];
                const recipientFood = best ? this.game.getFactionFoodState(best.territory.ownerId) : null;
                const freeCapacity = recipientFood ? recipientFood.capacity - recipientFood.demand : 0;
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

            if (this.game.isFactionBlackoutActive(faction.id)) return false;

            if (completed.includes(C.ABILITY_DEFINITIONS.blackout.technologyId) && (cooldowns.blackout || 0) <= 0) {
                const profile = this.getProfile(faction.id);
                const attackMultiplier = this.game.getFactionAttackMultiplier(faction.id);
                const activePlan = this.offensivePlans.get(faction.id);
                const candidates = [];
                owned.forEach((source) => {
                    const available = Math.max(0, source.units - profile.garrison);
                    if (available < 2) return;
                    source.neighbors.forEach((territoryId) => {
                        const target = this.game.state.getTerritory(territoryId);
                        if (!target || target.ownerId === null || target.isImpassable || source.isPathBlocked(target.id) || this.game.areAllied(target.ownerId, faction.id)) return;
                        const targetFaction = this.game.state.getFaction(target.ownerId);
                        const blackout = targetFaction ? this.game.getTeamBlackoutState(targetFaction.teamId) : null;
                        if (!targetFaction || (blackout?.immunityRemainingMs || 0) > 0) return;
                        const defensePower = Math.max(1, target.units * this.game.getDefenseMultiplier(target));
                        const powerRatio = available * attackMultiplier / defensePower;
                        if (powerRatio < 0.92) return;
                        const planBonus = activePlan?.targetTerritoryId === target.id ? 24 : 0;
                        const strategicValue = (target.isCapital ? 14 : 0) +
                            (target.installation ? 10 : 0) +
                            (target.terrain === "airport" ? 9 : 0) +
                            (target.rareSite ? 8 : 0) +
                            (target.wonderId || target.wonderConstruction ? 35 : 0);
                        candidates.push({ target, score: powerRatio * 28 + planBonus + strategicValue });
                    });
                });
                candidates.sort((first, second) => second.score - first.score);
                if (candidates[0]?.score >= 28) {
                    const result = this.game.executeCommand({
                        type: "USE_ABILITY",
                        playerId: faction.id,
                        abilityId: "blackout",
                        targetTerritoryId: candidates[0].target.id
                    });
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
            // true: an order was sent; false: the plan is waiting; null: no active plan.
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
            const availableAtFront = Math.max(0, staging.units - this.getDefensiveReserve(faction.id, staging, profile.garrison));
            const tacticalArmies = state.armies.filter((army) =>
                army.ownerId === faction.id && !army.reinforcementRouteId);
            const capacityArmies = tacticalArmies.filter((army) =>
                army.logisticsPurpose !== "rear-redistribution");
            const attackAlreadyLaunched = tacticalArmies.some((army) =>
                !army.isConvoy && army.toTerritoryId === target.id);
            if (attackAlreadyLaunched) {
                this.offensivePlans.delete(faction.id);
                return null;
            }

            // A closed pocket receives one emergency tactical slot. Otherwise a few
            // unrelated convoys can leave an overwhelming encirclement idle.
            const maximumArmies = this.getMaximumTacticalArmies(owned.length) + (plan.encirclementPriority ? 1 : 0);
            if (availableAtFront >= requiredUnits) {
                if (capacityArmies.length >= maximumArmies) return false;
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
            if (availableAtFront + incomingUnits >= requiredUnits) return false;
            if (capacityArmies.length >= maximumArmies) return false;

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

        findOffensivePlan(faction, owned, options = {}) {
            const state = this.game.state;
            const profile = this.getProfile(faction.id);
            const archipelagoOpening = this.isArchipelagoOpening(faction.id);
            const encirclementOnly = options.encirclementOnly === true;
            const attackMultiplier = this.game.getFactionAttackMultiplier(faction.id);
            const candidates = [];

            owned.forEach((staging) => {
                staging.neighbors.forEach((neighborId) => {
                    const target = state.getTerritory(neighborId);
                    if (!target || target.isImpassable || this.game.areAllied(target.ownerId, faction.id) || staging.isPathBlocked(target.id)) return;
                    if (archipelagoOpening && target.ownerId === null &&
                        !this.isArchipelagoGatewayAdvance(faction.id, staging, target)) return;
                    if (state.armies.some((army) =>
                        army.ownerId === faction.id && !army.isConvoy && army.toTerritoryId === target.id)) return;

                    const openTargetNeighbors = target.neighbors
                        .map((territoryId) => state.getTerritory(territoryId))
                        .filter((neighbor) => neighbor && !neighbor.isImpassable && !target.isPathBlocked(neighbor.id));
                    const encirclingSources = openTargetNeighbors
                        .filter((neighbor) => neighbor.ownerId === faction.id);
                    const encirclementRatio = encirclingSources.length / Math.max(1, openTargetNeighbors.length);
                    if (encirclementOnly &&
                        (target.ownerId === null || encirclingSources.length < 3 || encirclementRatio < 0.5)) return;

                    const requiredUnits = this.getCoordinatedAttackRequirement(faction, target);
                    const availableAtFront = Math.max(0, staging.units - this.getDefensiveReserve(faction.id, staging, profile.garrison));
                    const donors = this.rankOffensiveDonors(faction, owned, staging).slice(0, 3);
                    const combinedUnits = availableAtFront + donors.reduce((sum, donor) => sum + donor.surplus, 0);
                    if (combinedUnits < requiredUnits) return;

                    const defensePower = Math.max(1, target.units * this.game.getDefenseMultiplier(target));
                    const localPowerRatio = combinedUnits * attackMultiplier / defensePower;
                    if (encirclementOnly && localPowerRatio < 1.25) return;

                    const type = C.TERRITORY_TYPES[target.terrain];
                    const strategicValue = (type.productionMultiplier - 1) * 12 +
                        this.getArchipelagoExpansionScore(faction.id, target) +
                        (target.rareSite ? 12 : 0) +
                        (target.wonderId ? 85 : 0) +
                        (target.ownerId === null ? 1 : 5);
                    const pathCost = donors.reduce((sum, donor) => sum + donor.path.length - 1, 0);
                    const concentrationRatio = combinedUnits / Math.max(1, requiredUnits);
                    const encirclementScore = target.ownerId !== null && encirclingSources.length >= 2
                        ? encirclingSources.length * 10 + encirclementRatio * 35 + localPowerRatio * 6
                        : 0;
                    candidates.push({
                        stagingTerritoryId: staging.id,
                        targetTerritoryId: target.id,
                        requiredUnits,
                        contributorIds: donors.map((donor) => donor.territory.id),
                        createdAt: state.elapsedMs,
                        lastActionAt: state.elapsedMs,
                        expiresAt: state.elapsedMs + 90000,
                        encirclementScore,
                        score: strategicValue + concentrationRatio * 9 + encirclementScore * 0.35 - pathCost * 0.8 - requiredUnits * 0.012
                    });
                });
            });

            candidates.sort((a, b) => b.score - a.score);
            return candidates[0] || null;
        }

        rankOffensiveDonors(faction, owned, staging, preferredContributorIds = []) {
            const state = this.game.state;
            const profile = this.getProfile(faction.id);
            const archipelagoOpening = this.isArchipelagoOpening(faction.id);
            return owned.map((territory) => {
                if (territory.id === staging.id) return null;
                const path = this.game.findReinforcementPath(faction.id, territory.id, staging.id);
                if (!path) return null;
                const hostileNeighbors = territory.neighbors
                    .map((neighborId) => state.getTerritory(neighborId))
                    .filter((neighbor) => neighbor &&
                        !neighbor.isImpassable &&
                        !this.game.areAllied(neighbor.ownerId, faction.id) &&
                        !territory.isPathBlocked(neighbor.id));
                const reserve = archipelagoOpening && hostileNeighbors.length === 0
                    ? 1
                    : profile.garrison + Math.min(8, hostileNeighbors.length * 3) + (territory.wonderId || territory.wonderConstruction ? 28 : 0);
                const surplus = territory.units - this.getDefensiveReserve(faction.id, territory, reserve);
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

        manageContinuousReinforcements(faction, owned, reservedSourceIds = new Set()) {
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
                !reservedSourceIds.has(route.fromTerritoryId) &&
                this.game.state.elapsedMs - route.createdAt >= 45000 && !priorityTargetIds.has(route.toTerritoryId));
            if (staleRoute) {
                const source = state.getTerritory(staleRoute.fromTerritoryId);
                const target = priorityTargets
                    .map((entry) => entry.territory)
                    .find((candidate) => source && this.game.findReinforcementPath(faction.id, source.id, candidate.id));
                if (target) return this.createContinuousRoute(faction.id, source.id, target.id);
            }

            if (activeRoutes.length >= desiredRouteCount) return false;
            const usedSources = new Set(activeRoutes.map((route) => route.fromTerritoryId));
            const targetUseCounts = new Map();
            activeRoutes.forEach((route) => targetUseCounts.set(route.toTerritoryId, (targetUseCounts.get(route.toTerritoryId) || 0) + 1));
            const candidates = [];
            eligibleSources.filter((territory) => !usedSources.has(territory.id) && !reservedSourceIds.has(territory.id)).forEach((source) => {
                priorityTargets.forEach((targetEntry) => {
                    const target = targetEntry.territory;
                    if (source.id === target.id) return;
                    const path = this.game.findReinforcementPath(faction.id, source.id, target.id);
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
            const volcanicDangerIds = this.game.eventSystem.getVolcanicDangerTerritoryIds();
            const archipelagoOpening = this.isArchipelagoOpening(faction.id);
            const minimumGatewayDistance = archipelagoOpening
                ? Math.min(...owned.map((territory) => this.getArchipelagoGatewayDistance(faction.id, territory, 12)))
                : Infinity;
            return owned.map((territory) => {
                if (volcanicDangerIds.has(territory.id)) return null;
                const hostileNeighbors = territory.neighbors
                    .map((id) => state.getTerritory(id))
                    .filter((neighbor) => neighbor && !neighbor.isImpassable && !this.game.areAllied(neighbor.ownerId, faction.id) && !territory.isPathBlocked(neighbor.id));
                if (!hostileNeighbors.length) return null;
                const hasActualEnemy = hostileNeighbors.some((neighbor) => neighbor.ownerId !== null);
                if (archipelagoOpening && !hasActualEnemy &&
                    this.getArchipelagoGatewayDistance(faction.id, territory, 12) > minimumGatewayDistance) return null;
                const hostileStrength = hostileNeighbors.reduce((sum, neighbor) => sum + neighbor.units, 0);
                const danger = hostileStrength / Math.max(1, territory.units);
                const preferred = this.getProfile(faction.id).preferredTerrains.includes(territory.terrain) ? 1.5 : 0;
                const archipelagoPriority = hostileNeighbors.reduce((maximum, neighbor) =>
                    Math.max(maximum, this.getArchipelagoExpansionScore(faction.id, neighbor)), 0);
                const score = danger * 9 + hostileNeighbors.length * 2.5 + archipelagoPriority * 0.12 +
                    (territory.rareSite ? 4 : 0) + (territory.wonderId || territory.wonderConstruction ? 22 : 0) + preferred;
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
                const source = this.game.state.getTerritory(fromTerritoryId);
                const reserve = this.getRearLogisticsReserve(factionId, source);
                const surplus = source
                    ? source.units - this.getDefensiveReserve(factionId, source, reserve)
                    : 0;
                if (surplus >= 8) {
                    const units = Math.max(6, Math.floor(surplus * .80));
                    const dispatch = this.game.executeCommand({
                        type: "SEND_REINFORCEMENT_ROUTE",
                        playerId: factionId,
                        fromTerritoryId,
                        toTerritoryId,
                        units,
                        reinforcementRouteId: result.route.id
                    });
                    if (dispatch.ok) {
                        dispatch.army.logisticsPurpose = "continuous-initial-stock";
                        result.route.unitsDispatched += units;
                        this.game.notify({
                            type: "REINFORCEMENT_ROUTE_DISPATCH",
                            routeId: result.route.id,
                            units,
                            armyId: dispatch.army.id
                        });
                    }
                }
            }
            return result.ok;
        }

        findBestAttack(faction, owned, options = {}) {
            const state = this.game.state;
            const profile = this.getProfile(faction.id);
            const enemyOnly = options.enemyOnly === true;
            const archipelagoOpening = this.isArchipelagoOpening(faction.id);
            const minimumPowerRatio = Math.max(0, Number(options.minimumPowerRatio) || 0);
            const attackMultiplier = this.game.getFactionAttackMultiplier(faction.id);
            const candidates = [];

            owned.forEach((source) => {
                const available = source.units - this.getDefensiveReserve(faction.id, source, profile.garrison);
                if (available < 2) return;

                source.neighbors.forEach((neighborId) => {
                    const target = state.getTerritory(neighborId);
                    if (!target || target.isImpassable || this.game.areAllied(target.ownerId, faction.id)) return;
                    if (enemyOnly && target.ownerId === null) return;
                    if (archipelagoOpening && target.ownerId === null &&
                        !this.isArchipelagoGatewayAdvance(faction.id, source, target)) return;
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
                    score += this.getArchipelagoExpansionScore(faction.id, target);
                    score += (type.productionMultiplier - 1) * 18;
                    score += target.rareSite ? 18 : 0;
                    score += target.wonderId ? 95 : 0;
                    score += profile.preferredTerrains.includes(target.terrain) ? 5 : 0;
                    score += target.neighbors.filter((id) => !target.isPathBlocked(id) && state.getTerritory(id).ownerId === faction.id).length * 1.5;
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

        findBestReinforcement(faction, owned, reservedSourceIds = new Set()) {
            const state = this.game.state;
            const profile = this.getProfile(faction.id);
            const archipelagoOpening = this.isArchipelagoOpening(faction.id);
            const minimumGatewayDistance = archipelagoOpening
                ? Math.min(...owned.map((territory) => this.getArchipelagoGatewayDistance(faction.id, territory, 12)))
                : Infinity;
            const borderTerritories = owned.map((territory) => {
                const hostileNeighbors = territory.neighbors
                    .map((id) => state.getTerritory(id))
                    .filter((neighbor) => neighbor && !neighbor.isImpassable && !territory.isPathBlocked(neighbor.id) && !this.game.areAllied(neighbor.ownerId, faction.id));
                const hostileStrength = hostileNeighbors.reduce((sum, neighbor) => sum + neighbor.units, 0);
                return { territory, hostileNeighbors, hostileStrength };
            }).filter((entry) => {
                if (!entry.hostileNeighbors.length) return false;
                const hasActualEnemy = entry.hostileNeighbors.some((neighbor) => neighbor.ownerId !== null);
                return !archipelagoOpening || hasActualEnemy ||
                    this.getArchipelagoGatewayDistance(faction.id, entry.territory, 12) <= minimumGatewayDistance;
            });

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
                        !reservedSourceIds.has(territory.id) &&
                        !territory.isPathBlocked(target.id) &&
                        territory.units > profile.garrison + 3)
                    .map((territory) => ({
                        territory,
                        surplus: territory.units - this.getDefensiveReserve(faction.id, territory, profile.garrison)
                    }))
                    .filter((entry) => entry.surplus > 3)
                    .sort((a, b) => b.surplus - a.surplus);
                if (!sources.length) continue;

                const { territory: source, surplus } = sources[0];
                const units = Math.max(2, Math.floor(surplus * 0.48));
                return { source, target, units };
            }
            return null;
        }

        getDefensiveReserve(factionId, territory, minimumReserve = this.getProfile(factionId).garrison) {
            // Incoming attacks are visible from our territory. Hostile convoys turn back;
            // do not count them, distant destinations or anticipated friendly arrivals.
            let incomingPower = 0;
            this.game.state.armies.forEach((army) => {
                if (army.isConvoy || army.toTerritoryId !== territory.id || army.units <= 0) return;
                if (!army.isBarbarian && this.game.areAllied(army.ownerId, factionId)) return;
                const attackMultiplier = army.isBarbarian
                    ? C.BARBARIAN_FACTION.bonuses.attackMultiplier * C.BARBARIAN_FACTION.bonuses.combatMultiplier
                    : this.game.getFactionAttackMultiplier(army.ownerId);
                incomingPower += army.units * attackMultiplier;
            });
            if (incomingPower === 0) return minimumReserve;

            // Combat rolls range from .88 to 1.12: 1.28 covers their ratio.
            // Summing incoming forces also preserves a reserve for successive attacks.
            const defense = Math.max(0.1, this.game.getDefenseMultiplier(territory));
            return Math.max(minimumReserve, Math.ceil(incomingPower * 1.28 / defense) + 1);
        }

        getRearLogisticsReserve(factionId, territory) {
            const profile = this.getProfile(factionId);
            if (!territory) return profile.garrison;
            return profile.garrison +
                (territory.isCapital ? 15 : 0) +
                (territory.installation ? 8 : 0) +
                (territory.rareSite ? 5 : 0) +
                (territory.wonderId || territory.wonderConstruction ? 28 : 0);
        }

        issueOrder(factionId, fromTerritoryId, toTerritoryId, units) {
            const source = this.game.state.getTerritory(fromTerritoryId);
            if (!source || source.units - units < this.getDefensiveReserve(factionId, source)) return false;
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

        getMaximumRearRedistributions(territoryCount) {
            return C.Geometry.clamp(Math.ceil(Math.max(0, territoryCount) / 6), 3, 10);
        }

        getMaximumNeutralExpansions(territoryCount, options = {}) {
            const ownedCount = Math.max(0, Number(territoryCount) || 0);
            const totalLandCount = Math.max(0, Number(options.totalLandCount) ||
                this.game.state.territories.filter((territory) => !territory.isImpassable).length);
            if (ownedCount <= 1) return 1;

            // Deux axes apparaissent rapidement. Un empire mûr en obtient un troisième
            // sur la carte actuelle et un quatrième seulement sur la grande carte.
            let maximum = ownedCount < 12 ? 2 : totalLandCount >= 150 ? 4 : 3;
            if (options.underEnemyPressure) maximum = Math.min(maximum, 2);
            else if (options.hasEnemyBorder) maximum = Math.min(maximum, 3);
            return C.Geometry.clamp(maximum, 1, 4);
        }
    }

    C.AICombat = AICombat;
})(window.Conquest = window.Conquest || {});
