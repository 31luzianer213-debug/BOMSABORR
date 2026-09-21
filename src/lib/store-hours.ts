const STORE_TIME_ZONE = "America/Sao_Paulo";

function minutesInStoreTime(now: Date) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: STORE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

/** Combina o fechamento manual com o horário informado pela loja. */
export function isStoreOpenNow(manuallyOpen: boolean, openingHours: string, now = new Date()) {
  if (!manuallyOpen) return false;

  const normalized = openingHours
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[–—]/g, "-");
  const match = normalized.match(
    /(\d{1,2})(?:[:h](\d{2}))?\s*(?:h)?\s*(?:às|as|a|-)\s*(\d{1,2})(?:[:h](\d{2}))?/i,
  );
  if (!match) return manuallyOpen;

  const opensAt = Number(match[1]) * 60 + Number(match[2] ?? 0);
  const closesAt = Number(match[3]) * 60 + Number(match[4] ?? 0);
  const current = minutesInStoreTime(now);

  if (opensAt === closesAt) return true;
  if (closesAt > opensAt) return current >= opensAt && current < closesAt;
  return current >= opensAt || current < closesAt;
}