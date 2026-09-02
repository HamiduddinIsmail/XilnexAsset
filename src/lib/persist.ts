import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");

function useNetlifyBlobs() {
  return Boolean(process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT);
}

async function blobsStore() {
  const { getStore } = await import("@netlify/blobs");
  return getStore("xilnex-asset-app");
}

export async function readJsonFile<T>(key: string): Promise<T | null> {
  if (useNetlifyBlobs()) {
    try {
      const store = await blobsStore();
      const value = await store.get(key, { type: "json" });
      return (value as T | null) ?? null;
    } catch {
      return readLocalJson<T>(key);
    }
  }
  return readLocalJson<T>(key);
}

export async function writeJsonFile<T>(key: string, value: T) {
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
