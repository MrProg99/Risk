(function (C) {
    "use strict";

    const SDK_VERSION = "12.17.1";
    const ROOT = "frontieres/rooms";
    const PLAYER_COLORS = ["#f0b84d", "#43cde0", "#ef655f", "#9c7cf4", "#74d96b", "#ed7fc3"];

    class FirebaseMultiplayer {
        constructor(config = C.FIREBASE_CONFIG) {
            this.config = config;
            this.ready = false;
            this.uid = null;
            this.roomCode = null;
            this.room = null;
            this.presenceDisconnect = null;
            this.unsubscribers = [];
        }

        async initialize() {
            if (this.ready) return this;
            if (location.protocol === "file:") {
                throw new Error("Le multijoueur exige Live Server ou un autre serveur HTTP local.");
            }
            const base = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
            const [{ initializeApp }, authApi, databaseApi] = await Promise.all([
                import(`${base}/firebase-app.js`),
                import(`${base}/firebase-auth.js`),
                import(`${base}/firebase-database.js`)
            ]);
            this.api = { ...databaseApi };
            this.app = initializeApp(this.config);
            this.auth = authApi.getAuth(this.app);
            this.database = databaseApi.getDatabase(this.app);
            const credential = this.auth.currentUser
                ? { user: this.auth.currentUser }
                : await authApi.signInAnonymously(this.auth);
            this.uid = credential.user.uid;
            this.ready = true;
            return this;
        }

        static normalizeCode(code) {
            return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
        }

        static makeCode() {
            const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
            const bytes = new Uint8Array(6);
            crypto.getRandomValues(bytes);
            return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
        }

        static formatError(error) {
            const code = String(error?.code || "").toLowerCase();
            const message = String(error?.message || "");
            if (/permission[-_]?denied/.test(code) || /permission[_ -]?denied|access denied/i.test(message)) {
                const operation = error?.frontieresOperation ? ` pendant ${error.frontieresOperation}` : "";
                return `Accès Firebase refusé${operation}. Publiez les règles Frontières (bloc frontieres) dans Realtime Database.`;
            }
            if (code.includes("operation-not-allowed") || code.includes("admin-restricted-operation")) {
                return "L’authentification anonyme Firebase doit être activée dans Authentication > Sign-in method.";
            }
            if (code.includes("network-request-failed")) {
                return "Connexion à Firebase impossible. Vérifiez Internet, puis réessayez.";
            }
            return message || "Connexion au salon impossible.";
        }

        static operationError(error, operation) {
            const wrapped = new Error(error?.message || "Opération Firebase refusée.");
            wrapped.code = error?.code;
            wrapped.frontieresOperation = operation;
            return wrapped;
        }

        static buildFactionSetups(room) {
            const participants = Object.values(room.players || {}).concat(FirebaseMultiplayer.buildAIPlayers(room));
            return participants.sort((a, b) => a.slot - b.slot).map((player) => {
                const race = C.FACTION_DEFINITIONS.find((item) => item.id === Number(player.raceId)) || C.FACTION_DEFINITIONS[0];
                return {
                    ...race,
                    bonuses: { ...race.bonuses },
                    id: Number(player.slot),
                    definitionId: race.id,
                    teamId: Number(player.teamId),
                    playerUid: player.uid,
                    playerName: player.name,
                    isAI: Boolean(player.isAI),
                    name: `${race.name} · ${player.name}`,
                    color: player.color,
                    accent: player.color
                };
            });
        }

        static buildAIPlayers(room) {
            if (room?.meta?.opponentMode !== "ai") return [];
            const teamSize = Math.max(1, Math.min(3, Number(room.meta.teamSize) || 1));
            return Array.from({ length: teamSize }, (_unused, index) => {
                const slot = teamSize + index + 1;
                return {
                    uid: null,
                    name: `IA ${index + 1}`,
                    raceId: C.FACTION_DEFINITIONS[(slot - 1) % C.FACTION_DEFINITIONS.length].id,
                    teamId: 2,
                    slot,
                    color: PLAYER_COLORS[(slot - 1) % PLAYER_COLORS.length],
                    connected: true,
                    isAI: true
                };
            });
        }

        playerProfile({ name, raceId, teamId, slot }) {
            return {
                uid: this.uid,
                name: String(name || "Commandant").trim().slice(0, 24) || "Commandant",
                raceId: Number(raceId) || 1,
                teamId: Number(teamId),
                slot: Number(slot),
                color: PLAYER_COLORS[(Number(slot) - 1) % PLAYER_COLORS.length],
                connected: true,
                joinedAt: this.api.serverTimestamp(),
                lastSeenAt: this.api.serverTimestamp()
            };
        }

        async createRoom(options) {
            await this.initialize();
            const teamSize = Math.max(1, Math.min(3, Number(options.teamSize) || 1));
            let code;
            let roomRef;
            for (let attempt = 0; attempt < 8; attempt += 1) {
                code = FirebaseMultiplayer.makeCode();
                roomRef = this.api.ref(this.database, `${ROOT}/${code}`);
                if (!(await this.api.get(roomRef)).exists()) break;
            }
            const player = this.playerProfile({ ...options, teamId: 1, slot: 1 });
            const now = this.api.serverTimestamp();
            await this.api.set(roomRef, {
                meta: {
                    version: 2,
                    status: "lobby",
                    hostUid: this.uid,
                    teamSize,
                    maxPlayers: teamSize * 2,
                    opponentMode: options.opponentMode === "human" ? "human" : "ai",
                    aiDifficulty: ["relaxed", "normal", "hard", "relentless"].includes(options.aiDifficulty)
                        ? options.aiDifficulty
                        : "normal",
                    mapType: options.mapType === "hourglass" ? "hourglass" : "standard",
                    seed: null,
                    createdAt: now,
                    updatedAt: now
                },
                players: { [this.uid]: player },
                slots: { 1: this.uid }
            });
            this.roomCode = code;
            localStorage.setItem("frontieres.multiplayerRoom", code);
            await this.setupPresence(code);
            return code;
        }

        async joinRoom(rawCode, options) {
            await this.initialize();
            const code = FirebaseMultiplayer.normalizeCode(rawCode);
            if (code.length !== 6) throw new Error("Le code du salon doit contenir 6 caractères.");
            const roomRef = this.api.ref(this.database, `${ROOT}/${code}`);
            let roomSnapshot;
            try {
                roomSnapshot = await this.api.get(roomRef);
            } catch (error) {
                throw FirebaseMultiplayer.operationError(error, "la lecture du salon");
            }
            if (!roomSnapshot.exists()) throw new Error("Salon introuvable.");
            const room = roomSnapshot.val();
            if (room.meta?.status !== "lobby") throw new Error("Cette partie a déjà commencé.");
            const existing = room.players?.[this.uid];
            if (existing) {
                await this.api.update(this.api.ref(this.database, `${ROOT}/${code}/players/${this.uid}`), {
                    connected: true,
                    lastSeenAt: this.api.serverTimestamp()
                });
                this.roomCode = code;
                localStorage.setItem("frontieres.multiplayerRoom", code);
                await this.setupPresence(code);
                return existing;
            }

            const teamSize = Number(room.meta.teamSize);
            const preferredTeam = Math.max(1, Math.min(2, Number(options.teamId) || 1));
            const teamOrder = room.meta.opponentMode === "ai"
                ? [1]
                : [preferredTeam, preferredTeam === 1 ? 2 : 1];
            let claimed = null;
            for (const teamId of teamOrder) {
                for (let offset = 0; offset < teamSize; offset += 1) {
                    const slot = teamId === 1 ? offset + 1 : teamSize + offset + 1;
                    const slotRef = this.api.ref(this.database, `${ROOT}/${code}/slots/${slot}`);
                    let result;
                    try {
                        result = await this.api.runTransaction(slotRef, (current) => current || this.uid, { applyLocally: false });
                    } catch (error) {
                        throw FirebaseMultiplayer.operationError(error, "la réservation de votre place");
                    }
                    if (result.committed && result.snapshot.val() === this.uid) {
                        claimed = { teamId, slot };
                        break;
                    }
                }
                if (claimed) break;
            }
            if (!claimed) throw new Error("Le salon est complet.");
            const player = this.playerProfile({ ...options, ...claimed });
            try {
                await this.api.set(this.api.ref(this.database, `${ROOT}/${code}/players/${this.uid}`), player);
            } catch (error) {
                throw FirebaseMultiplayer.operationError(error, "l’ajout de votre profil au salon");
            }
            this.roomCode = code;
            localStorage.setItem("frontieres.multiplayerRoom", code);
            try {
                await this.setupPresence(code);
            } catch (error) {
                throw FirebaseMultiplayer.operationError(error, "l’activation de votre présence");
            }
            return player;
        }

        async restoreRoom() {
            const code = FirebaseMultiplayer.normalizeCode(localStorage.getItem("frontieres.multiplayerRoom"));
            if (code.length !== 6) return null;
            await this.initialize();
            const snapshot = await this.api.get(this.api.ref(this.database, `${ROOT}/${code}`));
            const room = snapshot.val();
            const player = room?.players?.[this.uid];
            const disconnectedFor = Date.now() - Number(player?.disconnectedAt || Date.now());
            if (!room || !player || room.meta?.status === "ended" || (player.connected === false && disconnectedFor > 30000)) {
                localStorage.removeItem("frontieres.multiplayerRoom");
                return null;
            }
            this.roomCode = code;
            this.room = room;
            await this.setupPresence(code);
            return room;
        }

        async setupPresence(code) {
            const playerRef = this.api.ref(this.database, `${ROOT}/${code}/players/${this.uid}`);
            if (this.presenceDisconnect) {
                await this.presenceDisconnect.cancel().catch(() => {});
            }
            this.presenceDisconnect = this.api.onDisconnect(playerRef);
            await this.presenceDisconnect.update({
                connected: false,
                disconnectedAt: this.api.serverTimestamp(),
                lastSeenAt: this.api.serverTimestamp()
            });
            await this.api.update(playerRef, { connected: true, disconnectedAt: null, lastSeenAt: this.api.serverTimestamp() });
        }

        async leaveRoom() {
            const code = this.roomCode;
            this.close();
            localStorage.removeItem("frontieres.multiplayerRoom");
            if (!this.ready || !code) {
                this.roomCode = null;
                this.room = null;
                return;
            }

            if (this.presenceDisconnect) {
                await this.presenceDisconnect.cancel().catch(() => {});
                this.presenceDisconnect = null;
            }

            try {
                const room = this.room || (await this.api.get(this.api.ref(this.database, `${ROOT}/${code}`))).val();
                const player = room?.players?.[this.uid];
                if (player) {
                    const removals = [
                        this.api.remove(this.api.ref(this.database, `${ROOT}/${code}/players/${this.uid}`))
                    ];
                    if (player.slot) {
                        removals.push(this.api.remove(this.api.ref(this.database, `${ROOT}/${code}/slots/${player.slot}`)));
                    }
                    await Promise.all(removals);
                }
                if (room?.meta?.hostUid === this.uid && room.meta.status === "lobby") {
                    await this.api.update(this.api.ref(this.database, `${ROOT}/${code}/meta`), {
                        status: "ended",
                        endedAt: this.api.serverTimestamp(),
                        updatedAt: this.api.serverTimestamp()
                    });
                }
            } finally {
                this.roomCode = null;
                this.room = null;
            }
        }

        watchRoom(listener) {
            const roomRef = this.api.ref(this.database, `${ROOT}/${this.roomCode}`);
            const unsubscribe = this.api.onValue(roomRef, (snapshot) => {
                this.room = snapshot.val();
                listener(this.room);
            });
            this.unsubscribers.push(unsubscribe);
            return unsubscribe;
        }

        async startRoom() {
            if (!this.room || this.room.meta.hostUid !== this.uid) throw new Error("Seul l’hôte peut lancer la partie.");
            const players = Object.values(this.room.players || {});
            const aiOpponents = this.room.meta.opponentMode === "ai";
            const expectedHumans = aiOpponents ? Number(this.room.meta.teamSize) : Number(this.room.meta.maxPlayers);
            if (players.length !== expectedHumans) throw new Error("Tous les joueurs humains doivent être présents.");
            const teamOne = players.filter((player) => Number(player.teamId) === 1).length;
            const teamTwo = players.filter((player) => Number(player.teamId) === 2).length;
            if (aiOpponents) {
                if (teamOne !== Number(this.room.meta.teamSize) || teamTwo !== 0) throw new Error("L’équipe humaine doit être complète.");
            } else if (teamOne !== teamTwo) throw new Error("Les deux équipes doivent être équilibrées.");
            await this.api.update(this.api.ref(this.database, `${ROOT}/${this.roomCode}/meta`), {
                status: "playing",
                seed: Math.floor(Math.random() * 1000000),
                startedAt: this.api.serverTimestamp(),
                updatedAt: this.api.serverTimestamp()
            });
        }

        async finishRoom(teamId) {
            if (this.room?.meta?.hostUid !== this.uid) return;
            await this.api.update(this.api.ref(this.database, `${ROOT}/${this.roomCode}/meta`), {
                status: "ended",
                winnerTeamId: Number(teamId),
                endedAt: this.api.serverTimestamp(),
                updatedAt: this.api.serverTimestamp()
            });
            localStorage.removeItem("frontieres.multiplayerRoom");
        }

        sendCommand(command) {
            const commandRef = this.api.push(this.api.ref(this.database, `${ROOT}/${this.roomCode}/commands`));
            this.api.set(commandRef, {
                ...command,
                uid: this.uid,
                clientCommandId: commandRef.key,
                createdAt: this.api.serverTimestamp()
            }).catch(() => {});
            return { ok: true, pending: true };
        }

        watchCommands(handler) {
            const commandsRef = this.api.ref(this.database, `${ROOT}/${this.roomCode}/commands`);
            const unsubscribe = this.api.onChildAdded(commandsRef, async (snapshot) => {
                const command = snapshot.val();
                await handler(command);
                await this.api.remove(snapshot.ref);
            });
            this.unsubscribers.push(unsubscribe);
        }

        publishSnapshot(snapshot) {
            return this.api.set(this.api.ref(this.database, `${ROOT}/${this.roomCode}/snapshot`), snapshot);
        }

        watchSnapshot(listener) {
            const snapshotRef = this.api.ref(this.database, `${ROOT}/${this.roomCode}/snapshot`);
            const unsubscribe = this.api.onValue(snapshotRef, (value) => {
                if (value.exists()) listener(value.val());
            });
            this.unsubscribers.push(unsubscribe);
        }

        close() {
            this.unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
        }
    }

    C.FirebaseMultiplayer = FirebaseMultiplayer;
})(window.Conquest = window.Conquest || {});
