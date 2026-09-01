import { AssetUpdater } from "@/components/asset-updater";

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-[radial-gradient(1200px_circle_at_top,_oklch(0.96_0.02_220),_transparent_55%)]">
      <AssetUpdater />
    </div>
  );
}
