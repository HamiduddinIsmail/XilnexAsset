import { AssetUpdater } from "@/components/asset-updater";
import { getAssets } from "@/lib/assets";

export const dynamic = "force-dynamic";

export default async function Home() {
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
