(function (C) {
    "use strict";

    class MapRenderer {
        constructor(canvas, game) {
            this.canvas = canvas;
            this.context = canvas.getContext("2d");
            this.game = game;
            this.selectedTerritoryId = null;
            this.multiSelectedTerritoryIds = [];
            this.targetTerritoryId = null;
            this.plannedRoute = [];
            this.hoveredTerritoryId = null;
            this.transferPreview = null;
            this.cannonShots = [];
            this.capturePulses = [];
            this.visibilityMap = new Map();
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
            this.visibilityMap = this.game.getTerritoryVisibilityMap(this.game.playerId);
            this.resize();
            this.drawOcean(ctx);
            ctx.save();
            ctx.setTransform(this.viewScale, 0, 0, this.viewScale, this.offsetX, this.offsetY);
            this.drawIslandShadow(ctx, state);
            this.drawTerritories(ctx, state, now);
            this.drawLakeSurfaces(ctx, state, now);
            this.drawFogOfWar(ctx, state, now);
            this.drawReinforcementRoutes(ctx, state, now);
            this.drawSelection(ctx, state, now);
            this.drawMountainBarriers(ctx, state);
            this.drawTerritoryMarkers(ctx, state);
            this.drawWorldEvents(ctx, state, now);
            this.drawCannonInstallations(ctx, state, now);
            this.drawArmies(ctx, state, now);
            this.drawAbilityActions(ctx, state, now);
            this.drawCannonShots(ctx, now);
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
                const isVisible = this.isTerritoryVisible(territory.id);
                const fill = !isVisible && !territory.isImpassable
                    ? "#172327"
                    : territory.isImpassable
                    ? C.Geometry.mixColors("#092c39", type.color, 0.72)
                    : C.Geometry.mixColors(ownerColor, type.color, terrainMix);

                this.tracePolygon(ctx, territory.polygon);
                ctx.fillStyle = fill;
                ctx.fill();

                this.tracePolygon(ctx, territory.polygon);
                ctx.fillStyle = !isVisible && !territory.isImpassable
                    ? "rgba(7, 17, 20, .18)"
                    : territory.isImpassable
                    ? "rgba(27, 112, 132, .13)"
                    : territory.ownerId === null ? "rgba(7, 18, 23, .28)" : "rgba(7, 17, 20, .12)";
                ctx.fill();

                if (territory.id === this.hoveredTerritoryId && isVisible) {
                    this.tracePolygon(ctx, territory.polygon);
                    ctx.fillStyle = "rgba(235, 255, 245, .10)";
                    ctx.fill();
                }

                this.tracePolygon(ctx, territory.polygon);
                ctx.strokeStyle = territory.isImpassable ? "rgba(4, 26, 34, .92)" : "rgba(4, 12, 15, .72)";
                ctx.lineWidth = 2.1;
                ctx.lineJoin = "round";
                ctx.stroke();

                this.tracePolygon(ctx, territory.polygon);
                ctx.strokeStyle = territory.isImpassable ? "rgba(105, 210, 220, .34)" : "rgba(196, 222, 222, .13)";
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

        drawFogOfWar(ctx, state, now) {
            const outerRange = this.game.visibilityRange;
            state.territories.forEach((territory) => {
                if (territory.isImpassable) return;
                const distance = this.visibilityMap.get(territory.id);
                if (distance !== undefined && distance < outerRange) return;

                this.tracePolygon(ctx, territory.polygon);
                if (distance === outerRange) {
                    ctx.fillStyle = "rgba(4, 12, 16, .14)";
                    ctx.fill();
                    ctx.strokeStyle = "rgba(151, 205, 205, .12)";
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    return;
                }

                ctx.fillStyle = "rgba(2, 8, 12, .88)";
                ctx.fill();
                ctx.strokeStyle = "rgba(88, 119, 124, .2)";
                ctx.lineWidth = 1.2;
                ctx.stroke();

                const pulse = (Math.sin(now / 900 + territory.id * 0.7) + 1) / 2;
                ctx.fillStyle = `rgba(137, 167, 169, ${.16 + pulse * .08})`;
                ctx.font = "700 14px sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("?", territory.center.x, territory.center.y);
            });
        }

        drawLakeSurfaces(ctx, state, now) {
            state.territories.filter((territory) => territory.isImpassable).forEach((lake, lakeIndex) => {
                const center = lake.center;
                const shimmer = Math.sin(now / 850 + lakeIndex) * 3;
                ctx.save();
                this.tracePolygon(ctx, lake.polygon);
                ctx.clip();
                ctx.lineWidth = 1.4;
                ctx.strokeStyle = "rgba(116, 220, 226, .24)";
                for (let row = -2; row <= 2; row += 1) {
                    const y = center.y + row * 12 + shimmer;
                    ctx.beginPath();
                    for (let x = center.x - 54; x <= center.x + 54; x += 6) {
                        const waveY = y + Math.sin((x + now * 0.025) / 14 + row) * 2.2;
                        if (x === center.x - 54) ctx.moveTo(x, waveY);
                        else ctx.lineTo(x, waveY);
                    }
                    ctx.stroke();
                }
                ctx.restore();
            });
        }

        drawSelection(ctx, state, now) {
            const selected = state.getTerritory(this.selectedTerritoryId);
            if (!selected) return;

            const groupedTerritories = this.multiSelectedTerritoryIds
                .map((territoryId) => state.getTerritory(territoryId))
                .filter((territory) => territory && this.isTerritoryVisible(territory.id));
            if (groupedTerritories.length > 1) {
                const pulse = (Math.sin(now / 240) + 1) / 2;
                groupedTerritories.forEach((territory) => {
                    this.tracePolygon(ctx, territory.polygon);
                    ctx.strokeStyle = `rgba(208, 179, 255, ${0.76 + pulse * 0.22})`;
                    ctx.lineWidth = 4;
                    ctx.shadowColor = "rgba(181, 140, 255, .7)";
                    ctx.shadowBlur = 9 + pulse * 7;
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                });
                return;
            }

            if (!selected.isImpassable) {
                selected.neighbors.forEach((id) => {
                    const neighbor = state.getTerritory(id);
                    if (!neighbor || neighbor.id === this.targetTerritoryId) return;
                    if (!this.isTerritoryVisible(neighbor.id)) return;
                    if (neighbor.isImpassable) return;
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
            }

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
                if (route.ownerId !== this.game.playerId) return;
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

                [path[0]].forEach((territory) => {
                    const pulse = route.isPaused ? 0 : (Math.sin(now / 260) + 1) * 0.75;
                    const radius = 23 + pulse;

                    // Le contour sombre garantit la lisibilité même lorsque la
                    // couleur de faction est proche de celle du territoire.
                    ctx.beginPath();
                    ctx.arc(territory.center.x, territory.center.y, radius, 0, Math.PI * 2);
                    ctx.strokeStyle = "rgba(2, 9, 12, .94)";
                    ctx.lineWidth = 7;
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.arc(territory.center.x, territory.center.y, radius, 0, Math.PI * 2);
                    ctx.strokeStyle = route.isPaused ? "rgba(224, 207, 164, .9)" : "rgba(111, 255, 242, .98)";
                    ctx.lineWidth = 3;
                    ctx.shadowColor = route.isPaused ? "rgba(224, 207, 164, .35)" : "rgba(78, 215, 208, .82)";
                    ctx.shadowBlur = route.isPaused ? 4 : 9;
                    ctx.stroke();
                    ctx.shadowBlur = 0;
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

                if (territory.isImpassable) {
                    ctx.fillStyle = "rgba(167, 232, 232, .86)";
                    ctx.font = "700 19px Georgia, serif";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(type.icon, center.x, center.y - 1);
                    ctx.fillStyle = "rgba(187, 226, 226, .62)";
                    ctx.font = "600 7px sans-serif";
                    ctx.fillText("INFRANCHISSABLE", center.x, center.y + 14);
                    return;
                }

                if (!this.isTerritoryVisible(territory.id)) return;

                if (territory.isChokePoint) {
                    ctx.beginPath();
                    ctx.arc(center.x, center.y - 26, 11, 0, Math.PI * 2);
                    ctx.fillStyle = "rgba(22, 13, 28, .9)";
                    ctx.fill();
                    ctx.strokeStyle = "rgba(205, 150, 255, .9)";
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                    ctx.fillStyle = "#d7a6ff";
                    ctx.font = "700 12px Georgia, serif";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText("⌛", center.x, center.y - 26.5);
                } else if (territory.rareSite) {
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
                    ctx.font = "600 16px Georgia, serif";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(type.icon, center.x, center.y - 23.5);
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
                    const foodMode = territory.productionMode === "food";
                    const researchMode = territory.productionMode === "research";
                    const progress = foodMode || researchMode ? 1 : C.Geometry.clamp(territory.productionProgress, 0, 1);
                    ctx.beginPath();
                    ctx.arc(center.x, center.y + 1, radius + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
                    ctx.strokeStyle = foodMode
                        ? "rgba(158,215,122,.92)"
                        : researchMode
                            ? "rgba(181,140,255,.96)"
                            : faction ? C.Geometry.rgba(faction.color, .82) : "rgba(216,255,104,.65)";
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    if (foodMode) {
                        const foodX = center.x + radius + 7;
                        const foodY = center.y - radius + 1;
                        ctx.beginPath();
                        ctx.arc(foodX, foodY, 7, 0, Math.PI * 2);
                        ctx.fillStyle = "rgba(18,38,15,.94)";
                        ctx.fill();
                        ctx.strokeStyle = "#9ed77a";
                        ctx.lineWidth = 1;
                        ctx.stroke();
                        ctx.fillStyle = "#b9ef98";
                        ctx.font = "800 7px sans-serif";
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.fillText("F", foodX, foodY + 0.5);
                    } else if (researchMode) {
                        const researchX = center.x + radius + 7;
                        const researchY = center.y - radius + 1;
                        ctx.beginPath();
                        ctx.arc(researchX, researchY, 7, 0, Math.PI * 2);
                        ctx.fillStyle = "rgba(31,18,49,.95)";
                        ctx.fill();
                        ctx.strokeStyle = "#b58cff";
                        ctx.lineWidth = 1;
                        ctx.stroke();
                        ctx.fillStyle = "#d8beff";
                        ctx.font = "800 7px sans-serif";
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.fillText("R", researchX, researchY + 0.5);
                    }
                }

                if (territory.isCapital) {
                    const starX = center.x;
                    const starY = center.y + radius + 15;
                    ctx.beginPath();
                    ctx.arc(starX, starY, 10, 0, Math.PI * 2);
                    ctx.fillStyle = "rgba(18, 22, 18, .88)";
                    ctx.fill();
                    ctx.strokeStyle = C.Geometry.rgba(faction ? faction.accent : "#f4c45a", .9);
                    ctx.lineWidth = 1.5;
                    ctx.shadowColor = "rgba(244, 196, 90, .85)";
                    ctx.shadowBlur = 6;
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = "#f4c45a";
                    ctx.font = "700 12px Georgia, serif";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText("★", starX, starY + 0.5);
                }
            });
        }

        drawCannonInstallations(ctx, state, now) {
            const definition = C.INSTALLATION_TYPES.cannon;
            state.territories.forEach((territory) => {
                if (territory.installation?.type !== definition.id) return;
                if (!this.isTerritoryVisible(territory.id)) return;
                const faction = state.getFaction(territory.ownerId);
                const active = Boolean(faction);
                const x = territory.center.x + 25;
                const y = territory.center.y - 21;
                const pulse = active ? (Math.sin(now / 300) + 1) / 2 : 0;

                ctx.save();
                ctx.translate(x, y);
                ctx.beginPath();
                ctx.arc(0, 0, 11, 0, Math.PI * 2);
                ctx.fillStyle = "rgba(5, 12, 15, .93)";
                ctx.fill();
                ctx.strokeStyle = active ? C.Geometry.rgba(faction.accent, .88) : "rgba(190, 200, 194, .62)";
                ctx.lineWidth = 1.6;
                ctx.shadowColor = active ? faction.color : "transparent";
                ctx.shadowBlur = active ? 5 + pulse * 5 : 0;
                ctx.stroke();
                ctx.shadowBlur = 0;

                ctx.rotate(-Math.PI * 0.18);
                ctx.strokeStyle = active ? faction.accent : "#aeb8b3";
                ctx.lineWidth = 4;
                ctx.lineCap = "round";
                ctx.beginPath();
                ctx.moveTo(-2, -1);
                ctx.lineTo(11, -1);
                ctx.stroke();
                ctx.fillStyle = active ? faction.color : "#778681";
                ctx.fillRect(-7, -5, 9, 8);
                ctx.fillRect(-8, 4, 13, 3);
                ctx.restore();

                if (active) {
                    const progress = C.Geometry.clamp(territory.installationProgressMs / definition.fireIntervalMs, 0, 1);
                    ctx.beginPath();
                    ctx.arc(x, y, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
                    ctx.strokeStyle = C.Geometry.rgba(faction.accent, .72);
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                }
            });
        }

        drawWorldEvents(ctx, state, now) {
            state.worldEvents.forEach((worldEvent, eventIndex) => {
                const definition = C.WORLD_EVENT_DEFINITIONS[worldEvent.type];
                if (!definition) return;
                worldEvent.territoryIds.forEach((territoryId, targetIndex) => {
                    const territory = state.getTerritory(territoryId);
                    if (!territory) return;
                    if (!this.isTerritoryVisible(territory.id)) return;
                    const center = territory.center;
                    const pulse = (Math.sin(now / 230 + eventIndex + targetIndex) + 1) / 2;

                    if (worldEvent.type === "famine") {
                        const durationMs = Math.max(1, worldEvent.endsAtMs - worldEvent.startedAtMs);
                        const remainingRatio = C.Geometry.clamp((worldEvent.endsAtMs - state.elapsedMs) / durationMs, 0, 1);
                        const x = center.x - 26;
                        const y = center.y - 23;
                        ctx.beginPath();
                        ctx.arc(x, y, 12, 0, Math.PI * 2);
                        ctx.fillStyle = "rgba(29, 23, 13, .93)";
                        ctx.fill();
                        ctx.strokeStyle = C.Geometry.rgba(definition.color, .72);
                        ctx.lineWidth = 1.5;
                        ctx.stroke();
                        ctx.fillStyle = definition.color;
                        ctx.font = "700 14px Georgia, serif";
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.fillText(definition.icon, x, y + 0.5);
                        ctx.beginPath();
                        ctx.arc(x, y, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remainingRatio);
                        ctx.strokeStyle = C.Geometry.rgba(definition.color, .82);
                        ctx.lineWidth = 2;
                        ctx.stroke();
                        return;
                    }

                    if (worldEvent.type === "wildfire") {
                        ctx.save();
                        for (let flame = 0; flame < 8; flame += 1) {
                            const angle = flame * 2.2 + eventIndex;
                            const distance = 9 + (flame % 3) * 8;
                            const rise = ((now / 75 + flame * 7) % 22);
                            const x = center.x + Math.cos(angle) * distance;
                            const y = center.y + 18 - rise;
                            ctx.beginPath();
                            ctx.arc(x, y, 2.5 + (flame % 2), 0, Math.PI * 2);
                            ctx.fillStyle = flame % 2
                                ? `rgba(255, 194, 73, ${.38 + pulse * .35})`
                                : `rgba(255, 100, 51, ${.45 + pulse * .4})`;
                            ctx.shadowColor = definition.color;
                            ctx.shadowBlur = 8;
                            ctx.fill();
                        }
                        ctx.restore();
                        return;
                    }

                    if (worldEvent.type === "barbarianRaid") {
                        ctx.beginPath();
                        ctx.arc(center.x, center.y + 1, 28 + pulse * 7, 0, Math.PI * 2);
                        ctx.strokeStyle = C.Geometry.rgba(definition.color, .38 + pulse * .38);
                        ctx.lineWidth = 3;
                        ctx.setLineDash([5, 7]);
                        ctx.lineDashOffset = -(now / 55) % 12;
                        ctx.stroke();
                        ctx.setLineDash([]);
                    }
                });
            });
        }

        drawCannonShots(ctx, now) {
            const durationMs = 900;
            this.cannonShots = this.cannonShots.filter((shot) => now - shot.startedAt < durationMs);
            this.cannonShots.forEach((shot) => {
                const progress = C.Geometry.clamp((now - shot.startedAt) / durationMs, 0, 1);
                const previousProgress = Math.max(0, progress - 0.09);
                const positionAt = (value) => ({
                    x: C.Geometry.lerp(shot.start.x, shot.end.x, value),
                    y: C.Geometry.lerp(shot.start.y, shot.end.y, value) - Math.sin(value * Math.PI) * 58
                });
                const position = positionAt(progress);
                const previous = positionAt(previousProgress);

                ctx.save();
                ctx.beginPath();
                ctx.moveTo(previous.x, previous.y);
                ctx.lineTo(position.x, position.y);
                ctx.strokeStyle = C.Geometry.rgba(shot.color, .55);
                ctx.lineWidth = 3;
                ctx.lineCap = "round";
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(position.x, position.y, 3.8, 0, Math.PI * 2);
                ctx.fillStyle = "#fff5c2";
                ctx.shadowColor = shot.color;
                ctx.shadowBlur = 13;
                ctx.fill();
                ctx.shadowBlur = 0;

                if (progress > 0.72) {
                    const impactProgress = (progress - 0.72) / 0.28;
                    ctx.beginPath();
                    ctx.arc(shot.end.x, shot.end.y, 5 + impactProgress * 25, 0, Math.PI * 2);
                    ctx.strokeStyle = shot.hit
                        ? `rgba(255, 211, 112, ${1 - impactProgress})`
                        : `rgba(173, 190, 188, ${(1 - impactProgress) * .5})`;
                    ctx.lineWidth = shot.hit ? 4 : 2;
                    ctx.stroke();
                }
                ctx.restore();
            });
        }

        drawAbilityActions(ctx, state, now) {
            state.abilityActions.forEach((action) => {
                if (action.abilityId !== "missile" && action.abilityId !== "nuclear") return;
                const target = state.getTerritory(action.targetTerritoryId);
                if (!target || !this.game.isTerritoryVisible(target.id, this.game.playerId, this.visibilityMap)) return;
                if (action.abilityId === "nuclear" && action.resolvedAtMs != null) {
                    this.drawNuclearImpact(ctx, state, action, target);
                    return;
                }

                const remainingMs = Math.max(0, action.executeAtMs - state.elapsedMs);
                const nuclear = action.abilityId === "nuclear";
                const pulse = (Math.sin(now / (nuclear ? 80 : 105)) + 1) / 2;
                ctx.save();
                if (nuclear) {
                    target.neighbors.forEach((territoryId) => {
                        const neighbor = state.getTerritory(territoryId);
                        if (!neighbor || neighbor.isImpassable) return;
                        ctx.beginPath();
                        this.tracePolygon(ctx, neighbor.polygon);
                        ctx.fillStyle = `rgba(255, 143, 54, ${0.035 + pulse * 0.045})`;
                        ctx.fill();
                        ctx.strokeStyle = `rgba(255, 180, 72, ${0.25 + pulse * 0.22})`;
                        ctx.lineWidth = 2;
                        ctx.stroke();
                    });
                }
                ctx.beginPath();
                ctx.arc(target.center.x, target.center.y, (nuclear ? 42 : 34) + pulse * (nuclear ? 16 : 12), 0, Math.PI * 2);
                ctx.strokeStyle = nuclear
                    ? `rgba(255, 210, 78, ${0.64 + pulse * 0.34})`
                    : `rgba(255, 90, 75, ${0.55 + pulse * 0.4})`;
                ctx.lineWidth = nuclear ? 5 : 4;
                ctx.setLineDash(nuclear ? [4, 4] : [8, 5]);
                ctx.lineDashOffset = -(now / 35) % 13;
                ctx.shadowColor = nuclear ? "#ffc229" : "#ff594b";
                ctx.shadowBlur = nuclear ? 22 : 15;
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.shadowBlur = 0;
                ctx.fillStyle = nuclear ? "rgba(24, 15, 2, .92)" : "rgba(15, 3, 5, .88)";
                ctx.fillRect(target.center.x - (nuclear ? 30 : 22), target.center.y - 10, nuclear ? 60 : 44, 20);
                ctx.fillStyle = nuclear ? "#ffe58a" : "#ffb2aa";
                ctx.font = "800 12px monospace";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(`${nuclear ? "☢ " : ""}${Math.max(1, Math.ceil(remainingMs / 1000))} s`, target.center.x, target.center.y + 1);
                ctx.restore();
            });
        }

        drawNuclearImpact(ctx, state, action, target) {
            const durationMs = C.ABILITY_DEFINITIONS.nuclear.effectDurationMs;
            const progress = C.Geometry.clamp((state.elapsedMs - action.resolvedAtMs) / durationMs, 0, 1);
            const flash = Math.max(0, 1 - progress * 1.8);
            const easedProgress = 1 - Math.pow(1 - progress, 3);
            const waveRadius = 20 + easedProgress * 190;
            const affected = (action.impacts || [])
                .map((impact) => state.getTerritory(impact.territoryId))
                .filter(Boolean);

            ctx.save();
            affected.forEach((territory) => {
                ctx.beginPath();
                this.tracePolygon(ctx, territory.polygon);
                ctx.fillStyle = territory.id === target.id
                    ? `rgba(255, 224, 102, ${Math.max(0, .34 - progress * .3)})`
                    : `rgba(255, 111, 49, ${Math.max(0, .2 - progress * .18)})`;
                ctx.fill();
            });

            const glow = ctx.createRadialGradient(
                target.center.x, target.center.y, 0,
                target.center.x, target.center.y, Math.max(30, waveRadius)
            );
            glow.addColorStop(0, `rgba(255, 255, 235, ${Math.max(.05, flash)})`);
            glow.addColorStop(.18, `rgba(255, 222, 76, ${Math.max(0, .72 - progress * .65)})`);
            glow.addColorStop(.48, `rgba(255, 103, 34, ${Math.max(0, .4 - progress * .37)})`);
            glow.addColorStop(1, "rgba(75, 16, 5, 0)");
            ctx.beginPath();
            ctx.arc(target.center.x, target.center.y, waveRadius, 0, Math.PI * 2);
            ctx.fillStyle = glow;
            ctx.fill();

            [1, .72].forEach((scale, index) => {
                ctx.beginPath();
                ctx.arc(target.center.x, target.center.y, waveRadius * scale, 0, Math.PI * 2);
                ctx.strokeStyle = index === 0
                    ? `rgba(255, 239, 151, ${Math.max(0, .9 - progress)})`
                    : `rgba(255, 117, 42, ${Math.max(0, .65 - progress * .7)})`;
                ctx.lineWidth = index === 0 ? 6 - progress * 4 : 3;
                ctx.shadowColor = "#ffb329";
                ctx.shadowBlur = 18 * (1 - progress);
                ctx.stroke();
            });

            if (progress < .58) {
                const stemHeight = 25 + progress * 115;
                ctx.fillStyle = `rgba(255, 238, 176, ${Math.max(0, .82 - progress)})`;
                ctx.shadowColor = "#ff7a24";
                ctx.shadowBlur = 24;
                ctx.beginPath();
                ctx.ellipse(target.center.x, target.center.y - stemHeight, 28 + progress * 42, 15 + progress * 24, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillRect(target.center.x - 8 - progress * 6, target.center.y - stemHeight, 16 + progress * 12, stemHeight);
            }
            ctx.restore();
        }

        drawArmies(ctx, state, now) {
            state.armies.forEach((army) => {
                if (!this.game.isArmyVisible(army, this.game.playerId, this.visibilityMap)) return;
                const faction = army.isBarbarian ? C.BARBARIAN_FACTION : state.getFaction(army.ownerId);
                if (!faction) return;
                const progress = army.progress;
                const x = C.Geometry.lerp(army.start.x, army.end.x, progress);
                const y = C.Geometry.lerp(army.start.y, army.end.y, progress);
                const angle = Math.atan2(army.end.y - army.start.y, army.end.x - army.start.x);

                ctx.save();
                if (army.route.length && army.ownerId === this.game.playerId) {
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
                if (army.logisticsPurpose === "paratrooper") {
                    const sway = Math.sin(now / 180 + army.id) * 2;
                    ctx.translate(sway, 0);
                    ctx.beginPath();
                    ctx.arc(0, -7, 13, Math.PI, Math.PI * 2);
                    ctx.lineTo(0, 7);
                    ctx.closePath();
                    ctx.fillStyle = C.Geometry.rgba(faction.color, .92);
                    ctx.shadowColor = "#bcefff";
                    ctx.shadowBlur = 13;
                    ctx.fill();
                    ctx.shadowBlur = 0;
                    ctx.strokeStyle = "rgba(225,248,255,.92)";
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(-12, -7);
                    ctx.lineTo(-4, 7);
                    ctx.moveTo(12, -7);
                    ctx.lineTo(4, 7);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.arc(0, 9, 3, 0, Math.PI * 2);
                    ctx.fillStyle = "#e8fbff";
                    ctx.fill();
                    ctx.fillRect(-2, 12, 4, 7);
                } else {
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
                }

                const labelY = army.logisticsPurpose === "paratrooper" ? 23 : 12;
                ctx.fillStyle = "rgba(4, 10, 13, .9)";
                ctx.fillRect(-12, labelY, 24, 15);
                ctx.fillStyle = "#fff";
                ctx.font = "700 10px sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(String(army.units), 0, labelY + 8);
                ctx.restore();
            });
        }

        drawTransferPreview(ctx, state, now) {
            if (!this.transferPreview) return;
            const source = state.getTerritory(this.transferPreview.fromTerritoryId);
            if (!source) return;

            const isContinuous = this.transferPreview.mode === "continuous";
            const previewSources = [...new Set((this.transferPreview.sourceTerritoryIds || [source.id]).map(Number))]
                .map((territoryId) => state.getTerritory(territoryId))
                .filter(Boolean);
            const isGroup = previewSources.length > 1;
            const target = state.getTerritory(this.transferPreview.targetTerritoryId);
            const hasDestination = Boolean(target && (isGroup || target.id !== source.id));
            const isAlliedDestination = hasDestination &&
                previewSources.every((candidate) => candidate.ownerId === this.game.playerId) &&
                this.game.areAllied(target.ownerId, this.game.playerId);
            const candidates = previewSources.map((candidateSource) => ({
                source: candidateSource,
                path: isAlliedDestination
                    ? this.game.findAlliedPath(this.game.playerId, candidateSource.id, target.id)
                    : null,
                units: candidateSource.units > 1
                    ? Math.max(1, Math.floor((candidateSource.units - 1) * this.game.quickTransferRatio))
                    : 0
            }));
            const validCandidates = candidates.filter((candidate) =>
                candidate.path && candidate.path.length > 1 && (isContinuous || candidate.units > 0));
            const mainCandidate = validCandidates[0] || candidates[0];
            const path = mainCandidate?.path || null;
            const units = validCandidates.reduce((sum, candidate) => sum + candidate.units, 0);
            const isValid = validCandidates.length > 0;
            const color = !hasDestination
                ? isContinuous ? "#8beee8" : "#7ae8df"
                : isValid
                    ? isContinuous ? "#4ed7d0" : "#d8ff68"
                    : "#ff766d";
            const route = path
                ? path.map((territoryId) => state.getTerritory(territoryId)).filter(Boolean)
                : [mainCandidate?.source || source, target || { center: this.transferPreview.pointer }];
            const end = route[route.length - 1].center;

            ctx.save();
            if (isGroup && hasDestination) {
                validCandidates.slice(1).forEach((candidate) => {
                    const candidateRoute = candidate.path.map((territoryId) => state.getTerritory(territoryId)).filter(Boolean);
                    if (candidateRoute.length < 2) return;
                    ctx.beginPath();
                    ctx.moveTo(candidateRoute[0].center.x, candidateRoute[0].center.y);
                    for (let index = 1; index < candidateRoute.length; index += 1) {
                        ctx.lineTo(candidateRoute[index].center.x, candidateRoute[index].center.y);
                    }
                    ctx.strokeStyle = C.Geometry.rgba(color, .48);
                    ctx.lineWidth = 2.5;
                    ctx.setLineDash([8, 7]);
                    ctx.lineDashOffset = -(now / 55) % 15;
                    ctx.stroke();
                });
                ctx.setLineDash([]);
            }
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
                ? isContinuous ? isGroup ? `ALT · ${previewSources.length} FLUX` : "ALT · FLUX CONTINU" : isGroup ? `CTRL · ${previewSources.length} SOURCES` : "CTRL · TRANSFERT"
                : isValid
                    ? isContinuous
                        ? isGroup ? `${validCandidates.length} FLUX CONTINUS` : "FLUX CONTINU"
                        : isGroup ? `${units} UNITÉS · ${validCandidates.length} SOURCES` : `${units} UNITÉ${units > 1 ? "S" : ""}`
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

        isTerritoryVisible(territoryId) {
            return this.visibilityMap.has(Number(territoryId));
        }

        setSelection(selectedTerritoryId, targetTerritoryId = null, plannedRoute = [], multiSelectedTerritoryIds = []) {
            this.selectedTerritoryId = selectedTerritoryId;
            this.targetTerritoryId = targetTerritoryId;
            this.plannedRoute = plannedRoute.slice();
            this.multiSelectedTerritoryIds = multiSelectedTerritoryIds.slice();
        }

        setHovered(territoryId) {
            this.hoveredTerritoryId = territoryId;
        }

        setTransferPreview(fromTerritoryId, clientX, clientY, targetTerritoryId = null, mode = "quick", sourceTerritoryIds = [fromTerritoryId]) {
            this.transferPreview = {
                fromTerritoryId,
                sourceTerritoryIds: sourceTerritoryIds.slice(),
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
            const visibility = this.game.getTerritoryVisibilityMap(this.game.playerId);
            if (territory && this.game.isTerritoryVisible(territory.id, this.game.playerId, visibility)) {
                this.capturePulses.push({ center: { ...territory.center }, color, startedAt: performance.now() });
            }
        }

        fireCannon(fromTerritoryId, targetTerritoryId, hit) {
            const source = this.game.state.getTerritory(fromTerritoryId);
            const target = this.game.state.getTerritory(targetTerritoryId);
            if (!source || !target) return;
            const visibility = this.game.getTerritoryVisibilityMap(this.game.playerId);
            if (!this.game.isTerritoryVisible(source.id, this.game.playerId, visibility) &&
                !this.game.isTerritoryVisible(target.id, this.game.playerId, visibility)) return;
            const faction = this.game.state.getFaction(source.ownerId);
            this.cannonShots.push({
                start: { x: source.center.x + 25, y: source.center.y - 21 },
                end: { ...target.center },
                color: faction ? faction.accent : "#d5c38c",
                hit: Boolean(hit),
                startedAt: performance.now()
            });
        }
    }

    C.MapRenderer = MapRenderer;
})(window.Conquest = window.Conquest || {});
