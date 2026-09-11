(function (C) {
    "use strict";

    class LogisticsMenuController {
        constructor(game, renderer, input, ui, signals = null) {
            Object.assign(this, { game, renderer, input, ui, signals });
            this.card = input.canvas.closest(".map-card") || input.canvas.parentElement || document.body;
            this.targetTerritoryId = null;

            this.menu = document.createElement("section");
            this.menu.className = "logistics-menu";
            this.menu.hidden = true;
            this.menu.setAttribute("role", "dialog");
            this.menu.setAttribute("aria-label", "Convergence logistique");

            this.heading = document.createElement("strong");
            this.description = document.createElement("small");
            this.convergeButton = document.createElement("button");
            this.convergeButton.type = "button";
            this.convergeButton.className = "logistics-converge";
            this.convergeButton.textContent = "⇥ Faire converger les nouveaux renforts";
            this.convergeButton.addEventListener("click", () => this.converge());

            this.stopDescription = document.createElement("small");
            this.stopDescription.className = "logistics-stop-description";
            this.stopButton = document.createElement("button");
            this.stopButton.type = "button";
            this.stopButton.className = "logistics-stop";
            this.stopButton.textContent = "⊘ Arrêter tous les transferts vers ce territoire";
            this.stopButton.addEventListener("click", () => this.stopTransfers());

            this.cancelButton = document.createElement("button");
            this.cancelButton.type = "button";
            this.cancelButton.className = "logistics-cancel";
            this.cancelButton.textContent = "Annuler · Échap";
            this.cancelButton.addEventListener("click", () => this.close());

            this.menu.append(this.heading, this.description, this.convergeButton, this.stopDescription, this.stopButton, this.cancelButton);
            this.card.append(this.menu);

            input.onTerritoryMiddleClick((territory, event) => this.open(territory, event));
            input.onViewChange(() => this.close());
            document.addEventListener("pointerdown", (event) => {
                if (!this.menu.hidden && !this.menu.contains(event.target)) this.close();
            });
            document.addEventListener("keydown", (event) => {
                if (event.key === "Escape") this.close();
            });
            window.addEventListener("blur", () => this.close());
            game.subscribe((change) => {
                if (change.type === "NEW_GAME" || change.type === "GAME_OVER") return this.close();
                if (!this.menu.hidden && [
                    "TERRITORY_CAPTURED",
                    "TERRITORY_MODE_CHANGED",
                    "TERRITORY_MODE_BATCH_CHANGED",
                    "REINFORCEMENT_ROUTE_CREATED",
                    "REINFORCEMENT_ROUTE_CANCELLED",
                    "CONTINUOUS_REINFORCEMENT_ROUTES_BATCH_CREATED",
                    "CONTINUOUS_REINFORCEMENTS_TO_TERRITORY_STOPPED",
                    "RAILROAD_CONSTRUCTION_STARTED",
                    "BUILDING_CONSTRUCTION_STARTED",
                    "WONDER_CONSTRUCTION_STARTED"
                ].includes(change.type)) this.refreshMenu();
            });
        }

        getTarget() {
            return this.game.state.getTerritory(this.targetTerritoryId);
        }

        getSources(target = this.getTarget()) {
            return target ? this.game.getContinuousConvergenceSources(this.game.playerId, target.id) : [];
        }

        getIncomingRoutes(target = this.getTarget()) {
            return target ? this.game.getContinuousRoutesToTerritory(this.game.playerId, target.id) : [];
        }

        open(territory, event) {
            this.close();
            if (!territory || territory.isImpassable || territory.ownerId !== this.game.playerId) {
                this.ui.showToast("Le point de convergence doit être l’un de vos territoires.");
                return;
            }
            if (this.game.state.winnerTeamId !== null) return;

            this.signals?.close();
            this.ui.cancelAttackTarget();
            this.targetTerritoryId = territory.id;
            this.heading.textContent = `Point de convergence · ${territory.name}`;
            this.refreshMenu();
            this.menu.hidden = false;
            this.position(event?.clientX, event?.clientY, territory);
            const focusTarget = !this.convergeButton.disabled
                ? this.convergeButton
                : !this.stopButton.disabled ? this.stopButton : this.cancelButton;
            focusTarget.focus();
        }

        refreshMenu() {
            const target = this.getTarget();
            if (!target || target.ownerId !== this.game.playerId || target.isImpassable) return this.close();
            const count = this.getSources(target).length;
            this.description.textContent = count
                ? `${count} territoire${count > 1 ? "s" : ""} en recrutement possède${count > 1 ? "nt" : ""} un itinéraire allié vers cette position. Seule leur production future sera envoyée.`
                : "Aucun autre territoire en recrutement ne possède actuellement un itinéraire allié vers cette position.";
            this.convergeButton.disabled = count === 0;
            this.convergeButton.title = count
                ? `Créer ou rediriger ${count} flux continus vers ${target.name}`
                : "Aucune source disponible";

            const incomingCount = this.getIncomingRoutes(target).length;
            this.stopDescription.textContent = incomingCount
                ? `${incomingCount} de vos flux continu${incomingCount > 1 ? "s" : ""} arrive${incomingCount > 1 ? "nt" : ""} ici. Les convois déjà partis termineront leur trajet.`
                : "Aucun de vos flux continus n’a actuellement ce territoire comme destination.";
            this.stopButton.disabled = incomingCount === 0;
            this.stopButton.title = incomingCount
                ? `Fermer ${incomingCount} flux vers ${target.name}`
                : "Aucun transfert continu à arrêter";
        }

        position(clientX, clientY, territory) {
            const rect = this.card.getBoundingClientRect();
            const fallback = this.renderer.worldToScreen?.(territory.center.x, territory.center.y) || { clientX: rect.left, clientY: rect.top };
            const anchorX = Number.isFinite(clientX) ? clientX - rect.left : fallback.clientX - rect.left;
            const anchorY = Number.isFinite(clientY) ? clientY - rect.top : fallback.clientY - rect.top;
            const width = this.menu.offsetWidth || 290;
            const height = this.menu.offsetHeight || 150;
            const maximumLeft = Math.max(8, rect.width - width - 8);
            const maximumTop = Math.max(8, rect.height - height - 8);
            let left = anchorX + 14;
            if (left > maximumLeft) left = anchorX - width - 14;
            this.menu.style.left = `${Math.round(C.Geometry.clamp(left, 8, maximumLeft))}px`;
            this.menu.style.top = `${Math.round(C.Geometry.clamp(anchorY - 18, 8, maximumTop))}px`;
        }

        converge() {
            const target = this.getTarget();
            if (!target || !this.getSources(target).length) {
                this.refreshMenu();
                return;
            }
            const result = this.game.executeCommand({
                type: "CONVERGE_CONTINUOUS_REINFORCEMENTS",
                playerId: this.game.playerId,
                toTerritoryId: target.id
            });
            if (!result.ok) return this.ui.showToast(result.error);

            this.close();
            this.ui.clearSelection();
            if (result.pending) {
                this.ui.showToast(`Convergence vers ${target.name} transmise à l’hôte.`);
                return;
            }
            const count = result.connectedCount ?? result.routes?.length ?? 0;
            const unchanged = result.unchangedCount || 0;
            const detail = unchanged ? ` · ${unchanged} déjà en place` : "";
            this.ui.showToast(`${count} flux de nouveaux renforts convergent vers ${target.name}${detail}.`);
        }

        stopTransfers() {
            const target = this.getTarget();
            const incomingCount = target ? this.getIncomingRoutes(target).length : 0;
            if (!target || !incomingCount) {
                this.refreshMenu();
                return;
            }
            const result = this.game.executeCommand({
                type: "STOP_CONTINUOUS_REINFORCEMENTS_TO_TERRITORY",
                playerId: this.game.playerId,
                toTerritoryId: target.id
            });
            if (!result.ok) return this.ui.showToast(result.error);

            this.close();
            this.ui.clearSelection();
            if (result.pending) {
                this.ui.showToast(`Arrêt des transferts vers ${target.name} transmis à l’hôte.`);
                return;
            }
            const count = result.stoppedCount ?? incomingCount;
            this.ui.showToast(`${count} flux vers ${target.name} arrêté${count > 1 ? "s" : ""}. Les convois déjà partis poursuivent leur trajet.`);
        }

        close() {
            this.menu.hidden = true;
            this.targetTerritoryId = null;
        }
    }

    C.LogisticsMenuController = LogisticsMenuController;
})(window.Conquest = window.Conquest || {});
