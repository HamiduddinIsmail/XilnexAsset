"use client";

import { useEffect, useRef } from "react";
import { looksLikeSerial, sanitizeSerial } from "@/lib/serial";

type Options = {
  enabled: boolean;
  onScan: (value: string) => void;
};

export function useHardwareScanner({ enabled, onScan }: Options) {
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;

    let buffer = "";
    let lastStamp = 0;
    let burst = true;

    function reset() {
      buffer = "";
      burst = true;
    }

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typingInField =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const now = Date.now();
      const gap = now - lastStamp;
      lastStamp = now;

      if (gap > 50) {
        reset();
      } else if (gap > 0) {
        burst = burst && gap <= 50;
      }

      if (event.key === "Enter") {
        const value = sanitizeSerial(buffer);
        if (burst && looksLikeSerial(value)) {
          event.preventDefault();
          event.stopPropagation();
          onScanRef.current(value);
        }
        reset();
        return;
      }

      if (event.key.length !== 1) return;

      if (!typingInField || gap <= 50) {
        buffer += event.key;
        if (!typingInField && burst) {
          event.preventDefault();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [enabled]);
}
