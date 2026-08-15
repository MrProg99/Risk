(function (C) {
    "use strict";

    class EventSystem {
        constructor(game, options = {}) {
            this.game = game;
            this.enabled = options.enabled !== false;
            this.firstDelayMinMs = options.firstDelayMinMs || 60000;
            this.firstDelayMaxMs = options.firstDelayMaxMs || 90000;
            this.intervalMinMs = options.intervalMinMs || 60000;
            this.intervalMaxMs = options.intervalMaxMs || 120000;
            this.warningLeadMs = options.warningLeadMs || 8000;
        }

        reset() {
            const state = this.game.state;
            state.worldEvents = [];
            state.nextWorldEventId = 1;
            state.lastWorldEventType = null;
            this.scheduleNext(true);
        }

        update(deltaMs) {
            if (!this.enabled) return false;
            const state = this.game.state;
            let changed = this.expireEvents();
            const remainingMs = state.nextWorldEventAtMs - state.elapsedMs;

            if (!state.worldEventWarningIssued && remainingMs <= this.warningLeadMs) {
                state.worldEventWarningIssued = true;
                const definition = C.WORLD_EVENT_DEFINITIONS[state.scheduledWorldEventType];
                if (definition) {
                    this.game.addEvent(`ALERTE — ${definition.warning}`, "world");
                    this.game.notify({
                        type: "WORLD_EVENT_WARNING",
                        eventType: definition.id,
                        startsInMs: Math.max(0, remainingMs)
                    });
                }
                changed = true;
            }

            if (state.elapsedMs >= state.nextWorldEventAtMs) {
                this.triggerEvent(state.scheduledWorldEventType);
                this.scheduleNext(false);
                changed = true;
            }
            return changed;
        }

        triggerEvent(eventType) {
            if (eventType === "famine") return this.triggerFamine();
            if (eventType === "barbarianRaid") return this.triggerBarbarianRaid();
            if (eventType === "wildfire") return this.triggerWildfire();
            return null;
        }

        triggerFamine() {
            const definition = C.WORLD_EVENT_DEFINITIONS.famine;
            const candidates = this.getControlledLandTerritories().filter((territory) =>
                !this.isTerritoryAffected(territory.id, definition.id));
            if (!candidates.length) return null;
            candidates.sort((a, b) => this.game.getProductionMultiplier(b) - this.game.getProductionMultiplier(a));
            const pool = candidates.slice(0, Math.max(1, Math.ceil(candidates.length * 0.55)));
            const target = pool[C.Geometry.randomInt(this.game.random, 0, pool.length - 1)];
            const durationMs = this.randomBetween(definition.durationMinMs, definition.durationMaxMs);
            const worldEvent = this.registerEvent(definition.id, [target.id], durationMs);
            const owner = this.game.state.getFaction(target.ownerId);
            this.game.addEvent(`Famine à ${target.name} (${owner ? owner.name : "territoire neutre"}) : production suspendue pendant ${Math.round(durationMs / 1000)} secondes.`, "world");
            return worldEvent;
        }

        triggerWildfire() {
            const definition = C.WORLD_EVENT_DEFINITIONS.wildfire;
            const candidates = this.getControlledLandTerritories().filter((territory) => territory.units > 1);
            if (!candidates.length) return null;
            const target = candidates[C.Geometry.randomInt(this.game.random, 0, candidates.length - 1)];
            const ratio = this.randomBetween(definition.damageMinRatio, definition.damageMaxRatio);
            const damage = Math.min(target.units - 1, Math.max(1, Math.round(target.units * ratio)));
            target.units -= damage;
            const worldEvent = this.registerEvent(definition.id, [target.id], definition.visualDurationMs, { damage });
            this.game.addEvent(`Un feu de forêt ravage ${target.name} : ${damage} unité${damage > 1 ? "s" : ""} perdue${damage > 1 ? "s" : ""}.`, "world");
            return worldEvent;
        }

        triggerBarbarianRaid() {
            const definition = C.WORLD_EVENT_DEFINITIONS.barbarianRaid;
            let candidates = this.getControlledLandTerritories().filter((territory) =>
                !this.game.state.armies.some((army) => army.isBarbarian && army.toTerritoryId === territory.id));
            if (!candidates.length) return null;
            candidates = C.Geometry.shuffle(candidates, this.game.random);
            const targetCount = Math.min(
                candidates.length,
                C.Geometry.randomInt(this.game.random, definition.targetMin, definition.targetMax)
            );
            const targets = candidates.slice(0, targetCount);
            const eventId = this.game.state.nextWorldEventId;
            const armyIds = [];
            let longestDurationMs = 0;

            targets.forEach((target) => {
                const directionX = target.center.x - this.game.state.mapWidth / 2;
                const directionY = target.center.y - this.game.state.mapHeight / 2;
                const directionLength = Math.max(1, Math.hypot(directionX, directionY));
                const approachDistance = this.randomBetween(210, 330);
                const start = {
                    x: target.center.x + directionX / directionLength * approachDistance,
                    y: target.center.y + directionY / directionLength * approachDistance
                };
                const durationMs = this.randomBetween(4800, 7200);
                const defensePower = target.units * this.game.getDefenseMultiplier(target);
                const units = Math.max(4, Math.round(defensePower * this.randomBetween(0.68, 1.08)));
                const army = new C.Army({
                    id: this.game.state.nextArmyId++,
                    ownerId: C.BARBARIAN_FACTION.id,
                    fromTerritoryId: null,
                    toTerritoryId: target.id,
                    units,
                    durationMs,
                    start,
                    end: target.center,
                    isBarbarian: true,
                    worldEventId: eventId
                });
                longestDurationMs = Math.max(longestDurationMs, durationMs);
                armyIds.push(army.id);
                this.game.state.armies.push(army);
            });

            const worldEvent = this.registerEvent(definition.id, targets.map((target) => target.id), longestDurationMs + 2200, { armyIds });
            this.game.addEvent(`Attaque barbare : ${targets.length} bandes fondent simultanément sur ${targets.length} territoires.`, "world");
            this.game.notify({ type: "BARBARIAN_RAID_STARTED", eventId: worldEvent.id, armyIds: armyIds.slice() });
            return worldEvent;
        }

        registerEvent(type, territoryIds, durationMs, data = {}) {
            const state = this.game.state;
            const worldEvent = {
                id: state.nextWorldEventId++,
                type,
                territoryIds: territoryIds.slice(),
                startedAtMs: state.elapsedMs,
                endsAtMs: state.elapsedMs + durationMs,
                data: { ...data }
            };
            state.worldEvents.push(worldEvent);
            state.touch();
            this.game.notify({ type: "WORLD_EVENT_STARTED", worldEvent: { ...worldEvent, territoryIds: worldEvent.territoryIds.slice() } });
            return worldEvent;
        }

        expireEvents() {
            const state = this.game.state;
            const expired = state.worldEvents.filter((worldEvent) => state.elapsedMs >= worldEvent.endsAtMs);
            if (!expired.length) return false;
            state.worldEvents = state.worldEvents.filter((worldEvent) => state.elapsedMs < worldEvent.endsAtMs);
            expired.forEach((worldEvent) => {
                if (worldEvent.type === "famine") {
                    const territory = state.getTerritory(worldEvent.territoryIds[0]);
                    if (territory) this.game.addEvent(`La famine prend fin à ${territory.name} : la production reprend.`, "world");
                }
                this.game.notify({ type: "WORLD_EVENT_ENDED", eventId: worldEvent.id, eventType: worldEvent.type });
            });
            return true;
        }

        isTerritoryAffected(territoryId, eventType) {
            return this.game.state.worldEvents.some((worldEvent) =>
                worldEvent.type === eventType && worldEvent.territoryIds.includes(Number(territoryId)));
        }

        getControlledLandTerritories() {
            return this.game.state.territories.filter((territory) =>
                !territory.isImpassable && territory.ownerId !== null);
        }

        scheduleNext(isFirstEvent) {
            const state = this.game.state;
            const delayMs = isFirstEvent
                ? this.randomBetween(this.firstDelayMinMs, this.firstDelayMaxMs)
                : this.randomBetween(this.intervalMinMs, this.intervalMaxMs);
            state.nextWorldEventAtMs = state.elapsedMs + delayMs;
            state.scheduledWorldEventType = this.chooseNextEventType();
            state.worldEventWarningIssued = false;
        }

        chooseNextEventType() {
            const state = this.game.state;
            let definitions = Object.values(C.WORLD_EVENT_DEFINITIONS);
            const alternatives = definitions.filter((definition) => definition.id !== state.lastWorldEventType);
            if (alternatives.length) definitions = alternatives;
            const totalWeight = definitions.reduce((sum, definition) => sum + definition.weight, 0);
            let roll = this.game.random() * totalWeight;
            for (const definition of definitions) {
                roll -= definition.weight;
                if (roll <= 0) {
                    state.lastWorldEventType = definition.id;
                    return definition.id;
                }
            }
            state.lastWorldEventType = definitions[0].id;
            return definitions[0].id;
        }

        randomBetween(min, max) {
            return C.Geometry.lerp(min, max, this.game.random());
        }
    }

    C.EventSystem = EventSystem;
})(window.Conquest = window.Conquest || {});
