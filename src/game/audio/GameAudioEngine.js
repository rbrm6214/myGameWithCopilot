class GameAudioEngine
{
    static instance = null;

    static get ()
    {
        if (!GameAudioEngine.instance)
        {
            GameAudioEngine.instance = new GameAudioEngine();
        }

        return GameAudioEngine.instance;
    }

    constructor ()
    {
        this.ctx = null;
        this.masterGain = null;
        this.sfxGain = null;
        this.musicGain = null;
        this.musicTimer = null;
        this.musicStep = 0;
    }

    ensureContext ()
    {
        if (this.ctx)
        {
            return this.ctx;
        }

        if (typeof window === 'undefined')
        {
            return null;
        }

        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx)
        {
            return null;
        }

        this.ctx = new Ctx();

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.34;
        this.masterGain.connect(this.ctx.destination);

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 1;
        this.sfxGain.connect(this.masterGain);

        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.5;
        this.musicGain.connect(this.masterGain);

        return this.ctx;
    }

    ensureStarted ()
    {
        const ctx = this.ensureContext();
        if (!ctx)
        {
            return;
        }

        if (ctx.state === 'suspended')
        {
            ctx.resume().catch(() => undefined);
        }
    }

    startMusic ()
    {
        this.ensureStarted();

        if (!this.ctx || this.musicTimer)
        {
            return;
        }

        this.musicStep = 0;
        this.musicTimer = window.setInterval(() => {
            this.playMusicStep();
            this.musicStep += 1;
        }, 360);
    }

    stopMusic ()
    {
        if (this.musicTimer)
        {
            window.clearInterval(this.musicTimer);
            this.musicTimer = null;
        }
    }

    playEat ()
    {
        this.playSweep('square', 880, 1160, 0.08, 0.11);
        this.playSweep('triangle', 640, 780, 0.11, 0.07);
    }

    playCut ()
    {
        this.playSweep('sawtooth', 540, 210, 0.13, 0.2);
        this.playSweep('triangle', 300, 170, 0.09, 0.14);
    }

    playDeath ()
    {
        this.playSweep('sawtooth', 260, 54, 0.32, 0.26);
        this.playSweep('triangle', 140, 42, 0.36, 0.18);
    }

    playMatchEnd ()
    {
        // Triad-style positive stinger for the end screen.
        this.playTone('triangle', 261.63, 0.34, 0.14, this.sfxGain, 0.01);
        this.playTone('triangle', 329.63, 0.38, 0.13, this.sfxGain, 0.02);
        this.playTone('triangle', 392.0, 0.46, 0.12, this.sfxGain, 0.03);
    }

    playMusicStep ()
    {
        if (!this.ctx || this.ctx.state !== 'running')
        {
            return;
        }

        const leadPattern = [261.63, 293.66, 329.63, 392.0, 329.63, 293.66, 246.94, 196.0];
        const bassPattern = [130.81, 146.83, 164.81, 98.0];

        const lead = leadPattern[this.musicStep % leadPattern.length];
        const bass = bassPattern[this.musicStep % bassPattern.length];

        this.playTone('triangle', lead, 0.2, 0.08, this.musicGain, 0.012);

        if (this.musicStep % 2 === 0)
        {
            this.playTone('sine', bass, 0.3, 0.12, this.musicGain, 0.02);
        }
    }

    playSweep (type, from, to, durationSec, volume)
    {
        if (!this.ctx || this.ctx.state !== 'running')
        {
            return;
        }

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(from, now);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + durationSec);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(now);
        osc.stop(now + durationSec + 0.02);
    }

    playTone (type, frequency, durationSec, volume, bus, attackSec = 0.01)
    {
        if (!this.ctx || this.ctx.state !== 'running')
        {
            return;
        }

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(frequency, now);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(volume, now + attackSec);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

        osc.connect(gain);
        gain.connect(bus || this.sfxGain);

        osc.start(now);
        osc.stop(now + durationSec + 0.02);
    }
}

export { GameAudioEngine };
