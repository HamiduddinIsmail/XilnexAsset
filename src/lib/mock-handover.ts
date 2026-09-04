import { getMockAsset, listMockAssets, updateMockAssignment } from "@/lib/mock-assets";
import { normalizeKey } from "@/lib/field-value";
import {
  blockedHandoverReason,
  describeHandoverChanges,
  nextAssetStatus,
  nextTransactionType,
  toHandoverAsset,
} from "@/lib/handover-shared";
import type {
  HandoverAsset,
  HandoverOptions,
  HandoverPerson,
  HandoverResult,
  HandoverSubmitInput,
  HandoverTransaction,
} from "@/lib/types";

const PEOPLE: HandoverPerson[] = [
  {
    id: "ou-demo-hamid",
    name: "HAMID",
    email: "m.hamiduddin@xilnex.com",
    avatarUrl: "",
  },
  {
    id: "ou-demo-alex",
    name: "Alex Tan",
    email: "alex.tan@xilnex.com",
    avatarUrl: "",
  },
  {
    id: "ou-demo-priya",
    name: "Priya Nair",
    email: "priya.nair@xilnex.com",
    avatarUrl: "",
  },
  {
    id: "ou-demo-wei",
    name: "Wei Ming",
    email: "wei.ming@xilnex.com",
    avatarUrl: "",
  },
];

export const DEMO_HANDOVER_OPTIONS: HandoverOptions = {
  locations: ["Penang HQ", "KL Office", "Vietnam", "Philippines", "Cambodia"],
  assignmentTypes: ["Permanent", "Temporary"],
  reasons: ["New Joiner", "Replacement", "Project Requirement"],
  conditions: ["New", "Good", "Fair"],
};

type Store = { transactions: HandoverTransaction[]; nextId: number };

const globalStore = globalThis as typeof globalThis & {
  __handoverStore?: Store;
};

function store(): Store {
  if (!globalStore.__handoverStore) {
    globalStore.__handoverStore = {
      nextId: 12,
      transactions: [
        {
          recordId: "txn-demo-001",
          transactionId: "TXN-00009",
          type: "Handover",
          assetName: "Lenovo ThinkPad X1 Carbon — Sales",
          staffName: "Alex Tan",
          location: "Penang HQ",
          assignmentType: "Permanent",
          status: "Active",
          effectiveDate: "2026-08-12",
        },
      ],
    };
  }
  return globalStore.__handoverStore;
}

function personById(id: string) {
  return PEOPLE.find((person) => person.id === id) ?? null;
}

function personByName(name: string) {
  const key = normalizeKey(name);
  return PEOPLE.find((person) => normalizeKey(person.name) === key) ?? null;
}

export function listMockPeople(): HandoverPerson[] {
  return PEOPLE.map((person) => ({ ...person }));
}

export function listMockHandoverAssets(): HandoverAsset[] {
  return listMockAssets().map((asset) => {
    const holder = personByName(asset.extra["Current Assignee"] ?? "");
    return toHandoverAsset({
      recordId: asset.recordId,
      assetId: asset.extra["Asset Tag"] ?? "",
      name: asset.name,
      serialNumber: asset.serialNumber,
      currentStatus: asset.extra["Current Status"] ?? "Available",
      location: asset.extra.Location ?? "",
      condition: asset.extra["Asset Condition"] ?? "",
      assigneeId: holder?.id ?? "",
      assigneeName: holder?.name || asset.extra["Current Assignee"] || "",
      assigneeEmail: holder?.email ?? "",
    });
  });
}

export function listMockRecentHandovers(): HandoverTransaction[] {
  return store().transactions.map((item) => ({ ...item }));
}

export function submitMockHandover(input: HandoverSubmitInput): HandoverResult {
  const staff = personById(input.staffId);
  if (!staff) throw new Error("Pick who to hand the asset over to.");

  const raw = getMockAsset(input.assetRecordId);
  const blocked = blockedHandoverReason(raw.extra["Current Status"] ?? "");
  if (blocked) throw new Error(blocked);

  const currentHolder = personByName(raw.extra["Current Assignee"] ?? "");
  if (currentHolder?.id === staff.id) {
    throw new Error(`${raw.name} is already assigned to ${staff.name}.`);
  }

  const nextStatus = nextAssetStatus(input.assignmentType);
  const type = nextTransactionType(currentHolder?.id ?? "", input.assignmentType);
  updateMockAssignment(input.assetRecordId, {
    assigneeName: staff.name,
    status: nextStatus,
    location: input.location,
    condition: input.condition,
  });

  const txn = store();
  const transactionId = `TXN-${String(txn.nextId).padStart(5, "0")}`;
  txn.nextId += 1;
  txn.transactions.unshift({
    recordId: `txn-demo-${transactionId}`,
    transactionId,
    type,
    assetName: raw.name,
    staffName: staff.name,
    location: input.location,
    assignmentType: input.assignmentType,
    status: "Active",
    effectiveDate: input.handoverDate,
  });

  const asset = listMockHandoverAssets().find((item) => item.recordId === input.assetRecordId);
  if (!asset) throw new Error("Asset not found after handover.");

  return {
    mode: "demo",
    summary: `Handed ${raw.name} to ${staff.name}.`,
    changes: describeHandoverChanges({
      assetName: raw.name,
      assetId: raw.extra["Asset Tag"] ?? "",
      staffName: staff.name,
      previousAssignee: currentHolder?.name ?? "",
      nextStatus,
      location: input.location,
      condition: input.condition,
      transactionType: type,
      transactionId,
    }),
    transactionId,
    asset,
  };
}
