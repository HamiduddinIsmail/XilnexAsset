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
    <div className="flex min-h-full flex-1 flex-col bg-[radial-gradient(1200px_circle_at_top,_oklch(0.96_0.02_220),_transparent_55%)]">
      <AssetUpdater initialPayload={initialPayload} initialError={initialError} />
    </div>
  );
}
