import { invalidateAssetsCache } from "@/lib/assets";
import { assertHandoverSignature } from "@/lib/handover-sign";
import { fieldToString, linkRecordIds, normalizeKey, parseUsers } from "@/lib/field-value";
import {
  dateToMillis,
  describeHandoverChanges,
  linkField,
  millisToDate,
  nextAssetStatus,
  nextTransactionType,
  pickHandoverAssignmentTypes,
  pickHandoverConditions,
  pickHandoverReasons,
  toHandoverAsset,
  userField,
  validateHandoverInput,
} from "@/lib/handover-shared";
import {
  createTableRecord,
  getLarkSession,
  getTableRecord,
  isLarkConfigured,
  listCompanyPeople,
  listTableFieldMeta,
  pickField,
  searchTableRecords,
  updateTableRecord,
} from "@/lib/lark";
import {
  DEMO_HANDOVER_OPTIONS,
  listMockHandoverAssets,
  listMockPeople,
  listMockRecentHandovers,
  submitMockHandover,
} from "@/lib/mock-handover";
import { looksLikeSerial, sanitizeSerial } from "@/lib/serial";
import type {
  HandoverAsset,
  HandoverOptions,
  HandoverPayload,
  HandoverPerson,
  HandoverResult,
  HandoverSubmitInput,
  HandoverTransaction,
} from "@/lib/types";

type FieldMap = {
  name: string;
  serial: string;
  assetId: string | null;
  status: string | null;
  location: string | null;
  condition: string | null;
  assignee: string | null;
  email: string | null;
};

type TxnFields = {
  id: string | null;
  type: string;
  reason: string | null;
  asset: string;
  staff: string;
  assignmentType: string;
  location: string;
  requestDate: string | null;
  effectiveDate: string | null;
  expectedReturn: string | null;
  approvalStatus: string | null;
  assignmentStatus: string | null;
  requestedBy: string | null;
  approvedBy: string | null;
  approvalDate: string | null;
  condition: string | null;
  remarks: string | null;
  createdTime: string | null;
};

type HandoverContext = {
  token: string;
  appToken: string;
  assetTableId: string;
  txnTableId: string;
  txnTableName: string;
  assetFields: FieldMap;
  txnFields: TxnFields;
  options: HandoverOptions;
};

let contextCache: { at: number; value: HandoverContext } | null = null;
let deskCache: { at: number; data: HandoverPayload } | null = null;
const TTL_MS = 15_000;

export function invalidateHandoverCache() {
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

async function resolveHandoverContext(): Promise<HandoverContext> {
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
  if (!txnTable?.table_id) {
    throw new Error(
      `Could not find a Transaction Log table. Tables in this Base: ${session.tables
        .map((table) => table.name)
        .join(", ")}`
    );
  }

  const assetMeta = await listTableFieldMeta(session.token, session.appToken, assetTable.table_id);
  const txnMeta = await listTableFieldMeta(session.token, session.appToken, txnTable.table_id);
  const assetNames = assetMeta.map((field) => field.name);
  const txnNames = txnMeta.map((field) => field.name);

  const assetFields: FieldMap = {
    name: pickField(assetNames, session.config.assetNameField, ["asset name", "asset", "name"]),
    serial: pickField(assetNames, session.config.serialNumberField, ["serial number", "serial", "sn"]),
    assetId: pickOptional(assetNames, ["asset id", "asset tag", "tag"]),
    status: pickOptional(assetNames, ["current status", "status"]),
    location: pickOptional(assetNames, ["location"]),
    condition: pickOptional(assetNames, ["asset condition", "condition"]),
    assignee: pickOptional(assetNames, ["current assignee", "assignee"]),
    email: pickOptional(assetNames, ["current assignee.work email", "work email"]),
  };

  const txnFields: TxnFields = {
    id: pickOptional(txnNames, ["transaction id"]),
    type: pickField(txnNames, "", ["transaction type", "type"]),
    reason: pickOptional(txnNames, ["reason"]),
    asset: pickField(txnNames, "", ["asset"]),
    staff: pickField(txnNames, "", ["staff", "employee", "employee name"]),
    assignmentType: pickField(txnNames, "", ["assignment type"]),
    location: pickField(txnNames, "", ["location"]),
    requestDate: pickOptional(txnNames, ["request date"]),
    effectiveDate: pickOptional(txnNames, ["effective date", "handover date"]),
    expectedReturn: pickOptional(txnNames, ["expected return date"]),
    approvalStatus: pickOptional(txnNames, ["approval status"]),
    assignmentStatus: pickOptional(txnNames, ["assignment status"]),
    requestedBy: pickOptional(txnNames, ["requested by", "handover by"]),
    approvedBy: pickOptional(txnNames, ["approved by"]),
    approvalDate: pickOptional(txnNames, ["approval date"]),
    condition: pickOptional(txnNames, ["condition on handover", "condition"]),
    remarks: pickOptional(txnNames, ["remarks", "remark"]),
    createdTime: pickOptional(txnNames, ["created time"]),
  };

  const value: HandoverContext = {
    token: session.token,
    appToken: session.appToken,
    assetTableId: assetTable.table_id,
    txnTableId: txnTable.table_id,
    txnTableName: txnTable.name || "Transaction Log",
    assetFields,
    txnFields,
    options: {
      locations: optionsFor(txnMeta, txnFields.location, DEMO_HANDOVER_OPTIONS.locations),
      assignmentTypes: pickHandoverAssignmentTypes(
        optionsFor(txnMeta, txnFields.assignmentType, DEMO_HANDOVER_OPTIONS.assignmentTypes)
      ),
      reasons: pickHandoverReasons(optionsFor(txnMeta, txnFields.reason, DEMO_HANDOVER_OPTIONS.reasons)),
      conditions: pickHandoverConditions(
        optionsFor(txnMeta, txnFields.condition, DEMO_HANDOVER_OPTIONS.conditions)
      ),
    },
  };

  contextCache = { at: Date.now(), value };
  return { ...value, token: session.token };
}

function assetFromFields(ctx: HandoverContext, recordId: string, fields: Record<string, unknown>): HandoverAsset {
  const holder = ctx.assetFields.assignee ? parseUsers(fields[ctx.assetFields.assignee])[0] : null;
  return toHandoverAsset({
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
  });
}

function mergePeople(groups: HandoverPerson[][]) {
  const map = new Map<string, HandoverPerson>();
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

async function listPeople(ctx: HandoverContext, assets: HandoverAsset[]): Promise<{
  people: HandoverPerson[];
  peopleLimited: boolean;
  peopleHint?: string;
}> {
  let directory: HandoverPerson[] = [];
  let limited = false;
  try {
    const listed = await listCompanyPeople(ctx.token);
    directory = listed.people;
    limited = listed.limited;
  } catch {
    directory = [];
    limited = true;
  }

  const harvested: HandoverPerson[] = assets
    .filter((asset) => asset.assigneeId)
    .map((asset) => ({
      id: asset.assigneeId,
      name: asset.assigneeName,
      email: asset.assigneeEmail,
      avatarUrl: "",
    }));

  try {
    const txnRecords = await searchTableRecords(ctx.token, ctx.appToken, ctx.txnTableId, {
      fieldNames: [ctx.txnFields.staff, ctx.txnFields.requestedBy, ctx.txnFields.approvedBy].filter(
        (name): name is string => Boolean(name)
      ),
      maxRecords: 500,
      pageSize: 200,
    });
    for (const record of txnRecords) {
      const fields = record.fields ?? {};
      harvested.push(...parseUsers(fields[ctx.txnFields.staff]));
      if (ctx.txnFields.requestedBy) harvested.push(...parseUsers(fields[ctx.txnFields.requestedBy]));
      if (ctx.txnFields.approvedBy) harvested.push(...parseUsers(fields[ctx.txnFields.approvedBy]));
    }
  } catch {
    // Directory harvest is optional; contact list is enough to hand over.
  }

  const people = mergePeople([directory, harvested]);
  return {
    people,
    peopleLimited: limited,
    peopleHint: limited
      ? "Lark is only sending the people this custom app is allowed to read. In Lark Admin open Workplace → App Management → your custom app → Contacts permission, set it to All employees, publish a new app version in the Developer Console, then tap Refresh."
      : undefined,
  };
}

async function listRecent(ctx: HandoverContext, assetNames: Map<string, string>): Promise<HandoverTransaction[]> {
  const records = await searchTableRecords(ctx.token, ctx.appToken, ctx.txnTableId, {
    filter: {
      conjunction: "or",
      conditions: [
        { field_name: ctx.txnFields.type, operator: "is", value: ["Handover"] },
        { field_name: ctx.txnFields.type, operator: "is", value: ["Transfer"] },
        { field_name: ctx.txnFields.type, operator: "is", value: ["Loan"] },
      ],
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
        assignmentType: fieldToString(fields[ctx.txnFields.assignmentType]),
        status: ctx.txnFields.assignmentStatus
          ? fieldToString(fields[ctx.txnFields.assignmentStatus])
          : "",
        effectiveDate: ctx.txnFields.effectiveDate
          ? millisToDate(fields[ctx.txnFields.effectiveDate])
          : "",
      };
    })
    .filter((item) => item.recordId);
}

async function listLarkDesk(): Promise<HandoverPayload> {
  const ctx = await resolveHandoverContext();
  const fieldNames = [
    ctx.assetFields.name,
    ctx.assetFields.serial,
    ctx.assetFields.assetId,
    ctx.assetFields.status,
    ctx.assetFields.location,
    ctx.assetFields.condition,
    ctx.assetFields.assignee,
    ctx.assetFields.email,
  ].filter((name): name is string => Boolean(name));

  const records = await searchTableRecords(ctx.token, ctx.appToken, ctx.assetTableId, { fieldNames });
  const assets = records
    .map((record) => {
      const recordId = record.record_id || record.id || "";
      if (!recordId) return null;
      return assetFromFields(ctx, recordId, record.fields ?? {});
    })
    .filter((asset): asset is HandoverAsset => Boolean(asset))
    .sort((a, b) => a.name.localeCompare(b.name));

  const assetNames = new Map(assets.map((asset) => [asset.recordId, asset.name]));
  const [{ people, peopleLimited, peopleHint }, recent] = await Promise.all([
    listPeople(ctx, assets),
    listRecent(ctx, assetNames),
  ]);

  return {
    mode: "lark",
    tableName: "Asset Register",
    transactionTableName: ctx.txnTableName,
    assets,
    people,
    recent,
    options: ctx.options,
    peopleLimited,
    peopleHint,
  };
}

export async function getHandoverDesk(): Promise<HandoverPayload> {
  if (deskCache && Date.now() - deskCache.at < TTL_MS) return deskCache.data;

  if (!(await isLarkConfigured())) {
    const data: HandoverPayload = {
      mode: "demo",
      tableName: "Asset Register",
      transactionTableName: "Transaction Log",
      assets: listMockHandoverAssets(),
      people: listMockPeople(),
      recent: listMockRecentHandovers(),
      options: DEMO_HANDOVER_OPTIONS,
      peopleLimited: false,
      warning:
        "Demo mode is on because no Lark Base is connected yet. Handovers stay on this server until you connect Setup.",
    };
    deskCache = { at: Date.now(), data };
    return data;
  }

  const data = await listLarkDesk();
  deskCache = { at: Date.now(), data };
  return data;
}

export async function lookupHandoverAsset(rawSerial: string): Promise<HandoverAsset> {
  const serial = sanitizeSerial(rawSerial);
  if (!looksLikeSerial(serial)) throw new Error("That does not look like a serial number.");
  const desk = await getHandoverDesk();
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

async function submitLarkHandover(input: HandoverSubmitInput): Promise<HandoverResult> {
  validateHandoverInput(input);
  const ctx = await resolveHandoverContext();
  const record = await getTableRecord(ctx.token, ctx.appToken, ctx.assetTableId, input.assetRecordId);
  if (!record) throw new Error("That asset was not found in the Asset Register.");
  const asset = assetFromFields(ctx, input.assetRecordId, record.fields ?? {});
  if (asset.blockedReason) throw new Error(asset.blockedReason);
  if (asset.assigneeId && asset.assigneeId === input.staffId) {
    throw new Error(`${asset.name} is already assigned to ${asset.assigneeName}.`);
  }

  const desk = await getHandoverDesk();
  const staff = desk.people.find((person) => person.id === input.staffId);
  if (!staff) throw new Error("That person is not in the directory. Refresh and try again.");

  const nextStatus = nextAssetStatus(input.assignmentType);
  const transactionType = nextTransactionType(asset.assigneeId, input.assignmentType);
  const when = dateToMillis(input.handoverDate);
  const returnAt = input.expectedReturnDate ? dateToMillis(input.expectedReturnDate) : null;

  const txnFields: Record<string, unknown> = {
    [ctx.txnFields.type]: transactionType,
    [ctx.txnFields.asset]: linkField(asset.recordId),
    [ctx.txnFields.staff]: userField(staff.id),
    [ctx.txnFields.assignmentType]: input.assignmentType,
    [ctx.txnFields.location]: input.location,
  };
  if (ctx.txnFields.reason) txnFields[ctx.txnFields.reason] = input.reason;
  if (ctx.txnFields.requestDate) txnFields[ctx.txnFields.requestDate] = when;
  if (ctx.txnFields.effectiveDate) txnFields[ctx.txnFields.effectiveDate] = when;
  if (ctx.txnFields.expectedReturn && returnAt) txnFields[ctx.txnFields.expectedReturn] = returnAt;
  if (ctx.txnFields.approvalStatus) txnFields[ctx.txnFields.approvalStatus] = "Approved";
  if (ctx.txnFields.assignmentStatus) txnFields[ctx.txnFields.assignmentStatus] = "Active";
  if (ctx.txnFields.approvalDate) txnFields[ctx.txnFields.approvalDate] = when;
  if (ctx.txnFields.condition) txnFields[ctx.txnFields.condition] = input.condition;
  if (ctx.txnFields.remarks && input.remarks.trim()) txnFields[ctx.txnFields.remarks] = input.remarks.trim();

  const created = await createTableRecord(ctx.token, ctx.appToken, ctx.txnTableId, txnFields);

  const assetUpdate: Record<string, unknown> = {};
  if (ctx.assetFields.assignee) assetUpdate[ctx.assetFields.assignee] = userField(staff.id);
  if (ctx.assetFields.status) assetUpdate[ctx.assetFields.status] = nextStatus;
  if (ctx.assetFields.location) assetUpdate[ctx.assetFields.location] = input.location;
  if (ctx.assetFields.condition) assetUpdate[ctx.assetFields.condition] = input.condition;
  if (ctx.assetFields.email && staff.email) assetUpdate[ctx.assetFields.email] = staff.email;
  await updateTableRecord(ctx.token, ctx.appToken, ctx.assetTableId, asset.recordId, assetUpdate);

  const refreshed = await getTableRecord(ctx.token, ctx.appToken, ctx.assetTableId, asset.recordId);
  const updated = assetFromFields(ctx, asset.recordId, refreshed?.fields ?? { ...record.fields, ...assetUpdate });
  const createdFields = created?.fields ?? {};
  const transactionId = ctx.txnFields.id
    ? fieldToString(createdFields[ctx.txnFields.id])
    : created?.record_id || "saved";

  return {
    mode: "lark",
    summary: `Handed ${asset.name} to ${staff.name}.`,
    changes: describeHandoverChanges({
      assetName: asset.name,
      staffName: staff.name,
      previousAssignee: asset.assigneeName,
      nextStatus,
      location: input.location,
      condition: input.condition,
      transactionType,
      transactionId,
    }),
    transactionId,
    asset: updated,
  };
}

export async function submitHandover(input: HandoverSubmitInput): Promise<HandoverResult> {
  validateHandoverInput(input);
  const signed = await assertHandoverSignature(input);
  const signedNote = `Employee signature captured ${signed.signedAt} (${signed.staffName}).`;
  const nextInput: HandoverSubmitInput = {
    ...input,
    remarks: [input.remarks.trim(), signedNote].filter(Boolean).join("\n"),
  };

  if (!(await isLarkConfigured())) {
    const result = submitMockHandover(nextInput);
    invalidateHandoverCache();
    invalidateAssetsCache();
    return result;
  }

  const result = await submitLarkHandover(nextInput);
  invalidateHandoverCache();
  invalidateAssetsCache();
  return result;
}
