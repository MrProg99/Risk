(function (C) {
    "use strict";

    function launchGame(configuration, lobby) {
        const canvas = document.getElementById("game-canvas");
        const multiplayer = configuration.mode === "multiplayer";
        const game = new C.Game({
            playerId: configuration.playerId,
            activeFactionIds: configuration.activeFactionIds,
            factionSetups: configuration.factionSetups,
            enableAI: !multiplayer
        });
        const audio = new C.AudioManager();
        audio.unlock();
        audio.startBackgroundMusic();
        const renderer = new C.MapRenderer(canvas, game);
        const input = new C.InputManager(canvas, renderer);
        const ui = new C.UIController(game, renderer, input, audio);
        game.newGame(configuration.seed);
        lobby.close();

        if (multiplayer) {
            document.getElementById("new-map").disabled = true;
            document.getElementById("new-map").title = "La carte est contrôlée par le salon multijoueur";
            document.getElementById("toggle-pause").disabled = true;
            document.getElementById("toggle-pause").title = "Une partie en ligne ne peut pas être mise en pause";
            if (configuration.isHost) {
                configuration.network.watchCommands((command) => {
                    const player = configuration.network.room?.players?.[command.uid];
                    if (!player || player.connected === false) return;
                    game.executeAuthoritativeCommand({ ...command, playerId: Number(player.slot) });
                });
                configuration.network.publishSnapshot(game.createNetworkSnapshot());
            } else {
                game.setCommandTransport((command) => configuration.network.sendCommand(command));
                configuration.network.watchSnapshot((snapshot) => game.applyNetworkSnapshot(snapshot));
            }
        }

        let lastFrame = performance.now();
        let lastUiRefresh = 0;
        let lastNetworkPublish = 0;
        let lastPresenceReview = 0;
        let publishedRevision = -1;
        let publishing = false;
        let victoryPublished = false;
        function frame(now) {
            const deltaMs = Math.min(now - lastFrame, 250);
            lastFrame = now;
            if (!multiplayer || configuration.isHost) game.update(deltaMs);
            else game.updateRemotePresentation(deltaMs);
            if (multiplayer && configuration.isHost && now - lastPresenceReview >= 1000) {
                const takeoverIds = Object.values(configuration.network.room?.players || {})
                    .filter((player) => player.connected === false && Number(player.disconnectedAt) > 0 && Date.now() - Number(player.disconnectedAt) >= 30000)
                    .map((player) => Number(player.slot));
                game.aiSystem.factionIds = takeoverIds;
                game.aiSystem.enabled = takeoverIds.length > 0;
                takeoverIds.forEach((factionId) => {
                    if (!game.aiSystem.thinkTimers.has(factionId)) game.aiSystem.thinkTimers.set(factionId, 500);
                });
                Array.from(game.aiSystem.thinkTimers.keys()).forEach((factionId) => {
                    if (!takeoverIds.includes(factionId)) game.aiSystem.thinkTimers.delete(factionId);
                });
                lastPresenceReview = now;
            }
            if (multiplayer && configuration.isHost && !publishing && now - lastNetworkPublish >= 250 && game.state.revision !== publishedRevision) {
                publishing = true;
                const revision = game.state.revision;
                configuration.network.publishSnapshot(game.createNetworkSnapshot())
                    .then(() => { publishedRevision = revision; })
                    .finally(() => { publishing = false; });
                lastNetworkPublish = now;
            }
            if (multiplayer && configuration.isHost && game.state.winnerTeamId !== null && !victoryPublished) {
                victoryPublished = true;
                configuration.network.finishRoom(game.state.winnerTeamId);
            }
            renderer.render(now);
            if (now - lastUiRefresh >= 200) {
                ui.refreshDynamic();
                lastUiRefresh = now;
            }
            requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);

        window.frontieres = { game, renderer, input, ui, audio, lobby, configuration };
    }

    function start() {
        const network = new C.FirebaseMultiplayer();
        const lobby = new C.LobbyController(C.FACTION_DEFINITIONS, network);
        lobby.onStart((configuration) => launchGame(configuration, lobby));
        window.frontieres = { lobby };
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})(window.Conquest = window.Conquest || {});
