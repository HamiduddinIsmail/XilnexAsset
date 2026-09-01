import { looksLikeSerial, sanitizeSerial } from "@/lib/serial";

const NATIVE_FORMATS = [
  "code_128",
  "code_39",
  "code_93",
  "codabar",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "itf",
  "qr_code",
  "data_matrix",
  "pdf417",
  "aztec",
];

type NativeBarcodeDetector = {
  detect: (image: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};

type BarcodeDetectorCtor = {
  new (options?: { formats?: string[] }): NativeBarcodeDetector;
  getSupportedFormats?: () => Promise<string[]>;
};

export async function createNativeBarcodeDetector(): Promise<NativeBarcodeDetector | null> {
  const Ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;

  try {
    const supported = Ctor.getSupportedFormats ? await Ctor.getSupportedFormats() : NATIVE_FORMATS;
    const formats = NATIVE_FORMATS.filter((format) => supported.includes(format));
    return new Ctor(formats.length ? { formats } : undefined);
  } catch {
    try {
      return new Ctor();
    } catch {
      return null;
    }
  }
}

export async function detectSerialInImage(file: File): Promise<string | null> {
  const detector = await createNativeBarcodeDetector();
  if (!detector) return null;
  const bitmap = await createImageBitmap(file);
  try {
    return serialFromDetections(await detector.detect(bitmap));
  } catch {
    return null;
  } finally {
    bitmap.close();
  }
}

export function serialFromDetections(codes: Array<{ rawValue?: string }>): string | null {
  for (const code of codes) {
    const value = sanitizeSerial(code.rawValue ?? "");
    if (looksLikeSerial(value)) return value;
  }
  return null;
}

export async function videoFrameToFile(video: HTMLVideoElement): Promise<File> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) {
    throw new Error("The camera has not produced a frame yet. Wait a moment and try again.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not capture a camera frame.");
  context.drawImage(video, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.95);
  });
  if (!blob) throw new Error("Could not capture a camera frame.");
  return new File([blob], "camera-frame.jpg", { type: "image/jpeg" });
}

export async function enhanceImageForRead(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = longest < 1200 ? Math.min(2.4, 1600 / longest) : longest > 2800 ? 1600 / longest : 1;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return file;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.filter = "contrast(1.35) saturate(0) brightness(1.08)";
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.92);
  });
  if (!blob) return file;
  return new File([blob], "enhanced.jpg", { type: "image/jpeg" });
}
