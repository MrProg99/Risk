(function (C) {
    C.runPopupPositionTests = function (check) {
        const topbar = document.createElement("div");
        topbar.className = "topbar";
        topbar.style.cssText = "position:fixed;top:0;left:0;width:100%;height:80px";
        const container = document.createElement("div");
        container.style.cssText = "position:fixed;left:20px;top:-200px;width:600px;height:2000px;overflow:hidden;border:2px solid;box-sizing:border-box";
        const panel = document.createElement("div");
        panel.style.cssText = "position:absolute;width:310px;height:360px;padding:13px;overflow-y:auto;box-sizing:border-box";
        const content = document.createElement("div");
        content.style.height = "330px";
        panel.append(content);
        container.append(panel);
        document.body.append(topbar, container);
        let anchor = { clientX: 300, clientY: window.innerHeight - 5 };
        const ui = { elements: { attackPanel: panel }, renderer: { worldToScreen: () => anchor } };
        const position = () => C.UIController.prototype.positionAttackPanel.call(ui, { center: { x: 0, y: 0 } });
        try {
            position();
            check(panel.getBoundingClientRect().bottom <= window.innerHeight - 11,
                "la fenêtre d’attaque reste visible près du bas de l’écran");
            anchor.clientY = -100;
            position();
            check(panel.getBoundingClientRect().top >= 91,
                "la fenêtre d’attaque ne passe pas sous la barre supérieure");
            container.style.top = `${window.innerHeight - 145}px`;
            position();
            check(panel.getBoundingClientRect().bottom <= window.innerHeight - 11 && panel.scrollHeight > panel.clientHeight,
                "une faible hauteur visible active le défilement interne de l’offensive");
            container.style.top = "100px";
            container.style.left = `${window.innerWidth - 220}px`;
            anchor = { clientX: window.innerWidth - 10, clientY: 200 };
            position();
            check(panel.getBoundingClientRect().right <= window.innerWidth - 11 && panel.offsetWidth < 220,
                "la fenêtre d’attaque tient aussi dans la largeur visible de la carte");
            container.style.top = `${window.innerHeight + 20}px`;
            position();
            check(panel.style.visibility === "hidden", "une carte hors écran ne laisse pas de fenêtre d’attaque flottante");
            container.style.top = "100px";
            container.style.left = "20px";
            position();
            check(panel.style.visibility === "" && panel.offsetWidth === 310 && panel.offsetHeight > 120,
                "la fenêtre retrouve sa place et sa taille quand la carte redevient visible");
        } finally {
            container.remove();
            topbar.remove();
        }
    };
})(window.Conquest = window.Conquest || {});
