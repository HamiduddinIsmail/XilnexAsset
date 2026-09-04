import { requireApiSession } from "@/lib/guard";
import { advanceMaintenance, parseMaintenanceAdvanceDetails, previewChanges } from "@/lib/maintenance";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ recordId: string }> }
) {
  const denied = await requireApiSession();
  if (denied) return denied;
  try {
    const { recordId } = await context.params;
    const raw = await request.json().catch(() => ({}));
    const details = parseMaintenanceAdvanceDetails(raw);
    const result = await advanceMaintenance(recordId, details);
    return Response.json({
      ...result,
      changes: result.changes.length ? result.changes : previewChanges(result.job, details),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update that maintenance job.";
    return Response.json({ error: message }, { status: 400 });
  }
}
