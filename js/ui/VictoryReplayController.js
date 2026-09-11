(function (C) {
    "use strict";

    class VictoryReplayController {
        constructor(game, elements) {
            this.game = game;
            this.elements = elements;
            this.renderer = new C.ReplayMapRenderer(elements.replayCanvas, game);
            this.timeline = null;
            this.timelineKey = "";
            this.owners = new Map();
            this.currentTimeMs = 0;
            this.durationMs = 0;
            this.captureCount = 0;
            this.speed = 1;
            this.playing = false;
            this.visible = false;
            this.animationFrame = null;
            this.lastFrameAt = null;
            this.activeCapture = null;
            this.capturePulseAt = 0;
            this.legendCountsKey = "";
            this.bindEvents();
        }

        bindEvents() {
            this.elements.replayStart.addEventListener("click", () => {
                this.pause();
                this.setTime(0, true);
            });
            this.elements.replayPlay.addEventListener("click", () => {
                if (this.playing) this.pause();
                else this.play();
            });
            this.elements.replayRange.addEventListener("input", () => {
                this.pause();
                this.setTime(Number(this.elements.replayRange.value), true);
            });
            this.elements.replaySpeeds.forEach((button) => {
                button.addEventListener("click", () => this.setSpeed(Number(button.dataset.replaySpeed)));
            });
        }

        open() {
            const timeline = this.game.state.matchTimeline;
            const duration = Math.max(0, Number(this.game.state.victoryAtMs ?? this.game.state.elapsedMs) || 0);
            const timelineKey = `${this.game.state.seed}:${timeline.captures.length}:${duration}`;
            this.visible = true;
            if (timelineKey !== this.timelineKey) {
                this.timeline = timeline;
                this.timelineKey = timelineKey;
                this.durationMs = duration;
                this.elements.replayRange.max = String(Math.max(1, duration));
                this.elements.replayRange.step = String(Math.max(50, Math.round(duration / 2400)));
                this.buildLegend();
                this.pause();
                this.setTime(duration, false);
            } else {
                this.render(performance.now());
            }
        }

        close(reset = false) {
            this.visible = false;
            this.pause();
            if (reset) {
                this.timeline = null;
                this.timelineKey = "";
                this.currentTimeMs = 0;
                this.activeCapture = null;
            }
        }

        play() {
            if (!this.timeline || this.durationMs <= 0) return;
            if (this.currentTimeMs >= this.durationMs) this.setTime(0, false);
            this.playing = true;
            this.lastFrameAt = null;
            this.updatePlayButton();
            this.scheduleFrame();
        }

        pause() {
            this.playing = false;
            this.lastFrameAt = null;
            if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
            this.updatePlayButton();
        }

        setSpeed(speed) {
            this.speed = [1, 2, 4].includes(speed) ? speed : 1;
            this.elements.replaySpeeds.forEach((button) => {
                const active = Number(button.dataset.replaySpeed) === this.speed;
                button.classList.toggle("active", active);
                button.setAttribute("aria-pressed", String(active));
            });
        }

        setTime(timeMs, announceCapture = false) {
            if (!this.timeline) return;
            const nextTime = C.Geometry.clamp(Number(timeMs) || 0, 0, this.durationMs);
            const nextCaptureCount = this.timeline.getCaptureCountAt(nextTime);
            if (announceCapture && nextCaptureCount !== this.captureCount && nextCaptureCount > 0) {
                this.activeCapture = this.timeline.getLatestCaptureAt(nextTime);
                this.capturePulseAt = performance.now();
            }
            this.currentTimeMs = nextTime;
            this.captureCount = nextCaptureCount;
            this.owners = this.timeline.getOwnershipAt(nextTime);
            this.updateInterface();
            this.render(performance.now());
        }

        scheduleFrame() {
            if (!this.visible || this.animationFrame !== null) return;
            this.animationFrame = requestAnimationFrame((now) => this.frame(now));
        }

        frame(now) {
            this.animationFrame = null;
            if (!this.visible) return;
            if (this.playing) {
                const deltaMs = this.lastFrameAt === null ? 0 : Math.min(100, now - this.lastFrameAt);
                this.lastFrameAt = now;
                const basePlaybackRate = Math.max(8, this.durationMs / 60000);
                this.setTime(this.currentTimeMs + deltaMs * basePlaybackRate * this.speed, true);
                if (this.currentTimeMs >= this.durationMs) this.pause();
            } else {
                this.render(now);
            }

            const pulseActive = this.activeCapture && now - this.capturePulseAt < 950;
            if (this.playing || pulseActive) this.scheduleFrame();
        }

        updateInterface() {
            this.elements.replayRange.value = String(Math.round(this.currentTimeMs));
            this.elements.replayRange.style.setProperty("--replay-progress", `${this.durationMs ? this.currentTimeMs / this.durationMs * 100 : 0}%`);
            this.elements.replayRange.setAttribute("aria-valuetext", this.formatDuration(this.currentTimeMs));
            this.elements.replayTime.textContent = `${this.formatDuration(this.currentTimeMs)} / ${this.formatDuration(this.durationMs)}`;
            this.elements.replayEvent.textContent = this.describeCurrentMoment();
            this.updateLegend();
            this.updatePlayButton();
        }

        updatePlayButton() {
            if (!this.elements?.replayPlay) return;
            this.elements.replayPlay.textContent = this.playing
                ? "❚❚ Pause"
                : this.currentTimeMs >= this.durationMs ? "▶ Rejouer" : "▶ Lecture";
            this.elements.replayPlay.setAttribute("aria-pressed", String(this.playing));
        }

        buildLegend() {
            const fragments = this.game.state.factions.map((faction) => {
                const item = document.createElement("span");
                item.className = "replay-legend-item";
                item.dataset.factionId = faction.id;
                item.style.setProperty("--replay-color", faction.color);
                const dot = document.createElement("i");
                const name = document.createElement("span");
                name.textContent = faction.playerName || faction.name;
                const count = document.createElement("strong");
                count.textContent = "0";
                item.append(dot, name, count);
                return item;
            });
            const neutral = document.createElement("span");
            neutral.className = "replay-legend-item replay-neutral";
            neutral.dataset.factionId = "neutral";
            neutral.style.setProperty("--replay-color", "#64747a");
            const dot = document.createElement("i");
            const name = document.createElement("span");
            name.textContent = "Neutres";
            const count = document.createElement("strong");
            count.textContent = "0";
            neutral.append(dot, name, count);
            this.elements.replayLegend.replaceChildren(...fragments, neutral);
            this.legendCountsKey = "";
        }

        updateLegend() {
            const counts = new Map(this.game.state.factions.map((faction) => [faction.id, 0]));
            let neutralCount = 0;
            this.game.state.territories.forEach((territory) => {
                if (territory.isImpassable) return;
                const ownerId = this.owners.get(territory.id) ?? null;
                if (counts.has(ownerId)) counts.set(ownerId, counts.get(ownerId) + 1);
                else neutralCount += 1;
            });
            const key = `${[...counts.values()].join(":")}:${neutralCount}`;
            if (key === this.legendCountsKey) return;
            this.legendCountsKey = key;
            this.elements.replayLegend.querySelectorAll(".replay-legend-item").forEach((item) => {
                const id = item.dataset.factionId;
                const value = id === "neutral" ? neutralCount : counts.get(Number(id)) || 0;
                item.querySelector("strong").textContent = String(value);
            });
        }

        describeCurrentMoment() {
            if (this.currentTimeMs <= 0 || this.captureCount === 0) return "Déploiement initial des factions.";
            if (this.currentTimeMs >= this.durationMs) return `Fin de la campagne · ${this.captureCount} conquête${this.captureCount > 1 ? "s" : ""}.`;
            const event = this.timeline.getLatestCaptureAt(this.currentTimeMs);
            if (!event) return "Les frontières sont encore intactes.";
            const territory = this.game.state.getTerritory(event.territoryId);
            const owner = this.game.state.getFaction(event.ownerId);
            const previousOwner = this.game.state.getFaction(event.previousOwnerId);
            if (!owner) return `${territory?.name || "Un territoire"} redevient neutre après une attaque barbare.`;
            if (!previousOwner) return `${owner.playerName || owner.name} conquiert ${territory?.name || "un territoire neutre"}.`;
            return `${owner.playerName || owner.name} capture ${territory?.name || "un territoire"} à ${previousOwner.playerName || previousOwner.name}.`;
        }

        render(now) {
            const pulseProgress = this.activeCapture
                ? C.Geometry.clamp((now - this.capturePulseAt) / 950, 0, 1)
                : 1;
            this.renderer.render(this.owners, this.activeCapture, pulseProgress);
            if (pulseProgress >= 1) this.activeCapture = null;
        }

        formatDuration(durationMs) {
            const totalSeconds = Math.max(0, Math.floor((Number(durationMs) || 0) / 1000));
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            return hours > 0
                ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
                : `${minutes}:${String(seconds).padStart(2, "0")}`;
        }
    }

    C.VictoryReplayController = VictoryReplayController;
})(window.Conquest = window.Conquest || {});
