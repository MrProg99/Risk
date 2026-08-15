(function (C) {
    "use strict";

    class LobbyController {
        constructor(factionDefinitions = C.FACTION_DEFINITIONS) {
            this.factionDefinitions = factionDefinitions.slice();
            this.startListeners = new Set();
            this.lobby = document.getElementById("game-lobby");
            this.form = document.getElementById("lobby-form");
            this.factionChoices = document.getElementById("lobby-factions");
            this.summary = document.getElementById("lobby-summary");
            this.startButton = document.getElementById("start-game");
            this.gameApp = document.getElementById("game-app");
            this.renderFactionChoices();
            this.bindEvents();
            this.open();
            this.refresh();
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
            this.form.addEventListener("submit", (event) => {
                event.preventDefault();
                if (this.startButton.disabled) return;
                this.startButton.disabled = true;
                const configuration = this.getConfiguration();
                this.startListeners.forEach((listener) => listener(configuration));
            });
        }

        getConfiguration() {
            const factionInput = this.form.elements.playerFaction;
            const countInput = this.form.elements.playerCount;
            const playerId = Number(factionInput.value);
            const playerCount = Number(countInput.value);
            return {
                playerId,
                playerCount,
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
            const opponents = configuration.playerCount - 1;
            this.summary.textContent = `${selectedFaction.name} contre ${opponents} adversaire${opponents > 1 ? "s" : ""} contrôlé${opponents > 1 ? "s" : ""} par l’ordinateur.`;
            this.startButton.textContent = `Lancer la partie · ${configuration.playerCount} joueurs`;
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
