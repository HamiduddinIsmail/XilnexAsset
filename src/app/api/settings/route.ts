import { invalidateAssetsCache } from "@/lib/assets";
import { publicConnectionInfo, resetLarkRuntime, verifyLarkSettings } from "@/lib/lark";
import {
  maskAppId,
  parseBaseLink,
  readStoredSettings,
  writeStoredSettings,
} from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const stored = await readStoredSettings();
  const live = await publicConnectionInfo();
  return Response.json({
    ...live,
    appIdMasked: stored ? maskAppId(stored.appId) : live.configured ? live.appIdMasked : "",
    baseUrl: stored?.baseUrl || live.baseUrl || "",
    hasSecret: Boolean(stored?.appSecret || live.configured),
  });
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      appId?: string;
      appSecret?: string;
      baseUrl?: string;
    };
    const existing = await readStoredSettings();
    const currentAppId = existing?.appId || process.env.LARK_APP_ID?.trim() || "";
    const currentSecret = existing?.appSecret || process.env.LARK_APP_SECRET?.trim() || "";
    const appId = body.appId?.trim() || currentAppId;
    const baseUrl = body.baseUrl?.trim() ?? "";
    const appSecret = body.appSecret?.trim() || currentSecret;

    if (!appId) throw new Error("App ID is required.");
    if (!appSecret) throw new Error("App Secret is required.");
    if (!baseUrl) throw new Error("Paste the Lark Base link for your Asset Register.");
    if (body.appId?.trim() && body.appId.trim() !== currentAppId && !body.appSecret?.trim()) {
      throw new Error("Enter the App Secret that belongs to this App ID.");
    }

    const parsed = parseBaseLink(baseUrl);
    const verified = await verifyLarkSettings({
      appId,
      appSecret,
      apiBase: parsed.apiBase,
      appToken: parsed.appToken,
      tableId: parsed.tableId,
      tableName: "Asset Register",
    });

    await writeStoredSettings({
      appId,
      appSecret,
      baseUrl,
      apiBase: parsed.apiBase,
      appToken: parsed.appToken,
      tableId: verified.tableId,
      tableName: verified.tableName,
      assetNameField: verified.nameField,
      serialNumberField: verified.serialField,
      updatedAt: new Date().toISOString(),
    });
    resetLarkRuntime();
    invalidateAssetsCache();

    return Response.json({
      configured: true,
      tableName: verified.tableName,
      appIdMasked: maskAppId(appId),
      baseUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save Lark settings.";
    return Response.json({ error: message }, { status: 400 });
  }
}
