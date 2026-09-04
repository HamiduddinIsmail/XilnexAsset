import { AssetUpdater } from "@/components/asset-updater";
import { requirePageSession } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function SerialsPage() {
  await requirePageSession();
  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <AssetUpdater />
    </div>
  );
}
