(function (C) {
    "use strict";

    class LobbyController {
        constructor(factionDefinitions = C.FACTION_DEFINITIONS, network = null) {
            this.factionDefinitions = factionDefinitions.slice();
            this.network = network;
            this.room = null;
            this.roomStarted = false;
            this.startListeners = new Set();
            this.lobby = document.getElementById("game-lobby");
            this.form = document.getElementById("lobby-form");
            this.factionChoices = document.getElementById("lobby-factions");
            this.summary = document.getElementById("lobby-summary");
            this.startButton = document.getElementById("start-game");
            this.gameApp = document.getElementById("game-app");
            this.multiplayerOptions = document.getElementById("multiplayer-options");
            this.soloPlayerOptions = document.getElementById("solo-player-options");
            this.roomCodeField = document.getElementById("room-code-field");
            this.teamSizeField = document.getElementById("team-size-field");
            this.preferredTeamField = document.getElementById("preferred-team-field");
            this.roomWaiting = document.getElementById("room-waiting");
            this.roomCodeDisplay = document.getElementById("room-code-display");
            this.roomStatus = document.getElementById("room-status");
            this.roomPlayerList = document.getElementById("room-player-list");
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
            this.form.addEventListener("change", () => this.refresh());
            this.form.addEventListener("submit", async (event) => {
                event.preventDefault();
                if (this.startButton.disabled) return;
                this.startButton.disabled = true;
                const configuration = this.getConfiguration();
                if (configuration.mode === "solo") {
                    this.startListeners.forEach((listener) => listener(configuration));
                    return;
                }
                try {
                    if (!this.room) await this.connectToRoom(configuration);
                    else if (this.room.meta.hostUid === this.network.uid) await this.network.startRoom();
                } catch (error) {
                    this.summary.textContent = error.message || "Connexion au salon impossible.";
                    this.startButton.disabled = false;
                }
            });
        }

        getConfiguration() {
            const factionInput = this.form.elements.playerFaction;
            const countInput = this.form.elements.playerCount;
            const playerId = Number(factionInput.value);
            const playerCount = Number(countInput.value);
            const mode = this.form.elements.gameMode?.value || "solo";
            return {
                mode,
                playerId,
                playerCount,
                playerName: this.form.elements.playerName?.value || "Commandant",
                roomCode: this.form.elements.roomCode?.value || "",
                teamSize: Number(this.form.elements.teamSize?.value) || 1,
                teamId: Number(this.form.elements.preferredTeam?.value) || 1,
                raceId: playerId,
                activeFactionIds: LobbyController.buildActiveFactionIds(
                    playerId,
                    playerCount,
                    this.factionDefinitions
                )
            };
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
            if (this.roomCodeField) this.roomCodeField.hidden = configuration.mode !== "join";
            if (this.teamSizeField) this.teamSizeField.hidden = configuration.mode !== "host";
            if (this.preferredTeamField) this.preferredTeamField.hidden = configuration.mode !== "join";
            if (this.room) return this.renderRoom(this.room);
            if (!online) {
                const opponents = configuration.playerCount - 1;
                this.summary.textContent = `${selectedFaction.name} contre ${opponents} adversaire${opponents > 1 ? "s" : ""} contrôlé${opponents > 1 ? "s" : ""} par l’ordinateur.`;
                this.startButton.textContent = `Lancer la partie · ${configuration.playerCount} joueurs`;
            } else if (configuration.mode === "host") {
                this.summary.textContent = `Créer un salon ${configuration.teamSize}v${configuration.teamSize} avec la race ${selectedFaction.name}.`;
                this.startButton.textContent = "Créer le salon";
            } else {
                this.summary.textContent = `Rejoindre une équipe avec la race ${selectedFaction.name}.`;
                this.startButton.textContent = "Rejoindre le salon";
            }
            this.startButton.disabled = false;
        }

        async connectToRoom(configuration) {
            if (!this.network) throw new Error("Le service multijoueur n’est pas disponible.");
            if (configuration.mode === "host") {
                await this.network.createRoom(configuration);
            } else {
                await this.network.joinRoom(configuration.roomCode, configuration);
            }
            this.beginWatchingRoom();
        }

        async tryRestoreRoom() {
            if (!this.network || !localStorage.getItem("frontieres.multiplayerRoom")) return;
            this.summary.textContent = "Reconnexion au salon…";
            try {
                const room = await this.network.restoreRoom();
                if (!room) return this.refresh();
                this.room = room;
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
                this.renderRoom(room);
                if (room.meta.status === "playing" && !this.roomStarted) {
                    this.roomStarted = true;
                    const factionSetups = C.FirebaseMultiplayer.buildFactionSetups(room);
                    const localFaction = factionSetups.find((setup) => setup.playerUid === this.network.uid);
                    this.startListeners.forEach((listener) => listener({
                        mode: "multiplayer",
                        roomCode: this.network.roomCode,
                        playerId: localFaction.id,
                        playerCount: factionSetups.length,
                        activeFactionIds: factionSetups.map((setup) => setup.id),
                        factionSetups,
                        seed: Number(room.meta.seed),
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
            const players = Object.values(room.players || {}).sort((a, b) => a.slot - b.slot);
            this.roomPlayerList.replaceChildren(...players.map((player) => {
                const row = document.createElement("div");
                const race = this.factionDefinitions.find((item) => item.id === Number(player.raceId));
                row.innerHTML = `<span class="room-player-dot"></span><strong></strong><small></small>`;
                row.style.setProperty("--player-color", player.color);
                row.querySelector("strong").textContent = player.name;
                row.querySelector("small").textContent = `Équipe ${player.teamId} · ${race?.name || "Faction"}${player.connected === false ? " · reconnexion…" : ""}`;
                return row;
            }));
            const missing = Number(room.meta.maxPlayers) - players.length;
            const isHost = room.meta.hostUid === this.network.uid;
            this.roomStatus.textContent = missing > 0
                ? `En attente de ${missing} joueur${missing > 1 ? "s" : ""}…`
                : isHost ? "Les équipes sont prêtes. Lancez la partie." : "En attente du lancement par l’hôte…";
            this.summary.textContent = `Salon ${this.network.roomCode} · ${players.length}/${room.meta.maxPlayers} joueurs`;
            this.startButton.hidden = !isHost;
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
