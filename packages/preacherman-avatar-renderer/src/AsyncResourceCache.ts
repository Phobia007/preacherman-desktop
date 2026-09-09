/** LRU of completed values. In-flight work is coalesced but never pins an old value. */
export class AsyncResourceCache<T> {
  private readonly entries = new Map<string, { value: T; bytes: number }>();
  private readonly pending = new Map<string, Promise<T>>();
  private bytes = 0;
  private tail: Promise<void> = Promise.resolve();
  constructor(
    private readonly maxEntries: number,
    private readonly maxBytes: number,
    private readonly measure: (value: T) => number,
  ) {}

  get snapshot() {
    return { entries: this.entries.size, bytes: this.bytes, pending: this.pending.size,
      maxEntries: this.maxEntries, maxBytes: this.maxBytes };
  }

  get(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return Promise.resolve(cached.value);
    }
    const existing = this.pending.get(key);
    if (existing) return existing;
    const promise = this.tail.then(load).then(value => {
      const bytes = this.measure(value);
      // An oversized resource can be used by its caller without defeating the budget.
      if (bytes <= this.maxBytes && this.maxEntries > 0) {
        while (this.entries.size >= this.maxEntries || this.bytes + bytes > this.maxBytes) {
          const oldest = this.entries.keys().next().value!;
          this.bytes -= this.entries.get(oldest)!.bytes;
          this.entries.delete(oldest);
        }
        this.entries.set(key, { value, bytes });
        this.bytes += bytes;
      }
      return value;
    }).finally(() => this.pending.delete(key));
    this.tail = promise.then(() => undefined, () => undefined);
    this.pending.set(key, promise);
    return promise;
  }
}
