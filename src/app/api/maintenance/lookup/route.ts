import { lookupMaintenanceJob, previewChanges } from "@/lib/maintenance";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { serial?: string };
    const job = await lookupMaintenanceJob(body.serial ?? "");
    return Response.json({ job, changes: previewChanges(job) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not match that serial.";
    return Response.json({ error: message }, { status: 400 });
  }
}
