import { requireApiSession } from "@/lib/guard";
import { lookupReturnAsset } from "@/lib/return";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;
  try {
    const body = (await request.json()) as { serial?: string };
    const asset = await lookupReturnAsset(body.serial ?? "");
    return Response.json({ asset });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to match that serial";
    const status =
      message.includes("does not look") ||
      message.includes("No asset") ||
      message.includes("cannot") ||
      message.includes("already")
        ? 400
        : 500;
    return Response.json({ error: message }, { status });
  }
}
