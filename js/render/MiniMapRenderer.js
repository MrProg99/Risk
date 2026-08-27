(function (C) {
    "use strict";

    class MiniMapRenderer {
        constructor(canvas, game, mapRenderer, options = {}) {
            this.canvas = canvas;
            this.context = canvas.getContext("2d");
            this.game = game;
            this.mapRenderer = mapRenderer;
            this.panel = options.panel || canvas.closest(".minimap-panel");
            this.toggleButton = options.toggleButton || null;
            this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
            this.cacheCanvas = document.createElement("canvas");
            this.cacheContext = this.cacheCanvas.getContext("2d");
            this.scale = 1;
            this.offsetX = 0;
            this.offsetY = 0;
            this.baseSignature = "";
            this.lastSignatureCheckAt = -Infinity;
            this.isNavigating = false;
            this.pointerId = null;
            this.bindEvents();
            this.resize();
        }

        bindEvents() {
            this.canvas.addEventListener("pointerdown", (event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                this.isNavigating = true;
                this.pointerId = event.pointerId;
                try {
                    this.canvas.setPointerCapture?.(event.pointerId);
                } catch (_error) {
                    // La navigation fonctionne aussi sans capture du pointeur.
                }
                this.navigateAt(event.clientX, event.clientY);
            });
            this.canvas.addEventListener("pointermove", (event) => {
                if (!this.isNavigating || event.pointerId !== this.pointerId) return;
                event.preventDefault();
                this.navigateAt(event.clientX, event.clientY);
            });
            const stopNavigation = (event) => {
                if (!this.isNavigating || event.pointerId !== this.pointerId) return;
                this.isNavigating = false;
                this.pointerId = null;
                try {
                    if (this.canvas.hasPointerCapture?.(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
                } catch (_error) {
                    // La capture peut déjà avoir été libérée par le navigateur.
                }
            };
            this.canvas.addEventListener("pointerup", stopNavigation);
            this.canvas.addEventListener("pointercancel", stopNavigation);

            this.toggleButton?.addEventListener("click", () => {
                const collapsed = !this.panel.classList.contains("collapsed");
                this.panel.classList.toggle("collapsed", collapsed);
                this.toggleButton.setAttribute("aria-expanded", String(!collapsed));
                this.toggleButton.textContent = collapsed ? "+" : "−";
                this.toggleButton.title = collapsed ? "Déployer la mini-carte" : "Réduire la mini-carte";
                this.baseSignature = "";
            });
        }

        resize() {
            const rect = this.canvas.getBoundingClientRect();
            const width = Math.max(1, Math.round(rect.width * this.pixelRatio));
            const height = Math.max(1, Math.round(rect.height * this.pixelRatio));
            if (this.canvas.width === width && this.canvas.height === height) return false;
            this.canvas.width = width;
            this.canvas.height = height;
            this.cacheCanvas.width = width;
            this.cacheCanvas.height = height;
            this.updateTransform();
            this.baseSignature = "";
            return true;
        }

        updateTransform() {
            const padding = 7 * this.pixelRatio;
            const availableWidth = Math.max(1, this.canvas.width - padding * 2);
            const availableHeight = Math.max(1, this.canvas.height - padding * 2);
            this.scale = Math.min(
                availableWidth / this.game.state.mapWidth,
                availableHeight / this.game.state.mapHeight
            );
            this.offsetX = (this.canvas.width - this.game.state.mapWidth * this.scale) / 2;
            this.offsetY = (this.canvas.height - this.game.state.mapHeight * this.scale) / 2;
        }

        getBaseSignature(visibilityMap) {
            return `${this.game.state.seed}|${this.canvas.width}x${this.canvas.height}|` +
                this.game.state.territories.map((territory) => {
                    if (territory.isImpassable) return `${territory.id}:w`;
                    const distance = visibilityMap.get(territory.id);
                    return distance === undefined
                        ? `${territory.id}:?`
                        : `${territory.id}:${territory.ownerId ?? "n"}:${distance}:${territory.railroad ? "r" : territory.railroadConstructionActive ? "b" : "-"}:${(territory.buildings || []).join(".")}:${territory.buildingConstruction ? "c" : "-"}`;
                }).join(",");
        }

        render(now = performance.now()) {
            if (!this.game.state.territories.length || this.panel?.classList.contains("collapsed")) return;
            this.resize();
            if (now - this.lastSignatureCheckAt >= 140 || !this.baseSignature) {
                this.lastSignatureCheckAt = now;
                const visibilityMap = this.game.getTerritoryVisibilityMap(this.game.playerId);
                const signature = this.getBaseSignature(visibilityMap);
                if (signature !== this.baseSignature) {
                    this.baseSignature = signature;
                    this.drawBase(visibilityMap);
                }
            }

            const ctx = this.context;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.drawImage(this.cacheCanvas, 0, 0);
            this.drawViewport(ctx);
        }

        drawBase(visibilityMap) {
            const ctx = this.cacheContext;
            const state = this.game.state;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, this.cacheCanvas.width, this.cacheCanvas.height);
            const gradient = ctx.createLinearGradient(0, 0, 0, this.cacheCanvas.height);
            gradient.addColorStop(0, "#07151c");
            gradient.addColorStop(1, "#040d12");
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, this.cacheCanvas.width, this.cacheCanvas.height);

            ctx.setTransform(this.scale, 0, 0, this.scale, this.offsetX, this.offsetY);
            this.tracePolygon(ctx, state.islandPolygon);
            ctx.fillStyle = "#111f24";
            ctx.fill();

            state.territories.forEach((territory) => {
                const distance = visibilityMap.get(territory.id);
                const visible = distance !== undefined;
                const faction = visible ? state.getFaction(territory.ownerId) : null;
                let fill = "#152227";
                if (territory.isImpassable) fill = "#0b4352";
                else if (visible) fill = faction ? faction.color : "#526269";
                this.tracePolygon(ctx, territory.polygon);
                ctx.fillStyle = fill;
                ctx.fill();
                if (visible && distance >= 2 && !territory.isImpassable) {
                    ctx.fillStyle = "rgba(3, 12, 16, .30)";
                    ctx.fill();
                }
                this.tracePolygon(ctx, territory.polygon);
                ctx.strokeStyle = territory.isImpassable ? "rgba(96, 204, 216, .40)" : "rgba(4, 11, 14, .86)";
                ctx.lineWidth = 1.15 * this.pixelRatio / this.scale;
                ctx.stroke();
            });

            this.drawRailroads(ctx, state, visibilityMap);
            this.drawBuildingMarkers(ctx, state, visibilityMap);
            this.drawMountains(ctx, state);
            this.tracePolygon(ctx, state.islandPolygon);
            ctx.strokeStyle = "rgba(168, 217, 214, .55)";
            ctx.lineWidth = 1.4 * this.pixelRatio / this.scale;
            ctx.stroke();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
        }

        drawMountains(ctx, state) {
            ctx.save();
            state.territories.forEach((territory) => {
                territory.blockedNeighbors.forEach((neighborId) => {
                    if (territory.id >= neighborId) return;
                    const neighbor = state.getTerritory(neighborId);
                    if (!neighbor) return;
                    const segment = C.Geometry.sharedEdgeSegment(territory.polygon, neighbor.polygon);
                    if (!segment) return;
                    ctx.beginPath();
                    ctx.moveTo(segment.start.x, segment.start.y);
                    ctx.lineTo(segment.end.x, segment.end.y);
                    ctx.strokeStyle = "rgba(4, 9, 11, .95)";
                    ctx.lineWidth = 3.4 * this.pixelRatio / this.scale;
                    ctx.stroke();
                    ctx.strokeStyle = "rgba(213, 224, 219, .80)";
                    ctx.lineWidth = 1.15 * this.pixelRatio / this.scale;
                    ctx.setLineDash([4 * this.pixelRatio / this.scale, 3 * this.pixelRatio / this.scale]);
                    ctx.stroke();
                    ctx.setLineDash([]);
                });
            });
            ctx.restore();
        }

        drawRailroads(ctx, state, visibilityMap) {
            ctx.save();
            state.territories.forEach((territory) => {
                if (!territory.railroad || !visibilityMap.has(territory.id)) return;
                territory.neighbors.forEach((neighborId) => {
                    if (territory.id >= neighborId || territory.isPathBlocked(neighborId)) return;
                    const neighbor = state.getTerritory(neighborId);
                    if (!neighbor?.railroad || !visibilityMap.has(neighbor.id)) return;
                    ctx.beginPath();
                    ctx.moveTo(territory.center.x, territory.center.y);
                    ctx.lineTo(neighbor.center.x, neighbor.center.y);
                    ctx.strokeStyle = "rgba(5, 9, 10, .92)";
                    ctx.lineWidth = 3.2 * this.pixelRatio / this.scale;
                    ctx.stroke();
                    ctx.strokeStyle = "rgba(238, 194, 101, .90)";
                    ctx.lineWidth = 1.15 * this.pixelRatio / this.scale;
                    ctx.stroke();
                });
            });
            ctx.restore();
        }

        drawBuildingMarkers(ctx, state, visibilityMap) {
            ctx.save();
            state.territories.forEach((territory) => {
                if (!visibilityMap.has(territory.id)) return;
                const hasBuilding = (territory.buildings || []).length > 0;
                if (!hasBuilding && !territory.buildingConstruction) return;
                ctx.beginPath();
                ctx.rect(
                    territory.center.x - 3.2 * this.pixelRatio / this.scale,
                    territory.center.y - 3.2 * this.pixelRatio / this.scale,
                    6.4 * this.pixelRatio / this.scale,
                    6.4 * this.pixelRatio / this.scale
                );
                ctx.fillStyle = territory.buildingConstruction ? "#d7e47a" : "#9ed77a";
                ctx.fill();
                ctx.strokeStyle = "rgba(5, 12, 8, .92)";
                ctx.lineWidth = 1.2 * this.pixelRatio / this.scale;
                ctx.stroke();
            });
            ctx.restore();
        }

        drawViewport(ctx) {
            const renderer = this.mapRenderer;
            const halfWidth = renderer.canvas.width / (2 * renderer.viewScale);
            const halfHeight = renderer.canvas.height / (2 * renderer.viewScale);
            const left = (renderer.cameraX - halfWidth) * this.scale + this.offsetX;
            const top = (renderer.cameraY - halfHeight) * this.scale + this.offsetY;
            const width = halfWidth * 2 * this.scale;
            const height = halfHeight * 2 * this.scale;

            ctx.save();
            ctx.beginPath();
            ctx.rect(this.offsetX, this.offsetY, this.game.state.mapWidth * this.scale, this.game.state.mapHeight * this.scale);
            ctx.clip();
            ctx.fillStyle = "rgba(216, 255, 104, .055)";
            ctx.fillRect(left, top, width, height);
            ctx.strokeStyle = "rgba(235, 255, 183, .98)";
            ctx.lineWidth = Math.max(1.5, 1.35 * this.pixelRatio);
            ctx.shadowColor = "rgba(216, 255, 104, .65)";
            ctx.shadowBlur = 5 * this.pixelRatio;
            ctx.strokeRect(left, top, width, height);
            ctx.restore();
        }

        navigateAt(clientX, clientY) {
            const rect = this.canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const physicalX = (clientX - rect.left) * (this.canvas.width / rect.width);
            const physicalY = (clientY - rect.top) * (this.canvas.height / rect.height);
            const worldX = C.Geometry.clamp((physicalX - this.offsetX) / this.scale, 0, this.game.state.mapWidth);
            const worldY = C.Geometry.clamp((physicalY - this.offsetY) / this.scale, 0, this.game.state.mapHeight);
            this.mapRenderer.setCameraPosition(worldX, worldY);
        }

        tracePolygon(ctx, polygon) {
            if (!polygon?.length) return;
            ctx.beginPath();
            ctx.moveTo(polygon[0].x, polygon[0].y);
            for (let index = 1; index < polygon.length; index += 1) {
                ctx.lineTo(polygon[index].x, polygon[index].y);
            }
            ctx.closePath();
        }
    }

    C.MiniMapRenderer = MiniMapRenderer;
})(window.Conquest = window.Conquest || {});
