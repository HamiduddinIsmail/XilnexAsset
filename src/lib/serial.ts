const SERIAL_TOKEN =
  /\b(?:s\/?n|serial(?:\s*(?:no|number|#))?)[:.\s#-]*([A-Z0-9][A-Z0-9._\-:/]{3,})\b/gi;
const MIXED_TOKEN = /\b(?=[A-Z0-9._\-:/]*\d)(?=[A-Z0-9._\-:/]*[A-Z])[A-Z0-9][A-Z0-9._\-:/]{4,}\b/gi;

export function sanitizeSerial(value: string): string {
  return value
    .replace(/[\u0000-\u001F]+/g, "")
    .replace(/^[\"'`]+|[\"'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function looksLikeSerial(value: string): boolean {
  const serial = sanitizeSerial(value);
  if (serial.length < 4 || serial.length > 80) return false;
  if (/\s/.test(serial) && serial.split(" ").length > 3) return false;
  return /[A-Za-z0-9]/.test(serial);
}

export function extractSerialCandidates(text: string): string[] {
  const found = new Set<string>();

  for (const match of text.matchAll(SERIAL_TOKEN)) {
    const value = sanitizeSerial(match[1] ?? "");
    if (looksLikeSerial(value)) found.add(value);
  }

  for (const match of text.matchAll(MIXED_TOKEN)) {
    const value = sanitizeSerial(match[0] ?? "");
    if (looksLikeSerial(value)) found.add(value);
  }

  return [...found].slice(0, 6);
}
