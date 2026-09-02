import { invalidateAssetsCache } from "@/lib/assets";
import { fieldToString, linkRecordIds, normalizeKey } from "@/lib/field-value";
import {
  getLarkSession,
  getTableRecord,
  isLarkConfigured,
  listTableFieldNames,
  pickField,
  searchTableRecords,
  updateTableRecord,
} from "@/lib/lark";
import { advanceMockMaintenance, listMockMaintenanceJobs } from "@/lib/mock-maintenance";
import {
  describeMaintenanceAdvance,
  maintenanceSummary,
  previewMaintenanceChanges,
} from "@/lib/maintenance-copy";
import { looksLikeSerial, sanitizeSerial } from "@/lib/serial";
import type {
  MaintenanceAction,
  MaintenanceAdvanceResult,
  MaintenanceJob,
  MaintenancePayload,
} from "@/lib/types";

type MaintenanceContext = {
  token: string;
  appToken: string;
  tableId: string;
  tableName: string;
  assetTableId: string;
  fields: {
    asset: string;
    type: string;
    status: string;
    priority: string;
    issue: string;
    id: string;
    startDate: string | null;
    completionDate: string | null;
    conditionAfter: string | null;
  };
  assetFields: {
    name: string;
    serial: string;
    assetId: string | null;
    currentStatus: string | null;
    condition: string | null;
    assignee: string | null;
    lastMaintenance: string | null;
  };
};

let contextCache: { at: number; value: MaintenanceContext } | null = null;
let jobsCache: { at: number; data: MaintenancePayload } | null = null;
const TTL_MS = 15_000;

export function invalidateMaintenanceCache() {
  jobsCache = null;
  contextCache = null;
}

function nextActionFor(status: string): MaintenanceAction | null {
  const key = normalizeKey(status);
  if (key === "open") return "start";
  if (key === "in progress") return "complete";
  return null;
}

function pickOptional(fields: string[], candidates: string[]): string | null {
  try {
    return pickField(fields, "", candidates);
  } catch {
    return null;
  }
}

async function resolveMaintenanceContext(): Promise<MaintenanceContext> {
  const session = await getLarkSession();
  if (!session) {
    throw new Error("Lark is not configured. Open Setup and connect your Base.");
  }

  if (contextCache && Date.now() - contextCache.at < 5 * 60_000) {
    return { ...contextCache.value, token: session.token };
  }

  const maintenanceTable =
    session.tables.find((table) => normalizeKey(table.name ?? "").includes("maintenance")) ??
    null;
  const assetTable =
    session.tables.find((table) => table.table_id === session.config.tableId) ??
    session.tables.find((table) => normalizeKey(table.name ?? "").includes("asset register")) ??
    session.tables.find((table) => normalizeKey(table.name ?? "").includes("asset")) ??
    null;

  if (!maintenanceTable?.table_id) {
    throw new Error(
      `Could not find a Maintenance Log table. Tables in this Base: ${session.tables
        .map((table) => table.name)
        .join(", ")}`
    );
  }
  if (!assetTable?.table_id) {
    throw new Error("Could not find the Asset Register table linked to Setup.");
  }

  const fields = await listTableFieldNames(session.token, session.appToken, maintenanceTable.table_id);
  const assetFields = await listTableFieldNames(session.token, session.appToken, assetTable.table_id);

  const value: MaintenanceContext = {
    token: session.token,
    appToken: session.appToken,
    tableId: maintenanceTable.table_id,
    tableName: maintenanceTable.name || "Maintenance Log",
    assetTableId: assetTable.table_id,
    fields: {
      asset: pickField(fields, "", ["asset"]),
      type: pickField(fields, "", ["maintenance type", "type"]),
      status: pickField(fields, "", ["status"]),
      priority: pickOptional(fields, ["priority"]) || "",
      issue: pickOptional(fields, ["issue/ request", "issue request", "issue", "request"]) || "",
      id: pickOptional(fields, ["maintenance id", "id"]) || "",
      startDate: pickOptional(fields, ["start date"]),
      completionDate: pickOptional(fields, ["completion date", "completed date"]),
      conditionAfter: pickOptional(fields, [
        "asset condition after maintenance",
        "condition after maintenance",
        "condition after",
      ]),
    },
    assetFields: {
      name: pickField(assetFields, session.config.assetNameField, [
        "asset name",
        "asset",
        "name",
      ]),
      serial: pickField(assetFields, session.config.serialNumberField, [
        "serial number",
        "serial",
        "sn",
      ]),
      assetId: pickOptional(assetFields, ["asset id", "asset tag", "tag"]),
      currentStatus: pickOptional(assetFields, ["current status", "status"]),
      condition: pickOptional(assetFields, ["asset condition", "condition"]),
      assignee: pickOptional(assetFields, ["current assignee", "assignee", "owner"]),
      lastMaintenance: pickOptional(assetFields, ["last maintenance date"]),
    },
  };

  contextCache = { at: Date.now(), value };
  return { ...value, token: session.token };
}

async function loadLinkedAssets(ctx: MaintenanceContext, assetIds: string[]) {
  const unique = [...new Set(assetIds.filter(Boolean))];
  const map = new Map<string, Record<string, unknown>>();
  await Promise.all(
    unique.map(async (recordId) => {
      const record = await getTableRecord(ctx.token, ctx.appToken, ctx.assetTableId, recordId);
      map.set(recordId, record?.fields ?? {});
    })
  );
  return map;
}

function jobFromRecords(
  ctx: MaintenanceContext,
  recordId: string,
  maintFields: Record<string, unknown>,
  assetFields: Record<string, unknown>,
  assetRecordId: string
): MaintenanceJob {
  const status = fieldToString(maintFields[ctx.fields.status]) || "Open";
  return {
    recordId,
    maintenanceId: ctx.fields.id ? fieldToString(maintFields[ctx.fields.id]) : recordId,
    type: fieldToString(maintFields[ctx.fields.type]) || "Repair",
    status,
    priority: ctx.fields.priority ? fieldToString(maintFields[ctx.fields.priority]) : "",
    issue: ctx.fields.issue ? fieldToString(maintFields[ctx.fields.issue]) : "",
    assetRecordId,
    assetId: ctx.assetFields.assetId ? fieldToString(assetFields[ctx.assetFields.assetId]) : "",
    assetName: fieldToString(assetFields[ctx.assetFields.name]) || "(unnamed asset)",
    serialNumber: fieldToString(assetFields[ctx.assetFields.serial]),
    currentStatus: ctx.assetFields.currentStatus
      ? fieldToString(assetFields[ctx.assetFields.currentStatus])
      : "",
    assetCondition: ctx.assetFields.condition
      ? fieldToString(assetFields[ctx.assetFields.condition])
      : "",
    assignee: ctx.assetFields.assignee ? fieldToString(assetFields[ctx.assetFields.assignee]) : "",
    nextAction: nextActionFor(status),
  };
}

async function listLarkMaintenanceJobs(): Promise<MaintenancePayload> {
  const ctx = await resolveMaintenanceContext();
  const records = await searchTableRecords(ctx.token, ctx.appToken, ctx.tableId, {
    filter: {
      conjunction: "or",
      conditions: [
        { field_name: ctx.fields.status, operator: "is", value: ["Open"] },
        { field_name: ctx.fields.status, operator: "is", value: ["In Progress"] },
      ],
    },
  });

  const assetIds = records.flatMap((record) => linkRecordIds(record.fields?.[ctx.fields.asset]));
  const assets = await loadLinkedAssets(ctx, assetIds);

  const jobs = records
    .map((record) => {
      const recordId = record.record_id || record.id || "";
      const assetRecordId = linkRecordIds(record.fields?.[ctx.fields.asset])[0] || "";
      return jobFromRecords(
        ctx,
        recordId,
        record.fields ?? {},
        assets.get(assetRecordId) ?? {},
        assetRecordId
      );
    })
    .filter((job) => job.recordId)
    .sort((a, b) => {
      const rank = (status: string) => (normalizeKey(status) === "open" ? 0 : 1);
      const byStatus = rank(a.status) - rank(b.status);
      if (byStatus !== 0) return byStatus;
      return a.maintenanceId.localeCompare(b.maintenanceId);
    });

  return { mode: "lark", tableName: ctx.tableName, jobs };
}

export async function getMaintenanceJobs(): Promise<MaintenancePayload> {
  if (jobsCache && Date.now() - jobsCache.at < TTL_MS) return jobsCache.data;

  if (!(await isLarkConfigured())) {
    const data: MaintenancePayload = {
      mode: "demo",
      tableName: "Maintenance Log",
      jobs: listMockMaintenanceJobs(),
      warning:
        "Demo mode is on because no Lark Base is connected yet. Open jobs stay on this server until you connect Setup.",
    };
    jobsCache = { at: Date.now(), data };
    return data;
  }

  const data = await listLarkMaintenanceJobs();
  jobsCache = { at: Date.now(), data };
  return data;
}

export async function lookupMaintenanceJob(rawSerial: string): Promise<MaintenanceJob> {
  const serial = sanitizeSerial(rawSerial);
  if (!looksLikeSerial(serial)) {
    throw new Error("That does not look like a serial number.");
  }

  const payload = await getMaintenanceJobs();
  const matches = payload.jobs.filter(
    (job) => job.serialNumber && job.serialNumber.toLowerCase() === serial.toLowerCase()
  );
  if (matches.length === 0) {
    throw new Error(`No Open or In Progress maintenance job matches serial ${serial}.`);
  }

  const inProgress = matches.find((job) => job.nextAction === "complete");
  const open = matches.find((job) => job.nextAction === "start");
  const job = inProgress || open || matches[0];
  if (!job?.nextAction) {
    throw new Error(`Serial ${serial} is on a job that is not Open or In Progress.`);
  }
  return job;
}

function describeAdvance(job: MaintenanceJob, action: MaintenanceAction): string[] {
  return describeMaintenanceAdvance(job, action);
}

function summaryFor(job: MaintenanceJob, action: MaintenanceAction) {
  return maintenanceSummary(job, action);
}

async function advanceLarkJob(recordId: string): Promise<MaintenanceAdvanceResult> {
  const ctx = await resolveMaintenanceContext();
  const record = await getTableRecord(ctx.token, ctx.appToken, ctx.tableId, recordId);
  if (!record) throw new Error("That maintenance record was not found.");

  const assetRecordId = linkRecordIds(record.fields?.[ctx.fields.asset])[0] || "";
  if (!assetRecordId) throw new Error("This maintenance job is not linked to an asset.");
  const asset = await getTableRecord(ctx.token, ctx.appToken, ctx.assetTableId, assetRecordId);
  const job = jobFromRecords(ctx, recordId, record.fields ?? {}, asset?.fields ?? {}, assetRecordId);
  const action = job.nextAction;
  if (!action) {
    throw new Error(`${job.maintenanceId} is ${job.status}. Only Open and In Progress jobs can be updated here.`);
  }

  const now = Date.now();
  const maintFields: Record<string, unknown> = {};
  const assetUpdate: Record<string, unknown> = {};

  if (action === "start") {
    maintFields[ctx.fields.status] = "In Progress";
    if (ctx.fields.startDate) maintFields[ctx.fields.startDate] = now;
    if (job.type === "Repair" && ctx.assetFields.currentStatus) {
      assetUpdate[ctx.assetFields.currentStatus] = "In Repair";
    }
  } else {
    maintFields[ctx.fields.status] = "Completed";
    if (ctx.fields.completionDate) maintFields[ctx.fields.completionDate] = now;
    if (job.type === "Repair") {
      if (ctx.fields.conditionAfter) maintFields[ctx.fields.conditionAfter] = "Good";
      if (ctx.assetFields.condition) assetUpdate[ctx.assetFields.condition] = "Good";
      if (ctx.assetFields.currentStatus) {
        assetUpdate[ctx.assetFields.currentStatus] = job.assignee ? "Assigned" : "Available";
      }
      if (ctx.assetFields.lastMaintenance) assetUpdate[ctx.assetFields.lastMaintenance] = now;
    }
  }

  await updateTableRecord(ctx.token, ctx.appToken, ctx.tableId, recordId, maintFields);
  if (Object.keys(assetUpdate).length > 0) {
    await updateTableRecord(ctx.token, ctx.appToken, ctx.assetTableId, assetRecordId, assetUpdate);
  }

  const refreshedAsset = await getTableRecord(ctx.token, ctx.appToken, ctx.assetTableId, assetRecordId);
  const refreshedMaint = await getTableRecord(ctx.token, ctx.appToken, ctx.tableId, recordId);
  const updated = jobFromRecords(
    ctx,
    recordId,
    refreshedMaint?.fields ?? { ...record.fields, ...maintFields },
    refreshedAsset?.fields ?? { ...(asset?.fields ?? {}), ...assetUpdate },
    assetRecordId
  );

  return {
    mode: "lark",
    action,
    job: updated,
    summary: summaryFor(job, action),
    changes: describeAdvance(job, action),
  };
}

export async function advanceMaintenance(recordId: string): Promise<MaintenanceAdvanceResult> {
  if (!(await isLarkConfigured())) {
    const { action, job } = advanceMockMaintenance(recordId);
    invalidateMaintenanceCache();
    invalidateAssetsCache();
    return {
      mode: "demo",
      action,
      job,
      summary: summaryFor(job, action),
      changes: describeAdvance(job, action),
    };
  }

  const result = await advanceLarkJob(recordId);
  invalidateMaintenanceCache();
  invalidateAssetsCache();
  return result;
}

export function previewChanges(job: MaintenanceJob): string[] {
  return previewMaintenanceChanges(job);
}
