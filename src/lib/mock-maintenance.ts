import type { MaintenanceAction, MaintenanceJob } from "@/lib/types";

type Store = { jobs: MaintenanceJob[] };

const globalStore = globalThis as typeof globalThis & {
  __maintenanceStore?: Store;
};

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

export function listMockMaintenanceJobs(): MaintenanceJob[] {
  return store().jobs.map((job) => withNext({ ...job }));
}

export function advanceMockMaintenance(recordId: string) {
  const job = store().jobs.find((item) => item.recordId === recordId);
  if (!job) throw new Error("Maintenance job not found in demo data.");
  const action: MaintenanceAction | null =
    job.status === "Open" ? "start" : job.status === "In Progress" ? "complete" : null;
  if (!action) {
    throw new Error(`${job.maintenanceId} is ${job.status} and cannot be advanced from this desk.`);
  }

  if (action === "start") {
    job.status = "In Progress";
    if (job.type === "Repair") job.currentStatus = "In Repair";
  } else {
    job.status = "Completed";
    if (job.type === "Repair") {
      job.assetCondition = "Good";
      job.currentStatus = job.assignee ? "Assigned" : "Available";
    }
  }

  return { action, job: withNext({ ...job }) };
}
