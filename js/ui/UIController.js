(function (C) {
    "use strict";

    class UIController {
        constructor(game, renderer, input, audio = null) {
            this.game = game;
            this.renderer = renderer;
            this.input = input;
            this.audio = audio;
            this.selectedTerritoryId = null;
            this.multiSelectedTerritoryIds = new Set();
            this.targetTerritoryId = null;
            this.plannedRoute = [];
            this.lastRouteKey = null;
            this.airstrikeSourceId = null;
            this.targetingAbilityId = null;
            this.lastEventId = null;
            this.lastLostTerritoryId = null;
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
                foodStat: byId("food-stat"),
                foodSupply: byId("food-supply"),
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
                victoryScreen: byId("victory-screen"),
                victoryOutcome: byId("victory-outcome"),
                victoryTitle: byId("victory-title"),
                victorySubtitle: byId("victory-subtitle"),
                victoryDuration: byId("victory-duration"),
                victoryMap: byId("victory-map"),
                victoryTeam: byId("victory-team"),
                victoryStandings: byId("victory-standings"),
                victoryObserve: byId("victory-observe"),
                victoryRestart: byId("victory-restart"),
                matchSummary: byId("match-summary"),
                abilityMissile: byId("ability-missile"),
                abilityMissileStatus: byId("ability-missile-status"),
                abilityReinforcement: byId("ability-reinforcement"),
                abilityReinforcementStatus: byId("ability-reinforcement-status"),
                abilityParatrooper: byId("ability-paratrooper"),
                abilityParatrooperStatus: byId("ability-paratrooper-status"),
                abilityNuclear: byId("ability-nuclear"),
                abilityNuclearStatus: byId("ability-nuclear-status"),
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
                productionModePanel: byId("production-mode-panel"),
                productionModeStatus: byId("production-mode-status"),
                productionModeDetail: byId("production-mode-detail"),
                modeUnits: byId("mode-units"),
                modeFood: byId("mode-food"),
                modeResearch: byId("mode-research"),
                territoryProduction: byId("territory-production"),
                bonusList: byId("bonus-list"),
                airportPanel: byId("airport-panel"),
                airportStatus: byId("airport-status"),
                airportDetail: byId("airport-detail"),
                airstrikeButton: byId("airstrike-button"),
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
                selectionTip: byId("selection-tip")
            };
        }

        bindEvents() {
            this.input.onTerritoryClick((territory, event) => this.handleTerritoryClick(territory, event));
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
            this.elements.airstrikeButton.addEventListener("click", () => this.toggleAirstrikeTargeting());
            this.elements.abilityMissile.addEventListener("click", () => this.toggleAbilityTargeting("missile"));
            this.elements.abilityReinforcement.addEventListener("click", () => this.toggleAbilityTargeting("reinforcement"));
            this.elements.abilityParatrooper.addEventListener("click", () => this.toggleAbilityTargeting("paratrooper"));
            this.elements.abilityNuclear.addEventListener("click", () => this.toggleAbilityTargeting("nuclear"));
            this.elements.modeUnits.addEventListener("click", () => this.setTerritoryMode("units"));
            this.elements.modeFood.addEventListener("click", () => this.setTerritoryMode("food"));
            this.elements.modeResearch.addEventListener("click", () => this.setTerritoryMode("research"));
            this.elements.stopRouteButton.addEventListener("click", () => this.stopContinuousRoute());
            this.elements.openResearch.addEventListener("click", () => this.openResearchScreen());
            this.elements.closeResearch.addEventListener("click", () => this.closeResearchScreen());
            this.elements.researchScreen.addEventListener("click", (event) => {
                if (event.target === this.elements.researchScreen) this.closeResearchScreen();
            });
            this.elements.victoryObserve.addEventListener("click", () => this.hideVictoryScreen());
            this.elements.victoryRestart.addEventListener("click", () => window.location.reload());
            this.elements.matchSummary.addEventListener("click", () => this.showVictoryScreen());
            document.addEventListener("keydown", (event) => {
                this.handleGlobalKeydown(event);
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
                this.lastLostTerritoryId = null;
                this.hideVictoryScreen(true);
                this.clearSelection();
                this.closeResearchScreen(false);
                this.researchTreeKey = null;
                const playerStart = this.game.state.getTerritoriesOwnedBy(this.game.playerId)[0];
                if (playerStart) this.renderer.focusTerritory(playerStart.id, 0.72);
                this.renderStaticGameInfo();
            } else if (change.type === "TERRITORY_CAPTURED") {
                const faction = this.game.state.getFaction(change.ownerId);
                this.renderer.pulseTerritory(change.territoryId, faction ? faction.color : "#d8ff68");
                if (change.previousOwnerId === this.game.playerId && change.ownerId !== this.game.playerId) {
                    const territory = this.game.state.getTerritory(change.territoryId);
                    this.lastLostTerritoryId = change.territoryId;
                    this.audio?.playTerritoryLost();
                    this.showToast(`Territoire perdu : ${territory ? territory.name : "position inconnue"} · Espace pour localiser.`);
                }
                this.refreshDynamic();
            } else if (change.type === "ATTACK_REPELLED" || change.type === "ARMY_ARRIVED" || change.type === "ARMY_ROUTE_STOPPED") {
                this.renderer.pulseTerritory(change.territoryId, "#e9f1f0");
                this.refreshDynamic();
            } else if (change.type === "CANNON_FIRED") {
                this.renderer.fireCannon(change.fromTerritoryId, change.targetTerritoryId, change.hit);
                if (change.hit) this.renderer.pulseTerritory(change.targetTerritoryId, "#ffd36f");
                this.refreshDynamic();
            } else if (change.type === "AIRSTRIKE_RESOLVED") {
                this.renderer.pulseTerritory(change.targetTerritoryId, "#75baff");
                this.refreshDynamic();
            } else if (change.type === "ABILITY_LAUNCHED") {
                this.renderer.pulseTerritory(change.targetTerritoryId, "#b58cff");
                if (change.factionId === this.game.playerId) {
                    this.showToast(change.abilityId === "nuclear"
                        ? "Bombe nucléaire lancée — impact dans 8 secondes. Zone périphérique dangereuse."
                        : change.abilityId === "paratrooper"
                            ? "35 parachutistes en approche — largage dans 7 secondes."
                            : "Missile lancé — impact dans 5 secondes.");
                }
                this.refreshDynamic();
            } else if (change.type === "ABILITY_RESOLVED") {
                const color = change.abilityId === "nuclear" ? "#fff1a1" : change.abilityId === "missile" ? "#ff865f" : "#d8ff68";
                this.renderer.pulseTerritory(change.targetTerritoryId, color);
                if (change.abilityId === "nuclear") {
                    (change.impacts || []).forEach((impact) => {
                        if (impact.territoryId !== change.targetTerritoryId) this.renderer.pulseTerritory(impact.territoryId, "#ff9f43");
                    });
                }
                this.refreshDynamic();
            } else if (change.type === "TERRITORY_MODE_CHANGED" || change.type === "FOOD_ATTRITION") {
                if (change.type === "FOOD_ATTRITION" && change.factionId === this.game.playerId) {
                    this.showToast(`Pénurie alimentaire : ${change.losses} unité${change.losses > 1 ? "s" : ""} perdue${change.losses > 1 ? "s" : ""}.`);
                }
                this.refreshDynamic();
            } else if (change.type === "WORLD_EVENT_WARNING") {
                const definition = C.WORLD_EVENT_DEFINITIONS[change.eventType];
                if (definition) this.showToast(`ALERTE : ${definition.name} imminente.`);
            } else if (change.type === "WORLD_EVENT_STARTED") {
                const definition = C.WORLD_EVENT_DEFINITIONS[change.worldEvent.type];
                change.worldEvent.territoryIds.forEach((territoryId) =>
                    this.renderer.pulseTerritory(territoryId, definition ? definition.color : "#ff844d"));
                if (definition) this.showToast(`${definition.name} en cours.`);
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
                    if (technology) {
                        this.audio?.playResearchComplete();
                        this.showToast(`Recherche terminée : ${technology.name}.`);
                    }
                }
            } else if (change.type === "GAME_OVER") {
                this.clearSelection();
                this.renderPauseState();
                this.showVictoryScreen();
            } else if (change.type === "PAUSE_CHANGED" || change.type === "TIME_SCALE_CHANGED") {
                this.renderPauseState();
            }
        }

        showVictoryScreen() {
            if (this.game.state.winnerTeamId === null || !this.elements.victoryScreen) return;
            this.closeResearchScreen(false);
            this.renderVictoryScreen();
            this.elements.victoryScreen.hidden = false;
            this.elements.matchSummary.hidden = true;
            document.body.classList.add("victory-open");
            this.elements.victoryObserve.focus();
        }

        hideVictoryScreen(reset = false) {
            if (!this.elements.victoryScreen) return;
            this.elements.victoryScreen.hidden = true;
            document.body.classList.remove("victory-open");
            this.elements.matchSummary.hidden = reset || this.game.state.winnerTeamId === null;
            if (!reset && !this.elements.matchSummary.hidden) this.elements.matchSummary.focus();
        }

        renderVictoryScreen() {
            const winnerTeamId = this.game.state.winnerTeamId;
            const playerFaction = this.game.state.getFaction(this.game.playerId);
            const playerWon = playerFaction?.teamId === winnerTeamId;
            const standings = this.game.getFinalStandings();
            const winners = standings.filter((entry) => entry.teamId === winnerTeamId);
            const durationMs = this.game.state.victoryAtMs ?? this.game.state.elapsedMs;
            this.elements.victoryOutcome.textContent = playerWon ? "Campagne victorieuse" : "Campagne terminée";
            this.elements.victoryTitle.textContent = playerWon ? "VICTOIRE" : "DÉFAITE";
            this.elements.victorySubtitle.textContent = playerWon
                ? `Votre équipe impose sa domination après ${this.formatDuration(durationMs)}.`
                : `L’équipe ${winnerTeamId} impose sa domination après ${this.formatDuration(durationMs)}.`;
            this.elements.victoryDuration.textContent = this.formatDuration(durationMs);
            this.elements.victoryMap.textContent = `Carte #${String(this.game.state.seed).padStart(6, "0")}`;

            const dots = document.createElement("span");
            dots.className = "victory-team-dots";
            winners.forEach((entry) => {
                const dot = document.createElement("i");
                dot.style.setProperty("--faction-color", entry.color);
                dots.append(dot);
            });
            const teamText = document.createElement("span");
            teamText.append("Équipe dominante : ");
            const teamName = document.createElement("strong");
            teamName.textContent = winners.map((entry) => entry.playerName || entry.name).join(" + ");
            teamText.append(teamName);
            this.elements.victoryTeam.replaceChildren(dots, teamText);

            this.elements.victoryStandings.replaceChildren(...standings.map((entry, index) => {
                const card = document.createElement("article");
                card.className = "victory-player";
                card.classList.toggle("winner", entry.teamId === winnerTeamId);
                card.classList.toggle("local-player", entry.factionId === this.game.playerId);
                card.style.setProperty("--player-color", entry.color);

                const heading = document.createElement("header");
                heading.className = "victory-player-heading";
                const dot = document.createElement("span");
                dot.className = "victory-player-dot";
                const identity = document.createElement("div");
                identity.className = "victory-player-identity";
                const commander = document.createElement("strong");
                commander.textContent = entry.playerName || entry.name;
                const detail = document.createElement("small");
                detail.textContent = `${entry.name} · Équipe ${entry.teamId} · ${entry.isAI ? "IA" : "Humain"}`;
                identity.append(commander, detail);
                const rank = document.createElement("span");
                rank.className = "victory-rank";
                rank.textContent = entry.teamId === winnerTeamId ? "Vainqueur" : `#${index + 1}`;
                heading.append(dot, identity, rank);

                const values = [
                    ["Territoires", entry.territoryCount],
                    ["Armée finale", entry.totalUnits],
                    ["Production finale", `+${Math.round(entry.productionPerMinute)}/min`],
                    ["Pic territorial", entry.statistics.peakTerritories],
                    ["Captures", entry.statistics.territoriesCaptured],
                    ["Territoires perdus", entry.statistics.territoriesLost],
                    ["Unités mobilisées", entry.statistics.unitsProduced],
                    ["Pertes", entry.statistics.unitsLost],
                    ["Ennemis détruits", entry.statistics.enemyUnitsDestroyed],
                    ["Attaques lancées", entry.statistics.attacksLaunched],
                    ["Combats gagnés", entry.statistics.battlesWon],
                    ["Recherches / capacités", `${entry.statistics.researchCompleted} / ${entry.statistics.abilitiesUsed}`]
                ];
                const statGrid = document.createElement("div");
                statGrid.className = "victory-stat-grid";
                values.forEach(([label, value]) => {
                    const stat = document.createElement("div");
                    stat.className = "victory-stat";
                    const caption = document.createElement("span");
                    caption.textContent = label;
                    const amount = document.createElement("strong");
                    amount.textContent = value;
                    stat.append(caption, amount);
                    statGrid.append(stat);
                });
                card.append(heading, statGrid);
                return card;
            }));
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
                    : "Choisissez un palier disponible dans l’un des quatre axes.";
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

        handleTerritoryClick(territory, event = {}) {
            if (!territory) {
                this.clearSelection();
                return;
            }

            if (!this.game.isTerritoryVisible(territory.id, this.game.playerId)) {
                this.clearSelection();
                this.showToast("Zone hors de portée : rapprochez un territoire pour obtenir des renseignements.");
                return;
            }

            if (this.targetingAbilityId) {
                this.useAbilityAt(territory);
                return;
            }

            if (this.airstrikeSourceId !== null) {
                this.launchAirstrikeAt(territory);
                return;
            }

            if (event.shiftKey) {
                if (territory.isImpassable || territory.ownerId !== this.game.playerId) {
                    this.showToast("La sélection multiple accepte uniquement vos territoires franchissables.");
                    return;
                }
                const current = this.game.state.getTerritory(this.selectedTerritoryId);
                if (!this.multiSelectedTerritoryIds.size && current && current.ownerId === this.game.playerId && !current.isImpassable) {
                    this.multiSelectedTerritoryIds.add(current.id);
                }
                if (this.multiSelectedTerritoryIds.has(territory.id)) this.multiSelectedTerritoryIds.delete(territory.id);
                else this.multiSelectedTerritoryIds.add(territory.id);
                const selectedIds = [...this.multiSelectedTerritoryIds];
                this.selectedTerritoryId = selectedIds.includes(this.selectedTerritoryId)
                    ? this.selectedTerritoryId
                    : selectedIds[0] ?? null;
                this.targetTerritoryId = null;
                this.plannedRoute = [];
                this.lastRouteKey = null;
                this.syncSelection();
                this.showToast(selectedIds.length
                    ? `${selectedIds.length} territoire${selectedIds.length > 1 ? "s" : ""} dans le groupe.`
                    : "Sélection multiple annulée.");
                return;
            }

            const leavingMultiSelection = this.multiSelectedTerritoryIds.size > 0;
            this.multiSelectedTerritoryIds.clear();
            if (leavingMultiSelection) {
                this.selectedTerritoryId = null;
                this.targetTerritoryId = null;
                this.plannedRoute = [];
                this.lastRouteKey = null;
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
            if (!this.game.isTerritoryVisible(territory.id, this.game.playerId)) {
                this.clearSelection();
                this.showToast("Impossible de donner un ordre dans le brouillard de guerre.");
                return;
            }
            const groupedSources = typeof this.getMultiSelectedTerritories === "function"
                ? this.getMultiSelectedTerritories()
                : [];
            if (groupedSources.length > 1) {
                if (!this.game.areAllied(territory.ownerId, this.game.playerId)) {
                    this.showToast("Une sélection multiple peut renforcer uniquement un territoire allié.");
                    return;
                }
                const result = this.game.executeCommand({
                    type: "BATCH_SEND_REINFORCEMENTS",
                    playerId: this.game.playerId,
                    fromTerritoryIds: groupedSources.map((source) => source.id),
                    toTerritoryId: territory.id
                });
                if (!result.ok) return this.showToast(result.error);
                this.clearSelection();
                if (result.pending) {
                    this.showToast("Ordre de renfort groupé transmis à l’hôte.");
                } else {
                    const skipped = result.skippedCount
                        ? ` · ${result.skippedCount} source${result.skippedCount > 1 ? "s" : ""} ignorée${result.skippedCount > 1 ? "s" : ""}`
                        : "";
                    this.showToast(`${result.totalUnits} renforts envoyés depuis ${result.sentCount} territoires vers ${territory.name}${skipped}.`);
                }
                return;
            }
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

            if (!this.game.areAllied(territory.ownerId, this.game.playerId)) {
                this.showToast("Les convois longue distance ne peuvent traverser que les territoires alliés.");
                return;
            }
            if (territory.id === source.id) {
                this.showToast("Choisissez un autre territoire de destination.");
                return;
            }

            const path = this.game.findAlliedPath(this.game.playerId, source.id, territory.id);
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
            const groupedSources = typeof this.getMultiSelectedTerritories === "function"
                ? this.getMultiSelectedTerritories()
                : [];
            if (groupedSources.length > 1 && groupedSources.some((territory) => territory.id === source.id)) {
                if (!this.game.isTerritoryVisible(target.id, this.game.playerId)) {
                    this.showToast("Le transfert groupé exige une destination visible.");
                    return;
                }
                const result = this.game.executeCommand({
                    type: "BATCH_SEND_REINFORCEMENTS",
                    playerId: this.game.playerId,
                    fromTerritoryIds: groupedSources.map((territory) => territory.id),
                    toTerritoryId: target.id
                });
                if (!result.ok) return this.showToast(result.error);
                this.clearSelection();
                if (result.pending) return this.showToast("Transfert groupé transmis à l’hôte.");
                const skipped = result.skippedCount ? ` · ${result.skippedCount} source${result.skippedCount > 1 ? "s" : ""} ignorée${result.skippedCount > 1 ? "s" : ""}` : "";
                this.showToast(`${result.totalUnits} renforts transférés depuis ${result.sentCount} territoires vers ${target.name}${skipped}.`);
                return;
            }
            if (!this.game.isTerritoryVisible(source.id, this.game.playerId) ||
                !this.game.isTerritoryVisible(target.id, this.game.playerId)) {
                this.showToast("Le transfert ne peut pas traverser une zone sans visibilité.");
                return;
            }
            if (source.ownerId !== this.game.playerId || !this.game.areAllied(target.ownerId, this.game.playerId)) {
                this.showToast("Le transfert rapide doit partir de votre territoire vers une destination alliée.");
                return;
            }
            if (source.units <= 1) {
                this.showToast("Ce territoire n’a aucune unité disponible à transférer.");
                return;
            }

            const path = this.game.findAlliedPath(this.game.playerId, source.id, target.id);
            if (!path) {
                this.showToast("Aucun itinéraire allié ne contourne les montagnes jusqu’à cette destination.");
                return;
            }

            const units = Math.max(1, Math.floor((source.units - 1) * this.game.quickTransferRatio));
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
            const groupedSources = typeof this.getMultiSelectedTerritories === "function"
                ? this.getMultiSelectedTerritories()
                : [];
            if (groupedSources.length > 1 && groupedSources.some((territory) => territory.id === source.id)) {
                if (!this.game.isTerritoryVisible(target.id, this.game.playerId)) {
                    this.showToast("Le flux groupé exige une destination visible.");
                    return;
                }
                const result = this.game.executeCommand({
                    type: "BATCH_CREATE_CONTINUOUS_REINFORCEMENT_ROUTES",
                    playerId: this.game.playerId,
                    fromTerritoryIds: groupedSources.map((territory) => territory.id),
                    toTerritoryId: target.id
                });
                if (!result.ok) return this.showToast(result.error);
                this.clearSelection();
                if (result.pending) return this.showToast("Création des flux groupés transmise à l’hôte.");
                const skipped = result.skippedCount ? ` · ${result.skippedCount} source${result.skippedCount > 1 ? "s" : ""} ignorée${result.skippedCount > 1 ? "s" : ""}` : "";
                this.showToast(`${result.createdCount} flux continus dirigés vers ${target.name}${skipped}.`);
                return;
            }
            if (!this.game.isTerritoryVisible(source.id, this.game.playerId) ||
                !this.game.isTerritoryVisible(target.id, this.game.playerId)) {
                this.showToast("Le flux continu ne peut pas être établi dans une zone sans visibilité.");
                return;
            }
            if (source.ownerId !== this.game.playerId || !this.game.areAllied(target.ownerId, this.game.playerId)) {
                this.showToast("Le flux continu doit partir de votre territoire vers une destination alliée.");
                return;
            }

            const path = this.game.findAlliedPath(this.game.playerId, source.id, target.id);
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
            this.multiSelectedTerritoryIds.clear();
            this.targetTerritoryId = null;
            this.plannedRoute = [];
            this.lastRouteKey = null;
            this.airstrikeSourceId = null;
            this.targetingAbilityId = null;
            this.syncSelection();
            this.refreshAbilities();
        }

        toggleAbilityTargeting(abilityId) {
            const faction = this.game.state.getFaction(this.game.playerId);
            const definition = C.ABILITY_DEFINITIONS[abilityId];
            if (!faction || !definition) return;
            if (!faction.research.completedTechnologyIds.includes(definition.technologyId)) {
                this.showToast(`Recherchez d’abord : ${C.TECHNOLOGIES[definition.technologyId].name}.`);
                return;
            }
            if ((faction.abilityCooldowns[abilityId] || 0) > 0) return;
            const abilityStats = C.getFactionAbilityStats(faction, abilityId);
            this.airstrikeSourceId = null;
            this.targetingAbilityId = this.targetingAbilityId === abilityId ? null : abilityId;
            this.clearTerritorySelectionOnly();
            this.refreshAbilities();
            const targetingMessage = abilityId === "reinforcement"
                ? `Cliquez sur un de vos territoires pour recevoir ${abilityStats.units} unités.`
                : abilityId === "paratrooper"
                    ? `Choisissez un territoire ennemi visible pour larguer ${abilityStats.units} parachutistes.`
                : abilityId === "nuclear"
                    ? "Choisissez une cible ennemie visible. Le souffle touchera aussi tous ses voisins."
                    : "Cliquez sur un territoire ennemi visible.";
            this.showToast(this.targetingAbilityId ? targetingMessage : "Capacité annulée.");
        }

        clearTerritorySelectionOnly() {
            this.selectedTerritoryId = null;
            this.multiSelectedTerritoryIds.clear();
            this.targetTerritoryId = null;
            this.plannedRoute = [];
            this.lastRouteKey = null;
            this.syncSelection();
        }

        useAbilityAt(territory) {
            const abilityId = this.targetingAbilityId;
            const food = this.game.getFactionFoodState(this.game.playerId);
            const result = this.game.executeCommand({ type: "USE_ABILITY", playerId: this.game.playerId, abilityId, targetTerritoryId: territory.id });
            if (!result.ok) return this.showToast(result.error);
            this.targetingAbilityId = null;
            this.clearTerritorySelectionOnly();
            this.refreshAbilities();
            if (result.pending) return this.showToast("Ordre de capacité transmis à l’hôte.");
            if (abilityId === "reinforcement") {
                const units = Number(result.units) || C.getFactionAbilityStats(this.game.state.getFaction(this.game.playerId), "reinforcement").units;
                const shortage = food.capacity - food.demand < units;
                this.showToast(`${units} renforts mobilisés à ${territory.name}${shortage ? " · attention à la nourriture" : ""}.`);
            }
        }

        refreshAbilities() {
            const faction = this.game.state.getFaction(this.game.playerId);
            if (!faction) return;
            ["missile", "reinforcement", "paratrooper", "nuclear"].forEach((abilityId) => {
                const definition = C.ABILITY_DEFINITIONS[abilityId];
                const button = abilityId === "missile"
                    ? this.elements.abilityMissile
                    : abilityId === "reinforcement"
                        ? this.elements.abilityReinforcement
                        : abilityId === "paratrooper"
                            ? this.elements.abilityParatrooper
                            : this.elements.abilityNuclear;
                const status = abilityId === "missile"
                    ? this.elements.abilityMissileStatus
                    : abilityId === "reinforcement"
                        ? this.elements.abilityReinforcementStatus
                        : abilityId === "paratrooper"
                            ? this.elements.abilityParatrooperStatus
                            : this.elements.abilityNuclearStatus;
                const unlocked = faction.research.completedTechnologyIds.includes(definition.technologyId);
                const abilityLevel = C.getFactionAbilityLevel(faction, abilityId);
                const cooldown = Math.max(0, faction.abilityCooldowns?.[abilityId] || 0);
                const ready = unlocked && cooldown <= 0;
                button.disabled = !ready;
                button.classList.toggle("ready", ready);
                button.classList.toggle("armed", this.targetingAbilityId === abilityId);
                status.textContent = !unlocked
                    ? "Verrouillé"
                    : cooldown > 0
                        ? `${this.formatDuration(cooldown)} · Niv. ${abilityLevel}`
                        : this.targetingAbilityId === abilityId
                            ? `Cible ? · Niv. ${abilityLevel}`
                            : `Prêt · Niv. ${abilityLevel}`;
            });
        }

        syncSelection() {
            this.renderer.setSelection(
                this.selectedTerritoryId,
                this.targetTerritoryId,
                this.plannedRoute,
                [...this.multiSelectedTerritoryIds]
            );
            this.renderTerritoryPanel();
        }

        getMultiSelectedTerritories() {
            const valid = [...this.multiSelectedTerritoryIds]
                .map((territoryId) => this.game.state.getTerritory(territoryId))
                .filter((territory) => territory && !territory.isImpassable && territory.ownerId === this.game.playerId);
            const validIds = new Set(valid.map((territory) => territory.id));
            [...this.multiSelectedTerritoryIds].forEach((territoryId) => {
                if (!validIds.has(territoryId)) this.multiSelectedTerritoryIds.delete(territoryId);
            });
            return valid;
        }

        renderStaticGameInfo() {
            const player = this.game.state.getFaction(this.game.playerId);
            this.elements.playerFactionName.textContent = player.name;
            this.elements.playerFactionDot.style.background = player.color;
            this.elements.playerFactionDot.style.color = player.color;
            this.elements.centerMap.title = `Recentrer sur ${player.name}`;
            this.elements.centerMap.setAttribute("aria-label", `Recentrer sur ${player.name}`);
            const mapLabel = this.game.state.mapType === "hourglass" ? "SABLIER" : "CONTINENT";
            this.elements.mapSeed.textContent = `${mapLabel} · CARTE #${String(this.game.state.seed).padStart(6, "0")}`;
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
                const controlLabel = faction.id !== null && faction.isAI ? " · IA" : "";
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
            const fog = document.createElement("span");
            fog.className = "legend-item";
            fog.innerHTML = `<span class="legend-fog">?</span> Brouillard · au-delà de ${this.game.visibilityRange}`;
            this.elements.factionLegend.append(fog);
        }

        renderTerritoryPanel() {
            const groupedTerritories = this.getMultiSelectedTerritories();
            if (groupedTerritories.length > 1) {
                this.renderMultiTerritoryPanel(groupedTerritories);
                return;
            }
            let territory = this.game.state.getTerritory(this.selectedTerritoryId);
            if (territory && !this.game.isTerritoryVisible(territory.id, this.game.playerId)) {
                this.selectedTerritoryId = null;
                this.targetTerritoryId = null;
                this.plannedRoute = [];
                this.renderer.setSelection(null);
                territory = null;
            }
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
            this.elements.selectionTip.querySelector("p").textContent = "Clic gauche sur un voisin pour agir. Ctrl + glisser droit transfère des unités ; Alt + glisser droit crée un flux continu.";
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
                : territory.productionMode === "food"
                ? `+${this.game.getTerritoryPassiveFoodCapacity(territory) + this.game.getTerritoryFoodCapacity(territory)} nourriture`
                : territory.productionMode === "research"
                ? `+${Math.round(this.game.getTerritoryResearchBonus(territory) * 100)} % recherche`
                : territory.ownerId === null
                ? "Inactive"
                : `+${this.formatNumber(this.game.getTerritoryProductionPerMinute(territory))}/min`;

            this.renderBonuses(territory, type, faction);
            this.renderProductionMode(territory);
            this.renderAirportPanel(territory);
            this.renderActiveRoute(territory);
            this.renderAttackPanel(territory);
        }

        renderMultiTerritoryPanel(territories) {
            const faction = this.game.state.getFaction(this.game.playerId);
            const totalUnits = territories.reduce((sum, territory) => sum + territory.units, 0);
            const availableUnits = territories.reduce((sum, territory) => sum + Math.max(0, territory.units - 1), 0);
            const modes = {
                units: territories.filter((territory) => territory.productionMode === "units").length,
                food: territories.filter((territory) => territory.productionMode === "food").length,
                research: territories.filter((territory) => territory.productionMode === "research").length
            };
            const commonMode = Object.entries(modes).find(([, count]) => count === territories.length)?.[0] || null;
            const potentialProduction = territories.reduce((sum, territory) =>
                sum + this.game.getTerritoryProductionPerMinute({ ...territory, productionMode: "units" }), 0);

            this.elements.emptySelection.hidden = true;
            this.elements.territoryDetails.hidden = false;
            this.elements.territoryName.textContent = `${territories.length} territoires sélectionnés`;
            this.elements.territoryId.textContent = "GROUPE";
            this.elements.ownerName.textContent = faction.name;
            this.elements.ownerSwatch.style.background = faction.color;
            this.elements.ownerSwatch.style.color = faction.color;
            this.elements.selectedUnits.textContent = totalUnits;
            this.elements.terrainIcon.textContent = "⊕";
            this.elements.terrainName.textContent = "Sélection multiple";
            this.elements.resourceName.textContent = `${availableUnits} unités disponibles`;
            this.elements.territoryProduction.textContent = `+${this.formatNumber(potentialProduction)}/min potentiel`;

            this.elements.productionModePanel.hidden = false;
            this.elements.productionModePanel.classList.toggle("research", commonMode === "research");
            this.elements.modeUnits.classList.toggle("active", commonMode === "units");
            this.elements.modeFood.classList.toggle("active", commonMode === "food");
            this.elements.modeResearch.classList.toggle("active", commonMode === "research");
            this.elements.productionModeStatus.textContent = commonMode ? commonMode.toUpperCase() : "MIXTE";
            this.elements.productionModeDetail.textContent = `Recrutement : ${modes.units} · Nourriture : ${modes.food} · Recherche : ${modes.research}. Une affectation sera appliquée à tout le groupe.`;

            this.elements.bonusList.replaceChildren();
            [
                `${territories.length} territoires commandés ensemble`,
                `${availableUnits} unités peuvent être concentrées en conservant une unité par source`,
                "Clic droit sur un territoire allié : envoyer automatiquement 80 % de chaque garnison disponible"
            ].forEach((label) => {
                const item = document.createElement("li");
                item.textContent = label;
                this.elements.bonusList.append(item);
            });
            this.elements.airportPanel.hidden = true;
            this.elements.activeRoutePanel.hidden = true;
            this.elements.attackPanel.hidden = true;
            this.elements.selectionTip.hidden = false;
            this.elements.selectionTip.querySelector("p").textContent = "Shift + clic ajoute ou retire un territoire. Clic droit sur un allié concentre les renforts, puis désélectionne le groupe.";
        }

        renderProductionMode(territory) {
            const canCommand = territory.ownerId === this.game.playerId && !territory.isImpassable;
            this.elements.productionModePanel.hidden = !canCommand;
            if (!canCommand) return;
            const foodMode = territory.productionMode === "food";
            const researchMode = territory.productionMode === "research";
            this.elements.productionModePanel.classList.toggle("research", researchMode);
            const foodCapacity = this.game.getPotentialTerritoryFoodCapacity(territory);
            const passiveCapacity = territory.isCapital
                ? this.game.capitalFoodCapacity
                : this.game.getFactionTerritoryBaseFoodCapacity(territory.ownerId);
            const famine = this.game.eventSystem.isTerritoryAffected(territory.id, "famine");
            this.elements.modeUnits.classList.toggle("active", !foodMode && !researchMode);
            this.elements.modeFood.classList.toggle("active", foodMode);
            this.elements.modeResearch.classList.toggle("active", researchMode);
            this.elements.productionModeStatus.textContent = foodMode ? "NOURRITURE" : researchMode ? "RECHERCHE" : "RECRUTEMENT";
            this.elements.productionModeDetail.textContent = researchMode
                ? `Ce territoire ne recrute plus, conserve sa nourriture passive et augmente la vitesse scientifique de ${Math.round(this.game.getTerritoryResearchBonus(territory) * 100)} %. Le bonus cumulé des affectations est plafonné à 50 %.`
                : foodMode
                ? territory.isCapital
                    ? `La capitale ne recrute plus, conserve ses ${passiveCapacity} nourritures et ${famine ? `voit son bonus local de ${foodCapacity} suspendu par la famine` : `ajoute ${foodCapacity} points grâce à son terrain`}.`
                    : famine
                    ? `Ce territoire ne recrute plus. La famine suspend actuellement ses ${passiveCapacity + foodCapacity} points de nourriture.`
                    : `Ce territoire ne recrute plus et fournit ${passiveCapacity + foodCapacity} points de nourriture.`
                : territory.isCapital
                ? `La capitale recrute des unités et maintient une capacité de ${passiveCapacity} nourritures.`
                : `Ce territoire recrute des unités tout en fournissant ${passiveCapacity} nourritures. Le mode nourriture ajouterait ${foodCapacity} points.`;
        }

        setTerritoryMode(mode) {
            const groupedTerritories = this.getMultiSelectedTerritories();
            if (groupedTerritories.length > 1) {
                const result = this.game.executeCommand({
                    type: "BATCH_SET_TERRITORY_MODE",
                    playerId: this.game.playerId,
                    territoryIds: groupedTerritories.map((territory) => territory.id),
                    mode
                });
                if (!result.ok) return this.showToast(result.error);
                const count = result.pending ? groupedTerritories.length : result.changedCount;
                this.clearSelection();
                this.showToast(result.pending
                    ? `Affectation groupée de ${groupedTerritories.length} territoires transmise à l’hôte.`
                    : `${count} territoire${count > 1 ? "s" : ""} affecté${count > 1 ? "s" : ""} à ${mode === "food" ? "la nourriture" : mode === "research" ? "la recherche" : "la production militaire"}.`);
                return;
            }
            const territory = this.game.state.getTerritory(this.selectedTerritoryId);
            if (!territory) return;
            const result = this.game.executeCommand({
                type: "SET_TERRITORY_MODE",
                playerId: this.game.playerId,
                territoryId: territory.id,
                mode
            });
            if (!result.ok) return this.showToast(result.error);
            if (result.pending) {
                this.showToast("Changement de production transmis à l’hôte.");
                return;
            }
            this.renderTerritoryPanel();
            this.showToast(mode === "food"
                ? `${territory.name} produit maintenant de la nourriture.`
                : mode === "research"
                    ? `${territory.name} se consacre maintenant à la recherche.`
                    : `${territory.name} reprend le recrutement.`);
        }

        renderAirportPanel(territory) {
            const canUseAirport = territory.terrain === "airport" && territory.ownerId === this.game.playerId;
            this.elements.airportPanel.hidden = !canUseAirport;
            if (!canUseAirport) return;
            const remainingSeconds = Math.ceil(Math.max(0, territory.airstrikeCooldownMs) / 1000);
            const reloading = remainingSeconds > 0;
            const armed = this.airstrikeSourceId === territory.id;
            this.elements.airportStatus.textContent = reloading ? `${remainingSeconds} S` : armed ? "CIBLE ?" : "PRÊTE";
            this.elements.airportStatus.classList.toggle("reloading", reloading);
            this.elements.airportDetail.textContent = reloading
                ? "Les bombardiers se préparent pour une nouvelle mission."
                : "Détruit 10 % des forces d’un territoire ennemi visible à quatre frontières ou moins.";
            this.elements.airstrikeButton.disabled = reloading;
            this.elements.airstrikeButton.classList.toggle("armed", armed);
            this.elements.airstrikeButton.textContent = armed ? "Annuler la frappe" : "Préparer la frappe";
        }

        toggleAirstrikeTargeting() {
            const territory = this.game.state.getTerritory(this.selectedTerritoryId);
            if (!territory || territory.terrain !== "airport" || territory.ownerId !== this.game.playerId) return;
            if (territory.airstrikeCooldownMs > 0) return;
            this.airstrikeSourceId = this.airstrikeSourceId === territory.id ? null : territory.id;
            this.renderAirportPanel(territory);
            this.showToast(this.airstrikeSourceId === null
                ? "Frappe aérienne annulée."
                : "Cliquez sur une cible ennemie visible dans un rayon de quatre territoires.");
        }

        launchAirstrikeAt(target) {
            const source = this.game.state.getTerritory(this.airstrikeSourceId);
            if (!source) {
                this.airstrikeSourceId = null;
                return;
            }
            if (this.game.areAllied(target.ownerId, this.game.playerId)) {
                this.showToast("Impossible de bombarder un territoire allié.");
                return;
            }
            const result = this.game.executeCommand({
                type: "AIRSTRIKE",
                playerId: this.game.playerId,
                fromTerritoryId: source.id,
                toTerritoryId: target.id
            });
            if (!result.ok) {
                this.showToast(result.error);
                return;
            }
            this.clearSelection();
            this.showToast(`Frappe aérienne lancée sur ${target.name}.`);
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
                this.elements.attackUnits.value = String(Math.max(1, Math.floor(maxUnits * 0.80)));
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

        renderPauseState() {
            const ended = this.game.state.winnerTeamId !== null;
            document.body.classList.toggle("simulation-paused", this.game.paused);
            this.elements.togglePause.setAttribute("aria-pressed", String(this.game.paused));
            this.elements.pauseIcon.textContent = ended ? "◆" : this.game.paused ? "▶" : "Ⅱ";
            this.elements.pauseLabel.textContent = ended ? "Terminée" : this.game.paused ? "Reprendre" : "Pause";
            this.elements.simulationStatus.textContent = ended
                ? "PARTIE TERMINÉE · DOMINATION"
                : this.game.paused
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

        handleGlobalKeydown(event) {
            if (event.key === "Escape" && !this.elements.researchScreen.hidden) {
                this.closeResearchScreen();
                return;
            }
            if (event.code !== "Space" && event.key !== " ") return;
            const target = event.target;
            const tagName = String(target?.tagName || "").toUpperCase();
            if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tagName) || target?.isContentEditable) return;
            if (this.lastLostTerritoryId === null) return;
            event.preventDefault();
            this.focusLastLostTerritory();
        }

        focusLastLostTerritory() {
            const territory = this.game.state.getTerritory(this.lastLostTerritoryId);
            if (!territory) {
                this.lastLostTerritoryId = null;
                return false;
            }
            if (!this.elements.researchScreen.hidden) this.closeResearchScreen(false);
            const focusZoom = Math.max(Number(this.renderer.zoom) || 0, 0.78);
            this.renderer.focusTerritory(territory.id, focusZoom);
            this.renderer.pulseTerritory(territory.id, "#ff766d", true);
            this.renderZoomLevel();
            this.showToast(`Dernière perte : ${territory.name}.`);
            return true;
        }

        renderZoomLevel() {
            this.elements.zoomLevel.textContent = `${this.renderer.getZoomPercent()} %`;
        }

        refreshDynamic() {
            if (!this.game.state.factions.length) return;
            const stats = this.game.getFactionStats(this.game.playerId);
            this.elements.territoryCount.textContent = stats.territoryCount;
            this.elements.totalUnits.textContent = stats.totalUnits;
            this.elements.foodSupply.textContent = `${stats.food.demand} / ${stats.food.capacity}`;
            this.elements.foodStat.classList.toggle("warning", stats.food.ratio < 1 && stats.food.ratio >= this.game.foodAttritionThreshold);
            this.elements.foodStat.classList.toggle("critical", stats.food.ratio < this.game.foodAttritionThreshold);
            const attritionDetail = stats.food.attritionRate > 0
                ? ` · attrition ${this.formatNumber(stats.food.attritionRate * 100)} % du déficit toutes les ${this.formatNumber(this.game.foodAttritionIntervalMs / 1000)} s`
                : "";
            this.elements.foodSupply.title = stats.food.ratio >= 1
                ? `${Math.max(0, stats.food.capacity - stats.food.demand)} points de nourriture disponibles`
                : `Pénurie : recrutement ×${this.formatNumber(stats.food.productionMultiplier)}${attritionDetail}`;
            this.elements.productionRate.textContent = `+${this.formatNumber(stats.productionPerMinute)}/min`;
            this.refreshResearchStatus();
            this.refreshAbilities();
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

        formatDuration(milliseconds) {
            const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            return `${minutes}:${String(seconds).padStart(2, "0")}`;
        }
    }

    C.UIController = UIController;
})(window.Conquest = window.Conquest || {});
