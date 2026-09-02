import { readJsonFile, writeJsonFile } from "@/lib/persist";

export type StoredLarkSettings = {
  appId: string;
  appSecret: string;
  baseUrl: string;
  apiBase: string;
  appToken: string;
  tableId: string;
  tableName: string;
  assetNameField: string;
  serialNumberField: string;
  updatedAt: string;
};

export type ParsedBaseLink = {
  apiBase: string;
  appToken: string;
  tableId: string;
};

export function parseBaseLink(raw: string): ParsedBaseLink {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Paste a full Lark Base URL, starting with https://");
  }
  const host = url.hostname.toLowerCase();
  const apiBase = host.endsWith("feishu.cn")
    ? "https://open.feishu.cn"
    : "https://open.larksuite.com";
  const parts = url.pathname.split("/").filter(Boolean);
  const marker = parts.findIndex((part) => part === "base" || part === "wiki");
  const appToken = marker >= 0 ? parts[marker + 1] ?? "" : "";
  const tableId = url.searchParams.get("table") ?? "";
  if (!appToken) {
    throw new Error(
      "That does not look like a Lark Base link. Paste the URL from the browser while the Asset Register is open (it should contain /base/…)."
    );
  }
  return { apiBase, appToken, tableId };
}

export async function readStoredSettings(): Promise<StoredLarkSettings | null> {
  const parsed = await readJsonFile<StoredLarkSettings>("lark-settings");
  if (!parsed?.appId || !parsed.appSecret || !parsed.appToken) return null;
  return parsed;
}

export async function writeStoredSettings(settings: StoredLarkSettings) {
  await writeJsonFile("lark-settings", settings);
}

export function maskAppId(appId: string): string {
  const value = appId.trim();
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
