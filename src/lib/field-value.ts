export function fieldToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    return value
      .map((item) => fieldToString(item))
      .filter(Boolean)
      .join(", ");
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") return record.text.trim();
    if (typeof record.name === "string") return record.name.trim();
    if (typeof record.full_address === "string") return record.full_address.trim();
    if (typeof record.link === "string") return record.link.trim();
  }
  return "";
}

export function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_\-/]+/g, " ");
}
