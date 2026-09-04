import { randomBytes } from "node:crypto";

import { readJsonFile, writeJsonFile } from "@/lib/persist";

const STORE_KEY = "handover-signs";
const SESSION_MS = 30 * 60 * 1000;
const MAX_SIGNATURE_CHARS = 500_000;

export type HandoverSignAsset = {
  recordId: string;
  name: string;
  assetId: string;
  serialNumber: string;
};

export type HandoverSignSession = {
  token: string;
  createdAt: string;
  expiresAt: string;
  assets: HandoverSignAsset[];
  staffId: string;
  staffName: string;
  staffEmail: string;
  signatureDataUrl?: string;
  signedAt?: string;
};

export type HandoverSignPublic = {
  token: string;
  expiresAt: string;
  assets: HandoverSignAsset[];
  staffName: string;
  signed: boolean;
  signedAt?: string;
  signatureDataUrl?: string;
};

type Store = Record<string, HandoverSignSession>;

function sessionAssets(session: HandoverSignSession): HandoverSignAsset[] {
  if (session.assets?.length) return session.assets;
  const legacy = session as HandoverSignSession & {
    assetRecordId?: string;
    assetName?: string;
    assetId?: string;
    serialNumber?: string;
  };
  if (!legacy.assetRecordId) return [];
  return [
    {
      recordId: legacy.assetRecordId,
      name: legacy.assetName ?? "",
      assetId: legacy.assetId ?? "",
      serialNumber: legacy.serialNumber ?? "",
    },
  ];
}

function toPublic(session: HandoverSignSession, includeSignature = false): HandoverSignPublic {
  return {
    token: session.token,
    expiresAt: session.expiresAt,
    assets: sessionAssets(session),
    staffName: session.staffName,
    signed: Boolean(session.signedAt && session.signatureDataUrl),
    signedAt: session.signedAt,
    signatureDataUrl: includeSignature || session.signedAt ? session.signatureDataUrl : undefined,
  };
}

function isExpired(session: HandoverSignSession) {
  return Date.parse(session.expiresAt) <= Date.now();
}

async function readStore(): Promise<Store> {
  const parsed = await readJsonFile<Store>(STORE_KEY);
  if (!parsed || typeof parsed !== "object") return {};
  const now = Date.now();
  const next: Store = {};
  for (const [token, session] of Object.entries(parsed)) {
    if (!session?.token || !session.expiresAt) continue;
    if (Date.parse(session.expiresAt) + 24 * 60 * 60 * 1000 < now) continue;
    next[token] = session;
  }
  return next;
}

async function writeStore(store: Store) {
  await writeJsonFile(STORE_KEY, store);
}

export async function createHandoverSignSession(input: {
  assets: HandoverSignAsset[];
  staffId: string;
  staffName: string;
  staffEmail: string;
}): Promise<HandoverSignPublic> {
  if (!input.assets.length) throw new Error("Add at least one asset before collecting a signature.");
  const store = await readStore();
  const token = randomBytes(18).toString("base64url");
  const now = new Date();
  const session: HandoverSignSession = {
    token,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_MS).toISOString(),
    assets: input.assets,
    staffId: input.staffId,
    staffName: input.staffName,
    staffEmail: input.staffEmail,
  };
  store[token] = session;
  await writeStore(store);
  return toPublic(session);
}

export async function getHandoverSignSession(token: string) {
  const store = await readStore();
  return store[token] ?? null;
}

export async function getHandoverSignPublic(token: string, includeSignature = false) {
  const session = await getHandoverSignSession(token);
  if (!session) return null;
  if (isExpired(session) && !session.signedAt) return null;
  return toPublic(session, includeSignature);
}

export async function saveHandoverSignature(token: string, signatureDataUrl: string) {
  if (!signatureDataUrl.startsWith("data:image/png;base64,")) {
    throw new Error("That signature image is not valid.");
  }
  if (signatureDataUrl.length > MAX_SIGNATURE_CHARS) {
    throw new Error("That signature is too large. Sign again with a shorter stroke.");
  }
  const store = await readStore();
  const session = store[token];
  if (!session) throw new Error("This signing link was not found.");
  if (isExpired(session) && !session.signedAt) {
    throw new Error("This signing link expired. Ask the admin to send a new QR.");
  }
  if (session.signedAt && session.signatureDataUrl) {
    return toPublic(session, true);
  }
  session.signatureDataUrl = signatureDataUrl;
  session.signedAt = new Date().toISOString();
  store[token] = session;
  await writeStore(store);
  return toPublic(session, true);
}

export async function assertHandoverSignature(input: {
  signatureToken?: string;
  staffId: string;
  items: Array<{ assetRecordId: string }>;
}) {
  if (!input.signatureToken) {
    throw new Error("The employee must sign before you can complete this handover.");
  }
  const session = await getHandoverSignSession(input.signatureToken);
  if (!session || !session.signedAt || !session.signatureDataUrl) {
    throw new Error("The employee must sign before you can complete this handover.");
  }
  if (isExpired(session) && !session.signedAt) {
    throw new Error("That signature request expired. Ask the employee to sign again.");
  }
  if (session.staffId !== input.staffId) {
    throw new Error("That signature is for a different person. Collect a new one.");
  }
  const signedIds = sessionAssets(session)
    .map((asset) => asset.recordId)
    .sort();
  const basketIds = input.items.map((item) => item.assetRecordId).sort();
  if (signedIds.join("|") !== basketIds.join("|")) {
    throw new Error("That signature is for a different set of assets. Collect a new one.");
  }
  return session;
}
