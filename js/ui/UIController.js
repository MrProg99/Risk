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
            this.researchTreeKey = null;
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
                openResearch: byId("open-research"),
                researchTopStatus: byId("research-top-status"),
                researchScreen: byId("research-screen"),
                closeResearch: byId("close-research"),
                researchTree: byId("research-tree"),
                researchCurrentIcon: byId("research-current-icon"),
                researchCurrentName: byId("research-current-name"),
                researchCurrentDetail: byId("research-current-detail"),
                researchProgressTime: byId("research-progress-time"),
                researchProgressPercent: byId("research-progress-percent"),
                researchProgressBar: byId("research-progress-bar"),
                researchRate: byId("research-rate"),
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
                routeRelayedRow: byId("route-relayed-row"),
                routeRelayed: byId("route-relayed"),
                stopRouteButton: byId("stop-route-button"),
                attackPanel: byId("attack-panel"),
                attackSource: byId("attack-source"),
                attackTarget: byId("attack-target"),
                routeArrow: byId("route-arrow"),
                routeSummary: byId("route-summary"),
                continuousControl: byId("continuous-control"),
                continuousRoute: byId("continuous-route"),
                relayAllControl: byId("relay-all-control"),
                relayAllReinforcements: byId("relay-all-reinforcements"),
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
            this.input.onQuickTransfer((source, target) => this.handleQuickTransfer(source, target));
            this.input.onContinuousTransfer((source, target) => this.handleContinuousTransfer(source, target));

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

            this.elements.continuousRoute.addEventListener("change", () => {
                if (!this.elements.continuousRoute.checked) this.elements.relayAllReinforcements.checked = false;
                this.renderTerritoryPanel();
            });
            this.elements.relayAllReinforcements.addEventListener("change", () => this.renderTerritoryPanel());

            this.elements.attackButton.addEventListener("click", () => this.launchAttack());
            this.elements.stopRouteButton.addEventListener("click", () => this.stopContinuousRoute());
            this.elements.openResearch.addEventListener("click", () => this.openResearchScreen());
            this.elements.closeResearch.addEventListener("click", () => this.closeResearchScreen());
            this.elements.researchScreen.addEventListener("click", (event) => {
                if (event.target === this.elements.researchScreen) this.closeResearchScreen();
            });
            document.addEventListener("keydown", (event) => {
                if (event.key === "Escape" && !this.elements.researchScreen.hidden) this.closeResearchScreen();
            });
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
                this.closeResearchScreen(false);
                this.researchTreeKey = null;
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
            } else if (change.type === "CANNON_FIRED") {
                this.renderer.fireCannon(change.fromTerritoryId, change.targetTerritoryId, change.hit);
                if (change.hit) this.renderer.pulseTerritory(change.targetTerritoryId, "#ffd36f");
                this.refreshDynamic();
            } else if (change.type === "WORLD_EVENT_WARNING") {
                const definition = C.WORLD_EVENT_DEFINITIONS[change.eventType];
                if (definition) this.showToast(`ALERTE : ${definition.name} imminente.`);
            } else if (change.type === "WORLD_EVENT_STARTED") {
                const definition = C.WORLD_EVENT_DEFINITIONS[change.worldEvent.type];
                change.worldEvent.territoryIds.forEach((territoryId) =>
                    this.renderer.pulseTerritory(territoryId, definition ? definition.color : "#ff844d"));
                if (definition) this.showToast(`${definition.name} — consultez le journal tactique.`);
                this.refreshDynamic();
            } else if (change.type === "WORLD_EVENT_ENDED" || change.type === "BARBARIAN_RAID_RESOLVED") {
                this.refreshDynamic();
            } else if (change.type.startsWith("REINFORCEMENT_ROUTE_")) {
                this.refreshDynamic();
            } else if (change.type === "RESEARCH_STARTED" || change.type === "RESEARCH_COMPLETED") {
                this.researchTreeKey = null;
                this.refreshResearchStatus();
                if (change.type === "RESEARCH_COMPLETED" && change.factionId === this.game.playerId) {
                    const technology = C.TECHNOLOGIES[change.technologyId];
                    if (technology) this.showToast(`Recherche terminée : ${technology.name}.`);
                }
            } else if (change.type === "PAUSE_CHANGED" || change.type === "TIME_SCALE_CHANGED") {
                this.renderPauseState();
            }
        }

        openResearchScreen() {
            this.elements.researchScreen.hidden = false;
            document.body.classList.add("research-open");
            this.researchTreeKey = null;
            this.refreshResearchStatus();
            this.elements.closeResearch.focus();
        }

        closeResearchScreen(restoreFocus = true) {
            this.elements.researchScreen.hidden = true;
            document.body.classList.remove("research-open");
            if (restoreFocus) this.elements.openResearch.focus();
        }

        startResearch(technologyId) {
            const result = this.game.executeCommand({
                type: "START_RESEARCH",
                playerId: this.game.playerId,
                technologyId
            });
            if (!result.ok) {
                this.showToast(result.error);
                return;
            }
            this.researchTreeKey = null;
            this.refreshResearchStatus();
        }

        refreshResearchStatus() {
            const status = this.game.getResearchState(this.game.playerId);
            if (!status) return;
            const { faction, activeTechnology, progressMs, rate } = status;
            const completed = faction.research.completedTechnologyIds.length;
            const total = Object.keys(C.TECHNOLOGIES).length;
            const treeKey = `${completed}|${faction.research.activeTechnologyId || "none"}`;
            if (treeKey !== this.researchTreeKey) {
                this.researchTreeKey = treeKey;
                this.renderResearchTree(faction);
            }

            this.elements.researchRate.textContent = `Vitesse scientifique ×${rate.toFixed(2).replace(".", ",")}`;
            if (!activeTechnology) {
                this.elements.researchTopStatus.textContent = completed === total ? "Arbre complété" : "Disponible";
                this.elements.researchCurrentIcon.textContent = completed === total ? "✓" : "⌬";
                this.elements.researchCurrentName.textContent = completed === total
                    ? "Toutes les technologies sont débloquées"
                    : "Aucune recherche sélectionnée";
                this.elements.researchCurrentDetail.textContent = completed === total
                    ? `${completed}/${total} technologies terminées.`
                    : "Choisissez un palier disponible dans l’un des trois axes.";
                this.elements.researchProgressTime.textContent = "EN ATTENTE";
                this.elements.researchProgressPercent.textContent = `${completed}/${total}`;
                this.elements.researchProgressBar.style.width = "0%";
                return;
            }

            const branch = C.TECHNOLOGY_BRANCHES.find((candidate) => candidate.id === activeTechnology.branchId);
            const progress = C.Geometry.clamp(progressMs / activeTechnology.durationMs, 0, 1);
            const remainingMs = Math.max(0, (activeTechnology.durationMs - progressMs) / Math.max(rate, 0.01));
            this.elements.researchTopStatus.textContent = `${Math.floor(progress * 100)} % · ${activeTechnology.name}`;
            this.elements.researchCurrentIcon.textContent = branch ? branch.icon : "⌬";
            this.elements.researchCurrentName.textContent = activeTechnology.name;
            this.elements.researchCurrentDetail.textContent = `${branch ? branch.name : "Recherche"} · ${activeTechnology.effectLabel}`;
            this.elements.researchProgressTime.textContent = `${this.formatDuration(remainingMs)} RESTANT`;
            this.elements.researchProgressPercent.textContent = `${Math.floor(progress * 100)} %`;
            this.elements.researchProgressBar.style.width = `${progress * 100}%`;
        }

        renderResearchTree(faction) {
            const completed = faction.research.completedTechnologyIds;
            const activeId = faction.research.activeTechnologyId;
            this.elements.researchTree.replaceChildren();

            C.TECHNOLOGY_BRANCHES.forEach((branch) => {
                const column = document.createElement("section");
                column.className = `research-branch research-branch-${branch.id}`;
                column.style.setProperty("--branch-color", branch.color);

                const header = document.createElement("header");
                header.className = "research-branch-header";
                const icon = document.createElement("span");
                icon.textContent = branch.icon;
                const heading = document.createElement("div");
                heading.innerHTML = `<h3>${branch.name}</h3><p>${branch.description}</p>`;
                header.append(icon, heading);
                column.append(header);

                const track = document.createElement("div");
                track.className = "research-branch-track";
                branch.technologyIds.forEach((technologyId) => {
                    const technology = C.TECHNOLOGIES[technologyId];
                    const isCompleted = completed.includes(technology.id);
                    const isActive = technology.id === activeId;
                    const isUnlocked = !technology.prerequisiteId || completed.includes(technology.prerequisiteId);
                    const isAvailable = !activeId && !isCompleted && isUnlocked;
                    const node = document.createElement("article");
                    node.className = "technology-node";
                    if (isCompleted) node.classList.add("completed");
                    else if (isActive) node.classList.add("active");
                    else if (isAvailable) node.classList.add("available");
                    else if (isUnlocked) node.classList.add("waiting");
                    else node.classList.add("locked");

                    const statusLabel = isCompleted ? "DÉBLOQUÉE" : isActive ? "EN COURS" : isAvailable ? "DISPONIBLE" : isUnlocked ? "EN ATTENTE" : "VERROUILLÉE";
                    node.innerHTML = `
                        <div class="technology-node-heading">
                            <span>PALIER ${technology.tier}</span>
                            <strong>${statusLabel}</strong>
                        </div>
                        <h4>${technology.name}</h4>
                        <p>${technology.description}</p>
                        <div class="technology-effect">${technology.effectLabel}</div>
                        <div class="technology-meta">
                            <span>⌛ ${this.formatDuration(technology.durationMs)}</span>
                            <span>${isCompleted ? "✓ Acquise" : isActive ? "◉ Laboratoire actif" : isUnlocked ? "Prête" : "Prérequis requis"}</span>
                        </div>`;

                    const button = document.createElement("button");
                    button.type = "button";
                    button.className = "technology-start";
                    button.textContent = isCompleted ? "Débloquée" : isActive ? "Recherche en cours" : isAvailable ? "Lancer la recherche" : isUnlocked ? "Laboratoire occupé" : "Verrouillée";
                    button.disabled = !isAvailable;
                    if (isAvailable) button.addEventListener("click", () => this.startResearch(technology.id));
                    node.append(button);
                    track.append(node);
                });
                column.append(track);
                this.elements.researchTree.append(column);
            });
        }

        handleTerritoryClick(territory) {
            if (!territory) {
                this.clearSelection();
                return;
            }

            if (territory.isImpassable) {
                this.selectedTerritoryId = territory.id;
                this.targetTerritoryId = null;
                this.plannedRoute = [];
                this.lastRouteKey = null;
                this.syncSelection();
                this.showToast(`${territory.name} est infranchissable.`);
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
                    this.showToast(`Sélectionnez d’abord un territoire de la faction ${this.getPlayerFactionName()}.`);
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

        handleQuickTransfer(source, target) {
            if (!source || !target || source.id === target.id) return;
            if (source.ownerId !== this.game.playerId || target.ownerId !== this.game.playerId) {
                this.showToast(`Le transfert rapide doit relier deux territoires de la faction ${this.getPlayerFactionName()}.`);
                return;
            }
            if (source.units <= 1) {
                this.showToast("Ce territoire n’a aucune unité disponible à transférer.");
                return;
            }

            const path = this.game.findOwnedPath(this.game.playerId, source.id, target.id);
            if (!path) {
                this.showToast("Aucun itinéraire allié ne contourne les montagnes jusqu’à cette destination.");
                return;
            }

            const units = Math.max(1, Math.floor((source.units - 1) * 0.5));
            const result = this.game.executeCommand({
                type: "SEND_REINFORCEMENT_ROUTE",
                playerId: this.game.playerId,
                fromTerritoryId: source.id,
                toTerritoryId: target.id,
                units
            });
            if (!result.ok) {
                this.showToast(result.error);
                return;
            }

            this.clearSelection();
            this.showToast(`${units} unité${units > 1 ? "s" : ""} transférée${units > 1 ? "s" : ""} vers ${target.name}.`);
        }

        handleContinuousTransfer(source, target) {
            if (!source || !target || source.id === target.id) return;
            if (source.ownerId !== this.game.playerId || target.ownerId !== this.game.playerId) {
                this.showToast(`Le flux continu doit relier deux territoires de la faction ${this.getPlayerFactionName()}.`);
                return;
            }

            const path = this.game.findOwnedPath(this.game.playerId, source.id, target.id);
            if (!path) {
                this.showToast("Aucun itinéraire allié ne contourne les montagnes jusqu’à cette destination.");
                return;
            }

            const previousRoute = this.game.state.reinforcementRoutes.find((route) =>
                route.active && route.ownerId === this.game.playerId && route.fromTerritoryId === source.id);
            const result = this.game.executeCommand({
                type: "CREATE_CONTINUOUS_REINFORCEMENT_ROUTE",
                playerId: this.game.playerId,
                fromTerritoryId: source.id,
                toTerritoryId: target.id,
                relayAllReinforcements: Boolean(previousRoute?.relayAllReinforcements)
            });
            if (!result.ok) {
                this.showToast(result.error);
                return;
            }

            this.clearSelection();
            this.showToast(previousRoute
                ? `Flux continu redirigé vers ${target.name}.`
                : `Flux continu activé vers ${target.name}.`);
        }

        chooseNeighbor(territoryId) {
            const source = this.game.state.getTerritory(this.selectedTerritoryId);
            const target = this.game.state.getTerritory(territoryId);
            if (!source || !target) return;
            if (target.isImpassable) {
                this.showToast(`${target.name} est infranchissable.`);
                return;
            }
            if (source.ownerId !== this.game.playerId) {
                this.showToast(`Sélectionnez d’abord un territoire de la faction ${this.getPlayerFactionName()}.`);
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
                units: Number(this.elements.attackUnits.value),
                relayAllReinforcements: createContinuousRoute && this.elements.relayAllReinforcements.checked
            };
            const result = this.game.executeCommand(command);
            if (!result.ok) {
                this.showToast(result.error);
                return;
            }
            if (createContinuousRoute) {
                this.showToast(this.elements.relayAllReinforcements.checked
                    ? "Hub activé : garnison, production et renforts reçus seront relayés."
                    : "Flux continu activé : chaque nouvelle unité sera acheminée.");
            }
            this.elements.continuousRoute.checked = false;
            this.elements.relayAllReinforcements.checked = false;
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
            this.elements.centerMap.title = `Recentrer sur ${player.name}`;
            this.elements.centerMap.setAttribute("aria-label", `Recentrer sur ${player.name}`);
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
            const barbarians = document.createElement("span");
            barbarians.className = "legend-item";
            barbarians.innerHTML = `<span class="legend-dot" style="background:${C.BARBARIAN_FACTION.color}"></span> Barbares`;
            this.elements.factionLegend.append(barbarians);
            const mountains = document.createElement("span");
            mountains.className = "legend-item";
            mountains.innerHTML = '<span class="legend-mountain">▲</span> Montagnes';
            this.elements.factionLegend.append(mountains);
            const lakes = document.createElement("span");
            lakes.className = "legend-item";
            lakes.innerHTML = '<span class="legend-lake">≈</span> Lac infranchissable';
            this.elements.factionLegend.append(lakes);
            const cannon = document.createElement("span");
            cannon.className = "legend-item";
            cannon.innerHTML = '<span class="legend-cannon">✹</span> Canon';
            this.elements.factionLegend.append(cannon);
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
            this.elements.ownerName.textContent = territory.isImpassable ? "Zone infranchissable" : faction ? faction.name : "Forces neutres";
            this.elements.ownerSwatch.style.background = ownerColor;
            this.elements.ownerSwatch.style.color = ownerColor;
            this.elements.selectedUnits.textContent = territory.isImpassable ? "—" : territory.units;
            this.elements.terrainIcon.textContent = type.icon;
            this.elements.terrainName.textContent = type.name;
            this.elements.resourceName.textContent = territory.resource || "Aucune";
            this.elements.territoryProduction.textContent = territory.isImpassable
                ? "Impossible"
                : territory.ownerId === null
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
            this.elements.routeRelayedRow.hidden = !route.relayAllReinforcements;
            this.elements.routeRelayed.textContent = route.unitsRelayed;
            this.elements.activeRouteStatus.textContent = route.isPaused
                ? "EN PAUSE"
                : route.relayAllReinforcements ? "HUB ACTIF" : "EN LIGNE";
            this.elements.activeRouteStatus.classList.toggle("paused", route.isPaused);
            this.elements.activeRouteStatus.title = route.pauseReason || (route.relayAllReinforcements
                ? "La garnison disponible, la production et tous les renforts reçus sont relayés"
                : "Chaque unité produite est automatiquement expédiée");
            this.elements.stopRouteButton.dataset.routeId = String(route.id);
        }

        renderBonuses(territory, type, faction) {
            this.elements.bonusList.replaceChildren();
            const entries = type.bonuses.map((label) => ({ label, rare: false }));
            this.game.state.worldEvents
                .filter((worldEvent) => worldEvent.territoryIds.includes(territory.id))
                .forEach((worldEvent) => {
                    const definition = C.WORLD_EVENT_DEFINITIONS[worldEvent.type];
                    if (!definition) return;
                    const remainingSeconds = Math.max(0, Math.ceil((worldEvent.endsAtMs - this.game.state.elapsedMs) / 1000));
                    const effect = worldEvent.type === "famine"
                        ? `production suspendue · ${remainingSeconds} s`
                        : worldEvent.type === "wildfire"
                            ? `${worldEvent.data.damage || 0} unités détruites`
                            : `raid en approche · ${remainingSeconds} s`;
                    entries.unshift({ label: `${definition.name} : ${effect}`, rare: false, worldEvent: true });
                });
            if (territory.installation) {
                const installation = C.INSTALLATION_TYPES[territory.installation.type];
                if (installation) {
                    entries.unshift(
                        { label: `Installation : ${installation.name}`, rare: true },
                        { label: installation.bonusLabel, rare: true }
                    );
                }
            }
            if (territory.rareSite) {
                entries.unshift({ label: `Site rare : ${territory.rareSite.name}`, rare: true });
                territory.rareSite.bonuses.forEach((label) => entries.push({ label, rare: true }));
            }
            if (faction) entries.push({ label: `${faction.name} — ${faction.bonusLabel}`, rare: false });
            entries.forEach((entry) => {
                const item = document.createElement("li");
                if (entry.rare) item.className = "rare";
                if (entry.worldEvent) item.className = "world-event";
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
                const impassable = neighbor.isImpassable;
                if (territory.isImpassable || blocked || impassable) button.classList.add("blocked");
                button.textContent = `${impassable ? "≈ " : blocked ? "▲ " : ""}${neighbor.name}${impassable ? "" : ` · ${neighbor.units}`}`;
                button.title = impassable
                    ? `${neighbor.name} — lac infranchissable`
                    : blocked
                    ? `${neighbor.name} — passage bloqué par les montagnes`
                    : `${neighbor.name} — ${neighbor.units} unités`;
                button.disabled = territory.isImpassable || blocked || impassable;
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
            if (!isLongRoute) {
                this.elements.continuousRoute.checked = false;
                this.elements.relayAllReinforcements.checked = false;
            }
            if (isLongRoute) {
                const intermediateStops = Math.max(0, this.plannedRoute.length - 2);
                this.elements.routeSummary.textContent = `CONVOI · ${this.plannedRoute.length - 1} étapes · ${intermediateStops} relais intermédiaire${intermediateStops > 1 ? "s" : ""}`;
            }
            const maxUnits = Math.max(1, source.units - 1);
            const routeKey = `${source.id}-${target.id}-${this.plannedRoute.join(".")}`;
            this.elements.attackUnits.max = String(maxUnits);
            this.elements.attackMax.textContent = `${maxUnits} max.`;
            if (this.lastRouteKey !== routeKey) {
                const existingRoute = this.game.state.reinforcementRoutes.find((route) =>
                    route.active && route.ownerId === this.game.playerId && route.fromTerritoryId === source.id);
                this.elements.attackUnits.value = String(Math.max(1, Math.floor(maxUnits * 0.65)));
                this.elements.continuousRoute.checked = false;
                this.elements.relayAllReinforcements.checked = Boolean(existingRoute?.relayAllReinforcements);
                this.lastRouteKey = routeKey;
            } else if (Number(this.elements.attackUnits.value) > maxUnits) {
                this.elements.attackUnits.value = String(maxUnits);
            }
            this.elements.attackOutput.value = this.elements.attackUnits.value;
            const continuousEnabled = isLongRoute && this.elements.continuousRoute.checked;
            this.elements.relayAllReinforcements.disabled = !continuousEnabled;
            this.elements.relayAllControl.classList.toggle("disabled", !continuousEnabled);
            this.elements.unitSendControls.hidden = continuousEnabled;
            this.elements.attackButton.disabled = continuousEnabled ? false : source.units <= 1;
            this.elements.attackButton.firstChild.textContent = continuousEnabled
                ? this.elements.relayAllReinforcements.checked
                    ? "Activer le hub "
                    : "Activer le flux continu "
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
            this.refreshResearchStatus();
            this.renderZoomLevel();
            if (this.selectedTerritoryId) this.renderTerritoryPanel();
        }

        showToast(message) {
            clearTimeout(this.toastTimer);
            this.elements.toast.textContent = message;
            this.elements.toast.classList.add("visible");
            this.toastTimer = setTimeout(() => this.elements.toast.classList.remove("visible"), 2400);
        }

        getPlayerFactionName() {
            const faction = this.game.state.getFaction(this.game.playerId);
            return faction ? faction.name : "votre faction";
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

        formatDuration(milliseconds) {
            const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            return `${minutes}:${String(seconds).padStart(2, "0")}`;
        }
    }

    C.UIController = UIController;
})(window.Conquest = window.Conquest || {});
