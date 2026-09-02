import { requireApiSession } from "@/lib/guard";
import { changePin } from "@/lib/lock";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;
  try {
    const body = (await request.json()) as { currentPin?: string; newPin?: string; confirmPin?: string };
    const next = body.newPin?.trim() ?? "";
    if (next !== (body.confirmPin?.trim() ?? "")) {
      throw new Error("The two new PINs did not match.");
    }
    await changePin(body.currentPin?.trim() ?? "", next);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not change PIN.";
    return Response.json({ error: message }, { status: 400 });
  }
}
