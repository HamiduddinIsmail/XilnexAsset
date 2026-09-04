import { isWorkshopJob } from "@/lib/maintenance-copy";
import type { MaintenanceAction, MaintenanceAdvanceDetails, MaintenanceJob } from "@/lib/types";

type Store = { jobs: MaintenanceJob[] };

const globalStore = globalThis as typeof globalThis & {
  __maintenanceStore?: Store;
};

function emptyWorkshopFields() {
  return { vendor: "", cost: null as number | null, result: "" };
}

function seed(): MaintenanceJob[] {
  return [
    {
      recordId: "mnt-open-repair",
      maintenanceId: "MNT-00010",
      type: "Repair",
      status: "Open",
      priority: "Medium",
      issue: "Asset returned damaged and requires repair.",
      assetRecordId: "rec-laptop-7420",
      assetId: "IT-1042",
      assetName: "Dell Latitude 7420 — Finance",
      serialNumber: "",
      currentStatus: "In Repair",
      assetCondition: "Damaged",
      assignee: "",
      ...emptyWorkshopFields(),
      nextAction: "start",
    },
    {
      recordId: "mnt-open-upgrade",
      maintenanceId: "MNT-00012",
      type: "Upgrade",
      status: "Open",
      priority: "Medium",
      issue: "Returned for a RAM and SSD upgrade.",
      assetRecordId: "rec-matebook",
      assetId: "AST-00009",
      assetName: "Laptop - Huawei Matebook",
      serialNumber: "HW-MATE-1009",
      currentStatus: "In Repair",
      assetCondition: "Good",
      assignee: "Alex Tan",
      ...emptyWorkshopFields(),
      nextAction: "start",
    },
    {
      recordId: "mnt-open-disposal",
      maintenanceId: "MNT-00011",
      type: "Disposal",
      status: "Open",
      priority: "Low",
      issue: "Asset returned damaged and marked for disposal.",
      assetRecordId: "rec-elitedesk",
      assetId: "IT-2210",
      assetName: "HP EliteDesk 800 G6 — Accounts",
      serialNumber: "CND1234ABCDE",
      currentStatus: "Disposal",
      assetCondition: "Damaged",
      assignee: "Alex Tan",
      ...emptyWorkshopFields(),
      nextAction: "start",
    },
    {
      recordId: "mnt-progress-repair",
      maintenanceId: "MNT-00008",
      type: "Repair",
      status: "In Progress",
      priority: "High",
      issue: "Screen flicker after drop.",
      assetRecordId: "rec-thinkpad-x1",
      assetId: "IT-0881",
      assetName: "Lenovo ThinkPad X1 Carbon — Sales",
      serialNumber: "PF3K7L2",
      currentStatus: "In Repair",
      assetCondition: "Faulty",
      assignee: "",
      vendor: "TechFix KL",
      cost: 180,
      result: "",
      nextAction: "complete",
    },
  ];
}

function store(): Store {
  if (!globalStore.__maintenanceStore) {
    globalStore.__maintenanceStore = { jobs: seed() };
  }
  return globalStore.__maintenanceStore;
}

function withNext(job: MaintenanceJob): MaintenanceJob {
  const nextAction =
    job.status === "Open" ? "start" : job.status === "In Progress" ? "complete" : null;
  return { ...job, nextAction };
}

export function createMockMaintenanceJob(input: {
  assetRecordId: string;
  assetName: string;
  type: "Repair" | "Upgrade";
  issue: string;
  priority: string;
  assigneeName: string;
}) {
  const id = `MNT-${String(store().jobs.length + 20).padStart(5, "0")}`;
  const job: MaintenanceJob = {
    recordId: `mnt-demo-${id}`,
    maintenanceId: id,
    type: input.type,
    status: "Open",
    priority: input.priority,
    issue: input.issue,
    assetRecordId: input.assetRecordId,
    assetId: "",
    assetName: input.assetName,
    serialNumber: "",
    currentStatus: "In Repair",
    assetCondition: "Damaged",
    assignee: input.assigneeName,
    ...emptyWorkshopFields(),
    nextAction: "start",
  };
  store().jobs.unshift(job);
  return { maintenanceId: id, recordId: job.recordId };
}

export function listMockMaintenanceJobs(): MaintenanceJob[] {
  return store().jobs.map((job) => withNext({ ...job }));
}

function parseCost(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function advanceMockMaintenance(recordId: string, details: MaintenanceAdvanceDetails = {}) {
  const job = store().jobs.find((item) => item.recordId === recordId);
  if (!job) throw new Error("Maintenance job not found in demo data.");
  const action: MaintenanceAction | null =
    job.status === "Open" ? "start" : job.status === "In Progress" ? "complete" : null;
  if (!action) {
    throw new Error(`${job.maintenanceId} is ${job.status} and cannot be advanced from this desk.`);
  }

  const workshop = isWorkshopJob(job.type);
  if (action === "start" && workshop) {
    const vendor = details.vendor?.trim() ?? "";
    const cost = parseCost(details.cost);
    if (!vendor) throw new Error("Enter the vendor before sending this asset out.");
    if (cost == null) throw new Error("Enter the maintenance cost.");
    if (cost < 0) throw new Error("Maintenance cost cannot be negative.");
    job.vendor = vendor;
    job.cost = cost;
    job.status = "In Progress";
    job.currentStatus = "In Repair";
  } else if (action === "start") {
    job.status = "In Progress";
  } else if (workshop) {
    const result = details.result?.trim() ?? "";
    if (!result) {
      throw new Error("Enter the repair result / action taken before marking this complete.");
    }
    job.result = result;
    job.status = "Completed";
    job.assetCondition = "Good";
    job.currentStatus = job.assignee ? "Assigned" : "Available";
  } else {
    job.status = "Completed";
  }

  return { action, job: withNext({ ...job }) };
}
