import { ReturnDesk } from "@/components/return-desk";
import { requirePageSession } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function ReturnPage() {
  await requirePageSession();
  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <ReturnDesk />
    </div>
  );
}
