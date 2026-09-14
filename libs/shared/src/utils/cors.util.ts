/**
 * Разбирает CORS_ORIGIN в формат, понятный express/socket.io `origin`.
 *
 * Формат: один origin или список через запятую —
 * `http://localhost:3001,https://crm-vue.vercel.app`
 * (dev-хост + прод-хост + будущие MFE-стенды; remote-origin сюда НЕ нужен:
 * API-запросы из федеративных модулей идут с Origin host-страницы).
 *
 * `'*'` маппится в `true` (отразить Origin запроса): голый `'*'`
 * несовместим с `credentials: true` — браузер такие ответы отбрасывает.
 */
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
