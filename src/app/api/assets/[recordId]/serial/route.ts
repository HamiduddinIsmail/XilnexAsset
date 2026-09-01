import { submitSerial } from "@/lib/assets";

export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  context: { params: Promise<{ recordId: string }> }
) {
  try {
    const { recordId } = await context.params;
    const body = (await request.json()) as { serialNumber?: string };
    const result = await submitSerial(recordId, body.serialNumber ?? "");
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update serial number";
    const status = message.includes("already on") || message.includes("does not look")
      ? 400
      : 500;
    return Response.json({ error: message }, { status });
  }
}
