"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Handshake,
  Loader2,
  PenLine,
  QrCode,
  ScanLine,
  Search,
  Trash2,
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
  defaultHandoverCondition,
  describeHandoverChanges,
  handoverAssetLabel,
  needsReturnDate,
  nextAssetStatus,
  nextTransactionType,
  pickHandoverAssignmentTypes,
  pickHandoverConditions,
  pickHandoverReasons,
} from "@/lib/handover-shared";
import type {
  HandoverAsset,
  HandoverPayload,
  HandoverPerson,
  HandoverResult,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type StatusFilter = "ready" | "assigned" | "all";

type BasketItem = {
  asset: HandoverAsset;
  condition: string;
};

type HandoverDeskProps = {
  initialPayload?: HandoverPayload | null;
  initialError?: string | null;
};

function todayISO() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
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

function PersonChip({
  person,
  selected,
  onSelect,
}: {
  person: HandoverPerson;
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
      {person.avatarUrl ? (
        <img
          src={person.avatarUrl}
          alt=""
          className="size-8 rounded-full bg-white object-cover"
        />
      ) : (
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-full text-xs font-semibold",
            selected ? "bg-white/20" : "bg-muted"
          )}
        >
          {initials(person.name)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{person.name}</span>
        {person.email ? (
          <span className={cn("block truncate text-xs", selected ? "text-white/80" : "text-muted-foreground")}>
            {person.email}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export function HandoverDesk({
  initialPayload = null,
  initialError = null,
}: HandoverDeskProps) {
  const [payload, setPayload] = useState<HandoverPayload | null>(initialPayload);
  const [loadError, setLoadError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(!initialPayload && !initialError);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("ready");
  const [scanOpen, setScanOpen] = useState(false);
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [staffQuery, setStaffQuery] = useState("");
  const [staffId, setStaffId] = useState("");
  const [location, setLocation] = useState("");
  const [assignmentType, setAssignmentType] = useState("Permanent");
  const [reason, setReason] = useState("New Joiner");
  const [handoverDate, setHandoverDate] = useState(todayISO);
  const [expectedReturnDate, setExpectedReturnDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [signBusy, setSignBusy] = useState(false);
  const [signToken, setSignToken] = useState("");
  const [signUrl, setSignUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [signError, setSignError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<HandoverResult | null>(null);
  const reasons = pickHandoverReasons(payload?.options.reasons ?? []);
  const conditions = pickHandoverConditions(payload?.options.conditions ?? []);
  const assignmentTypes = pickHandoverAssignmentTypes(payload?.options.assignmentTypes ?? []);

  const staff = payload?.people.find((person) => person.id === staffId) ?? null;

  const basketKey = basket.map((item) => item.asset.recordId).join(",");

  useEffect(() => {
    setAcknowledged(false);
    setSignToken("");
    setSignUrl("");
    setQrDataUrl("");
    setSignaturePreview(null);
    setSignError(null);
  }, [basketKey, staffId]);

  useEffect(() => {
    if (!signOpen || !signToken || acknowledged) return;
    let cancelled = false;
    async function tick() {
      try {
        const response = await fetch(`/api/handover/sign/${signToken}`, { cache: "no-store" });
        const body = (await response.json()) as {
          signed?: boolean;
          signatureDataUrl?: string;
        };
        if (cancelled || !response.ok || !body.signed) return;
        setAcknowledged(true);
        setSignaturePreview(body.signatureDataUrl ?? null);
        setSignOpen(false);
        toast.success(`${staff?.name || "Employee"} signed. You can review the handover.`);
      } catch {
        /* keep waiting */
      }
    }
    void tick();
    const timer = window.setInterval(() => void tick(), 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [acknowledged, signOpen, signToken, staff?.name]);

  async function startSignature() {
    if (!basket.length || !staff) {
      toast.error("Add assets and pick who receives them first.");
      return;
    }
    setSignBusy(true);
    setSignError(null);
    setAcknowledged(false);
    setSignaturePreview(null);
    setSignOpen(true);
    try {
      const response = await fetch("/api/handover/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetRecordIds: basket.map((item) => item.asset.recordId),
          staffId: staff.id,
        }),
      });
      const body = (await response.json()) as { token?: string; signPath?: string; error?: string };
      if (!response.ok || !body.token || !body.signPath) {
        throw new Error(body.error || "Could not create a signing QR.");
      }
      const url = `${window.location.origin}${body.signPath}`;
      setSignToken(body.token);
      setSignUrl(url);
      const QRCode = (await import("qrcode")).default;
      setQrDataUrl(await QRCode.toDataURL(url, { width: 280, margin: 1, errorCorrectionLevel: "M" }));
    } catch (error) {
      setSignError(error instanceof Error ? error.message : "Could not create a signing QR.");
    } finally {
      setSignBusy(false);
    }
  }

  async function load() {
    setLoadError(null);
    try {
      const response = await fetch("/api/handover?fresh=1", { cache: "no-store" });
      const body = (await response.json()) as HandoverPayload & { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not load the handover desk.");
      setPayload(body);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load handover.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialPayload || initialError) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addAsset(asset: HandoverAsset) {
    if (asset.blockedReason) {
      toast.error(asset.blockedReason);
      return;
    }
    if (basket.some((item) => item.asset.recordId === asset.recordId)) {
      toast.error(`${asset.name} is already in the handover list.`);
      return;
    }
    if (staff && asset.assigneeId === staff.id) {
      toast.error(`${asset.name} is already assigned to ${staff.name}.`);
      return;
    }
    setBasket((items) => [
      ...items,
      { asset, condition: defaultHandoverCondition(asset, conditions) },
    ]);
    if (!location) setLocation(asset.location || payload?.options.locations[0] || "");
    setLastResult(null);
    toast.success(`Added ${handoverAssetLabel(asset.assetId, asset.name)}`);
  }

  const assets = useMemo(() => {
    const list = payload?.assets ?? [];
    const q = query.trim().toLowerCase();
    const inBasket = new Set(basket.map((item) => item.asset.recordId));
    return list.filter((asset) => {
      if (inBasket.has(asset.recordId)) return false;
      if (filter === "ready" && (asset.blockedReason || ["Assigned", "Loan"].includes(asset.currentStatus))) {
        return false;
      }
      if (filter === "assigned" && !["Assigned", "Loan"].includes(asset.currentStatus)) return false;
      if (!q) return true;
      return [asset.name, asset.assetId, asset.serialNumber, asset.assigneeName, asset.location]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [payload, filter, query, basket]);

  const people = useMemo(() => {
    const list = payload?.people ?? [];
    const q = staffQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((person) =>
      [person.name, person.email].join(" ").toLowerCase().includes(q)
    );
  }, [payload, staffQuery]);

  const readyCount = payload?.assets.filter((asset) => !asset.blockedReason && !["Assigned", "Loan"].includes(asset.currentStatus)).length ?? 0;
  const assignedCount = payload?.assets.filter((asset) => ["Assigned", "Loan"].includes(asset.currentStatus)).length ?? 0;

  async function lookupSerial(serial: string) {
    try {
      const response = await fetch("/api/handover/lookup", {
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

  const preview = staff
    ? basket.flatMap((item) =>
        describeHandoverChanges({
          assetName: item.asset.name,
          assetId: item.asset.assetId,
          staffName: staff.name,
          previousAssignee: item.asset.assigneeName,
          nextStatus: nextAssetStatus(assignmentType),
          location,
          condition: item.condition,
          transactionType: nextTransactionType(item.asset.assigneeId, assignmentType),
          transactionId: "new",
          signatureAttached: true,
        })
      )
    : [];

  const alreadyHeld = staff
    ? basket.filter((item) => item.asset.assigneeId === staff.id)
    : [];

  const canConfirm =
    basket.length > 0 &&
    basket.every((item) => item.condition && !item.asset.blockedReason) &&
    Boolean(staff) &&
    Boolean(location) &&
    Boolean(assignmentType) &&
    Boolean(reason) &&
    Boolean(handoverDate) &&
    (!needsReturnDate(assignmentType) || Boolean(expectedReturnDate)) &&
    acknowledged &&
    alreadyHeld.length === 0;

  async function confirmSubmit() {
    if (!basket.length || !staff) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/handover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: basket.map((item) => ({
            assetRecordId: item.asset.recordId,
            condition: item.condition,
          })),
          staffId,
          location,
          assignmentType,
          reason,
          handoverDate,
          expectedReturnDate,
          remarks,
          acknowledged,
          signatureToken: signToken,
        }),
      });
      const body = (await response.json()) as HandoverResult & { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not complete handover.");
      setLastResult(body);
      setConfirmOpen(false);
      setBasket([]);
      setStaffId("");
      setAcknowledged(false);
      setSignToken("");
      setSignaturePreview(null);
      setRemarks("");
      toast.success(body.summary, {
        description:
          body.mode === "lark"
            ? `${body.transactionIds.join(", ")} written to Transaction Log.`
            : "Saved in demo mode. Connect Lark Base to write the live tables.",
      });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not complete handover.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <DeskHeader
        title="Asset handover"
        description="Pick who receives the kit, add laptop, mouse, bag, and the rest, then confirm once."
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

      {payload?.peopleLimited ? (
        <Alert>
          <UserRound />
          <AlertTitle>Employee list is incomplete</AlertTitle>
          <AlertDescription>
            {payload.peopleHint ||
              "Lark is only sending people this custom app is allowed to read. Set the app’s Contacts permission to All employees, then tap Refresh."}
          </AlertDescription>
        </Alert>
      ) : null}

      {loadError ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Could not load handover</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      {lastResult ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>{lastResult.summary}</AlertTitle>
          <AlertDescription>
            {lastResult.transactionIds.join(" · ") || "Saved"}
            {lastResult.assets[0]
              ? ` · ${lastResult.assets.length === 1
                  ? `${lastResult.assets[0].name} is ${lastResult.assets[0].currentStatus}`
                  : `${lastResult.assets.length} assets handed over`}`
              : ""}
            {lastResult.assets[0]?.assigneeName ? ` to ${lastResult.assets[0].assigneeName}` : ""}.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <ScanLine className="size-4" />
              Assets to hand over
            </CardTitle>
            <CardDescription>
              Scan or tap several items for the same person. Assigned stock is a transfer.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name, serial, tag, or holder"
                  className="h-10 pl-9"
                />
              </div>
              <div className="flex rounded-lg border p-0.5">
                {(
                  [
                    ["ready", `Ready (${readyCount})`],
                    ["assigned", `Assigned (${assignedCount})`],
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
                  <Handshake className="size-8 text-muted-foreground" />
                  <p className="font-medium">No assets in this view</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Try All, or scan a serial. Repair, disposal, and missing assets stay blocked.
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
                                : `Unassigned${asset.condition ? ` · ${asset.condition}` : ""}`}
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
                <ArrowRightLeft className="size-4" />
                Handover list ({basket.length})
              </span>
              {basket.length ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => setBasket([])}>
                  <Trash2 className="size-3.5" />
                  Clear
                </Button>
              ) : null}
            </CardTitle>
            <CardDescription>
              {staff
                ? `To ${staff.name}. Add laptop, mouse, bag, then collect one signature.`
                : "Pick who receives the assets, then add items from the left."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="staff-search">Handover To ({payload?.people.length ?? 0})</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="staff-search"
                  value={staffQuery}
                  onChange={(event) => setStaffQuery(event.target.value)}
                  placeholder="Search name or email"
                  className="h-10 pl-9"
                />
              </div>
              <ScrollArea className="h-44 rounded-xl border p-1.5">
                {people.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">No matching people.</p>
                ) : (
                  <div className="space-y-1">
                    {people.map((person) => (
                      <PersonChip
                        key={person.id}
                        person={person}
                        selected={person.id === staffId}
                        onSelect={() => setStaffId(person.id)}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            {basket.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing queued. Scan or tap assets on the left to add them for this person.
              </p>
            ) : (
              <ul className="space-y-3">
                {basket.map((item) => (
                  <li key={item.asset.recordId} className="rounded-xl border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {handoverAssetLabel(item.asset.assetId, item.asset.name)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {[item.asset.serialNumber || "No serial", item.asset.currentStatus]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() =>
                          setBasket((items) =>
                            items.filter((row) => row.asset.recordId !== item.asset.recordId)
                          )
                        }
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                    <div className="mt-3">
                      <ChoiceRow
                        label="Condition on handover"
                        options={conditions}
                        value={item.condition}
                        onChange={(condition) =>
                          setBasket((items) =>
                            items.map((row) =>
                              row.asset.recordId === item.asset.recordId ? { ...row, condition } : row
                            )
                          )
                        }
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="handover-date">Handover date</Label>
              <Input
                id="handover-date"
                type="date"
                className="h-10"
                value={handoverDate}
                onChange={(event) => setHandoverDate(event.target.value)}
              />
            </div>

            <ChoiceRow
              label="Location"
              options={payload?.options.locations ?? []}
              value={location}
              onChange={setLocation}
            />
            <ChoiceRow
              label="Assignment type"
              options={assignmentTypes}
              value={assignmentType}
              onChange={setAssignmentType}
            />
            <ChoiceRow
              label="Reason"
              options={reasons}
              value={reason}
              onChange={setReason}
            />

            {needsReturnDate(assignmentType) ? (
              <div className="space-y-1.5">
                <Label htmlFor="return-date">Expected return date</Label>
                <Input
                  id="return-date"
                  type="date"
                  className="h-10"
                  value={expectedReturnDate}
                  onChange={(event) => setExpectedReturnDate(event.target.value)}
                />
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="remarks">Remarks (optional)</Label>
              <Textarea
                id="remarks"
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
                placeholder="Anything the next person should know"
              />
            </div>

            {acknowledged && signaturePreview ? (
              <div className="space-y-3 rounded-xl border bg-[var(--brand)]/15 p-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2 className="size-4" />
                  Signed by {staff?.name}
                </p>
                <img
                  src={signaturePreview}
                  alt={`${staff?.name || "Employee"} signature`}
                  className="w-full rounded-lg bg-white"
                />
                <p className="text-xs text-muted-foreground">
                  Confirm writes this PNG onto the Transaction Log Signature attachment for every asset in the list.
                </p>
                <Button type="button" variant="outline" size="sm" onClick={() => void startSignature()}>
                  <PenLine className="size-3.5" />
                  Collect a new signature
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void startSignature()}
                className="w-full rounded-xl border border-border bg-background/40 p-3 text-left text-sm transition-colors hover:bg-muted"
              >
                <span className="flex items-start gap-2">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border">
                    <QrCode className="size-3.5" />
                  </span>
                  <span>
                    <span className="block font-medium">Employee acknowledgement</span>
                    <span className="mt-1 block text-muted-foreground">
                      One QR covers every asset in this list. The employee signs once on their phone.
                    </span>
                  </span>
                </span>
              </button>
            )}

            {alreadyHeld.length ? (
              <p className="text-sm text-destructive">
                {alreadyHeld.length === 1
                  ? `${alreadyHeld[0].asset.name} is already assigned to ${staff?.name}.`
                  : `${alreadyHeld.length} of these assets are already assigned to ${staff?.name}.`}
              </p>
            ) : null}

            <Button
              type="button"
              size="lg"
              className="w-full"
              disabled={!canConfirm}
              onClick={() => setConfirmOpen(true)}
            >
              Review handover
            </Button>
            {!acknowledged && basket.length > 0 && staff ? (
              <p className="text-center text-xs text-muted-foreground">
                Review stays locked until {staff.name} saves a signature.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {payload?.recent.length ? (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Recent handovers</CardTitle>
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
                    {[item.assignmentType, item.status, item.effectiveDate].filter(Boolean).join(" · ")}
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

      <Dialog open={signOpen} onOpenChange={(open) => !signBusy && setSignOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Employee signature</DialogTitle>
            <DialogDescription>
              {staff
                ? `Ask ${staff.name} to scan this QR on their phone and sign.`
                : "Ask the employee to scan this QR on their phone and sign."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3">
            {signBusy ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Preparing the signing page…
              </p>
            ) : qrDataUrl ? (
              <img src={qrDataUrl} alt="Signing QR code" className="size-56 rounded-xl bg-white p-2" />
            ) : null}
            {signUrl ? (
              <p className="w-full break-all rounded-lg bg-muted/60 px-3 py-2 text-center text-xs text-muted-foreground">
                {signUrl}
              </p>
            ) : null}
            {signUrl.includes("://127.0.0.1") || signUrl.includes("://localhost") ? (
              <p className="text-center text-xs text-muted-foreground">
                A phone cannot open 127.0.0.1. Use this on the live site, or open the signing page
                on this screen.
              </p>
            ) : null}
            {signError ? <p className="text-sm text-destructive">{signError}</p> : null}
            {!acknowledged && !signBusy ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Waiting for the signature…
              </p>
            ) : null}
          </div>
          <DialogFooter>
            {signUrl ? (
              <Button type="button" variant="outline" onClick={() => window.open(signUrl, "_blank")}>
                Open on this screen
              </Button>
            ) : null}
            <Button type="button" variant="outline" disabled={signBusy} onClick={() => setSignOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={(open) => !open && !submitting && setConfirmOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm handover</DialogTitle>
            <DialogDescription>
              {staff
                ? basket.length === 1
                  ? `${handoverAssetLabel(basket[0].asset.assetId, basket[0].asset.name)} → ${staff.name}`
                  : `${basket.length} assets → ${staff.name}`
                : "Review what will be written to Lark."}
            </DialogDescription>
          </DialogHeader>
          {basket.length > 1 ? (
            <ul className="space-y-1 text-sm">
              {basket.map((item) => (
                <li key={item.asset.recordId} className="text-muted-foreground">
                  {handoverAssetLabel(item.asset.assetId, item.asset.name)}
                  {item.condition ? ` · ${item.condition}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="max-h-64 space-y-1.5 overflow-auto rounded-lg bg-muted/60 p-3 text-sm">
            {preview.map((change, index) => (
              <li key={`${change}-${index}`} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                <span>{change}</span>
              </li>
            ))}
          </ul>
          {signaturePreview ? (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Employee signature</p>
              <img
                src={signaturePreview}
                alt="Employee signature"
                className="w-full rounded-lg bg-white"
              />
            </div>
          ) : null}
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
