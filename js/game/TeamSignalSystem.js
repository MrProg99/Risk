(function (C) {
    "use strict";

    C.TEAM_SIGNAL_TYPES = Object.freeze({
        attack: { label: "Attaquer ici", icon: "⚔" },
        defend: { label: "Défendre ici", icon: "🛡" },
        reinforce: { label: "Renforts ici", icon: "➜" }
    });

    class TeamSignalSystem {
        constructor(game) {
            this.game = game;
            this.highestSeenId = 0;
        }

        isAvailable(playerId = this.game.playerId) {
            const faction = this.game.state.getFaction(playerId);
            return Boolean(faction && !faction.isAI && this.game.state.factions.some((other) =>
                other.id !== faction.id && !other.isAI && other.teamId === faction.teamId));
        }

        validate(command) {
            const state = this.game.state;
            const playerId = Number(command.playerId);
            if (!this.isAvailable(playerId)) return { ok: false, error: "Les signaux sont réservés aux équipiers humains." };
            if (state.winnerTeamId !== null || this.game.paused) return { ok: false, error: "La partie n’est pas active." };
            if (!state.getTerritoriesOwnedBy(playerId).length) return { ok: false, error: "Votre faction est éliminée." };
            if (!Object.hasOwn(C.TEAM_SIGNAL_TYPES, command.signalType)) return { ok: false, error: "Signal inconnu." };
            const territory = state.getTerritory(command.targetTerritoryId);
            if (!territory || territory.isImpassable || !this.game.isTerritoryVisible(territory.id, playerId)) {
                return { ok: false, error: "Choisissez un territoire terrestre visible." };
            }
            const allied = this.game.areAllied(territory.ownerId, playerId);
            if ((command.signalType === "attack") === allied) return { ok: false, error: "Ce signal ne convient pas au propriétaire de cette position." };
            const last = state.lastTeamSignalAtMs[playerId];
            if (last !== undefined && state.elapsedMs - last < 3000) return { ok: false, error: "Attendez trois secondes entre deux signaux." };
            return { ok: true };
        }

        send(command) {
            const validation = this.validate(command);
            if (!validation.ok) return validation;
            const state = this.game.state;
            const faction = state.getFaction(command.playerId);
            this.update();
            const own = state.teamSignals.filter((signal) => signal.playerId === faction.id);
            if (own.length >= 3) state.teamSignals = state.teamSignals.filter((signal) => signal.id !== own[0].id);
            const signal = {
                id: state.nextTeamSignalId++, playerId: faction.id, teamId: faction.teamId,
                signalType: command.signalType, targetTerritoryId: Number(command.targetTerritoryId),
                createdAtMs: state.elapsedMs, expiresAtMs: state.elapsedMs + 15000
            };
            state.teamSignals.push(signal);
            state.lastTeamSignalAtMs[faction.id] = state.elapsedMs;
            state.touch();
            this.announce([signal]);
            return { ok: true, signal };
        }

        getVisibleSignals(playerId = this.game.playerId) {
            const state = this.game.state;
            const faction = state.getFaction(playerId);
            if (!faction || !state.teamSignals.length) return [];
            const visibility = this.game.getTerritoryVisibilityMap(playerId);
            return state.teamSignals.filter((signal) => signal.teamId === faction.teamId &&
                signal.expiresAtMs > state.elapsedMs && visibility.has(signal.targetTerritoryId));
        }

        announce(signals) {
            const visibleIds = new Set(this.getVisibleSignals().map((signal) => signal.id));
            const previousHighest = this.highestSeenId;
            signals.forEach((signal) => {
                this.highestSeenId = Math.max(this.highestSeenId, signal.id);
                if (signal.id > previousHighest && visibleIds.has(signal.id)) {
                    this.game.notify({ type: "TEAM_SIGNAL_CREATED", signal });
                }
            });
        }

        update() {
            const state = this.game.state;
            const count = state.teamSignals.length;
            if (!count) return false;
            state.teamSignals = state.teamSignals.filter((signal) => signal.expiresAtMs > state.elapsedMs);
            return count !== state.teamSignals.length;
        }
    }
    C.TeamSignalSystem = TeamSignalSystem;
})(window.Conquest = window.Conquest || {});
