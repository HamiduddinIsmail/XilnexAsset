import { requireApiSession } from "@/lib/guard";
import { getHandoverDesk, invalidateHandoverCache, submitHandover } from "@/lib/handover";
import type { HandoverSubmitInput } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;
  try {
    const fresh = new URL(request.url).searchParams.get("fresh");
    if (fresh) invalidateHandoverCache();
    const payload = await getHandoverDesk();
    return Response.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load handover desk";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;
  try {
    const body = (await request.json()) as HandoverSubmitInput;
    const result = await submitHandover(body);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to complete handover";
    const status =
      message.includes("Pick") ||
      message.includes("blocked") ||
      message.includes("already assigned") ||
      message.includes("acknowledgement") ||
      message.includes("must sign") ||
      message.includes("signature") ||
      message.includes("Scan or select") ||
      message.includes("need an expected")
        ? 400
        : 500;
    return Response.json({ error: message }, { status });
  }
}
