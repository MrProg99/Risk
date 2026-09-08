(function (C) {
    "use strict";

    C.drawTeamSignals = function (ctx, game, project, now, scale = 1, mini = false) {
        const offsets = new Map();
        (game.teamSignals?.getVisibleSignals() || []).forEach((signal) => {
            const territory = game.state.getTerritory(signal.targetTerritoryId);
            const author = game.state.getFaction(signal.playerId);
            const type = C.TEAM_SIGNAL_TYPES[signal.signalType];
            if (!territory || !author || !type) return;
            const point = project(territory);
            const index = offsets.get(territory.id) || 0;
            offsets.set(territory.id, index + 1);
            ctx.save();
            ctx.translate(point.x, point.y);
            ctx.scale(scale, scale);
            ctx.translate(index * (mini ? 9 : 32), mini ? -6 : -43);
            ctx.globalAlpha = Math.min(1, (signal.expiresAtMs - game.state.elapsedMs) / 2000);
            const radius = mini ? 6 : 15;
            ctx.beginPath();
            ctx.arc(0, 0, radius + 3 + Math.sin(now / 220) * 2, 0, Math.PI * 2);
            ctx.strokeStyle = author.color;
            ctx.lineWidth = mini ? 1 : 2;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.fillStyle = "#08151c";
            ctx.fill();
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = `${mini ? 9 : 17}px sans-serif`;
            ctx.fillText(type.icon, 0, 0);
            if (!mini) {
                const name = (author.playerName || author.name).slice(0, 24);
                ctx.font = "bold 11px sans-serif";
                const width = ctx.measureText(name).width + 12;
                ctx.fillStyle = "#08151c";
                ctx.fillRect(-width / 2, -34, width, 16);
                ctx.fillStyle = author.color;
                ctx.fillText(name, 0, -26);
            }
            ctx.restore();
        });
    };
})(window.Conquest = window.Conquest || {});
