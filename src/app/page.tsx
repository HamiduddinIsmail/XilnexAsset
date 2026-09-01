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
    <div className="relative flex min-h-full flex-1 flex-col overflow-hidden bg-[#35204c]">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -top-28 -left-24 size-[28rem] rounded-full bg-[#d9cce6]/40 blur-3xl" />
        <div className="absolute top-[8%] right-[-10rem] size-[34rem] rounded-full bg-[#efe7f6]/30 blur-3xl" />
        <div className="absolute bottom-[-8rem] left-[22%] size-[26rem] rounded-full bg-[#cbb8dc]/28 blur-3xl" />
        <div className="absolute top-[45%] left-[55%] size-[18rem] rounded-full bg-[#f4eef8]/20 blur-3xl" />
      </div>
      <div className="relative z-10 flex min-h-full flex-1 flex-col">
        <AssetUpdater initialPayload={initialPayload} initialError={initialError} />
      </div>
    </div>
  );
}
