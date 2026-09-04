import type { MaintenanceAction, MaintenanceAdvanceDetails, MaintenanceJob } from "@/lib/types";

function typeKey(type: string) {
  return type.trim().toLowerCase();
}

export function isWorkshopJob(type: string) {
  const key = typeKey(type);
  return key === "repair" || key === "upgrade";
}

export function workshopNoun(type: string) {
  return typeKey(type) === "upgrade" ? "upgrade" : "repair";
}

export function maintenanceActionLabel(job: MaintenanceJob) {
  if (job.nextAction === "start") {
    if (typeKey(job.type) === "disposal") return "Start disposal";
    return typeKey(job.type) === "upgrade" ? "Send to upgrade" : "Send to repair";
  }
  if (job.nextAction === "complete") {
    if (typeKey(job.type) === "disposal") return "Mark disposal complete";
    return typeKey(job.type) === "upgrade" ? "Mark upgrade complete" : "Mark repair complete";
  }
  return "No action";
}

export function formatMaintenanceCost(cost: number) {
  return Number.isInteger(cost) ? String(cost) : cost.toFixed(2);
}

export function describeMaintenanceAdvance(
  job: MaintenanceJob,
  action: MaintenanceAction,
  details?: MaintenanceAdvanceDetails
): string[] {
  const vendor = details?.vendor?.trim() || "";
  const cost =
    typeof details?.cost === "number" && Number.isFinite(details.cost) ? details.cost : null;
  const result = details?.result?.trim() || "";

  if (action === "start") {
    const changes = [`${job.maintenanceId} status → In Progress`, "Start Date is set automatically"];
    if (isWorkshopJob(job.type)) {
      changes.push(`${job.assetId || job.assetName} current status → In Repair`);
      changes.push(vendor ? `Vendor / Technician → ${vendor}` : "Vendor / Technician (required)");
      changes.push(
        cost != null ? `Maintenance Cost → ${formatMaintenanceCost(cost)}` : "Maintenance Cost (required)"
      );
    }
    return changes;
  }

  const changes = [`${job.maintenanceId} status → Completed`, "Completion Date is set automatically"];
  if (isWorkshopJob(job.type)) {
    changes.push(
      result ? `Repair Result / Action Taken → ${result}` : "Repair Result / Action Taken (required)"
    );
    changes.push("Condition after maintenance → Good");
    changes.push(`${job.assetId || job.assetName} condition → Good`);
    changes.push(
      job.assignee
        ? `Current status stays Assigned (${job.assignee})`
        : "Current status → Available (no assignee)"
    );
  } else {
    changes.push("Asset stays on Disposal — condition is not reset to Good");
  }
  return changes;
}

export function previewMaintenanceChanges(
  job: MaintenanceJob,
  details?: MaintenanceAdvanceDetails
): string[] {
  if (!job.nextAction) return [];
  return describeMaintenanceAdvance(job, job.nextAction, details);
}

export function maintenanceSummary(job: MaintenanceJob, action: MaintenanceAction) {
  const noun = workshopNoun(job.type);
  if (action === "start") {
    return job.type === "Disposal"
      ? `Started disposal on ${job.assetName}.`
      : `Sent ${job.assetName} out for ${noun}.`;
  }
  if (job.type === "Disposal") {
    return `Marked disposal complete for ${job.assetName}.`;
  }
  return job.assignee
    ? `${noun[0].toUpperCase()}${noun.slice(1)} complete on ${job.assetName}. Condition is Good and it stays Assigned to ${job.assignee}.`
    : `${noun[0].toUpperCase()}${noun.slice(1)} complete on ${job.assetName}. Condition is Good and it is Available.`;
}
