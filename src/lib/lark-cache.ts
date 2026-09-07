import { invalidateJsonKey, readJsonFile, writeJsonFile } from "@/lib/persist";

type Envelope<T> = { at: number; value: T };

export const PEOPLE_CACHE_KEY = "lark-people";
export const HANDOVER_DESK_CACHE_KEY = "handover-desk";

export const PEOPLE_TTL_MS = 10 * 60_000;
export const HANDOVER_DESK_TTL_MS = 45_000;

export async function readTtlJson<T>(key: string, ttlMs: number): Promise<T | null> {
  const stored = await readJsonFile<Envelope<T>>(key);
  if (!stored || typeof stored.at !== "number" || stored.at <= 0) return null;
  if (Date.now() - stored.at > ttlMs) return null;
  return stored.value ?? null;
}

export async function writeTtlJson<T>(key: string, value: T) {
  await writeJsonFile(key, { at: Date.now(), value } satisfies Envelope<T>);
}

export async function clearTtlJson(key: string) {
  await invalidateJsonKey(key);
}

export async function clearLarkLiveCaches() {
  await Promise.all([clearTtlJson(PEOPLE_CACHE_KEY), clearTtlJson(HANDOVER_DESK_CACHE_KEY)]);
}
