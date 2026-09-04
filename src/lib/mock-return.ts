import { getMockAsset, updateMockAssignment } from "@/lib/mock-assets";
import { DEMO_HANDOVER_OPTIONS, listMockHandoverAssets } from "@/lib/mock-handover";
import { createMockMaintenanceJob } from "@/lib/mock-maintenance";
import {
  DEMO_RETURN_CONDITIONS,
  DEMO_RETURN_REASONS,
  describeReturnChanges,
  keepsAssignee,
  maintenanceIssueForReturn,
  maintenanceTypeForReturn,
  needsMaintenanceJob,
  nextStatusAfterReturn,
  toReturnAsset,
  validateReturnInput,
} from "@/lib/return-shared";
import type { HandoverTransaction, ReturnResult, ReturnSubmitInput } from "@/lib/types";

type Store = { transactions: HandoverTransaction[]; nextId: number };

const globalStore = globalThis as typeof globalThis & {
  __returnStore?: Store;
};

function store(): Store {
  if (!globalStore.__returnStore) {
    globalStore.__returnStore = {
      nextId: 14,
      transactions: [
        {
          recordId: "txn-return-001",
          transactionId: "TXN-00013",
          type: "Return",
          assetName: "iPad Pro 11 — Field Sales",
          staffName: "Priya Nair",
          location: "Penang HQ",
          assignmentType: "",
          status: "Returned",
          effectiveDate: "2026-08-28",
        },
      ],
    };
  }
  return globalStore.__returnStore;
}

export const DEMO_RETURN_OPTIONS = {
  locations: DEMO_HANDOVER_OPTIONS.locations,
  reasons: DEMO_RETURN_REASONS,
  conditions: DEMO_RETURN_CONDITIONS,
};

export function listMockReturnAssets() {
  return listMockHandoverAssets().map(toReturnAsset);
}

export function listMockRecentReturns(): HandoverTransaction[] {
  return store().transactions.map((item) => ({ ...item }));
}

export function submitMockReturn(input: ReturnSubmitInput): ReturnResult {
  validateReturnInput(input);
  const transactionIds: string[] = [];
  const maintenanceIds: string[] = [];
  const changes: string[] = [];
  const names: string[] = [];

  for (const item of input.items) {
    const raw = getMockAsset(item.assetRecordId);
    const asset = listMockReturnAssets().find((row) => row.recordId === item.assetRecordId);
    if (!asset) throw new Error("Asset not found in the demo Asset Register.");
    if (asset.blockedReason) throw new Error(asset.blockedReason);

    const nextStatus = nextStatusAfterReturn(item.reason, item.condition);
    const keepHolder = keepsAssignee(item.reason);
    const openMaintenance = needsMaintenanceJob(item.reason, item.condition);
    const maintenanceType = maintenanceTypeForReturn(item.reason);
    const condition = item.condition === "Missing" ? raw.extra["Asset Condition"] || "Good" : item.condition;
    updateMockAssignment(item.assetRecordId, {
      assigneeName: keepHolder ? asset.assigneeName : "",
      status: nextStatus,
      location: input.location,
      condition,
    });

    const txn = store();
    const transactionId = `TXN-${String(txn.nextId).padStart(5, "0")}`;
    txn.nextId += 1;
    txn.transactions.unshift({
      recordId: `txn-return-${transactionId}`,
      transactionId,
      type: "Return",
      assetName: raw.name,
      staffName: asset.assigneeName,
      location: input.location,
      assignmentType: "",
      status: "Returned",
      effectiveDate: input.returnDate,
    });
    transactionIds.push(transactionId);
    names.push(raw.name);

    let maintenanceId = "";
    if (openMaintenance) {
      const job = createMockMaintenanceJob({
        assetRecordId: item.assetRecordId,
        assetName: raw.name,
        type: maintenanceType,
        issue: maintenanceIssueForReturn(item.reason, item.condition, input.remarks),
        priority: item.condition === "Damaged" ? "High" : "Medium",
        assigneeName: keepHolder ? asset.assigneeName : "",
      });
      maintenanceId = job.maintenanceId;
      maintenanceIds.push(job.maintenanceId);
    }

    changes.push(
      ...describeReturnChanges({
        assetName: raw.name,
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
      })
    );
    if (maintenanceId) changes.push(`Maintenance ${maintenanceId} opened`);
  }

  const assets = listMockReturnAssets().filter((asset) =>
    input.items.some((item) => item.assetRecordId === asset.recordId)
  );

  return {
    mode: "demo",
    summary:
      names.length === 1
        ? `Returned ${names[0]}.`
        : `Returned ${names.length} assets.`,
    changes,
    transactionIds,
    maintenanceIds,
    assets,
  };
}
