import { getAssets, invalidateAssetsCache } from "@/lib/assets";
import { requireApiSession } from "@/lib/guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;
  try {
    const fresh = new URL(request.url).searchParams.get("fresh");
    if (fresh) invalidateAssetsCache();
    const payload = await getAssets();
    return Response.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load assets";
    return Response.json({ error: message }, { status: 500 });
  }
}
