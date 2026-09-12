(function (C) {
    "use strict";

    class UnitHistoryChart {
        constructor(game, elements) {
            this.game = game;
            this.canvas = elements.unitHistoryCanvas;
            this.legend = elements.unitHistoryLegend;
            this.tooltip = elements.unitHistoryTooltip;
            this.ctx = this.canvas.getContext("2d");
            this.durationMs = 0;
            this.series = [];
            this.layout = null;
            this.hoverTimeMs = null;
            this.visible = false;

            this.canvas.addEventListener("pointermove", (event) => this.handlePointerMove(event));
            this.canvas.addEventListener("pointerleave", () => this.clearHover());
            if (typeof ResizeObserver === "function") {
                this.resizeObserver = new ResizeObserver(() => {
                    if (this.visible) this.render();
                });
                this.resizeObserver.observe(this.canvas.parentElement || this.canvas);
            }
        }

        open(durationMs) {
            this.visible = true;
            this.durationMs = Math.max(1, Number(durationMs) || Number(this.game.state.elapsedMs) || 1);
            this.buildSeries();
            this.buildLegend();
            this.render();
        }

        close(reset = false) {
            this.visible = false;
            this.hoverTimeMs = null;
            if (this.tooltip) this.tooltip.hidden = true;
            if (!reset) return;
            this.series = [];
            this.durationMs = 0;
            this.legend?.replaceChildren();
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }

        buildSeries() {
            const timeline = this.game.state.matchTimeline;
            this.series = this.game.state.factions.map((faction) => {
                const points = timeline.getUnitSeries(faction.id, this.durationMs);
                if (!points.length) points.push({ timeMs: 0, units: 0 });
                const lastPoint = points[points.length - 1];
                if (lastPoint.timeMs < this.durationMs) {
                    const stats = this.game.getFactionStats(faction.id);
                    points.push({ timeMs: this.durationMs, units: stats.totalUnits });
                }
                return {
                    factionId: faction.id,
                    name: faction.playerName || faction.name,
                    factionName: faction.name,
                    color: faction.color,
                    isAI: faction.isAI,
                    points,
                    peak: points.reduce((maximum, point) => Math.max(maximum, point.units), 0),
                    final: points[points.length - 1].units
                };
            });
        }

        buildLegend() {
            if (!this.legend) return;
            const entries = this.series.map((series) => {
                const item = document.createElement("span");
                item.className = "unit-history-legend-item";
                item.style.setProperty("--series-color", series.color);
                const dot = document.createElement("i");
                const identity = document.createElement("span");
                identity.textContent = series.name;
                const values = document.createElement("strong");
                values.textContent = `Final ${series.final} · Pic ${series.peak}`;
                item.append(dot, identity, values);
                return item;
            });
            this.legend.replaceChildren(...entries);
        }

        resizeCanvas() {
            const rect = this.canvas.getBoundingClientRect();
            const width = Math.max(320, Math.round(rect.width || this.canvas.parentElement?.clientWidth || 960));
            const height = Math.max(190, Math.round(rect.height || 270));
            const ratio = Math.min(2, Math.max(1, Number(window.devicePixelRatio) || 1));
            const pixelWidth = Math.round(width * ratio);
            const pixelHeight = Math.round(height * ratio);
            if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
                this.canvas.width = pixelWidth;
                this.canvas.height = pixelHeight;
            }
            this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
            return { width, height };
        }

        getNiceMaximum(value) {
            const padded = Math.max(10, Number(value) * 1.08);
            const magnitude = 10 ** Math.floor(Math.log10(padded));
            const normalized = padded / magnitude;
            const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
            return step * magnitude;
        }

        render() {
            if (!this.ctx || !this.visible) return;
            const { width, height } = this.resizeCanvas();
            const ctx = this.ctx;
            const padding = { left: 58, right: 20, top: 20, bottom: 38 };
            const plotWidth = Math.max(1, width - padding.left - padding.right);
            const plotHeight = Math.max(1, height - padding.top - padding.bottom);
            const peak = this.series.reduce((maximum, series) => Math.max(maximum, series.peak), 0);
            const yMaximum = this.getNiceMaximum(peak);
            this.layout = { width, height, padding, plotWidth, plotHeight, yMaximum };

            ctx.clearRect(0, 0, width, height);
            const background = ctx.createLinearGradient(0, 0, 0, height);
            background.addColorStop(0, "rgba(11, 29, 35, .94)");
            background.addColorStop(1, "rgba(3, 14, 19, .96)");
            ctx.fillStyle = background;
            ctx.fillRect(0, 0, width, height);

            ctx.font = "10px 'IBM Plex Mono', monospace";
            ctx.textBaseline = "middle";
            ctx.lineWidth = 1;
            for (let index = 0; index <= 4; index += 1) {
                const ratio = index / 4;
                const y = padding.top + plotHeight * ratio;
                const value = Math.round(yMaximum * (1 - ratio));
                ctx.strokeStyle = index === 4 ? "rgba(151, 184, 187, .28)" : "rgba(151, 184, 187, .10)";
                ctx.beginPath();
                ctx.moveTo(padding.left, y + .5);
                ctx.lineTo(width - padding.right, y + .5);
                ctx.stroke();
                ctx.fillStyle = "#6f878d";
                ctx.textAlign = "right";
                ctx.fillText(this.formatUnits(value), padding.left - 9, y);
            }

            for (let index = 0; index <= 4; index += 1) {
                const ratio = index / 4;
                const x = padding.left + plotWidth * ratio;
                ctx.strokeStyle = "rgba(151, 184, 187, .065)";
                ctx.beginPath();
                ctx.moveTo(x + .5, padding.top);
                ctx.lineTo(x + .5, padding.top + plotHeight);
                ctx.stroke();
                ctx.fillStyle = "#60787e";
                ctx.textAlign = index === 0 ? "left" : index === 4 ? "right" : "center";
                ctx.fillText(this.formatDuration(this.durationMs * ratio), x, height - 17);
            }

            this.series.forEach((series) => {
                ctx.save();
                ctx.strokeStyle = series.color;
                ctx.lineWidth = 2.4;
                ctx.lineJoin = "round";
                ctx.lineCap = "round";
                ctx.shadowColor = series.color;
                ctx.shadowBlur = 7;
                ctx.beginPath();
                series.points.forEach((point, index) => {
                    const x = padding.left + C.Geometry.clamp(point.timeMs / this.durationMs, 0, 1) * plotWidth;
                    const y = padding.top + (1 - C.Geometry.clamp(point.units / yMaximum, 0, 1)) * plotHeight;
                    if (index === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                });
                ctx.stroke();
                ctx.restore();
            });

            if (this.hoverTimeMs !== null) this.drawHover();
        }

        drawHover() {
            const { padding, plotWidth, plotHeight, yMaximum, width } = this.layout;
            const ctx = this.ctx;
            const ratio = C.Geometry.clamp(this.hoverTimeMs / this.durationMs, 0, 1);
            const x = padding.left + ratio * plotWidth;
            ctx.save();
            ctx.strokeStyle = "rgba(229, 245, 242, .5)";
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(x, padding.top);
            ctx.lineTo(x, padding.top + plotHeight);
            ctx.stroke();
            ctx.setLineDash([]);
            this.series.forEach((series) => {
                const units = this.getUnitsAt(series.points, this.hoverTimeMs);
                const y = padding.top + (1 - C.Geometry.clamp(units / yMaximum, 0, 1)) * plotHeight;
                ctx.fillStyle = series.color;
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = "#071317";
                ctx.lineWidth = 2;
                ctx.stroke();
            });
            ctx.restore();
            this.positionTooltip(x, width);
        }

        getUnitsAt(points, timeMs) {
            if (!points.length) return 0;
            if (timeMs <= points[0].timeMs) return points[0].units;
            for (let index = 1; index < points.length; index += 1) {
                const next = points[index];
                if (next.timeMs < timeMs) continue;
                const previous = points[index - 1];
                const span = Math.max(1, next.timeMs - previous.timeMs);
                const ratio = C.Geometry.clamp((timeMs - previous.timeMs) / span, 0, 1);
                return Math.round(C.Geometry.lerp(previous.units, next.units, ratio));
            }
            return points[points.length - 1].units;
        }

        handlePointerMove(event) {
            if (!this.visible || !this.layout) return;
            const rect = this.canvas.getBoundingClientRect();
            const localX = (event.clientX - rect.left) * (this.layout.width / Math.max(1, rect.width));
            const ratio = C.Geometry.clamp((localX - this.layout.padding.left) / this.layout.plotWidth, 0, 1);
            this.hoverTimeMs = ratio * this.durationMs;
            this.render();
        }

        positionTooltip(x, chartWidth) {
            if (!this.tooltip) return;
            const title = document.createElement("strong");
            title.textContent = this.formatDuration(this.hoverTimeMs);
            const rows = this.series
                .map((series) => ({ series, units: this.getUnitsAt(series.points, this.hoverTimeMs) }))
                .sort((first, second) => second.units - first.units)
                .map(({ series, units }) => {
                    const row = document.createElement("span");
                    row.style.setProperty("--series-color", series.color);
                    const dot = document.createElement("i");
                    const name = document.createElement("span");
                    name.textContent = series.name;
                    const value = document.createElement("b");
                    value.textContent = String(units);
                    row.append(dot, name, value);
                    return row;
                });
            this.tooltip.replaceChildren(title, ...rows);
            this.tooltip.hidden = false;
            const placeLeft = x > chartWidth * .68;
            this.tooltip.style.left = `${Math.round(x)}px`;
            this.tooltip.style.transform = placeLeft ? "translateX(calc(-100% - 12px))" : "translateX(12px)";
        }

        clearHover() {
            if (this.hoverTimeMs === null) return;
            this.hoverTimeMs = null;
            if (this.tooltip) this.tooltip.hidden = true;
            this.render();
        }

        formatDuration(milliseconds) {
            const totalSeconds = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            return `${minutes}:${String(seconds).padStart(2, "0")}`;
        }

        formatUnits(value) {
            const units = Math.max(0, Number(value) || 0);
            if (units >= 1000) return `${(units / 1000).toFixed(units >= 10000 ? 0 : 1).replace(".0", "")}k`;
            return String(Math.round(units));
        }
    }

    C.UnitHistoryChart = UnitHistoryChart;
})(window.Conquest = window.Conquest || {});
