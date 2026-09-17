import type { GraphicRecord } from "../resources/binary";

// Bounded, deduplicated loading. Only currently visible rows retain resources.
// In-flight File reads cannot be cancelled, but stale results are released.
export class VisibleGraphics<T> {
  readonly loaded = new Map<number, T>();
  readonly errors = new Map<number, unknown>();
  private wanted = new Map<number, GraphicRecord>();
  private pending = new Set<number>();
  private disposed = false;
  private waiters: Array<() => void> = [];

  constructor(
    private load: (record: GraphicRecord) => Promise<T>,
    private release: (value: T) => void,
    private changed: () => void,
    private concurrency = 4,
  ) {}

  set(records: GraphicRecord[]) {
    if (this.disposed) return;
    this.wanted = new Map(records.map((record) => [record.row, record]));
    for (const [row, value] of this.loaded) {
      if (this.wanted.has(row)) continue;
      this.loaded.delete(row);
      this.release(value);
    }
    this.pump();
  }

  private pump() {
    if (this.disposed) return;
    for (const [row, record] of this.wanted) {
      if (this.pending.size >= this.concurrency) break;
      if (this.loaded.has(row) || this.pending.has(row) || this.errors.has(row))
        continue;
      this.pending.add(row);
      void this.load(record)
        .then((value) => {
          if (this.disposed || !this.wanted.has(row)) this.release(value);
          else this.loaded.set(row, value);
        })
        .catch((error: unknown) => {
          if (!this.disposed) this.errors.set(row, error);
        })
        .finally(() => {
          this.pending.delete(row);
          if (this.disposed) return;
          this.changed();
          this.pump();
        });
    }
    if (!this.pending.size) this.resolveWaiters();
  }

  async ready() {
    if (this.pending.size)
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    for (const row of this.wanted.keys()) {
      if (this.errors.has(row)) throw this.errors.get(row);
    }
  }

  private resolveWaiters() {
    for (const resolve of this.waiters.splice(0)) resolve();
  }

  destroy() {
    this.disposed = true;
    for (const value of this.loaded.values()) this.release(value);
    this.loaded.clear();
    this.wanted.clear();
    this.resolveWaiters();
  }
}
