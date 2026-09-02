"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Settings, Tag } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Serials", icon: Tag },
  { href: "/maintenance", label: "Maintenance", icon: ClipboardList },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-2">
      {LINKS.map((link) => {
        const active = pathname === link.href;
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              buttonVariants({ variant: active ? "default" : "outline", size: "sm" }),
              active && "bg-[var(--brand)] text-white"
            )}
          >
            <Icon className="size-3.5" />
            {link.label}
          </Link>
        );
      })}
      <Link
        href="/setup"
        className={buttonVariants({
          variant: pathname === "/setup" ? "default" : "outline",
          size: "sm",
        })}
      >
        <Settings className="size-3.5" />
        Setup
      </Link>
    </nav>
  );
}
