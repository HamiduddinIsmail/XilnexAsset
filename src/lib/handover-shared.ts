import { normalizeKey } from "@/lib/field-value";
import type { HandoverAsset, HandoverSubmitInput } from "@/lib/types";

const BLOCKED = new Set(["disposal", "missing", "in repair", "spoiled", "trade in"]);

export function blockedHandoverReason(status: string): string | null {
  const key = normalizeKey(status);
  if (!key) return null;
  if (key === "disposal") return "This asset is marked for disposal and cannot be handed over.";
  if (key === "missing") return "This asset is missing. Find it before handing it over.";
  if (key === "in repair") return "This asset is in repair. Finish maintenance before handing it over.";
  if (key === "spoiled") return "This asset is spoiled and cannot be handed over.";
  if (key === "trade in") return "This asset is on trade-in and cannot be handed over.";
  return BLOCKED.has(key) ? `Current status is ${status}, so handover is blocked.` : null;
}

export function toHandoverAsset(input: Omit<HandoverAsset, "blockedReason">): HandoverAsset {
  return {
    ...input,
    blockedReason: blockedHandoverReason(input.currentStatus),
  };
}

export function needsReturnDate(assignmentType: string) {
  const key = normalizeKey(assignmentType);
  return key === "temporary" || key === "project";
}

export function dateToMillis(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) throw new Error("Use a date in YYYY-MM-DD format.");
  const millis = Date.parse(`${match[1]}-${match[2]}-${match[3]}T12:00:00`);
  if (Number.isNaN(millis)) throw new Error("That date is not valid.");
  return millis;
}

export function millisToDate(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function nextAssetStatus(assignmentType: string) {
  return needsReturnDate(assignmentType) ? "Loan" : "Assigned";
}

export function nextTransactionType(currentAssigneeId: string, assignmentType: string) {
  if (currentAssigneeId) return "Transfer";
  if (needsReturnDate(assignmentType)) return "Loan";
  return "Handover";
}

export function validateHandoverInput(input: HandoverSubmitInput) {
  if (!input.assetRecordId) throw new Error("Scan or select the asset first.");
  if (!input.staffId) throw new Error("Pick who to hand the asset over to.");
  if (!input.location) throw new Error("Pick a location.");
  if (!input.assignmentType) throw new Error("Pick an assignment type.");
  if (!input.reason) throw new Error("Pick a reason.");
  if (!input.condition) throw new Error("Pick the condition on handover.");
  if (!input.handoverDate) throw new Error("Pick the handover date.");
  dateToMillis(input.handoverDate);
  if (needsReturnDate(input.assignmentType)) {
    if (!input.expectedReturnDate) {
      throw new Error("Temporary and project assignments need an expected return date.");
    }
    dateToMillis(input.expectedReturnDate);
  }
  if (!input.signatureToken || !input.acknowledged) {
    throw new Error("The employee must sign before you can complete this handover.");
  }
}

export function userField(id: string) {
  return [{ id }];
}

export function linkField(recordId: string) {
  return [recordId];
}

export const HANDOVER_REASON_CHOICES = ["New Joiner", "Replacement", "Project Requirement"];
export const HANDOVER_CONDITION_CHOICES = ["New", "Good", "Fair"];
export const HANDOVER_ASSIGNMENT_TYPE_CHOICES = ["Permanent", "Temporary"];

function pickListed(all: string[], wanted: string[]) {
  const byKey = new Map(all.map((item) => [normalizeKey(item), item]));
  const hit = wanted
    .map((label) => byKey.get(normalizeKey(label)))
    .filter((item): item is string => Boolean(item));
  return hit.length ? hit : wanted;
}

export function pickHandoverReasons(all: string[]) {
  return pickListed(all, HANDOVER_REASON_CHOICES);
}

export function pickHandoverConditions(all: string[]) {
  return pickListed(all, HANDOVER_CONDITION_CHOICES);
}

export function pickHandoverAssignmentTypes(all: string[]) {
  return pickListed(all, HANDOVER_ASSIGNMENT_TYPE_CHOICES);
}

export function handoverAssetLabel(assetId: string, name: string) {
  const id = assetId.trim();
  return id ? `${id} · ${name}` : name;
}

export function describeHandoverChanges(input: {
  assetName: string;
  assetId?: string;
  staffName: string;
  previousAssignee: string;
  nextStatus: string;
  location: string;
  condition: string;
  transactionType: string;
  transactionId: string;
}) {
  const asset = handoverAssetLabel(input.assetId ?? "", input.assetName);
  const changes = [
    input.previousAssignee
      ? `${asset} moves from ${input.previousAssignee} to ${input.staffName}`
      : `${asset} → ${input.staffName}`,
    `Current status → ${input.nextStatus}`,
    `Location → ${input.location}`,
    `Condition on handover → ${input.condition}`,
    `Transaction Log ${input.transactionId || "(new)"} · ${input.transactionType}, Approved`,
    "Handed over by Admin team",
  ];
  return changes;
}
