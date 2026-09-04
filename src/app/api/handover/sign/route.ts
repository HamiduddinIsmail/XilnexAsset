import { requireApiSession } from "@/lib/guard";
import { getHandoverDesk } from "@/lib/handover";
import { createHandoverSignSession } from "@/lib/handover-sign";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;

  try {
    const body = (await request.json()) as { assetRecordId?: string; staffId?: string };
    if (!body.assetRecordId) throw new Error("Select the asset first.");
    if (!body.staffId) throw new Error("Pick who receives the asset first.");

    const desk = await getHandoverDesk();
    const asset = desk.assets.find((item) => item.recordId === body.assetRecordId);
    if (!asset) throw new Error("That asset is not in the register.");
    if (asset.blockedReason) throw new Error(asset.blockedReason);
    const staff = desk.people.find((person) => person.id === body.staffId);
    if (!staff) throw new Error("That person is not in the directory. Refresh and try again.");

    const session = await createHandoverSignSession({
      assetRecordId: asset.recordId,
      assetName: asset.name,
      assetId: asset.assetId,
      serialNumber: asset.serialNumber,
      staffId: staff.id,
      staffName: staff.name,
      staffEmail: staff.email,
    });

    return Response.json({
      ...session,
      signPath: `/sign/${session.token}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start signing.";
    return Response.json({ error: message }, { status: 400 });
  }
}
