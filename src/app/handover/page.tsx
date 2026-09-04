import { HandoverDesk } from "@/components/handover-desk";
import { requirePageSession } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function HandoverPage() {
  await requirePageSession();
  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <HandoverDesk />
    </div>
  );
}
