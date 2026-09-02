import type { MaintenanceAction, MaintenanceJob } from "@/lib/types";

export function describeMaintenanceAdvance(job: MaintenanceJob, action: MaintenanceAction): string[] {
  if (action === "start") {
    const changes = [`${job.maintenanceId} status → In Progress`];
    if (job.type === "Repair") changes.push(`${job.assetId || job.assetName} current status → In Repair`);
    return changes;
  }

  const changes = [`${job.maintenanceId} status → Completed`];
  if (job.type === "Repair") {
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

export function previewMaintenanceChanges(job: MaintenanceJob): string[] {
  if (!job.nextAction) return [];
  return describeMaintenanceAdvance(job, job.nextAction);
}

export function maintenanceSummary(job: MaintenanceJob, action: MaintenanceAction) {
  if (action === "start") {
    return job.type === "Disposal"
      ? `Started disposal on ${job.assetName}.`
      : `Sent ${job.assetName} to repair.`;
  }
  if (job.type === "Disposal") {
    return `Marked disposal complete for ${job.assetName}.`;
  }
  return job.assignee
    ? `Repair complete on ${job.assetName}. Condition is Good and it stays Assigned to ${job.assignee}.`
    : `Repair complete on ${job.assetName}. Condition is Good and it is Available.`;
}
