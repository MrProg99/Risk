(function (C) {
    "use strict";

    class Game {
        constructor(options = {}) {
            const availableFactionIds = C.FACTION_DEFINITIONS.map((definition) => definition.id);
            const requestedPlayerId = Number(options.playerId);
            this.playerId = availableFactionIds.includes(requestedPlayerId) ? requestedPlayerId : availableFactionIds[0];
            const requestedFactionIds = Array.isArray(options.activeFactionIds)
                ? options.activeFactionIds.map(Number)
                : availableFactionIds;
            this.activeFactionIds = [...new Set(requestedFactionIds)]
                .filter((factionId) => availableFactionIds.includes(factionId));
            if (!this.activeFactionIds.includes(this.playerId)) this.activeFactionIds.unshift(this.playerId);
            this.state = new C.GameState();
            this.mapGenerator = new C.MapGenerator(this.state.mapWidth, this.state.mapHeight);
            this.listeners = new Set();
            this.random = Math.random;
            this.paused = false;
            this.timeScale = C.Geometry.clamp(Number(options.timeScale ?? 0.72), 0.25, 2);
            this.productionIntervalMs = 5000;
            this.aiSystem = new C.AISystem(this, {
                enabled: options.enableAI !== false,
                factionIds: this.activeFactionIds.filter((factionId) => factionId !== this.playerId)
            });
            this.eventSystem = new C.EventSystem(this, {
                enabled: options.enableWorldEvents !== false
            });
        }

        newGame(seed = this.createSeed()) {
            const normalizedSeed = Math.abs(Number(seed) || this.createSeed()) % 1000000;
            const generated = this.mapGenerator.generate(normalizedSeed);
            const state = new C.GameState();
            state.seed = normalizedSeed;
            state.islandPolygon = generated.islandPolygon;
            state.territories = generated.territories;
            state.factions = this.activeFactionIds.map((factionId) => {
                const definition = C.FACTION_DEFINITIONS.find((candidate) => candidate.id === factionId);
                return new C.Faction(definition);
            });
            this.state = state;
            this.random = C.Geometry.seededRandom((normalizedSeed ^ 0x9E3779B9) >>> 0);
            this.paused = false;

            this.assignStartingTerritories();
            this.assignRareSites();
            this.assignInstallations();
            this.aiSystem.reset();
            this.eventSystem.reset();
            const playerFaction = state.getFaction(this.playerId);
            const computerFactions = state.factions.filter((faction) => faction.id !== this.playerId);
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
            this.addEvent(`Carte générée : ${state.territories.length - lakeCount} territoires et ${lakeCount} lacs infranchissables.`, "info");
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
            const starts = [];
            const firstIndex = C.Geometry.randomInt(this.random, 0, territories.length - 1);
            starts.push(territories[firstIndex]);

            while (starts.length < this.state.factions.length) {
                const candidates = territories.filter((territory) => !starts.includes(territory));
                let best = candidates[0];
                let bestScore = -Infinity;
                candidates.forEach((candidate) => {
                    const nearestStart = Math.min(...starts.map((start) => C.Geometry.squaredDistance(candidate.center, start.center)));
                    const connectivityBonus = candidate.neighbors.length * 750;
                    if (nearestStart + connectivityBonus > bestScore) {
                        bestScore = nearestStart + connectivityBonus;
                        best = candidate;
                    }
                });
                starts.push(best);
            }

            this.state.territories.forEach((territory) => {
                territory.ownerId = null;
                territory.units = territory.isImpassable ? 0 : C.Geometry.randomInt(this.random, 3, 12);
                territory.productionProgress = territory.isImpassable ? 0 : this.random() * 0.8;
            });
            starts.forEach((territory, index) => {
                territory.ownerId = this.state.factions[index].id;
                territory.units = 20;
                territory.productionProgress = 0;
            });
        }

        assignRareSites() {
            const startIds = new Set(this.state.territories.filter((territory) => territory.ownerId !== null).map((territory) => territory.id));
            const forbiddenIds = new Set(startIds);
            this.state.territories.forEach((territory) => {
                if (startIds.has(territory.id)) territory.neighbors.forEach((id) => forbiddenIds.add(id));
            });

            let candidates = this.state.territories.filter((territory) => !territory.isImpassable && !forbiddenIds.has(territory.id) && territory.neighbors.length >= 4);
            if (candidates.length < 4) candidates = this.state.territories.filter((territory) => !territory.isImpassable && !startIds.has(territory.id));
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
            changed = this.eventSystem.update(safeDelta) || changed;

            this.state.territories.forEach((territory) => {
                if (territory.ownerId === null) return;
                territory.productionProgress += (safeDelta / this.productionIntervalMs) * this.getProductionMultiplier(territory);
                if (territory.productionProgress >= 1) {
                    const produced = Math.floor(territory.productionProgress);
                    territory.units += produced;
                    territory.productionProgress -= produced;
                    this.dispatchProducedReinforcements(territory, produced);
                    changed = true;
                }
            });

            changed = this.updateResearch(safeDelta) || changed;
            changed = this.updateInstallations(safeDelta) || changed;

            const arrivedArmies = [];
            this.state.armies.forEach((army) => {
                army.elapsedMs += safeDelta;
                if (army.elapsedMs >= army.durationMs) arrivedArmies.push(army);
            });
            arrivedArmies.forEach((army) => this.resolveArmyArrival(army));
            this.aiSystem.update(safeDelta);

            if (changed || arrivedArmies.length) this.state.touch();
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
                const reloadMultiplier = 1 + C.getFactionTechnologyBonus(faction, "cannonReloadMultiplier");
                territory.installationProgressMs = Math.min(
                    cannon.fireIntervalMs,
                    territory.installationProgressMs + deltaMs * reloadMultiplier
                );
                if (territory.installationProgressMs < cannon.fireIntervalMs) return;

                const target = this.findCannonTarget(territory);
                if (!target) return;
                territory.installationProgressMs = 0;
                const hit = this.random() < cannon.hitChance;
                if (hit) {
                    target.units = Math.max(1, target.units - cannon.damage);
                    changed = true;
                    this.addEvent(`Le canon de ${territory.name} touche ${target.name} : ${cannon.damage} unité ennemie détruite.`, "combat");
                }
                this.notify({
                    type: "CANNON_FIRED",
                    fromTerritoryId: territory.id,
                    targetTerritoryId: target.id,
                    ownerId: territory.ownerId,
                    hit,
                    damage: hit ? cannon.damage : 0
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
                    neighbor.ownerId !== territory.ownerId &&
                    neighbor.units > 1)
                .sort((a, b) => {
                    const strategicScore = (target) => target.units +
                        (target.rareSite ? 8 : 0) +
                        this.getProductionMultiplier(target) * 2;
                    return strategicScore(b) - strategicScore(a);
                })[0] || null;
        }

        executeCommand(command) {
            if (!command || typeof command.type !== "string") {
                return { ok: false, error: "Commande invalide." };
            }
            if (command.type === "SEND_ARMY") return this.sendArmy(command);
            if (command.type === "SEND_REINFORCEMENT_ROUTE") return this.sendReinforcementRoute(command);
            if (command.type === "CREATE_CONTINUOUS_REINFORCEMENT_ROUTE") return this.createContinuousReinforcementRoute(command);
            if (command.type === "CANCEL_CONTINUOUS_REINFORCEMENT_ROUTE") return this.cancelContinuousReinforcementRoute(command);
            if (command.type === "START_RESEARCH") return this.startResearch(command);
            return { ok: false, error: `Commande inconnue : ${command.type}` };
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
            const action = to.ownerId === playerId ? "renforce" : "attaque";
            this.addEvent(`${faction.name} ${action} ${to.name} avec ${units} unités${targetOwner ? ` (${targetOwner.name})` : ""}.`, "combat");
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
            if (destination.ownerId !== playerId) return { ok: false, error: "Un convoi ne peut rejoindre qu’un territoire allié." };
            if (from.id === destination.id) return { ok: false, error: "Choisissez un autre territoire de destination." };
            if (!Number.isFinite(units) || units < 1) return { ok: false, error: "Choisissez au moins une unité." };
            if (units >= from.units) return { ok: false, error: "Une unité doit rester pour tenir le territoire." };

            const path = this.findOwnedPath(playerId, from.id, destination.id);
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
            if (!command.reinforcementRouteId) {
                this.addEvent(`${faction.name} achemine ${units} renforts vers ${destination.name} — ${path.length - 1} étapes.`, "info");
            }
            this.notify({ type: "ARMY_SENT", armyId: army.id, route: path });
            return { ok: true, army, path };
        }

        createContinuousReinforcementRoute(command) {
            const playerId = Number(command.playerId);
            const from = this.state.getTerritory(command.fromTerritoryId);
            const destination = this.state.getTerritory(command.toTerritoryId);
            if (!from || !destination) return { ok: false, error: "Territoire introuvable." };
            if (from.isImpassable || destination.isImpassable) return { ok: false, error: "Les lacs sont totalement infranchissables." };
            if (from.ownerId !== playerId || destination.ownerId !== playerId) {
                return { ok: false, error: "Une ligne continue doit relier deux territoires alliés." };
            }
            if (from.id === destination.id) return { ok: false, error: "Choisissez un autre territoire de destination." };
            const path = this.findOwnedPath(playerId, from.id, destination.id);
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
            this.addEvent(`${faction.name} ${action} : ${from.name} → ${destination.name}${mode}.`, "info");
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
            this.addEvent(`${faction.name} ferme la ligne ${from ? from.name : "?"} → ${destination ? destination.name : "?"}.`, "info");
            this.notify({ type: "REINFORCEMENT_ROUTE_CANCELLED", routeId: route.id });
            return { ok: true, route };
        }

        maintainReinforcementRoutes() {
            this.state.reinforcementRoutes.forEach((route) => {
                if (!route.active) return;
                const from = this.state.getTerritory(route.fromTerritoryId);
                const destination = this.state.getTerritory(route.toTerritoryId);
                if (from && destination && from.ownerId === route.ownerId && destination.ownerId === route.ownerId) return;

                route.active = false;
                route.isPaused = false;
                this.state.touch();
                const faction = this.state.getFaction(route.ownerId);
                this.addEvent(`La ligne continue de ${faction ? faction.name : "la faction"} est fermée : une extrémité a été perdue.`, "info");
                this.notify({ type: "REINFORCEMENT_ROUTE_CANCELLED", routeId: route.id });
            });
        }

        dispatchProducedReinforcements(territory, producedUnits) {
            const route = this.state.reinforcementRoutes.find((candidate) =>
                candidate.active && candidate.fromTerritoryId === territory.id && candidate.ownerId === territory.ownerId);
            if (!route || producedUnits < 1) return;

            const path = this.findOwnedPath(route.ownerId, route.fromTerritoryId, route.toTerritoryId);
            if (!path) {
                if (!route.isPaused) {
                    route.isPaused = true;
                    route.pauseReason = "Aucun itinéraire allié disponible";
                    const destination = this.state.getTerritory(route.toTerritoryId);
                    this.addEvent(`Ligne vers ${destination ? destination.name : "la destination"} en pause : passage interrompu.`, "info");
                    this.notify({ type: "REINFORCEMENT_ROUTE_PAUSED", routeId: route.id });
                }
                return;
            }

            if (route.isPaused) {
                route.isPaused = false;
                route.pauseReason = null;
                const destination = this.state.getTerritory(route.toTerritoryId);
                this.addEvent(`La ligne vers ${destination.name} reprend son activité.`, "info");
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
                candidate.ownerId === territory.ownerId &&
                candidate.fromTerritoryId === territory.id);
            if (!route || army.relayCount >= 8) return false;

            const path = this.findOwnedPath(route.ownerId, territory.id, route.toTerritoryId);
            if (!path || path.length < 2) return false;
            const visited = new Set(army.visitedTerritoryIds.map(Number));
            if (army.fromTerritoryId !== null) visited.add(Number(army.fromTerritoryId));
            visited.add(territory.id);
            if (path.slice(1).some((territoryId) => visited.has(territoryId))) {
                this.addEvent(`Le hub de ${territory.name} conserve ${army.units} unités : une boucle logistique a été évitée.`, "info");
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
            const destination = this.state.getTerritory(route.toTerritoryId);
            this.addEvent(`${territory.name} relaie ${army.units} renforts vers ${destination ? destination.name : "sa destination"}.`, "info");
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
            const start = this.state.getTerritory(fromTerritoryId);
            const destination = this.state.getTerritory(toTerritoryId);
            if (!start || !destination || start.ownerId !== Number(ownerId) || destination.ownerId !== Number(ownerId)) return null;

            const pending = [start.id];
            const previous = new Map([[start.id, null]]);
            while (pending.length) {
                const currentId = pending.shift();
                if (currentId === destination.id) break;
                const current = this.state.getTerritory(currentId);
                current.neighbors.forEach((neighborId) => {
                    if (previous.has(neighborId) || current.isPathBlocked(neighborId)) return;
                    const neighbor = this.state.getTerritory(neighborId);
                    if (!neighbor || neighbor.isImpassable || neighbor.ownerId !== Number(ownerId)) return;
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
            const speed = 92 * (faction ? faction.bonuses.travelSpeedMultiplier : 1) * technologyMultiplier;
            return C.Geometry.clamp((distance / speed) * 1000, 1500, 6500);
        }

        resolveArmyArrival(army) {
            const target = this.state.getTerritory(army.toTerritoryId);
            const attacker = army.isBarbarian ? C.BARBARIAN_FACTION : this.state.getFaction(army.ownerId);
            this.state.armies = this.state.armies.filter((candidate) => candidate.id !== army.id);
            if (!target || !attacker) return;

            if (target.isImpassable) {
                const fallback = this.state.getTerritory(army.fromTerritoryId);
                if (fallback && fallback.ownerId === army.ownerId) fallback.units += army.units;
                this.addEvent(`L’armée de ${attacker.name} rebrousse chemin devant ${target.name}.`, "info");
                this.notify({ type: "ARMY_ROUTE_STOPPED", armyId: army.id, territoryId: fallback ? fallback.id : null });
                return;
            }

            if (army.isConvoy && target.ownerId !== army.ownerId) {
                const fallback = this.state.getTerritory(army.fromTerritoryId);
                if (fallback && fallback.ownerId === army.ownerId) fallback.units += army.units;
                const continuousRoute = this.state.getReinforcementRoute(army.reinforcementRouteId);
                if (continuousRoute && continuousRoute.active) {
                    continuousRoute.isPaused = true;
                    continuousRoute.pauseReason = "Un relais du convoi a été perdu";
                }
                this.addEvent(`Un convoi de ${attacker.name} fait demi-tour : ${target.name} n’est plus allié.`, "info");
                this.notify({ type: "ARMY_ROUTE_STOPPED", armyId: army.id, territoryId: fallback ? fallback.id : target.id });
                return;
            }

            if (target.ownerId === army.ownerId) {
                if (army.route.length) {
                    const nextId = army.route[0];
                    const next = this.state.getTerritory(nextId);
                    const routeStillOpen = next &&
                        next.ownerId === army.ownerId &&
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
                    this.addEvent(`Le convoi de ${attacker.name} s’arrête à ${target.name} : la route n’est plus sûre.`, "info");
                    this.notify({ type: "ARMY_ROUTE_STOPPED", armyId: army.id, territoryId: target.id });
                    return;
                }

                const incomingRoute = this.state.getReinforcementRoute(army.reinforcementRouteId);
                if (incomingRoute) {
                    incomingRoute.unitsDelivered += army.units;
                    if (incomingRoute.unitsDelivered === 1 || incomingRoute.unitsDelivered % 5 === 0) {
                        this.addEvent(`Flux vers ${target.name} : ${incomingRoute.unitsDelivered} unités livrées au total.`, "info");
                    }
                    this.notify({ type: "REINFORCEMENT_ROUTE_DELIVERED", routeId: incomingRoute.id, units: army.units });
                }

                if (this.relayArrivingReinforcements(army, target)) return;

                target.units += army.units;
                if (!incomingRoute) {
                    this.addEvent(`${attacker.name} renforce ${target.name} (+${army.units}).`, "info");
                }
                this.notify({ type: "ARMY_ARRIVED", armyId: army.id, territoryId: target.id });
                return;
            }

            const previousOwner = this.state.getFaction(target.ownerId);
            const result = C.CombatSystem.resolve({
                army,
                territory: target,
                attackerFaction: attacker,
                defenderFaction: previousOwner,
                random: this.random
            });

            if (result.attackerWon) {
                if (army.isBarbarian) {
                    target.ownerId = null;
                    target.units = result.attackerSurvivors;
                    target.productionProgress = 0;
                    target.installationProgressMs = 0;
                    const defeated = previousOwner ? previousOwner.name : "les forces locales";
                    this.addEvent(`Les Barbares mettent ${target.name} à sac face à ${defeated} — le territoire redevient neutre.`, "world");
                    this.notify({
                        type: "BARBARIAN_RAID_RESOLVED",
                        territoryId: target.id,
                        previousOwnerId: previousOwner ? previousOwner.id : null,
                        barbariansWon: true
                    });
                    this.notify({ type: "TERRITORY_CAPTURED", territoryId: target.id, ownerId: null });
                    return;
                }
                target.ownerId = attacker.id;
                target.units = result.attackerSurvivors;
                target.productionProgress = 0;
                target.installationProgressMs = 0;
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
                this.notify({ type: "TERRITORY_CAPTURED", territoryId: target.id, ownerId: attacker.id });
            } else {
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

        getProductionMultiplier(territory) {
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
            return territory.production * typeMultiplier * factionMultiplier * rareMultiplier * technologyMultiplier;
        }

        getDefenseMultiplier(territory) {
            const type = C.TERRITORY_TYPES[territory.terrain];
            const faction = this.state.getFaction(territory.ownerId);
            const rareMultiplier = territory.rareSite ? territory.rareSite.defenseMultiplier : 1;
            const combatMultiplier = faction ? faction.bonuses.combatMultiplier : 1;
            const technologyMultiplier = 1 + C.getFactionTechnologyBonus(faction, "defenseMultiplier");
            return type.defenseMultiplier * rareMultiplier * combatMultiplier * technologyMultiplier;
        }

        getResearchRate(factionId) {
            const faction = this.state.getFaction(factionId);
            if (!faction) return 0;
            const territories = this.state.getTerritoriesOwnedBy(faction.id);
            const scienceCenters = territories.filter((territory) => territory.terrain === "science").length;
            const powerPlants = territories.filter((territory) => territory.terrain === "power").length;
            const spaceCenters = territories.filter((territory) => territory.rareSite?.id === "space-center").length;
            const territorialBonus = scienceCenters * 0.08 + powerPlants * 0.04 + spaceCenters * 0.15;
            return 1 + territorialBonus * faction.bonuses.sciencePowerBonusMultiplier;
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
                productionPerMinute: territories.reduce((sum, territory) => sum + this.getProductionMultiplier(territory) * (60000 / this.productionIntervalMs), 0)
            };
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

        setPaused(paused) {
            this.paused = Boolean(paused);
            this.notify({ type: "PAUSE_CHANGED", paused: this.paused });
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
