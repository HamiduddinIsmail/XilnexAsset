import {
  clearSessionCookie,
  createPin,
  isPinConfigured,
  setSessionCookie,
  verifyPin,
} from "@/lib/lock";
import { clearUnlockAttempts, clientIp, unlockAllowed } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ configured: await isPinConfigured() });
}

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const gate = unlockAllowed(ip);
    if (!gate.ok) {
      return Response.json({ error: gate.error }, { status: 429 });
    }

    const body = (await request.json()) as { pin?: string; confirmPin?: string };
    const pin = body.pin?.trim() ?? "";
    const configured = await isPinConfigured();

    if (!configured) {
      const confirmPin = body.confirmPin?.trim() ?? "";
      if (pin !== confirmPin) {
        throw new Error("The two PINs did not match.");
      }
      await createPin(pin);
    } else if (!(await verifyPin(pin))) {
      throw new Error("That PIN is incorrect.");
    }

    clearUnlockAttempts(ip);
    await setSessionCookie();
    return Response.json({ ok: true, configured: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not unlock.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE() {
  await clearSessionCookie();
  return Response.json({ ok: true });
}
