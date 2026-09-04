import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const READ_TTL_MS = 60_000;

const memoryCache = new Map<string, { at: number; value: unknown }>();

function useNetlifyBlobs() {
  return Boolean(process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT);
}

async function blobsStore() {
  const { getStore } = await import("@netlify/blobs");
  return getStore("xilnex-asset-app");
}

export async function readJsonFile<T>(key: string): Promise<T | null> {
  const cached = memoryCache.get(key);
  if (cached && Date.now() - cached.at < READ_TTL_MS) {
    return cached.value as T | null;
  }

  const value = useNetlifyBlobs()
    ? await readBlobJson<T>(key)
    : await readLocalJson<T>(key);
  memoryCache.set(key, { at: Date.now(), value });
  return value;
}

async function readBlobJson<T>(key: string): Promise<T | null> {
  try {
    const store = await blobsStore();
    const value = await store.get(key, { type: "json" });
    return (value as T | null) ?? null;
  } catch {
    return readLocalJson<T>(key);
  }
}

export async function writeJsonFile<T>(key: string, value: T) {
  memoryCache.set(key, { at: Date.now(), value });
  if (useNetlifyBlobs()) {
    const store = await blobsStore();
    await store.setJSON(key, value);
    return;
  }
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(path.join(DATA_DIR, `${key}.json`), `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

async function readLocalJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await readFile(path.join(DATA_DIR, `${key}.json`), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
