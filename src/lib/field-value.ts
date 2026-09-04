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

export type PersonRef = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
};

export function parseUsers(value: unknown): PersonRef[] {
  if (value == null) return [];
  const items = Array.isArray(value) ? value : [value];
  const people: PersonRef[] = [];
  for (const item of items) {
    if (typeof item === "string") {
      if (item.startsWith("ou_")) {
        people.push({ id: item, name: item, email: "", avatarUrl: "" });
      }
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id =
      (typeof record.id === "string" && record.id) ||
      (typeof record.open_id === "string" && record.open_id) ||
      "";
    if (!id) continue;
    const avatar =
      typeof record.avatar_url === "string"
        ? record.avatar_url
        : record.avatar && typeof record.avatar === "object"
          ? String((record.avatar as { avatar_72?: string }).avatar_72 ?? "")
          : "";
    people.push({
      id,
      name:
        String(record.name || record.en_name || record.email || "")
          .trim() || id,
      email: String(record.email || "").trim(),
      avatarUrl: avatar.trim(),
    });
  }
  return people;
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
