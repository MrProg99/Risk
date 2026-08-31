(function (C) {
    "use strict";

    class InputManager {
        constructor(canvas, renderer) {
            this.canvas = canvas;
            this.renderer = renderer;
            this.clickListeners = new Set();
            this.rightClickListeners = new Set();
            this.quickTransferListeners = new Set();
            this.continuousTransferListeners = new Set();
            this.viewChangeListeners = new Set();
            this.lastPointerDown = null;
            this.rightDrag = null;
            this.suppressContextMenuUntil = 0;
            this.bindEvents();
        }

        bindEvents() {
            this.canvas.addEventListener("pointermove", (event) => {
                if (this.rightDrag) {
                    const drag = this.rightDrag;
                    const totalDistance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
                    if (totalDistance > 5) drag.moved = true;
                    const territory = this.renderer.getTerritoryAt(event.clientX, event.clientY);
                    this.renderer.setHovered(territory ? territory.id : null);
                    this.renderer.setTransferPreview(
                        drag.sourceTerritoryId,
                        event.clientX,
                        event.clientY,
                        territory ? territory.id : null,
                        drag.mode,
                        drag.sourceTerritoryIds
                    );
                    this.canvas.style.cursor = drag.moved ? "alias" : "crosshair";
                    return;
                }

                if (this.lastPointerDown) {
                    const drag = this.lastPointerDown;
                    const totalDistance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
                    if (totalDistance > 5) drag.moved = true;
                    if (drag.moved) {
                        this.renderer.panByScreenDelta(event.clientX - drag.lastX, event.clientY - drag.lastY);
                        this.viewChangeListeners.forEach((listener) => listener("pan"));
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
                if (event.button === 2 && (event.ctrlKey || event.altKey)) {
                    event.preventDefault();
                    this.suppressContextMenuUntil = performance.now() + 1000;
                    const source = this.renderer.getTerritoryAt(event.clientX, event.clientY);
                    if (!source) return;
                    const mode = event.altKey ? "continuous" : "quick";
                    const selectedGroup = Array.isArray(this.renderer.multiSelectedTerritoryIds)
                        ? this.renderer.multiSelectedTerritoryIds.map(Number)
                        : [];
                    const sourceTerritoryIds = selectedGroup.length > 1 && selectedGroup.includes(source.id)
                        ? selectedGroup
                        : [source.id];
                    this.rightDrag = {
                        startX: event.clientX,
                        startY: event.clientY,
                        moved: false,
                        pointerId: event.pointerId,
                        sourceTerritoryId: source.id,
                        sourceTerritoryIds,
                        mode
                    };
                    this.renderer.setTransferPreview(source.id, event.clientX, event.clientY, source.id, mode, sourceTerritoryIds);
                    this.capturePointer(event.pointerId);
                    this.canvas.style.cursor = "crosshair";
                    return;
                }
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
                this.capturePointer(event.pointerId);
            });

            this.canvas.addEventListener("pointerup", (event) => {
                if (event.button === 2 && this.rightDrag) {
                    const drag = this.rightDrag;
                    const target = this.renderer.getTerritoryAt(event.clientX, event.clientY);
                    this.rightDrag = null;
                    this.releasePointer(event.pointerId);
                    this.renderer.clearTransferPreview();
                    this.canvas.style.cursor = target ? "pointer" : "grab";
                    if (drag.moved && target && target.id !== drag.sourceTerritoryId) {
                        const source = this.renderer.game.state.getTerritory(drag.sourceTerritoryId);
                        const listeners = drag.mode === "continuous"
                            ? this.continuousTransferListeners
                            : this.quickTransferListeners;
                        listeners.forEach((listener) => listener(source, target, event));
                    }
                    return;
                }
                if (event.button !== 0) return;
                if (!this.lastPointerDown) return;
                const moved = this.lastPointerDown.moved;
                this.lastPointerDown = null;
                this.releasePointer(event.pointerId);
                this.canvas.style.cursor = "grab";
                if (moved) return;
                const territory = this.renderer.getTerritoryAt(event.clientX, event.clientY);
                this.clickListeners.forEach((listener) => listener(territory, event));
            });

            this.canvas.addEventListener("pointercancel", (event) => {
                this.lastPointerDown = null;
                this.rightDrag = null;
                this.renderer.clearTransferPreview();
                this.releasePointer(event.pointerId);
                this.canvas.style.cursor = "grab";
            });

            this.canvas.addEventListener("wheel", (event) => {
                event.preventDefault();
                const factor = Math.exp(-event.deltaY * 0.0012);
                this.renderer.zoomAt(event.clientX, event.clientY, factor);
                this.viewChangeListeners.forEach((listener) => listener("zoom"));
            }, { passive: false });

            this.canvas.addEventListener("contextmenu", (event) => {
                event.preventDefault();
                if (event.ctrlKey || event.altKey || performance.now() < this.suppressContextMenuUntil) {
                    this.suppressContextMenuUntil = 0;
                    return;
                }
                const territory = this.renderer.getTerritoryAt(event.clientX, event.clientY);
                this.rightClickListeners.forEach((listener) => listener(territory, event));
            });
        }

        capturePointer(pointerId) {
            try {
                if (this.canvas.setPointerCapture) this.canvas.setPointerCapture(pointerId);
            } catch (_error) {
                // Certains navigateurs refusent la capture pour un bouton secondaire.
            }
        }

        releasePointer(pointerId) {
            try {
                if (this.canvas.hasPointerCapture && this.canvas.hasPointerCapture(pointerId)) {
                    this.canvas.releasePointerCapture(pointerId);
                }
            } catch (_error) {
                // La capture a pu disparaître lorsque le pointeur quitte la fenêtre.
            }
        }

        onTerritoryClick(listener) {
            this.clickListeners.add(listener);
            return () => this.clickListeners.delete(listener);
        }

        onTerritoryRightClick(listener) {
            this.rightClickListeners.add(listener);
            return () => this.rightClickListeners.delete(listener);
        }

        onQuickTransfer(listener) {
            this.quickTransferListeners.add(listener);
            return () => this.quickTransferListeners.delete(listener);
        }

        onContinuousTransfer(listener) {
            this.continuousTransferListeners.add(listener);
            return () => this.continuousTransferListeners.delete(listener);
        }

        onViewChange(listener) {
            this.viewChangeListeners.add(listener);
            return () => this.viewChangeListeners.delete(listener);
        }
    }

    C.InputManager = InputManager;
})(window.Conquest = window.Conquest || {});
