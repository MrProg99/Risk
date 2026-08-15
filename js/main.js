(function (C) {
    "use strict";

    function start() {
        const canvas = document.getElementById("game-canvas");
        const game = new C.Game({ playerId: 1 });
        const renderer = new C.MapRenderer(canvas, game);
        const input = new C.InputManager(canvas, renderer);
        const ui = new C.UIController(game, renderer, input);
        game.newGame();

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

        window.frontieres = { game, renderer, input, ui };
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})(window.Conquest = window.Conquest || {});
