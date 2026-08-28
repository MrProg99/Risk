(function (C) {
    "use strict";

    class LobbyController {
        static normalizeAIDifficulty(value) {
            return ["relaxed", "normal", "hard", "relentless"].includes(value) ? value : "normal";
        }

        static getAIProductionMultiplier(value) {
            return { relaxed: 0.75, normal: 1, hard: 1.20, relentless: 1.40 }[LobbyController.normalizeAIDifficulty(value)];
        }

        static getAIDifficultyLabel(value) {
            return { relaxed: "Détendu", normal: "Normal", hard: "Difficile", relentless: "Implacable" }[LobbyController.normalizeAIDifficulty(value)];
        }

        constructor(factionDefinitions = C.FACTION_DEFINITIONS, network = null) {
            this.factionDefinitions = factionDefinitions.slice();
            this.network = network;
            this.room = null;
            this.activeRoomMode = null;
            this.modeTouched = false;
            this.roomStarted = false;
            this.startListeners = new Set();
            this.lobby = document.getElementById("game-lobby");
            this.form = document.getElementById("lobby-form");
            this.factionChoices = document.getElementById("lobby-factions");
            this.summary = document.getElementById("lobby-summary");
            this.startButton = document.getElementById("start-game");
            this.joinButton = document.getElementById("join-room");
            this.joinAction = document.getElementById("multiplayer-join-action");
            this.gameApp = document.getElementById("game-app");
            this.multiplayerOptions = document.getElementById("multiplayer-options");
            this.soloPlayerOptions = document.getElementById("solo-player-options");
            this.aiDifficultyOptions = document.getElementById("ai-difficulty-options");
            this.mapOptions = document.getElementById("map-options");
            this.roomCodeField = document.getElementById("room-code-field");
            this.roomCodeInput = this.form.elements.roomCode || null;
            this.teamSizeField = document.getElementById("team-size-field");
            this.opponentModeField = document.getElementById("opponent-mode-field");
            this.preferredTeamField = document.getElementById("preferred-team-field");
            this.roomWaiting = document.getElementById("room-waiting");
            this.roomCodeDisplay = document.getElementById("room-code-display");
            this.roomStatus = document.getElementById("room-status");
            this.roomPlayerList = document.getElementById("room-player-list");
            this.leaveRoomButton = document.getElementById("leave-room");
            this.joinCodeHelp = document.getElementById("join-code-help");
            this.renderFactionChoices();
            this.bindEvents();
            this.open();
            this.refresh();
            this.tryRestoreRoom();
        }

        static buildActiveFactionIds(playerId, playerCount, definitions = C.FACTION_DEFINITIONS) {
            const factionIds = definitions.map((definition) => definition.id);
            const selectedIndex = Math.max(0, factionIds.indexOf(Number(playerId)));
            const count = C.Geometry.clamp(Math.floor(Number(playerCount) || factionIds.length), 2, factionIds.length);
            const activeFactionIds = [];
            for (let offset = 0; offset < count; offset += 1) {
                activeFactionIds.push(factionIds[(selectedIndex + offset) % factionIds.length]);
            }
            return activeFactionIds;
        }

        renderFactionChoices() {
            this.factionChoices.replaceChildren();
            this.factionDefinitions.forEach((faction, index) => {
                const choice = document.createElement("label");
                choice.className = "faction-choice";
                choice.style.setProperty("--faction-color", faction.color);
                choice.style.setProperty("--faction-accent", faction.accent);

                const input = document.createElement("input");
                input.type = "radio";
                input.name = "playerFaction";
                input.value = String(faction.id);
                input.checked = index === 0;

                const top = document.createElement("span");
                top.className = "faction-choice-top";
                const emblem = document.createElement("span");
                emblem.className = "faction-emblem";
                emblem.textContent = faction.name.slice(0, 1);
                const name = document.createElement("strong");
                name.textContent = faction.name;
                const marker = document.createElement("span");
                marker.className = "faction-selected-marker";
                marker.textContent = "✓";
                top.append(emblem, name, marker);

                const bonus = document.createElement("span");
                bonus.className = "faction-choice-bonus";
                bonus.textContent = faction.bonusLabel;
                choice.append(input, top, bonus);
                this.factionChoices.append(choice);
            });
        }

        bindEvents() {
            this.form.addEventListener("change", (event) => {
                if (event.target?.name === "gameMode") this.modeTouched = true;
                this.refresh();
            });
            this.roomCodeInput?.addEventListener("input", () => this.refresh());
            this.leaveRoomButton?.addEventListener("click", async () => {
                this.leaveRoomButton.disabled = true;
                this.summary.textContent = `Fermeture du salon ${this.network?.roomCode || ""}…`;
                try {
                    await this.leaveCurrentRoom();
                } catch (error) {
                    this.summary.textContent = C.FirebaseMultiplayer?.formatError(error) || error.message || "Impossible de quitter le salon.";
                    this.leaveRoomButton.disabled = false;
                }
            });
            this.form.addEventListener("submit", async (event) => {
                event.preventDefault();
                const configuration = this.getConfiguration();
                const actionButton = configuration.mode === "join" && this.joinButton ? this.joinButton : this.startButton;
                if (actionButton.disabled) return;
                this.startButton.disabled = true;
                if (this.joinButton) this.joinButton.disabled = true;
                try {
                    if (configuration.mode === "solo") {
                        if (this.room) {
                            try {
                                await this.leaveCurrentRoom(false);
                            } catch (cleanupError) {
                                console.warn("Ancien salon Firebase non nettoyé avant le mode solo.", cleanupError);
                            }
                        }
                        this.startListeners.forEach((listener) => listener(configuration));
                        return;
                    }
                    if (this.room && !this.isUsingCurrentRoom(configuration)) {
                        try {
                            await this.leaveCurrentRoom(false);
                        } catch (cleanupError) {
                            console.warn("Ancien salon Firebase non nettoyé avant la nouvelle connexion.", cleanupError);
                        }
                    }
                    if (!this.room) await this.connectToRoom(configuration);
                    else if (this.room.meta.hostUid === this.network.uid) await this.network.startRoom();
                } catch (error) {
                    this.summary.textContent = C.FirebaseMultiplayer?.formatError(error) || error.message || "Connexion au salon impossible.";
                    this.startButton.disabled = false;
                    if (this.joinButton) this.joinButton.disabled = false;
                }
            });
        }

        getConfiguration() {
            const factionInput = this.form.elements.playerFaction;
            const countInput = this.form.elements.playerCount;
            const playerId = Number(factionInput.value);
            const playerCount = Number(countInput.value);
            const mode = this.form.elements.gameMode?.value || "solo";
            const aiDifficulty = LobbyController.normalizeAIDifficulty(this.form.elements.aiDifficulty?.value);
            return {
                mode,
                playerId,
                playerCount,
                playerName: this.form.elements.playerName?.value || "Commandant",
                roomCode: (this.form.elements.roomCode?.value || "").trim().toUpperCase(),
                teamSize: Number(this.form.elements.teamSize?.value) || 1,
                opponentMode: this.form.elements.opponentMode?.value === "human" ? "human" : "ai",
                aiDifficulty,
                aiProductionMultiplier: LobbyController.getAIProductionMultiplier(aiDifficulty),
                mapType: this.form.elements.mapType?.value === "hourglass" ? "hourglass" : "standard",
                mapSize: C.normalizeMapSize(this.form.elements.mapSize?.value),
                teamId: Number(this.form.elements.preferredTeam?.value) || 1,
                raceId: playerId,
                activeFactionIds: LobbyController.buildActiveFactionIds(
                    playerId,
                    playerCount,
                    this.factionDefinitions
                )
            };
        }

        isUsingCurrentRoom(configuration = this.getConfiguration()) {
            if (!this.room || !this.activeRoomMode || configuration.mode !== this.activeRoomMode) return false;
            if (configuration.mode !== "join" || !configuration.roomCode) return true;
            const requestedCode = C.FirebaseMultiplayer?.normalizeCode(configuration.roomCode) || configuration.roomCode;
            return requestedCode === this.network?.roomCode;
        }

        refresh() {
            const configuration = this.getConfiguration();
            const selectedFaction = this.factionDefinitions.find((faction) => faction.id === configuration.playerId);
            this.factionChoices.querySelectorAll(".faction-choice").forEach((choice) => {
                choice.classList.toggle("selected", choice.querySelector("input").checked);
            });
            const online = configuration.mode !== "solo";
            if (this.multiplayerOptions) this.multiplayerOptions.hidden = !online;
            if (this.soloPlayerOptions) this.soloPlayerOptions.hidden = online;
            if (this.aiDifficultyOptions) {
                this.aiDifficultyOptions.hidden = configuration.mode === "join" ||
                    (configuration.mode === "host" && configuration.opponentMode !== "ai");
            }
            if (this.mapOptions) this.mapOptions.hidden = configuration.mode === "join";
            if (this.roomCodeField) this.roomCodeField.hidden = configuration.mode !== "join";
            if (this.roomCodeInput) this.roomCodeInput.required = configuration.mode === "join";
            if (this.teamSizeField) this.teamSizeField.hidden = configuration.mode !== "host";
            if (this.opponentModeField) this.opponentModeField.hidden = configuration.mode !== "host";
            if (this.preferredTeamField) this.preferredTeamField.hidden = configuration.mode !== "join";
            const usingCurrentRoom = this.isUsingCurrentRoom(configuration);
            const dedicatedJoinAction = configuration.mode === "join" && Boolean(this.joinButton) && !usingCurrentRoom;
            if (this.joinAction) this.joinAction.hidden = !dedicatedJoinAction;
            this.startButton.hidden = dedicatedJoinAction;
            if (this.roomWaiting && !usingCurrentRoom) this.roomWaiting.hidden = true;
            if (usingCurrentRoom) return this.renderRoom(this.room);
            const previousRoom = this.room && this.network?.roomCode;
            if (this.joinCodeHelp) {
                this.joinCodeHelp.textContent = previousRoom
                    ? `Vous êtes encore dans le salon ${previousRoom}. Il sera quitté avant de rejoindre le nouveau code.`
                    : "Le code contient six caractères et provient du joueur qui a créé le salon.";
            }
            if (!online) {
                const opponents = configuration.playerCount - 1;
                this.summary.textContent = `${selectedFaction.name} contre ${opponents} adversaire${opponents > 1 ? "s" : ""} contrôlé${opponents > 1 ? "s" : ""} par l’ordinateur · IA ${LobbyController.getAIDifficultyLabel(configuration.aiDifficulty)}.`;
                if (previousRoom) this.summary.textContent += ` Le salon ${previousRoom} sera quitté.`;
                this.startButton.textContent = `Lancer la partie · ${configuration.playerCount} joueurs`;
            } else if (configuration.mode === "host") {
                const opponents = configuration.opponentMode === "ai" ? "une équipe IA" : "des joueurs humains";
                const difficulty = configuration.opponentMode === "ai"
                    ? ` · IA ${LobbyController.getAIDifficultyLabel(configuration.aiDifficulty)}`
                    : "";
                this.summary.textContent = `Créer un salon ${configuration.teamSize}v${configuration.teamSize} contre ${opponents}, avec la race ${selectedFaction.name}${difficulty}.`;
                if (previousRoom) this.summary.textContent += ` Le salon ${previousRoom} sera quitté.`;
                this.startButton.textContent = "Créer le salon";
            } else {
                this.summary.textContent = previousRoom
                    ? `Quitter le salon ${previousRoom} et rejoindre le code saisi avec la race ${selectedFaction.name}.`
                    : `Rejoindre une équipe avec la race ${selectedFaction.name}.`;
                this.startButton.textContent = "Rejoindre le salon";
            }
            this.startButton.disabled = false;
            if (this.joinButton) this.joinButton.disabled = false;
        }

        async connectToRoom(configuration) {
            if (!this.network) throw new Error("Le service multijoueur n’est pas disponible.");
            if (configuration.mode === "host") {
                await this.network.createRoom(configuration);
            } else {
                await this.network.joinRoom(configuration.roomCode, configuration);
            }
            this.activeRoomMode = configuration.mode;
            this.beginWatchingRoom();
        }

        async leaveCurrentRoom(refresh = true) {
            try {
                if (this.network && this.room) await this.network.leaveRoom();
            } finally {
                this.room = null;
                this.activeRoomMode = null;
                this.roomUnsubscribe = null;
                if (this.roomWaiting) this.roomWaiting.hidden = true;
                if (this.leaveRoomButton) this.leaveRoomButton.disabled = false;
                if (refresh) this.refresh();
            }
        }

        async tryRestoreRoom() {
            if (!this.network || !localStorage.getItem("frontieres.multiplayerRoom")) return;
            this.summary.textContent = "Reconnexion au salon…";
            try {
                const room = await this.network.restoreRoom();
                if (!room) return this.refresh();
                this.room = room;
                this.activeRoomMode = room.meta?.hostUid === this.network.uid ? "host" : "join";
                if (!this.modeTouched) {
                    const restoredMode = this.form.elements.gameMode;
                    const input = Array.from(restoredMode || []).find((candidate) => candidate.value === this.activeRoomMode);
                    if (input) input.checked = true;
                }
                this.beginWatchingRoom();
            } catch (_error) {
                this.refresh();
            }
        }

        beginWatchingRoom() {
            if (this.roomUnsubscribe) return;
            this.roomUnsubscribe = this.network.watchRoom((room) => {
                if (!room) return;
                this.room = room;
                this.refresh();
                if (room.meta.status === "playing" && !this.roomStarted) {
                    this.roomStarted = true;
                    const factionSetups = C.FirebaseMultiplayer.buildFactionSetups(room);
                    const localFaction = factionSetups.find((setup) => setup.playerUid === this.network.uid);
                    const aiFactionIds = factionSetups.filter((setup) => setup.isAI).map((setup) => setup.id);
                    this.startListeners.forEach((listener) => listener({
                        mode: "multiplayer",
                        roomCode: this.network.roomCode,
                        playerId: localFaction.id,
                        playerCount: factionSetups.length,
                        activeFactionIds: factionSetups.map((setup) => setup.id),
                        factionSetups,
                        aiFactionIds,
                        seed: Number(room.meta.seed),
                        mapType: room.meta.mapType === "hourglass" ? "hourglass" : "standard",
                        mapSize: C.normalizeMapSize(room.meta.mapSize),
                        aiDifficulty: LobbyController.normalizeAIDifficulty(room.meta.aiDifficulty),
                        aiProductionMultiplier: LobbyController.getAIProductionMultiplier(room.meta.aiDifficulty),
                        isHost: room.meta.hostUid === this.network.uid,
                        network: this.network
                    }));
                }
            });
        }

        renderRoom(room) {
            if (!this.roomWaiting) return;
            this.roomWaiting.hidden = false;
            this.roomCodeDisplay.textContent = this.network.roomCode;
            const humanPlayers = Object.values(room.players || {});
            const players = humanPlayers.concat(C.FirebaseMultiplayer.buildAIPlayers(room)).sort((a, b) => a.slot - b.slot);
            this.roomPlayerList.replaceChildren(...players.map((player) => {
                const row = document.createElement("div");
                const race = this.factionDefinitions.find((item) => item.id === Number(player.raceId));
                row.innerHTML = `<span class="room-player-dot"></span><strong></strong><small></small>`;
                row.style.setProperty("--player-color", player.color);
                row.querySelector("strong").textContent = player.name;
                row.querySelector("small").textContent = `Équipe ${player.teamId} · ${race?.name || "Faction"}${player.isAI ? " · ordinateur" : player.connected === false ? " · reconnexion…" : ""}`;
                return row;
            }));
            const expectedHumans = room.meta.opponentMode === "ai" ? Number(room.meta.teamSize) : Number(room.meta.maxPlayers);
            const missing = expectedHumans - humanPlayers.length;
            const isHost = room.meta.hostUid === this.network.uid;
            this.roomStatus.textContent = missing > 0
                ? `En attente de ${missing} joueur${missing > 1 ? "s" : ""}…`
                : isHost ? "Les équipes sont prêtes. Lancez la partie." : "En attente du lancement par l’hôte…";
            const aiCount = players.filter((player) => player.isAI).length;
            const mapSizeLabel = C.getMapSizeDefinition(room.meta.mapSize).name;
            this.summary.textContent = `Salon ${this.network.roomCode} · ${humanPlayers.length}/${expectedHumans} humains${aiCount ? ` · ${aiCount} IA` : ""} · ${mapSizeLabel}`;
            this.startButton.hidden = !isHost;
            if (this.joinAction) this.joinAction.hidden = true;
            if (this.joinButton) this.joinButton.disabled = true;
            if (this.leaveRoomButton) this.leaveRoomButton.disabled = false;
            this.startButton.disabled = !isHost || missing > 0;
            this.startButton.textContent = "Lancer la partie en ligne";
        }

        open() {
            document.body.classList.add("lobby-open");
            this.lobby.hidden = false;
            this.gameApp.inert = true;
            this.gameApp.setAttribute("aria-hidden", "true");
        }

        close() {
            document.body.classList.remove("lobby-open");
            this.lobby.hidden = true;
            this.gameApp.inert = false;
            this.gameApp.removeAttribute("aria-hidden");
        }

        onStart(listener) {
            this.startListeners.add(listener);
            return () => this.startListeners.delete(listener);
        }
    }

    C.LobbyController = LobbyController;
})(window.Conquest = window.Conquest || {});
