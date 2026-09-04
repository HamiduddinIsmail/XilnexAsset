import { ReturnDesk } from "@/components/return-desk";
import { requirePageSession } from "@/lib/guard";
import { getReturnDesk } from "@/lib/return";

export const dynamic = "force-dynamic";

export default async function ReturnPage() {
  await requirePageSession();
  let initialPayload = null;
  let initialError: string | null = null;

  try {
    initialPayload = await getReturnDesk();
  } catch (error) {
    initialError = error instanceof Error ? error.message : "Could not load the return desk.";
  }

  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <ReturnDesk initialPayload={initialPayload} initialError={initialError} />
    </div>
  );
}
