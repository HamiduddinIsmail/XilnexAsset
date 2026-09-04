"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ScanLine,
  Search,
  Trash2,
  Undo2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { DeskHeader } from "@/components/desk-header";
import { ScanDialog } from "@/components/scan-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { Textarea } from "@/components/ui/textarea";
import { useHardwareScanner } from "@/hooks/use-hardware-scanner";
import {
  defaultReturnCondition,
  defaultReturnReason,
  describeReturnChanges,
  holderKeyForAsset,
  keepsAssignee,
  listReturnHolders,
  maintenanceTypeForReturn,
  needsMaintenanceJob,
  nextStatusAfterReturn,
  returnItemHint,
  type ReturnHolder,
} from "@/lib/return-shared";
import type { HandoverAsset, ReturnPayload, ReturnResult } from "@/lib/types";
import { cn } from "@/lib/utils";

type StatusFilter = "out" | "all";

type BasketItem = {
  asset: HandoverAsset;
  reason: string;
  condition: string;
};

type ReturnDeskProps = {
  initialPayload?: ReturnPayload | null;
  initialError?: string | null;
};

function todayISO() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function ChoiceRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={value === option ? "default" : "outline"}
            className={cn(value === option && "bg-[var(--brand)] text-white")}
            onClick={() => onChange(option)}
          >
            {option}
          </Button>
        ))}
      </div>
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function HolderRow({
  holder,
  selected,
  onSelect,
}: {
  holder: ReturnHolder;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors",
        selected
          ? "border-transparent bg-[var(--brand)] text-white"
          : "border-border bg-background/40 hover:bg-muted"
      )}
    >
      <span
        className={cn(
          "flex size-8 items-center justify-center rounded-full text-xs font-semibold",
          selected ? "bg-white/20" : "bg-muted"
        )}
      >
        {initials(holder.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{holder.name}</span>
        {holder.email ? (
          <span className={cn("block truncate text-xs", selected ? "text-white/80" : "text-muted-foreground")}>
            {holder.email}
          </span>
        ) : null}
      </span>
      <span className={cn("shrink-0 text-xs", selected ? "text-white/90" : "text-muted-foreground")}>
        {holder.outCount} out
      </span>
    </button>
  );
}

export function ReturnDesk({
  initialPayload = null,
  initialError = null,
}: ReturnDeskProps) {
  const [payload, setPayload] = useState<ReturnPayload | null>(initialPayload);
  const [loadError, setLoadError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [holderQuery, setHolderQuery] = useState("");
  const [holderKey, setHolderKey] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("out");
  const [scanOpen, setScanOpen] = useState(false);
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [location, setLocation] = useState("");
  const [returnDate, setReturnDate] = useState(todayISO);
  const [remarks, setRemarks] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<ReturnResult | null>(null);

  async function load() {
    setLoadError(null);
    try {
      const response = await fetch("/api/return?fresh=1", { cache: "no-store" });
      const body = (await response.json()) as ReturnPayload & { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not load the return desk.");
      setPayload(body);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load returns.");
    } finally {
      setLoading(false);
    }
  }

  function addAsset(asset: HandoverAsset) {
    queueAssets([asset], { single: true });
  }

  function queueAssets(list: HandoverAsset[], options?: { single?: boolean }) {
    const reasons = payload?.options.reasons ?? [];
    const conditions = payload?.options.conditions ?? [];
    const inBasket = new Set(basket.map((item) => item.asset.recordId));
    const next: BasketItem[] = [];
    let blockedMessage = "";

    for (const asset of list) {
      if (inBasket.has(asset.recordId) || next.some((item) => item.asset.recordId === asset.recordId)) {
        if (options?.single) {
          toast.error(`${asset.name} is already in the return list.`);
          return;
        }
        continue;
      }
      if (asset.blockedReason) {
        if (options?.single) {
          toast.error(asset.blockedReason);
          return;
        }
        blockedMessage = asset.blockedReason;
        continue;
      }
      next.push({
        asset,
        reason: defaultReturnReason(reasons),
        condition: defaultReturnCondition(asset, conditions),
      });
    }

    if (!next.length) {
      toast.error(
        blockedMessage ||
          (options?.single ? "Could not add that asset." : "Nothing left to add for this person.")
      );
      return;
    }

    setBasket((items) => [...items, ...next]);
    if (!location) setLocation(next[0].asset.location || payload?.options.locations[0] || "");
    setLastResult(null);
    toast.success(next.length === 1 ? `Added ${next[0].asset.name}` : `Added ${next.length} assets`);
  }

  const holders = useMemo(() => listReturnHolders(payload?.assets ?? []), [payload]);
  const selectedHolder = holders.find((holder) => holder.key === holderKey) ?? null;
  const visibleHolders = useMemo(() => {
    const q = holderQuery.trim().toLowerCase();
    if (!q) return holders;
    return holders.filter((holder) =>
      [holder.name, holder.email].join(" ").toLowerCase().includes(q)
    );
  }, [holders, holderQuery]);

  const assets = useMemo(() => {
    const list = payload?.assets ?? [];
    const q = query.trim().toLowerCase();
    const inBasket = new Set(basket.map((item) => item.asset.recordId));
    return list.filter((asset) => {
      if (inBasket.has(asset.recordId)) return false;
      if (holderKey && holderKeyForAsset(asset) !== holderKey) return false;
      if (filter === "out" && asset.blockedReason) return false;
      if (!q) return true;
      return [asset.name, asset.assetId, asset.serialNumber, asset.assigneeName, asset.location]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [payload, filter, query, basket, holderKey]);

  const addableCount = assets.filter((asset) => !asset.blockedReason).length;
  const outCount = payload?.assets.filter((asset) => !asset.blockedReason).length ?? 0;

  async function lookupSerial(serial: string) {
    try {
      const response = await fetch("/api/return/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serial }),
      });
      const body = (await response.json()) as { asset?: HandoverAsset; error?: string };
      if (!response.ok || !body.asset) throw new Error(body.error || "No matching asset.");
      addAsset(body.asset);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not match that serial.");
    }
  }

  useHardwareScanner({
    enabled: !scanOpen && !confirmOpen,
    onScan: (value) => void lookupSerial(value),
  });

  const preview = basket.flatMap((item) =>
    describeReturnChanges({
      assetName: item.asset.name,
      previousAssignee: item.asset.assigneeName,
      nextStatus: nextStatusAfterReturn(item.reason, item.condition),
      location,
      condition: item.condition,
      reason: item.reason,
      transactionId: "new",
      assigneeKept: keepsAssignee(item.reason),
      maintenanceCreated: needsMaintenanceJob(item.reason, item.condition),
      maintenanceType: maintenanceTypeForReturn(item.reason),
    })
  );

  const canConfirm =
    basket.length > 0 &&
    Boolean(location) &&
    Boolean(returnDate) &&
    basket.every((item) => item.reason && item.condition) &&
    acknowledged;

  async function confirmSubmit() {
    setSubmitting(true);
    try {
      const response = await fetch("/api/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: basket.map((item) => ({
            assetRecordId: item.asset.recordId,
            reason: item.reason,
            condition: item.condition,
          })),
          location,
          returnDate,
          remarks,
          acknowledged,
        }),
      });
      const body = (await response.json()) as ReturnResult & { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not complete return.");
      setLastResult(body);
      setConfirmOpen(false);
      setBasket([]);
      setAcknowledged(false);
      setRemarks("");
      toast.success(body.summary, {
        description:
          body.mode === "lark"
            ? [
                body.transactionIds.join(", ") && `${body.transactionIds.join(", ")} written to Transaction Log.`,
                body.maintenanceIds?.length
                  ? `${body.maintenanceIds.join(", ")} opened on Maintenance Log.`
                  : "",
              ]
                .filter(Boolean)
                .join(" ")
            : "Saved in demo mode. Connect Lark Base to write the live tables.",
      });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not complete return.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <DeskHeader
        title="Asset return"
        description="Filter by who holds the assets, or scan a serial. Resignation and Project End clear the assignee. Repair and Upgrade keep them and open a maintenance job."
        mode={payload?.mode}
        loading={loading}
        onRefresh={() => {
          setLoading(true);
          void load();
        }}
        onScan={() => setScanOpen(true)}
      />

      {payload?.warning ? (
        <Alert>
          <AlertTriangle />
          <AlertTitle>Running against demo data</AlertTitle>
          <AlertDescription>{payload.warning}</AlertDescription>
        </Alert>
      ) : null}

      {loadError ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Could not load returns</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      {lastResult ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>{lastResult.summary}</AlertTitle>
          <AlertDescription>
            {lastResult.transactionIds.join(" · ") || "Saved"}
            {lastResult.maintenanceIds?.length
              ? ` · Maintenance ${lastResult.maintenanceIds.join(", ")}`
              : ""}
            {lastResult.assets[0] ? ` · ${lastResult.assets[0].name} is ${lastResult.assets[0].currentStatus}` : ""}.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <ScanLine className="size-4" />
              Assets out
            </CardTitle>
            <CardDescription>
              {selectedHolder
                ? `Showing what is with ${selectedHolder.name}. Tap an asset or add all of theirs.`
                : "Pick a staff member to see what they hold, or scan a serial."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {selectedHolder ? (
              <div className="flex flex-col gap-2 rounded-xl border bg-background/40 p-2.5 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="flex size-9 items-center justify-center rounded-full bg-[var(--brand)] text-xs font-semibold text-white">
                    {initials(selectedHolder.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{selectedHolder.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[selectedHolder.email, `${addableCount} still out`].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setHolderKey("");
                      setHolderQuery("");
                    }}
                  >
                    Change staff
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={addableCount === 0}
                    onClick={() =>
                      queueAssets(assets.filter((asset) => !asset.blockedReason))
                    }
                  >
                    Add all ({addableCount})
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="holder-search">Staff ({holders.length})</Label>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="holder-search"
                    value={holderQuery}
                    onChange={(event) => setHolderQuery(event.target.value)}
                    placeholder="Filter by employee name"
                    className="h-10 pl-9"
                    autoComplete="off"
                  />
                </div>
                {holders.length === 0 ? (
                  <p className="rounded-xl border px-3 py-4 text-sm text-muted-foreground">
                    No staff currently hold assets in this register.
                  </p>
                ) : visibleHolders.length === 0 ? (
                  <p className="rounded-xl border px-3 py-4 text-sm text-muted-foreground">
                    No employee matches “{holderQuery.trim()}”.
                  </p>
                ) : (
                  <ScrollArea className="h-44 rounded-xl border p-1.5">
                    <div className="space-y-1">
                      {visibleHolders.map((holder) => (
                        <HolderRow
                          key={holder.key}
                          holder={holder}
                          selected={false}
                          onSelect={() => {
                            setHolderKey(holder.key);
                            setHolderQuery("");
                            setQuery("");
                          }}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={
                    selectedHolder
                      ? "Search this person’s assets"
                      : "Search name, serial, or tag"
                  }
                  className="h-10 pl-9"
                />
              </div>
              <div className="flex rounded-lg border p-0.5">
                {(
                  [
                    ["out", `Out (${outCount})`],
                    ["all", "All"],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={filter === value ? "default" : "ghost"}
                    className={cn(filter === value && "bg-[var(--brand)] text-white")}
                    onClick={() => setFilter(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <ScrollArea className="h-[min(62vh,560px)] rounded-xl border">
              {assets.length === 0 ? (
                <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-8 text-center">
                  <Undo2 className="size-8 text-muted-foreground" />
                  <p className="font-medium">
                    {selectedHolder ? `Nothing listed for ${selectedHolder.name}` : "No assets in this view"}
                  </p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    {selectedHolder
                      ? "They may have nothing out, or those items are already in the return list."
                      : "Only Assigned and Loan stock can be returned. Pick a staff member or scan a serial."}
                  </p>
                </div>
              ) : (
                <ul className="divide-y">
                  {assets.map((asset) => (
                    <li key={asset.recordId}>
                      <button
                        type="button"
                        disabled={Boolean(asset.blockedReason)}
                        onClick={() => addAsset(asset)}
                        className={cn(
                          "flex w-full flex-col gap-1 px-3 py-3 text-left sm:px-4",
                          asset.blockedReason && "opacity-60"
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="font-semibold">{asset.name}</p>
                          <Badge variant={asset.blockedReason ? "destructive" : "secondary"}>
                            {asset.currentStatus || "Unknown"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {[asset.assetId, asset.serialNumber || "No serial", asset.location]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {asset.blockedReason
                            ? asset.blockedReason
                            : asset.assigneeName
                              ? `With ${asset.assigneeName}${asset.condition ? ` · ${asset.condition}` : ""}`
                              : `No holder listed${asset.condition ? ` · ${asset.condition}` : ""}`}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Undo2 className="size-4" />
                Return list ({basket.length})
              </span>
              {basket.length ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => setBasket([])}>
                  <Trash2 className="size-3.5" />
                  Clear
                </Button>
              ) : null}
            </CardTitle>
            <CardDescription>
              {basket.length
                ? "Resignation and Project End clear the holder. Repair and Upgrade keep them."
                : "Pick a staff member, scan, or tap assets on the left."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {basket.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing queued. You can return several assets in one confirm.
              </p>
            ) : (
              <>
                <ul className="space-y-3">
                  {basket.map((item) => (
                    <li key={item.asset.recordId} className="rounded-xl border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium">{item.asset.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {[item.asset.serialNumber || "No serial", item.asset.assigneeName || "No holder"]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          onClick={() =>
                            setBasket((items) => items.filter((row) => row.asset.recordId !== item.asset.recordId))
                          }
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                      <div className="mt-3 space-y-3">
                        <ChoiceRow
                          label="Return reason"
                          options={payload?.options.reasons ?? []}
                          value={item.reason}
                          onChange={(reason) =>
                            setBasket((items) =>
                              items.map((row) =>
                                row.asset.recordId === item.asset.recordId ? { ...row, reason } : row
                              )
                            )
                          }
                        />
                        <ChoiceRow
                          label="Condition on return"
                          options={payload?.options.conditions ?? []}
                          value={item.condition}
                          onChange={(condition) =>
                            setBasket((items) =>
                              items.map((row) =>
                                row.asset.recordId === item.asset.recordId ? { ...row, condition } : row
                              )
                            )
                          }
                        />
                        {item.reason || item.condition === "Damaged" ? (
                          <p className="text-xs text-muted-foreground">
                            {returnItemHint(item.reason, item.condition)}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="space-y-1.5">
                  <Label htmlFor="return-date">Return date</Label>
                  <Input
                    id="return-date"
                    type="date"
                    className="h-10"
                    value={returnDate}
                    onChange={(event) => setReturnDate(event.target.value)}
                  />
                </div>

                <ChoiceRow
                  label="Return location"
                  options={payload?.options.locations ?? []}
                  value={location}
                  onChange={setLocation}
                />

                <div className="space-y-1.5">
                  <Label htmlFor="return-remarks">Remarks (optional)</Label>
                  <Textarea
                    id="return-remarks"
                    value={remarks}
                    onChange={(event) => setRemarks(event.target.value)}
                    placeholder="Damage notes, accessories missing, anything to inspect"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setAcknowledged((value) => !value)}
                  className={cn(
                    "w-full rounded-xl border p-3 text-left text-sm transition-colors",
                    acknowledged
                      ? "border-transparent bg-[var(--brand)]/25"
                      : "border-border bg-background/40"
                  )}
                >
                  <span className="flex items-start gap-2">
                    <span
                      className={cn(
                        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border",
                        acknowledged && "border-transparent bg-[var(--brand)] text-white"
                      )}
                    >
                      {acknowledged ? <CheckCircle2 className="size-4" /> : null}
                    </span>
                    <span>
                      <span className="block font-medium">Return acknowledgement</span>
                      <span className="mt-1 block text-muted-foreground">
                        The employee is returning the assigned company asset(s) in the condition
                        stated here. Damaged or missing items may be inspected or repaired
                        under company policy.
                      </span>
                    </span>
                  </span>
                </button>

                <Button
                  type="button"
                  size="lg"
                  className="w-full"
                  disabled={!canConfirm}
                  onClick={() => setConfirmOpen(true)}
                >
                  Review return
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {payload?.recent.length ? (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Recent returns</CardTitle>
            <CardDescription>{payload.transactionTableName}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y">
              {payload.recent.map((item) => (
                <li key={item.recordId} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{item.assetName}</p>
                    <p className="text-sm text-muted-foreground">
                      {[item.transactionId, item.type, item.staffName, item.location]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {[item.status, item.effectiveDate].filter(Boolean).join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <ScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        showSamples={payload?.mode === "demo"}
        onDetected={(value) => {
          setScanOpen(false);
          void lookupSerial(value);
        }}
      />

      <Dialog open={confirmOpen} onOpenChange={(open) => !open && !submitting && setConfirmOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm return</DialogTitle>
            <DialogDescription>
              {basket.length === 1
                ? `${basket[0].asset.name} back to ${location || "stock"}`
                : `${basket.length} assets back to ${location || "stock"}`}
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-64 space-y-1.5 overflow-auto rounded-lg bg-muted/60 p-3 text-sm">
            {preview.map((change, index) => (
              <li key={`${change}-${index}`} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                <span>{change}</span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={submitting} onClick={() => void confirmSubmit()}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              Write to Lark
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
