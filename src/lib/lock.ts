import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";

const LOCK_PATH = path.join(process.cwd(), "data", "app-lock.json");
export const SESSION_COOKIE = "xilnex_unlock";
const SESSION_MS = 12 * 60 * 60 * 1000;

type LockFile = {
  pinHash: string;
  salt: string;
  sessionSecret: string;
  updatedAt: string;
};

function isFourDigits(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

async function readLock(): Promise<LockFile | null> {
  try {
    const parsed = JSON.parse(await readFile(LOCK_PATH, "utf8")) as LockFile;
    if (!parsed.pinHash || !parsed.salt || !parsed.sessionSecret) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeLock(lock: LockFile) {
  await mkdir(path.dirname(LOCK_PATH), { recursive: true });
  await writeFile(LOCK_PATH, `${JSON.stringify(lock, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function hashPin(pin: string, saltHex: string) {
  return scryptSync(pin, Buffer.from(saltHex, "hex"), 32).toString("hex");
}

function safeEqualHex(a: string, b: string) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function validatePin(pin: string) {
  if (!isFourDigits(pin)) throw new Error("PIN must be exactly 4 digits.");
}

export async function isPinConfigured() {
  return Boolean(await readLock());
}

export async function createPin(pin: string) {
  validatePin(pin);
  if (await readLock()) {
    throw new Error("A PIN is already set. Unlock first, then change it in Setup.");
  }
  const salt = randomBytes(16).toString("hex");
  await writeLock({
    pinHash: hashPin(pin, salt),
    salt,
    sessionSecret: randomBytes(32).toString("hex"),
    updatedAt: new Date().toISOString(),
  });
}

export async function verifyPin(pin: string) {
  validatePin(pin);
  const lock = await readLock();
  if (!lock) throw new Error("No PIN is set yet.");
  return safeEqualHex(lock.pinHash, hashPin(pin, lock.salt));
}

export async function changePin(currentPin: string, nextPin: string) {
  if (!(await verifyPin(currentPin))) {
    throw new Error("Current PIN is incorrect.");
  }
  validatePin(nextPin);
  const salt = randomBytes(16).toString("hex");
  const existing = await readLock();
  await writeLock({
    pinHash: hashPin(nextPin, salt),
    salt,
    sessionSecret: existing?.sessionSecret || randomBytes(32).toString("hex"),
    updatedAt: new Date().toISOString(),
  });
}

function signSession(secret: string, expiresAt: number) {
  const payload = String(expiresAt);
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

function readSession(value: string, secret: string) {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const left = Buffer.from(signature, "hex");
  const right = Buffer.from(expected, "hex");
  if (left.length !== right.length || !timingSafeEqual(left, right)) return false;
  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export async function hasValidSession() {
  const lock = await readLock();
  if (!lock) return false;
  const jar = await cookies();
  const value = jar.get(SESSION_COOKIE)?.value;
  if (!value) return false;
  return readSession(value, lock.sessionSecret);
}

export async function setSessionCookie() {
  const lock = await readLock();
  if (!lock) throw new Error("Set a PIN before opening a session.");
  const expiresAt = Date.now() + SESSION_MS;
  const jar = await cookies();
  jar.set(SESSION_COOKIE, signSession(lock.sessionSecret, expiresAt), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_MS / 1000),
    secure: false,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
