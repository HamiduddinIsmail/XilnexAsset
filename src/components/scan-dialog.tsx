"use client";

import { useEffect, useRef, useState } from "react";
import {
  Aperture,
  Camera,
  Flashlight,
  FlashlightOff,
  ImageUp,
  Loader2,
  SwitchCamera,
  ZoomIn,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  createNativeBarcodeDetector,
  detectSerialInImage,
  enhanceImageForRead,
  serialFromDetections,
  videoFrameToFile,
} from "@/lib/scan-enhance";
import { extractSerialCandidates, looksLikeSerial, sanitizeSerial } from "@/lib/serial";
import { cn } from "@/lib/utils";

const CAMERA_ELEMENT_ID = "asset-serial-camera";
const FILE_ELEMENT_ID = "asset-serial-file";

type Html5QrcodeClient = import("html5-qrcode").Html5Qrcode;

type ZoomState = {
  min: number;
  max: number;
  step: number;
  value: number;
};

async function loadHtml5Qrcode() {
  const mod = await import("html5-qrcode");
  const formats = [
    mod.Html5QrcodeSupportedFormats.QR_CODE,
    mod.Html5QrcodeSupportedFormats.CODE_128,
    mod.Html5QrcodeSupportedFormats.CODE_39,
    mod.Html5QrcodeSupportedFormats.CODE_93,
    mod.Html5QrcodeSupportedFormats.EAN_13,
    mod.Html5QrcodeSupportedFormats.EAN_8,
    mod.Html5QrcodeSupportedFormats.UPC_A,
    mod.Html5QrcodeSupportedFormats.UPC_E,
    mod.Html5QrcodeSupportedFormats.ITF,
    mod.Html5QrcodeSupportedFormats.CODABAR,
    mod.Html5QrcodeSupportedFormats.DATA_MATRIX,
    mod.Html5QrcodeSupportedFormats.PDF_417,
    mod.Html5QrcodeSupportedFormats.AZTEC,
  ];
  return { Html5Qrcode: mod.Html5Qrcode, formats };
}

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

function videoConstraintsFor(deviceId: string): MediaTrackConstraints {
  return {
    deviceId: { exact: deviceId },
    width: { min: 640, ideal: 1920 },
    height: { min: 480, ideal: 1080 },
    frameRate: { ideal: 24, max: 30 },
  };
}

export function ScanDialog({ open, onOpenChange, onDetected, showSamples = false }: ScanDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const liveRef = useRef<Html5QrcodeClient | null>(null);
  const runningRef = useRef(false);
  const handledRef = useRef(false);
  const nativeTimerRef = useRef<number>(0);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [cameraId, setCameraId] = useState<string>("");
  const [status, setStatus] = useState("Point the camera at a barcode or serial label.");
  const [busy, setBusy] = useState<"camera" | "photo" | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [zoom, setZoom] = useState<ZoomState | null>(null);

  function stopNativeLoop() {
    if (nativeTimerRef.current) {
      window.clearTimeout(nativeTimerRef.current);
      nativeTimerRef.current = 0;
    }
  }

  async function stopCamera() {
    stopNativeLoop();
    const scanner = liveRef.current;
    liveRef.current = null;
    setTorchSupported(false);
    setTorchOn(false);
    setZoom(null);
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

  async function startNativeLoop() {
    stopNativeLoop();
    const detector = await createNativeBarcodeDetector();
    if (!detector || !runningRef.current || handledRef.current) return;

    const tick = async () => {
      if (handledRef.current || !runningRef.current) return;
      const video = document.querySelector(`#${CAMERA_ELEMENT_ID} video`) as HTMLVideoElement | null;
      if (video && video.readyState >= 2) {
        try {
          const value = serialFromDetections(await detector.detect(video));
          if (value) {
            handledRef.current = true;
            void handleBarcode(value);
            return;
          }
        } catch {
          // Per-frame detect failures are normal while the image is blurry.
        }
      }
      nativeTimerRef.current = window.setTimeout(() => void tick(), 90);
    };

    nativeTimerRef.current = window.setTimeout(() => void tick(), 180);
  }

  async function applyFocusAndControls(scanner: Html5QrcodeClient) {
    try {
      const capabilities = scanner.getRunningTrackCapabilities() as MediaTrackCapabilities & {
        torch?: boolean;
        focusMode?: string[];
      };
      const advanced: Record<string, unknown>[] = [];
      if (capabilities.focusMode?.includes("continuous")) {
        advanced.push({ focusMode: "continuous" });
      }
      if (advanced.length) {
        await scanner.applyVideoConstraints({ advanced } as MediaTrackConstraints);
      }
    } catch {
      // Not every browser exposes focus constraints.
    }

    try {
      const features = scanner.getRunningTrackCameraCapabilities();
      const torch = features.torchFeature();
      setTorchSupported(torch.isSupported());
      setTorchOn(Boolean(torch.value()));

      const zoomFeature = features.zoomFeature();
      if (zoomFeature.isSupported() && zoomFeature.max() > zoomFeature.min()) {
        const current = zoomFeature.value() ?? zoomFeature.min();
        setZoom({
          min: zoomFeature.min(),
          max: zoomFeature.max(),
          step: zoomFeature.step() || 0.1,
          value: current,
        });
      } else {
        setZoom(null);
      }
    } catch {
      setTorchSupported(false);
      setZoom(null);
    }
  }

  async function startCamera(id: string) {
    await stopCamera();
    await waitForElement(CAMERA_ELEMENT_ID);
    const { Html5Qrcode, formats } = await loadHtml5Qrcode();
    const scanner = new Html5Qrcode(CAMERA_ELEMENT_ID, {
      verbose: false,
      formatsToSupport: formats,
      useBarCodeDetectorIfSupported: true,
    });
    liveRef.current = scanner;

    const constraints = videoConstraintsFor(id);
    const scanConfig = {
      fps: 18,
      disableFlip: false,
      qrbox: (width: number, height: number) => ({
        width: Math.floor(Math.min(width * 0.94, width - 12)),
        height: Math.floor(Math.min(Math.max(height * 0.4, 180), height * 0.52)),
      }),
    };

    try {
      await scanner.start(
        constraints,
        { ...scanConfig, videoConstraints: constraints },
        (text) => {
          if (handledRef.current) return;
          const value = sanitizeSerial(text);
          if (!looksLikeSerial(value)) return;
          handledRef.current = true;
          void handleBarcode(value);
        },
        () => undefined
      );
    } catch {
      await scanner.start(
        id,
        scanConfig,
        (text) => {
          if (handledRef.current) return;
          const value = sanitizeSerial(text);
          if (!looksLikeSerial(value)) return;
          handledRef.current = true;
          void handleBarcode(value);
        },
        () => undefined
      );
    }

    runningRef.current = true;
    await applyFocusAndControls(scanner);
    void startNativeLoop();
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
        const { Html5Qrcode } = await loadHtml5Qrcode();
        const devices = await Html5Qrcode.getCameras();
        if (cancelled) return;
        setCameras(devices);
        const preferred =
          devices.find((device) => /back|rear|environment|world/i.test(device.label))?.id ??
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
          setStatus("Fill the box with the barcode. Hold still, then zoom in if the label is small.");
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

  async function toggleTorch() {
    const scanner = liveRef.current;
    if (!scanner || !torchSupported) return;
    const next = !torchOn;
    try {
      await scanner.getRunningTrackCameraCapabilities().torchFeature().apply(next);
      setTorchOn(next);
      setStatus(next ? "Torch on. Point at the label." : "Torch off.");
    } catch {
      setStatus("This camera could not toggle the torch.");
      setTorchSupported(false);
    }
  }

  async function changeZoom(value: number) {
    const scanner = liveRef.current;
    if (!scanner || !zoom) return;
    setZoom({ ...zoom, value });
    try {
      await scanner.getRunningTrackCameraCapabilities().zoomFeature().apply(value);
    } catch {
      // Some devices advertise zoom but reject the constraint.
    }
  }

  async function decodeFromFile(file: File, restartCameraOnMiss: boolean) {
    setBusy("photo");
    setStatus("Reading barcode from the photo…");
    await stopCamera();
    try {
      const attempts = [file];
      try {
        attempts.push(await enhanceImageForRead(file));
      } catch {
        // Keep the original photo if enhancement is not supported.
      }

      for (const attempt of attempts) {
        const native = await detectSerialInImage(attempt);
        if (native) {
          handledRef.current = true;
          onDetected(native, { source: "barcode", candidates: [native] });
          onOpenChange(false);
          return true;
        }
      }

      await waitForElement(FILE_ELEMENT_ID);
      const { Html5Qrcode, formats } = await loadHtml5Qrcode();
      const fileScanner = new Html5Qrcode(FILE_ELEMENT_ID, {
        verbose: false,
        formatsToSupport: formats,
        useBarCodeDetectorIfSupported: true,
      });

      try {
        for (const attempt of attempts) {
          try {
            const decoded = await fileScanner.scanFile(attempt, false);
            const value = sanitizeSerial(decoded);
            if (looksLikeSerial(value)) {
              handledRef.current = true;
              onDetected(value, { source: "barcode", candidates: [value] });
              onOpenChange(false);
              return true;
            }
          } catch {
            // Try the enhanced copy, then OCR.
          }
        }
      } finally {
        try {
          fileScanner.clear();
        } catch {
          // Ignore.
        }
      }

      setStatus("No barcode found. Reading printed text…");
      const candidates = await readSerialFromPhoto(attempts[attempts.length - 1] ?? file);
      if (candidates.length >= 1) {
        handledRef.current = true;
        onDetected(candidates[0], { source: "ocr", candidates });
        onOpenChange(false);
        if (candidates.length > 1) {
          toast.message("Several possible serials were found. Pick the correct one.");
        }
        return true;
      }
      setStatus("Could not read a serial from that photo. Try a closer shot with the torch on, or type it.");
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not read that image.";
      setStatus(message);
      return false;
    } finally {
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (restartCameraOnMiss && open && !handledRef.current && cameraId) {
        try {
          await startCamera(cameraId);
        } catch {
          // Photo fallback remains available.
        }
      }
    }
  }

  async function captureStill() {
    const video = document.querySelector(`#${CAMERA_ELEMENT_ID} video`) as HTMLVideoElement | null;
    if (!video) {
      setStatus("Camera is not ready yet.");
      return;
    }
    try {
      const file = await videoFrameToFile(video);
      const found = await decodeFromFile(file, true);
      if (!found) {
        setStatus("That frame was not readable. Zoom in, turn the torch on, and hold still.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not capture that frame.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(94vh,920px)] w-[calc(100%-0.75rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Scan serial number</DialogTitle>
          <DialogDescription>
            Fill the box with the barcode. Use the torch in dim light and zoom for small labels.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div
            id={CAMERA_ELEMENT_ID}
            className="relative min-h-[min(56vh,440px)] overflow-hidden rounded-lg bg-zinc-950 [&_video]:h-full [&_video]:w-full [&_video]:object-cover [&_img]:mx-auto"
          />
          <div id={FILE_ELEMENT_ID} className="hidden" />
          <p className="text-sm text-muted-foreground">{status}</p>

          {zoom ? (
            <div className="space-y-1.5">
              <Label htmlFor="camera-zoom" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ZoomIn className="size-3.5" />
                Zoom
              </Label>
              <input
                id="camera-zoom"
                type="range"
                min={zoom.min}
                max={zoom.max}
                step={zoom.step}
                value={zoom.value}
                disabled={busy !== null}
                onChange={(event) => void changeZoom(Number(event.target.value))}
                className="h-8 w-full accent-[var(--brand)]"
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {torchSupported ? (
              <Button
                type="button"
                variant={torchOn ? "default" : "outline"}
                size="lg"
                disabled={busy !== null}
                onClick={() => void toggleTorch()}
                className={cn(torchOn && "bg-[var(--brand)]")}
              >
                {torchOn ? <FlashlightOff className="size-4" /> : <Flashlight className="size-4" />}
                {torchOn ? "Torch off" : "Torch"}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={busy !== null}
              onClick={() => void captureStill()}
            >
              {busy === "photo" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Aperture className="size-4" />
              )}
              Read this frame
            </Button>
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
            if (file) void decodeFromFile(file, true);
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
    await worker.setParameters({
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_/.:",
    });
    const { data } = await worker.recognize(file);
    return extractSerialCandidates(data.text ?? "");
  } finally {
    await worker.terminate();
  }
}
