import type { MaintenanceAction, MaintenanceAdvanceDetails, MaintenanceJob } from "@/lib/types";

function typeKey(type: string) {
  return type.trim().toLowerCase();
}

export function isWorkshopJob(type: string) {
  const key = typeKey(type);
  return key === "repair" || key === "upgrade";
}

export const CONDITION_AFTER_CHOICES = ["Good", "Fair", "Damaged"];

export function workshopNoun(type: string) {
  return typeKey(type) === "upgrade" ? "upgrade" : "repair";
}

export function maintenanceActionLabel(job: MaintenanceJob) {
  if (job.nextAction === "start") {
    if (typeKey(job.type) === "disposal") return "Start Disposal";
    return typeKey(job.type) === "upgrade" ? "Send to Upgrade" : "Send to Repair";
  }
  if (job.nextAction === "complete") {
    if (typeKey(job.type) === "disposal") return "Mark Disposal Complete";
    return typeKey(job.type) === "upgrade" ? "Mark Upgrade Complete" : "Mark Repair Complete";
  }
  return "No Action";
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
  const conditionAfter = details?.conditionAfter?.trim() || "";

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
    changes.push(
      conditionAfter
        ? `Asset Condition After Maintenance → ${conditionAfter}`
        : "Asset Condition After Maintenance (required)"
    );
    if (conditionAfter) {
      changes.push(`${job.assetId || job.assetName} condition → ${conditionAfter}`);
    }
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

export function maintenanceSummary(
  job: MaintenanceJob,
  action: MaintenanceAction,
  details?: MaintenanceAdvanceDetails
) {
  const noun = workshopNoun(job.type);
  if (action === "start") {
    return job.type === "Disposal"
      ? `Started disposal on ${job.assetName}.`
      : `Sent ${job.assetName} out for ${noun}.`;
  }
  if (job.type === "Disposal") {
    return `Marked disposal complete for ${job.assetName}.`;
  }
  const condition = details?.conditionAfter?.trim();
  const conditionText = condition ? `Condition is ${condition}` : "Condition is updated";
  return job.assignee
    ? `${noun[0].toUpperCase()}${noun.slice(1)} complete on ${job.assetName}. ${conditionText} and it stays Assigned to ${job.assignee}.`
    : `${noun[0].toUpperCase()}${noun.slice(1)} complete on ${job.assetName}. ${conditionText} and it is Available.`;
}
