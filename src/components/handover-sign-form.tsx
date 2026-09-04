"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, PenLine } from "lucide-react";

import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";
import { Button } from "@/components/ui/button";
import type { HandoverSignPublic } from "@/lib/handover-sign";

export function HandoverSignForm({ token }: { token: string }) {
  const padRef = useRef<SignaturePadHandle | null>(null);
  const [session, setSession] = useState<HandoverSignPublic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/handover/sign/${token}`, { cache: "no-store" });
        const body = (await response.json()) as HandoverSignPublic & { error?: string };
        if (!response.ok) throw new Error(body.error || "This signing link is not valid.");
        if (!cancelled) setSession(body);
      } catch (next) {
        if (!cancelled) {
          setError(next instanceof Error ? next.message : "Could not open this signing page.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function save() {
    if (!padRef.current || padRef.current.isEmpty()) {
      setError("Sign in the box first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/handover/sign/${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature: padRef.current.toDataURL() }),
      });
      const body = (await response.json()) as HandoverSignPublic & { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not save that signature.");
      setSession(body);
    } catch (next) {
      setError(next instanceof Error ? next.message : "Could not save that signature.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-8">
      <div className="flex items-start gap-3">
        <img
          src="/xilnex-logo.jpg"
          alt="Xilnex Holdings"
          width={48}
          height={48}
          className="size-12 rounded-xl bg-white shadow-sm ring-1 ring-foreground/10"
        />
        <div>
          <p className="text-sm font-medium tracking-wide text-white/90">Xilnex Holdings</p>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Sign to receive</h1>
        </div>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Opening the handover…
        </p>
      ) : error && !session ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</p>
      ) : session?.signed ? (
        <div className="space-y-3 rounded-2xl border bg-card p-4">
          <p className="flex items-center gap-2 font-medium text-emerald-300">
            <CheckCircle2 className="size-4" />
            Signature saved
          </p>
          <p className="text-sm text-muted-foreground">
            {session.staffName} acknowledged {session.assetName}. You can close this page. The admin
            can now review the handover.
          </p>
          {session.signatureDataUrl ? (
            <img
              src={session.signatureDataUrl}
              alt="Saved signature"
              className="w-full rounded-xl bg-white"
            />
          ) : null}
        </div>
      ) : session ? (
        <div className="space-y-4">
          <div className="rounded-2xl border bg-card p-4 text-sm">
            <p className="font-medium">{session.staffName}</p>
            <p className="mt-1 text-muted-foreground">
              {[session.assetName, session.assetId, session.serialNumber || "No serial"]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="mt-3 text-muted-foreground">
              Sign below to confirm you received this company asset and will use it under company
              policy.
            </p>
          </div>
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <PenLine className="size-4" />
              Signature
            </p>
            <SignaturePad handleRef={padRef} disabled={saving} onEmptyChange={setEmpty} />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={saving}
              onClick={() => {
                padRef.current?.clear();
                setError(null);
              }}
            >
              Clear
            </Button>
            <Button type="button" className="flex-1" disabled={saving || empty} onClick={() => void save()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save signature
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
