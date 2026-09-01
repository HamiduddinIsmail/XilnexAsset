"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type SettingsResponse = {
  configured?: boolean;
  source?: string;
  appIdMasked?: string;
  baseUrl?: string;
  tableName?: string;
  hasSecret?: boolean;
  error?: string;
};

export function SetupForm() {
  const router = useRouter();
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [current, setCurrent] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/settings", { cache: "no-store" });
        const body = (await response.json()) as SettingsResponse;
        if (cancelled) return;
        setCurrent(body);
        if (body.baseUrl) setBaseUrl(body.baseUrl);
      } catch {
        if (!cancelled) toast.error("Could not load current setup.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSave() {
    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId,
          appSecret,
          baseUrl,
        }),
      });
      const body = (await response.json()) as SettingsResponse & { tableName?: string };
      if (!response.ok) {
        throw new Error(body.error || "Could not connect to that Lark Base.");
      }
      toast.success(`Connected to ${body.tableName || "Lark Base"}`);
      router.push("/");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save setup.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 py-8 sm:px-6">
      <Link
        href="/"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit text-white")}
      >
        <ArrowLeft className="size-4" />
        Back to scanner
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Admin setup</CardTitle>
          <CardDescription>
            Paste the Lark custom app credentials and the Base link that contains the Asset
            Register. The app tests the connection, then every scanner using this server uses
            that table. Leave App ID and Secret blank to keep the current app and only change
            the Base link.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading current connection…
            </p>
          ) : current?.configured ? (
            <p className="rounded-lg bg-white/10 px-3 py-2 text-sm">
              Currently connected{current.tableName ? ` to ${current.tableName}` : ""}. App ID{" "}
              <span className="font-mono">{current.appIdMasked}</span>
              {current.source === "env" ? " (from server environment)" : ""}. Saving here
              replaces that connection for everyone using this app.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No Base is connected yet. After you save, scanners on phones and desktops will
              all use this Lark table.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="appId">App ID</Label>
            <Input
              id="appId"
              value={appId}
              onChange={(event) => setAppId(event.target.value)}
              placeholder={current?.appIdMasked || "cli_…"}
              className="h-11 font-mono"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="appSecret">App Secret</Label>
            <Input
              id="appSecret"
              type="password"
              value={appSecret}
              onChange={(event) => setAppSecret(event.target.value)}
              placeholder={current?.hasSecret ? "Leave blank to keep the saved secret" : "App secret"}
              className="h-11 font-mono"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="baseUrl">Lark Base link</Label>
            <Input
              id="baseUrl"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://your-tenant.larksuite.com/base/…?table=tbl…"
              className="h-11"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Open the Asset Register table in Lark, copy the browser URL, and paste it here.
              The token after `/base/` and `table=` are read automatically. The custom app
              must be a Base collaborator with edit access, or the test will fail.
            </p>
          </div>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button
            type="button"
            size="lg"
            disabled={saving || loading || !baseUrl.trim() || (!current?.configured && (!appId.trim() || !appSecret.trim()))}
            onClick={() => void onSave()}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Test and save
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
