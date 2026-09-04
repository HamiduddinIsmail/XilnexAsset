import { MaintenanceDesk } from "@/components/maintenance-desk";
import { requirePageSession } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  await requirePageSession();
  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <MaintenanceDesk />
    </div>
  );
}
