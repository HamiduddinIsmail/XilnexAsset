import { listLarkAssets, isLarkConfigured, updateLarkSerial, findAssetWithSerial } from "@/lib/lark";
import { listMockAssets, updateMockSerial } from "@/lib/mock-assets";
import { sanitizeSerial, looksLikeSerial } from "@/lib/serial";
import type { AssetsPayload, UpdateSerialResult } from "@/lib/types";

let assetsCache: { at: number; data: AssetsPayload } | null = null;
const ASSETS_TTL_MS = 15_000;

export function invalidateAssetsCache() {
  assetsCache = null;
}

export async function getAssets(): Promise<AssetsPayload> {
  if (assetsCache && Date.now() - assetsCache.at < ASSETS_TTL_MS) {
    return assetsCache.data;
  }

  if (!(await isLarkConfigured())) {
    const data: AssetsPayload = {
      mode: "demo",
      tableName: "Asset Register",
      nameField: "Asset Name",
      serialField: "Serial Number",
      assets: listMockAssets(),
      warning:
        "Demo mode is on because no Lark Base is connected yet. Open Setup, paste the App ID, App Secret, and Base link, then scanners on every device will use that table.",
    };
    assetsCache = { at: Date.now(), data };
    return data;
  }

  const result = await listLarkAssets();
  const data: AssetsPayload = {
    mode: "lark",
    ...result,
  };
  assetsCache = { at: Date.now(), data };
  return data;
}

export async function submitSerial(
  recordId: string,
  rawSerial: string
): Promise<UpdateSerialResult> {
  const serialNumber = sanitizeSerial(rawSerial);
  if (!looksLikeSerial(serialNumber)) {
    throw new Error("That does not look like a serial number. Check the value before submitting.");
  }

  if (await isLarkConfigured()) {
    const duplicate = await findAssetWithSerial(serialNumber, recordId);
    if (duplicate) {
      throw new Error(
        `Serial ${serialNumber} is already on ${duplicate.name}. Submit was blocked to avoid a duplicate.`
      );
    }
    const result = {
      mode: "lark" as const,
      ...(await updateLarkSerial(recordId, serialNumber)),
    };
    invalidateAssetsCache();
    return result;
  }

  const existing = listMockAssets();
  const duplicate = existing.find(
    (asset) =>
      asset.recordId !== recordId &&
      asset.serialNumber.trim().toLowerCase() === serialNumber.toLowerCase()
  );
  if (duplicate) {
    throw new Error(
      `Serial ${serialNumber} is already on ${duplicate.name}. Submit was blocked to avoid a duplicate.`
    );
  }

  const { asset, previousSerial } = updateMockSerial(recordId, serialNumber);
  invalidateAssetsCache();
  return {
    mode: "demo",
    recordId: asset.recordId,
    name: asset.name,
    previousSerial,
    serialNumber,
  };
}
