import { requireApiSession } from "@/lib/guard";
import { getHandoverDesk } from "@/lib/handover";
import { createHandoverSignSession } from "@/lib/handover-sign";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;

  try {
    const body = (await request.json()) as { assetRecordIds?: string[]; staffId?: string };
    const assetRecordIds = [...new Set((body.assetRecordIds ?? []).filter(Boolean))];
    if (!assetRecordIds.length) throw new Error("Add at least one asset first.");
    if (!body.staffId) throw new Error("Pick who receives the assets first.");

    const desk = await getHandoverDesk();
    const staff = desk.people.find((person) => person.id === body.staffId);
    if (!staff) throw new Error("That person is not in the directory. Refresh and try again.");

    const assets = assetRecordIds.map((recordId) => {
      const asset = desk.assets.find((item) => item.recordId === recordId);
      if (!asset) throw new Error("An asset in the list is not in the register.");
      if (asset.blockedReason) throw new Error(asset.blockedReason);
      if (asset.assigneeId && asset.assigneeId === staff.id) {
        throw new Error(`${asset.name} is already assigned to ${staff.name}.`);
      }
      return {
        recordId: asset.recordId,
        name: asset.name,
        assetId: asset.assetId,
        serialNumber: asset.serialNumber,
      };
    });

    const session = await createHandoverSignSession({
      assets,
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
