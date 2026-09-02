"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Delete, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"] as const;

type WelcomeGateProps = {
  needsSetup: boolean;
};

export function WelcomeGate({ needsSetup }: WelcomeGateProps) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [busy, setBusy] = useState(false);

  const confirming = needsSetup && Boolean(firstPin);
  const title = needsSetup
    ? confirming
      ? "Confirm PIN"
      : "Create a PIN"
    : "Welcome";
  const hint = needsSetup
    ? confirming
      ? "Enter the same 4 digits again."
      : "Choose a 4-digit PIN. Anyone with the link will need it to change Lark data."
    : "Enter the 4-digit PIN to open Serials and Maintenance.";

  function press(key: string) {
    if (busy) return;
    if (key === "back") {
      setPin((value) => value.slice(0, -1));
      return;
    }
    if (!/^\d$/.test(key) || pin.length >= 4) return;
    const next = `${pin}${key}`;
    setPin(next);
    if (next.length === 4) {
      window.setTimeout(() => void submit(next), 80);
    }
  }

  async function submit(value: string) {
    if (needsSetup && !firstPin) {
      setFirstPin(value);
      setPin("");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          needsSetup ? { pin: firstPin, confirmPin: value } : { pin: value }
        ),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not unlock.");
      toast.success(needsSetup ? "PIN saved. This device is unlocked." : "Unlocked.");
      router.replace("/");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not unlock.");
      setPin("");
      if (needsSetup) {
        setFirstPin("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <img
          src="/xilnex-logo.jpg"
          alt="Xilnex Holdings"
          width={64}
          height={64}
          className="size-16 rounded-2xl bg-white shadow-sm ring-1 ring-foreground/10"
        />
        <p className="text-sm font-medium tracking-wide text-white/90">Xilnex Holdings</p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>
      </div>

      <div className="flex items-center gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <span
            key={index}
            className={cn(
              "size-4 rounded-full border-2",
              index < pin.length ? "border-[var(--brand)] bg-[var(--brand)]" : "border-white/40"
            )}
          />
        ))}
      </div>

      <div className="grid w-full max-w-xs grid-cols-3 gap-2">
        {KEYS.map((key, index) => {
          if (!key) return <span key={`spacer-${index}`} />;
          if (key === "back") {
            return (
              <Button
                key={key}
                type="button"
                variant="outline"
                className="h-16 text-lg"
                disabled={busy}
                onClick={() => press("back")}
              >
                <Delete className="size-5" />
              </Button>
            );
          }
          return (
            <Button
              key={key}
              type="button"
              variant="outline"
              className="h-16 text-2xl font-semibold"
              disabled={busy}
              onClick={() => press(key)}
            >
              {key}
            </Button>
          );
        })}
      </div>

      {busy ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Checking PIN…
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5" />
          The session stays open for 12 hours on this browser.
        </p>
      )}
    </div>
  );
}
