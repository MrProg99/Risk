(function (C) {
    "use strict";

    function launchGame(configuration, lobby) {
        const canvas = document.getElementById("game-canvas");
        const game = new C.Game({
            playerId: configuration.playerId,
            activeFactionIds: configuration.activeFactionIds
        });
        const audio = new C.AudioManager();
        audio.unlock();
        const renderer = new C.MapRenderer(canvas, game);
        const input = new C.InputManager(canvas, renderer);
        const ui = new C.UIController(game, renderer, input, audio);
        game.newGame();
        lobby.close();

        let lastFrame = performance.now();
        let lastUiRefresh = 0;
        function frame(now) {
            const deltaMs = Math.min(now - lastFrame, 250);
            lastFrame = now;
            game.update(deltaMs);
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
        const lobby = new C.LobbyController();
        lobby.onStart((configuration) => launchGame(configuration, lobby));
        window.frontieres = { lobby };
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})(window.Conquest = window.Conquest || {});
