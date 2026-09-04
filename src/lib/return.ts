import { invalidateAssetsCache } from "@/lib/assets";
import { fieldToString, linkRecordIds, normalizeKey, parseUsers } from "@/lib/field-value";
import {
  dateToMillis,
  linkField,
  millisToDate,
  userField,
} from "@/lib/handover-shared";
import {
  assertReturnSignature,
  pngBytesFromDataUrl,
  signatureAttachmentName,
} from "@/lib/handover-sign";
import { getHandoverDesk, invalidateHandoverCache } from "@/lib/handover";
import {
  attachmentFieldValue,
  createTableRecord,
  ensureAttachmentField,
  ensureSelectOptions,
  getLarkSession,
  getTableRecord,
  isLarkConfigured,
  listTableFieldMeta,
  pickField,
  searchTableRecords,
  updateTableRecord,
  uploadBitableFile,
} from "@/lib/lark";
import { createMaintenanceFromReturn, invalidateMaintenanceCache } from "@/lib/maintenance";
import {
  DEMO_RETURN_OPTIONS,
  listMockRecentReturns,
  listMockReturnAssets,
  submitMockReturn,
} from "@/lib/mock-return";
import {
  RETURN_REASON_CHOICES,
  assetConditionAfterReturn,
  describeReturnChanges,
  keepsAssignee,
  maintenanceIssueForReturn,
  maintenanceTypeForReturn,
  needsMaintenanceJob,
  nextStatusAfterReturn,
  pickReturnConditions,
  pickReturnReasons,
  signerForReturnAssets,
  toReturnAsset,
  validateReturnInput,
} from "@/lib/return-shared";
import { looksLikeSerial, sanitizeSerial } from "@/lib/serial";
import type {
  HandoverAsset,
  HandoverTransaction,
  ReturnPayload,
  ReturnResult,
  ReturnSubmitInput,
} from "@/lib/types";

type ReturnContext = {
  token: string;
  appToken: string;
  assetTableId: string;
  txnTableId: string;
  txnTableName: string;
  assetFields: {
    name: string;
    serial: string;
    assetId: string | null;
    status: string | null;
    location: string | null;
    condition: string | null;
    assignee: string | null;
    email: string | null;
  };
  txnFields: {
    id: string | null;
    type: string;
    reason: string | null;
    asset: string;
    staff: string;
    location: string;
    requestDate: string | null;
    returnDate: string | null;
    approvalStatus: string | null;
    assignmentStatus: string | null;
    conditionOnReturn: string | null;
    remarks: string | null;
    signature: string | null;
    createdTime: string | null;
  };
};

let contextCache: { at: number; value: ReturnContext } | null = null;
let deskCache: { at: number; data: ReturnPayload } | null = null;
const TTL_MS = 15_000;

export function invalidateReturnCache() {
  deskCache = null;
  contextCache = null;
}

function pickOptional(fields: string[], candidates: string[]) {
  try {
    return pickField(fields, "", candidates);
  } catch {
    return null;
  }
}

function optionsFor(meta: Array<{ name: string; options: string[] }>, fieldName: string | null, fallback: string[]) {
  if (!fieldName) return fallback;
  const match = meta.find((field) => field.name === fieldName);
  return match?.options.length ? match.options : fallback;
}

async function resolveReturnContext(): Promise<ReturnContext> {
  const session = await getLarkSession();
  if (!session) throw new Error("Lark is not configured. Open Setup and connect your Base.");
  if (contextCache && Date.now() - contextCache.at < 5 * 60_000) {
    return { ...contextCache.value, token: session.token };
  }

  const assetTable =
    session.tables.find((table) => table.table_id === session.config.tableId) ??
    session.tables.find((table) => normalizeKey(table.name ?? "").includes("asset register")) ??
    session.tables.find((table) => normalizeKey(table.name ?? "").includes("asset")) ??
    null;
  const txnTable =
    session.tables.find((table) => normalizeKey(table.name ?? "").includes("transaction")) ??
    null;
  if (!assetTable?.table_id) throw new Error("Could not find the Asset Register table.");
  if (!txnTable?.table_id) throw new Error("Could not find a Transaction Log table.");

  const assetMeta = await listTableFieldMeta(session.token, session.appToken, assetTable.table_id);
  const txnMeta = await listTableFieldMeta(session.token, session.appToken, txnTable.table_id);
  const assetNames = assetMeta.map((field) => field.name);
  const txnNames = txnMeta.map((field) => field.name);

  const value: ReturnContext = {
    token: session.token,
    appToken: session.appToken,
    assetTableId: assetTable.table_id,
    txnTableId: txnTable.table_id,
    txnTableName: txnTable.name || "Transaction Log",
    assetFields: {
      name: pickField(assetNames, session.config.assetNameField, ["asset name", "asset", "name"]),
      serial: pickField(assetNames, session.config.serialNumberField, ["serial number", "serial", "sn"]),
      assetId: pickOptional(assetNames, ["asset id", "asset tag", "tag"]),
      status: pickOptional(assetNames, ["current status", "status"]),
      location: pickOptional(assetNames, ["location"]),
      condition: pickOptional(assetNames, ["asset condition", "condition"]),
      assignee: pickOptional(assetNames, ["current assignee", "assignee"]),
      email: pickOptional(assetNames, ["current assignee.work email", "work email"]),
    },
    txnFields: {
      id: pickOptional(txnNames, ["transaction id"]),
      type: pickField(txnNames, "", ["transaction type", "type"]),
      reason: pickOptional(txnNames, ["reason"]),
      asset: pickField(txnNames, "", ["asset"]),
      staff: pickField(txnNames, "", ["staff", "employee", "employee name"]),
      location: pickField(txnNames, "", ["location"]),
      requestDate: pickOptional(txnNames, ["request date"]),
      returnDate: pickOptional(txnNames, ["return date"]),
      approvalStatus: pickOptional(txnNames, ["approval status"]),
      assignmentStatus: pickOptional(txnNames, ["assignment status"]),
      conditionOnReturn: pickOptional(txnNames, ["condition on return"]),
      remarks: pickOptional(txnNames, ["remarks", "remark"]),
      signature: pickOptional(txnNames, ["signature", "employee signature", "acknowledgement signature"]),
      createdTime: pickOptional(txnNames, ["created time"]),
    },
  };
  contextCache = { at: Date.now(), value };
  return { ...value, token: session.token };
}

function assetFromFields(ctx: ReturnContext, recordId: string, fields: Record<string, unknown>): HandoverAsset {
  const holder = ctx.assetFields.assignee ? parseUsers(fields[ctx.assetFields.assignee])[0] : null;
  return toReturnAsset({
    recordId,
    assetId: ctx.assetFields.assetId ? fieldToString(fields[ctx.assetFields.assetId]) : "",
    name: fieldToString(fields[ctx.assetFields.name]) || "(unnamed asset)",
    serialNumber: fieldToString(fields[ctx.assetFields.serial]),
    currentStatus: ctx.assetFields.status ? fieldToString(fields[ctx.assetFields.status]) : "",
    location: ctx.assetFields.location ? fieldToString(fields[ctx.assetFields.location]) : "",
    condition: ctx.assetFields.condition ? fieldToString(fields[ctx.assetFields.condition]) : "",
    assigneeId: holder?.id ?? "",
    assigneeName: holder?.name ?? "",
    assigneeEmail: holder?.email ?? "",
    blockedReason: null,
  });
}

async function listRecentReturns(ctx: ReturnContext, assetNames: Map<string, string>): Promise<HandoverTransaction[]> {
  const records = await searchTableRecords(ctx.token, ctx.appToken, ctx.txnTableId, {
    filter: {
      conjunction: "and",
      conditions: [{ field_name: ctx.txnFields.type, operator: "is", value: ["Return"] }],
    },
    sort: ctx.txnFields.createdTime
      ? [{ field_name: ctx.txnFields.createdTime, desc: true }]
      : undefined,
    pageSize: 20,
    maxRecords: 20,
  });

  return records
    .map((record) => {
      const fields = record.fields ?? {};
      const linked = linkRecordIds(fields[ctx.txnFields.asset])[0] || "";
      const staff = parseUsers(fields[ctx.txnFields.staff])[0];
      return {
        recordId: record.record_id || record.id || "",
        transactionId: ctx.txnFields.id ? fieldToString(fields[ctx.txnFields.id]) : "",
        type: fieldToString(fields[ctx.txnFields.type]),
        assetName: (linked && assetNames.get(linked)) || fieldToString(fields[ctx.txnFields.asset]) || "Asset",
        staffName: staff?.name ?? "",
        location: fieldToString(fields[ctx.txnFields.location]),
        assignmentType: "",
        status: ctx.txnFields.assignmentStatus
          ? fieldToString(fields[ctx.txnFields.assignmentStatus])
          : "",
        effectiveDate: ctx.txnFields.returnDate
          ? millisToDate(fields[ctx.txnFields.returnDate])
          : "",
      };
    })
    .filter((item) => item.recordId);
}

async function listLarkReturnDesk(): Promise<ReturnPayload> {
  const desk = await getHandoverDesk({ includePeople: false });
  const ctx = await resolveReturnContext();
  const txnMeta = await listTableFieldMeta(ctx.token, ctx.appToken, ctx.txnTableId);
  const assets = desk.assets.map(toReturnAsset);
  const assetNames = new Map(assets.map((asset) => [asset.recordId, asset.name]));
  const recent = await listRecentReturns(ctx, assetNames);
  return {
    mode: "lark",
    tableName: desk.tableName,
    transactionTableName: ctx.txnTableName,
    assets,
    recent,
    options: {
      locations: desk.options.locations,
      reasons: pickReturnReasons(optionsFor(txnMeta, ctx.txnFields.reason, desk.options.reasons)),
      conditions: pickReturnConditions(
        optionsFor(txnMeta, ctx.txnFields.conditionOnReturn, DEMO_RETURN_OPTIONS.conditions)
      ),
    },
    warning: desk.warning,
  };
}

export async function getReturnDesk(): Promise<ReturnPayload> {
  if (deskCache && Date.now() - deskCache.at < TTL_MS) return deskCache.data;

  if (!(await isLarkConfigured())) {
    const data: ReturnPayload = {
      mode: "demo",
      tableName: "Asset Register",
      transactionTableName: "Transaction Log",
      assets: listMockReturnAssets(),
      recent: listMockRecentReturns(),
      options: DEMO_RETURN_OPTIONS,
      warning:
        "Demo mode is on because no Lark Base is connected yet. Returns stay on this server until you connect Setup.",
    };
    deskCache = { at: Date.now(), data };
    return data;
  }

  const data = await listLarkReturnDesk();
  deskCache = { at: Date.now(), data };
  return data;
}

export async function lookupReturnAsset(rawSerial: string): Promise<HandoverAsset> {
  const serial = sanitizeSerial(rawSerial);
  if (!looksLikeSerial(serial)) throw new Error("That does not look like a serial number.");
  const desk = await getReturnDesk();
  const matches = desk.assets.filter(
    (asset) => asset.serialNumber && asset.serialNumber.toLowerCase() === serial.toLowerCase()
  );
  if (matches.length === 0) {
    throw new Error(`No asset in the register matches serial ${serial}.`);
  }
  const asset = matches[0];
  if (asset.blockedReason) throw new Error(asset.blockedReason);
  return asset;
}

async function submitLarkReturn(
  input: ReturnSubmitInput,
  signatureDataUrl: string,
  staffName: string,
  signedAt: string
): Promise<ReturnResult> {
  validateReturnInput(input);
  const ctx = await resolveReturnContext();
  if (ctx.txnFields.reason) {
    await ensureSelectOptions(
      ctx.token,
      ctx.appToken,
      ctx.txnTableId,
      ctx.txnFields.reason,
      RETURN_REASON_CHOICES
    );
  }
  if (!ctx.txnFields.signature) {
    ctx.txnFields.signature = (
      await ensureAttachmentField(ctx.token, ctx.appToken, ctx.txnTableId, {
        name: "Signature",
        aliases: ["employee signature", "acknowledgement signature"],
      })
    ).name;
  }
  const when = dateToMillis(input.returnDate);
  const png = pngBytesFromDataUrl(signatureDataUrl);
  const fileToken = await uploadBitableFile({
    token: ctx.token,
    appToken: ctx.appToken,
    fileName: signatureAttachmentName(staffName, signedAt),
    bytes: png,
  });
  const signatureCell = attachmentFieldValue(fileToken);
  const transactionIds: string[] = [];
  const maintenanceIds: string[] = [];
  const changes: string[] = [];
  const updatedAssets: HandoverAsset[] = [];
  const names: string[] = [];

  for (const item of input.items) {
    const record = await getTableRecord(ctx.token, ctx.appToken, ctx.assetTableId, item.assetRecordId);
    if (!record) throw new Error("An asset in the basket was not found in the Asset Register.");
    const asset = assetFromFields(ctx, item.assetRecordId, record.fields ?? {});
    if (asset.blockedReason) throw new Error(`${asset.name}: ${asset.blockedReason}`);

    const nextStatus = nextStatusAfterReturn(item.reason, item.condition);
    const registerCondition = assetConditionAfterReturn(item.condition);
    const keepHolder = keepsAssignee(item.reason);
    const openMaintenance = needsMaintenanceJob(item.reason, item.condition);
    const maintenanceType = maintenanceTypeForReturn(item.reason);

    const txnFields: Record<string, unknown> = {
      [ctx.txnFields.type]: "Return",
      [ctx.txnFields.asset]: linkField(asset.recordId),
      [ctx.txnFields.location]: input.location,
    };
    if (ctx.txnFields.reason) txnFields[ctx.txnFields.reason] = item.reason;
    if (asset.assigneeId) txnFields[ctx.txnFields.staff] = userField(asset.assigneeId);
    if (ctx.txnFields.requestDate) txnFields[ctx.txnFields.requestDate] = when;
    if (ctx.txnFields.returnDate) txnFields[ctx.txnFields.returnDate] = when;
    if (ctx.txnFields.approvalStatus) txnFields[ctx.txnFields.approvalStatus] = "Approved";
    if (ctx.txnFields.assignmentStatus) txnFields[ctx.txnFields.assignmentStatus] = "Returned";
    if (ctx.txnFields.conditionOnReturn) txnFields[ctx.txnFields.conditionOnReturn] = item.condition;
    if (ctx.txnFields.remarks && input.remarks.trim()) txnFields[ctx.txnFields.remarks] = input.remarks.trim();
    if (ctx.txnFields.signature) txnFields[ctx.txnFields.signature] = signatureCell;

    const created = await createTableRecord(ctx.token, ctx.appToken, ctx.txnTableId, txnFields);

    const assetUpdate: Record<string, unknown> = {};
    if (!keepHolder) {
      if (ctx.assetFields.assignee) assetUpdate[ctx.assetFields.assignee] = [];
      if (ctx.assetFields.email) assetUpdate[ctx.assetFields.email] = "";
    }
    if (ctx.assetFields.status) assetUpdate[ctx.assetFields.status] = nextStatus;
    if (ctx.assetFields.location) assetUpdate[ctx.assetFields.location] = input.location;
    if (ctx.assetFields.condition && registerCondition) {
      assetUpdate[ctx.assetFields.condition] = registerCondition;
    }
    await updateTableRecord(ctx.token, ctx.appToken, ctx.assetTableId, asset.recordId, assetUpdate);

    let maintenanceId = "";
    if (openMaintenance) {
      const job = await createMaintenanceFromReturn({
        assetRecordId: asset.recordId,
        assetName: asset.name,
        type: maintenanceType,
        issue: maintenanceIssueForReturn(item.reason, item.condition, input.remarks),
        priority: normalizeKey(item.condition) === "damaged" ? "High" : "Medium",
        reportedById: asset.assigneeId || undefined,
      });
      maintenanceId = job.maintenanceId;
      maintenanceIds.push(job.maintenanceId);
    }

    const refreshed = await getTableRecord(ctx.token, ctx.appToken, ctx.assetTableId, asset.recordId);
    const updated = assetFromFields(ctx, asset.recordId, refreshed?.fields ?? { ...record.fields, ...assetUpdate });
    const transactionId = ctx.txnFields.id
      ? fieldToString(created?.fields?.[ctx.txnFields.id])
      : created?.record_id || "saved";

    transactionIds.push(transactionId);
    names.push(asset.name);
    updatedAssets.push(updated);
    changes.push(
      ...describeReturnChanges({
        assetName: asset.name,
        assetId: asset.assetId,
        previousAssignee: asset.assigneeName,
        nextStatus,
        location: input.location,
        condition: item.condition,
        reason: item.reason,
        transactionId,
        assigneeKept: keepHolder,
        maintenanceCreated: openMaintenance,
        maintenanceType,
        signatureAttached: true,
      })
    );
    if (maintenanceId) {
      changes.push(`Maintenance ${maintenanceId} opened`);
    }
  }

  return {
    mode: "lark",
    summary: names.length === 1 ? `Returned ${names[0]}.` : `Returned ${names.length} assets.`,
    changes,
    transactionIds,
    maintenanceIds,
    assets: updatedAssets,
  };
}

export async function submitReturn(input: ReturnSubmitInput): Promise<ReturnResult> {
  validateReturnInput(input);
  const desk = await getReturnDesk();
  const assets = input.items.map((item) => {
    const asset = desk.assets.find((row) => row.recordId === item.assetRecordId);
    if (!asset) throw new Error("An asset in the basket was not found in the register.");
    return asset;
  });
  const signer = signerForReturnAssets(assets);
  if (!signer) {
    throw new Error("All assets in this return must belong to the same person before they sign.");
  }
  const signed = await assertReturnSignature({
    signatureToken: input.signatureToken,
    staffId: signer.staffId,
    items: input.items,
  });
  if (!signed.signatureDataUrl) {
    throw new Error("The employee must sign before you can complete this return.");
  }
  const signedNote = `Employee signed ${signed.signedAt} (${signed.staffName}). PNG stored on Transaction Log Signature.`;
  const nextInput: ReturnSubmitInput = {
    ...input,
    remarks: [input.remarks.trim(), signedNote].filter(Boolean).join("\n"),
  };

  if (!(await isLarkConfigured())) {
    const result = submitMockReturn(nextInput);
    invalidateReturnCache();
    invalidateHandoverCache();
    invalidateAssetsCache();
    invalidateMaintenanceCache();
    return result;
  }

  const result = await submitLarkReturn(
    nextInput,
    signed.signatureDataUrl,
    signed.staffName,
    signed.signedAt ?? new Date().toISOString()
  );
  invalidateReturnCache();
  invalidateHandoverCache();
  invalidateAssetsCache();
  invalidateMaintenanceCache();
  return result;
}
