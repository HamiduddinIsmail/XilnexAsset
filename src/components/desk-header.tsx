"use client";

import { Loader2, RefreshCw, ScanLine } from "lucide-react";
import type { ReactNode } from "react";

import { AppNav, SessionActions } from "@/components/app-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type DeskHeaderProps = {
  title: string;
  description: string;
  mode?: "lark" | "demo" | null;
  loading?: boolean;
  onRefresh?: () => void;
  onScan?: () => void;
  scanLabel?: string;
  extraActions?: ReactNode;
};

export function DeskHeader({
  title,
  description,
  mode,
  loading = false,
  onRefresh,
  onScan,
  scanLabel = "Scan serial",
  extraActions,
}: DeskHeaderProps) {
  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <img
            src="/xilnex-logo.jpg"
            alt="Xilnex Holdings"
            width={48}
            height={48}
            className="size-12 shrink-0 rounded-xl bg-white shadow-sm ring-1 ring-foreground/10"
          />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium tracking-wide text-white/90">Xilnex Holdings</p>
            <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          </div>
        </div>
        <SessionActions />
      </div>

      <p className="max-w-2xl text-sm text-muted-foreground sm:text-[0.95rem]">{description}</p>

      <div className="rounded-2xl border border-white/10 bg-black/15 px-3 py-2.5 sm:px-4">
        <AppNav />
      </div>

      {mode || onRefresh || onScan || extraActions ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {mode ? (
              <Badge
                className={
                  mode === "lark" ? "border-transparent bg-[var(--brand)] text-white" : undefined
                }
                variant={mode === "lark" ? "default" : "secondary"}
              >
                {mode === "lark" ? "Lark Base connected" : "Demo mode"}
              </Badge>
            ) : null}
            {onRefresh ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Refresh
              </Button>
            ) : null}
            {extraActions}
          </div>
          {onScan ? (
            <Button size="lg" className="w-full sm:w-auto" onClick={onScan}>
              <ScanLine className="size-4" />
              {scanLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
