(function (C) {
    "use strict";

    class MatchTimeline {
        constructor(data = null) {
            this.version = 2;
            this.initialOwners = [];
            this.captures = [];
            this.unitFactionIds = [];
            this.unitSamples = [];
            if (data) this.load(data);
        }

        reset(territories = [], factions = []) {
            this.initialOwners = territories.map((territory) => [
                Number(territory.id),
                territory.ownerId === null || territory.ownerId === undefined ? null : Number(territory.ownerId)
            ]);
            this.captures = [];
            this.unitFactionIds = factions.map((faction) => Number(faction.id)).filter(Number.isFinite);
            this.unitSamples = [];
            return this;
        }

        recordUnitSample(timeMs, totalsByFaction = {}) {
            if (!this.unitFactionIds.length) {
                const ids = totalsByFaction instanceof Map
                    ? [...totalsByFaction.keys()]
                    : Object.keys(totalsByFaction);
                this.unitFactionIds = ids.map(Number).filter(Number.isFinite).sort((first, second) => first - second);
            }
            if (!this.unitFactionIds.length) return null;

            const time = Math.max(0, Math.round(Number(timeMs) || 0));
            const sample = [time, ...this.unitFactionIds.map((factionId) => {
                const value = totalsByFaction instanceof Map
                    ? totalsByFaction.get(factionId)
                    : totalsByFaction[factionId];
                return Math.max(0, Math.round(Number(value) || 0));
            })];
            const previous = this.unitSamples[this.unitSamples.length - 1];
            if (previous?.[0] === time) this.unitSamples[this.unitSamples.length - 1] = sample;
            else this.unitSamples.push(sample);
            return sample.slice();
        }

        getUnitSeries(factionId, timeMs = Infinity) {
            const index = this.unitFactionIds.indexOf(Number(factionId));
            if (index < 0) return [];
            const limit = Number.isFinite(Number(timeMs)) ? Math.max(0, Number(timeMs)) : Infinity;
            return this.unitSamples
                .filter((sample) => sample[0] <= limit)
                .map((sample) => ({ timeMs: sample[0], units: sample[index + 1] }));
        }

        recordCapture({ timeMs, territoryId, previousOwnerId = null, ownerId = null }) {
            const normalizedTerritoryId = Number(territoryId);
            if (!Number.isFinite(normalizedTerritoryId)) return null;
            const previous = previousOwnerId === null || previousOwnerId === undefined ? null : Number(previousOwnerId);
            const owner = ownerId === null || ownerId === undefined ? null : Number(ownerId);
            if (previous === owner) return null;

            const capture = [
                Math.max(0, Math.round(Number(timeMs) || 0)),
                normalizedTerritoryId,
                Number.isFinite(previous) ? previous : null,
                Number.isFinite(owner) ? owner : null
            ];
            this.captures.push(capture);
            return this.toEvent(capture, this.captures.length - 1);
        }

        getOwnershipAt(timeMs = Infinity) {
            const limit = Number.isFinite(Number(timeMs)) ? Math.max(0, Number(timeMs)) : Infinity;
            const owners = new Map(this.initialOwners.map(([territoryId, ownerId]) => [Number(territoryId), ownerId]));
            for (const capture of this.captures) {
                if (capture[0] > limit) break;
                owners.set(capture[1], capture[3]);
            }
            return owners;
        }

        getCaptureCountAt(timeMs = Infinity) {
            const limit = Number.isFinite(Number(timeMs)) ? Math.max(0, Number(timeMs)) : Infinity;
            let count = 0;
            while (count < this.captures.length && this.captures[count][0] <= limit) count += 1;
            return count;
        }

        getLatestCaptureAt(timeMs = Infinity) {
            const count = this.getCaptureCountAt(timeMs);
            return count ? this.toEvent(this.captures[count - 1], count - 1) : null;
        }

        getEvents() {
            return this.captures.map((capture, index) => this.toEvent(capture, index));
        }

        toEvent(capture, index = -1) {
            return {
                index,
                timeMs: capture[0],
                territoryId: capture[1],
                previousOwnerId: capture[2],
                ownerId: capture[3]
            };
        }

        toJSON() {
            return {
                version: this.version,
                initialOwners: this.initialOwners.map((entry) => entry.slice()),
                captures: this.captures.map((entry) => entry.slice()),
                unitFactionIds: this.unitFactionIds.slice(),
                unitSamples: this.unitSamples.map((entry) => entry.slice())
            };
        }

        load(data = {}) {
            this.version = Math.max(2, Number(data.version) || 1);
            this.initialOwners = (Array.isArray(data.initialOwners) ? data.initialOwners : [])
                .filter((entry) => Array.isArray(entry) && Number.isFinite(Number(entry[0])))
                .map((entry) => [
                    Number(entry[0]),
                    entry[1] === null || entry[1] === undefined ? null : Number(entry[1])
                ]);
            this.captures = (Array.isArray(data.captures) ? data.captures : [])
                .filter((entry) => Array.isArray(entry) && Number.isFinite(Number(entry[1])))
                .map((entry) => [
                    Math.max(0, Math.round(Number(entry[0]) || 0)),
                    Number(entry[1]),
                    entry[2] === null || entry[2] === undefined ? null : Number(entry[2]),
                    entry[3] === null || entry[3] === undefined ? null : Number(entry[3])
                ])
                .sort((first, second) => first[0] - second[0]);
            this.unitFactionIds = (Array.isArray(data.unitFactionIds) ? data.unitFactionIds : [])
                .map(Number)
                .filter(Number.isFinite);
            const expectedLength = this.unitFactionIds.length + 1;
            this.unitSamples = (this.unitFactionIds.length && Array.isArray(data.unitSamples) ? data.unitSamples : [])
                .filter((entry) => Array.isArray(entry) && entry.length >= expectedLength && Number.isFinite(Number(entry[0])))
                .map((entry) => [
                    Math.max(0, Math.round(Number(entry[0]) || 0)),
                    ...this.unitFactionIds.map((_factionId, index) => Math.max(0, Math.round(Number(entry[index + 1]) || 0)))
                ])
                .sort((first, second) => first[0] - second[0]);
            return this;
        }

        static fromJSON(data) {
            return new MatchTimeline(data);
        }
    }

    C.MatchTimeline = MatchTimeline;
})(window.Conquest = window.Conquest || {});
