(function (C) {
    "use strict";

    class AudioManager {
        constructor(options = {}) {
            this.context = null;
            this.masterVolume = C.Geometry.clamp(Number(options.masterVolume ?? 0.18), 0, 1);
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

        playResearchComplete() {
            const context = this.getContext();
            if (!context || context.state === "closed") return false;
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
