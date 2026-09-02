import { fieldToString, normalizeKey } from "@/lib/field-value";
import { maskAppId, readStoredSettings } from "@/lib/settings";
import type { AssetMeta } from "@/lib/types";

type LarkRecord = {
  record_id?: string;
  id?: string;
  fields?: Record<string, unknown>;
};

type TokenCache = {
  token: string;
  expiresAt: number;
};

const NAME_CANDIDATES = [
  "asset name",
  "asset",
  "name",
  "item name",
  "equipment name",
  "资产名称",
  "資產名稱",
  "资产",
];

const SERIAL_CANDIDATES = [
  "serial number",
  "serial no",
  "serial",
  "sn",
  "s/n",
  "barcode",
  "序列号",
  "序列號",
  "串号",
];

const EXTRA_CANDIDATES = [
  "asset id",
  "location",
  "current status",
  "brand",
  "model",
  "asset category",
  "category",
  "current assignee",
  "asset tag",
  "tag",
  "owner",
  "department",
  "status",
  "type",
];

type RuntimeConfig = {
  appId: string;
  appSecret: string;
  apiBase: string;
  appToken: string;
  tableId: string;
  baseUrl: string;
  tableName: string;
  assetNameField: string;
  serialNumberField: string;
  source: "file" | "env";
};

let tokenCache: TokenCache | null = null;
let contextCache: { at: number; value: Awaited<ReturnType<typeof buildLarkContext>> } | null = null;
let runtimeConfig: RuntimeConfig | null | undefined;
const CONTEXT_TTL_MS = 5 * 60_000;

export function resetLarkRuntime() {
  tokenCache = null;
  contextCache = null;
  runtimeConfig = undefined;
}

export async function isLarkConfigured(): Promise<boolean> {
  return Boolean(await loadRuntimeConfig());
}

async function loadRuntimeConfig(): Promise<RuntimeConfig | null> {
  if (runtimeConfig !== undefined) return runtimeConfig;

  const stored = await readStoredSettings();
  if (stored) {
    runtimeConfig = {
      appId: stored.appId,
      appSecret: stored.appSecret,
      apiBase: stored.apiBase,
      appToken: stored.appToken,
      tableId: stored.tableId,
      baseUrl: stored.baseUrl,
      tableName: stored.tableName || "Asset Register",
      assetNameField: stored.assetNameField || "",
      serialNumberField: stored.serialNumberField || "",
      source: "file",
    };
    return runtimeConfig;
  }

  const appId = process.env.LARK_APP_ID?.trim() ?? "";
  const appSecret = process.env.LARK_APP_SECRET?.trim() ?? "";
  const baseUrl = process.env.LARK_BASE_URL?.trim() ?? "";
  const fromUrl = baseUrl ? tokenFromBaseUrl(baseUrl) : {};
  const appToken = process.env.LARK_APP_TOKEN?.trim() || fromUrl.appToken || "";
  if (!appId || !appSecret || !appToken) {
    runtimeConfig = null;
    return null;
  }

  runtimeConfig = {
    appId,
    appSecret,
    apiBase:
      process.env.LARK_API_BASE?.trim().replace(/\/$/, "") ||
      "https://open.larksuite.com",
    appToken,
    tableId: process.env.LARK_TABLE_ID?.trim() || fromUrl.tableId || "",
    baseUrl,
    tableName: process.env.LARK_TABLE_NAME?.trim() || "Asset Register",
    assetNameField: process.env.LARK_ASSET_NAME_FIELD?.trim() || "",
    serialNumberField: process.env.LARK_SERIAL_NUMBER_FIELD?.trim() || "",
    source: "env",
  };
  return runtimeConfig;
}

function apiBase(): string {
  return (
    runtimeConfig?.apiBase ||
    process.env.LARK_API_BASE?.trim().replace(/\/$/, "") ||
    "https://open.larksuite.com"
  );
}

async function larkFetch<T>(
  path: string,
  init: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${apiBase()}${path}`, {
    ...rest,
    headers,
    cache: "no-store",
    signal: rest.signal ?? AbortSignal.timeout(20_000),
  });

  let body: {
    code?: number;
    msg?: string;
    error?: { message?: string };
  } & T;

  try {
    body = (await response.json()) as typeof body;
  } catch {
    throw new Error(
      `Lark API returned a non-JSON response (${response.status}). Check LARK_API_BASE.`
    );
  }

  if (!response.ok || (typeof body.code === "number" && body.code !== 0)) {
    const detail = body.msg || body.error?.message || response.statusText;
    throw new Error(`Lark API error${body.code != null ? ` ${body.code}` : ""}: ${detail}`);
  }

  return body;
}

async function getTenantToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }

  const config = await loadRuntimeConfig();
  if (!config) {
    throw new Error("Lark is not configured. Open Setup and add your app credentials and Base link.");
  }

  const body = await larkFetch<{
    tenant_access_token?: string;
    expire?: number;
  }>("/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    body: JSON.stringify({
      app_id: config.appId,
      app_secret: config.appSecret,
    }),
  });

  if (!body.tenant_access_token) {
    throw new Error("Lark did not return a tenant_access_token. Check App ID and App Secret.");
  }

  tokenCache = {
    token: body.tenant_access_token,
    expiresAt: Date.now() + Math.max((body.expire ?? 7200) - 300, 60) * 1000,
  };
  return tokenCache.token;
}

function tokenFromBaseUrl(url: string): { appToken?: string; tableId?: string } {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const baseIndex = parts.findIndex((part) => part === "base" || part === "wiki");
    const appToken = baseIndex >= 0 ? parts[baseIndex + 1] : undefined;
    return {
      appToken,
      tableId: parsed.searchParams.get("table") ?? undefined,
    };
  } catch {
    return {};
  }
}

async function resolveAppToken(token: string, rawToken: string): Promise<string> {
  if (!rawToken.startsWith("wik")) return rawToken;

  const body = await larkFetch<{
    data?: { node?: { obj_type?: string; obj_token?: string } };
  }>(`/open-apis/wiki/v2/spaces/get_node?token=${encodeURIComponent(rawToken)}`, {
    method: "GET",
    token,
  });

  const node = body.data?.node;
  if (node?.obj_type === "bitable" && node.obj_token) {
    return node.obj_token;
  }

  throw new Error(
    "That wiki token did not resolve to a Base. Open the Base itself and copy the token after /base/."
  );
}

async function listTables(token: string, appToken: string) {
  const body = await larkFetch<{
    data?: { items?: Array<{ table_id?: string; name?: string }> };
  }>(`/open-apis/bitable/v1/apps/${appToken}/tables?page_size=100`, {
    method: "GET",
    token,
  });
  return body.data?.items ?? [];
}

async function listFields(token: string, appToken: string, tableId: string) {
  const body = await larkFetch<{
    data?: { items?: Array<{ field_name?: string; type?: number }> };
  }>(`/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields?page_size=100`, {
    method: "GET",
    token,
  });
  return (body.data?.items ?? [])
    .map((item) => item.field_name?.trim())
    .filter((name): name is string => Boolean(name));
}

function pickField(fields: string[], configured: string, candidates: string[]): string {
  if (configured) {
    const exact = fields.find((field) => field === configured);
    if (exact) return exact;
    const fuzzy = fields.find(
      (field) => normalizeKey(field) === normalizeKey(configured)
    );
    if (fuzzy) return fuzzy;
    throw new Error(
      `Field "${configured}" was not found in the table. Available fields: ${fields.join(", ")}`
    );
  }

  const ranked = candidates
    .map((candidate) =>
      fields.find((field) => normalizeKey(field) === candidate)
    )
    .filter((field): field is string => Boolean(field));
  if (ranked[0]) return ranked[0];

  throw new Error(
    `Could not detect the field. Set it explicitly. Available fields: ${fields.join(", ")}`
  );
}

function pickExtraFields(fields: string[], used: string[]): string[] {
  const usedKeys = new Set(used.map(normalizeKey));
  const extras: string[] = [];
  for (const candidate of EXTRA_CANDIDATES) {
    const match = fields.find((field) => {
      const key = normalizeKey(field);
      if (usedKeys.has(key) || extras.includes(field)) return false;
      return key === candidate || key.includes(candidate);
    });
    if (match) extras.push(match);
    if (extras.length >= 4) break;
  }
  return extras;
}

async function searchAllRecords(
  token: string,
  appToken: string,
  tableId: string,
  fieldNames: string[]
): Promise<LarkRecord[]> {
  const records: LarkRecord[] = [];
  let pageToken = "";

  do {
    const query = new URLSearchParams({ page_size: "500" });
    if (pageToken) query.set("page_token", pageToken);
    const body = await larkFetch<{
      data?: {
        items?: LarkRecord[];
        has_more?: boolean;
        page_token?: string;
      };
    }>(
      `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/search?${query}`,
      {
        method: "POST",
        token,
        body: JSON.stringify({ field_names: fieldNames }),
      }
    );
    records.push(...(body.data?.items ?? []));
    pageToken = body.data?.has_more ? (body.data.page_token ?? "") : "";
  } while (pageToken);

  return records;
}

export async function resolveLarkContext() {
  if (contextCache && Date.now() - contextCache.at < CONTEXT_TTL_MS) {
    return { ...contextCache.value, token: await getTenantToken() };
  }
  const value = await buildLarkContext();
  contextCache = { at: Date.now(), value };
  return { ...value, token: await getTenantToken() };
}

async function buildLarkContext() {
  const config = await loadRuntimeConfig();
  if (!config) {
    throw new Error("Lark is not configured. Open Setup and add your app credentials and Base link.");
  }
  const token = await getTenantToken();
  const appToken = await resolveAppToken(token, config.appToken);
  const tables = await listTables(token, appToken);
  if (tables.length === 0) {
    throw new Error("No tables were found in this Base. Check that the app is a collaborator.");
  }

  const configuredTableName = config.tableName || "Asset Register";
  const table =
    tables.find((item) => item.table_id === config.tableId) ??
    tables.find(
      (item) => normalizeKey(item.name ?? "") === normalizeKey(configuredTableName)
    ) ??
    tables.find((item) =>
      normalizeKey(item.name ?? "").includes("asset register")
    ) ??
    tables.find((item) =>
      normalizeKey(item.name ?? "").includes("asset")
    );

  if (!table?.table_id) {
    throw new Error(
      `Could not find table "${configuredTableName}". Tables in this Base: ${tables
        .map((item) => item.name)
        .join(", ")}`
    );
  }

  const fields = await listFields(token, appToken, table.table_id);
  const nameField = pickField(fields, config.assetNameField, NAME_CANDIDATES);
  const serialField = pickField(fields, config.serialNumberField, SERIAL_CANDIDATES);
  const extraFields = pickExtraFields(fields, [nameField, serialField]);

  return {
    appToken,
    tableId: table.table_id,
    tableName: table.name || configuredTableName,
    nameField,
    serialField,
    extraFields,
  };
}

export async function verifyLarkSettings(input: {
  appId: string;
  appSecret: string;
  apiBase: string;
  appToken: string;
  tableId: string;
  tableName: string;
}): Promise<{ tableId: string; tableName: string; nameField: string; serialField: string }> {
  resetLarkRuntime();
  runtimeConfig = {
    appId: input.appId,
    appSecret: input.appSecret,
    apiBase: input.apiBase,
    appToken: input.appToken,
    tableId: input.tableId,
    baseUrl: "",
    tableName: input.tableName,
    assetNameField: "",
    serialNumberField: "",
    source: "file",
  };
  try {
    const ctx = await buildLarkContext();
    return {
      tableId: ctx.tableId,
      tableName: ctx.tableName,
      nameField: ctx.nameField,
      serialField: ctx.serialField,
    };
  } finally {
    resetLarkRuntime();
  }
}

export async function publicConnectionInfo() {
  const config = await loadRuntimeConfig();
  if (!config) {
    return { configured: false as const, source: "none" as const };
  }
  return {
    configured: true as const,
    source: config.source,
    appIdMasked: maskAppId(config.appId),
    baseUrl: config.baseUrl,
    tableName: config.tableName,
  };
}

export async function listLarkAssets(): Promise<{
  tableName: string;
  nameField: string;
  serialField: string;
  assets: AssetMeta[];
}> {
  const ctx = await resolveLarkContext();
  const records = await searchAllRecords(ctx.token, ctx.appToken, ctx.tableId, [
    ctx.nameField,
    ctx.serialField,
    ...ctx.extraFields,
  ]);

  const assets = records
    .map((record) => {
      const recordId = record.record_id || record.id || "";
      const fields = record.fields ?? {};
      const extra: Record<string, string> = {};
      for (const field of ctx.extraFields) {
        const value = fieldToString(fields[field]);
        if (value) extra[field] = value;
      }
      return {
        recordId,
        name: fieldToString(fields[ctx.nameField]) || "(unnamed asset)",
        serialNumber: fieldToString(fields[ctx.serialField]),
        extra,
      };
    })
    .filter((asset) => asset.recordId)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    tableName: ctx.tableName,
    nameField: ctx.nameField,
    serialField: ctx.serialField,
    assets,
  };
}

export async function findAssetWithSerial(serialNumber: string, exceptRecordId: string) {
  const ctx = await resolveLarkContext();
  const body = await larkFetch<{
    data?: { items?: LarkRecord[] };
  }>(
    `/open-apis/bitable/v1/apps/${ctx.appToken}/tables/${ctx.tableId}/records/search?page_size=20`,
    {
      method: "POST",
      token: ctx.token,
      body: JSON.stringify({
        field_names: [ctx.nameField, ctx.serialField],
        filter: {
          conjunction: "and",
          conditions: [
            {
              field_name: ctx.serialField,
              operator: "is",
              value: [serialNumber],
            },
          ],
        },
      }),
    }
  );

  const match = (body.data?.items ?? []).find((record) => {
    const id = record.record_id || record.id || "";
    return id && id !== exceptRecordId;
  });
  if (!match) return null;
  const fields = match.fields ?? {};
  return {
    recordId: match.record_id || match.id || "",
    name: fieldToString(fields[ctx.nameField]) || "(unnamed asset)",
  };
}

export async function updateLarkSerial(recordId: string, serialNumber: string) {
  const ctx = await resolveLarkContext();
  const current = await larkFetch<{
    data?: { record?: LarkRecord };
  }>(
    `/open-apis/bitable/v1/apps/${ctx.appToken}/tables/${ctx.tableId}/records/${recordId}`,
    { method: "GET", token: ctx.token }
  );

  const fields = current.data?.record?.fields ?? {};
  const previousSerial = fieldToString(fields[ctx.serialField]);
  const name = fieldToString(fields[ctx.nameField]) || "(unnamed asset)";

  await larkFetch(
    `/open-apis/bitable/v1/apps/${ctx.appToken}/tables/${ctx.tableId}/records/${recordId}`,
    {
      method: "PUT",
      token: ctx.token,
      body: JSON.stringify({
        fields: {
          [ctx.serialField]: serialNumber,
        },
      }),
    }
  );

  return {
    recordId,
    name,
    previousSerial,
    serialNumber,
    tableName: ctx.tableName,
    serialField: ctx.serialField,
  };
}

export async function getLarkSession() {
  const config = await loadRuntimeConfig();
  if (!config) return null;
  const token = await getTenantToken();
  const appToken = await resolveAppToken(token, config.appToken);
  const tables = await listTables(token, appToken);
  return { config, token, appToken, tables };
}

export async function searchTableRecords(
  token: string,
  appToken: string,
  tableId: string,
  options: { fieldNames?: string[]; filter?: unknown } = {}
) {
  const records: LarkRecord[] = [];
  let pageToken = "";

  do {
    const query = new URLSearchParams({ page_size: "500" });
    if (pageToken) query.set("page_token", pageToken);
    const body = await larkFetch<{
      data?: {
        items?: LarkRecord[];
        has_more?: boolean;
        page_token?: string;
      };
    }>(
      `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/search?${query}`,
      {
        method: "POST",
        token,
        body: JSON.stringify({
          ...(options.fieldNames?.length ? { field_names: options.fieldNames } : {}),
          ...(options.filter ? { filter: options.filter } : {}),
        }),
      }
    );
    records.push(...(body.data?.items ?? []));
    pageToken = body.data?.has_more ? (body.data.page_token ?? "") : "";
  } while (pageToken);

  return records;
}

export async function getTableRecord(
  token: string,
  appToken: string,
  tableId: string,
  recordId: string
) {
  const body = await larkFetch<{ data?: { record?: LarkRecord } }>(
    `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
    { method: "GET", token }
  );
  return body.data?.record ?? null;
}

export async function updateTableRecord(
  token: string,
  appToken: string,
  tableId: string,
  recordId: string,
  fields: Record<string, unknown>
) {
  await larkFetch(`/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`, {
    method: "PUT",
    token,
    body: JSON.stringify({ fields }),
  });
}

export async function listTableNames(token: string, appToken: string) {
  return listTables(token, appToken);
}

export async function listTableFieldNames(token: string, appToken: string, tableId: string) {
  return listFields(token, appToken, tableId);
}

export { pickField };
