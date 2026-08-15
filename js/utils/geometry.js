(function (C) {
    "use strict";

    const Geometry = {
        clamp(value, min, max) {
            return Math.max(min, Math.min(max, value));
        },

        lerp(a, b, t) {
            return a + (b - a) * t;
        },

        distance(a, b) {
            return Math.hypot(a.x - b.x, a.y - b.y);
        },

        squaredDistance(a, b) {
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            return dx * dx + dy * dy;
        },

        seededRandom(seed) {
            let value = seed >>> 0;
            return function random() {
                value += 0x6D2B79F5;
                let t = value;
                t = Math.imul(t ^ (t >>> 15), t | 1);
                t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
        },

        randomInt(random, min, max) {
            return Math.floor(random() * (max - min + 1)) + min;
        },

        shuffle(items, random) {
            const result = items.slice();
            for (let index = result.length - 1; index > 0; index -= 1) {
                const other = Math.floor(random() * (index + 1));
                [result[index], result[other]] = [result[other], result[index]];
            }
            return result;
        },

        pointInPolygon(point, polygon) {
            let inside = false;
            for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                const a = polygon[i];
                const b = polygon[j];
                const intersects = ((a.y > point.y) !== (b.y > point.y)) &&
                    (point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || Number.EPSILON) + a.x);
                if (intersects) inside = !inside;
            }
            return inside;
        },

        polygonCentroid(polygon) {
            let signedArea = 0;
            let x = 0;
            let y = 0;

            for (let index = 0; index < polygon.length; index += 1) {
                const current = polygon[index];
                const next = polygon[(index + 1) % polygon.length];
                const cross = current.x * next.y - next.x * current.y;
                signedArea += cross;
                x += (current.x + next.x) * cross;
                y += (current.y + next.y) * cross;
            }

            signedArea *= 0.5;
            if (Math.abs(signedArea) < 0.00001) {
                const sum = polygon.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
                return { x: sum.x / polygon.length, y: sum.y / polygon.length };
            }

            return { x: x / (6 * signedArea), y: y / (6 * signedArea) };
        },

        convexHull(points) {
            if (points.length <= 3) return points.slice();
            const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
            const cross = (origin, a, b) => (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
            const lower = [];
            const upper = [];

            sorted.forEach((point) => {
                while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
                lower.push(point);
            });
            for (let index = sorted.length - 1; index >= 0; index -= 1) {
                const point = sorted[index];
                while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
                upper.push(point);
            }
            lower.pop();
            upper.pop();
            return lower.concat(upper);
        },

        clipPolygonWithHalfPlane(polygon, normalX, normalY, limit) {
            if (!polygon.length) return [];
            const result = [];
            const isInside = (point) => point.x * normalX + point.y * normalY <= limit + 0.00001;

            for (let index = 0; index < polygon.length; index += 1) {
                const current = polygon[index];
                const previous = polygon[(index + polygon.length - 1) % polygon.length];
                const currentInside = isInside(current);
                const previousInside = isInside(previous);

                if (currentInside !== previousInside) {
                    const dx = current.x - previous.x;
                    const dy = current.y - previous.y;
                    const denominator = dx * normalX + dy * normalY;
                    if (Math.abs(denominator) > 0.0000001) {
                        const t = (limit - previous.x * normalX - previous.y * normalY) / denominator;
                        result.push({ x: previous.x + dx * t, y: previous.y + dy * t });
                    }
                }
                if (currentInside) result.push({ x: current.x, y: current.y });
            }
            return result;
        },

        sharedEdgeSegment(polygonA, polygonB, tolerance = 0.65) {
            let longestSegment = null;
            for (let aIndex = 0; aIndex < polygonA.length; aIndex += 1) {
                const a1 = polygonA[aIndex];
                const a2 = polygonA[(aIndex + 1) % polygonA.length];
                const length = this.distance(a1, a2);
                if (length < 1) continue;
                const ux = (a2.x - a1.x) / length;
                const uy = (a2.y - a1.y) / length;

                for (let bIndex = 0; bIndex < polygonB.length; bIndex += 1) {
                    const b1 = polygonB[bIndex];
                    const b2 = polygonB[(bIndex + 1) % polygonB.length];
                    const perpendicular1 = Math.abs((b1.x - a1.x) * uy - (b1.y - a1.y) * ux);
                    const perpendicular2 = Math.abs((b2.x - a1.x) * uy - (b2.y - a1.y) * ux);
                    if (perpendicular1 > tolerance || perpendicular2 > tolerance) continue;

                    const projection1 = (b1.x - a1.x) * ux + (b1.y - a1.y) * uy;
                    const projection2 = (b2.x - a1.x) * ux + (b2.y - a1.y) * uy;
                    const overlap = Math.min(length, Math.max(projection1, projection2)) - Math.max(0, Math.min(projection1, projection2));
                    if (overlap > 1.5 && (!longestSegment || overlap > longestSegment.length)) {
                        const startProjection = Math.max(0, Math.min(projection1, projection2));
                        const endProjection = Math.min(length, Math.max(projection1, projection2));
                        longestSegment = {
                            start: { x: a1.x + ux * startProjection, y: a1.y + uy * startProjection },
                            end: { x: a1.x + ux * endProjection, y: a1.y + uy * endProjection },
                            length: overlap
                        };
                    }
                }
            }
            return longestSegment;
        },

        sharedEdgeLength(polygonA, polygonB, tolerance = 0.65) {
            const segment = this.sharedEdgeSegment(polygonA, polygonB, tolerance);
            return segment ? segment.length : 0;
        },

        rgba(hex, alpha) {
            const normalized = hex.replace("#", "");
            const value = parseInt(normalized.length === 3
                ? normalized.split("").map((char) => char + char).join("")
                : normalized, 16);
            const red = (value >> 16) & 255;
            const green = (value >> 8) & 255;
            const blue = value & 255;
            return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
        },

        mixColors(hexA, hexB, amount = 0.5) {
            const parse = (hex) => {
                const value = parseInt(hex.replace("#", ""), 16);
                return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
            };
            const a = parse(hexA);
            const b = parse(hexB);
            const mixed = a.map((channel, index) => Math.round(this.lerp(channel, b[index], amount)));
            return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
        }
    };

    C.Geometry = Geometry;
})(window.Conquest = window.Conquest || {});
