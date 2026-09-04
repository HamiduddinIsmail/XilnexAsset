import { ToolsHome } from "@/components/tools-home";
import { requirePageSession } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function Home() {
  await requirePageSession();
  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <ToolsHome />
    </div>
  );
}
