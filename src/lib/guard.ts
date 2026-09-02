import { redirect } from "next/navigation";

import { hasValidSession } from "@/lib/lock";

export async function requirePageSession() {
  if (!(await hasValidSession())) {
    redirect("/welcome");
  }
}

export async function requireApiSession() {
  if (await hasValidSession()) return null;
  return Response.json(
    { error: "Enter the 4-digit PIN first.", needsUnlock: true },
    { status: 401 }
  );
}
