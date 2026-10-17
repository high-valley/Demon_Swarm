// 仮の効果音。短い波形をコードで生成する（音源ファイル不要）。
// iPhone のブラウザは「画面に触れた後」でないと音を出せないので、最初の操作で unlock() する。
const SOUNDS: Record<string, [number, number, number, "sine" | "square" | "saw" | "tri"]> = {
  summon: [520, 880, 0.08, "tri"], hit: [180, 90, 0.06, "square"], king: [140, 60, 0.18, "saw"], level: [440, 1320, 0.3, "tri"],
  order: [660, 660, 0.05, "sine"], fail: [200, 160, 0.1, "square"], boss: [90, 50, 0.6, "saw"], dash: [300, 700, 0.08, "sine"],
};

export class Sfx {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private lastPlay = new Map<string, number>();
  volume = 0.6;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.gain = this.ctx.createGain();
      this.gain.connect(this.ctx.destination);
      this.setVolume(this.volume);
      for (const name of Object.keys(SOUNDS)) this.buffers.set(name, this.make(SOUNDS[name]));
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.gain) this.gain.gain.value = v * 0.35;
  }

  play(name: string): void {
    const ctx = this.ctx, buf = this.buffers.get(name);
    if (!ctx || !buf || !this.gain || this.volume <= 0.001) return;
    const now = ctx.currentTime;
    if (now - (this.lastPlay.get(name) ?? -1) < 0.03) return;   // 同じ音の連打を間引く
    this.lastPlay.set(name, now);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain);
    src.start();
  }

  private make([f0, f1, dur, wave]: [number, number, number, string]): AudioBuffer {
    const ctx = this.ctx!;
    const rate = ctx.sampleRate, n = Math.floor(rate * dur);
    const buf = ctx.createBuffer(1, n, rate);
    const d = buf.getChannelData(0);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const k = i / n;
      phase = (phase + (f0 * Math.pow(f1 / f0, k)) / rate) % 1;
      let v: number;
      if (wave === "sine") v = Math.sin(phase * Math.PI * 2);
      else if (wave === "square") v = phase < 0.5 ? 1 : -1;
      else if (wave === "saw") v = phase * 2 - 1;
      else v = 1 - Math.abs(phase * 4 - 2);
      d[i] = v * Math.exp(-k * 5) * 0.5;
    }
    return buf;
  }
}
