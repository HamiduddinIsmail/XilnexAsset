"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ClipboardList, Handshake, LayoutGrid, Lock, Settings, Tag, Undo2 } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Tools", icon: LayoutGrid },
  { href: "/handover", label: "Handover", icon: Handshake },
  { href: "/return", label: "Return", icon: Undo2 },
  { href: "/maintenance", label: "Maintenance", icon: ClipboardList },
  { href: "/serials", label: "Serials", icon: Tag },
];

export function SessionActions() {
  const pathname = usePathname();
  const router = useRouter();

  async function lock() {
    await fetch("/api/unlock", { method: "DELETE" });
    router.replace("/welcome");
    router.refresh();
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Link
        href="/setup"
        aria-label="Setup"
        className={buttonVariants({
          variant: pathname === "/setup" ? "default" : "outline",
          size: "sm",
        })}
      >
        <Settings className="size-3.5" />
        <span className="hidden sm:inline">Setup</span>
      </Link>
      <button
        type="button"
        aria-label="Lock"
        onClick={() => void lock()}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <Lock className="size-3.5" />
        <span className="hidden sm:inline">Lock</span>
      </button>
    </div>
  );
}

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Asset Desk Tools"
      className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {LINKS.map((link) => {
        const active = pathname === link.href;
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              buttonVariants({ variant: active ? "default" : "outline", size: "sm" }),
              "shrink-0",
              active && "bg-[var(--brand)] text-white"
            )}
          >
            <Icon className="size-3.5" />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
