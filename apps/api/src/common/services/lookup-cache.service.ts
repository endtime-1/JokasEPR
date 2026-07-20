import { Injectable } from "@nestjs/common";

type Entry = { value: unknown; expiresAt: number };

@Injectable()
export class LookupCacheService {
  private readonly store = new Map<string, Entry>();
  private readonly DEFAULT_TTL = 45_000; // 45 seconds

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set(key: string, value: unknown, ttlMs = this.DEFAULT_TTL): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  invalidate(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }
}
