"use client";

import { useEffect, useRef, type RefObject } from "react";

import { cn } from "@/lib/utils";

type Point = { x: number; y: number };

type SignaturePadProps = {
  className?: string;
  disabled?: boolean;
  onEmptyChange?: (empty: boolean) => void;
};

export type SignaturePadHandle = {
  clear: () => void;
  isEmpty: () => boolean;
  toDataURL: () => string;
};

export function SignaturePad({
  className,
  disabled = false,
  onEmptyChange,
  handleRef,
}: SignaturePadProps & { handleRef: RefObject<SignaturePadHandle | null> }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const empty = useRef(true);
  const last = useRef<Point | null>(null);

  function resize() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const snapshot = empty.current ? null : canvas.toDataURL("image/png");
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = "#1a1024";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    if (snapshot) {
      const image = new Image();
      image.onload = () => ctx.drawImage(image, 0, 0, width, height);
      image.src = snapshot;
    }
  }

  function pointFromEvent(event: PointerEvent): Point {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const surface = canvas;
    resize();
    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    function markDrawn() {
      if (empty.current) {
        empty.current = false;
        onEmptyChange?.(false);
      }
    }

    function onDown(event: PointerEvent) {
      if (disabled) return;
      drawing.current = true;
      last.current = pointFromEvent(event);
      surface.setPointerCapture(event.pointerId);
    }

    function onMove(event: PointerEvent) {
      if (!drawing.current || disabled) return;
      const ctx = surface.getContext("2d");
      const from = last.current;
      const to = pointFromEvent(event);
      if (!ctx || !from) return;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      last.current = to;
      markDrawn();
    }

    function onUp(event: PointerEvent) {
      drawing.current = false;
      last.current = null;
      try {
        surface.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
    }

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    handleRef.current = {
      clear() {
        empty.current = true;
        onEmptyChange?.(true);
        resize();
      },
      isEmpty() {
        return empty.current;
      },
      toDataURL() {
        return surface.toDataURL("image/png");
      },
    };

    return () => {
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      handleRef.current = null;
    };
  }, [disabled, handleRef, onEmptyChange]);

  return (
    <canvas
      ref={canvasRef}
      className={cn(
        "h-44 w-full touch-none rounded-xl bg-white shadow-inner ring-1 ring-foreground/15",
        disabled && "opacity-70",
        className
      )}
    />
  );
}
