// CORS_ORIGIN: один origin или список через запятую.
// '*' означает "отразить Origin" (голый '*' с credentials:true браузер режет).
export function parseCorsOrigins(
  value: string | undefined,
  fallback = "http://localhost:3001",
): string | string[] | true {
  const raw = (value ?? "").trim();
  if (raw === "*") return true;
  const list = raw
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  if (list.length === 0) return fallback;
  if (list.length === 1) return list[0];
  return list;
}
