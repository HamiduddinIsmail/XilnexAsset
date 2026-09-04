import { getHandoverSignPublic, saveHandoverSignature } from "@/lib/handover-sign";

export const dynamic = "force-dynamic";

function notFound() {
  return Response.json({ error: "This signing link is invalid or has expired." }, { status: 404 });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const session = await getHandoverSignPublic(token, true);
  if (!session) return notFound();
  return Response.json(session);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  try {
    const body = (await request.json()) as { signature?: string };
    const session = await saveHandoverSignature(token, body.signature?.trim() ?? "");
    return Response.json(session);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save that signature.";
    const status = message.includes("not found") || message.includes("expired") ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}
