import { HandoverDesk } from "@/components/handover-desk";
import { requirePageSession } from "@/lib/guard";
import { getHandoverDesk } from "@/lib/handover";

export const dynamic = "force-dynamic";

export default async function HandoverPage() {
  await requirePageSession();
  let initialPayload = null;
  let initialError: string | null = null;

  try {
    initialPayload = await getHandoverDesk();
  } catch (error) {
    initialError = error instanceof Error ? error.message : "Could not load the handover desk.";
  }

  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <HandoverDesk initialPayload={initialPayload} initialError={initialError} />
    </div>
  );
}
