import { requireApiSession } from "@/lib/guard";
import { getMaintenanceJobs, invalidateMaintenanceCache } from "@/lib/maintenance";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;
  try {
    const fresh = new URL(request.url).searchParams.get("fresh");
    if (fresh) invalidateMaintenanceCache();
    const payload = await getMaintenanceJobs();
    return Response.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load maintenance jobs";
    return Response.json({ error: message }, { status: 500 });
  }
}
