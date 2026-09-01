import { listLarkAssets, isLarkConfigured, updateLarkSerial } from "@/lib/lark";
import { listMockAssets, updateMockSerial } from "@/lib/mock-assets";
import { sanitizeSerial, looksLikeSerial } from "@/lib/serial";
import type { AssetsPayload, UpdateSerialResult } from "@/lib/types";

export async function getAssets(): Promise<AssetsPayload> {
  if (!isLarkConfigured()) {
    return {
      mode: "demo",
      tableName: "Asset Register",
      nameField: "Asset Name",
      serialField: "Serial Number",
      assets: listMockAssets(),
      warning:
        "Demo mode is on because Lark credentials are not configured. Updates stay in this server until you add them.",
    };
  }

  const result = await listLarkAssets();
  return {
    mode: "lark",
    ...result,
  };
}

export async function submitSerial(
  recordId: string,
  rawSerial: string
): Promise<UpdateSerialResult> {
  const serialNumber = sanitizeSerial(rawSerial);
  if (!looksLikeSerial(serialNumber)) {
    throw new Error("That does not look like a serial number. Check the value before submitting.");
  }

  if (isLarkConfigured()) {
    const updated = await listLarkAssets();
    const duplicate = updated.assets.find(
      (asset) =>
        asset.recordId !== recordId &&
        asset.serialNumber.trim().toLowerCase() === serialNumber.toLowerCase()
    );
    if (duplicate) {
      throw new Error(
        `Serial ${serialNumber} is already on ${duplicate.name}. Submit was blocked to avoid a duplicate.`
      );
    }
    return {
      mode: "lark",
      ...(await updateLarkSerial(recordId, serialNumber)),
    };
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
  return {
    mode: "demo",
    recordId: asset.recordId,
    name: asset.name,
    previousSerial,
    serialNumber,
  };
}
