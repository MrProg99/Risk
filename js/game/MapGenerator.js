(function (C) {
    "use strict";

    const FIRST_NAMES = [
        "Val", "Cap", "Mont", "Port", "Rive", "Fort", "Bois", "Lac", "Pic", "Baie",
        "Plaine", "Col", "Terre", "Roc", "Haut", "Champ", "Anse", "Vallée", "Côte", "Delta"
    ];
    const LAST_NAMES = [
        "d’Aube", "d’Azur", "Boréal", "Cendré", "du Levant", "Serein", "d’Onyx", "d’Argent",
        "des Brumes", "du Nord", "Émeraude", "des Pins", "du Faucon", "de Verre", "des Orages",
        "du Ponant", "Rouge", "des Échos", "d’Ivoire", "du Sable"
    ];
    const LAKE_NAMES = [
        "Lac des Brumes", "Lac d’Azur", "Lac Sombre", "Lac du Croissant", "Lac des Échos",
        "Lac Boréal", "Lac de Verre", "Lac d’Onyx", "Lac du Levant", "Lac Émeraude"
    ];

    class MapGenerator {
        constructor(width = 1200, height = 760, options = {}) {
            this.width = width;
            this.height = height;
            this.minimumTerritories = Math.max(2, Number(options.minimumTerritories) || 110);
            this.maximumTerritories = Math.max(this.minimumTerritories, Number(options.maximumTerritories) || 120);
            this.minimumLakes = Math.max(0, Number(options.minimumLakes) || 4);
            this.maximumLakes = Math.max(this.minimumLakes, Number(options.maximumLakes) || 6);
            this.minimumAirports = Math.max(0, Number(options.minimumAirports) || 4);
        }

        generate(seed, requestedCount, mapType = "standard") {
            const random = C.Geometry.seededRandom(seed);
            const normalizedMapType = C.normalizeMapType(mapType);
            const baseTerritoryCount = requestedCount || C.Geometry.randomInt(random, this.minimumTerritories, this.maximumTerritories);
            const territoryCount = normalizedMapType === "archipelago" && !requestedCount
                ? Math.round(baseTerritoryCount * 1.12)
                : baseTerritoryCount;
            const islandPolygon = this.createIsland(random);
            const sites = this.createSites(territoryCount, islandPolygon, random);
            const polygons = sites.map((site, siteIndex) => this.createVoronoiCell(site, siteIndex, sites, islandPolygon));
            const names = this.createNames(territoryCount, random);
            const territories = polygons.map((polygon, index) => {
                const type = this.pickTerritoryType(random);
                return new C.Territory({
                    id: index + 1,
                    name: names[index],
                    polygon,
                    center: C.Geometry.polygonCentroid(polygon),
                    terrain: type.id,
                    resource: type.resource,
                    production: 1
                });
            });

            this.detectNeighbors(territories);
            const chokeEdges = normalizedMapType === "hourglass"
                ? this.createHourglassChoke(territories)
                : normalizedMapType === "archipelago"
                    ? this.createArchipelago(territories, random)
                    : [];
            if (normalizedMapType !== "archipelago") this.createLakes(territories, random);
            this.ensureMinimumTerrain(territories, "airport", this.minimumAirports, random);
            this.createMountainBarriers(territories, random);
            return { islandPolygon, territories, mapType: normalizedMapType, chokeEdges };
        }

        createHourglassChoke(territories) {
            const centerX = this.width / 2;
            const centerY = this.height / 2;
            const crossEdges = [];
            territories.forEach((territory) => {
                territory.neighbors.forEach((neighborId) => {
                    if (territory.id >= neighborId) return;
                    const neighbor = territories.find((candidate) => candidate.id === neighborId);
                    if (!neighbor) return;
                    const oppositeSides = (territory.center.x < centerX && neighbor.center.x >= centerX) ||
                        (neighbor.center.x < centerX && territory.center.x >= centerX);
                    if (!oppositeSides) return;
                    const midpoint = {
                        x: (territory.center.x + neighbor.center.x) / 2,
                        y: (territory.center.y + neighbor.center.y) / 2
                    };
                    crossEdges.push({ first: territory, second: neighbor, midpoint });
                });
            });

            crossEdges.forEach((edge) => {
                if (!edge.first.blockedNeighbors.includes(edge.second.id)) edge.first.blockedNeighbors.push(edge.second.id);
                if (!edge.second.blockedNeighbors.includes(edge.first.id)) edge.second.blockedNeighbors.push(edge.first.id);
            });
            crossEdges.sort((a, b) => Math.abs(a.midpoint.y - centerY) - Math.abs(b.midpoint.y - centerY));

            const opened = [];
            for (const edge of crossEdges) {
                edge.first.blockedNeighbors = edge.first.blockedNeighbors.filter((id) => id !== edge.second.id);
                edge.second.blockedNeighbors = edge.second.blockedNeighbors.filter((id) => id !== edge.first.id);
                edge.first.isChokePoint = true;
                edge.second.isChokePoint = true;
                opened.push(edge);
                if (this.isTraversableGraphConnected(territories)) break;
            }
            const chokeTerritories = [...new Set(opened.flatMap((edge) => [edge.first, edge.second]))];
            chokeTerritories.forEach((territory, index) => {
                territory.name = chokeTerritories.length > 2 ? `Passage du Sablier ${index + 1}` : "Passage du Sablier";
                territory.resource = "Carrefour stratégique";
            });
            return opened.map((edge) => [edge.first.id, edge.second.id]);
        }

        createArchipelago(territories) {
            const isLarge = this.maximumTerritories >= 150;
            const columns = isLarge ? 3 : 2;
            const rows = 2;
            const xCuts = columns === 3
                ? [this.width * 0.36, this.width * 0.64]
                : [this.width * 0.5];
            const yCut = this.height * 0.5;
            const xBand = this.width * (columns === 3 ? 0.04 : 0.052);
            const yBand = this.height * (isLarge ? 0.064 : 0.07);
            const islandCount = columns * rows;
            let seaIndex = 0;

            const getColumn = (x) => {
                for (let index = 0; index < xCuts.length; index += 1) {
                    if (x < xCuts[index]) return index;
                }
                return xCuts.length;
            };
            const distanceFromSeparator = (territory) => Math.min(
                Math.abs(territory.center.y - yCut) / this.height,
                ...xCuts.map((cut) => Math.abs(territory.center.x - cut) / this.width)
            );
            const makeSea = (territory) => {
                territory.isImpassable = true;
                territory.isChokePoint = false;
                territory.isArchipelagoPassage = false;
                territory.name = `Mer intérieure ${++seaIndex}`;
                territory.terrain = "lake";
                territory.resource = "Eaux interinsulaires";
                territory.production = 0;
                territory.productionProgress = 0;
                territory.ownerId = null;
                territory.units = 0;
            };

            territories.forEach((territory) => {
                const column = getColumn(territory.center.x);
                const row = territory.center.y < yCut ? 0 : 1;
                territory.archipelagoIslandId = row * columns + column;
                const inVerticalChannel = xCuts.some((cut) => Math.abs(territory.center.x - cut) <= xBand);
                const inHorizontalChannel = Math.abs(territory.center.y - yCut) <= yBand;
                if (inVerticalChannel || inHorizontalChannel) makeSea(territory);
            });

            // Une cellule très large peut parfois toucher les deux rives d'un chenal.
            // On transforme alors la cellule la plus proche de la séparation en mer
            // afin qu'aucun passage terrestre invisible ne relie deux îles.
            let safety = territories.length;
            while (safety-- > 0) {
                let leak = null;
                territories.some((territory) => territory.neighbors.some((neighborId) => {
                    const neighbor = territories.find((candidate) => candidate.id === neighborId);
                    if (!neighbor || territory.isImpassable || neighbor.isImpassable) return false;
                    if (territory.archipelagoIslandId === neighbor.archipelagoIslandId) return false;
                    leak = { territory, neighbor };
                    return true;
                }));
                if (!leak) break;
                const candidate = distanceFromSeparator(leak.territory) <= distanceFromSeparator(leak.neighbor)
                    ? leak.territory
                    : leak.neighbor;
                makeSea(candidate);
            }

            // On conserve une masse terrestre principale par île. Les minuscules
            // fragments que peut créer une cellule Voronoï très étirée deviennent
            // de l'eau plutôt qu'une cinquième île accidentelle.
            for (let islandId = 0; islandId < islandCount; islandId += 1) {
                const remaining = new Set(territories
                    .filter((territory) => !territory.isImpassable && territory.archipelagoIslandId === islandId)
                    .map((territory) => territory.id));
                const components = [];
                while (remaining.size) {
                    const firstId = remaining.values().next().value;
                    const component = [];
                    const pending = [firstId];
                    remaining.delete(firstId);
                    while (pending.length) {
                        const territoryId = pending.pop();
                        const territory = territories.find((candidate) => candidate.id === territoryId);
                        component.push(territory);
                        territory.neighbors.forEach((neighborId) => {
                            const neighbor = territories.find((candidate) => candidate.id === neighborId);
                            if (!neighbor || neighbor.isImpassable || neighbor.archipelagoIslandId !== islandId || !remaining.has(neighborId)) return;
                            remaining.delete(neighborId);
                            pending.push(neighborId);
                        });
                    }
                    components.push(component);
                }
                components.sort((first, second) => second.length - first.length);
                components.slice(1).flat().forEach((territory) => makeSea(territory));
            }

            const rowCenters = [this.height * 0.29, this.height * 0.71];
            const columnCenters = columns === 3
                ? [this.width * 0.22, this.width * 0.5, this.width * 0.78]
                : [this.width * 0.29, this.width * 0.71];
            const passagePlans = [];
            for (let row = 0; row < rows; row += 1) {
                for (let column = 0; column < columns - 1; column += 1) {
                    passagePlans.push({
                        firstIslandId: row * columns + column,
                        secondIslandId: row * columns + column + 1,
                        anchor: { x: xCuts[column], y: rowCenters[row] }
                    });
                }
            }
            for (let column = 0; column < columns; column += 1) {
                passagePlans.push({
                    firstIslandId: column,
                    secondIslandId: columns + column,
                    anchor: { x: columnCenters[column], y: yCut }
                });
            }

            const passageNames = [
                "Chaussée du Nord", "Pont du Levant", "Chaussée du Sud", "Pont du Ponant",
                "Passage des Brumes", "Pont Central", "Chaussée d’Azur", "Passage des Échos"
            ];
            const openedEdges = [];
            passagePlans.forEach((plan, index) => {
                const first = this.findNearestIslandTerritory(territories, plan.firstIslandId, plan.anchor);
                const second = this.findNearestIslandTerritory(territories, plan.secondIslandId, plan.anchor);
                if (!first || !second) return;
                const path = this.findArchipelagoPath(
                    territories,
                    first,
                    second,
                    plan.anchor,
                    new Set([plan.firstIslandId, plan.secondIslandId]),
                    false
                );
                openedEdges.push(...this.openArchipelagoPath(
                    path,
                    passageNames[index] || `Passage interinsulaire ${index + 1}`
                ));
            });

            // Sécurité pour les géométries Voronoï exceptionnelles : si une île
            // demeure isolée, le corridor le plus court est ouvert vers le réseau.
            let components = this.getTraversableComponents(territories);
            let fallbackIndex = 1;
            while (components.length > 1 && fallbackIndex <= islandCount * 2) {
                let closest = null;
                for (let firstIndex = 0; firstIndex < components.length; firstIndex += 1) {
                    for (let secondIndex = firstIndex + 1; secondIndex < components.length; secondIndex += 1) {
                        components[firstIndex].forEach((first) => components[secondIndex].forEach((second) => {
                            const distance = C.Geometry.squaredDistance(first.center, second.center);
                            if (!closest || distance < closest.distance) closest = { first, second, distance };
                        }));
                    }
                }
                if (!closest) break;
                const anchor = {
                    x: (closest.first.center.x + closest.second.center.x) / 2,
                    y: (closest.first.center.y + closest.second.center.y) / 2
                };
                const path = this.findArchipelagoPath(territories, closest.first, closest.second, anchor, null, true);
                if (!path.length) break;
                openedEdges.push(...this.openArchipelagoPath(path, `Passage de secours ${fallbackIndex++}`));
                components = this.getTraversableComponents(territories);
            }
            return [...new Map(openedEdges.map((edge) => [`${Math.min(...edge)}:${Math.max(...edge)}`, edge])).values()];
        }

        findNearestIslandTerritory(territories, islandId, anchor) {
            return territories
                .filter((territory) => !territory.isImpassable && territory.archipelagoIslandId === islandId)
                .sort((first, second) =>
                    C.Geometry.squaredDistance(first.center, anchor) - C.Geometry.squaredDistance(second.center, anchor))[0] || null;
        }

        findArchipelagoPath(territories, source, target, anchor, allowedIslandIds = null, allowExistingPassages = false) {
            if (!source || !target) return [];
            const byId = new Map(territories.map((territory) => [territory.id, territory]));
            const distances = new Map([[source.id, 0]]);
            const previous = new Map();
            const pending = new Set(territories.map((territory) => territory.id));
            const maximumDimension = Math.max(this.width, this.height);

            const allowed = (territory) => {
                if (territory.id === source.id || territory.id === target.id || territory.isImpassable) return true;
                if (territory.isArchipelagoPassage) return allowExistingPassages;
                return !allowedIslandIds || allowedIslandIds.has(territory.archipelagoIslandId);
            };

            while (pending.size) {
                let currentId = null;
                let currentDistance = Infinity;
                pending.forEach((territoryId) => {
                    const distance = distances.get(territoryId) ?? Infinity;
                    if (distance < currentDistance) {
                        currentDistance = distance;
                        currentId = territoryId;
                    }
                });
                if (currentId === null || currentDistance === Infinity) break;
                pending.delete(currentId);
                if (currentId === target.id) break;
                const current = byId.get(currentId);
                current.neighbors.forEach((neighborId) => {
                    if (!pending.has(neighborId)) return;
                    const neighbor = byId.get(neighborId);
                    if (!neighbor || !allowed(neighbor)) return;
                    const anchorPenalty = C.Geometry.distance(neighbor.center, anchor) / maximumDimension;
                    const stepCost = (neighbor.isImpassable ? 4 : 0.55) + anchorPenalty * 1.8;
                    const nextDistance = currentDistance + stepCost;
                    if (nextDistance >= (distances.get(neighborId) ?? Infinity)) return;
                    distances.set(neighborId, nextDistance);
                    previous.set(neighborId, currentId);
                });
            }

            if (!distances.has(target.id)) return [];
            const path = [];
            let currentId = target.id;
            while (currentId !== undefined) {
                path.unshift(byId.get(currentId));
                if (currentId === source.id) break;
                currentId = previous.get(currentId);
            }
            return path[0]?.id === source.id ? path : [];
        }

        openArchipelagoPath(path, name) {
            if (!path.length) return [];
            const converted = path.filter((territory) => territory.isImpassable);
            converted.forEach((territory, index) => {
                territory.isImpassable = false;
                territory.isChokePoint = true;
                territory.isArchipelagoPassage = true;
                territory.archipelagoIslandId = null;
                territory.name = converted.length > 1 ? `${name} ${index + 1}` : name;
                territory.terrain = "plain";
                territory.resource = "Liaison interinsulaire";
                territory.production = 1;
                territory.productionProgress = 0;
                territory.ownerId = null;
                territory.units = 0;
            });
            if (!converted.length) {
                path.slice(0, 2).forEach((territory) => {
                    territory.isChokePoint = true;
                    territory.isArchipelagoPassage = true;
                });
            }
            return path.slice(1).map((territory, index) => [path[index].id, territory.id]);
        }

        getTraversableComponents(territories) {
            const traversable = territories.filter((territory) => !territory.isImpassable);
            const byId = new Map(territories.map((territory) => [territory.id, territory]));
            const remaining = new Set(traversable.map((territory) => territory.id));
            const components = [];
            while (remaining.size) {
                const firstId = remaining.values().next().value;
                const component = [];
                const pending = [firstId];
                remaining.delete(firstId);
                while (pending.length) {
                    const territory = byId.get(pending.pop());
                    if (!territory) continue;
                    component.push(territory);
                    territory.neighbors.forEach((neighborId) => {
                        const neighbor = byId.get(neighborId);
                        if (!neighbor || neighbor.isImpassable || territory.isPathBlocked(neighborId) || !remaining.has(neighborId)) return;
                        remaining.delete(neighborId);
                        pending.push(neighborId);
                    });
                }
                components.push(component);
            }
            return components;
        }

        createIsland(random) {
            const centerX = this.width / 2;
            const centerY = this.height / 2 + 5;
            const radiusX = this.width * 0.435;
            const radiusY = this.height * 0.385;
            const phaseA = random() * Math.PI * 2;
            const phaseB = random() * Math.PI * 2;
            const candidates = [];
            const pointCount = 54;

            for (let index = 0; index < pointCount; index += 1) {
                const angle = (index / pointCount) * Math.PI * 2;
                const harmonic = 1 + Math.sin(angle * 3 + phaseA) * 0.065 + Math.sin(angle * 5 + phaseB) * 0.035;
                const jitter = 0.965 + random() * 0.07;
                candidates.push({
                    x: centerX + Math.cos(angle) * radiusX * harmonic * jitter,
                    y: centerY + Math.sin(angle) * radiusY * harmonic * jitter
                });
            }

            return C.Geometry.convexHull(candidates);
        }

        createSites(count, islandPolygon, random) {
            const sites = [];
            const bounds = islandPolygon.reduce((acc, point) => ({
                minX: Math.min(acc.minX, point.x),
                maxX: Math.max(acc.maxX, point.x),
                minY: Math.min(acc.minY, point.y),
                maxY: Math.max(acc.maxY, point.y)
            }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });

            while (sites.length < count) {
                let bestCandidate = null;
                let bestScore = -Infinity;
                const attempts = sites.length < 2 ? 35 : 70;

                for (let attempt = 0; attempt < attempts; attempt += 1) {
                    let candidate;
                    do {
                        candidate = {
                            x: C.Geometry.lerp(bounds.minX, bounds.maxX, random()),
                            y: C.Geometry.lerp(bounds.minY, bounds.maxY, random())
                        };
                    } while (!C.Geometry.pointInPolygon(candidate, islandPolygon));

                    const minDistance = sites.length
                        ? Math.min(...sites.map((site) => C.Geometry.squaredDistance(site, candidate)))
                        : C.Geometry.squaredDistance(candidate, { x: this.width / 2, y: this.height / 2 });

                    if (minDistance > bestScore) {
                        bestScore = minDistance;
                        bestCandidate = candidate;
                    }
                }
                sites.push(bestCandidate);
            }
            return sites;
        }

        createVoronoiCell(site, siteIndex, sites, boundary) {
            let polygon = boundary.map((point) => ({ ...point }));
            for (let index = 0; index < sites.length; index += 1) {
                if (index === siteIndex) continue;
                const other = sites[index];
                const normalX = other.x - site.x;
                const normalY = other.y - site.y;
                const limit = (other.x * other.x + other.y * other.y - site.x * site.x - site.y * site.y) / 2;
                polygon = C.Geometry.clipPolygonWithHalfPlane(polygon, normalX, normalY, limit);
                if (!polygon.length) break;
            }
            return polygon;
        }

        detectNeighbors(territories) {
            for (let first = 0; first < territories.length; first += 1) {
                for (let second = first + 1; second < territories.length; second += 1) {
                    const sharedLength = C.Geometry.sharedEdgeLength(territories[first].polygon, territories[second].polygon);
                    if (sharedLength > 1.5) {
                        territories[first].neighbors.push(territories[second].id);
                        territories[second].neighbors.push(territories[first].id);
                    }
                }
            }
        }

        createLakes(territories, random) {
            const targetCount = C.Geometry.randomInt(random, this.minimumLakes, this.maximumLakes);
            const mapCenter = { x: this.width / 2, y: this.height / 2 };
            const names = C.Geometry.shuffle(LAKE_NAMES, random);
            const candidates = C.Geometry.shuffle(territories.filter((territory) =>
                !territory.isImpassable &&
                !territory.isChokePoint &&
                territory.neighbors.length >= 4 &&
                C.Geometry.distance(territory.center, mapCenter) < this.width * 0.34), random);
            const selected = [];

            candidates.sort((a, b) => b.neighbors.length - a.neighbors.length);
            for (const candidate of candidates) {
                if (selected.some((lake) => lake.isNeighbor(candidate.id))) continue;
                candidate.isImpassable = true;
                if (!this.isTraversableGraphConnected(territories)) {
                    candidate.isImpassable = false;
                    continue;
                }

                candidate.name = names[selected.length] || `Lac intérieur ${selected.length + 1}`;
                candidate.terrain = "lake";
                candidate.resource = "Eau profonde";
                candidate.production = 0;
                candidate.productionProgress = 0;
                candidate.ownerId = null;
                candidate.units = 0;
                selected.push(candidate);
                if (selected.length >= targetCount) break;
            }
        }

        createMountainBarriers(territories, random) {
            const edges = [];
            territories.forEach((territory) => {
                if (territory.isImpassable) return;
                territory.neighbors.forEach((neighborId) => {
                    if (territory.id >= neighborId) return;
                    const neighbor = territories.find((candidate) => candidate.id === neighborId);
                    if (!neighbor || neighbor.isImpassable) return;
                    if (territory.isArchipelagoPassage || neighbor.isArchipelagoPassage) return;
                    const segment = C.Geometry.sharedEdgeSegment(territory.polygon, neighbor.polygon);
                    if (!segment || segment.length < 25) return;
                    edges.push({
                        first: territory,
                        second: neighbor,
                        midpoint: {
                            x: (segment.start.x + segment.end.x) / 2,
                            y: (segment.start.y + segment.end.y) / 2
                        },
                        length: segment.length
                    });
                });
            });

            const shuffled = C.Geometry.shuffle(edges, random);
            const anchors = [];
            for (const edge of shuffled) {
                const farEnough = anchors.every((anchor) => C.Geometry.distance(anchor.midpoint, edge.midpoint) > this.width * 0.16);
                if (farEnough) anchors.push(edge);
                if (anchors.length >= 3) break;
            }
            if (!anchors.length && edges.length) anchors.push(edges[0]);

            const candidates = edges.map((edge) => {
                const rangeDistance = Math.min(...anchors.map((anchor) => C.Geometry.distance(edge.midpoint, anchor.midpoint)));
                return { ...edge, score: rangeDistance + random() * 110 - edge.length * 0.12 };
            }).sort((a, b) => a.score - b.score);

            const targetCount = C.Geometry.clamp(
                Math.round(edges.length * 0.14),
                Math.round(territories.length * 0.22),
                Math.round(territories.length * 0.38)
            );
            const minimumOpenBorders = 2;
            let placed = 0;
            for (const edge of candidates) {
                edge.first.blockedNeighbors.push(edge.second.id);
                edge.second.blockedNeighbors.push(edge.first.id);

                const firstStillOpenEnough = this.countOpenBorders(edge.first, territories) >= minimumOpenBorders;
                const secondStillOpenEnough = this.countOpenBorders(edge.second, territories) >= minimumOpenBorders;
                const archipelagoIslandsStayConnected = this.areArchipelagoIslandsInternallyConnected(territories);

                if (!firstStillOpenEnough || !secondStillOpenEnough || !archipelagoIslandsStayConnected || !this.isTraversableGraphConnected(territories)) {
                    edge.first.blockedNeighbors.pop();
                    edge.second.blockedNeighbors.pop();
                    continue;
                }

                placed += 1;
                if (placed >= targetCount) break;
            }
        }

        areArchipelagoIslandsInternallyConnected(territories) {
            const islandIds = [...new Set(territories
                .filter((territory) => !territory.isImpassable && territory.archipelagoIslandId !== null)
                .map((territory) => territory.archipelagoIslandId))];
            if (!islandIds.length) return true;
            return islandIds.every((islandId) => {
                const islandTerritories = territories.filter((territory) =>
                    !territory.isImpassable && territory.archipelagoIslandId === islandId);
                if (!islandTerritories.length) return false;
                const islandIdsSet = new Set(islandTerritories.map((territory) => territory.id));
                const visited = new Set();
                const pending = [islandTerritories[0].id];
                while (pending.length) {
                    const territoryId = pending.pop();
                    if (visited.has(territoryId)) continue;
                    visited.add(territoryId);
                    const territory = territories.find((candidate) => candidate.id === territoryId);
                    territory.neighbors.forEach((neighborId) => {
                        if (islandIdsSet.has(neighborId) && !territory.isPathBlocked(neighborId) && !visited.has(neighborId)) pending.push(neighborId);
                    });
                }
                return visited.size === islandTerritories.length;
            });
        }

        countOpenBorders(territory, territories) {
            return territory.neighbors.filter((neighborId) => {
                const neighbor = territories.find((candidate) => candidate.id === neighborId);
                return neighbor && !neighbor.isImpassable && !territory.isPathBlocked(neighborId);
            }).length;
        }

        isTraversableGraphConnected(territories) {
            const traversableTerritories = territories.filter((territory) => !territory.isImpassable);
            if (!traversableTerritories.length) return true;
            const visited = new Set();
            const pending = [traversableTerritories[0].id];
            while (pending.length) {
                const id = pending.pop();
                if (visited.has(id)) continue;
                visited.add(id);
                const territory = territories.find((candidate) => candidate.id === id);
                territory.neighbors.forEach((neighborId) => {
                    const neighbor = territories.find((candidate) => candidate.id === neighborId);
                    if (neighbor && !neighbor.isImpassable && !territory.isPathBlocked(neighborId) && !visited.has(neighborId)) pending.push(neighborId);
                });
            }
            return visited.size === traversableTerritories.length;
        }

        pickTerritoryType(random) {
            const types = Object.values(C.TERRITORY_TYPES);
            const totalWeight = types.reduce((sum, type) => sum + type.weight, 0);
            let roll = random() * totalWeight;
            for (const type of types) {
                roll -= type.weight;
                if (roll <= 0) return type;
            }
            return types[0];
        }

        ensureMinimumTerrain(territories, terrainId, minimumCount, random) {
            const definition = C.TERRITORY_TYPES[terrainId];
            if (!definition) return;
            const currentCount = territories.filter((territory) => territory.terrain === terrainId).length;
            const missingCount = Math.max(0, minimumCount - currentCount);
            if (!missingCount) return;

            const candidates = C.Geometry.shuffle(territories.filter((territory) =>
                !territory.isImpassable && !territory.isChokePoint && territory.terrain !== terrainId), random)
                .sort((first, second) => Number(second.terrain === "plain") - Number(first.terrain === "plain"));
            candidates.slice(0, missingCount).forEach((territory) => {
                territory.terrain = definition.id;
                territory.resource = definition.resource;
            });
        }

        createNames(count, random) {
            const combinations = [];
            FIRST_NAMES.forEach((first) => LAST_NAMES.forEach((last) => combinations.push(`${first} ${last}`)));
            return C.Geometry.shuffle(combinations, random).slice(0, count);
        }
    }

    C.MapGenerator = MapGenerator;
})(window.Conquest = window.Conquest || {});
