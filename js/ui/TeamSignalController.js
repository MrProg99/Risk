(function (C) {
    "use strict";

    class TeamSignalController {
        constructor(game, renderer, input, ui, audio) {
            Object.assign(this, { game, renderer, input, ui, audio });
            this.card = input.canvas.closest(".map-card");
            this.armed = false;
            this.held = false;
            this.pendingUntil = 0;
            this.targetId = null;
            this.feedKey = null;
            this.button = document.createElement("button");
            this.button.type = "button";
            this.button.className = "team-signal-toggle";
            this.button.textContent = "⚑ Signal (G)";
            this.button.title = "Signaler une position à vos équipiers humains : G + clic gauche";
            this.button.setAttribute("aria-pressed", "false");
            this.menu = document.createElement("section");
            this.menu.className = "team-signal-menu";
            this.menu.hidden = true;
            this.menu.setAttribute("role", "dialog");
            this.menu.setAttribute("aria-label", "Signal aux équipiers");
            this.heading = document.createElement("strong");
            this.menu.append(this.heading);
            this.choices = new Map();
            Object.entries(C.TEAM_SIGNAL_TYPES).forEach(([id, type]) => {
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = `${type.icon} ${type.label}`;
                button.addEventListener("click", () => this.send(id));
                this.choices.set(id, button);
                this.menu.append(button);
            });
            const cancel = document.createElement("button");
            cancel.type = "button";
            cancel.textContent = "Annuler · Échap";
            cancel.addEventListener("click", () => this.close());
            this.menu.append(cancel);
            this.feed = document.createElement("div");
            this.feed.className = "team-signal-feed";
            this.feed.setAttribute("aria-label", "Signaux des équipiers");
            this.live = document.createElement("span");
            this.live.className = "team-signal-live";
            this.live.setAttribute("role", "status");
            this.card.append(this.button, this.menu, this.feed, this.live);
            this.button.addEventListener("click", () => {
                this.armed = !this.armed;
                this.updateMode();
                if (this.armed) ui.showToast("Cliquez sur une position pour envoyer un signal à votre équipe.");
            });
            input.onTeamSignal((territory) => this.open(territory));
            input.onViewChange(() => this.close());
            document.addEventListener("keydown", (event) => {
                if (event.key === "Escape") return this.close();
                if (event.code !== "KeyG" || event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
                if (event.target?.closest?.("input, textarea, select, [contenteditable]")) return;
                if (!game.teamSignals.isAvailable() || !ui.elements.researchScreen.hidden || game.state.winnerTeamId !== null) return;
                event.preventDefault();
                this.held = true;
                this.updateMode();
            });
            document.addEventListener("keyup", (event) => {
                if (event.code !== "KeyG") return;
                this.held = false;
                this.updateMode();
            });
            window.addEventListener("blur", () => this.close());
            document.addEventListener("pointerdown", (event) => {
                if (!this.menu.hidden && !this.menu.contains(event.target) && event.target !== input.canvas) this.close();
            });
            game.subscribe((change) => {
                if (change.type === "NEW_GAME") {
                    this.close();
                    this.pendingUntil = 0;
                    this.live.textContent = "";
                }
                if (change.type === "TEAM_SIGNAL_CREATED") {
                    this.live.textContent = this.describe(change.signal);
                    if (change.signal.playerId !== game.playerId) audio?.playTeamSignal();
                }
            });
            this.refresh();
        }

        updateMode() {
            this.input.signalMode = this.armed || this.held;
            this.button.setAttribute("aria-pressed", String(this.input.signalMode));
        }

        close() {
            this.menu.hidden = true;
            this.targetId = null;
            this.armed = false;
            this.held = false;
            this.updateMode();
        }

        open(territory) {
            this.close();
            if (!territory || !this.game.teamSignals.isAvailable()) return;
            if (!this.game.isTerritoryVisible(territory.id) || territory.isImpassable) {
                this.ui.showToast("Choisissez un territoire terrestre visible.");
                return;
            }
            this.ui.cancelAttackTarget();
            this.targetId = territory.id;
            this.heading.textContent = territory.name;
            this.menu.hidden = false;
            this.refreshChoices();
            const point = this.renderer.worldToScreen(territory.center.x, territory.center.y);
            const rect = this.card.getBoundingClientRect();
            this.menu.style.left = `${Math.max(8, Math.min(point.clientX - rect.left + 20, rect.width - this.menu.offsetWidth - 8))}px`;
            this.menu.style.top = `${Math.max(8, Math.min(point.clientY - rect.top - 40, rect.height - this.menu.offsetHeight - 8))}px`;
            (Array.from(this.choices.values()).find((button) => !button.disabled) || this.menu.lastElementChild).focus();
        }

        refreshChoices() {
            this.choices.forEach((button, signalType) => {
                const validation = this.game.teamSignals.validate({ playerId: this.game.playerId, targetTerritoryId: this.targetId, signalType });
                button.disabled = !validation.ok || performance.now() < this.pendingUntil;
                button.title = validation.error || (button.disabled ? "Envoi précédent en cours." : "Visible par vos équipiers humains");
            });
        }

        send(signalType) {
            if (performance.now() < this.pendingUntil) return;
            const result = this.game.executeCommand({ type: "SEND_TEAM_SIGNAL", playerId: this.game.playerId, targetTerritoryId: this.targetId, signalType });
            if (!result.ok) return this.ui.showToast(result.error);
            this.pendingUntil = performance.now() + 3000 / this.game.timeScale;
            this.close();
            if (result.pending) this.ui.showToast("Signal transmis à l’hôte…");
        }

        describe(signal) {
            const author = this.game.state.getFaction(signal.playerId);
            const territory = this.game.state.getTerritory(signal.targetTerritoryId);
            return `${C.TEAM_SIGNAL_TYPES[signal.signalType]?.label || "Signal"} · ${territory?.name || "Position"} — ${author?.playerName || author?.name || "Équipier"}`;
        }

        refresh() {
            this.button.hidden = !this.game.teamSignals.isAvailable() || this.game.state.winnerTeamId !== null;
            if (this.button.hidden) this.close();
            if (!this.menu.hidden) this.refreshChoices();
            const signals = this.game.teamSignals.getVisibleSignals().slice(-3).reverse();
            const key = signals.map((signal) => signal.id).join(",");
            if (key === this.feedKey) return;
            this.feedKey = key;
            this.feed.replaceChildren();
            signals.forEach((signal) => {
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = `${C.TEAM_SIGNAL_TYPES[signal.signalType].icon} ${this.describe(signal)}`;
                button.style.borderLeftColor = this.game.state.getFaction(signal.playerId).color;
                button.title = "Centrer la carte sur ce signal";
                button.addEventListener("click", () => {
                    if (!this.game.teamSignals.getVisibleSignals().some((item) => item.id === signal.id)) return;
                    this.close();
                    this.renderer.focusTerritory(signal.targetTerritoryId);
                });
                this.feed.append(button);
            });
        }
    }
    C.TeamSignalController = TeamSignalController;
})(window.Conquest = window.Conquest || {});
