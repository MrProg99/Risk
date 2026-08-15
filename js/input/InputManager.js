(function (C) {
    "use strict";

    class InputManager {
        constructor(canvas, renderer) {
            this.canvas = canvas;
            this.renderer = renderer;
            this.clickListeners = new Set();
            this.rightClickListeners = new Set();
            this.lastPointerDown = null;
            this.bindEvents();
        }

        bindEvents() {
            this.canvas.addEventListener("pointermove", (event) => {
                if (this.lastPointerDown) {
                    const drag = this.lastPointerDown;
                    const totalDistance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
                    if (totalDistance > 5) drag.moved = true;
                    if (drag.moved) {
                        this.renderer.panByScreenDelta(event.clientX - drag.lastX, event.clientY - drag.lastY);
                        this.renderer.setHovered(null);
                        this.canvas.style.cursor = "grabbing";
                    }
                    drag.lastX = event.clientX;
                    drag.lastY = event.clientY;
                    return;
                }
                const territory = this.renderer.getTerritoryAt(event.clientX, event.clientY);
                this.renderer.setHovered(territory ? territory.id : null);
                this.canvas.style.cursor = territory ? "pointer" : "grab";
            });

            this.canvas.addEventListener("pointerleave", () => {
                this.renderer.setHovered(null);
            });

            this.canvas.addEventListener("pointerdown", (event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                this.lastPointerDown = {
                    startX: event.clientX,
                    startY: event.clientY,
                    lastX: event.clientX,
                    lastY: event.clientY,
                    moved: false,
                    pointerId: event.pointerId
                };
                this.canvas.setPointerCapture(event.pointerId);
            });

            this.canvas.addEventListener("pointerup", (event) => {
                if (event.button !== 0) return;
                if (!this.lastPointerDown) return;
                const moved = this.lastPointerDown.moved;
                this.lastPointerDown = null;
                if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
                this.canvas.style.cursor = "grab";
                if (moved) return;
                const territory = this.renderer.getTerritoryAt(event.clientX, event.clientY);
                this.clickListeners.forEach((listener) => listener(territory, event));
            });

            this.canvas.addEventListener("pointercancel", (event) => {
                this.lastPointerDown = null;
                if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
                this.canvas.style.cursor = "grab";
            });

            this.canvas.addEventListener("wheel", (event) => {
                event.preventDefault();
                const factor = Math.exp(-event.deltaY * 0.0012);
                this.renderer.zoomAt(event.clientX, event.clientY, factor);
            }, { passive: false });

            this.canvas.addEventListener("contextmenu", (event) => {
                event.preventDefault();
                const territory = this.renderer.getTerritoryAt(event.clientX, event.clientY);
                this.rightClickListeners.forEach((listener) => listener(territory, event));
            });
        }

        onTerritoryClick(listener) {
            this.clickListeners.add(listener);
            return () => this.clickListeners.delete(listener);
        }

        onTerritoryRightClick(listener) {
            this.rightClickListeners.add(listener);
            return () => this.rightClickListeners.delete(listener);
        }
    }

    C.InputManager = InputManager;
})(window.Conquest = window.Conquest || {});
