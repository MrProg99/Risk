(function (C) {
    "use strict";

    class ReplayMapRenderer {
        constructor(canvas, game) {
            this.canvas = canvas;
            this.context = canvas.getContext("2d");
            this.game = game;
            this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
            this.lastOwners = new Map();
            this.lastCapture = null;
            this.lastPulseProgress = 1;
            this.resizeObserver = typeof ResizeObserver === "function"
                ? new ResizeObserver(() => this.render(this.lastOwners, this.lastCapture, this.lastPulseProgress))
                : null;
            this.resizeObserver?.observe(canvas);
        }

        resize() {
            const rect = this.canvas.getBoundingClientRect();
            const width = Math.max(1, Math.round((rect.width || 900) * this.pixelRatio));
            const height = Math.max(1, Math.round((rect.height || 390) * this.pixelRatio));
            if (this.canvas.width !== width || this.canvas.height !== height) {
                this.canvas.width = width;
                this.canvas.height = height;
            }
        }

        render(owners = new Map(), activeCapture = null, pulseProgress = 1) {
            if (!this.context) return;
            this.lastOwners = owners;
            this.lastCapture = activeCapture;
            this.lastPulseProgress = pulseProgress;
            this.resize();

            const ctx = this.context;
            const state = this.game.state;
            const width = this.canvas.width;
            const height = this.canvas.height;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, width, height);

            const background = ctx.createLinearGradient(0, 0, width, height);
            background.addColorStop(0, "#07171d");
            background.addColorStop(1, "#02090d");
            ctx.fillStyle = background;
            ctx.fillRect(0, 0, width, height);

            const padding = 17 * this.pixelRatio;
            const scale = Math.max(0.001, Math.min(
                (width - padding * 2) / state.mapWidth,
                (height - padding * 2) / state.mapHeight
            ));
            const offsetX = (width - state.mapWidth * scale) / 2;
            const offsetY = (height - state.mapHeight * scale) / 2;
            ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);

            if (state.islandPolygon?.length) {
                this.tracePolygon(ctx, state.islandPolygon);
                ctx.save();
                ctx.shadowColor = "rgba(0, 0, 0, .78)";
                ctx.shadowBlur = 24 / scale;
                ctx.shadowOffsetY = 8 / scale;
                ctx.fillStyle = "#15252a";
                ctx.fill();
                ctx.restore();
            }

            state.territories.forEach((territory) => {
                const type = C.TERRITORY_TYPES[territory.terrain] || C.TERRITORY_TYPES.plain;
                const ownerId = owners.has(territory.id) ? owners.get(territory.id) : null;
                const faction = state.getFaction(ownerId);
                const ownerColor = faction?.color || "#53636a";
                const fill = territory.isImpassable
                    ? C.Geometry.mixColors("#07313f", type.color, 0.62)
                    : C.Geometry.mixColors(ownerColor, type.color, faction ? 0.16 : 0.28);

                this.tracePolygon(ctx, territory.polygon);
                ctx.fillStyle = fill;
                ctx.fill();
                ctx.fillStyle = territory.isImpassable
                    ? "rgba(39, 154, 178, .17)"
                    : faction ? "rgba(5, 14, 17, .08)" : "rgba(5, 14, 17, .24)";
                ctx.fill();
                ctx.strokeStyle = territory.isImpassable
                    ? "rgba(87, 182, 197, .32)"
                    : "rgba(3, 10, 13, .78)";
                ctx.lineWidth = Math.max(1.1, 1.45 / scale);
                ctx.lineJoin = "round";
                ctx.stroke();
            });

            if (state.islandPolygon?.length) {
                this.tracePolygon(ctx, state.islandPolygon);
                ctx.strokeStyle = "rgba(179, 224, 219, .35)";
                ctx.lineWidth = 2.2 / scale;
                ctx.stroke();
            }

            if (activeCapture && pulseProgress < 1) {
                const territory = state.getTerritory(activeCapture.territoryId);
                const faction = state.getFaction(activeCapture.ownerId);
                if (territory) {
                    const color = faction?.color || "#e4edf0";
                    this.tracePolygon(ctx, territory.polygon);
                    ctx.fillStyle = C.Geometry.rgba(color, Math.max(0, 0.24 * (1 - pulseProgress)));
                    ctx.fill();
                    ctx.strokeStyle = C.Geometry.rgba(color, Math.max(0, 1 - pulseProgress));
                    ctx.lineWidth = (5 - pulseProgress * 3) / scale;
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.arc(territory.center.x, territory.center.y, (18 + pulseProgress * 38) / scale, 0, Math.PI * 2);
                    ctx.strokeStyle = C.Geometry.rgba(color, Math.max(0, 0.95 * (1 - pulseProgress)));
                    ctx.lineWidth = 3 / scale;
                    ctx.stroke();
                }
            }

            ctx.setTransform(1, 0, 0, 1, 0, 0);
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

    C.ReplayMapRenderer = ReplayMapRenderer;
})(window.Conquest = window.Conquest || {});
