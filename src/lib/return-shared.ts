import { normalizeKey } from "@/lib/field-value";
import { dateToMillis } from "@/lib/handover-shared";
import type { HandoverAsset, ReturnSubmitInput } from "@/lib/types";

export const DEMO_RETURN_REASONS = [
  "Asset Return",
  "Return for Repair",
  "Staff Transfer",
  "Replacement",
  "Other",
];

export const DEMO_RETURN_CONDITIONS = ["Good", "Fair", "Damaged", "Faulty", "Missing"];

export function blockedReturnReason(status: string, assigneeId: string): string | null {
  const key = normalizeKey(status);
  if (key === "assigned" || key === "loan") return null;
  if (key === "available") return "This asset is already in stock. Nothing to return.";
  if (key === "reserved") return "This asset is reserved, not out with someone.";
  if (key === "in repair") return "This asset is already in repair.";
  if (key === "disposal") return "This asset is marked for disposal.";
  if (key === "missing") return "This asset is already marked missing.";
  if (key === "spoiled" || key === "trade in") {
    return `Current status is ${status}, so it cannot be returned here.`;
  }
  if (!assigneeId) return "No one holds this asset, so there is nothing to return.";
  return `Current status is ${status || "unknown"}, so it cannot be returned here.`;
}

export function toReturnAsset(asset: HandoverAsset): HandoverAsset {
  return {
    ...asset,
    blockedReason: blockedReturnReason(asset.currentStatus, asset.assigneeId),
  };
}

export function pickReturnReasons(all: string[]) {
  const hit = DEMO_RETURN_REASONS.filter((reason) => all.includes(reason));
  return hit.length ? hit : all.length ? all : DEMO_RETURN_REASONS;
}

export function pickReturnConditions(all: string[]) {
  return all.length ? all : DEMO_RETURN_CONDITIONS;
}

export function nextStatusAfterReturn(reason: string, condition: string) {
  if (normalizeKey(condition) === "missing") return "Missing";
  if (normalizeKey(reason) === "return for repair") return "In Repair";
  return "Available";
}

export function assetConditionAfterReturn(condition: string) {
  const key = normalizeKey(condition);
  if (key === "missing") return null;
  return condition;
}

export function validateReturnInput(input: ReturnSubmitInput) {
  if (!input.items.length) throw new Error("Scan or add at least one asset to return.");
  const seen = new Set<string>();
  for (const item of input.items) {
    if (!item.assetRecordId) throw new Error("A return line is missing its asset.");
    if (seen.has(item.assetRecordId)) throw new Error("The same asset was added twice.");
    seen.add(item.assetRecordId);
    if (!item.reason) throw new Error("Pick a return reason for each asset.");
    if (!item.condition) throw new Error("Pick the condition on return for each asset.");
  }
  if (!input.location) throw new Error("Pick a return location.");
  if (!input.returnDate) throw new Error("Pick the return date.");
  dateToMillis(input.returnDate);
  if (!input.acknowledged) {
    throw new Error("Tick the acknowledgement before completing the return.");
  }
}

export function describeReturnChanges(input: {
  assetName: string;
  previousAssignee: string;
  nextStatus: string;
  location: string;
  condition: string;
  reason: string;
  transactionId: string;
}) {
  return [
    input.previousAssignee
      ? `${input.assetName} returned by ${input.previousAssignee}`
      : `${input.assetName} returned`,
    `Current status → ${input.nextStatus}`,
    `Location → ${input.location}`,
    `Condition on return → ${input.condition}`,
    `Reason · ${input.reason}`,
    `Transaction Log ${input.transactionId || "(new)"} · Return, Returned`,
    "Received by Admin team",
  ];
}

export function defaultReturnCondition(asset: HandoverAsset, options: string[]) {
  if (asset.condition && options.includes(asset.condition)) return asset.condition;
  if (options.includes("Good")) return "Good";
  return options[0] ?? "Good";
}

export function defaultReturnReason(options: string[]) {
  if (options.includes("Asset Return")) return "Asset Return";
  return options[0] ?? "Asset Return";
}

export type ReturnHolder = {
  key: string;
  id: string;
  name: string;
  email: string;
  outCount: number;
  totalCount: number;
};

export function holderKeyForAsset(asset: HandoverAsset) {
  if (asset.assigneeId) return `id:${asset.assigneeId}`;
  const name = asset.assigneeName.trim();
  return name ? `name:${normalizeKey(name)}` : "";
}

export function listReturnHolders(assets: HandoverAsset[]): ReturnHolder[] {
  const map = new Map<string, ReturnHolder>();
  for (const asset of assets) {
    const key = holderKeyForAsset(asset);
    if (!key) continue;
    const existing = map.get(key);
    const out = !asset.blockedReason;
    if (existing) {
      existing.totalCount += 1;
      if (out) existing.outCount += 1;
      if (!existing.email && asset.assigneeEmail) existing.email = asset.assigneeEmail;
      if (!existing.id && asset.assigneeId) existing.id = asset.assigneeId;
    } else {
      map.set(key, {
        key,
        id: asset.assigneeId,
        name: asset.assigneeName.trim() || "Unknown staff",
        email: asset.assigneeEmail,
        outCount: out ? 1 : 0,
        totalCount: 1,
      });
    }
  }
  return [...map.values()].sort((left, right) => {
    if (right.outCount !== left.outCount) return right.outCount - left.outCount;
    return left.name.localeCompare(right.name);
  });
}
