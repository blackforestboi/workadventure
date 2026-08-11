import { createHash } from "node:crypto";

export function canonicalJson(value: unknown): string {
  if (value === undefined)
    throw new Error("Undefined is not valid canonical JSON");
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    if (serialized === undefined)
      throw new Error("Value is not valid canonical JSON");
    return serialized;
  }
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;

  const record = Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  );
  return `{${Object.entries(record)
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}

export function digestCanonicalJson(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
