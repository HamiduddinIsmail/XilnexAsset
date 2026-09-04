"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Search,
  Wrench,
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
  formatMaintenanceCost,
  isWorkshopJob,
  maintenanceActionLabel,
  previewMaintenanceChanges,
} from "@/lib/maintenance-copy";
import type {
  MaintenanceAdvanceDetails,
  MaintenanceAdvanceResult,
  MaintenanceJob,
  MaintenancePayload,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type StatusFilter = "open" | "progress" | "all";

type MaintenanceDeskProps = {
  initialPayload?: MaintenancePayload | null;
  initialError?: string | null;
};

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

function parsedCost(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  const parsed = Number(text.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function formDetails(
  job: MaintenanceJob | null,
  vendor: string,
  cost: string,
  result: string,
  conditionAfter: string
): MaintenanceAdvanceDetails {
  if (!job) return {};
  if (job.nextAction === "start") return { vendor, cost: parsedCost(cost) };
  if (job.nextAction === "complete") return { result, conditionAfter };
  return {};
}

function canConfirm(
  job: MaintenanceJob,
  vendor: string,
  cost: string,
  result: string,
  conditionAfter: string
) {
  if (!job.nextAction) return false;
  if (!isWorkshopJob(job.type)) return true;
  if (job.nextAction === "start") {
    const costValue = parsedCost(cost);
    return Boolean(vendor.trim()) && costValue != null && costValue >= 0;
  }
  return Boolean(result.trim()) && Boolean(conditionAfter.trim());
}

export function MaintenanceDesk({
  initialPayload = null,
  initialError = null,
}: MaintenanceDeskProps) {
  const [payload, setPayload] = useState<MaintenancePayload | null>(initialPayload);
  const [loadError, setLoadError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("open");
  const [scanOpen, setScanOpen] = useState(false);
  const [pending, setPending] = useState<MaintenanceJob | null>(null);
  const [vendor, setVendor] = useState("");
  const [cost, setCost] = useState("");
  const [result, setResult] = useState("");
  const [conditionAfter, setConditionAfter] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<MaintenanceAdvanceResult | null>(null);

  const details = formDetails(pending, vendor, cost, result, conditionAfter);
  const changes = pending ? previewMaintenanceChanges(pending, details) : [];
  const conditionOptions = payload?.conditionAfterOptions?.length
    ? payload.conditionAfterOptions
    : ["Good", "Fair", "Damaged"];

  async function load() {
    setLoadError(null);
    try {
      const response = await fetch("/api/maintenance?fresh=1", { cache: "no-store" });
      const body = (await response.json()) as MaintenancePayload & { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not load the Maintenance Log.");
      setPayload(body);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load maintenance jobs.");
    } finally {
      setLoading(false);
    }
  }

  const jobs = useMemo(() => {
    const list = payload?.jobs ?? [];
    const q = query.trim().toLowerCase();
    return list.filter((job) => {
      if (filter === "open" && job.status !== "Open") return false;
      if (filter === "progress" && job.status !== "In Progress") return false;
      if (!q) return true;
      return [job.maintenanceId, job.assetName, job.assetId, job.serialNumber, job.issue, job.type]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [payload, filter, query]);

  const openCount = payload?.jobs.filter((job) => job.status === "Open").length ?? 0;
  const progressCount = payload?.jobs.filter((job) => job.status === "In Progress").length ?? 0;

  function askConfirm(job: MaintenanceJob) {
    if (!job.nextAction) {
      toast.error(`${job.maintenanceId} is ${job.status} and cannot be updated here.`);
      return;
    }
    setVendor("");
    setCost("");
    setResult("");
    setConditionAfter("");
    setPending(job);
  }

  async function lookupSerial(serial: string) {
    try {
      const response = await fetch("/api/maintenance/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serial }),
      });
      const body = (await response.json()) as { job?: MaintenanceJob; error?: string };
      if (!response.ok || !body.job) {
        throw new Error(body.error || "No matching maintenance job.");
      }
      askConfirm(body.job);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not match that serial.");
    }
  }

  useHardwareScanner({
    enabled: !scanOpen && !pending,
    onScan: (value) => void lookupSerial(value),
  });

  async function confirmAdvance() {
    if (!pending) return;
    if (!canConfirm(pending, vendor, cost, result, conditionAfter)) {
      toast.error(
        pending.nextAction === "complete"
          ? "Enter the repair result and choose the condition after maintenance."
          : "Enter the vendor and maintenance cost."
      );
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`/api/maintenance/${encodeURIComponent(pending.recordId)}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(details),
      });
      const body = (await response.json()) as MaintenanceAdvanceResult & { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not update that job.");
      setLastResult(body);
      setPending(null);
      toast.success(body.summary);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update that job.");
    } finally {
      setSubmitting(false);
    }
  }

  const workshopPending = pending ? isWorkshopJob(pending.type) : false;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <DeskHeader
        title="Maintenance desk"
        description="Send Repair and Upgrade jobs out with vendor and cost, then record the result and condition when they come back. Start and completion dates are filled automatically. Disposal is unchanged for now."
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
          <AlertTitle>Could not load maintenance</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      {lastResult ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>{lastResult.summary}</AlertTitle>
          <AlertDescription>
            {lastResult.job.maintenanceId} is now {lastResult.job.status}
            {lastResult.job.currentStatus ? ` · asset ${lastResult.job.currentStatus}` : ""}.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="size-4" />
            {payload?.tableName || "Maintenance Log"}
          </CardTitle>
          <CardDescription>
            {openCount} Open · {progressCount} In Progress. Scan a serial or tap a job to apply the
            next step.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search asset, serial, or job ID"
                className="h-10 pl-9"
              />
            </div>
            <div className="flex rounded-lg border p-0.5">
              {(
                [
                  ["open", `Open (${openCount})`],
                  ["progress", `In Progress (${progressCount})`],
                  ["all", "All active"],
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

          <ScrollArea className="h-[min(68vh,640px)] rounded-xl border">
            {loading && !payload ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-24 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : jobs.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-8 text-center">
                <Wrench className="size-8 text-muted-foreground" />
                <p className="font-medium">No jobs in this view</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  {filter === "open"
                    ? "There are no Open maintenance jobs right now."
                    : "Try All active, or scan a serial to find a job."}
                </p>
              </div>
            ) : (
              <ul className="divide-y">
                {jobs.map((job) => (
                  <li key={job.recordId} className="p-3 sm:p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="font-semibold">{job.assetName}</p>
                          <Badge variant="secondary">{job.status}</Badge>
                          <Badge variant={job.type === "Disposal" ? "destructive" : "outline"}>
                            {job.type}
                          </Badge>
                          {job.priority ? <Badge variant="outline">{job.priority}</Badge> : null}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {[job.maintenanceId, job.assetId, job.serialNumber || "No serial"]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        {job.issue ? <p className="text-sm">{job.issue}</p> : null}
                        <p className="text-xs text-muted-foreground">
                          Asset {job.currentStatus || "—"} · {job.assetCondition || "no condition"}
                          {job.assignee ? ` · Assigned to ${job.assignee}` : " · No assignee"}
                        </p>
                        {job.vendor ? (
                          <p className="text-xs text-muted-foreground">
                            Vendor {job.vendor}
                            {job.cost != null ? ` · Cost ${formatMaintenanceCost(job.cost)}` : ""}
                          </p>
                        ) : null}
                      </div>
                      {job.nextAction ? (
                        <Button
                          type="button"
                          size="lg"
                          variant={job.nextAction === "complete" ? "default" : "outline"}
                          className="shrink-0"
                          onClick={() => askConfirm(job)}
                        >
                          {maintenanceActionLabel(job)}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <ScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        showSamples={payload?.mode === "demo"}
        onDetected={(value) => {
          setScanOpen(false);
          void lookupSerial(value);
        }}
      />

      <Dialog
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open && !submitting) setPending(null);
        }}
      >
        <DialogContent className="flex max-h-[min(90dvh,40rem)] flex-col overflow-hidden sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{pending ? maintenanceActionLabel(pending) : "Confirm"}</DialogTitle>
            <DialogDescription>
              {pending
                ? `${pending.maintenanceId} · ${pending.assetName}`
                : "Review the Lark fields that will change."}
            </DialogDescription>
          </DialogHeader>
          {pending ? (
            <div className="min-h-0 space-y-4 overflow-y-auto">
              {workshopPending && pending.nextAction === "start" ? (
                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="maintenance-vendor">Vendor / Technician</Label>
                    <Input
                      id="maintenance-vendor"
                      value={vendor}
                      onChange={(event) => setVendor(event.target.value)}
                      placeholder="Who is doing the work?"
                      autoComplete="off"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="maintenance-cost">Maintenance Cost</Label>
                    <Input
                      id="maintenance-cost"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={cost}
                      onChange={(event) => setCost(event.target.value)}
                      placeholder="Amount"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Start Date is set automatically.</p>
                </div>
              ) : null}
              {workshopPending && pending.nextAction === "complete" ? (
                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="maintenance-result">Repair Result / Action Taken</Label>
                    <Textarea
                      id="maintenance-result"
                      value={result}
                      onChange={(event) => setResult(event.target.value)}
                      placeholder="What was repaired or upgraded?"
                      rows={3}
                    />
                  </div>
                  <ChoiceRow
                    label="Asset Condition After Maintenance"
                    options={conditionOptions}
                    value={conditionAfter}
                    onChange={setConditionAfter}
                  />
                  <p className="text-xs text-muted-foreground">
                    Completion Date is set automatically.
                  </p>
                </div>
              ) : null}
              {!workshopPending && pending.nextAction === "start" ? (
                <p className="text-xs text-muted-foreground">Start Date is set automatically.</p>
              ) : null}
              {!workshopPending && pending.nextAction === "complete" ? (
                <p className="text-xs text-muted-foreground">
                  Completion Date is set automatically. Disposal details are not collected yet.
                </p>
              ) : null}
              <ul className="space-y-1.5 rounded-lg bg-muted/60 p-3 text-sm">
                {changes.map((change) => (
                  <li key={change} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                    <span>{change}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={submitting || !pending || !canConfirm(pending, vendor, cost, result, conditionAfter)}
              onClick={() => void confirmAdvance()}
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
