export class DeduplicationCache {
  constructor(maxSize = 5000) {
    this.maxSize = maxSize;
    this.entries = new Map();
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return null;
    }
    return entry.message;
  }

  set(key, message, ttlMs = 10 * 60 * 1000) {
    if (this.entries.size >= this.maxSize) this.entries.delete(this.entries.keys().next().value);
    this.entries.set(key, { message, expiresAt: Date.now() + ttlMs });
  }
}
