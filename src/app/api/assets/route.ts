import { getAssets } from "@/lib/assets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await getAssets();
    return Response.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load assets";
    return Response.json({ error: message }, { status: 500 });
  }
}
