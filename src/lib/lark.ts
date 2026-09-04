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
  init: RequestInit & { token?: string; retried?: boolean } = {}
): Promise<T> {
  const { token, retried, ...rest } = init;
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
    if (body.code === 99991663 && token && !retried) {
      tokenCache = null;
      const fresh = await getTenantToken();
      return larkFetch<T>(path, { ...rest, token: fresh, retried: true });
    }
    const detail = body.msg || body.error?.message || response.statusText;
    const message =
      body.code === 99991663
        ? "Lark session expired. Tap Refresh, or open Setup and Test and save again."
        : `Lark API error${body.code != null ? ` ${body.code}` : ""}: ${detail}`;
    throw new Error(message);
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

export type LarkFieldMeta = {
  name: string;
  type: number;
  uiType: string;
  options: string[];
};

async function listFieldMeta(token: string, appToken: string, tableId: string): Promise<LarkFieldMeta[]> {
  const body = await larkFetch<{
    data?: {
      items?: Array<{
        field_name?: string;
        type?: number;
        ui_type?: string;
        property?: { options?: Array<{ name?: string }> };
      }>;
    };
  }>(`/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields?page_size=100`, {
    method: "GET",
    token,
  });
  return (body.data?.items ?? [])
    .map((item) => ({
      name: item.field_name?.trim() ?? "",
      type: item.type ?? 0,
      uiType: item.ui_type ?? "",
      options: (item.property?.options ?? [])
        .map((option) => option.name?.trim() ?? "")
        .filter(Boolean),
    }))
    .filter((item) => item.name);
}

async function listFields(token: string, appToken: string, tableId: string) {
  return (await listFieldMeta(token, appToken, tableId)).map((field) => field.name);
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
  options: {
    fieldNames?: string[];
    filter?: unknown;
    sort?: Array<{ field_name: string; desc?: boolean }>;
    pageSize?: number;
    maxRecords?: number;
  } = {}
) {
  const records: LarkRecord[] = [];
  let pageToken = "";
  const pageSize = String(options.pageSize ?? 500);

  do {
    const query = new URLSearchParams({ page_size: pageSize });
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
          ...(options.sort?.length ? { sort: options.sort } : {}),
        }),
      }
    );
    records.push(...(body.data?.items ?? []));
    if (options.maxRecords && records.length >= options.maxRecords) {
      return records.slice(0, options.maxRecords);
    }
    pageToken = body.data?.has_more ? (body.data.page_token ?? "") : "";
  } while (pageToken);

  return records;
}

export async function getTableRecords(
  token: string,
  appToken: string,
  tableId: string,
  recordIds: string[]
) {
  const unique = [...new Set(recordIds.filter(Boolean))];
  const records: LarkRecord[] = [];
  for (let index = 0; index < unique.length; index += 100) {
    const chunk = unique.slice(index, index + 100);
    const body = await larkFetch<{ data?: { records?: LarkRecord[] } }>(
      `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_get`,
      {
        method: "POST",
        token,
        body: JSON.stringify({ record_ids: chunk }),
      }
    );
    records.push(...(body.data?.records ?? []));
  }
  return records;
}

export async function getTableRecord(
  token: string,
  appToken: string,
  tableId: string,
  recordId: string
) {
  const records = await getTableRecords(token, appToken, tableId, [recordId]);
  return records[0] ?? null;
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

export async function createTableRecord(
  token: string,
  appToken: string,
  tableId: string,
  fields: Record<string, unknown>
) {
  const body = await larkFetch<{ data?: { record?: LarkRecord } }>(
    `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
    {
      method: "POST",
      token,
      body: JSON.stringify({ fields }),
    }
  );
  return body.data?.record ?? null;
}

type ContactUser = {
  open_id?: string;
  name?: string;
  en_name?: string;
  email?: string;
  avatar?: { avatar_72?: string };
  avatar_url?: string;
  status?: { is_activated?: boolean; is_resigned?: boolean; is_exited?: boolean };
};

export type LarkPerson = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
};

function personFromContactUser(user: ContactUser): LarkPerson | null {
  if (!user.open_id) return null;
  if (user.status?.is_resigned || user.status?.is_exited) return null;
  return {
    id: user.open_id,
    name: (user.name || user.en_name || user.email || user.open_id).trim(),
    email: (user.email ?? "").trim(),
    avatarUrl: user.avatar?.avatar_72 || user.avatar_url || "",
  };
}

async function paginatedGet<T extends { has_more?: boolean; page_token?: string }>(
  token: string,
  path: string,
  read: (data: T | undefined) => void
) {
  let pageToken = "";
  do {
    const url = new URL(path, "https://placeholder.local");
    if (pageToken) url.searchParams.set("page_token", pageToken);
    const body = await larkFetch<{ data?: T }>(`${url.pathname}${url.search}`, {
      method: "GET",
      token,
    });
    read(body.data);
    pageToken = body.data?.has_more ? (body.data.page_token ?? "") : "";
  } while (pageToken);
}

async function listContactScopeIds(token: string) {
  const userIds: string[] = [];
  const departmentIds: string[] = [];
  try {
    await paginatedGet<{
      has_more?: boolean;
      page_token?: string;
      user_ids?: string[];
      department_ids?: string[];
    }>(token, "/open-apis/contact/v3/scopes?page_size=100", (data) => {
      userIds.push(...(data?.user_ids ?? []));
      departmentIds.push(...(data?.department_ids ?? []));
    });
  } catch {
    return { userIds, departmentIds };
  }
  return { userIds, departmentIds };
}

async function listDepartmentChildren(token: string, departmentId: string) {
  const ids: string[] = [];
  await paginatedGet<{
    has_more?: boolean;
    page_token?: string;
    items?: Array<{ open_department_id?: string; department_id?: string }>;
  }>(
    token,
    `/open-apis/contact/v3/departments/${encodeURIComponent(departmentId)}/children?fetch_child=true&page_size=50`,
    (data) => {
      for (const item of data?.items ?? []) {
        const id = item.open_department_id || item.department_id;
        if (id) ids.push(id);
      }
    }
  );
  return ids;
}

async function listUsersInDepartment(token: string, departmentId: string) {
  const people: LarkPerson[] = [];
  await paginatedGet<{
    has_more?: boolean;
    page_token?: string;
    items?: ContactUser[];
  }>(
    token,
    `/open-apis/contact/v3/users/find_by_department?department_id=${encodeURIComponent(departmentId)}&page_size=50&user_id_type=open_id`,
    (data) => {
      for (const user of data?.items ?? []) {
        const person = personFromContactUser(user);
        if (person) people.push(person);
      }
    }
  );
  return people;
}

async function getContactUser(token: string, userId: string) {
  const body = await larkFetch<{ data?: { user?: ContactUser } }>(
    `/open-apis/contact/v3/users/${encodeURIComponent(userId)}?user_id_type=open_id`,
    { method: "GET", token }
  );
  return personFromContactUser(body.data?.user ?? {});
}

async function listDirectoryEmployees(token: string) {
  const people: LarkPerson[] = [];
  let pageToken = "";
  do {
    const body = await larkFetch<{
      data?: {
        employees?: Array<{
          base_info?: {
            employee_id?: string;
            name?: { name?: { default_value?: string; value?: string } };
            avatar?: { avatar_72?: string };
          };
          work_info?: { work_email?: string };
        }>;
        page_response?: { has_more?: boolean; page_token?: string };
      };
    }>("/open-apis/directory/v1/employees/filter?employee_id_type=open_id", {
      method: "POST",
      token,
      body: JSON.stringify({
        filter: {
          conditions: [
            {
              field: "work_info.staff_status",
              operator: "eq",
              value: "1",
            },
          ],
        },
        required_fields: ["base_info.name", "base_info.employee_id", "work_info.work_email"],
        page_request: { page_size: 100, page_token: pageToken },
      }),
    });
    for (const employee of body.data?.employees ?? []) {
      const id = employee.base_info?.employee_id;
      if (!id) continue;
      const name =
        employee.base_info?.name?.name?.default_value ||
        employee.base_info?.name?.name?.value ||
        id;
      people.push({
        id,
        name,
        email: employee.work_info?.work_email ?? "",
        avatarUrl: employee.base_info?.avatar?.avatar_72 ?? "",
      });
    }
    pageToken = body.data?.page_response?.has_more
      ? (body.data.page_response.page_token ?? "")
      : "";
  } while (pageToken);
  return people;
}

function mergeLarkPeople(groups: LarkPerson[][]) {
  const map = new Map<string, LarkPerson>();
  for (const group of groups) {
    for (const person of group) {
      if (!person.id) continue;
      const existing = map.get(person.id);
      if (!existing) {
        map.set(person.id, person);
        continue;
      }
      map.set(person.id, {
        id: person.id,
        name: person.name || existing.name,
        email: person.email || existing.email,
        avatarUrl: person.avatarUrl || existing.avatarUrl,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function listCompanyPeople(token: string): Promise<{
  people: LarkPerson[];
  limited: boolean;
}> {
  const groups: LarkPerson[][] = [];
  let walkedOrg = false;

  try {
    groups.push(await listDirectoryEmployees(token));
    walkedOrg = true;
  } catch {
    // Needs directory:employee:list — fall through to Contacts.
  }

  try {
    groups.push(await listUsersInDepartment(token, "0"));
    walkedOrg = true;
  } catch {
    // Root department requires all-employee contacts permission.
  }

  try {
    const childIds = await listDepartmentChildren(token, "0");
    walkedOrg = true;
    for (const departmentId of childIds) {
      try {
        groups.push(await listUsersInDepartment(token, departmentId));
      } catch {
        // Skip departments outside the app's contacts range.
      }
    }
  } catch {
    // Root department children require all-employee contacts permission.
  }

  const scopes = await listContactScopeIds(token);
  for (const departmentId of scopes.departmentIds) {
    try {
      groups.push(await listUsersInDepartment(token, departmentId));
      const nested = await listDepartmentChildren(token, departmentId).catch(() => []);
      for (const childId of nested) {
        try {
          groups.push(await listUsersInDepartment(token, childId));
        } catch {
          // Skip nested departments the app cannot read.
        }
      }
    } catch {
      // Skip departments outside the app's contacts range.
    }
  }

  for (const userId of scopes.userIds) {
    try {
      const person = await getContactUser(token, userId);
      if (person) groups.push([person]);
    } catch {
      // Scope ids can include users the token cannot hydrate.
    }
  }

  try {
    const listed: LarkPerson[] = [];
    await paginatedGet<{
      has_more?: boolean;
      page_token?: string;
      items?: ContactUser[];
    }>(token, "/open-apis/contact/v3/users?page_size=50&user_id_type=open_id", (data) => {
      for (const user of data?.items ?? []) {
        const person = personFromContactUser(user);
        if (person) listed.push(person);
      }
    });
    groups.push(listed);
  } catch {
    // Contacts user list is a fallback only.
  }

  const people = mergeLarkPeople(groups);
  return { people, limited: !walkedOrg || people.length === 0 };
}

export async function listContactUsers(token: string) {
  return (await listCompanyPeople(token)).people;
}

export async function listTableNames(token: string, appToken: string) {
  return listTables(token, appToken);
}

export async function listTableFieldNames(token: string, appToken: string, tableId: string) {
  return listFields(token, appToken, tableId);
}

export async function listTableFieldMeta(token: string, appToken: string, tableId: string) {
  return listFieldMeta(token, appToken, tableId);
}

const ATTACHMENT_FIELD_TYPE = 17;

function isAttachmentField(field: LarkFieldMeta) {
  return field.type === ATTACHMENT_FIELD_TYPE || normalizeKey(field.uiType) === "attachment";
}

const ensureFieldLocks = new Map<string, Promise<{ name: string; created: boolean }>>();

export async function createTableField(
  token: string,
  appToken: string,
  tableId: string,
  input: { name: string; type: number }
) {
  const body = await larkFetch<{
    data?: { field?: { field_name?: string; type?: number } };
  }>(`/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`, {
    method: "POST",
    token,
    body: JSON.stringify({ field_name: input.name, type: input.type }),
  });
  return body.data?.field?.field_name?.trim() || input.name;
}

export async function ensureAttachmentField(
  token: string,
  appToken: string,
  tableId: string,
  input: { name: string; aliases?: string[] }
) {
  const key = `${appToken}:${tableId}:${normalizeKey(input.name)}`;
  const inflight = ensureFieldLocks.get(key);
  if (inflight) return inflight;

  const pending = (async () => {
    const wanted = [input.name, ...(input.aliases ?? [])].map(normalizeKey);
    const meta = await listFieldMeta(token, appToken, tableId);
    const existing = meta.find((field) => wanted.includes(normalizeKey(field.name)));
    if (existing) {
      if (!isAttachmentField(existing)) {
        throw new Error(
          `Transaction Log already has "${existing.name}", but it is not an Attachment field. Change that column to Attachment in Lark, or rename it so this desk can create Signature.`
        );
      }
      return { name: existing.name, created: false };
    }
    const name = await createTableField(token, appToken, tableId, {
      name: input.name,
      type: ATTACHMENT_FIELD_TYPE,
    });
    return { name, created: true };
  })().finally(() => {
    setTimeout(() => ensureFieldLocks.delete(key), 5_000);
  });

  ensureFieldLocks.set(key, pending);
  return pending;
}

export function attachmentFieldValue(fileToken: string) {
  return [{ file_token: fileToken }];
}

export async function uploadBitableFile(input: {
  token: string;
  appToken: string;
  fileName: string;
  bytes: Uint8Array;
  contentType?: string;
  retried?: boolean;
}): Promise<string> {
  const form = new FormData();
  form.set("file_name", input.fileName);
  form.set("parent_type", "bitable_file");
  form.set("parent_node", input.appToken);
  form.set("size", String(input.bytes.length));
  form.set(
    "file",
    new Blob([new Uint8Array(input.bytes)], { type: input.contentType ?? "image/png" }),
    input.fileName
  );

  const response = await fetch(`${apiBase()}/open-apis/drive/v1/medias/upload_all`, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.token}` },
    body: form,
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });

  let body: { code?: number; msg?: string; data?: { file_token?: string } };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    throw new Error(`Lark upload returned a non-JSON response (${response.status}).`);
  }

  if (!response.ok || (typeof body.code === "number" && body.code !== 0)) {
    if (body.code === 99991663 && !input.retried) {
      tokenCache = null;
      const fresh = await getTenantToken();
      return uploadBitableFile({ ...input, token: fresh, retried: true });
    }
    const detail = body.msg || response.statusText;
    throw new Error(
      `Could not upload the signature to Lark${body.code != null ? ` (${body.code})` : ""}: ${detail}`
    );
  }

  const fileToken = body.data?.file_token?.trim();
  if (!fileToken) throw new Error("Lark did not return a file token for the signature.");
  return fileToken;
}

export { pickField };
