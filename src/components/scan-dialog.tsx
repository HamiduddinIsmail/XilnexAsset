"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImageUp, Loader2, SwitchCamera } from "lucide-react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { extractSerialCandidates, looksLikeSerial, sanitizeSerial } from "@/lib/serial";

const CAMERA_ELEMENT_ID = "asset-serial-camera";
const FILE_ELEMENT_ID = "asset-serial-file";

const BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
  Html5QrcodeSupportedFormats.PDF_417,
];

type CameraDevice = { id: string; label: string };

type ScanDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (value: string, meta: { source: "barcode" | "ocr"; candidates: string[] }) => void;
  showSamples?: boolean;
};

async function waitForElement(id: string) {
  const existing = document.getElementById(id);
  if (existing) return existing;

  return new Promise<HTMLElement>((resolve, reject) => {
    const observer = new MutationObserver(() => {
      const found = document.getElementById(id);
      if (found) {
        observer.disconnect();
        resolve(found);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => {
      observer.disconnect();
      reject(new Error("Scanner view failed to open."));
    }, 2000);
  });
}

export function ScanDialog({ open, onOpenChange, onDetected, showSamples = false }: ScanDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const liveRef = useRef<Html5Qrcode | null>(null);
  const runningRef = useRef(false);
  const handledRef = useRef(false);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [cameraId, setCameraId] = useState<string>("");
  const [status, setStatus] = useState("Point the camera at a barcode or serial label.");
  const [busy, setBusy] = useState<"camera" | "photo" | null>(null);

  async function stopCamera() {
    const scanner = liveRef.current;
    liveRef.current = null;
    if (!scanner) return;
    try {
      if (runningRef.current) {
        await scanner.stop();
      }
    } catch {
      // Camera may already be stopped.
    }
    try {
      scanner.clear();
    } catch {
      // Ignore cleanup races when the dialog unmounts.
    }
    runningRef.current = false;
  }

  async function startCamera(id: string) {
    await stopCamera();
    await waitForElement(CAMERA_ELEMENT_ID);
    const scanner = new Html5Qrcode(CAMERA_ELEMENT_ID, {
      verbose: false,
      formatsToSupport: BARCODE_FORMATS,
    });
    liveRef.current = scanner;
    await scanner.start(
      id,
      {
        fps: 12,
        aspectRatio: 1.333,
        disableFlip: false,
        qrbox: (width, height) => ({
          width: Math.floor(Math.min(width * 0.92, 420)),
          height: Math.floor(Math.min(height * 0.38, 150)),
        }),
      },
      (text) => {
        if (handledRef.current) return;
        const value = sanitizeSerial(text);
        if (!looksLikeSerial(value)) return;
        handledRef.current = true;
        void handleBarcode(value);
      },
      () => undefined
    );
    runningRef.current = true;
  }

  async function handleBarcode(value: string) {
    await stopCamera();
    onDetected(value, { source: "barcode", candidates: [value] });
    onOpenChange(false);
  }

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    handledRef.current = false;

    async function start() {
      try {
        await waitForElement(CAMERA_ELEMENT_ID);
        if (cancelled) return;
        setBusy("camera");
        setStatus("Starting camera…");
        const devices = await Html5Qrcode.getCameras();
        if (cancelled) return;
        setCameras(devices);
        const preferred =
          devices.find((device) => /back|rear|environment/i.test(device.label))?.id ??
          devices[0]?.id ??
          "";
        setCameraId(preferred);
        if (!preferred) {
          setStatus("No camera found. Take a photo or upload an image instead.");
          setBusy(null);
          return;
        }
        await startCamera(preferred);
        if (!cancelled) {
          setStatus("Align the barcode inside the box.");
          setBusy(null);
        }
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : "Camera permission was denied.";
        setStatus(`${message} You can still take a photo or upload an image.`);
        setBusy(null);
      }
    }

    void start();

    return () => {
      cancelled = true;
      void stopCamera();
    };
    // startCamera/stopCamera close over the latest handlers for this open session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function cycleCamera() {
    if (cameras.length < 2) return;
    const index = cameras.findIndex((camera) => camera.id === cameraId);
    const next = cameras[(index + 1) % cameras.length];
    if (!next) return;
    setCameraId(next.id);
    setBusy("camera");
    try {
      await startCamera(next.id);
      setStatus(`Using ${next.label || "another camera"}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not switch camera.");
    } finally {
      setBusy(null);
    }
  }

  async function onFile(file: File) {
    setBusy("photo");
    setStatus("Reading barcode from the photo…");
    await stopCamera();
    try {
      await waitForElement(FILE_ELEMENT_ID);
      const fileScanner = new Html5Qrcode(FILE_ELEMENT_ID, {
        verbose: false,
        formatsToSupport: BARCODE_FORMATS,
      });
      try {
        const decoded = await fileScanner.scanFile(file, false);
        const value = sanitizeSerial(decoded);
        if (looksLikeSerial(value)) {
          onDetected(value, { source: "barcode", candidates: [value] });
          onOpenChange(false);
          return;
        }
      } catch {
        // Fall through to OCR when the image is a printed serial, not a barcode.
      } finally {
        try {
          fileScanner.clear();
        } catch {
          // Ignore.
        }
      }

      setStatus("No barcode found. Reading printed text…");
      const candidates = await readSerialFromPhoto(file);
      if (candidates.length === 1) {
        onDetected(candidates[0], { source: "ocr", candidates });
        onOpenChange(false);
        return;
      }
      if (candidates.length > 1) {
        onDetected(candidates[0], { source: "ocr", candidates });
        onOpenChange(false);
        toast.message("Several possible serials were found. Pick the correct one.");
        return;
      }
      setStatus("Could not read a serial from that photo. Try a closer shot, or type it.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not read that image.";
      setStatus(message);
    } finally {
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle>Scan serial number</DialogTitle>
          <DialogDescription>
            Use the live camera for barcodes and QR codes, or take a photo of a printed serial.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div
            id={CAMERA_ELEMENT_ID}
            className="min-h-56 overflow-hidden rounded-lg bg-zinc-950 [&_video]:h-full [&_video]:w-full [&_video]:object-cover [&_img]:mx-auto"
          />
          <div id={FILE_ELEMENT_ID} className="hidden" />
          <p className="text-sm text-muted-foreground">{status}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="flex-1"
              disabled={busy === "photo"}
              onClick={() => fileInputRef.current?.click()}
            >
              {busy === "photo" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ImageUp className="size-4" />
              )}
              Take or upload photo
            </Button>
            {cameras.length > 1 ? (
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={busy !== null}
                onClick={() => void cycleCamera()}
              >
                <SwitchCamera className="size-4" />
                Switch camera
              </Button>
            ) : null}
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Camera className="size-3.5" />
            USB / Bluetooth scanners also work — scan while this app is open.
          </p>
          {showSamples ? (
            <p className="text-xs text-muted-foreground">
              Demo images:{" "}
              <a className="underline" href="/samples/dell_latitude_serial.png" target="_blank" rel="noreferrer">
                Code 128 (SN-DELL-7420-A19)
              </a>
              {" · "}
              <a className="underline" href="/samples/elitedesk_serial.png" target="_blank" rel="noreferrer">
                QR (CND1234ABCDE)
              </a>
              . Save the image, then upload it here.
            </p>
          ) : null}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onFile(file);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

async function readSerialFromPhoto(file: File): Promise<string[]> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const { data } = await worker.recognize(file);
    return extractSerialCandidates(data.text ?? "");
  } finally {
    await worker.terminate();
  }
}
