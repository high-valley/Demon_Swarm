// 一様グリッドの空間分割。毎ティック作り直す前提の単純な実装。
// ゴミ（GC）を出さないように、セルの配列は使い回す。

export interface Body {
  x: number;
  y: number;
  r: number;
  dead: boolean;
}

const OFF = 32768;
const key = (cx: number, cy: number): number => (cx + OFF) * 65536 + (cy + OFF);

export class SpatialGrid<T extends Body> {
  readonly cell: number;
  private cells = new Map<number, T[]>();
  private pool: T[][] = [];

  constructor(cell: number) {
    this.cell = cell;
  }

  clear(): void {
    for (const b of this.cells.values()) {
      b.length = 0;
      this.pool.push(b);
    }
    this.cells.clear();
  }

  add(u: T): void {
    const k = key(Math.floor(u.x / this.cell), Math.floor(u.y / this.cell));
    let b = this.cells.get(k);
    if (b === undefined) {
      b = this.pool.pop() ?? [];
      this.cells.set(k, b);
    }
    b.push(u);
  }

  /** 半径 r に掛かるセルの中身（新しい配列。入れ子で呼んでよい） */
  query(x: number, y: number, r: number): T[] {
    const out: T[] = [];
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const b = this.cells.get(key(cx, cy));
        if (b !== undefined) for (let i = 0; i < b.length; i++) out.push(b[i]);
      }
    }
    return out;
  }

  /** 配列を作らずに、範囲内の要素ごとに fn を呼ぶ */
  each(x: number, y: number, r: number, fn: (u: T) => void): void {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const b = this.cells.get(key(cx, cy));
        if (b !== undefined) for (let i = 0; i < b.length; i++) fn(b[i]);
      }
    }
  }

  nearest(x: number, y: number, r: number, filter?: (u: T) => boolean): T | null {
    let best: T | null = null;
    let bd = r * r;
    this.each(x, y, r, (u) => {
      if (u.dead || (filter && !filter(u))) return;
      const dx = u.x - x, dy = u.y - y;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = u;
      }
    });
    return best;
  }

  count(x: number, y: number, r: number): number {
    let n = 0;
    const r2 = r * r;
    this.each(x, y, r, (u) => {
      const dx = u.x - x, dy = u.y - y;
      if (!u.dead && dx * dx + dy * dy < r2) n++;
    });
    return n;
  }
}
