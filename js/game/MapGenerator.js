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
        constructor(width = 1200, height = 760) {
            this.width = width;
            this.height = height;
        }

        generate(seed, requestedCount) {
            const random = C.Geometry.seededRandom(seed);
            const territoryCount = requestedCount || C.Geometry.randomInt(random, 110, 120);
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
            this.createLakes(territories, random);
            this.createMountainBarriers(territories, random);
            return { islandPolygon, territories };
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
            const targetCount = C.Geometry.randomInt(random, 4, 6);
            const mapCenter = { x: this.width / 2, y: this.height / 2 };
            const names = C.Geometry.shuffle(LAKE_NAMES, random);
            const candidates = C.Geometry.shuffle(territories.filter((territory) =>
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

            const targetCount = C.Geometry.clamp(Math.round(edges.length * 0.14), 26, 44);
            const minimumOpenBorders = 2;
            let placed = 0;
            for (const edge of candidates) {
                edge.first.blockedNeighbors.push(edge.second.id);
                edge.second.blockedNeighbors.push(edge.first.id);

                const firstStillOpenEnough = this.countOpenBorders(edge.first, territories) >= minimumOpenBorders;
                const secondStillOpenEnough = this.countOpenBorders(edge.second, territories) >= minimumOpenBorders;

                if (!firstStillOpenEnough || !secondStillOpenEnough || !this.isTraversableGraphConnected(territories)) {
                    edge.first.blockedNeighbors.pop();
                    edge.second.blockedNeighbors.pop();
                    continue;
                }

                placed += 1;
                if (placed >= targetCount) break;
            }
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

        createNames(count, random) {
            const combinations = [];
            FIRST_NAMES.forEach((first) => LAST_NAMES.forEach((last) => combinations.push(`${first} ${last}`)));
            return C.Geometry.shuffle(combinations, random).slice(0, count);
        }
    }

    C.MapGenerator = MapGenerator;
})(window.Conquest = window.Conquest || {});