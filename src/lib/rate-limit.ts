const attempts = new Map<string, { count: number; resetAt: number }>();

export function unlockAllowed(ip: string) {
  const now = Date.now();
  const current = attempts.get(ip);
  if (!current || current.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + 15 * 60_000 });
    return { ok: true as const, remaining: 7 };
  }
  if (current.count >= 8) {
    const minutes = Math.max(1, Math.ceil((current.resetAt - now) / 60_000));
    return {
      ok: false as const,
      error: `Too many PIN attempts. Try again in ${minutes} min.`,
    };
  }
  current.count += 1;
  return { ok: true as const, remaining: 8 - current.count };
}

export function clearUnlockAttempts(ip: string) {
  attempts.delete(ip);
}

export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}
