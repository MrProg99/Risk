(function (C) {
    "use strict";

    class UIController {
        constructor(game, renderer, input) {
            this.game = game;
            this.renderer = renderer;
            this.input = input;
            this.selectedTerritoryId = null;
            this.targetTerritoryId = null;
            this.plannedRoute = [];
            this.lastRouteKey = null;
            this.lastEventId = null;
            this.toastTimer = null;
            this.elements = this.collectElements();
            this.bindEvents();
            this.unsubscribe = game.subscribe((change) => this.handleGameChange(change));
        }

        collectElements() {
            const byId = (id) => document.getElementById(id);
            return {
                playerFactionDot: byId("player-faction-dot"),
                playerFactionName: byId("player-faction-name"),
                territoryCount: byId("territory-count"),
                totalUnits: byId("total-units"),
                productionRate: byId("production-rate"),
                newMap: byId("new-map"),
                togglePause: byId("toggle-pause"),
                pauseIcon: byId("pause-icon"),
                pauseLabel: byId("pause-label"),
                simulationStatus: byId("simulation-status"),
                mapSeed: byId("map-seed"),
                factionLegend: byId("faction-legend"),
                zoomOut: byId("zoom-out"),
                zoomIn: byId("zoom-in"),
                zoomLevel: byId("zoom-level"),
                centerMap: byId("center-map"),
                toast: byId("toast"),
                territoryName: byId("territory-name"),
                territoryId: byId("territory-id"),
                emptySelection: byId("empty-selection"),
                territoryDetails: byId("territory-details"),
                ownerSwatch: byId("owner-swatch"),
                ownerName: byId("owner-name"),
                selectedUnits: byId("selected-units"),
                terrainIcon: byId("terrain-icon"),
                terrainName: byId("terrain-name"),
                resourceName: byId("resource-name"),
                territoryProduction: byId("territory-production"),
                bonusList: byId("bonus-list"),
                neighborCount: byId("neighbor-count"),
                neighborList: byId("neighbor-list"),
                activeRoutePanel: byId("active-route-panel"),
                activeRouteStatus: byId("active-route-status"),
                activeRouteSource: byId("active-route-source"),
                activeRouteTarget: byId("active-route-target"),
                routeDispatched: byId("route-dispatched"),
                routeDelivered: byId("route-delivered"),
                stopRouteButton: byId("stop-route-button"),
                attackPanel: byId("attack-panel"),
                attackSource: byId("attack-source"),
                attackTarget: byId("attack-target"),
                routeArrow: byId("route-arrow"),
                routeSummary: byId("route-summary"),
                continuousControl: byId("continuous-control"),
                continuousRoute: byId("continuous-route"),
                unitSendControls: byId("unit-send-controls"),
                attackUnits: byId("attack-units"),
                attackOutput: byId("attack-output"),
                attackMax: byId("attack-max"),
                attackButton: byId("attack-button"),
                selectionTip: byId("selection-tip"),
                eventList: byId("event-list")
            };
        }

        bindEvents() {
            this.input.onTerritoryClick((territory) => this.handleTerritoryClick(territory));
            this.input.onTerritoryRightClick((territory) => this.handleTerritoryRightClick(territory));

            this.elements.newMap.addEventListener("click", () => {
                this.clearSelection();
                this.game.newGame();
            });

            this.elements.togglePause.addEventListener("click", () => {
                this.game.setPaused(!this.game.paused);
            });

            this.elements.attackUnits.addEventListener("input", () => {
                this.elements.attackOutput.value = this.elements.attackUnits.value;
            });

            this.elements.continuousRoute.addEventListener("change", () => this.renderTerritoryPanel());

            this.elements.attackButton.addEventListener("click", () => this.launchAttack());
            this.elements.stopRouteButton.addEventListener("click", () => this.stopContinuousRoute());
            this.elements.zoomIn.addEventListener("click", () => {
                this.renderer.zoomBy(1.2);
                this.renderZoomLevel();
            });
            this.elements.zoomOut.addEventListener("click", () => {
                this.renderer.zoomBy(1 / 1.2);
                this.renderZoomLevel();
            });
            this.elements.centerMap.addEventListener("click", () => this.centerMapOnCommand());
        }

        handleGameChange(change) {
            if (change.type === "NEW_GAME") {
                this.clearSelection();
                const playerStart = this.game.state.getTerritoriesOwnedBy(this.game.playerId)[0];
                if (playerStart) this.renderer.focusTerritory(playerStart.id, 0.72);
                this.renderStaticGameInfo();
                this.renderEvents();
            } else if (change.type === "EVENT_ADDED") {
                this.renderEvents();
            } else if (change.type === "TERRITORY_CAPTURED") {
                const faction = this.game.state.getFaction(change.ownerId);
                this.renderer.pulseTerritory(change.territoryId, faction ? faction.color : "#d8ff68");
                this.refreshDynamic();
            } else if (change.type === "ATTACK_REPELLED" || change.type === "ARMY_ARRIVED" || change.type === "ARMY_ROUTE_STOPPED") {
                this.renderer.pulseTerritory(change.territoryId, "#e9f1f0");
                this.refreshDynamic();
            } else if (change.type.startsWith("REINFORCEMENT_ROUTE_")) {
                this.refreshDynamic();
            } else if (change.type === "PAUSE_CHANGED" || change.type === "TIME_SCALE_CHANGED") {
                this.renderPauseState();
            }
        }

        handleTerritoryClick(territory) {
            if (!territory) {
                this.clearSelection();
                return;
            }

            const selected = this.game.state.getTerritory(this.selectedTerritoryId);
            if (selected && selected.ownerId === this.game.playerId && selected.isPathBlocked(territory.id)) {
                this.showToast("Une chaîne de montagnes rend cette frontière infranchissable.");
                return;
            }
            const isReachableFromSelected = selected &&
                selected.ownerId === this.game.playerId &&
                selected.id !== territory.id &&
                selected.isNeighbor(territory.id) &&
                !selected.isPathBlocked(territory.id);

            if (isReachableFromSelected) {
                // Un second clic sur un voisin, allié ou hostile, définit toujours
                // une destination. Cela permet les renforts entre territoires alliés.
                this.targetTerritoryId = territory.id;
                this.plannedRoute = [];
            } else if (territory.ownerId === this.game.playerId) {
                this.selectedTerritoryId = territory.id;
                this.targetTerritoryId = null;
                this.plannedRoute = [];
                this.lastRouteKey = null;
            } else if (selected && selected.ownerId === this.game.playerId) {
                if (selected.isNeighbor(territory.id)) {
                    this.targetTerritoryId = territory.id;
                    this.plannedRoute = [];
                } else {
                    this.showToast("Cette cible n’est pas adjacente au territoire sélectionné.");
                    return;
                }
            } else {
                this.selectedTerritoryId = territory.id;
                this.targetTerritoryId = null;
                this.lastRouteKey = null;
            }

            this.syncSelection();
        }

        handleTerritoryRightClick(territory) {
            if (!territory) return;
            const source = this.game.state.getTerritory(this.selectedTerritoryId);

            if (!source || source.ownerId !== this.game.playerId) {
                if (territory.ownerId === this.game.playerId) {
                    this.selectedTerritoryId = territory.id;
                    this.targetTerritoryId = null;
                    this.plannedRoute = [];
                    this.lastRouteKey = null;
                    this.syncSelection();
                    this.showToast("Origine sélectionnée. Faites un clic droit sur la destination alliée.");
                } else {
                    this.showToast("Sélectionnez d’abord un territoire de l’Empire.");
                }
                return;
            }

            if (territory.ownerId !== this.game.playerId) {
                this.showToast("Les convois longue distance ne peuvent traverser que vos territoires.");
                return;
            }
            if (territory.id === source.id) {
                this.showToast("Choisissez un autre territoire de destination.");
                return;
            }

            const path = this.game.findOwnedPath(this.game.playerId, source.id, territory.id);
            if (!path) {
                this.showToast("Aucun itinéraire allié ne contourne les montagnes jusqu’à cette destination.");
                return;
            }

            this.targetTerritoryId = territory.id;
            this.plannedRoute = path;
            this.lastRouteKey = null;
            this.syncSelection();
        }

        chooseNeighbor(territoryId) {
            const source = this.game.state.getTerritory(this.selectedTerritoryId);
            const target = this.game.state.getTerritory(territoryId);
            if (!source || !target) return;
            if (source.ownerId !== this.game.playerId) {
                this.showToast("Sélectionnez d’abord un territoire de l’Empire.");
                return;
            }
            if (source.isPathBlocked(target.id)) {
                this.showToast("Une chaîne de montagnes rend cette frontière infranchissable.");
                return;
            }
            this.targetTerritoryId = target.id;
            this.plannedRoute = [];
            this.syncSelection();
        }

        launchAttack() {
            const source = this.game.state.getTerritory(this.selectedTerritoryId);
            const target = this.game.state.getTerritory(this.targetTerritoryId);
            if (!source || !target) return;
            const createContinuousRoute = this.plannedRoute.length > 1 && this.elements.continuousRoute.checked;
            const command = {
                type: createContinuousRoute
                    ? "CREATE_CONTINUOUS_REINFORCEMENT_ROUTE"
                    : this.plannedRoute.length > 1
                        ? "SEND_REINFORCEMENT_ROUTE"
                        : "SEND_ARMY",
                playerId: this.game.playerId,
                fromTerritoryId: source.id,
                toTerritoryId: target.id,
                units: Number(this.elements.attackUnits.value)
            };
            const result = this.game.executeCommand(command);
            if (!result.ok) {
                this.showToast(result.error);
                return;
            }
            if (createContinuousRoute) this.showToast("Flux continu activé : chaque nouvelle unité sera acheminée.");
            this.elements.continuousRoute.checked = false;
            this.clearSelection();
        }

        stopContinuousRoute() {
            const routeId = Number(this.elements.stopRouteButton.dataset.routeId);
            if (!routeId) return;
            const result = this.game.executeCommand({
                type: "CANCEL_CONTINUOUS_REINFORCEMENT_ROUTE",
                playerId: this.game.playerId,
                routeId
            });
            if (!result.ok) this.showToast(result.error);
            else {
                this.showToast("Flux continu arrêté. Les convois déjà partis terminent leur trajet.");
                this.clearSelection();
            }
        }

        clearSelection() {
            this.selectedTerritoryId = null;
            this.targetTerritoryId = null;
            this.plannedRoute = [];
            this.lastRouteKey = null;
            this.syncSelection();
        }

        syncSelection() {
            this.renderer.setSelection(this.selectedTerritoryId, this.targetTerritoryId, this.plannedRoute);
            this.renderTerritoryPanel();
        }

        renderStaticGameInfo() {
            const player = this.game.state.getFaction(this.game.playerId);
            this.elements.playerFactionName.textContent = player.name;
            this.elements.playerFactionDot.style.background = player.color;
            this.elements.playerFactionDot.style.color = player.color;
            this.elements.mapSeed.textContent = `CARTE #${String(this.game.state.seed).padStart(6, "0")}`;
            this.renderLegend();
            this.renderPauseState();
            this.refreshDynamic();
        }

        renderLegend() {
            this.elements.factionLegend.replaceChildren();
            const factions = this.game.state.factions.concat([{ id: null, name: "Neutre", color: "#66777d" }]);
            factions.forEach((faction) => {
                const item = document.createElement("span");
                item.className = "legend-item";
                const dot = document.createElement("span");
                dot.className = "legend-dot";
                dot.style.background = faction.color;
                const controlLabel = faction.id !== null && faction.id !== this.game.playerId ? " · IA" : "";
                item.append(dot, document.createTextNode(`${faction.name}${controlLabel}`));
                this.elements.factionLegend.append(item);
            });
            const mountains = document.createElement("span");
            mountains.className = "legend-item";
            mountains.innerHTML = '<span class="legend-mountain">▲</span> Montagnes';
            this.elements.factionLegend.append(mountains);
        }

        renderTerritoryPanel() {
            const territory = this.game.state.getTerritory(this.selectedTerritoryId);
            if (!territory) {
                this.elements.territoryName.textContent = "Aucun territoire";
                this.elements.territoryId.textContent = "—";
                this.elements.emptySelection.hidden = false;
                this.elements.territoryDetails.hidden = true;
                return;
            }

            const faction = this.game.state.getFaction(territory.ownerId);
            const type = C.TERRITORY_TYPES[territory.terrain];
            const ownerColor = faction ? faction.color : "#66777d";
            this.elements.emptySelection.hidden = true;
            this.elements.territoryDetails.hidden = false;
            this.elements.territoryName.textContent = territory.name;
            this.elements.territoryId.textContent = `T-${String(territory.id).padStart(2, "0")}`;
            this.elements.ownerName.textContent = faction ? faction.name : "Forces neutres";
            this.elements.ownerSwatch.style.background = ownerColor;
            this.elements.ownerSwatch.style.color = ownerColor;
            this.elements.selectedUnits.textContent = territory.units;
            this.elements.terrainIcon.textContent = type.icon;
            this.elements.terrainName.textContent = type.name;
            this.elements.resourceName.textContent = territory.resource || "Aucune";
            this.elements.territoryProduction.textContent = territory.ownerId === null
                ? "Inactive"
                : `+${this.formatNumber(this.game.getTerritoryProductionPerMinute(territory))}/min`;

            this.renderBonuses(territory, type, faction);
            this.renderNeighbors(territory);
            this.renderActiveRoute(territory);
            this.renderAttackPanel(territory);
        }

        renderActiveRoute(territory) {
            const route = this.game.state.reinforcementRoutes.find((candidate) =>
                candidate.active && candidate.ownerId === this.game.playerId && candidate.fromTerritoryId === territory.id);
            this.elements.activeRoutePanel.hidden = !route;
            if (!route) return;

            const source = this.game.state.getTerritory(route.fromTerritoryId);
            const destination = this.game.state.getTerritory(route.toTerritoryId);
            this.elements.activeRouteSource.textContent = source ? source.name : "—";
            this.elements.activeRouteTarget.textContent = destination ? destination.name : "—";
            this.elements.routeDispatched.textContent = route.unitsDispatched;
            this.elements.routeDelivered.textContent = route.unitsDelivered;
            this.elements.activeRouteStatus.textContent = route.isPaused ? "EN PAUSE" : "EN LIGNE";
            this.elements.activeRouteStatus.classList.toggle("paused", route.isPaused);
            this.elements.activeRouteStatus.title = route.pauseReason || "Chaque unité produite est automatiquement expédiée";
            this.elements.stopRouteButton.dataset.routeId = String(route.id);
        }

        renderBonuses(territory, type, faction) {
            this.elements.bonusList.replaceChildren();
            const entries = type.bonuses.map((label) => ({ label, rare: false }));
            if (territory.rareSite) {
                entries.unshift({ label: `Site rare : ${territory.rareSite.name}`, rare: true });
                territory.rareSite.bonuses.forEach((label) => entries.push({ label, rare: true }));
            }
            if (faction) entries.push({ label: `${faction.name} — ${faction.bonusLabel}`, rare: false });
            entries.forEach((entry) => {
                const item = document.createElement("li");
                if (entry.rare) item.className = "rare";
                item.textContent = entry.label;
                this.elements.bonusList.append(item);
            });
        }

        renderNeighbors(territory) {
            this.elements.neighborCount.textContent = `${territory.neighbors.length} voisin${territory.neighbors.length > 1 ? "s" : ""}`;
            this.elements.neighborList.replaceChildren();
            territory.neighbors.forEach((neighborId) => {
                const neighbor = this.game.state.getTerritory(neighborId);
                if (!neighbor) return;
                const button = document.createElement("button");
                button.type = "button";
                button.className = "neighbor-chip";
                if (neighbor.ownerId !== territory.ownerId) button.classList.add("hostile");
                if (neighbor.id === this.targetTerritoryId) button.classList.add("targeted");
                const blocked = territory.isPathBlocked(neighbor.id);
                if (blocked) button.classList.add("blocked");
                button.textContent = `${blocked ? "▲ " : ""}${neighbor.name} · ${neighbor.units}`;
                button.title = blocked
                    ? `${neighbor.name} — passage bloqué par les montagnes`
                    : `${neighbor.name} — ${neighbor.units} unités`;
                button.disabled = blocked;
                button.addEventListener("click", () => this.chooseNeighbor(neighbor.id));
                this.elements.neighborList.append(button);
            });
        }

        renderAttackPanel(source) {
            const target = this.game.state.getTerritory(this.targetTerritoryId);
            const canCommand = source.ownerId === this.game.playerId;
            this.elements.selectionTip.hidden = !canCommand || Boolean(target);
            this.elements.attackPanel.hidden = !canCommand || !target;
            if (!canCommand || !target) return;

            this.elements.attackSource.textContent = source.name;
            this.elements.attackTarget.textContent = target.name;
            const isLongRoute = this.plannedRoute.length > 1;
            this.elements.routeArrow.textContent = isLongRoute ? "⇢" : "⟶";
            this.elements.routeSummary.hidden = !isLongRoute;
            this.elements.continuousControl.hidden = !isLongRoute;
            if (!isLongRoute) this.elements.continuousRoute.checked = false;
            if (isLongRoute) {
                const intermediateStops = Math.max(0, this.plannedRoute.length - 2);
                this.elements.routeSummary.textContent = `CONVOI · ${this.plannedRoute.length - 1} étapes · ${intermediateStops} relais intermédiaire${intermediateStops > 1 ? "s" : ""}`;
            }
            const maxUnits = Math.max(1, source.units - 1);
            const routeKey = `${source.id}-${target.id}-${this.plannedRoute.join(".")}`;
            this.elements.attackUnits.max = String(maxUnits);
            this.elements.attackMax.textContent = `${maxUnits} max.`;
            if (this.lastRouteKey !== routeKey) {
                this.elements.attackUnits.value = String(Math.max(1, Math.floor(maxUnits * 0.65)));
                this.elements.continuousRoute.checked = false;
                this.lastRouteKey = routeKey;
            } else if (Number(this.elements.attackUnits.value) > maxUnits) {
                this.elements.attackUnits.value = String(maxUnits);
            }
            this.elements.attackOutput.value = this.elements.attackUnits.value;
            const continuousEnabled = isLongRoute && this.elements.continuousRoute.checked;
            this.elements.unitSendControls.hidden = continuousEnabled;
            this.elements.attackButton.disabled = continuousEnabled ? false : source.units <= 1;
            this.elements.attackButton.firstChild.textContent = continuousEnabled
                ? "Activer le flux continu "
                : isLongRoute
                    ? "Acheminer les renforts "
                : target.ownerId === source.ownerId
                    ? "Envoyer le renfort "
                    : "Lancer l’offensive ";
        }

        renderEvents() {
            this.elements.eventList.replaceChildren();
            this.game.state.events.slice(0, 12).forEach((event) => {
                const item = document.createElement("div");
                item.className = `event-item ${event.tone}`;
                const time = document.createElement("span");
                time.className = "event-time";
                time.textContent = this.formatTime(event.timeMs);
                const message = document.createElement("span");
                message.textContent = event.message;
                item.append(time, message);
                this.elements.eventList.append(item);
            });
        }

        renderPauseState() {
            document.body.classList.toggle("simulation-paused", this.game.paused);
            this.elements.togglePause.setAttribute("aria-pressed", String(this.game.paused));
            this.elements.pauseIcon.textContent = this.game.paused ? "▶" : "Ⅱ";
            this.elements.pauseLabel.textContent = this.game.paused ? "Reprendre" : "Pause";
            this.elements.simulationStatus.textContent = this.game.paused
                ? "SIMULATION EN PAUSE"
                : `SIMULATION ACTIVE · RYTHME ${Math.round(this.game.timeScale * 100)} %`;
        }

        centerMapOnCommand() {
            const selected = this.game.state.getTerritory(this.selectedTerritoryId);
            const playerStart = this.game.state.getTerritoriesOwnedBy(this.game.playerId)[0];
            const focus = selected || playerStart;
            if (focus) this.renderer.focusTerritory(focus.id);
            this.renderZoomLevel();
        }

        renderZoomLevel() {
            this.elements.zoomLevel.textContent = `${this.renderer.getZoomPercent()} %`;
        }

        refreshDynamic() {
            if (!this.game.state.factions.length) return;
            const stats = this.game.getFactionStats(this.game.playerId);
            this.elements.territoryCount.textContent = stats.territoryCount;
            this.elements.totalUnits.textContent = stats.totalUnits;
            this.elements.productionRate.textContent = `+${this.formatNumber(stats.productionPerMinute)}/min`;
            this.renderZoomLevel();
            if (this.selectedTerritoryId) this.renderTerritoryPanel();
        }

        showToast(message) {
            clearTimeout(this.toastTimer);
            this.elements.toast.textContent = message;
            this.elements.toast.classList.add("visible");
            this.toastTimer = setTimeout(() => this.elements.toast.classList.remove("visible"), 2400);
        }

        formatNumber(value) {
            return Math.abs(value - Math.round(value)) < 0.05 ? String(Math.round(value)) : value.toFixed(1);
        }

        formatTime(milliseconds) {
            const totalSeconds = Math.floor(milliseconds / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
        }
    }

    C.UIController = UIController;
})(window.Conquest = window.Conquest || {});
