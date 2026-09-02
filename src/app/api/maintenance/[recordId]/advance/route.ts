import { requireApiSession } from "@/lib/guard";
import { advanceMaintenance, previewChanges } from "@/lib/maintenance";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ recordId: string }> }
) {
  const denied = await requireApiSession();
  if (denied) return denied;
  try {
    const { recordId } = await context.params;
    const result = await advanceMaintenance(recordId);
    return Response.json({ ...result, changes: result.changes.length ? result.changes : previewChanges(result.job) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update that maintenance job.";
    return Response.json({ error: message }, { status: 400 });
  }
}
