type SoundKind = 'move' | 'capture' | 'check' | 'castle' | 'end' | 'illegal';

class ChessSoundEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  private getContext(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  play(kind: SoundKind) {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    if (kind === 'move' || kind === 'castle') {
      this.tone(ctx, now, 185, 95, 0.055, 0.13, 'triangle');
      if (kind === 'castle') {
        this.tone(ctx, now + 0.075, 210, 105, 0.05, 0.11, 'triangle');
      }
    } else if (kind === 'capture') {
      this.tone(ctx, now, 310, 110, 0.065, 0.18, 'sine');
      this.tone(ctx, now, 520, 180, 0.035, 0.08, 'triangle');
    } else if (kind === 'check') {
      this.tone(ctx, now, 540, 440, 0.11, 0.12, 'sine');
    } else if (kind === 'end') {
      this.tone(ctx, now, 392, 392, 0.09, 0.1, 'sine');
      this.tone(ctx, now + 0.09, 523.25, 523.25, 0.16, 0.12, 'sine');
    } else if (kind === 'illegal') {
      this.tone(ctx, now, 160, 120, 0.09, 0.09, 'sawtooth');
    }
  }

  private tone(
    ctx: AudioContext,
    startTime: number,
    freqStart: number,
    freqEnd: number,
    duration: number,
    peakGain: number,
    type: OscillatorType
  ) {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, startTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), startTime + duration);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.01);
    } catch {
      // Ignore audio errors when context is blocked
    }
  }
}

export const soundEngine = new ChessSoundEngine();
