"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Barcode,
  CheckCircle2,
  ChevronRight,
  Loader2,
  RefreshCw,
  ScanLine,
  Search,
  Settings,
  Usb,
} from "lucide-react";
import { toast } from "sonner";

import { ScanDialog } from "@/components/scan-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useHardwareScanner } from "@/hooks/use-hardware-scanner";
import { looksLikeSerial, sanitizeSerial } from "@/lib/serial";
import type { AssetsPayload, UpdateSerialResult } from "@/lib/types";
import { cn } from "@/lib/utils";

type Filter = "all" | "missing" | "has";

type AssetUpdaterProps = {
  initialPayload?: AssetsPayload | null;
  initialError?: string | null;
};

export function AssetUpdater({
  initialPayload = null,
  initialError = null,
}: AssetUpdaterProps) {
  const [payload, setPayload] = useState<AssetsPayload | null>(initialPayload);
  const [loadError, setLoadError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(!initialPayload && !initialError);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("missing");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [serial, setSerial] = useState("");
  const [candidates, setCandidates] = useState<string[]>([]);
  const [scanOpen, setScanOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<UpdateSerialResult | null>(null);
  const [scanSource, setScanSource] = useState<string | null>(null);

  const selected = payload?.assets.find((asset) => asset.recordId === selectedId) ?? null;

  async function load(options?: { keepSelection?: boolean }) {
    setLoadError(null);
    try {
      const response = await fetch("/api/assets?fresh=1", { cache: "no-store" });
      const body = (await response.json()) as AssetsPayload & { error?: string };
      if (!response.ok) {
        throw new Error(body.error || "Could not load the Asset Register.");
      }
      setPayload(body);
      if (!options?.keepSelection) {
        setSelectedId(null);
        setSerial("");
        setCandidates([]);
        setLastResult(null);
      } else if (selectedId && !body.assets.some((asset) => asset.recordId === selectedId)) {
        setSelectedId(null);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load assets.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialPayload || initialError) return;

    let cancelled = false;
    async function initialLoad() {
      try {
        const response = await fetch("/api/assets", { cache: "no-store" });
        const body = (await response.json()) as AssetsPayload & { error?: string };
        if (cancelled) return;
        if (!response.ok) {
          throw new Error(body.error || "Could not load the Asset Register.");
        }
        setPayload(body);
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "Could not load assets.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void initialLoad();
    return () => {
      cancelled = true;
    };
  }, [initialPayload, initialError]);

  function selectAsset(recordId: string, currentSerial: string) {
    setSelectedId(recordId);
    setSerial(currentSerial);
    setCandidates([]);
    setScanSource(null);
    setLastResult(null);
  }

  const filtered = useMemo(() => {
    if (!payload) return [];
    const needle = query.trim().toLowerCase();
    return payload.assets.filter((asset) => {
      if (filter === "missing" && asset.serialNumber) return false;
      if (filter === "has" && !asset.serialNumber) return false;
      if (!needle) return true;
      const haystack = [
        asset.name,
        asset.serialNumber,
        ...Object.values(asset.extra),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [payload, query, filter]);

  const duplicate = useMemo(() => {
    if (!payload) return null;
    const value = sanitizeSerial(serial);
    if (!value) return null;
    return (
      payload.assets.find(
        (asset) =>
          asset.recordId !== selectedId &&
          asset.serialNumber.trim().toLowerCase() === value.toLowerCase()
      ) ?? null
    );
  }, [payload, serial, selectedId]);

  function applyScan(value: string, source: string, nextCandidates: string[] = []) {
    const cleaned = sanitizeSerial(value);
    setSerial(cleaned);
    setCandidates(nextCandidates.filter((item) => item !== cleaned));
    setScanSource(source);
    toast.success(`Read ${cleaned}`, { description: source });
  }

  useHardwareScanner({
    enabled: Boolean(selected) && !scanOpen && !confirmOpen,
    onScan: (value) => applyScan(value, "USB / Bluetooth scanner"),
  });

  const missingCount = payload?.assets.filter((asset) => !asset.serialNumber).length ?? 0;
  const dirty =
    Boolean(selected) &&
    sanitizeSerial(serial) !== (selected?.serialNumber ?? "") &&
    looksLikeSerial(serial);
  const canSubmit = Boolean(selected) && dirty && !duplicate && !submitting;

  async function confirmSubmit() {
    if (!selected) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/assets/${encodeURIComponent(selected.recordId)}/serial`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serialNumber: serial }),
      });
      let body: UpdateSerialResult & { error?: string };
      try {
        body = (await response.json()) as UpdateSerialResult & { error?: string };
      } catch {
        throw new Error("The server replied, but the result could not be read. Refresh — Lark may already have the serial.");
      }
      if (!response.ok) {
        throw new Error(body.error || "Update failed.");
      }
      setLastResult(body);
      setConfirmOpen(false);
      toast.success(`Saved serial for ${body.name}`, {
        description:
          body.mode === "lark"
            ? "Written to Lark Base on the matching Asset Register row."
            : "Saved in demo mode. Connect Lark Base to write to the live table.",
      });
      await load({ keepSelection: true });
      setSerial(body.serialNumber);
    } catch (error) {
      const message =
        error instanceof TypeError ||
        (error instanceof Error && error.message === "Failed to fetch")
          ? "Could not reach the server. Refresh the list — if the serial is already on the asset, Lark saved it."
          : error instanceof Error
            ? error.message
            : "Could not save the serial number.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex items-start gap-3">
            <img
              src="/xilnex-logo.jpg"
              alt="Xilnex Holdings"
              width={48}
              height={48}
              className="size-12 rounded-xl bg-white shadow-sm ring-1 ring-foreground/10"
            />
            <div className="space-y-1">
              <p className="text-sm font-medium tracking-wide text-white/90">
                Xilnex Holdings
              </p>
              <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                Serial number updater
              </h1>
            </div>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground sm:mt-1 sm:text-[0.95rem]">
            Pick an asset from the Asset Register, scan its barcode or serial plate, then write
            that value to the matching Lark Base record. No copy-paste, no wrong row.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {payload ? (
            <Badge
              className={
                payload.mode === "lark"
                  ? "border-transparent bg-[var(--brand)] text-white"
                  : undefined
              }
              variant={payload.mode === "lark" ? "default" : "secondary"}
            >
              {payload.mode === "lark" ? "Lark Base connected" : "Demo mode"}
            </Badge>
          ) : null}
          <Link
            href="/setup"
            className={buttonVariants({
              variant: payload?.mode === "lark" ? "outline" : "default",
              size: "sm",
            })}
          >
            <Settings className="size-3.5" />
            Setup
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLoading(true);
              void load();
            }}
            disabled={loading}
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Refresh
          </Button>
        </div>
      </header>

      {payload?.warning ? (
        <Alert>
          <AlertTriangle />
          <AlertTitle>Running against demo data</AlertTitle>
          <AlertDescription>
            {payload.warning}{" "}
            <Link href="/setup" className="font-medium underline underline-offset-4">
              Open Setup
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      {loadError ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Could not load assets</AlertTitle>
          <AlertDescription>
            {loadError}{" "}
            <button
              type="button"
              className="underline"
              onClick={() => {
                setLoading(true);
                void load();
              }}
            >
              Try again
            </button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Card className="min-h-[28rem]">
          <CardHeader className="border-b">
            <CardTitle>1. Select asset</CardTitle>
            <CardDescription>
              {payload
                ? `${payload.tableName} · ${payload.assets.length} records · ${missingCount} missing a serial`
                : "Loading Asset Register…"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3 pt-4">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, tag, or location"
                className="h-10 pl-8"
                aria-label="Search assets"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["missing", "Needs serial"],
                  ["all", "All assets"],
                  ["has", "Has serial"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={filter === value ? "default" : "outline"}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <ScrollArea className="h-[28rem] rounded-lg border">
              {loading && !payload ? (
                <div className="space-y-2 p-3">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="h-16 animate-pulse rounded-lg bg-muted" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center">
                  <p className="font-medium">No matching assets</p>
                  <p className="text-sm text-muted-foreground">
                    {filter === "missing"
                      ? "Every visible asset already has a serial, or nothing matched the search."
                      : "Try a different name or clear the search."}
                  </p>
                </div>
              ) : (
                <ul className="p-1">
                  {filtered.map((asset) => (
                    <li key={asset.recordId}>
                      <button
                        type="button"
                        onClick={() => selectAsset(asset.recordId, asset.serialNumber)}
                        className={cn(
                          "flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left transition-colors",
                          selectedId === asset.recordId
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{asset.name}</p>
                          <p
                            className={cn(
                              "truncate font-mono text-xs",
                              selectedId === asset.recordId
                                ? "text-primary-foreground/80"
                                : "text-muted-foreground"
                            )}
                          >
                            {asset.serialNumber || "No serial yet"}
                          </p>
                          {asset.extra["Asset ID"] || asset.extra.Location || asset.extra["Asset Tag"] ? (
                            <p
                              className={cn(
                                "truncate text-xs",
                                selectedId === asset.recordId
                                  ? "text-primary-foreground/70"
                                  : "text-muted-foreground"
                              )}
                            >
                              {[asset.extra["Asset ID"], asset.extra["Asset Tag"], asset.extra.Location]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          ) : null}
                        </div>
                        <ChevronRight className="mt-1 size-4 shrink-0 opacity-60" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="min-h-[28rem]">
          <CardHeader className="border-b">
            <CardTitle>2. Scan and confirm</CardTitle>
            <CardDescription>
              {selected
                ? `Writing to the ${payload?.serialField ?? "Serial Number"} field on this record.`
                : "Choose an asset first. The camera and scanner unlock after that."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {!selected ? (
              <div className="flex min-h-72 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center">
                <Barcode className="size-10 text-muted-foreground" />
                <p className="font-medium">Select an asset on the left</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  That keeps the serial bound to one Lark Base row. After you pick it, scan,
                  review, then submit.
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-xl bg-muted/60 p-4">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Selected record
                  </p>
                  <p className="mt-1 text-lg font-semibold">{selected.name}</p>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">Current serial</dt>
                      <dd className="font-mono">
                        {selected.serialNumber || "Empty"}
                      </dd>
                    </div>
                    {Object.entries(selected.extra).map(([key, value]) => (
                      <div key={key}>
                        <dt className="text-muted-foreground">{key}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
                  <span className="relative flex size-2.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
                  </span>
                  <Usb className="size-4 text-muted-foreground" />
                  <span>Hardware scanner ready. Click the serial field or just scan.</span>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="serial">New serial number</Label>
                  <Input
                    id="serial"
                    value={serial}
                    onChange={(event) => {
                      setSerial(event.target.value);
                      setScanSource(null);
                    }}
                    placeholder="Scan or type the serial"
                    className="h-12 font-mono text-base"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {scanSource ? (
                    <p className="text-xs text-muted-foreground">Captured from {scanSource}.</p>
                  ) : null}
                </div>

                {candidates.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Other readings from the photo</p>
                    <div className="flex flex-wrap gap-1.5">
                      {candidates.map((item) => (
                        <Button
                          key={item}
                          type="button"
                          size="sm"
                          variant="outline"
                          className="font-mono"
                          onClick={() => applyScan(item, "photo (chosen candidate)")}
                        >
                          {item}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {duplicate ? (
                  <Alert variant="destructive">
                    <AlertTriangle />
                    <AlertTitle>Duplicate serial</AlertTitle>
                    <AlertDescription>
                      {duplicate.name} already uses this serial. Submit is blocked so two
                      assets cannot share one number.
                    </AlertDescription>
                  </Alert>
                ) : null}

                {lastResult && lastResult.recordId === selected.recordId ? (
                  <Alert>
                    <CheckCircle2 />
                    <AlertTitle>Saved</AlertTitle>
                    <AlertDescription>
                      {lastResult.previousSerial || "Empty"} → {lastResult.serialNumber}
                      {lastResult.mode === "lark"
                        ? " in Lark Base."
                        : " in this demo session."}
                    </AlertDescription>
                  </Alert>
                ) : null}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    size="lg"
                    className="h-11 flex-1"
                    onClick={() => setScanOpen(true)}
                  >
                    <ScanLine className="size-4" />
                    Scan barcode or photo
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    className="h-11 flex-1"
                    disabled={!canSubmit}
                    onClick={() => setConfirmOpen(true)}
                  >
                    Review and submit
                  </Button>
                </div>
              </>
            )}
          </CardContent>
          {selected ? (
            <CardFooter className="text-xs text-muted-foreground">
              Submit writes only the serial field on this record. Other columns are left
              unchanged.
            </CardFooter>
          ) : null}
        </Card>
      </div>

      <ScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        showSamples={payload?.mode === "demo"}
        onDetected={(value, meta) =>
          applyScan(
            value,
            meta.source === "barcode" ? "camera / barcode" : "photo text",
            meta.candidates
          )
        }
      />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Write this serial?</DialogTitle>
            <DialogDescription>
              This updates one row in {payload?.tableName ?? "Asset Register"}. Check the
              asset name before you confirm.
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg bg-muted/70 p-3">
                <p className="text-muted-foreground">Asset</p>
                <p className="font-medium">{selected.name}</p>
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">From</p>
                  <p className="font-mono break-all">{selected.serialNumber || "Empty"}</p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <p className="text-xs text-muted-foreground">To</p>
                  <p className="font-mono break-all">{sanitizeSerial(serial)}</p>
                </div>
              </div>
              <Separator />
              <p className="text-muted-foreground">
                Field: {payload?.serialField} · Destination:{" "}
                {payload?.mode === "lark" ? "Lark Base" : "demo store"}
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void confirmSubmit()} disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {payload?.mode === "lark" ? "Write to Lark Base" : "Save serial"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
