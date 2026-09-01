import { SetupForm } from "@/components/setup-form";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <SetupForm />
    </div>
  );
}
