import { HandoverSignForm } from "@/components/handover-sign-form";

export const dynamic = "force-dynamic";

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <HandoverSignForm token={token} />
    </div>
  );
}
