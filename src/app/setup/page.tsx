import { SetupForm } from "@/components/setup-form";
import { requirePageSession } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  await requirePageSession();
  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <SetupForm />
    </div>
  );
}
