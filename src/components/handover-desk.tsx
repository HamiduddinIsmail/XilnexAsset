"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Handshake,
  Loader2,
  ScanLine,
  Search,
  UserRound,
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
  describeHandoverChanges,
  needsReturnDate,
  nextAssetStatus,
  nextTransactionType,
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
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("ready");
  const [scanOpen, setScanOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [staffQuery, setStaffQuery] = useState("");
  const [staffId, setStaffId] = useState("");
  const [location, setLocation] = useState("");
  const [assignmentType, setAssignmentType] = useState("Permanent");
  const [reason, setReason] = useState("New Joiner");
  const [condition, setCondition] = useState("Good");
  const [handoverDate, setHandoverDate] = useState(todayISO);
  const [expectedReturnDate, setExpectedReturnDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<HandoverResult | null>(null);
  const reasons = pickHandoverReasons(payload?.options.reasons ?? []);
  const conditions = pickHandoverConditions(payload?.options.conditions ?? []);

  const selected = payload?.assets.find((asset) => asset.recordId === selectedId) ?? null;
  const staff = payload?.people.find((person) => person.id === staffId) ?? null;

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

  function selectAsset(asset: HandoverAsset) {
    if (asset.blockedReason) {
      toast.error(asset.blockedReason);
      return;
    }
    setSelectedId(asset.recordId);
    setLocation(asset.location || payload?.options.locations[0] || "");
    setCondition(asset.condition && conditions.includes(asset.condition) ? asset.condition : "Good");
    setAcknowledged(false);
    setLastResult(null);
  }

  const assets = useMemo(() => {
    const list = payload?.assets ?? [];
    const q = query.trim().toLowerCase();
    return list.filter((asset) => {
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
  }, [payload, filter, query]);

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
      selectAsset(body.asset);
      toast.success(`Selected ${body.asset.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not match that serial.");
    }
  }

  useHardwareScanner({
    enabled: !scanOpen && !confirmOpen,
    onScan: (value) => void lookupSerial(value),
  });

  const preview = selected && staff
    ? describeHandoverChanges({
        assetName: selected.name,
        staffName: staff.name,
        previousAssignee: selected.assigneeName,
        nextStatus: nextAssetStatus(assignmentType),
        location,
        condition,
        transactionType: nextTransactionType(selected.assigneeId, assignmentType),
        transactionId: "new",
      })
    : [];

  const canConfirm =
    Boolean(selected) &&
    !selected?.blockedReason &&
    Boolean(staff) &&
    Boolean(location) &&
    Boolean(assignmentType) &&
    Boolean(reason) &&
    Boolean(condition) &&
    Boolean(handoverDate) &&
    (!needsReturnDate(assignmentType) || Boolean(expectedReturnDate)) &&
    acknowledged &&
    staff?.id !== selected?.assigneeId;

  async function confirmSubmit() {
    if (!selected) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/handover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetRecordId: selected.recordId,
          staffId,
          location,
          assignmentType,
          reason,
          condition,
          handoverDate,
          expectedReturnDate,
          remarks,
          acknowledged,
        }),
      });
      const body = (await response.json()) as HandoverResult & { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not complete handover.");
      setLastResult(body);
      setConfirmOpen(false);
      setSelectedId(body.asset.recordId);
      setStaffId("");
      setAcknowledged(false);
      setRemarks("");
      toast.success(body.summary, {
        description:
          body.mode === "lark"
            ? `${body.transactionId} written to Transaction Log.`
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
        description="Scan the asset, pick who receives it, and confirm. The register and Transaction Log update immediately — no Lark Approval form."
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
            {lastResult.transactionId} · {lastResult.asset.name} is {lastResult.asset.currentStatus}
            {lastResult.asset.assigneeName ? ` to ${lastResult.asset.assigneeName}` : ""}.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <ScanLine className="size-4" />
              Find the asset
            </CardTitle>
            <CardDescription>
              Scan a serial, or search. Available stock is first; assigned assets are transfers.
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
                  {assets.map((asset) => {
                    const active = asset.recordId === selectedId;
                    return (
                      <li key={asset.recordId}>
                        <button
                          type="button"
                          disabled={Boolean(asset.blockedReason)}
                          onClick={() => selectAsset(asset)}
                          className={cn(
                            "flex w-full flex-col gap-1 px-3 py-3 text-left sm:px-4",
                            active && "bg-[var(--brand)]/20",
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
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <ArrowRightLeft className="size-4" />
              Who receives it
            </CardTitle>
            <CardDescription>
              {selected
                ? `${selected.name}${selected.assigneeName ? ` · currently ${selected.assigneeName}` : " · unassigned"}`
                : "Select an asset first."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {!selected ? (
              <p className="text-sm text-muted-foreground">
                Scan or tap an asset on the left. Details stay empty until then.
              </p>
            ) : (
              <>
                <div className="rounded-xl bg-muted/60 p-3 text-sm">
                  <p className="font-medium">{selected.name}</p>
                  <p className="text-muted-foreground">
                    {[selected.assetId, selected.serialNumber || "No serial", selected.currentStatus]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>

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
                  <ScrollArea className="h-64 rounded-xl border p-1.5">
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
                  options={payload?.options.assignmentTypes ?? []}
                  value={assignmentType}
                  onChange={setAssignmentType}
                />
                <ChoiceRow
                  label="Reason"
                  options={reasons}
                  value={reason}
                  onChange={setReason}
                />
                <ChoiceRow
                  label="Condition on handover"
                  options={conditions}
                  value={condition}
                  onChange={setCondition}
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
                      <span className="block font-medium">Employee acknowledgement</span>
                      <span className="mt-1 block text-muted-foreground">
                        The employee received this asset, will use it under company policy, and
                        will return it when required or when they leave.
                      </span>
                    </span>
                  </span>
                </button>

                {staff && selected.assigneeId === staff.id ? (
                  <p className="text-sm text-destructive">This asset is already assigned to {staff.name}.</p>
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
              </>
            )}
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

      <Dialog open={confirmOpen} onOpenChange={(open) => !open && !submitting && setConfirmOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm handover</DialogTitle>
            <DialogDescription>
              {selected && staff
                ? `${selected.name} → ${staff.name}`
                : "Review what will be written to Lark."}
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-1.5 rounded-lg bg-muted/60 p-3 text-sm">
            {preview.map((change) => (
              <li key={change} className="flex gap-2">
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
