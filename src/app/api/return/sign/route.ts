import { requireApiSession } from "@/lib/guard";
import { createHandoverSignSession } from "@/lib/handover-sign";
import { getReturnDesk } from "@/lib/return";
import { signerForReturnAssets } from "@/lib/return-shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;

  try {
    const body = (await request.json()) as { assetRecordIds?: string[] };
    const assetRecordIds = [...new Set((body.assetRecordIds ?? []).filter(Boolean))];
    if (!assetRecordIds.length) throw new Error("Add at least one asset first.");

    const desk = await getReturnDesk();
    const assets = assetRecordIds.map((recordId) => {
      const asset = desk.assets.find((item) => item.recordId === recordId);
      if (!asset) throw new Error("An asset in the list is not in the register.");
      if (asset.blockedReason) throw new Error(asset.blockedReason);
      return asset;
    });

    const signer = signerForReturnAssets(assets);
    if (!signer) {
      throw new Error("All assets in this return must belong to the same person before they sign.");
    }

    const session = await createHandoverSignSession({
      kind: "return",
      assets: assets.map((asset) => ({
        recordId: asset.recordId,
        name: asset.name,
        assetId: asset.assetId,
        serialNumber: asset.serialNumber,
      })),
      staffId: signer.staffId,
      staffName: signer.name,
      staffEmail: signer.email,
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
