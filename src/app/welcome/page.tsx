import { redirect } from "next/navigation";

import { WelcomeGate } from "@/components/welcome-gate";
import { hasValidSession, isPinConfigured } from "@/lib/lock";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  if (await hasValidSession()) {
    redirect("/");
  }

  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <WelcomeGate needsSetup={!(await isPinConfigured())} />
    </div>
  );
}
