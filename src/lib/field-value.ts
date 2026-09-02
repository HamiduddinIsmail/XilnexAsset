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
    if (typeof record.en_name === "string") return record.en_name.trim();
    if (typeof record.full_address === "string") return record.full_address.trim();
    if (typeof record.link === "string") return record.link.trim();
    if ("value" in record) return fieldToString(record.value);
  }
  return "";
}

export function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_\-/]+/g, " ");
}

export function linkRecordIds(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === "string") {
    return value.startsWith("rec") ? [value] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => linkRecordIds(item));
  }
  if (typeof value === "object") {
    const record = value as {
      link_record_ids?: unknown;
      record_ids?: unknown;
      record_id?: unknown;
      id?: unknown;
    };
    if (Array.isArray(record.link_record_ids)) {
      return record.link_record_ids.flatMap((item) => linkRecordIds(item));
    }
    if (Array.isArray(record.record_ids)) {
      return record.record_ids.flatMap((item) => linkRecordIds(item));
    }
    if (typeof record.record_id === "string") return [record.record_id];
    if (typeof record.id === "string" && record.id.startsWith("rec")) return [record.id];
  }
  return [];
}
