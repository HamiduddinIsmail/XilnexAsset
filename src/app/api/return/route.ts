import { requireApiSession } from "@/lib/guard";
import { getReturnDesk, invalidateReturnCache, submitReturn } from "@/lib/return";
import type { ReturnSubmitInput } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;
  try {
    const fresh = new URL(request.url).searchParams.get("fresh");
    if (fresh) invalidateReturnCache();
    const payload = await getReturnDesk();
    return Response.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load return desk";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;
  try {
    const body = (await request.json()) as ReturnSubmitInput;
    const result = await submitReturn(body);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to complete return";
    const status =
      message.includes("Pick") ||
      message.includes("blocked") ||
      message.includes("already") ||
      message.includes("acknowledgement") ||
      message.includes("Scan or add") ||
      message.includes("twice") ||
      message.includes("missing")
        ? 400
        : 500;
    return Response.json({ error: message }, { status });
  }
}
