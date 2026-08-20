(function (C) {
    "use strict";

    class AudioManager {
        constructor(options = {}) {
            this.context = null;
            this.masterVolume = C.Geometry.clamp(Number(options.masterVolume ?? 0.18), 0, 1);
            this.backgroundMusicVolume = C.Geometry.clamp(Number(options.backgroundMusicVolume ?? 0.22), 0, 1);
            this.musicSource = options.musicSource || "Musique/Music1.mp3";
            this.music = null;
            this.musicRetryScheduled = false;
            this.musicRestoreTimer = null;
            this.interactionTarget = options.interactionTarget || document;
            this.mediaFactory = options.mediaFactory || ((source) => new Audio(source));
            this.contextFactory = options.contextFactory || (() => {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                return AudioContextClass ? new AudioContextClass() : null;
            });
        }

        getContext() {
            if (this.context) return this.context;
            try {
                this.context = this.contextFactory();
            } catch (_error) {
                this.context = null;
            }
            return this.context;
        }

        unlock() {
            const context = this.getContext();
            if (!context) return Promise.resolve(false);
            if (context.state === "suspended" && typeof context.resume === "function") {
                return context.resume().then(() => true).catch(() => false);
            }
            return Promise.resolve(context.state !== "closed");
        }

        startBackgroundMusic() {
            if (!this.music) {
                try {
                    this.music = this.mediaFactory(this.musicSource);
                } catch (_error) {
                    this.music = null;
                }
            }
            if (!this.music) return false;

            this.music.loop = true;
            this.music.preload = "auto";
            this.music.volume = this.backgroundMusicVolume;
            try {
                const playback = this.music.play();
                if (playback && typeof playback.then === "function") {
                    playback.then(() => this.clearMusicRetry()).catch(() => this.scheduleMusicRetry());
                }
            } catch (_error) {
                this.scheduleMusicRetry();
            }
            return true;
        }

        scheduleMusicRetry() {
            if (this.musicRetryScheduled || !this.interactionTarget?.addEventListener) return;
            this.musicRetryScheduled = true;
            this.musicRetryHandler = () => {
                this.clearMusicRetry();
                this.startBackgroundMusic();
            };
            this.interactionTarget.addEventListener("pointerdown", this.musicRetryHandler, { once: true });
            this.interactionTarget.addEventListener("keydown", this.musicRetryHandler, { once: true });
        }

        clearMusicRetry() {
            if (!this.musicRetryScheduled) return;
            this.musicRetryScheduled = false;
            if (this.interactionTarget?.removeEventListener && this.musicRetryHandler) {
                this.interactionTarget.removeEventListener("pointerdown", this.musicRetryHandler);
                this.interactionTarget.removeEventListener("keydown", this.musicRetryHandler);
            }
            this.musicRetryHandler = null;
        }

        duckBackgroundMusic(durationMs = 1300) {
            if (!this.music) return;
            clearTimeout(this.musicRestoreTimer);
            this.music.volume = this.backgroundMusicVolume * 0.42;
            this.musicRestoreTimer = setTimeout(() => {
                if (this.music) this.music.volume = this.backgroundMusicVolume;
            }, durationMs);
        }

        playResearchComplete() {
            const context = this.getContext();
            if (!context || context.state === "closed") return false;
            this.duckBackgroundMusic();
            const play = () => {
                if (context.state === "suspended") return;
                const startAt = context.currentTime + 0.025;
                [
                    { frequency: 523.25, offset: 0, duration: 0.58, volume: 0.58 },
                    { frequency: 659.25, offset: 0.10, duration: 0.62, volume: 0.52 },
                    { frequency: 783.99, offset: 0.20, duration: 0.68, volume: 0.48 },
                    { frequency: 1046.50, offset: 0.32, duration: 0.78, volume: 0.38 }
                ].forEach((note, index) => this.playChimeNote(
                    context,
                    note.frequency,
                    startAt + note.offset,
                    note.duration,
                    note.volume,
                    index === 3 ? "sine" : "triangle"
                ));
            };

            if (context.state === "suspended" && typeof context.resume === "function") {
                context.resume().then(play).catch(() => {});
            } else {
                play();
            }
            return true;
        }

        playTerritoryLost() {
            const context = this.getContext();
            if (!context || context.state === "closed") return false;
            this.duckBackgroundMusic(1600);
            const play = () => {
                if (context.state === "suspended") return;
                const startAt = context.currentTime + 0.025;
                [
                    { frequency: 392.00, offset: 0, duration: 0.42, volume: 0.42 },
                    { frequency: 293.66, offset: 0.17, duration: 0.56, volume: 0.48 },
                    { frequency: 196.00, offset: 0.38, duration: 0.82, volume: 0.56 }
                ].forEach((note) => this.playChimeNote(
                    context,
                    note.frequency,
                    startAt + note.offset,
                    note.duration,
                    note.volume,
                    "sawtooth"
                ));
            };

            if (context.state === "suspended" && typeof context.resume === "function") {
                context.resume().then(play).catch(() => {});
            } else {
                play();
            }
            return true;
        }

        playChimeNote(context, frequency, startAt, duration, volume, type) {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = type;
            oscillator.frequency.setValueAtTime(frequency, startAt);
            gain.gain.setValueAtTime(0.0001, startAt);
            gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, this.masterVolume * volume), startAt + 0.025);
            gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start(startAt);
            oscillator.stop(startAt + duration + 0.04);
        }
    }

    C.AudioManager = AudioManager;
})(window.Conquest = window.Conquest || {});
