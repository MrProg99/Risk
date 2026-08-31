(function (C) {
    "use strict";

    class Game {
        constructor(options = {}) {
            const availableFactionIds = C.FACTION_DEFINITIONS.map((definition) => definition.id);
            const requestedPlayerId = Number(options.playerId);
            this.factionSetups = Array.isArray(options.factionSetups) && options.factionSetups.length
                ? options.factionSetups.map((setup) => ({ ...setup, bonuses: { ...setup.bonuses } }))
                : null;
            const runtimeFactionIds = this.factionSetups
                ? this.factionSetups.map((setup) => Number(setup.id))
                : availableFactionIds;
            this.playerId = runtimeFactionIds.includes(requestedPlayerId) ? requestedPlayerId : runtimeFactionIds[0];
            const requestedFactionIds = Array.isArray(options.activeFactionIds)
                ? options.activeFactionIds.map(Number)
                : availableFactionIds;
            this.activeFactionIds = [...new Set(this.factionSetups ? runtimeFactionIds : requestedFactionIds)]
                .filter((factionId) => runtimeFactionIds.includes(factionId));
            if (!this.activeFactionIds.includes(this.playerId)) this.activeFactionIds.unshift(this.playerId);
            this.mapSize = C.normalizeMapSize(options.mapSize);
            const mapSize = C.getMapSizeDefinition(this.mapSize);
            this.state = new C.GameState({ mapSize: this.mapSize });
            this.mapType = C.normalizeMapType(options.mapType);
            this.mapGenerator = new C.MapGenerator(mapSize.width, mapSize.height, mapSize);
            this.listeners = new Set();
            this.random = Math.random;
            this.paused = false;
            this.timeScale = C.Geometry.clamp(Number(options.timeScale ?? 0.72), 0.25, 2);
            this.productionIntervalMs = 5000;
            this.unitProductionMultiplier = C.Geometry.clamp(Number(options.unitProductionMultiplier ?? 0.875), 0.1, 2);
            this.visibilityRange = Math.round(C.Geometry.clamp(Number(options.visibilityRange ?? 2), 1, 6));
            this.quickTransferRatio = C.Geometry.clamp(Number(options.quickTransferRatio ?? 0.8), 0.1, 1);
            this.capitalProductionBonus = C.Geometry.clamp(Number(options.capitalProductionBonus ?? 0.20), 0, 2);
            this.capitalDefenseBonus = C.Geometry.clamp(Number(options.capitalDefenseBonus ?? 0.25), 0, 2);
            this.airstrikeRangeHops = C.Geometry.clamp(Math.round(Number(options.airstrikeRangeHops ?? 4)), 1, 10);
            this.airstrikeCooldownMs = C.Geometry.clamp(Number(options.airstrikeCooldownMs ?? 38000), 5000, 120000);
            this.airstrikeDamageRatio = C.Geometry.clamp(Number(options.airstrikeDamageRatio ?? 0.10), 0.01, 0.9);
            this.railroadConstructionDurationMs = C.Geometry.clamp(Number(options.railroadConstructionDurationMs ?? 45000), 10000, 300000);
            this.railroadTravelSpeedMultiplier = C.Geometry.clamp(Number(options.railroadTravelSpeedMultiplier ?? 1.35), 1, 3);
            this.wonderCaptureActivationDelayMs = C.Geometry.clamp(Number(options.wonderCaptureActivationDelayMs ?? 20000), 0, 120000);
            this.capitalFoodCapacity = Math.max(0, Number(options.capitalFoodCapacity ?? 200));
            this.territoryBaseFoodCapacity = Math.max(0, Number(options.territoryBaseFoodCapacity ?? 10));
            this.foodAttritionThreshold = C.Geometry.clamp(Number(options.foodAttritionThreshold ?? (1 / 1.40)), 0.1, 1);
            this.foodAttritionIntervalMs = Math.max(2000, Number(options.foodAttritionIntervalMs ?? 10000));
            this.permanentAiFactionIds = [...new Set(Array.isArray(options.aiFactionIds)
                ? options.aiFactionIds.map(Number)
                : this.activeFactionIds.filter((factionId) => factionId !== this.playerId))];
            this.aiProductionMultiplier = C.Geometry.clamp(Number(options.aiProductionMultiplier ?? 1), 0.5, 2);
            this.aiSystem = new C.AISystem(this, {
                enabled: options.enableAI !== false,
                factionIds: this.permanentAiFactionIds.slice()
            });
            this.eventSystem = new C.EventSystem(this, {
                enabled: options.enableWorldEvents !== false
            });
            this.commandTransport = null;
            this.isApplyingRemoteCommand = false;
        }

        newGame(seed = this.createSeed()) {
            const normalizedSeed = Math.abs(Number(seed) || this.createSeed()) % 1000000;
            const generated = this.mapGenerator.generate(normalizedSeed, undefined, this.mapType);
            const state = new C.GameState({ mapSize: this.mapSize });
            state.seed = normalizedSeed;
            state.mapType = generated.mapType;
            state.chokeEdges = generated.chokeEdges || [];
            state.islandPolygon = generated.islandPolygon;
            state.territories = generated.territories;
            state.factions = this.activeFactionIds.map((factionId) => {
                const definition = this.factionSetups
                    ? this.factionSetups.find((candidate) => Number(candidate.id) === factionId)
                    : C.FACTION_DEFINITIONS.find((candidate) => candidate.id === factionId);
                return new C.Faction(definition);
            });
            this.state = state;
            this.random = C.Geometry.seededRandom((normalizedSeed ^ 0x9E3779B9) >>> 0);
            this.paused = false;

            this.assignStartingTerritories();
            state.factions.forEach((faction) => {
                faction.isAI = faction.isAI || this.permanentAiFactionIds.includes(faction.id);
                faction.statistics.peakTerritories = state.getTerritoriesOwnedBy(faction.id).length;
            });
            this.assignRareSites();
            this.assignInstallations();
            this.aiSystem.reset();
            this.eventSystem.reset();
            const playerFaction = state.getFaction(this.playerId);
            const computerFactions = state.factions.filter((faction) => this.aiSystem.factionIds.includes(faction.id));
            this.addEvent(`Le commandement de la faction ${playerFaction.name} est opérationnel.`, "info");
            if (this.aiSystem.enabled && computerFactions.length) {
                const names = computerFactions.map((faction) => faction.name);
                const list = names.length > 1
                    ? `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`
                    : names[0];
                this.addEvent(names.length > 1
                    ? `Les factions ${list} sont contrôlées par l’ordinateur.`
                    : `La faction ${list} est contrôlée par l’ordinateur.`, "info");
            }
            const lakeCount = state.territories.filter((territory) => territory.isImpassable).length;
            this.addEvent(this.mapType === "archipelago"
                ? `Archipel généré : ${state.territories.length - lakeCount} territoires terrestres, ${lakeCount} zones maritimes et plusieurs passages interinsulaires.`
                : `Carte générée : ${state.territories.length - lakeCount} territoires et ${lakeCount} lacs infranchissables.`, "info");
            const cannonCount = state.territories.filter((territory) => territory.installation?.type === "cannon").length;
            this.addEvent(`${cannonCount} canons de campagne sont disséminés sur la carte.`, "info");
            this.notify({ type: "NEW_GAME", seed: normalizedSeed });
            return state;
        }

        createSeed() {
            if (window.crypto && window.crypto.getRandomValues) {
                const values = new Uint32Array(1);
                window.crypto.getRandomValues(values);
                return values[0] % 1000000;
            }
            return Math.floor(Math.random() * 1000000);
        }

        assignStartingTerritories() {
            const territories = this.state.territories.filter((territory) => !territory.isImpassable);
            const starts = this.mapType === "hourglass"
                ? this.selectHourglassStartingTerritories(territories)
                : this.mapType === "archipelago"
                    ? this.selectArchipelagoStartingTerritories(territories)
                    : this.selectDistributedStartingTerritories(territories);

            this.state.territories.forEach((territory) => {
                territory.ownerId = null;
                territory.units = territory.isImpassable ? 0 : C.Geometry.randomInt(this.random, 3, 12);
                territory.productionProgress = territory.isImpassable ? 0 : this.random() * 0.8;
                territory.isCapital = false;
                territory.productionMode = "units";
                territory.productionModeChangedAtMs = 0;
                territory.railroad = false;
                territory.railroadConstructionActive = false;
                territory.railroadConstructionProgressMs = 0;
                territory.railroadPreviousProductionMode = null;
                territory.buildings = [];
                territory.buildingConstruction = null;
                territory.wonderId = null;
                territory.wonderBuilderFactionId = null;
                territory.wonderConstruction = null;
                territory.wonderActivationRemainingMs = 0;
                territory.wonderActionProgressMs = 0;
                territory.wonderLastAction = null;
                territory.airstrikeLastAction = null;
            });
            starts.forEach((territory, index) => {
                const faction = this.state.factions[index];
                territory.ownerId = faction.id;
                territory.units = 20;
                territory.productionProgress = 0;
                territory.isCapital = true;
                faction.capitalTerritoryId = territory.id;
            });
            this.state.territories.forEach((territory) => {
                territory.airstrikeCooldownMs = territory.terrain === "airport" && territory.ownerId !== null
                    ? this.airstrikeCooldownMs
                    : 0;
            });
        }

        selectDistributedStartingTerritories(territories) {
            const starts = [];
            starts.push(territories[C.Geometry.randomInt(this.random, 0, territories.length - 1)]);
            while (starts.length < this.state.factions.length) {
                const candidates = territories.filter((territory) => !starts.includes(territory));
                let best = candidates[0];
                let bestScore = -Infinity;
                candidates.forEach((candidate) => {
                    const nearestStart = Math.min(...starts.map((start) => C.Geometry.squaredDistance(candidate.center, start.center)));
                    const score = nearestStart + candidate.neighbors.length * 750;
                    if (score > bestScore) {
                        bestScore = score;
                        best = candidate;
                    }
                });
                starts.push(best);
            }
            return starts;
        }

        selectHourglassStartingTerritories(territories) {
            const centerX = this.state.mapWidth / 2;
            const teams = [...new Set(this.state.factions.map((faction) => faction.teamId))];
            const teamSides = new Map(teams.map((teamId, index) => [teamId, index % 2 === 0 ? -1 : 1]));
            const starts = [];
            this.state.factions.forEach((faction) => {
                const side = teamSides.get(faction.teamId) || -1;
                let candidates = territories.filter((territory) =>
                    !territory.isChokePoint &&
                    !starts.includes(territory) &&
                    (side < 0 ? territory.center.x < centerX - this.state.mapWidth * 0.06 : territory.center.x > centerX + this.state.mapWidth * 0.06));
                if (!candidates.length) candidates = territories.filter((territory) => !territory.isChokePoint && !starts.includes(territory));
                const teamStarts = starts.filter((_territory, index) => this.state.factions[index]?.teamId === faction.teamId);
                candidates.sort((a, b) => {
                    const score = (candidate) => {
                        const sameTeamSpacing = teamStarts.length
                            ? Math.min(...teamStarts.map((start) => C.Geometry.squaredDistance(candidate.center, start.center)))
                            : 0;
                        const globalSpacing = starts.length
                            ? Math.min(...starts.map((start) => C.Geometry.squaredDistance(candidate.center, start.center)))
                            : 0;
                        return sameTeamSpacing + globalSpacing * 0.2 + Math.abs(candidate.center.x - centerX) * 120 + candidate.neighbors.length * 500;
                    };
                    return score(b) - score(a);
                });
                starts.push(candidates[0]);
            });
            return starts;
        }

        selectArchipelagoStartingTerritories(territories) {
            const islandTerritories = territories.filter((territory) =>
                !territory.isChokePoint && territory.archipelagoIslandId !== null);
            const islandIds = [...new Set(islandTerritories.map((territory) => territory.archipelagoIslandId))].sort((a, b) => a - b);
            if (!islandIds.length) return this.selectDistributedStartingTerritories(territories);

            const columns = Math.max(1, islandIds.length / 2);
            const teams = [...new Set(this.state.factions.map((faction) => faction.teamId))];
            const usedIslands = new Set();
            const teamIslands = new Map();
            const starts = [];

            this.state.factions.forEach((faction) => {
                const teamIndex = teams.indexOf(faction.teamId);
                const preferredIslands = teams.length === 2
                    ? islandIds.filter((islandId) => Math.floor(islandId / columns) === teamIndex)
                    : islandIds;
                const alreadyUsedByTeam = teamIslands.get(faction.teamId) || new Set();
                let candidateIslandIds = preferredIslands.filter((islandId) => !alreadyUsedByTeam.has(islandId));
                if (!candidateIslandIds.length) candidateIslandIds = preferredIslands.length ? preferredIslands : islandIds;

                const passageCenters = territories
                    .filter((territory) => territory.isArchipelagoPassage)
                    .map((territory) => territory.center);
                const candidates = islandTerritories.filter((territory) => candidateIslandIds.includes(territory.archipelagoIslandId));
                candidates.sort((first, second) => {
                    const score = (territory) => {
                        const spacing = starts.length
                            ? Math.min(...starts.map((start) => C.Geometry.squaredDistance(start.center, territory.center)))
                            : C.Geometry.squaredDistance(territory.center, { x: this.state.mapWidth / 2, y: this.state.mapHeight / 2 });
                        const passageDistance = passageCenters.length
                            ? Math.min(...passageCenters.map((center) => C.Geometry.squaredDistance(center, territory.center)))
                            : 0;
                        const unusedIslandBonus = usedIslands.has(territory.archipelagoIslandId) ? 0 : 1e9;
                        return unusedIslandBonus + spacing + passageDistance * 0.22 + territory.neighbors.length * 1800;
                    };
                    return score(second) - score(first);
                });
                const selected = candidates[0] || islandTerritories.find((territory) => !starts.includes(territory));
                starts.push(selected);
                usedIslands.add(selected.archipelagoIslandId);
                if (!teamIslands.has(faction.teamId)) teamIslands.set(faction.teamId, new Set());
                teamIslands.get(faction.teamId).add(selected.archipelagoIslandId);
            });
            return starts;
        }

        assignRareSites() {
            const startIds = new Set(this.state.territories.filter((territory) => territory.ownerId !== null).map((territory) => territory.id));
            const forbiddenIds = new Set(startIds);
            this.state.territories.forEach((territory) => {
                if (startIds.has(territory.id)) territory.neighbors.forEach((id) => forbiddenIds.add(id));
            });

            let candidates = this.state.territories.filter((territory) => !territory.isImpassable && !territory.isChokePoint && !forbiddenIds.has(territory.id) && territory.neighbors.length >= 4);
            if (candidates.length < 4) candidates = this.state.territories.filter((territory) => !territory.isImpassable && !territory.isChokePoint && !startIds.has(territory.id));
            candidates = C.Geometry.shuffle(candidates, this.random);
            const chosen = [];

            const rareSiteCount = Math.min(C.RARE_SITES.length, Math.max(4, Math.round(this.state.territories.length / 14)));
            while (chosen.length < rareSiteCount && candidates.length) {
                candidates.sort((a, b) => {
                    const score = (territory) => chosen.length
                        ? Math.min(...chosen.map((site) => C.Geometry.squaredDistance(territory.center, site.center)))
                        : territory.neighbors.length * 10000;
                    return score(b) - score(a);
                });
                chosen.push(candidates.shift());
            }

            const rareSites = C.Geometry.shuffle(C.RARE_SITES, this.random).slice(0, chosen.length);
            chosen.forEach((territory, index) => {
                territory.rareSite = { ...rareSites[index] };
                territory.resource = rareSites[index].resource;
                territory.name = rareSites[index].name;
            });
        }

        assignInstallations() {
            const definition = C.INSTALLATION_TYPES.cannon;
            const candidates = C.Geometry.shuffle(this.state.territories.filter((territory) =>
                !territory.isImpassable &&
                !territory.isChokePoint &&
                territory.ownerId === null &&
                !territory.rareSite &&
                territory.neighbors.length >= 3), this.random);
            if (!candidates.length) return;

            candidates.sort((a, b) => b.neighbors.length - a.neighbors.length);
            const selected = [candidates.shift()];
            while (selected.length < definition.maximumPerMap && candidates.length) {
                candidates.sort((a, b) => {
                    const distanceFromSelected = (territory) => Math.min(...selected.map((site) =>
                        C.Geometry.squaredDistance(territory.center, site.center)));
                    return distanceFromSelected(b) - distanceFromSelected(a);
                });
                selected.push(candidates.shift());
            }

            selected.forEach((territory) => {
                territory.installation = {
                    type: definition.id,
                    name: definition.name,
                    icon: definition.icon
                };
                territory.installationProgressMs = 0;
            });
        }

        update(deltaMs) {
            if (this.paused || deltaMs <= 0) return;
            const safeDelta = Math.min(deltaMs, 1000) * this.timeScale;
            this.state.elapsedMs += safeDelta;
            let changed = false;

            this.maintainReinforcementRoutes();
            changed = this.updateRailroadConstruction(safeDelta) || changed;
            changed = this.updateBuildingConstruction(safeDelta) || changed;
            changed = this.updateWonderConstruction(safeDelta) || changed;
            changed = this.updateWonderActivation(safeDelta) || changed;
            changed = this.eventSystem.update(safeDelta) || changed;
            changed = this.updateFoodSystem(safeDelta) || changed;

            this.state.territories.forEach((territory) => {
                if (territory.ownerId === null || territory.productionMode !== "units") return;
                territory.productionProgress += (safeDelta / this.productionIntervalMs) * this.getProductionMultiplier(territory);
                if (territory.productionProgress >= 1) {
                    const produced = Math.floor(territory.productionProgress);
                    territory.units += produced;
                    const owner = this.state.getFaction(territory.ownerId);
                    if (owner) owner.statistics.unitsProduced += produced;
                    territory.productionProgress -= produced;
                    this.dispatchProducedReinforcements(territory, produced);
                    changed = true;
                }
            });

            changed = this.updateResearch(safeDelta) || changed;
            changed = this.updateWonderWeapons(safeDelta) || changed;
            changed = this.updateInstallations(safeDelta) || changed;
            changed = this.updateAirports(safeDelta) || changed;
            changed = this.updateAbilities(safeDelta) || changed;

            const arrivedArmies = [];
            this.state.armies.forEach((army) => {
                army.elapsedMs += safeDelta;
                if (army.elapsedMs >= army.durationMs) arrivedArmies.push(army);
            });
            arrivedArmies.forEach((army) => this.resolveArmyArrival(army));
            this.aiSystem.update(safeDelta);

            if (changed || arrivedArmies.length) this.state.touch();
        }

        updateAirports(deltaMs) {
            let changed = false;
            this.state.territories.forEach((territory) => {
                if (territory.terrain !== "airport") return;
                if (territory.ownerId === null) {
                    territory.airstrikeCooldownMs = 0;
                    return;
                }
                const wasReloading = territory.airstrikeCooldownMs > 0;
                if (territory.airstrikeCooldownMs > 0) {
                    territory.airstrikeCooldownMs = Math.max(0, territory.airstrikeCooldownMs - deltaMs);
                }
                if (territory.airstrikeCooldownMs > 0) return;
                const crossedScanBoundary = Math.floor(this.state.elapsedMs / 1000) !==
                    Math.floor(Math.max(0, this.state.elapsedMs - deltaMs) / 1000);
                if (!wasReloading && !crossedScanBoundary) return;

                const target = this.findAirportTarget(territory);
                if (!target) return;
                this.resolveAirstrike(territory, target, true);
                changed = true;
            });
            return changed;
        }

        updateAbilities(deltaMs) {
            let changed = false;
            this.state.factions.forEach((faction) => {
                Object.keys(C.ABILITY_DEFINITIONS).forEach((abilityId) => {
                    const remaining = Number(faction.abilityCooldowns?.[abilityId]) || 0;
                    if (remaining <= 0) return;
                    faction.abilityCooldowns[abilityId] = Math.max(0, remaining - deltaMs);
                });
            });

            const ready = this.state.abilityActions.filter((action) =>
                action.resolvedAtMs == null && action.executeAtMs <= this.state.elapsedMs);
            ready.forEach((action) => {
                const target = this.state.getTerritory(action.targetTerritoryId);
                const faction = this.state.getFaction(action.factionId);
                let damage = 0;
                let impacts = [];
                if (action.abilityId === "missile" && target && faction && !target.isImpassable && !this.areAllied(target.ownerId, action.factionId)) {
                    const definition = C.ABILITY_DEFINITIONS.missile;
                    const damageRatio = Number(action.damageRatio) || definition.damageRatio;
                    const maximumDamage = Number(action.maximumDamage) || definition.maximumDamage;
                    damage = target.units > 1
                        ? Math.min(target.units - 1, maximumDamage, Math.max(1, Math.round(target.units * damageRatio)))
                        : 0;
                    target.units -= damage;
                    this.recordUnitLoss(target.ownerId, damage, faction.id);
                    this.addEvent(`${faction.name} frappe ${target.name} avec un missile tactique : ${damage} perte${damage > 1 ? "s" : ""}.`, "combat");
                } else if (action.abilityId === "missile" && target && faction) {
                    this.addEvent(`Le missile de ${faction.name} manque sa cible stratégique à ${target.name}.`, "combat");
                } else if (action.abilityId === "nuclear" && target && faction && !target.isImpassable) {
                    const definition = C.ABILITY_DEFINITIONS.nuclear;
                    const centerDamageRatio = Number(action.centerDamageRatio) || definition.centerDamageRatio;
                    const adjacentDamageRatio = Number(action.adjacentDamageRatio) || definition.adjacentDamageRatio;
                    const affectedTerritories = [target, ...target.neighbors
                        .map((territoryId) => this.state.getTerritory(territoryId))
                        .filter((territory) => territory && !territory.isImpassable)];
                    const seen = new Set();
                    impacts = affectedTerritories.filter((territory) => {
                        if (seen.has(territory.id)) return false;
                        seen.add(territory.id);
                        return true;
                    }).map((territory) => {
                        const ratio = territory.id === target.id ? centerDamageRatio : adjacentDamageRatio;
                        const losses = territory.units > 1
                            ? Math.min(territory.units - 1, Math.max(1, Math.round(territory.units * ratio)))
                            : 0;
                        territory.units -= losses;
                        this.recordUnitLoss(territory.ownerId, losses, faction.id);
                        return { territoryId: territory.id, damage: losses, ratio };
                    });
                    damage = impacts.reduce((sum, impact) => sum + impact.damage, 0);
                    action.resolvedAtMs = this.state.elapsedMs;
                    action.impacts = impacts.map((impact) => ({ ...impact }));
                    this.addEvent(`${faction.name} déclenche une frappe nucléaire sur ${target.name} : ${damage} pertes dans la zone d’impact.`, "combat");
                }
                this.notify({ type: "ABILITY_RESOLVED", abilityId: action.abilityId, factionId: action.factionId, targetTerritoryId: action.targetTerritoryId, damage, impacts });
                changed = true;
            });
            if (ready.length) {
                const readyIds = new Set(ready.filter((action) => action.abilityId !== "nuclear").map((action) => action.id));
                this.state.abilityActions = this.state.abilityActions.filter((action) => !readyIds.has(action.id));
            }
            const actionCountBeforeCleanup = this.state.abilityActions.length;
            this.state.abilityActions = this.state.abilityActions.filter((action) => {
                if (action.abilityId !== "nuclear" || action.resolvedAtMs == null) return true;
                return this.state.elapsedMs - action.resolvedAtMs < C.ABILITY_DEFINITIONS.nuclear.effectDurationMs;
            });
            if (this.state.abilityActions.length !== actionCountBeforeCleanup) changed = true;
            return changed;
        }

        updateInstallations(deltaMs) {
            const cannon = C.INSTALLATION_TYPES.cannon;
            let changed = false;
            this.state.territories.forEach((territory) => {
                if (territory.installation?.type !== cannon.id) return;
                if (territory.ownerId === null) {
                    territory.installationProgressMs = 0;
                    return;
                }

                const faction = this.state.getFaction(territory.ownerId);
                const reloadMultiplier = 1 +
                    C.getFactionTechnologyBonus(faction, "cannonReloadMultiplier") +
                    this.getWonderGlobalEffect(faction.id, "cannonReloadMultiplier");
                territory.installationProgressMs = Math.min(
                    cannon.fireIntervalMs,
                    territory.installationProgressMs + deltaMs * reloadMultiplier
                );
                if (territory.installationProgressMs < cannon.fireIntervalMs) return;

                const target = this.findCannonTarget(territory);
                if (!target) return;
                territory.installationProgressMs = 0;
                const hit = this.random() < cannon.hitChance;
                let damage = 0;
                if (hit) {
                    damage = Math.min(cannon.damage, target.units - 1);
                    target.units -= damage;
                    this.recordUnitLoss(target.ownerId, damage, territory.ownerId);
                    changed = true;
                    this.addEvent(`Le canon de ${territory.name} touche ${target.name} : ${damage} unité${damage > 1 ? "s" : ""} ennemie${damage > 1 ? "s" : ""} détruite${damage > 1 ? "s" : ""}.`, "combat");
                }
                this.notify({
                    type: "CANNON_FIRED",
                    fromTerritoryId: territory.id,
                    targetTerritoryId: target.id,
                    ownerId: territory.ownerId,
                    hit,
                    damage
                });
            });
            return changed;
        }

        updateResearch(deltaMs) {
            let changed = false;
            this.state.factions.forEach((faction) => {
                const research = faction.research;
                const technology = C.TECHNOLOGIES[research.activeTechnologyId];
                if (!technology || !this.state.getTerritoriesOwnedBy(faction.id).length) return;

                research.progressMs += deltaMs * this.getResearchRate(faction.id);
                if (research.progressMs < technology.durationMs) return;

                research.completedTechnologyIds.push(technology.id);
                faction.statistics.researchCompleted += 1;
                research.activeTechnologyId = null;
                research.progressMs = 0;
                changed = true;
                this.addEvent(`${faction.name} termine la recherche : ${technology.name}.`, "research");
                this.notify({
                    type: "RESEARCH_COMPLETED",
                    factionId: faction.id,
                    technologyId: technology.id
                });
            });
            return changed;
        }

        findCannonTarget(territory) {
            return territory.neighbors
                .map((territoryId) => this.state.getTerritory(territoryId))
                .filter((neighbor) => neighbor &&
                    neighbor.ownerId !== null &&
                    !this.areAllied(neighbor.ownerId, territory.ownerId) &&
                    neighbor.units > 1)
                .sort((a, b) => {
                    const strategicScore = (target) => target.units +
                        (target.rareSite ? 8 : 0) +
                        this.getProductionMultiplier(target) * 2;
                    return strategicScore(b) - strategicScore(a);
                })[0] || null;
        }

        updateWonderWeapons(deltaMs) {
            const definition = C.WONDER_TYPES["big-bertha"];
            if (!definition) return false;
            const effects = definition.siteEffects;
            let changed = false;
            this.state.territories.forEach((territory) => {
                if (territory.wonderId !== definition.id) return;
                if (!this.isWonderActive(territory)) {
                    if (territory.wonderActionProgressMs !== 0) territory.wonderActionProgressMs = 0;
                    return;
                }

                territory.wonderActionProgressMs = Math.min(
                    effects.fireIntervalMs,
                    Math.max(0, Number(territory.wonderActionProgressMs) || 0) + deltaMs
                );
                if (territory.wonderActionProgressMs < effects.fireIntervalMs) return;
                const target = this.findBigBerthaTarget(territory);
                if (!target) return;

                territory.wonderActionProgressMs = 0;
                const hit = this.random() < effects.hitChance;
                const damage = hit ? this.getBigBerthaDamage(target) : 0;
                if (damage > 0) {
                    target.units -= damage;
                    this.recordUnitLoss(target.ownerId, damage, territory.ownerId);
                }
                territory.wonderLastAction = {
                    type: "big-bertha",
                    targetTerritoryId: target.id,
                    hit,
                    damage,
                    firedAtMs: this.state.elapsedMs
                };
                const owner = this.state.getFaction(territory.ownerId);
                this.addEvent(hit
                    ? `${definition.name} de ${territory.name} pilonne ${target.name} : ${damage} pertes.`
                    : `${definition.name} de ${territory.name} manque ${target.name}.`, "combat");
                this.notify({
                    type: "BIG_BERTHA_FIRED",
                    factionId: owner?.id ?? territory.ownerId,
                    fromTerritoryId: territory.id,
                    targetTerritoryId: target.id,
                    hit,
                    damage,
                    firedAtMs: this.state.elapsedMs
                });
                changed = true;
            });
            return changed;
        }

        getBigBerthaDamage(target) {
            const effects = C.WONDER_TYPES["big-bertha"]?.siteEffects;
            if (!effects || !target || target.units <= 1) return 0;
            const requested = Math.max(1, Math.round(effects.flatDamage + target.units * effects.damageRatio));
            return Math.min(target.units - 1, effects.maximumDamage, requested);
        }

        findBigBerthaTarget(territory) {
            const effects = C.WONDER_TYPES["big-bertha"]?.siteEffects;
            if (!effects || !territory || territory.ownerId === null) return null;
            const visibility = this.getTerritoryVisibilityMap(territory.ownerId);
            const strategicScore = (target) =>
                this.getBigBerthaDamage(target) * 6 +
                target.units * 0.12 +
                (target.isCapital ? 35 : 0) +
                (target.wonderId || target.wonderConstruction ? 65 : 0) +
                (target.installation ? 15 : 0) +
                (target.rareSite ? 18 : 0) +
                (target.productionMode === "food" ? 10 : target.productionMode === "research" ? 8 : 0);
            return this.getTerritoriesWithinHops(territory, effects.rangeHops)
                .filter((target) =>
                    !target.isImpassable &&
                    target.ownerId !== null &&
                    !this.areAllied(target.ownerId, territory.ownerId) &&
                    target.units > 1 &&
                    visibility.has(target.id))
                .sort((first, second) => strategicScore(second) - strategicScore(first))[0] || null;
        }

        // Renvoie tous les territoires atteignables en au plus maxHops sauts sur le
        // graphe brut des voisins — sans tenir compte des montagnes ni des lacs,
        // puisqu'un appareil volant ou un obus lourd les survole. Utilisé pour la
        // portée des frappes aériennes et de la Grosse Bertha.
        getTerritoriesWithinHops(source, maxHops) {
            const result = [];
            const visited = new Set([source.id]);
            let frontier = [source.id];
            for (let hop = 0; hop < maxHops && frontier.length; hop += 1) {
                const next = [];
                frontier.forEach((id) => {
                    const territory = this.state.getTerritory(id);
                    if (!territory) return;
                    territory.neighbors.forEach((neighborId) => {
                        if (visited.has(neighborId)) return;
                        visited.add(neighborId);
                        const neighborTerritory = this.state.getTerritory(neighborId);
                        if (neighborTerritory) {
                            result.push(neighborTerritory);
                            next.push(neighborId);
                        }
                    });
                });
                frontier = next;
            }
            return result;
        }

        getAirstrikeDamageRatio(factionId = null) {
            const faction = factionId === null ? null : this.state.getFaction(factionId);
            return C.Geometry.clamp(
                this.airstrikeDamageRatio + C.getFactionTechnologyBonus(faction, "airstrikeDamageRatioBonus"),
                0.01,
                0.95
            );
        }

        getAirstrikeDamage(target, factionId = null) {
            if (!target || target.units <= 1) return 0;
            return Math.min(target.units - 1, Math.max(1, Math.round(target.units * this.getAirstrikeDamageRatio(factionId))));
        }

        findAirportTarget(source) {
            if (!source || source.terrain !== "airport" || source.ownerId === null) return null;
            const visibility = this.getTerritoryVisibilityMap(source.ownerId);
            const strategicScore = (target) =>
                this.getAirstrikeDamage(target, source.ownerId) * 8 +
                target.units * 0.12 +
                (target.isCapital ? 35 : 0) +
                (target.wonderId || target.wonderConstruction ? 60 : 0) +
                (target.installation ? 18 : 0) +
                (target.rareSite ? 16 : 0) +
                (target.productionMode === "food" ? 9 : target.productionMode === "research" ? 7 : 0);
            return this.getTerritoriesWithinHops(source, this.airstrikeRangeHops)
                .filter((target) =>
                    !target.isImpassable &&
                    target.ownerId !== null &&
                    !this.areAllied(target.ownerId, source.ownerId) &&
                    target.units > 1 &&
                    visibility.has(target.id))
                .sort((first, second) => strategicScore(second) - strategicScore(first))[0] || null;
        }

        resolveAirstrike(source, target, automatic = false) {
            const faction = this.state.getFaction(source?.ownerId);
            if (!source || !target || !faction) return { ok: false, error: "Frappe aérienne invalide." };
            const damage = this.getAirstrikeDamage(target, faction.id);
            target.units -= damage;
            this.recordUnitLoss(target.ownerId, damage, faction.id);
            source.airstrikeCooldownMs = this.airstrikeCooldownMs;
            source.airstrikeLastAction = {
                targetTerritoryId: target.id,
                damage,
                automatic: Boolean(automatic),
                firedAtMs: Math.max(1, this.state.elapsedMs)
            };

            const defender = this.state.getFaction(target.ownerId);
            if (damage > 0) {
                this.addEvent(`${faction.name} lance ${automatic ? "automatiquement " : ""}un raid aérien depuis ${source.name} sur ${target.name}${defender ? ` (${defender.name})` : ""} : ${damage} perte${damage > 1 ? "s" : ""}.`, "combat");
            } else {
                this.addEvent(`${faction.name} lance un raid aérien depuis ${source.name} sur ${target.name}, sans effet notable.`, "combat");
            }
            this.notify({
                type: "AIRSTRIKE_RESOLVED",
                sourceTerritoryId: source.id,
                targetTerritoryId: target.id,
                factionId: faction.id,
                damage,
                automatic: Boolean(automatic),
                firedAtMs: source.airstrikeLastAction.firedAtMs
            });
            return { ok: true, damage };
        }

        isWithinAirstrikeRange(source, target) {
            return this.getTerritoriesWithinHops(source, this.airstrikeRangeHops).some((candidate) => candidate.id === target.id);
        }

        launchAirstrike({ playerId, fromTerritoryId, toTerritoryId }) {
            const faction = this.state.getFaction(playerId);
            const source = this.state.getTerritory(fromTerritoryId);
            const target = this.state.getTerritory(toTerritoryId);
            if (!faction || !source || !target) return { ok: false, error: "Territoire introuvable." };
            if (source.ownerId !== faction.id) return { ok: false, error: "Cet aéroport ne vous appartient pas." };
            if (source.terrain !== "airport") return { ok: false, error: "Ce territoire ne dispose pas d’un aéroport." };
            if (source.id === target.id) return { ok: false, error: "Cible invalide." };
            if (target.isImpassable) return { ok: false, error: "Cible invalide." };
            if (this.areAllied(target.ownerId, faction.id)) return { ok: false, error: "Impossible de bombarder un territoire allié." };
            if (source.airstrikeCooldownMs > 0) {
                return { ok: false, error: `Bombardiers en recharge (${Math.ceil(source.airstrikeCooldownMs / 1000)} s restantes).` };
            }
            if (!this.isWithinAirstrikeRange(source, target)) {
                return { ok: false, error: `Cible hors de portée (max ${this.airstrikeRangeHops} territoires).` };
            }

            if (!this.isTerritoryVisible(target.id, faction.id)) {
                return { ok: false, error: "La cible doit être visible pour les bombardiers." };
            }
            const damage = this.getAirstrikeDamage(target, faction.id);
            target.units -= damage;
            this.recordUnitLoss(target.ownerId, damage, faction.id);
            source.airstrikeCooldownMs = this.airstrikeCooldownMs;
            source.airstrikeLastAction = {
                targetTerritoryId: target.id,
                damage,
                automatic: false,
                firedAtMs: Math.max(1, this.state.elapsedMs)
            };

            const defender = this.state.getFaction(target.ownerId);
            if (damage > 0) {
                this.addEvent(`${faction.name} lance un raid aérien depuis ${source.name} sur ${target.name}${defender ? ` (${defender.name})` : ""} : ${damage} perte${damage > 1 ? "s" : ""}.`, "combat");
            } else {
                this.addEvent(`${faction.name} lance un raid aérien depuis ${source.name} sur ${target.name}, sans effet notable.`, "combat");
            }
            this.notify({
                type: "AIRSTRIKE_RESOLVED",
                sourceTerritoryId: source.id,
                targetTerritoryId: target.id,
                factionId: faction.id,
                damage,
                automatic: false,
                firedAtMs: source.airstrikeLastAction.firedAtMs
            });
            this.state.touch();
            return { ok: true, damage };
        }

        executeCommand(command) {
            if (!command || typeof command.type !== "string") {
                return { ok: false, error: "Commande invalide." };
            }
            if (this.commandTransport && !this.isApplyingRemoteCommand) {
                return this.commandTransport({ ...command });
            }
            if (command.type === "SEND_ARMY") return this.sendArmy(command);
            if (command.type === "SEND_REINFORCEMENT_ROUTE") return this.sendReinforcementRoute(command);
            if (command.type === "CREATE_CONTINUOUS_REINFORCEMENT_ROUTE") return this.createContinuousReinforcementRoute(command);
            if (command.type === "CANCEL_CONTINUOUS_REINFORCEMENT_ROUTE") return this.cancelContinuousReinforcementRoute(command);
            if (command.type === "START_RESEARCH") return this.startResearch(command);
            if (command.type === "AIRSTRIKE") return this.launchAirstrike(command);
            if (command.type === "USE_ABILITY") return this.useAbility(command);
            if (command.type === "SET_TERRITORY_MODE") return this.setTerritoryProductionMode(command);
            if (command.type === "BATCH_SET_TERRITORY_MODE") return this.setTerritoryProductionModeBatch(command);
            if (command.type === "BATCH_SEND_REINFORCEMENTS") return this.sendBatchReinforcements(command);
            if (command.type === "BATCH_CREATE_CONTINUOUS_REINFORCEMENT_ROUTES") return this.createContinuousReinforcementRoutesBatch(command);
            if (command.type === "BUILD_RAILROAD") return this.buildRailroad(command);
            if (command.type === "BUILD_TERRITORY_BUILDING") return this.buildTerritoryBuilding(command);
            if (command.type === "BUILD_WONDER") return this.buildWonder(command);
            return { ok: false, error: `Commande inconnue : ${command.type}` };
        }

        useAbility(command) {
            if (this.paused) return { ok: false, error: "La simulation est en pause." };
            const playerId = Number(command.playerId);
            const faction = this.state.getFaction(playerId);
            const target = this.state.getTerritory(command.targetTerritoryId);
            const definition = C.ABILITY_DEFINITIONS[command.abilityId];
            if (!faction || !target || target.isImpassable) return { ok: false, error: "Cible invalide." };
            if (!definition) return { ok: false, error: "Capacité inconnue." };
            if (!faction.research.completedTechnologyIds.includes(definition.technologyId)) return { ok: false, error: "Cette capacité doit d’abord être recherchée." };
            const abilityLevel = C.getFactionAbilityLevel(faction, definition.id);
            const abilityStats = C.getFactionAbilityStats(faction, definition.id);
            const cooldown = Number(faction.abilityCooldowns?.[definition.id]) || 0;
            if (cooldown > 0) return { ok: false, error: `Capacité en recharge (${Math.ceil(cooldown / 1000)} s).` };

            if (definition.id === "missile" || definition.id === "nuclear") {
                if (this.areAllied(target.ownerId, playerId)) return { ok: false, error: "Impossible de viser un territoire allié." };
                if (!this.isTerritoryVisible(target.id, playerId)) return { ok: false, error: "Cette frappe exige une cible ennemie visible." };
                const action = {
                    id: this.state.nextAbilityActionId++,
                    abilityId: definition.id,
                    abilityLevel,
                    factionId: playerId,
                    targetTerritoryId: target.id,
                    createdAtMs: this.state.elapsedMs,
                    executeAtMs: this.state.elapsedMs + abilityStats.warningMs
                };
                if (definition.id === "missile") {
                    action.damageRatio = abilityStats.damageRatio;
                    action.maximumDamage = abilityStats.maximumDamage;
                } else {
                    action.centerDamageRatio = abilityStats.centerDamageRatio;
                    action.adjacentDamageRatio = abilityStats.adjacentDamageRatio;
                }
                this.state.abilityActions.push(action);
                faction.abilityCooldowns[definition.id] = this.getAbilityCooldownDuration(faction.id, abilityStats.cooldownMs);
                faction.statistics.abilitiesUsed += 1;
                this.addEvent(definition.id === "nuclear"
                    ? `ALERTE NUCLÉAIRE : ${faction.name} vise ${target.name}. Impact et souffle périphérique dans 8 secondes.`
                    : `ALERTE MISSILE : ${faction.name} verrouille ${target.name}. Impact dans 5 secondes.`, "combat");
                this.notify({ type: "ABILITY_LAUNCHED", ...action });
                this.state.touch();
                return { ok: true, action };
            }
            if (definition.id === "reinforcement") {
                if (target.ownerId !== playerId) return { ok: false, error: "Les renforts doivent rejoindre un de vos territoires." };
                target.units += abilityStats.units;
                faction.statistics.abilitiesUsed += 1;
                faction.statistics.unitsProduced += abilityStats.units;
                faction.abilityCooldowns.reinforcement = this.getAbilityCooldownDuration(faction.id, abilityStats.cooldownMs);
                this.addLogisticsEvent(`${faction.name} mobilise ${abilityStats.units} renforts d’urgence à ${target.name}.`, faction.id);
                this.notify({ type: "ABILITY_RESOLVED", abilityId: definition.id, abilityLevel, factionId: playerId, targetTerritoryId: target.id, units: abilityStats.units });
                this.state.touch();
                return { ok: true, units: abilityStats.units, abilityLevel };
            }
            if (definition.id === "paratrooper") {
                if (target.ownerId === null || this.areAllied(target.ownerId, playerId)) {
                    return { ok: false, error: "Les parachutistes doivent attaquer un territoire ennemi." };
                }
                if (!this.isTerritoryVisible(target.id, playerId)) {
                    return { ok: false, error: "Le largage exige une cible ennemie visible." };
                }
                const army = new C.Army({
                    id: this.state.nextArmyId++,
                    ownerId: playerId,
                    fromTerritoryId: target.id,
                    toTerritoryId: target.id,
                    finalTerritoryId: target.id,
                    units: abilityStats.units,
                    durationMs: abilityStats.warningMs,
                    start: { x: target.center.x - 140, y: target.center.y - 320 },
                    end: { ...target.center },
                    logisticsPurpose: "paratrooper"
                });
                this.state.armies.push(army);
                faction.abilityCooldowns.paratrooper = this.getAbilityCooldownDuration(faction.id, abilityStats.cooldownMs);
                faction.statistics.abilitiesUsed += 1;
                faction.statistics.unitsProduced += abilityStats.units;
                faction.statistics.attacksLaunched += 1;
                this.addEvent(`${faction.name} lance un largage de ${abilityStats.units} parachutistes sur ${target.name}.`, "combat");
                this.notify({ type: "ABILITY_LAUNCHED", abilityId: definition.id, abilityLevel, factionId: playerId, targetTerritoryId: target.id, armyId: army.id, units: abilityStats.units });
                this.state.touch();
                return { ok: true, army };
            }
            return { ok: false, error: "Capacité non prise en charge." };
        }

        setTerritoryProductionMode(command) {
            const playerId = Number(command.playerId);
            const territory = this.state.getTerritory(command.territoryId);
            const mode = ["units", "food", "research"].includes(command.mode) ? command.mode : null;
            if (!territory || territory.isImpassable) return { ok: false, error: "Territoire invalide." };
            if (territory.ownerId !== playerId) return { ok: false, error: "Ce territoire ne vous appartient pas." };
            if (this.isTerritoryUnderConstruction(territory)) return { ok: false, error: "L’affectation est verrouillée pendant les travaux." };
            if (!mode) return { ok: false, error: "Mode de production inconnu." };
            if (territory.productionMode === mode) return { ok: true, territory, unchanged: true };

            territory.productionMode = mode;
            territory.productionModeChangedAtMs = this.state.elapsedMs;
            territory.productionProgress = 0;
            this.state.touch();
            const faction = this.state.getFaction(playerId);
            const modeLabel = mode === "food"
                ? "la production alimentaire"
                : mode === "research"
                    ? "la recherche scientifique"
                    : "le recrutement";
            if (!command.silentLog) this.addLogisticsEvent(`${faction.name} affecte ${territory.name} à ${modeLabel}.`, playerId);
            this.notify({ type: "TERRITORY_MODE_CHANGED", territoryId: territory.id, playerId, mode });
            return { ok: true, territory };
        }

        setTerritoryProductionModeBatch(command) {
            const playerId = Number(command.playerId);
            const mode = ["units", "food", "research"].includes(command.mode) ? command.mode : null;
            const territoryIds = [...new Set((Array.isArray(command.territoryIds) ? command.territoryIds : [])
                .slice(0, 120).map(Number))];
            if (!mode) return { ok: false, error: "Mode de production inconnu." };
            if (!territoryIds.length) return { ok: false, error: "Aucun territoire sélectionné." };
            const territories = territoryIds.map((territoryId) => this.state.getTerritory(territoryId));
            if (territories.some((territory) => !territory || territory.isImpassable || territory.ownerId !== playerId)) {
                return { ok: false, error: "La sélection contient un territoire qui ne vous appartient pas." };
            }
            if (territories.some((territory) => this.isTerritoryUnderConstruction(territory))) {
                return { ok: false, error: "Un territoire sélectionné est verrouillé par des travaux." };
            }
            const changed = territories.filter((territory) => territory.productionMode !== mode);
            changed.forEach((territory) => this.setTerritoryProductionMode({
                type: "SET_TERRITORY_MODE",
                playerId,
                territoryId: territory.id,
                mode,
                silentLog: true
            }));
            if (changed.length) {
                const faction = this.state.getFaction(playerId);
                const modeLabel = mode === "food" ? "la nourriture" : mode === "research" ? "la recherche" : "le recrutement";
                this.addLogisticsEvent(`${faction.name} affecte ${changed.length} territoires à ${modeLabel}.`, playerId);
                this.notify({ type: "TERRITORY_MODE_BATCH_CHANGED", territoryIds: changed.map((territory) => territory.id), playerId, mode });
            }
            return { ok: true, territories, changedCount: changed.length };
        }

        buildRailroad(command) {
            if (this.paused) return { ok: false, error: "La simulation est en pause." };
            const playerId = Number(command.playerId);
            const faction = this.state.getFaction(playerId);
            const territory = this.state.getTerritory(command.territoryId);
            if (!faction || !territory || territory.isImpassable) return { ok: false, error: "Territoire invalide." };
            if (territory.ownerId !== playerId) return { ok: false, error: "Ce territoire ne vous appartient pas." };
            if (!faction.research.completedTechnologyIds.includes("construction-railroad")) {
                return { ok: false, error: "Recherchez d’abord : Réseau ferroviaire." };
            }
            if (territory.railroad) return { ok: false, error: "Ce territoire possède déjà un chemin de fer." };
            if (territory.railroadConstructionActive) return { ok: false, error: "Les travaux ferroviaires sont déjà en cours." };
            if (this.isTerritoryUnderConstruction(territory)) return { ok: false, error: "Un autre chantier est déjà en cours sur ce territoire." };

            territory.railroadPreviousProductionMode = ["units", "food", "research"].includes(territory.productionMode)
                ? territory.productionMode
                : "units";
            territory.railroadConstructionActive = true;
            territory.railroadConstructionProgressMs = 0;
            territory.productionMode = "construction";
            territory.productionModeChangedAtMs = this.state.elapsedMs;
            territory.productionProgress = 0;
            this.state.touch();
            this.addEvent(`${faction.name} lance les travaux ferroviaires à ${territory.name}.`, "info");
            this.notify({
                type: "RAILROAD_CONSTRUCTION_STARTED",
                factionId: faction.id,
                territoryId: territory.id,
                durationMs: this.railroadConstructionDurationMs
            });
            return { ok: true, territory };
        }

        updateRailroadConstruction(deltaMs) {
            let changed = false;
            this.state.territories.forEach((territory) => {
                if (!territory.railroadConstructionActive) return;
                if (territory.ownerId === null || territory.isImpassable) {
                    this.cancelRailroadConstruction(territory);
                    changed = true;
                    return;
                }
                territory.railroadConstructionProgressMs += deltaMs;
                changed = true;
                if (territory.railroadConstructionProgressMs < this.railroadConstructionDurationMs) return;
                const faction = this.state.getFaction(territory.ownerId);
                territory.railroad = true;
                territory.railroadConstructionActive = false;
                territory.railroadConstructionProgressMs = this.railroadConstructionDurationMs;
                territory.productionMode = ["units", "food", "research"].includes(territory.railroadPreviousProductionMode)
                    ? territory.railroadPreviousProductionMode
                    : "units";
                territory.railroadPreviousProductionMode = null;
                territory.productionModeChangedAtMs = this.state.elapsedMs;
                territory.productionProgress = 0;
                if (faction) {
                    faction.statistics.railroadsBuilt += 1;
                    this.addEvent(`${faction.name} inaugure le chemin de fer de ${territory.name}.`, "info");
                }
                this.notify({
                    type: "RAILROAD_CONSTRUCTION_COMPLETED",
                    factionId: territory.ownerId,
                    territoryId: territory.id
                });
            });
            return changed;
        }

        cancelRailroadConstruction(territory) {
            if (!territory) return;
            territory.railroadConstructionActive = false;
            territory.railroadConstructionProgressMs = 0;
            territory.railroadPreviousProductionMode = null;
            if (territory.productionMode === "construction") territory.productionMode = "units";
            territory.productionModeChangedAtMs = this.state.elapsedMs;
            territory.productionProgress = 0;
        }

        isTerritoryUnderConstruction(territory) {
            return Boolean(territory && (territory.railroadConstructionActive || territory.buildingConstruction || territory.wonderConstruction));
        }

        buildTerritoryBuilding(command) {
            if (this.paused) return { ok: false, error: "La simulation est en pause." };
            const playerId = Number(command.playerId);
            const faction = this.state.getFaction(playerId);
            const territory = this.state.getTerritory(command.territoryId);
            const definition = C.getBuildingType(command.buildingId);
            if (!faction || !territory || territory.isImpassable) return { ok: false, error: "Territoire invalide." };
            if (!definition) return { ok: false, error: "Bâtiment inconnu." };
            if (territory.ownerId !== playerId) return { ok: false, error: "Ce territoire ne vous appartient pas." };
            if (!definition.allowedTerrains.includes(territory.terrain)) {
                return { ok: false, error: `${definition.name} ne peut pas être construit sur ce type de terrain.` };
            }
            if (definition.prerequisiteTechnologyId && !faction.research.completedTechnologyIds.includes(definition.prerequisiteTechnologyId)) {
                const technology = C.TECHNOLOGIES[definition.prerequisiteTechnologyId];
                return { ok: false, error: `Recherchez d’abord : ${technology?.name || definition.prerequisiteTechnologyId}.` };
            }
            if (territory.buildings.includes(definition.id)) return { ok: false, error: `${definition.name} existe déjà sur ce territoire.` };
            if (this.isTerritoryUnderConstruction(territory)) return { ok: false, error: "Un autre chantier est déjà en cours sur ce territoire." };

            territory.buildingConstruction = {
                buildingId: definition.id,
                progressMs: 0,
                previousProductionMode: ["units", "food", "research"].includes(territory.productionMode)
                    ? territory.productionMode
                    : "units"
            };
            territory.productionMode = "construction";
            territory.productionModeChangedAtMs = this.state.elapsedMs;
            territory.productionProgress = 0;
            this.state.touch();
            this.addEvent(`${faction.name} lance la construction de ${definition.name} à ${territory.name}.`, "info");
            this.notify({
                type: "BUILDING_CONSTRUCTION_STARTED",
                factionId: faction.id,
                territoryId: territory.id,
                buildingId: definition.id,
                durationMs: definition.constructionDurationMs
            });
            return { ok: true, territory, definition };
        }

        updateBuildingConstruction(deltaMs) {
            let changed = false;
            this.state.territories.forEach((territory) => {
                const construction = territory.buildingConstruction;
                if (!construction) return;
                const definition = C.getBuildingType(construction.buildingId);
                if (!definition || territory.ownerId === null || territory.isImpassable) {
                    this.cancelBuildingConstruction(territory);
                    changed = true;
                    return;
                }
                construction.progressMs += deltaMs;
                changed = true;
                if (construction.progressMs < definition.constructionDurationMs) return;

                const faction = this.state.getFaction(territory.ownerId);
                if (!territory.buildings.includes(definition.id)) territory.buildings.push(definition.id);
                territory.buildingConstruction = null;
                territory.productionMode = ["units", "food", "research"].includes(construction.previousProductionMode)
                    ? construction.previousProductionMode
                    : "units";
                territory.productionModeChangedAtMs = this.state.elapsedMs;
                territory.productionProgress = 0;
                if (faction) {
                    faction.statistics.buildingsConstructed += 1;
                    this.addEvent(`${faction.name} termine ${definition.name} à ${territory.name}.`, "info");
                }
                this.notify({
                    type: "BUILDING_CONSTRUCTION_COMPLETED",
                    factionId: territory.ownerId,
                    territoryId: territory.id,
                    buildingId: definition.id
                });
            });
            return changed;
        }

        cancelBuildingConstruction(territory) {
            if (!territory?.buildingConstruction) return;
            territory.buildingConstruction = null;
            if (territory.productionMode === "construction") territory.productionMode = "units";
            territory.productionModeChangedAtMs = this.state.elapsedMs;
            territory.productionProgress = 0;
        }

        buildWonder(command) {
            if (this.paused) return { ok: false, error: "La simulation est en pause." };
            const playerId = Number(command.playerId);
            const faction = this.state.getFaction(playerId);
            const territory = this.state.getTerritory(command.territoryId);
            const definition = C.getWonderType(command.wonderId);
            if (!faction || !territory || territory.isImpassable) return { ok: false, error: "Territoire invalide." };
            if (!definition) return { ok: false, error: "Merveille inconnue." };
            if (territory.ownerId !== playerId) return { ok: false, error: "Ce territoire ne vous appartient pas." };
            if (!faction.research.completedTechnologyIds.includes(definition.prerequisiteTechnologyId)) {
                const technology = C.TECHNOLOGIES[definition.prerequisiteTechnologyId];
                return { ok: false, error: `Recherchez d’abord : ${technology?.name || definition.prerequisiteTechnologyId}.` };
            }
            if (faction.constructedWonderId) return { ok: false, error: "Votre nation a déjà achevé sa merveille." };
            if (this.state.territories.some((candidate) => candidate.wonderConstruction?.builderFactionId === faction.id)) {
                return { ok: false, error: "Votre nation construit déjà une merveille." };
            }
            if (territory.wonderId) return { ok: false, error: "Ce territoire abrite déjà une merveille." };
            if (this.isTerritoryUnderConstruction(territory)) return { ok: false, error: "Un autre chantier est déjà en cours sur ce territoire." };

            territory.wonderConstruction = {
                wonderId: definition.id,
                builderFactionId: faction.id,
                progressMs: 0,
                previousProductionMode: ["units", "food", "research"].includes(territory.productionMode)
                    ? territory.productionMode
                    : "units"
            };
            territory.productionMode = "construction";
            territory.productionModeChangedAtMs = this.state.elapsedMs;
            territory.productionProgress = 0;
            this.state.touch();
            this.addEvent(`PROJET MONUMENTAL : ${faction.name} commence ${definition.name} à ${territory.name}.`, "research");
            this.notify({
                type: "WONDER_CONSTRUCTION_STARTED",
                factionId: faction.id,
                territoryId: territory.id,
                wonderId: definition.id,
                durationMs: definition.constructionDurationMs
            });
            return { ok: true, territory, definition };
        }

        updateWonderConstruction(deltaMs) {
            let changed = false;
            this.state.territories.forEach((territory) => {
                const construction = territory.wonderConstruction;
                if (!construction) return;
                const definition = C.getWonderType(construction.wonderId);
                if (!definition || territory.ownerId !== construction.builderFactionId || territory.isImpassable) {
                    this.cancelWonderConstruction(territory);
                    changed = true;
                    return;
                }
                construction.progressMs += deltaMs;
                changed = true;
                if (construction.progressMs < definition.constructionDurationMs) return;

                const faction = this.state.getFaction(construction.builderFactionId);
                if (!faction || faction.constructedWonderId) {
                    this.cancelWonderConstruction(territory);
                    return;
                }
                territory.wonderId = definition.id;
                territory.wonderBuilderFactionId = faction.id;
                territory.wonderConstruction = null;
                territory.wonderActivationRemainingMs = 0;
                territory.wonderActionProgressMs = 0;
                territory.wonderLastAction = null;
                territory.productionMode = ["units", "food", "research"].includes(construction.previousProductionMode)
                    ? construction.previousProductionMode
                    : "units";
                territory.productionModeChangedAtMs = this.state.elapsedMs;
                territory.productionProgress = 0;
                faction.constructedWonderId = definition.id;
                faction.statistics.wondersConstructed += 1;
                this.addEvent(`MERVEILLE ACHEVÉE : ${faction.name} inaugure ${definition.name} à ${territory.name}.`, "capture");
                this.notify({
                    type: "WONDER_CONSTRUCTION_COMPLETED",
                    factionId: faction.id,
                    territoryId: territory.id,
                    wonderId: definition.id
                });
            });
            return changed;
        }

        updateWonderActivation(deltaMs) {
            let changed = false;
            this.state.territories.forEach((territory) => {
                if (!territory.wonderId || territory.wonderActivationRemainingMs <= 0) return;
                const previous = territory.wonderActivationRemainingMs;
                territory.wonderActivationRemainingMs = Math.max(0, previous - deltaMs);
                changed = true;
                if (previous > 0 && territory.wonderActivationRemainingMs === 0 && territory.ownerId !== null) {
                    const faction = this.state.getFaction(territory.ownerId);
                    const definition = C.getWonderType(territory.wonderId);
                    this.addEvent(`${definition?.name || "La merveille"} de ${territory.name} est maintenant opérationnelle pour ${faction?.name || "son nouveau propriétaire"}.`, "info");
                    this.notify({ type: "WONDER_ACTIVATED", factionId: territory.ownerId, territoryId: territory.id, wonderId: territory.wonderId });
                }
            });
            return changed;
        }

        cancelWonderConstruction(territory) {
            if (!territory?.wonderConstruction) return;
            const construction = territory.wonderConstruction;
            territory.wonderConstruction = null;
            if (territory.productionMode === "construction") territory.productionMode = "units";
            territory.productionModeChangedAtMs = this.state.elapsedMs;
            territory.productionProgress = 0;
            this.notify({
                type: "WONDER_CONSTRUCTION_CANCELLED",
                factionId: construction.builderFactionId,
                territoryId: territory.id,
                wonderId: construction.wonderId
            });
        }

        handleWonderOwnershipChange(territory, previousOwnerId, ownerId) {
            if (!territory?.wonderId || previousOwnerId === ownerId) return false;
            const definition = C.getWonderType(territory.wonderId);
            const owner = this.state.getFaction(ownerId);
            territory.wonderActivationRemainingMs = ownerId === null ? 0 : this.wonderCaptureActivationDelayMs;
            territory.wonderActionProgressMs = 0;
            territory.wonderLastAction = null;
            if (owner) owner.statistics.wondersCaptured += 1;
            this.addEvent(owner
                ? `MERVEILLE CAPTURÉE : ${owner.name} prend ${definition?.name || "la merveille"} de ${territory.name}. Réactivation dans ${Math.ceil(this.wonderCaptureActivationDelayMs / 1000)} secondes.`
                : `${definition?.name || "La merveille"} de ${territory.name} est neutralisée par les Barbares.`, "capture");
            this.notify({
                type: "WONDER_CAPTURED",
                territoryId: territory.id,
                wonderId: territory.wonderId,
                previousOwnerId,
                ownerId,
                activationDelayMs: territory.wonderActivationRemainingMs
            });
            return true;
        }

        executeAuthoritativeCommand(command) {
            this.isApplyingRemoteCommand = true;
            try {
                return this.executeCommand(command);
            } finally {
                this.isApplyingRemoteCommand = false;
            }
        }

        setCommandTransport(transport) {
            this.commandTransport = typeof transport === "function" ? transport : null;
        }

        areAllied(firstFactionId, secondFactionId) {
            if (firstFactionId === null || secondFactionId === null) return false;
            const first = this.state.getFaction(firstFactionId);
            const second = this.state.getFaction(secondFactionId);
            return Boolean(first && second && first.teamId === second.teamId);
        }

        startResearch(command) {
            const faction = this.state.getFaction(command.playerId);
            const technology = C.TECHNOLOGIES[command.technologyId];
            if (!faction) return { ok: false, error: "Faction introuvable." };
            if (!technology) return { ok: false, error: "Technologie inconnue." };
            if (!this.state.getTerritoriesOwnedBy(faction.id).length) {
                return { ok: false, error: "Une faction sans territoire ne peut plus rechercher." };
            }

            const research = faction.research;
            if (research.activeTechnologyId) return { ok: false, error: "Une recherche est déjà en cours." };
            if (research.completedTechnologyIds.includes(technology.id)) {
                return { ok: false, error: "Cette technologie est déjà débloquée." };
            }
            if (technology.effects?.unlockWonder && faction.constructedWonderId) {
                return { ok: false, error: "Votre nation a déjà choisi et achevé sa merveille." };
            }
            if (technology.prerequisiteId && !research.completedTechnologyIds.includes(technology.prerequisiteId)) {
                return { ok: false, error: "La technologie précédente doit d’abord être débloquée." };
            }

            research.activeTechnologyId = technology.id;
            research.progressMs = 0;
            this.state.touch();
            this.addEvent(`${faction.name} lance la recherche : ${technology.name}.`, "research");
            this.notify({ type: "RESEARCH_STARTED", factionId: faction.id, technologyId: technology.id });
            return { ok: true, technology };
        }

        sendArmy(command) {
            if (this.paused) return { ok: false, error: "La simulation est en pause." };
            const playerId = Number(command.playerId);
            const from = this.state.getTerritory(command.fromTerritoryId);
            const to = this.state.getTerritory(command.toTerritoryId);
            const units = Math.floor(Number(command.units));

            if (!from || !to) return { ok: false, error: "Territoire introuvable." };
            if (from.isImpassable || to.isImpassable) return { ok: false, error: "Les lacs sont totalement infranchissables." };
            if (from.ownerId !== playerId) return { ok: false, error: "Ce territoire ne vous appartient pas." };
            if (!from.isNeighbor(to.id)) return { ok: false, error: "La cible ne partage aucune frontière avec l’origine." };
            if (from.isPathBlocked(to.id)) return { ok: false, error: "Une chaîne de montagnes bloque cette frontière." };
            if (!Number.isFinite(units) || units < 1) return { ok: false, error: "Choisissez au moins une unité." };
            if (units >= from.units) return { ok: false, error: "Une unité doit rester pour tenir le territoire." };

            const faction = this.state.getFaction(playerId);
            const durationMs = this.getTravelDuration(from, to, faction);
            const army = new C.Army({
                id: this.state.nextArmyId++,
                ownerId: playerId,
                fromTerritoryId: from.id,
                toTerritoryId: to.id,
                units,
                durationMs,
                start: from.center,
                end: to.center,
                visitedTerritoryIds: [from.id]
            });

            from.units -= units;
            this.state.armies.push(army);
            this.state.touch();
            const targetOwner = this.state.getFaction(to.ownerId);
            const isReinforcement = this.areAllied(to.ownerId, playerId);
            if (!isReinforcement) faction.statistics.attacksLaunched += 1;
            const action = isReinforcement ? "renforce" : "attaque";
            if (!isReinforcement || !this.isAIControlledFaction(playerId)) {
                this.addEvent(`${faction.name} ${action} ${to.name} avec ${units} unités${targetOwner ? ` (${targetOwner.name})` : ""}.`, "combat");
            }
            this.notify({ type: "ARMY_SENT", armyId: army.id });
            return { ok: true, army };
        }

        sendReinforcementRoute(command) {
            if (this.paused) return { ok: false, error: "La simulation est en pause." };
            const playerId = Number(command.playerId);
            const from = this.state.getTerritory(command.fromTerritoryId);
            const destination = this.state.getTerritory(command.toTerritoryId);
            const units = Math.floor(Number(command.units));

            if (!from || !destination) return { ok: false, error: "Territoire introuvable." };
            if (from.isImpassable || destination.isImpassable) return { ok: false, error: "Les lacs sont totalement infranchissables." };
            if (from.ownerId !== playerId) return { ok: false, error: "Ce territoire ne vous appartient pas." };
            if (!this.areAllied(destination.ownerId, playerId)) return { ok: false, error: "Un convoi ne peut rejoindre qu’un territoire allié." };
            if (from.id === destination.id) return { ok: false, error: "Choisissez un autre territoire de destination." };
            if (!Number.isFinite(units) || units < 1) return { ok: false, error: "Choisissez au moins une unité." };
            if (units >= from.units) return { ok: false, error: "Une unité doit rester pour tenir le territoire." };

            const path = this.findAlliedPath(playerId, from.id, destination.id);
            if (!path || path.length < 2) {
                return { ok: false, error: "Aucun itinéraire allié ne permet de contourner les montagnes." };
            }

            const firstStop = this.state.getTerritory(path[1]);
            const faction = this.state.getFaction(playerId);
            const army = new C.Army({
                id: this.state.nextArmyId++,
                ownerId: playerId,
                fromTerritoryId: from.id,
                toTerritoryId: firstStop.id,
                units,
                durationMs: this.getTravelDuration(from, firstStop, faction),
                start: from.center,
                end: firstStop.center,
                route: path.slice(2),
                finalTerritoryId: destination.id,
                isConvoy: true,
                reinforcementRouteId: command.reinforcementRouteId || null,
                visitedTerritoryIds: Array.isArray(command.visitedTerritoryIds)
                    ? [...new Set(command.visitedTerritoryIds.map(Number).concat(from.id))]
                    : [from.id],
                relayCount: Math.max(0, Number(command.relayCount) || 0)
            });

            from.units -= units;
            this.state.armies.push(army);
            this.state.touch();
            if (!command.reinforcementRouteId && !command.silentLog) {
                this.addLogisticsEvent(`${faction.name} achemine ${units} renforts vers ${destination.name} — ${path.length - 1} étapes.`, playerId);
            }
            this.notify({ type: "ARMY_SENT", armyId: army.id, route: path });
            return { ok: true, army, path };
        }

        sendBatchReinforcements(command) {
            if (this.paused) return { ok: false, error: "La simulation est en pause." };
            const playerId = Number(command.playerId);
            const destination = this.state.getTerritory(command.toTerritoryId);
            if (!destination || destination.isImpassable || !this.areAllied(destination.ownerId, playerId)) {
                return { ok: false, error: "La destination groupée doit être un territoire allié." };
            }
            const sourceIds = [...new Set((Array.isArray(command.fromTerritoryIds) ? command.fromTerritoryIds : [])
                .slice(0, 120).map(Number))];
            if (!sourceIds.length) return { ok: false, error: "Aucun territoire source sélectionné." };
            const candidates = sourceIds.map((sourceId) => this.state.getTerritory(sourceId))
                .filter((source) => source && source.id !== destination.id && source.ownerId === playerId && !source.isImpassable && source.units > 1)
                .map((source) => ({
                    source,
                    path: this.findAlliedPath(playerId, source.id, destination.id),
                    units: Math.max(1, Math.floor((source.units - 1) * this.quickTransferRatio))
                }))
                .filter((candidate) => candidate.path && candidate.path.length > 1);
            if (!candidates.length) {
                return { ok: false, error: "Aucune source sélectionnée ne possède un itinéraire allié valide." };
            }
            const armies = [];
            let totalUnits = 0;
            candidates.forEach((candidate) => {
                const result = this.sendReinforcementRoute({
                    type: "SEND_REINFORCEMENT_ROUTE",
                    playerId,
                    fromTerritoryId: candidate.source.id,
                    toTerritoryId: destination.id,
                    units: candidate.units,
                    silentLog: true
                });
                if (!result.ok) return;
                armies.push(result.army);
                totalUnits += candidate.units;
            });
            const faction = this.state.getFaction(playerId);
            this.addLogisticsEvent(`${faction.name} concentre ${totalUnits} renforts depuis ${armies.length} territoires vers ${destination.name}.`, playerId);
            this.notify({
                type: "BATCH_REINFORCEMENTS_SENT",
                playerId,
                fromTerritoryIds: armies.map((army) => army.fromTerritoryId),
                toTerritoryId: destination.id,
                totalUnits
            });
            return {
                ok: true,
                armies,
                totalUnits,
                sentCount: armies.length,
                skippedCount: sourceIds.length - armies.length
            };
        }

        createContinuousReinforcementRoute(command) {
            const playerId = Number(command.playerId);
            const from = this.state.getTerritory(command.fromTerritoryId);
            const destination = this.state.getTerritory(command.toTerritoryId);
            if (!from || !destination) return { ok: false, error: "Territoire introuvable." };
            if (from.isImpassable || destination.isImpassable) return { ok: false, error: "Les lacs sont totalement infranchissables." };
            if (from.ownerId !== playerId || !this.areAllied(destination.ownerId, playerId)) {
                return { ok: false, error: "Une ligne continue doit relier deux territoires alliés." };
            }
            if (from.id === destination.id) return { ok: false, error: "Choisissez un autre territoire de destination." };
            const path = this.findAlliedPath(playerId, from.id, destination.id);
            if (!path) return { ok: false, error: "Aucun itinéraire allié ne permet de contourner les montagnes." };

            const previousRoute = this.state.reinforcementRoutes.find((route) =>
                route.active && route.ownerId === playerId && route.fromTerritoryId === from.id);
            if (previousRoute) previousRoute.active = false;

            const route = new C.ReinforcementRoute({
                id: this.state.nextReinforcementRouteId++,
                ownerId: playerId,
                fromTerritoryId: from.id,
                toTerritoryId: destination.id,
                path,
                createdAt: this.state.elapsedMs,
                relayAllReinforcements: Boolean(command.relayAllReinforcements)
            });
            this.state.reinforcementRoutes.push(route);
            this.state.touch();
            const faction = this.state.getFaction(playerId);
            const action = previousRoute ? "redirige sa ligne continue" : "ouvre une ligne de renfort continue";
            const mode = route.relayAllReinforcements ? " · HUB : garnison et arrivées relayées" : "";
            if (!command.silentLog) this.addLogisticsEvent(`${faction.name} ${action} : ${from.name} → ${destination.name}${mode}.`, playerId);
            this.notify({ type: "REINFORCEMENT_ROUTE_CREATED", routeId: route.id, replacedRouteId: previousRoute ? previousRoute.id : null });

            if (route.relayAllReinforcements && from.units > 1) {
                const initialUnits = from.units - 1;
                const dispatch = this.sendReinforcementRoute({
                    type: "SEND_REINFORCEMENT_ROUTE",
                    playerId,
                    fromTerritoryId: from.id,
                    toTerritoryId: destination.id,
                    units: initialUnits,
                    reinforcementRouteId: route.id,
                    visitedTerritoryIds: [from.id],
                    relayCount: 0
                });
                if (dispatch.ok) {
                    route.unitsDispatched += initialUnits;
                    route.initialGarrisonDispatched = initialUnits;
                    this.notify({ type: "REINFORCEMENT_ROUTE_DISPATCH", routeId: route.id, units: initialUnits, armyId: dispatch.army.id });
                }
            }
            return { ok: true, route };
        }

        createContinuousReinforcementRoutesBatch(command) {
            const playerId = Number(command.playerId);
            const destination = this.state.getTerritory(command.toTerritoryId);
            if (!destination || destination.isImpassable || !this.areAllied(destination.ownerId, playerId)) {
                return { ok: false, error: "La destination groupée doit être un territoire allié." };
            }
            const sourceIds = [...new Set((Array.isArray(command.fromTerritoryIds) ? command.fromTerritoryIds : [])
                .slice(0, 120).map(Number))];
            if (!sourceIds.length) return { ok: false, error: "Aucun territoire source sélectionné." };
            const candidates = sourceIds.map((sourceId) => this.state.getTerritory(sourceId))
                .filter((source) => source && source.id !== destination.id && source.ownerId === playerId && !source.isImpassable)
                .map((source) => ({ source, path: this.findAlliedPath(playerId, source.id, destination.id) }))
                .filter((candidate) => candidate.path && candidate.path.length > 1);
            if (!candidates.length) {
                return { ok: false, error: "Aucune source sélectionnée ne possède un itinéraire allié valide." };
            }
            const routes = [];
            candidates.forEach((candidate) => {
                const previousRoute = this.state.reinforcementRoutes.find((route) =>
                    route.active && route.ownerId === playerId && route.fromTerritoryId === candidate.source.id);
                const result = this.createContinuousReinforcementRoute({
                    type: "CREATE_CONTINUOUS_REINFORCEMENT_ROUTE",
                    playerId,
                    fromTerritoryId: candidate.source.id,
                    toTerritoryId: destination.id,
                    relayAllReinforcements: Boolean(previousRoute?.relayAllReinforcements),
                    silentLog: true
                });
                if (result.ok) routes.push(result.route);
            });
            const faction = this.state.getFaction(playerId);
            this.addLogisticsEvent(`${faction.name} dirige ${routes.length} flux continus vers ${destination.name}.`, playerId);
            this.notify({
                type: "CONTINUOUS_REINFORCEMENT_ROUTES_BATCH_CREATED",
                playerId,
                routeIds: routes.map((route) => route.id),
                toTerritoryId: destination.id
            });
            return {
                ok: true,
                routes,
                createdCount: routes.length,
                skippedCount: sourceIds.length - routes.length
            };
        }

        cancelContinuousReinforcementRoute(command) {
            const route = this.state.getReinforcementRoute(command.routeId);
            const playerId = Number(command.playerId);
            if (!route || !route.active) return { ok: false, error: "Cette ligne de renfort n’est plus active." };
            if (route.ownerId !== playerId) return { ok: false, error: "Cette ligne de renfort ne vous appartient pas." };
            route.active = false;
            route.isPaused = false;
            this.state.touch();
            const from = this.state.getTerritory(route.fromTerritoryId);
            const destination = this.state.getTerritory(route.toTerritoryId);
            const faction = this.state.getFaction(playerId);
            this.addLogisticsEvent(`${faction.name} ferme la ligne ${from ? from.name : "?"} → ${destination ? destination.name : "?"}.`, playerId);
            this.notify({ type: "REINFORCEMENT_ROUTE_CANCELLED", routeId: route.id });
            return { ok: true, route };
        }

        maintainReinforcementRoutes() {
            this.state.reinforcementRoutes.forEach((route) => {
                if (!route.active) return;
                const from = this.state.getTerritory(route.fromTerritoryId);
                const destination = this.state.getTerritory(route.toTerritoryId);
                if (from && destination && from.ownerId === route.ownerId && this.areAllied(destination.ownerId, route.ownerId)) return;

                route.active = false;
                route.isPaused = false;
                this.state.touch();
                const faction = this.state.getFaction(route.ownerId);
                this.addLogisticsEvent(`La ligne continue de ${faction ? faction.name : "la faction"} est fermée : une extrémité a été perdue.`, route.ownerId);
                this.notify({ type: "REINFORCEMENT_ROUTE_CANCELLED", routeId: route.id });
            });
        }

        dispatchProducedReinforcements(territory, producedUnits) {
            const route = this.state.reinforcementRoutes.find((candidate) =>
                candidate.active && candidate.fromTerritoryId === territory.id && candidate.ownerId === territory.ownerId);
            if (!route || producedUnits < 1) return;

            const path = this.findAlliedPath(route.ownerId, route.fromTerritoryId, route.toTerritoryId);
            if (!path) {
                if (!route.isPaused) {
                    route.isPaused = true;
                    route.pauseReason = "Aucun itinéraire allié disponible";
                    const destination = this.state.getTerritory(route.toTerritoryId);
                    this.addLogisticsEvent(`Ligne vers ${destination ? destination.name : "la destination"} en pause : passage interrompu.`, route.ownerId);
                    this.notify({ type: "REINFORCEMENT_ROUTE_PAUSED", routeId: route.id });
                }
                return;
            }

            if (route.isPaused) {
                route.isPaused = false;
                route.pauseReason = null;
                const destination = this.state.getTerritory(route.toTerritoryId);
                this.addLogisticsEvent(`La ligne vers ${destination.name} reprend son activité.`, route.ownerId);
                this.notify({ type: "REINFORCEMENT_ROUTE_RESUMED", routeId: route.id });
            }
            route.path = path;

            const result = this.sendReinforcementRoute({
                type: "SEND_REINFORCEMENT_ROUTE",
                playerId: route.ownerId,
                fromTerritoryId: route.fromTerritoryId,
                toTerritoryId: route.toTerritoryId,
                units: producedUnits,
                reinforcementRouteId: route.id
            });
            if (result.ok) {
                route.unitsDispatched += producedUnits;
                this.notify({ type: "REINFORCEMENT_ROUTE_DISPATCH", routeId: route.id, units: producedUnits, armyId: result.army.id });
            }
        }

        relayArrivingReinforcements(army, territory) {
            const route = this.state.reinforcementRoutes.find((candidate) =>
                candidate.active &&
                candidate.relayAllReinforcements &&
                army.ownerId === territory.ownerId &&
                candidate.ownerId === territory.ownerId &&
                candidate.fromTerritoryId === territory.id);
            if (!route || army.relayCount >= 8) return false;

            const path = this.findAlliedPath(route.ownerId, territory.id, route.toTerritoryId);
            if (!path || path.length < 2) return false;
            const visited = new Set(army.visitedTerritoryIds.map(Number));
            if (army.fromTerritoryId !== null) visited.add(Number(army.fromTerritoryId));
            visited.add(territory.id);
            if (path.slice(1).some((territoryId) => visited.has(territoryId))) {
                this.addLogisticsEvent(`Le hub de ${territory.name} conserve ${army.units} unités : une boucle logistique a été évitée.`, route.ownerId);
                this.notify({ type: "REINFORCEMENT_RELAY_BLOCKED", routeId: route.id, territoryId: territory.id, units: army.units });
                return false;
            }

            territory.units += army.units;
            const result = this.sendReinforcementRoute({
                type: "SEND_REINFORCEMENT_ROUTE",
                playerId: route.ownerId,
                fromTerritoryId: territory.id,
                toTerritoryId: route.toTerritoryId,
                units: army.units,
                reinforcementRouteId: route.id,
                visitedTerritoryIds: Array.from(visited),
                relayCount: army.relayCount + 1
            });
            if (!result.ok) {
                territory.units -= army.units;
                return false;
            }

            route.path = path;
            route.unitsDispatched += army.units;
            route.unitsRelayed += army.units;
            this.notify({
                type: "REINFORCEMENT_RELAYED",
                routeId: route.id,
                fromArmyId: army.id,
                armyId: result.army.id,
                territoryId: territory.id,
                units: army.units
            });
            return true;
        }

        findOwnedPath(ownerId, fromTerritoryId, toTerritoryId) {
            return this.findPathForFaction(ownerId, fromTerritoryId, toTerritoryId, false);
        }

        findAlliedPath(ownerId, fromTerritoryId, toTerritoryId) {
            return this.findPathForFaction(ownerId, fromTerritoryId, toTerritoryId, true);
        }

        findPathForFaction(ownerId, fromTerritoryId, toTerritoryId, includeAllies) {
            const start = this.state.getTerritory(fromTerritoryId);
            const destination = this.state.getTerritory(toTerritoryId);
            const canTraverse = (territory) => territory && (includeAllies
                ? this.areAllied(territory.ownerId, ownerId)
                : territory.ownerId === Number(ownerId));
            if (!start || !destination || start.ownerId !== Number(ownerId) || !canTraverse(destination)) return null;

            const pending = [start.id];
            const previous = new Map([[start.id, null]]);
            while (pending.length) {
                const currentId = pending.shift();
                if (currentId === destination.id) break;
                const current = this.state.getTerritory(currentId);
                current.neighbors.forEach((neighborId) => {
                    if (previous.has(neighborId) || current.isPathBlocked(neighborId)) return;
                    const neighbor = this.state.getTerritory(neighborId);
                    if (!neighbor || neighbor.isImpassable || !canTraverse(neighbor)) return;
                    previous.set(neighborId, currentId);
                    pending.push(neighborId);
                });
            }

            if (!previous.has(destination.id)) return null;
            const path = [];
            let currentId = destination.id;
            while (currentId !== null) {
                path.unshift(currentId);
                currentId = previous.get(currentId);
            }
            return path;
        }

        getTravelDuration(from, to, faction) {
            const distance = C.Geometry.distance(from.center, to.center);
            const technologyMultiplier = 1 + C.getFactionTechnologyBonus(faction, "travelSpeedMultiplier");
            const railroadMultiplier = this.hasRailroadConnection(from, to) ? this.railroadTravelSpeedMultiplier : 1;
            const speed = 92 * (faction ? faction.bonuses.travelSpeedMultiplier : 1) * technologyMultiplier * railroadMultiplier;
            return C.Geometry.clamp((distance / speed) * 1000, railroadMultiplier > 1 ? 900 : 1500, 6500);
        }

        hasRailroadConnection(from, to) {
            return Boolean(from && to && from.railroad && to.railroad && from.isNeighbor(to.id) && !from.isPathBlocked(to.id));
        }

        resolveArmyArrival(army) {
            const target = this.state.getTerritory(army.toTerritoryId);
            const attacker = army.isBarbarian ? C.BARBARIAN_FACTION : this.state.getFaction(army.ownerId);
            this.state.armies = this.state.armies.filter((candidate) => candidate.id !== army.id);
            if (!target || !attacker) return;

            if (target.isImpassable) {
                const fallback = this.state.getTerritory(army.fromTerritoryId);
                if (fallback && fallback.ownerId === army.ownerId) fallback.units += army.units;
                this.addLogisticsEvent(`L’armée de ${attacker.name} rebrousse chemin devant ${target.name}.`, army.ownerId);
                this.notify({ type: "ARMY_ROUTE_STOPPED", armyId: army.id, territoryId: fallback ? fallback.id : null });
                return;
            }

            if (army.isConvoy && !this.areAllied(target.ownerId, army.ownerId)) {
                const fallback = this.state.getTerritory(army.fromTerritoryId);
                if (fallback && fallback.ownerId === army.ownerId) fallback.units += army.units;
                const continuousRoute = this.state.getReinforcementRoute(army.reinforcementRouteId);
                if (continuousRoute && continuousRoute.active) {
                    continuousRoute.isPaused = true;
                    continuousRoute.pauseReason = "Un relais du convoi a été perdu";
                }
                this.addLogisticsEvent(`Un convoi de ${attacker.name} fait demi-tour : ${target.name} n’est plus allié.`, army.ownerId);
                this.notify({ type: "ARMY_ROUTE_STOPPED", armyId: army.id, territoryId: fallback ? fallback.id : target.id });
                return;
            }

            if (this.areAllied(target.ownerId, army.ownerId)) {
                if (army.route.length) {
                    const nextId = army.route[0];
                    const next = this.state.getTerritory(nextId);
                    const routeStillOpen = next &&
                        this.areAllied(next.ownerId, army.ownerId) &&
                        target.isNeighbor(next.id) &&
                        !target.isPathBlocked(next.id);

                    if (routeStillOpen) {
                        if (!army.visitedTerritoryIds.includes(target.id)) army.visitedTerritoryIds.push(target.id);
                        army.route.shift();
                        army.fromTerritoryId = target.id;
                        army.toTerritoryId = next.id;
                        army.start = { ...target.center };
                        army.end = { ...next.center };
                        army.durationMs = this.getTravelDuration(target, next, attacker);
                        army.elapsedMs = -350;
                        this.state.armies.push(army);
                        this.notify({
                            type: "ARMY_HOP",
                            armyId: army.id,
                            territoryId: target.id,
                            nextTerritoryId: next.id,
                            finalTerritoryId: army.finalTerritoryId
                        });
                        return;
                    }

                    target.units += army.units;
                    this.addLogisticsEvent(`Le convoi de ${attacker.name} s’arrête à ${target.name} : la route n’est plus sûre.`, army.ownerId);
                    this.notify({ type: "ARMY_ROUTE_STOPPED", armyId: army.id, territoryId: target.id });
                    return;
                }

                const incomingRoute = this.state.getReinforcementRoute(army.reinforcementRouteId);
                if (incomingRoute) {
                    incomingRoute.unitsDelivered += army.units;
                    this.notify({ type: "REINFORCEMENT_ROUTE_DELIVERED", routeId: incomingRoute.id, units: army.units });
                }

                if (this.relayArrivingReinforcements(army, target)) return;

                target.units += army.units;
                this.notify({ type: "ARMY_ARRIVED", armyId: army.id, territoryId: target.id });
                return;
            }

            const previousOwner = this.state.getFaction(target.ownerId);
            const defendingUnits = target.units;
            const result = C.CombatSystem.resolve({
                army,
                territory: target,
                attackerFaction: attacker,
                defenderFaction: previousOwner,
                random: this.random,
                capitalDefenseBonus: this.capitalDefenseBonus,
                attackMultiplierOverride: army.isBarbarian ? null : this.getFactionAttackMultiplier(attacker.id),
                defenseMultiplierOverride: this.getDefenseMultiplier(target)
            });
            const attackerSurvivors = result.attackerWon ? result.attackerSurvivors : 0;
            const defenderSurvivors = result.attackerWon ? 0 : result.defenderSurvivors;
            this.recordUnitLoss(army.isBarbarian ? null : attacker.id, army.units - attackerSurvivors, previousOwner?.id ?? null);
            this.recordUnitLoss(previousOwner?.id ?? null, defendingUnits - defenderSurvivors, army.isBarbarian ? null : attacker.id);

            if (result.attackerWon) {
                const wasCapital = target.isCapital;
                if (army.isBarbarian) {
                    if (previousOwner) previousOwner.statistics.territoriesLost += 1;
                    this.cancelRailroadConstruction(target);
                    this.cancelBuildingConstruction(target);
                    this.cancelWonderConstruction(target);
                    target.ownerId = null;
                    target.units = result.attackerSurvivors;
                    target.productionProgress = 0;
                    target.productionMode = "units";
                    target.productionModeChangedAtMs = this.state.elapsedMs;
                    target.installationProgressMs = 0;
                    target.isCapital = false;
                    target.airstrikeCooldownMs = 0;
                    target.airstrikeLastAction = null;
                    this.handleWonderOwnershipChange(target, previousOwner?.id ?? null, null);
                    const defeated = previousOwner ? previousOwner.name : "les forces locales";
                    this.addEvent(`Les Barbares mettent ${target.name} à sac face à ${defeated} — le territoire redevient neutre.`, "world");
                    if (wasCapital && previousOwner) {
                        this.addEvent(`La capitale de ${previousOwner.name} est tombée !`, "capture");
                        this.relocateCapital(previousOwner);
                    }
                    this.notify({
                        type: "BARBARIAN_RAID_RESOLVED",
                        territoryId: target.id,
                        previousOwnerId: previousOwner ? previousOwner.id : null,
                        barbariansWon: true
                    });
                    this.notify({ type: "TERRITORY_CAPTURED", territoryId: target.id, previousOwnerId: previousOwner ? previousOwner.id : null, ownerId: null });
                    this.evaluateTeamVictory();
                    return;
                }
                attacker.statistics.battlesWon += 1;
                attacker.statistics.territoriesCaptured += 1;
                if (previousOwner) previousOwner.statistics.territoriesLost += 1;
                this.cancelRailroadConstruction(target);
                this.cancelBuildingConstruction(target);
                this.cancelWonderConstruction(target);
                target.ownerId = attacker.id;
                target.units = result.attackerSurvivors;
                target.productionProgress = 0;
                target.productionMode = "units";
                target.productionModeChangedAtMs = this.state.elapsedMs;
                target.installationProgressMs = 0;
                target.isCapital = false;
                target.airstrikeCooldownMs = target.terrain === "airport" ? this.airstrikeCooldownMs : 0;
                target.airstrikeLastAction = null;
                this.handleWonderOwnershipChange(target, previousOwner?.id ?? null, attacker.id);
                attacker.statistics.peakTerritories = Math.max(
                    attacker.statistics.peakTerritories,
                    this.state.getTerritoriesOwnedBy(attacker.id).length
                );
                const defeated = previousOwner ? previousOwner.name : "les forces neutres";
                this.addEvent(`${attacker.name} capture ${target.name} face à ${defeated} — ${result.attackerSurvivors} survivants.`, "capture");
                if (target.rareSite) {
                    this.addEvent(`${attacker.name} sécurise le site stratégique : ${target.rareSite.name}.`, "capture");
                }
                if (target.installation?.type === "cannon") {
                    this.addEvent(`${attacker.name} prend le contrôle du canon de ${target.name}.`, "capture");
                    this.notify({
                        type: "INSTALLATION_CAPTURED",
                        territoryId: target.id,
                        ownerId: attacker.id,
                        installationType: target.installation.type
                    });
                }
                if (wasCapital && previousOwner) {
                    this.addEvent(`${attacker.name} s’empare de la capitale de ${previousOwner.name} !`, "capture");
                    this.relocateCapital(previousOwner);
                }
                this.notify({ type: "TERRITORY_CAPTURED", territoryId: target.id, previousOwnerId: previousOwner ? previousOwner.id : null, ownerId: attacker.id });
                this.evaluateTeamVictory();
            } else {
                if (previousOwner) previousOwner.statistics.battlesWon += 1;
                target.units = result.defenderSurvivors;
                const defenderName = previousOwner ? previousOwner.name : "Les défenseurs neutres";
                this.addEvent(`${defenderName} repousse ${attacker.name} à ${target.name} — ${result.defenderSurvivors} défenseurs restants.`, army.isBarbarian ? "world" : "combat");
                if (army.isBarbarian) {
                    this.notify({
                        type: "BARBARIAN_RAID_RESOLVED",
                        territoryId: target.id,
                        previousOwnerId: previousOwner ? previousOwner.id : null,
                        barbariansWon: false
                    });
                }
                this.notify({ type: "ATTACK_REPELLED", territoryId: target.id });
            }
        }

        relocateCapital(faction) {
            if (!faction) return;
            const territories = this.state.getTerritoriesOwnedBy(faction.id);
            if (!territories.length) {
                faction.capitalTerritoryId = null;
                return;
            }

            const newCapital = territories.reduce((best, territory) =>
                territory.units > best.units ? territory : best, territories[0]);
            newCapital.isCapital = true;
            faction.capitalTerritoryId = newCapital.id;
            this.addEvent(`${faction.name} établit sa nouvelle capitale à ${newCapital.name}.`, "info");
            this.notify({ type: "CAPITAL_RELOCATED", factionId: faction.id, territoryId: newCapital.id });
        }

        isWonderActive(territory) {
            return Boolean(territory?.wonderId && territory.ownerId !== null && territory.wonderActivationRemainingMs <= 0);
        }

        getActiveWonderTerritories(factionId, wonderId = null) {
            const normalizedFactionId = Number(factionId);
            return this.state.territories.filter((territory) =>
                territory.ownerId === normalizedFactionId &&
                this.isWonderActive(territory) &&
                (!wonderId || territory.wonderId === wonderId));
        }

        hasActiveWonder(factionId, wonderId) {
            return this.getActiveWonderTerritories(factionId, wonderId).length > 0;
        }

        getWonderGlobalEffect(factionId, effectName) {
            const activeTypes = new Set(this.getActiveWonderTerritories(factionId).map((territory) => territory.wonderId));
            return [...activeTypes].reduce((sum, wonderId) =>
                sum + (Number(C.getWonderType(wonderId)?.globalEffects?.[effectName]) || 0), 0);
        }

        getWonderLocalDefenseBonus(territory) {
            if (!territory || territory.ownerId === null) return 0;
            return this.getActiveWonderTerritories(territory.ownerId, "monumental-citadel").some((citadel) =>
                citadel.id === territory.id || citadel.neighbors.includes(territory.id))
                ? Number(C.WONDER_TYPES["monumental-citadel"].siteEffects.adjacentDefenseMultiplier) || 0
                : 0;
        }

        getFactionAttackMultiplier(factionId) {
            const faction = this.state.getFaction(factionId);
            if (!faction) return 1;
            const technologyMultiplier = 1 + C.getFactionTechnologyBonus(faction, "attackMultiplier");
            const wonderMultiplier = 1 + this.getWonderGlobalEffect(faction.id, "attackMultiplier");
            return faction.bonuses.attackMultiplier * faction.bonuses.combatMultiplier * technologyMultiplier * wonderMultiplier;
        }

        getAbilityCooldownDuration(factionId, baseDurationMs) {
            const reduction = C.Geometry.clamp(this.getWonderGlobalEffect(factionId, "abilityCooldownReduction"), 0, 0.75);
            return Math.max(0, Number(baseDurationMs) || 0) * (1 - reduction);
        }

        getTerritoryWonderFoodCapacity(territory) {
            if (!this.isWonderActive(territory)) return 0;
            return Number(C.getWonderType(territory.wonderId)?.siteEffects?.foodCapacity) || 0;
        }

        getPotentialTerritoryFoodCapacity(territory) {
            if (!territory || territory.isImpassable) return 0;
            const type = C.TERRITORY_TYPES[territory.terrain];
            let capacity = Number(type?.foodCapacity) || 0;
            if (territory.rareSite?.id === "metropolis") capacity += 50;
            if (territory.rareSite?.id === "great-dam") capacity += 20;
            (territory.buildings || []).forEach((buildingId) => {
                const definition = C.getBuildingType(buildingId);
                capacity += Number(definition?.effects?.foodCapacityWhenAssigned) || 0;
            });
            return capacity;
        }

        getTerritoryPassiveFoodCapacity(territory) {
            if (!territory || territory.ownerId === null || territory.isImpassable || territory.isCapital) return 0;
            if (this.isTerritoryUnderConstruction(territory)) return 0;
            if (this.eventSystem.isTerritoryAffected(territory.id, "famine")) return 0;
            return this.getFactionTerritoryBaseFoodCapacity(territory.ownerId);
        }

        getFactionTerritoryBaseFoodCapacity(factionId) {
            const faction = this.state.getFaction(factionId);
            return this.territoryBaseFoodCapacity + C.getFactionTechnologyBonus(faction, "territoryBaseFoodCapacityBonus");
        }

        getTerritoryFoodCapacity(territory) {
            if (!territory || territory.ownerId === null || territory.productionMode !== "food") return 0;
            if (this.isTerritoryUnderConstruction(territory)) return 0;
            if (this.eventSystem.isTerritoryAffected(territory.id, "famine")) return 0;
            return this.getPotentialTerritoryFoodCapacity(territory);
        }

        getFactionFoodState(factionId) {
            const faction = this.state.getFaction(factionId);
            if (!faction) return { capacity: 0, demand: 0, ratio: 1, productionMultiplier: 1, attritionRate: 0, shortage: 0, foodTerritoryCount: 0, wonderCapacity: 0 };
            const territories = this.state.getTerritoriesOwnedBy(faction.id);
            const capital = this.state.getTerritory(faction.capitalTerritoryId);
            const capitalCapacity = capital && capital.ownerId === faction.id ? this.capitalFoodCapacity : 0;
            const foodTerritories = territories.filter((territory) => territory.productionMode === "food");
            const passiveTerritoryCapacity = territories.reduce((sum, territory) => sum + this.getTerritoryPassiveFoodCapacity(territory), 0);
            const territoryCapacity = foodTerritories.reduce((sum, territory) => sum + this.getTerritoryFoodCapacity(territory), 0);
            const wonderCapacity = territories.reduce((sum, territory) => sum + this.getTerritoryWonderFoodCapacity(territory), 0);
            const movingUnits = this.state.armies
                .filter((army) => !army.isBarbarian && army.ownerId === faction.id)
                .reduce((sum, army) => sum + army.units, 0);
            const demand = territories.reduce((sum, territory) => sum + territory.units, 0) + movingUnits;
            const capacity = capitalCapacity + passiveTerritoryCapacity + territoryCapacity + wonderCapacity;
            const ratio = demand > 0 ? capacity / demand : 1;
            let productionMultiplier = 1;
            if (ratio < 1 / 1.60) productionMultiplier = 0;
            else if (ratio < 1 / 1.40) productionMultiplier = 0.10;
            else if (ratio < 1 / 1.25) productionMultiplier = 0.40;
            else if (ratio < 1 / 1.10) productionMultiplier = 0.75;
            const attritionRate = ratio < 1 / 1.60 ? 0.08 : ratio < 1 / 1.40 ? 0.05 : 0;
            return {
                capacity,
                capitalCapacity,
                passiveTerritoryCapacity,
                territoryCapacity,
                wonderCapacity,
                demand,
                ratio,
                productionMultiplier,
                attritionRate,
                shortage: Math.max(0, demand - capacity),
                foodTerritoryCount: foodTerritories.length
            };
        }

        updateFoodSystem(deltaMs) {
            let changed = false;
            this.state.factions.forEach((faction) => {
                const food = this.getFactionFoodState(faction.id);
                if (food.demand <= 0 || food.ratio >= this.foodAttritionThreshold) {
                    faction.foodAttritionProgressMs = 0;
                    return;
                }
                faction.foodAttritionProgressMs += deltaMs;
                while (faction.foodAttritionProgressMs >= this.foodAttritionIntervalMs) {
                    faction.foodAttritionProgressMs -= this.foodAttritionIntervalMs;
                    const requestedLosses = Math.max(1, Math.ceil(food.shortage * Math.max(0.02, food.attritionRate)));
                    const losses = this.applyFoodAttrition(faction.id, requestedLosses);
                    if (!losses) break;
                    this.recordUnitLoss(faction.id, losses);
                    changed = true;
                    if (this.state.elapsedMs - faction.lastFoodEventAtMs >= 30000) {
                        faction.lastFoodEventAtMs = this.state.elapsedMs;
                        this.addEvent(`${faction.name} manque de nourriture : ${losses} unité${losses > 1 ? "s" : ""} perdue${losses > 1 ? "s" : ""}.`, "world");
                    }
                    this.notify({ type: "FOOD_ATTRITION", factionId: faction.id, losses, food: this.getFactionFoodState(faction.id) });
                }
            });
            return changed;
        }

        applyFoodAttrition(factionId, requestedLosses) {
            let losses = 0;
            for (let index = 0; index < requestedLosses; index += 1) {
                const territoryCandidates = this.state.getTerritoriesOwnedBy(factionId)
                    .filter((territory) => territory.units > 1)
                    .map((territory) => ({ kind: "territory", value: territory, available: territory.units - 1 }));
                const armyCandidates = this.state.armies
                    .filter((army) => !army.isBarbarian && army.ownerId === Number(factionId) && army.units > 0)
                    .map((army) => ({ kind: "army", value: army, available: army.units }));
                const target = territoryCandidates.concat(armyCandidates)
                    .sort((first, second) => second.available - first.available)[0];
                if (!target) break;
                target.value.units -= 1;
                losses += 1;
            }
            this.state.armies = this.state.armies.filter((army) => army.units > 0);
            return losses;
        }

        getProductionMultiplier(territory) {
            if (territory.productionMode !== "units") return 0;
            if (this.eventSystem.isTerritoryAffected(territory.id, "famine")) return 0;
            const type = C.TERRITORY_TYPES[territory.terrain];
            const faction = this.state.getFaction(territory.ownerId);
            let typeMultiplier = type.productionMultiplier || 1;
            if (faction && (territory.terrain === "science" || territory.terrain === "power")) {
                typeMultiplier = 1 + (typeMultiplier - 1) * faction.bonuses.sciencePowerBonusMultiplier;
            }
            const factionMultiplier = faction ? faction.bonuses.recruitmentMultiplier : 1;
            const rareMultiplier = territory.rareSite ? territory.rareSite.productionMultiplier : 1;
            const technologyMultiplier = 1 + C.getFactionTechnologyBonus(faction, "productionMultiplier");
            const wonderMultiplier = faction ? 1 + this.getWonderGlobalEffect(faction.id, "productionMultiplier") : 1;
            const wonderSiteMultiplier = this.isWonderActive(territory)
                ? 1 + (Number(C.getWonderType(territory.wonderId)?.siteEffects?.productionMultiplier) || 0)
                : 1;
            const capitalMultiplier = territory.isCapital ? 1 + this.capitalProductionBonus : 1;
            const foodMultiplier = faction ? this.getFactionFoodState(faction.id).productionMultiplier : 1;
            const aiDifficultyMultiplier = faction && this.permanentAiFactionIds.includes(faction.id)
                ? this.aiProductionMultiplier
                : 1;
            return territory.production * typeMultiplier * factionMultiplier * rareMultiplier * technologyMultiplier * wonderMultiplier * wonderSiteMultiplier * capitalMultiplier * this.unitProductionMultiplier * foodMultiplier * aiDifficultyMultiplier;
        }

        getTerritoryVisibilityMap(factionId = this.playerId, range = this.visibilityRange) {
            const normalizedFactionId = Number(factionId);
            const maximumDistance = Math.max(0, Math.floor(Number(range) || 0));
            const distances = new Map();
            const pending = [];

            this.state.territories.forEach((territory) => {
                if (!this.areAllied(territory.ownerId, normalizedFactionId)) return;
                distances.set(territory.id, 0);
                pending.push(territory.id);
            });

            for (let cursor = 0; cursor < pending.length; cursor += 1) {
                const territoryId = pending[cursor];
                const distance = distances.get(territoryId);
                if (distance >= maximumDistance) continue;
                const territory = this.state.getTerritory(territoryId);
                if (!territory) continue;
                territory.neighbors.forEach((neighborId) => {
                    if (distances.has(neighborId)) return;
                    distances.set(neighborId, distance + 1);
                    pending.push(neighborId);
                });
            }

            this.state.territories
                .filter((territory) => territory.wonderId === "orbital-station" && this.isWonderActive(territory) && this.areAllied(territory.ownerId, normalizedFactionId))
                .forEach((station) => {
                    const bonus = Number(C.WONDER_TYPES["orbital-station"].siteEffects.visibilityRangeBonus) || 0;
                    const stationRange = maximumDistance + bonus;
                    const localDistances = new Map([[station.id, 0]]);
                    const localPending = [station.id];
                    for (let cursor = 0; cursor < localPending.length; cursor += 1) {
                        const territoryId = localPending[cursor];
                        const distance = localDistances.get(territoryId);
                        const knownDistance = distances.get(territoryId);
                        if (knownDistance === undefined || distance < knownDistance) distances.set(territoryId, distance);
                        if (distance >= stationRange) continue;
                        const current = this.state.getTerritory(territoryId);
                        if (!current) continue;
                        current.neighbors.forEach((neighborId) => {
                            if (localDistances.has(neighborId)) return;
                            localDistances.set(neighborId, distance + 1);
                            localPending.push(neighborId);
                        });
                    }
                });

            return distances;
        }

        isTerritoryVisible(territoryId, factionId = this.playerId, visibilityMap = null) {
            const distances = visibilityMap || this.getTerritoryVisibilityMap(factionId);
            return distances.has(Number(territoryId));
        }

        isArmyVisible(army, factionId = this.playerId, visibilityMap = null) {
            if (!army) return false;
            const normalizedFactionId = Number(factionId);
            if (army.ownerId === normalizedFactionId) return true;
            const distances = visibilityMap || this.getTerritoryVisibilityMap(normalizedFactionId);
            return distances.has(Number(army.fromTerritoryId)) || distances.has(Number(army.toTerritoryId));
        }

        getDefenseMultiplier(territory) {
            const type = C.TERRITORY_TYPES[territory.terrain];
            const faction = this.state.getFaction(territory.ownerId);
            const rareMultiplier = territory.rareSite ? territory.rareSite.defenseMultiplier : 1;
            const combatMultiplier = faction ? faction.bonuses.combatMultiplier : 1;
            const technologyMultiplier = 1 + C.getFactionTechnologyBonus(faction, "defenseMultiplier");
            const wonderMultiplier = faction ? 1 + this.getWonderGlobalEffect(faction.id, "defenseMultiplier") : 1;
            const localWonderMultiplier = 1 + this.getWonderLocalDefenseBonus(territory);
            const capitalMultiplier = territory.isCapital ? 1 + this.capitalDefenseBonus : 1;
            return type.defenseMultiplier * rareMultiplier * combatMultiplier * technologyMultiplier * wonderMultiplier * localWonderMultiplier * capitalMultiplier;
        }

        getResearchRate(factionId) {
            const faction = this.state.getFaction(factionId);
            if (!faction) return 0;
            const territories = this.state.getTerritoriesOwnedBy(faction.id);
            const scienceCenters = territories.filter((territory) => territory.terrain === "science").length;
            const powerPlants = territories.filter((territory) => territory.terrain === "power").length;
            const spaceCenters = territories.filter((territory) => territory.rareSite?.id === "space-center").length;
            const assignedResearchBonus = Math.min(0.50, territories.reduce((sum, territory) =>
                sum + this.getTerritoryResearchBonus(territory), 0));
            const territorialBonus = scienceCenters * 0.08 + powerPlants * 0.04 + spaceCenters * 0.15 + assignedResearchBonus;
            return 1 + territorialBonus * faction.bonuses.sciencePowerBonusMultiplier;
        }

        getTerritoryResearchBonus(territory) {
            if (!territory || territory.ownerId === null || territory.isImpassable || territory.productionMode !== "research") return 0;
            if (territory.rareSite?.id === "space-center") return 0.35;
            if (territory.terrain === "science") return 0.25;
            if (territory.terrain === "power") return 0.15;
            return 0.10;
        }

        getResearchState(factionId) {
            const faction = this.state.getFaction(factionId);
            if (!faction) return null;
            const activeTechnology = C.TECHNOLOGIES[faction.research.activeTechnologyId] || null;
            return {
                faction,
                activeTechnology,
                completedTechnologyIds: faction.research.completedTechnologyIds.slice(),
                progressMs: faction.research.progressMs,
                rate: this.getResearchRate(faction.id)
            };
        }

        getFactionStats(factionId) {
            const territories = this.state.getTerritoriesOwnedBy(factionId);
            const movingUnits = this.state.armies
                .filter((army) => army.ownerId === Number(factionId))
                .reduce((sum, army) => sum + army.units, 0);
            return {
                territoryCount: territories.length,
                totalUnits: territories.reduce((sum, territory) => sum + territory.units, 0) + movingUnits,
                productionPerMinute: territories.reduce((sum, territory) => sum + this.getProductionMultiplier(territory) * (60000 / this.productionIntervalMs), 0),
                food: this.getFactionFoodState(factionId)
            };
        }

        getFinalStandings() {
            return this.state.factions.map((faction) => {
                const live = this.getFactionStats(faction.id);
                return {
                    factionId: faction.id,
                    teamId: faction.teamId,
                    name: faction.name,
                    playerName: faction.playerName,
                    isAI: faction.isAI,
                    color: faction.color,
                    territoryCount: live.territoryCount,
                    totalUnits: live.totalUnits,
                    productionPerMinute: live.productionPerMinute,
                    statistics: { ...faction.statistics }
                };
            }).sort((first, second) =>
                Number(second.teamId === this.state.winnerTeamId) - Number(first.teamId === this.state.winnerTeamId) ||
                second.territoryCount - first.territoryCount ||
                second.totalUnits - first.totalUnits ||
                second.statistics.territoriesCaptured - first.statistics.territoriesCaptured);
        }

        createNetworkSnapshot() {
            return {
                revision: this.state.revision,
                elapsedMs: this.state.elapsedMs,
                winnerTeamId: this.state.winnerTeamId,
                victoryAtMs: this.state.victoryAtMs,
                nextArmyId: this.state.nextArmyId,
                nextReinforcementRouteId: this.state.nextReinforcementRouteId,
                nextWorldEventId: this.state.nextWorldEventId,
                nextAbilityActionId: this.state.nextAbilityActionId,
                nextWorldEventAtMs: this.state.nextWorldEventAtMs,
                scheduledWorldEventType: this.state.scheduledWorldEventType,
                worldEventWarningIssued: this.state.worldEventWarningIssued,
                lastWorldEventType: this.state.lastWorldEventType,
                territories: this.state.territories.map((territory) => ({
                    id: territory.id,
                    ownerId: territory.ownerId,
                    units: territory.units,
                    productionProgress: territory.productionProgress,
                    installationProgressMs: territory.installationProgressMs,
                    isCapital: territory.isCapital,
                    airstrikeCooldownMs: territory.airstrikeCooldownMs,
                    airstrikeLastAction: territory.airstrikeLastAction ? { ...territory.airstrikeLastAction } : null,
                    productionMode: territory.productionMode,
                    productionModeChangedAtMs: territory.productionModeChangedAtMs,
                    railroad: territory.railroad,
                    railroadConstructionActive: territory.railroadConstructionActive,
                    railroadConstructionProgressMs: territory.railroadConstructionProgressMs,
                    railroadPreviousProductionMode: territory.railroadPreviousProductionMode,
                    buildings: (territory.buildings || []).slice(),
                    buildingConstruction: territory.buildingConstruction ? { ...territory.buildingConstruction } : null,
                    wonderId: territory.wonderId,
                    wonderBuilderFactionId: territory.wonderBuilderFactionId,
                    wonderConstruction: territory.wonderConstruction ? { ...territory.wonderConstruction } : null,
                    wonderActivationRemainingMs: territory.wonderActivationRemainingMs,
                    wonderActionProgressMs: territory.wonderActionProgressMs,
                    wonderLastAction: territory.wonderLastAction ? { ...territory.wonderLastAction } : null
                })),
                factions: this.state.factions.map((faction) => ({
                    id: faction.id,
                    capitalTerritoryId: faction.capitalTerritoryId,
                    foodAttritionProgressMs: faction.foodAttritionProgressMs,
                    lastFoodEventAtMs: faction.lastFoodEventAtMs,
                    research: {
                        completedTechnologyIds: faction.research.completedTechnologyIds.slice(),
                        activeTechnologyId: faction.research.activeTechnologyId,
                        progressMs: faction.research.progressMs
                    },
                    abilityCooldowns: { ...faction.abilityCooldowns },
                    constructedWonderId: faction.constructedWonderId,
                    statistics: { ...faction.statistics }
                })),
                armies: this.state.armies.map((army) => army.toJSON()),
                reinforcementRoutes: this.state.reinforcementRoutes.map((route) => route.toJSON()),
                worldEvents: this.state.worldEvents.map((event) => ({
                    ...event,
                    territoryIds: (event.territoryIds || []).slice(),
                    data: { ...(event.data || {}) }
                })),
                abilityActions: this.state.abilityActions.map((action) => ({ ...action })),
                events: this.state.events.slice(-60)
            };
        }

        applyNetworkSnapshot(snapshot) {
            if (!snapshot || Number(snapshot.revision) < this.state.revision) return false;
            const previousWinnerTeamId = this.state.winnerTeamId;
            const previousAbilityActionIds = new Set(this.state.abilityActions.map((action) => action.id));
            (snapshot.territories || []).forEach((dynamic) => {
                const territory = this.state.getTerritory(dynamic.id);
                if (!territory) return;
                const previousOwnerId = territory.ownerId;
                const previousWonderId = territory.wonderId;
                const previousWonderConstruction = territory.wonderConstruction ? { ...territory.wonderConstruction } : null;
                const previousWonderActivationRemainingMs = territory.wonderActivationRemainingMs;
                const previousWonderActionAtMs = Number(territory.wonderLastAction?.firedAtMs) || 0;
                const previousAirstrikeAtMs = Number(territory.airstrikeLastAction?.firedAtMs) || 0;
                territory.ownerId = dynamic.ownerId ?? null;
                territory.units = Number(dynamic.units) || 0;
                territory.productionProgress = Number(dynamic.productionProgress) || 0;
                territory.installationProgressMs = Number(dynamic.installationProgressMs) || 0;
                territory.isCapital = Boolean(dynamic.isCapital);
                territory.airstrikeCooldownMs = Number(dynamic.airstrikeCooldownMs) || 0;
                const airstrikeTarget = this.state.getTerritory(dynamic.airstrikeLastAction?.targetTerritoryId);
                const airstrikeAtMs = Number(dynamic.airstrikeLastAction?.firedAtMs) || 0;
                territory.airstrikeLastAction = territory.terrain === "airport" && airstrikeTarget && airstrikeAtMs > 0
                    ? {
                        targetTerritoryId: airstrikeTarget.id,
                        damage: Math.max(0, Number(dynamic.airstrikeLastAction.damage) || 0),
                        automatic: Boolean(dynamic.airstrikeLastAction.automatic),
                        firedAtMs: airstrikeAtMs
                    }
                    : null;
                territory.railroad = Boolean(dynamic.railroad);
                territory.railroadConstructionActive = Boolean(dynamic.railroadConstructionActive);
                territory.railroadConstructionProgressMs = Number(dynamic.railroadConstructionProgressMs) || 0;
                territory.railroadPreviousProductionMode = ["units", "food", "research"].includes(dynamic.railroadPreviousProductionMode)
                    ? dynamic.railroadPreviousProductionMode
                    : null;
                territory.buildings = [...new Set((dynamic.buildings || []).filter((buildingId) => Boolean(C.getBuildingType(buildingId))))];
                const buildingDefinition = C.getBuildingType(dynamic.buildingConstruction?.buildingId);
                territory.buildingConstruction = buildingDefinition ? {
                    buildingId: buildingDefinition.id,
                    progressMs: Math.max(0, Number(dynamic.buildingConstruction.progressMs) || 0),
                    previousProductionMode: ["units", "food", "research"].includes(dynamic.buildingConstruction.previousProductionMode)
                        ? dynamic.buildingConstruction.previousProductionMode
                        : "units"
                } : null;
                const wonderDefinition = C.getWonderType(dynamic.wonderId);
                territory.wonderId = wonderDefinition ? wonderDefinition.id : null;
                territory.wonderBuilderFactionId = territory.wonderId && this.state.getFaction(dynamic.wonderBuilderFactionId)
                    ? Number(dynamic.wonderBuilderFactionId)
                    : null;
                const wonderConstructionDefinition = C.getWonderType(dynamic.wonderConstruction?.wonderId);
                const wonderConstructionBuilder = this.state.getFaction(dynamic.wonderConstruction?.builderFactionId);
                territory.wonderConstruction = wonderConstructionDefinition && wonderConstructionBuilder ? {
                    wonderId: wonderConstructionDefinition.id,
                    builderFactionId: wonderConstructionBuilder.id,
                    progressMs: Math.max(0, Number(dynamic.wonderConstruction.progressMs) || 0),
                    previousProductionMode: ["units", "food", "research"].includes(dynamic.wonderConstruction.previousProductionMode)
                        ? dynamic.wonderConstruction.previousProductionMode
                        : "units"
                } : null;
                territory.wonderActivationRemainingMs = territory.wonderId
                    ? Math.max(0, Number(dynamic.wonderActivationRemainingMs) || 0)
                    : 0;
                territory.wonderActionProgressMs = territory.wonderId === "big-bertha"
                    ? Math.min(
                        C.WONDER_TYPES["big-bertha"].siteEffects.fireIntervalMs,
                        Math.max(0, Number(dynamic.wonderActionProgressMs) || 0)
                    )
                    : 0;
                const wonderActionTarget = this.state.getTerritory(dynamic.wonderLastAction?.targetTerritoryId);
                const wonderActionAtMs = Number(dynamic.wonderLastAction?.firedAtMs) || 0;
                territory.wonderLastAction = territory.wonderId === "big-bertha" &&
                    dynamic.wonderLastAction?.type === "big-bertha" &&
                    wonderActionTarget && wonderActionAtMs > 0
                    ? {
                        type: "big-bertha",
                        targetTerritoryId: wonderActionTarget.id,
                        hit: Boolean(dynamic.wonderLastAction.hit),
                        damage: Math.max(0, Number(dynamic.wonderLastAction.damage) || 0),
                        firedAtMs: wonderActionAtMs
                    }
                    : null;
                territory.productionMode = territory.railroadConstructionActive || territory.buildingConstruction || territory.wonderConstruction
                    ? "construction"
                    : ["food", "research"].includes(dynamic.productionMode) ? dynamic.productionMode : "units";
                territory.productionModeChangedAtMs = Number(dynamic.productionModeChangedAtMs) || 0;
                if (previousOwnerId !== territory.ownerId) {
                    this.notify({
                        type: "TERRITORY_CAPTURED",
                        territoryId: territory.id,
                        previousOwnerId,
                        ownerId: territory.ownerId
                    });
                }
                if (territory.airstrikeLastAction && territory.airstrikeLastAction.firedAtMs > previousAirstrikeAtMs) {
                    this.notify({
                        ...territory.airstrikeLastAction,
                        type: "AIRSTRIKE_RESOLVED",
                        factionId: territory.ownerId,
                        sourceTerritoryId: territory.id
                    });
                }
                if (territory.wonderConstruction && previousWonderConstruction?.wonderId !== territory.wonderConstruction.wonderId) {
                    this.notify({
                        type: "WONDER_CONSTRUCTION_STARTED",
                        factionId: territory.wonderConstruction.builderFactionId,
                        territoryId: territory.id,
                        wonderId: territory.wonderConstruction.wonderId,
                        durationMs: C.getWonderType(territory.wonderConstruction.wonderId)?.constructionDurationMs
                    });
                } else if (previousWonderConstruction && !territory.wonderConstruction && territory.wonderId !== previousWonderConstruction.wonderId) {
                    this.notify({
                        type: "WONDER_CONSTRUCTION_CANCELLED",
                        factionId: previousWonderConstruction.builderFactionId,
                        territoryId: territory.id,
                        wonderId: previousWonderConstruction.wonderId
                    });
                }
                if (territory.wonderId && previousWonderId !== territory.wonderId) {
                    this.notify({
                        type: "WONDER_CONSTRUCTION_COMPLETED",
                        factionId: territory.wonderBuilderFactionId,
                        territoryId: territory.id,
                        wonderId: territory.wonderId
                    });
                } else if (territory.wonderId && previousOwnerId !== territory.ownerId) {
                    this.notify({
                        type: "WONDER_CAPTURED",
                        territoryId: territory.id,
                        wonderId: territory.wonderId,
                        previousOwnerId,
                        ownerId: territory.ownerId,
                        activationDelayMs: territory.wonderActivationRemainingMs
                    });
                } else if (territory.wonderId && previousWonderActivationRemainingMs > 0 && territory.wonderActivationRemainingMs === 0) {
                    this.notify({ type: "WONDER_ACTIVATED", factionId: territory.ownerId, territoryId: territory.id, wonderId: territory.wonderId });
                }
                if (territory.wonderLastAction && territory.wonderLastAction.firedAtMs > previousWonderActionAtMs) {
                    this.notify({
                        ...territory.wonderLastAction,
                        type: "BIG_BERTHA_FIRED",
                        factionId: territory.ownerId,
                        fromTerritoryId: territory.id
                    });
                }
            });
            (snapshot.factions || []).forEach((dynamic) => {
                const faction = this.state.getFaction(dynamic.id);
                if (!faction) return;
                faction.capitalTerritoryId = dynamic.capitalTerritoryId ?? null;
                faction.foodAttritionProgressMs = Number(dynamic.foodAttritionProgressMs) || 0;
                faction.lastFoodEventAtMs = Number(dynamic.lastFoodEventAtMs) || -30000;
                faction.research = {
                    completedTechnologyIds: dynamic.research?.completedTechnologyIds || [],
                    activeTechnologyId: dynamic.research?.activeTechnologyId || null,
                    progressMs: Number(dynamic.research?.progressMs) || 0
                };
                faction.abilityCooldowns = {
                    missile: Number(dynamic.abilityCooldowns?.missile) || 0,
                    reinforcement: Number(dynamic.abilityCooldowns?.reinforcement) || 0,
                    paratrooper: Number(dynamic.abilityCooldowns?.paratrooper) || 0,
                    nuclear: Number(dynamic.abilityCooldowns?.nuclear) || 0
                };
                faction.constructedWonderId = C.getWonderType(dynamic.constructedWonderId)?.id || null;
                faction.statistics = {
                    ...faction.statistics,
                    ...(dynamic.statistics || {})
                };
            });
            this.state.armies = (snapshot.armies || []).map((data) => {
                const army = new C.Army(data);
                army.elapsedMs = Number(data.elapsedMs) || 0;
                return army;
            });
            this.state.reinforcementRoutes = (snapshot.reinforcementRoutes || []).map((data) => {
                const route = new C.ReinforcementRoute(data);
                Object.assign(route, data);
                route.path = (data.path || []).slice();
                return route;
            });
            this.state.worldEvents = snapshot.worldEvents || [];
            this.state.abilityActions = snapshot.abilityActions || [];
            this.state.abilityActions.forEach((action) => {
                if (!previousAbilityActionIds.has(action.id)) this.notify({ type: "ABILITY_LAUNCHED", ...action });
            });
            this.state.events = snapshot.events || [];
            this.state.elapsedMs = Number(snapshot.elapsedMs) || 0;
            this.state.nextArmyId = Number(snapshot.nextArmyId) || 1;
            this.state.nextReinforcementRouteId = Number(snapshot.nextReinforcementRouteId) || 1;
            this.state.nextWorldEventId = Number(snapshot.nextWorldEventId) || 1;
            this.state.nextAbilityActionId = Number(snapshot.nextAbilityActionId) || 1;
            this.state.nextWorldEventAtMs = Number(snapshot.nextWorldEventAtMs) || 0;
            this.state.scheduledWorldEventType = snapshot.scheduledWorldEventType || null;
            this.state.worldEventWarningIssued = Boolean(snapshot.worldEventWarningIssued);
            this.state.lastWorldEventType = snapshot.lastWorldEventType || null;
            this.state.winnerTeamId = snapshot.winnerTeamId ?? null;
            this.state.victoryAtMs = snapshot.victoryAtMs ?? null;
            this.state.revision = Number(snapshot.revision) || 0;
            this.notify({ type: "NETWORK_SNAPSHOT_APPLIED", revision: this.state.revision });
            if (previousWinnerTeamId === null && this.state.winnerTeamId !== null) {
                this.paused = true;
                this.notify({
                    type: "GAME_OVER",
                    winnerTeamId: this.state.winnerTeamId,
                    victoryAtMs: this.state.victoryAtMs
                });
            }
            return true;
        }

        updateRemotePresentation(deltaMs) {
            const safeDelta = Math.max(0, Math.min(Number(deltaMs) || 0, 250)) * this.timeScale;
            this.state.elapsedMs += safeDelta;
            this.state.factions.forEach((faction) => {
                Object.keys(C.ABILITY_DEFINITIONS).forEach((abilityId) => {
                    faction.abilityCooldowns[abilityId] = Math.max(0, (Number(faction.abilityCooldowns[abilityId]) || 0) - safeDelta);
                });
            });
            this.state.armies.forEach((army) => {
                army.elapsedMs = Math.min(army.durationMs, army.elapsedMs + safeDelta);
            });
            const bertha = C.WONDER_TYPES["big-bertha"];
            if (bertha) {
                this.state.territories.forEach((territory) => {
                    if (territory.wonderId !== bertha.id || !this.isWonderActive(territory)) return;
                    territory.wonderActionProgressMs = Math.min(
                        bertha.siteEffects.fireIntervalMs,
                        (Number(territory.wonderActionProgressMs) || 0) + safeDelta
                    );
                });
            }
        }

        recordUnitLoss(victimFactionId, losses, destroyerFactionId = null) {
            const amount = Math.max(0, Math.floor(Number(losses) || 0));
            if (!amount) return;
            const victim = this.state.getFaction(victimFactionId);
            const destroyer = this.state.getFaction(destroyerFactionId);
            if (victim) victim.statistics.unitsLost += amount;
            if (destroyer && !this.areAllied(victimFactionId, destroyer.id)) {
                destroyer.statistics.enemyUnitsDestroyed += amount;
            }
        }

        evaluateTeamVictory() {
            if (this.state.winnerTeamId !== null) return this.state.winnerTeamId;
            const livingTeams = new Set(this.state.factions
                .filter((faction) => this.state.getTerritoriesOwnedBy(faction.id).length > 0)
                .map((faction) => faction.teamId));
            if (livingTeams.size === 1 && this.state.factions.length > 1) {
                this.state.winnerTeamId = livingTeams.values().next().value;
                this.state.victoryAtMs = this.state.elapsedMs;
                this.addEvent(`L’équipe ${this.state.winnerTeamId} remporte la partie !`, "capture");
                this.paused = true;
                this.state.touch();
                this.notify({
                    type: "GAME_OVER",
                    winnerTeamId: this.state.winnerTeamId,
                    victoryAtMs: this.state.victoryAtMs
                });
                return this.state.winnerTeamId;
            }
            return null;
        }

        getTerritoryProductionPerMinute(territory) {
            return territory.ownerId === null ? 0 : this.getProductionMultiplier(territory) * (60000 / this.productionIntervalMs);
        }

        addEvent(message, tone = "info") {
            const event = {
                id: `${this.state.elapsedMs}-${this.state.events.length}-${Math.round(this.random() * 9999)}`,
                timeMs: this.state.elapsedMs,
                message,
                tone
            };
            this.state.events.unshift(event);
            if (this.state.events.length > 60) this.state.events.length = 60;
            this.notify({ type: "EVENT_ADDED", event });
        }

        isAIControlledFaction(factionId) {
            return Boolean(this.aiSystem?.enabled && this.aiSystem.factionIds.includes(Number(factionId)));
        }

        addLogisticsEvent(message, factionId, tone = "info") {
            if (this.isAIControlledFaction(factionId)) return;
            this.addEvent(message, tone);
        }

        setPaused(paused) {
            if (this.state.winnerTeamId !== null && !paused) return false;
            this.paused = Boolean(paused);
            this.notify({ type: "PAUSE_CHANGED", paused: this.paused });
            return true;
        }

        setTimeScale(timeScale) {
            this.timeScale = C.Geometry.clamp(Number(timeScale) || 1, 0.25, 2);
            this.notify({ type: "TIME_SCALE_CHANGED", timeScale: this.timeScale });
        }

        subscribe(listener) {
            this.listeners.add(listener);
            return () => this.listeners.delete(listener);
        }

        notify(change) {
            this.listeners.forEach((listener) => listener(change, this.state));
        }
    }

    C.Game = Game;
})(window.Conquest = window.Conquest || {});
