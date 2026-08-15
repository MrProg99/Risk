(function (C) {
    "use strict";

    class MapRenderer {
        constructor(canvas, game) {
            this.canvas = canvas;
            this.context = canvas.getContext("2d");
            this.game = game;
            this.selectedTerritoryId = null;
            this.targetTerritoryId = null;
            this.plannedRoute = [];
            this.hoveredTerritoryId = null;
            this.transferPreview = null;
            this.capturePulses = [];
            this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
            this.minZoom = 0.42;
            this.maxZoom = 1.6;
            this.zoom = 0.72;
            this.cameraX = game.state.mapWidth / 2;
            this.cameraY = game.state.mapHeight / 2;
            this.viewScale = 1;
            this.offsetX = 0;
            this.offsetY = 0;
            this.resizeObserver = new ResizeObserver(() => this.resize());
            this.resizeObserver.observe(canvas);
            this.resize();
        }

        resize() {
            const rect = this.canvas.getBoundingClientRect();
            const width = Math.max(1, Math.round(rect.width * this.pixelRatio));
            const height = Math.max(1, Math.round(rect.height * this.pixelRatio));
            if (this.canvas.width !== width || this.canvas.height !== height) {
                this.canvas.width = width;
                this.canvas.height = height;
            }
            this.updateViewTransform();
        }

        updateViewTransform() {
            this.viewScale = this.zoom * this.pixelRatio;
            this.clampCamera();
            this.offsetX = this.canvas.width / 2 - this.cameraX * this.viewScale;
            this.offsetY = this.canvas.height / 2 - this.cameraY * this.viewScale;
        }

        clampCamera() {
            const state = this.game.state;
            const halfWidth = this.canvas.width / (2 * this.viewScale);
            const halfHeight = this.canvas.height / (2 * this.viewScale);
            this.cameraX = halfWidth >= state.mapWidth / 2
                ? state.mapWidth / 2
                : C.Geometry.clamp(this.cameraX, halfWidth, state.mapWidth - halfWidth);
            this.cameraY = halfHeight >= state.mapHeight / 2
                ? state.mapHeight / 2
                : C.Geometry.clamp(this.cameraY, halfHeight, state.mapHeight - halfHeight);
        }

        resetCamera(zoom = 0.72) {
            this.zoom = C.Geometry.clamp(zoom, this.minZoom, this.maxZoom);
            this.cameraX = this.game.state.mapWidth / 2;
            this.cameraY = this.game.state.mapHeight / 2;
            this.updateViewTransform();
        }

        focusTerritory(territoryId, zoom = null) {
            const territory = this.game.state.getTerritory(territoryId);
            if (!territory) return;
            if (zoom !== null) this.zoom = C.Geometry.clamp(zoom, this.minZoom, this.maxZoom);
            this.cameraX = territory.center.x;
            this.cameraY = territory.center.y;
            this.updateViewTransform();
        }

        panByScreenDelta(deltaX, deltaY) {
            this.cameraX -= deltaX / this.zoom;
            this.cameraY -= deltaY / this.zoom;
            this.updateViewTransform();
        }

        zoomAt(clientX, clientY, factor) {
            const worldBeforeZoom = this.screenToWorld(clientX, clientY);
            const nextZoom = C.Geometry.clamp(this.zoom * factor, this.minZoom, this.maxZoom);
            if (Math.abs(nextZoom - this.zoom) < 0.0001) return;
            this.zoom = nextZoom;
            this.viewScale = this.zoom * this.pixelRatio;

            const rect = this.canvas.getBoundingClientRect();
            const physicalX = (clientX - rect.left) * this.pixelRatio;
            const physicalY = (clientY - rect.top) * this.pixelRatio;
            this.cameraX = worldBeforeZoom.x - (physicalX - this.canvas.width / 2) / this.viewScale;
            this.cameraY = worldBeforeZoom.y - (physicalY - this.canvas.height / 2) / this.viewScale;
            this.updateViewTransform();
        }

        zoomBy(factor) {
            const rect = this.canvas.getBoundingClientRect();
            this.zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
        }

        getZoomPercent() {
            return Math.round(this.zoom * 100);
        }

        render(now = performance.now()) {
            const ctx = this.context;
            const state = this.game.state;
            if (!state.territories.length) return;
            this.resize();
            this.drawOcean(ctx);
            ctx.save();
            ctx.setTransform(this.viewScale, 0, 0, this.viewScale, this.offsetX, this.offsetY);
            this.drawIslandShadow(ctx, state);
            this.drawTerritories(ctx, state, now);
            this.drawReinforcementRoutes(ctx, state, now);
            this.drawSelection(ctx, state, now);
            this.drawMountainBarriers(ctx, state);
            this.drawTerritoryMarkers(ctx, state);
            this.drawArmies(ctx, state, now);
            this.drawTransferPreview(ctx, state, now);
            this.drawCapturePulses(ctx, now);
            ctx.restore();
        }

        drawOcean(ctx) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            const gradient = ctx.createRadialGradient(
                this.canvas.width * 0.48, this.canvas.height * 0.46, 20,
                this.canvas.width * 0.48, this.canvas.height * 0.46, this.canvas.width * 0.68
            );
            gradient.addColorStop(0, "#102a34");
            gradient.addColorStop(0.55, "#091c25");
            gradient.addColorStop(1, "#061219");
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            const spacing = 24 * this.pixelRatio;
            ctx.fillStyle = "rgba(137, 195, 203, 0.055)";
            for (let y = spacing / 2; y < this.canvas.height; y += spacing) {
                for (let x = spacing / 2; x < this.canvas.width; x += spacing) {
                    ctx.fillRect(Math.round(x), Math.round(y), 1.2 * this.pixelRatio, 1.2 * this.pixelRatio);
                }
            }

            ctx.strokeStyle = "rgba(82, 151, 162, 0.045)";
            ctx.lineWidth = this.pixelRatio;
            for (let band = 0; band < 5; band += 1) {
                const y = this.canvas.height * (0.18 + band * 0.17);
                ctx.beginPath();
                for (let x = 0; x <= this.canvas.width; x += 30 * this.pixelRatio) {
                    const wave = Math.sin(x / (80 * this.pixelRatio) + band) * 5 * this.pixelRatio;
                    if (x === 0) ctx.moveTo(x, y + wave);
                    else ctx.lineTo(x, y + wave);
                }
                ctx.stroke();
            }
        }

        drawIslandShadow(ctx, state) {
            this.tracePolygon(ctx, state.islandPolygon);
            ctx.save();
            ctx.shadowColor = "rgba(0, 0, 0, 0.72)";
            ctx.shadowBlur = 34;
            ctx.shadowOffsetY = 18;
            ctx.fillStyle = "#0a1418";
            ctx.fill();
            ctx.restore();
            this.tracePolygon(ctx, state.islandPolygon);
            ctx.fillStyle = "#19272b";
            ctx.fill();
        }

        drawTerritories(ctx, state) {
            state.territories.forEach((territory) => {
                const type = C.TERRITORY_TYPES[territory.terrain];
                const faction = state.getFaction(territory.ownerId);
                const ownerColor = faction ? faction.color : "#53636a";
                const terrainMix = faction ? 0.24 : 0.34;
                const fill = C.Geometry.mixColors(ownerColor, type.color, terrainMix);

                this.tracePolygon(ctx, territory.polygon);
                ctx.fillStyle = fill;
                ctx.fill();

                this.tracePolygon(ctx, territory.polygon);
                ctx.fillStyle = territory.ownerId === null ? "rgba(7, 18, 23, .28)" : "rgba(7, 17, 20, .12)";
                ctx.fill();

                if (territory.id === this.hoveredTerritoryId) {
                    this.tracePolygon(ctx, territory.polygon);
                    ctx.fillStyle = "rgba(235, 255, 245, .10)";
                    ctx.fill();
                }

                this.tracePolygon(ctx, territory.polygon);
                ctx.strokeStyle = "rgba(4, 12, 15, .72)";
                ctx.lineWidth = 2.1;
                ctx.lineJoin = "round";
                ctx.stroke();

                this.tracePolygon(ctx, territory.polygon);
                ctx.strokeStyle = "rgba(196, 222, 222, .13)";
                ctx.lineWidth = 0.8;
                ctx.stroke();
            });

            this.tracePolygon(ctx, state.islandPolygon);
            ctx.strokeStyle = "rgba(189, 226, 220, .32)";
            ctx.lineWidth = 3;
            ctx.shadowColor = "rgba(74, 201, 190, .2)";
            ctx.shadowBlur = 8;
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        drawSelection(ctx, state, now) {
            const selected = state.getTerritory(this.selectedTerritoryId);
            if (!selected) return;

            selected.neighbors.forEach((id) => {
                const neighbor = state.getTerritory(id);
                if (!neighbor || neighbor.id === this.targetTerritoryId) return;
                if (selected.isPathBlocked(neighbor.id)) return;
                this.tracePolygon(ctx, neighbor.polygon);
                ctx.strokeStyle = neighbor.ownerId === selected.ownerId
                    ? "rgba(115, 224, 205, .5)"
                    : "rgba(255, 188, 123, .48)";
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 6]);
                ctx.stroke();
                ctx.setLineDash([]);
            });

            const pulse = (Math.sin(now / 240) + 1) / 2;
            this.tracePolygon(ctx, selected.polygon);
            ctx.strokeStyle = `rgba(222, 255, 126, ${0.72 + pulse * 0.25})`;
            ctx.lineWidth = 4;
            ctx.shadowColor = "rgba(216, 255, 104, .62)";
            ctx.shadowBlur = 8 + pulse * 7;
            ctx.stroke();
            ctx.shadowBlur = 0;

            const target = state.getTerritory(this.targetTerritoryId);
            if (target) {
                ctx.save();
                ctx.beginPath();
                const route = this.plannedRoute.length > 1
                    ? this.plannedRoute.map((id) => state.getTerritory(id)).filter(Boolean)
                    : [selected, target];
                ctx.moveTo(route[0].center.x, route[0].center.y);
                for (let index = 1; index < route.length; index += 1) {
                    ctx.lineTo(route[index].center.x, route[index].center.y);
                }
                const isConvoy = this.plannedRoute.length > 1;
                ctx.strokeStyle = isConvoy ? "rgba(78, 215, 208, .9)" : "rgba(255, 104, 95, .75)";
                ctx.lineWidth = isConvoy ? 3 : 2;
                ctx.setLineDash([8, 7]);
                ctx.lineDashOffset = -(now / 70) % 15;
                ctx.stroke();
                ctx.restore();

                this.tracePolygon(ctx, target.polygon);
                ctx.strokeStyle = this.plannedRoute.length > 1 ? "rgba(78, 215, 208, .98)" : "rgba(255, 118, 108, .98)";
                ctx.lineWidth = 4;
                ctx.shadowColor = this.plannedRoute.length > 1 ? "rgba(78, 215, 208, .65)" : "rgba(255, 104, 95, .65)";
                ctx.shadowBlur = 12;
                ctx.stroke();
                ctx.shadowBlur = 0;
            }
        }

        drawReinforcementRoutes(ctx, state, now) {
            state.reinforcementRoutes.filter((route) => route.active).forEach((route) => {
                const path = route.path.map((territoryId) => state.getTerritory(territoryId)).filter(Boolean);
                if (path.length < 2) return;
                const faction = state.getFaction(route.ownerId);
                const color = route.isPaused ? "#b4a37d" : faction.color;

                ctx.save();
                ctx.beginPath();
                ctx.moveTo(path[0].center.x, path[0].center.y);
                for (let index = 1; index < path.length; index += 1) {
                    ctx.lineTo(path[index].center.x, path[index].center.y);
                }
                ctx.strokeStyle = C.Geometry.rgba(color, route.isPaused ? .42 : .56);
                ctx.lineWidth = 5;
                ctx.setLineDash(route.isPaused ? [3, 10] : [10, 7]);
                ctx.lineDashOffset = route.isPaused ? 0 : -(now / 65) % 17;
                ctx.stroke();
                ctx.setLineDash([]);

                [path[0], path[path.length - 1]].forEach((territory, index) => {
                    ctx.beginPath();
                    ctx.arc(territory.center.x, territory.center.y, 22 + index * 2, 0, Math.PI * 2);
                    ctx.strokeStyle = C.Geometry.rgba(color, .72);
                    ctx.lineWidth = 2;
                    ctx.stroke();
                });
                ctx.restore();
            });
        }

        drawMountainBarriers(ctx, state) {
            state.territories.forEach((territory) => {
                territory.blockedNeighbors.forEach((neighborId) => {
                    if (territory.id >= neighborId) return;
                    const neighbor = state.getTerritory(neighborId);
                    if (!neighbor) return;
                    const segment = C.Geometry.sharedEdgeSegment(territory.polygon, neighbor.polygon);
                    if (!segment) return;

                    const dx = segment.end.x - segment.start.x;
                    const dy = segment.end.y - segment.start.y;
                    const length = Math.hypot(dx, dy);
                    const ux = dx / length;
                    const uy = dy / length;
                    const nx = -uy;
                    const ny = ux;

                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(segment.start.x, segment.start.y);
                    ctx.lineTo(segment.end.x, segment.end.y);
                    ctx.strokeStyle = "rgba(7, 12, 14, .92)";
                    ctx.lineWidth = 11;
                    ctx.lineCap = "round";
                    ctx.stroke();

                    const peakCount = Math.max(2, Math.floor(length / 18));
                    for (let index = 0; index < peakCount; index += 1) {
                        const t = (index + 0.5) / peakCount;
                        const centerX = C.Geometry.lerp(segment.start.x, segment.end.x, t);
                        const centerY = C.Geometry.lerp(segment.start.y, segment.end.y, t);
                        const halfBase = Math.min(7.5, length / peakCount * 0.42);
                        const direction = index % 2 === 0 ? 1 : -1;
                        const height = 8.5 + (index % 3) * 1.5;

                        ctx.beginPath();
                        ctx.moveTo(centerX - ux * halfBase, centerY - uy * halfBase);
                        ctx.lineTo(centerX + nx * height * direction, centerY + ny * height * direction);
                        ctx.lineTo(centerX + ux * halfBase, centerY + uy * halfBase);
                        ctx.closePath();
                        ctx.fillStyle = index % 2 === 0 ? "#aeb9b4" : "#7f8d89";
                        ctx.fill();
                        ctx.strokeStyle = "rgba(224, 233, 228, .75)";
                        ctx.lineWidth = 1;
                        ctx.stroke();
                    }
                    ctx.restore();
                });
            });
        }

        drawTerritoryMarkers(ctx, state) {
            state.territories.forEach((territory) => {
                const faction = state.getFaction(territory.ownerId);
                const type = C.TERRITORY_TYPES[territory.terrain];
                const center = territory.center;

                if (territory.rareSite) {
                    ctx.beginPath();
                    ctx.arc(center.x, center.y - 26, 11, 0, Math.PI * 2);
                    ctx.fillStyle = "rgba(18, 22, 18, .88)";
                    ctx.fill();
                    ctx.strokeStyle = "rgba(244, 196, 90, .88)";
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                    ctx.fillStyle = "#f4c45a";
                    ctx.font = `700 ${territory.rareSite.icon.length > 1 ? 7 : 12}px ${territory.rareSite.icon.length > 1 ? "sans-serif" : "serif"}`;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(territory.rareSite.icon, center.x, center.y - 26.5);
                } else {
                    ctx.fillStyle = "rgba(229, 241, 237, .75)";
                    ctx.font = "13px Georgia, serif";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(type.icon, center.x, center.y - 22);
                }

                const label = String(territory.units);
                const radius = label.length > 2 ? 18 : 16;
                ctx.beginPath();
                ctx.arc(center.x, center.y + 1, radius, 0, Math.PI * 2);
                ctx.fillStyle = "rgba(5, 12, 15, .86)";
                ctx.fill();
                ctx.strokeStyle = faction ? C.Geometry.rgba(faction.accent, .78) : "rgba(191, 205, 207, .48)";
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.fillStyle = "#f1f6f4";
                ctx.font = `700 ${label.length > 2 ? 11 : 13}px ${getComputedStyle(document.documentElement).getPropertyValue("--mono")}`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(label, center.x, center.y + 1.5);

                if (territory.ownerId !== null) {
                    const progress = C.Geometry.clamp(territory.productionProgress, 0, 1);
                    ctx.beginPath();
                    ctx.arc(center.x, center.y + 1, radius + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
                    ctx.strokeStyle = faction ? C.Geometry.rgba(faction.color, .82) : "rgba(216,255,104,.65)";
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            });
        }

        drawArmies(ctx, state, now) {
            state.armies.forEach((army) => {
                const faction = state.getFaction(army.ownerId);
                const progress = army.progress;
                const x = C.Geometry.lerp(army.start.x, army.end.x, progress);
                const y = C.Geometry.lerp(army.start.y, army.end.y, progress);
                const angle = Math.atan2(army.end.y - army.start.y, army.end.x - army.start.x);

                ctx.save();
                if (army.route.length) {
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(army.end.x, army.end.y);
                    army.route.forEach((territoryId) => {
                        const stop = state.getTerritory(territoryId);
                        if (stop) ctx.lineTo(stop.center.x, stop.center.y);
                    });
                    ctx.strokeStyle = C.Geometry.rgba(faction.color, .22);
                    ctx.lineWidth = 3;
                    ctx.setLineDash([3, 8]);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
                ctx.beginPath();
                ctx.moveTo(army.start.x, army.start.y);
                ctx.lineTo(army.end.x, army.end.y);
                ctx.strokeStyle = C.Geometry.rgba(faction.color, .42);
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 6]);
                ctx.lineDashOffset = -(now / 55) % 11;
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.translate(x, y);
                ctx.rotate(angle);
                ctx.beginPath();
                ctx.moveTo(14, 0);
                ctx.lineTo(-8, -9);
                ctx.lineTo(-5, 0);
                ctx.lineTo(-8, 9);
                ctx.closePath();
                ctx.fillStyle = faction.color;
                ctx.shadowColor = faction.color;
                ctx.shadowBlur = 12;
                ctx.fill();
                ctx.shadowBlur = 0;
                ctx.rotate(-angle);

                ctx.fillStyle = "rgba(4, 10, 13, .9)";
                ctx.fillRect(-12, 12, 24, 15);
                ctx.fillStyle = "#fff";
                ctx.font = "700 10px sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(String(army.units), 0, 20);
                ctx.restore();
            });
        }

        drawTransferPreview(ctx, state, now) {
            if (!this.transferPreview) return;
            const source = state.getTerritory(this.transferPreview.fromTerritoryId);
            if (!source) return;

            const isContinuous = this.transferPreview.mode === "continuous";
            const target = state.getTerritory(this.transferPreview.targetTerritoryId);
            const hasDestination = Boolean(target && target.id !== source.id);
            const isAlliedDestination = hasDestination &&
                source.ownerId === this.game.playerId &&
                target.ownerId === this.game.playerId;
            const path = isAlliedDestination
                ? this.game.findOwnedPath(this.game.playerId, source.id, target.id)
                : null;
            const units = source.units > 1
                ? Math.max(1, Math.floor((source.units - 1) * 0.5))
                : 0;
            const isValid = Boolean(path && path.length > 1 && (isContinuous || units > 0));
            const color = !hasDestination
                ? isContinuous ? "#8beee8" : "#7ae8df"
                : isValid
                    ? isContinuous ? "#4ed7d0" : "#d8ff68"
                    : "#ff766d";
            const route = path
                ? path.map((territoryId) => state.getTerritory(territoryId)).filter(Boolean)
                : [source, target || { center: this.transferPreview.pointer }];
            const end = route[route.length - 1].center;

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(route[0].center.x, route[0].center.y);
            for (let index = 1; index < route.length; index += 1) {
                ctx.lineTo(route[index].center.x, route[index].center.y);
            }
            ctx.strokeStyle = C.Geometry.rgba(color, .92);
            ctx.lineWidth = 4;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.setLineDash([11, 7]);
            ctx.lineDashOffset = -(now / 55) % 18;
            ctx.shadowColor = C.Geometry.rgba(color, .55);
            ctx.shadowBlur = 10;
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.shadowBlur = 0;

            if (route.length > 1) {
                const beforeEnd = route[route.length - 2].center;
                const angle = Math.atan2(end.y - beforeEnd.y, end.x - beforeEnd.x);
                ctx.save();
                ctx.translate(end.x, end.y);
                ctx.rotate(angle);
                ctx.beginPath();
                ctx.moveTo(18, 0);
                ctx.lineTo(-7, -10);
                ctx.lineTo(-3, 0);
                ctx.lineTo(-7, 10);
                ctx.closePath();
                ctx.fillStyle = color;
                ctx.fill();
                ctx.restore();
            }

            if (hasDestination) {
                this.tracePolygon(ctx, target.polygon);
                ctx.strokeStyle = C.Geometry.rgba(color, .96);
                ctx.lineWidth = 4;
                ctx.stroke();
            }

            const label = !hasDestination
                ? isContinuous ? "ALT · FLUX CONTINU" : "CTRL · TRANSFERT"
                : isValid
                    ? isContinuous ? "FLUX CONTINU" : `${units} UNITÉ${units > 1 ? "S" : ""}`
                    : !isContinuous && units < 1
                        ? "AUCUNE UNITÉ DISPONIBLE"
                        : "DESTINATION INVALIDE";
            ctx.font = "700 12px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            const labelWidth = ctx.measureText(label).width + 18;
            const labelX = end.x;
            const labelY = end.y - 35;
            ctx.fillStyle = "rgba(4, 13, 16, .9)";
            ctx.fillRect(labelX - labelWidth / 2, labelY - 12, labelWidth, 24);
            ctx.strokeStyle = C.Geometry.rgba(color, .78);
            ctx.lineWidth = 1;
            ctx.strokeRect(labelX - labelWidth / 2, labelY - 12, labelWidth, 24);
            ctx.fillStyle = color;
            ctx.fillText(label, labelX, labelY + 1);
            ctx.restore();
        }

        drawCapturePulses(ctx, now) {
            this.capturePulses = this.capturePulses.filter((pulse) => now - pulse.startedAt < 1200);
            this.capturePulses.forEach((pulse) => {
                const progress = (now - pulse.startedAt) / 1200;
                ctx.beginPath();
                ctx.arc(pulse.center.x, pulse.center.y, 20 + progress * 75, 0, Math.PI * 2);
                ctx.strokeStyle = C.Geometry.rgba(pulse.color, 1 - progress);
                ctx.lineWidth = 4 * (1 - progress) + 1;
                ctx.stroke();
            });
        }

        tracePolygon(ctx, polygon) {
            if (!polygon || !polygon.length) return;
            ctx.beginPath();
            ctx.moveTo(polygon[0].x, polygon[0].y);
            for (let index = 1; index < polygon.length; index += 1) {
                ctx.lineTo(polygon[index].x, polygon[index].y);
            }
            ctx.closePath();
        }

        screenToWorld(clientX, clientY) {
            const rect = this.canvas.getBoundingClientRect();
            const physicalX = (clientX - rect.left) * this.pixelRatio;
            const physicalY = (clientY - rect.top) * this.pixelRatio;
            return {
                x: (physicalX - this.offsetX) / this.viewScale,
                y: (physicalY - this.offsetY) / this.viewScale
            };
        }

        getTerritoryAt(clientX, clientY) {
            const point = this.screenToWorld(clientX, clientY);
            for (let index = this.game.state.territories.length - 1; index >= 0; index -= 1) {
                const territory = this.game.state.territories[index];
                if (C.Geometry.pointInPolygon(point, territory.polygon)) return territory;
            }
            return null;
        }

        setSelection(selectedTerritoryId, targetTerritoryId = null, plannedRoute = []) {
            this.selectedTerritoryId = selectedTerritoryId;
            this.targetTerritoryId = targetTerritoryId;
            this.plannedRoute = plannedRoute.slice();
        }

        setHovered(territoryId) {
            this.hoveredTerritoryId = territoryId;
        }

        setTransferPreview(fromTerritoryId, clientX, clientY, targetTerritoryId = null, mode = "quick") {
            this.transferPreview = {
                fromTerritoryId,
                targetTerritoryId,
                mode,
                pointer: this.screenToWorld(clientX, clientY)
            };
        }

        clearTransferPreview() {
            this.transferPreview = null;
        }

        pulseTerritory(territoryId, color) {
            const territory = this.game.state.getTerritory(territoryId);
            if (territory) this.capturePulses.push({ center: { ...territory.center }, color, startedAt: performance.now() });
        }
    }

    C.MapRenderer = MapRenderer;
})(window.Conquest = window.Conquest || {});
