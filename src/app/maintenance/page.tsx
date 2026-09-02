import { MaintenanceDesk } from "@/components/maintenance-desk";
import { requirePageSession } from "@/lib/guard";
import { getMaintenanceJobs } from "@/lib/maintenance";

export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  await requirePageSession();
  let initialPayload = null;
  let initialError: string | null = null;

  try {
    initialPayload = await getMaintenanceJobs();
  } catch (error) {
    initialError = error instanceof Error ? error.message : "Could not load the Maintenance Log.";
  }

  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <MaintenanceDesk initialPayload={initialPayload} initialError={initialError} />
    </div>
  );
}
