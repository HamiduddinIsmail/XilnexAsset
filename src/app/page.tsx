import { AssetUpdater } from "@/components/asset-updater";
import { getAssets } from "@/lib/assets";
import { requirePageSession } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function Home() {
  await requirePageSession();
  let initialPayload = null;
  let initialError: string | null = null;

  try {
    initialPayload = await getAssets();
  } catch (error) {
    initialError = error instanceof Error ? error.message : "Could not load the Asset Register.";
  }

  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <AssetUpdater initialPayload={initialPayload} initialError={initialError} />
    </div>
  );
}
