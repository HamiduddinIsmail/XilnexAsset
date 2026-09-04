"use client";

import Link from "next/link";
import { ClipboardList, Handshake, Tag, Undo2 } from "lucide-react";

import { SessionActions } from "@/components/app-nav";
import { cn } from "@/lib/utils";

const TOOLS = [
  {
    href: "/handover",
    title: "Asset Handover",
    description: "Hand several assets to one person in a single confirm.",
    icon: Handshake,
  },
  {
    href: "/return",
    title: "Asset Return",
    description: "Filter by staff. Resignation and Project End clear the holder; repair and upgrade keep them and open a job.",
    icon: Undo2,
  },
  {
    href: "/maintenance",
    title: "Asset Maintenance",
    description: "Move Open repair and disposal jobs to In Progress, then Completed.",
    icon: ClipboardList,
  },
  {
    href: "/serials",
    title: "Serial Number Updater",
    description: "Write a barcode or printed serial onto the matching Asset Register row.",
    icon: Tag,
  },
] as const;

export function ToolsHome() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex items-start justify-between gap-3">
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
            <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
              Asset desk
            </h1>
            <p className="max-w-xl text-sm text-muted-foreground">
              Pick a tool. Each one writes to the live Lark Base after you confirm.
            </p>
          </div>
        </div>
        <SessionActions />
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {TOOLS.map((tool, index) => {
          const Icon = tool.icon;
          return (
            <Link
              key={tool.href}
              href={tool.href}
              className={cn(
                "group flex min-h-36 flex-col gap-3 rounded-2xl bg-card p-5 text-left ring-1 ring-white/20 transition-colors",
                "hover:bg-white/10 hover:ring-[var(--brand)]"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-[var(--brand)] text-white">
                  <Icon className="size-5" />
                </span>
                <span className="text-sm font-medium text-muted-foreground">{index + 1}</span>
              </div>
              <div className="space-y-1">
                <h2 className="font-heading text-lg font-semibold tracking-tight">{tool.title}</h2>
                <p className="text-sm text-muted-foreground">{tool.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
