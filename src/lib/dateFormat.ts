const MONTH_ABBR_BY_LANG: Record<string, readonly string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  de: ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"],
  fr: ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"],
  es: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"],
  pt: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"],
  ro: ["Ian", "Feb", "Mar", "Apr", "Mai", "Iun", "Iul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  tr: ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"],
  ru: ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"],
  pl: ["Sty", "Lut", "Mar", "Kwi", "Maj", "Cze", "Lip", "Sie", "Wrz", "Paź", "Lis", "Gru"],
  uk: ["Січ", "Лют", "Бер", "Квіт", "Трав", "Черв", "Лип", "Серп", "Вер", "Жовт", "Лист", "Груд"],
  ar: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
};

const RANGE_CONNECTOR_BY_LANG: Record<string, string> = {
  en: "to",
  de: "bis",
  fr: "au",
  es: "a",
  pt: "a",
  ro: "până la",
  tr: "ile",
  ru: "до",
  pl: "do",
  uk: "до",
  ar: "إلى",
};

const normalizeLangKey = (lang: string | null | undefined) => {
  const raw = typeof lang === "string" ? lang.trim() : "";
  if (!raw) return "en";
  const base = raw.toLowerCase().split(/[-_]/)[0] || "en";
  if (base === "ua") return "uk";
  return base;
};

const formatDateParts = (year: number, month: number, day: number, lang: string | null | undefined) => {
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const y = String(year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const key = normalizeLangKey(lang);
  if (key === "de") return `${dd}.${mm}.${y}`;
  const months = getMonthsForLang(lang);
  const monthLabel = months[month - 1] ?? mm;
  return `${day} ${monthLabel} ${y}`;
};

const formatYearMonthParts = (year: number, month: number, lang: string | null | undefined) => {
  if (!year || month < 1 || month > 12) return null;
  const y = String(year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  const key = normalizeLangKey(lang);
  if (key === "de") return `${mm}.${y}`;
  const months = getMonthsForLang(lang);
  const monthLabel = months[month - 1] ?? mm;
  return `${monthLabel} ${y}`;
};

const parseIsoDateParts = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
};

const formatDateRangeIso = (startIso: string, endIso: string, lang: string | null | undefined) => {
  const start = parseIsoDateParts(startIso);
  const end = parseIsoDateParts(endIso);
  if (!start || !end) return null;
  const key = normalizeLangKey(lang);

  const startSameYear = start.year === end.year;
  if (key === "de") {
    const startText = startSameYear
      ? `${String(start.day).padStart(2, "0")}.${String(start.month).padStart(2, "0")}`
      : (formatDateParts(start.year, start.month, start.day, lang) ?? startIso);
    const endText = formatDateParts(end.year, end.month, end.day, lang) ?? endIso;
    return `${startText}–${endText}`;
  }

  const months = getMonthsForLang(lang);
  const startMonth = months[start.month - 1] ?? String(start.month).padStart(2, "0");
  const endMonth = months[end.month - 1] ?? String(end.month).padStart(2, "0");
  const startText = startSameYear ? `${start.day} ${startMonth}` : `${start.day} ${startMonth} ${start.year}`;
  const endText = `${end.day} ${endMonth} ${end.year}`;
  return `${startText}–${endText}`;
};

const normalizeMonthToken = (raw: string) =>
  raw
    .trim()
    .replace(/\.$/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const buildMonthTokenIndex = () => {
  const map: Record<string, number> = Object.create(null);
  const add = (token: string, index: number) => {
    const key = normalizeMonthToken(token);
    if (!key) return;
    map[key] = index;
  };
  Object.values(MONTH_ABBR_BY_LANG).forEach((months) => {
    months.forEach((m, idx) => add(m, idx));
  });

  // Common/legacy variants.
  add("Mrz", 2);
  add("Sept", 8);
  add("Sep", 8);
  add("Okt", 9);
  add("Dez", 11);
  add("Mär", 2);
  add("Mai", 4);
  add("Fév", 1);
  add("Fev", 1);
  add("Aoû", 7);
  add("Aou", 7);
  add("Déc", 11);
  add("Dec", 11);
  return map;
};

const MONTH_TOKEN_TO_INDEX = buildMonthTokenIndex();

const getMonthsForLang = (lang: string | null | undefined) => {
  const key = normalizeLangKey(lang);
  return MONTH_ABBR_BY_LANG[key] ?? MONTH_ABBR_BY_LANG.en;
};

export function formatDateYmdMon(value: string | null | undefined, lang?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const exact = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (exact) {
    const month = Number(exact[2]);
    const day = Number(exact[3]);
    const year = Number(exact[1]);
    return formatDateParts(year, month, day, lang);
  }

  const prefix = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (prefix) {
    const month = Number(prefix[2]);
    const day = Number(prefix[3]);
    const year = Number(prefix[1]);
    return formatDateParts(year, month, day, lang);
  }

  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return formatDateParts(year, month, day, lang);
}

export function formatYearMonthYmdMon(value: string | null | undefined, lang?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const exact = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (exact) {
    const month = Number(exact[2]);
    const year = Number(exact[1]);
    return formatYearMonthParts(year, month, lang);
  }

  const prefix = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (prefix) {
    const month = Number(prefix[2]);
    const year = Number(prefix[1]);
    return formatYearMonthParts(year, month, lang);
  }

  return null;
}

export function parseDateToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const exactIso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (exactIso) {
    const year = Number(exactIso[1]);
    const month = Number(exactIso[2]);
    const day = Number(exactIso[3]);
    if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${exactIso[1]}-${exactIso[2]}-${exactIso[3]}`;
  }

  const prefixIso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (prefixIso) {
    const year = Number(prefixIso[1]);
    const month = Number(prefixIso[2]);
    const day = Number(prefixIso[3]);
    if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${prefixIso[1]}-${prefixIso[2]}-${prefixIso[3]}`;
  }

  const dmy = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const ymdSlash = trimmed.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})$/);
  if (ymdSlash) {
    const year = Number(ymdSlash[1]);
    const month = Number(ymdSlash[2]);
    const day = Number(ymdSlash[3]);
    if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const ymdMon = trimmed.match(/^(\d{4})-([\p{L}.]{2,})-(\d{2})$/u);
  if (ymdMon) {
    const year = Number(ymdMon[1]);
    const monthToken = ymdMon[2];
    const day = Number(ymdMon[3]);
    const idx = MONTH_TOKEN_TO_INDEX[normalizeMonthToken(monthToken)];
    if (!Number.isFinite(idx) || idx < 0 || idx > 11) return null;
    if (!year || day < 1 || day > 31) return null;
    const month = String(idx + 1).padStart(2, "0");
    return `${String(year).padStart(4, "0")}-${month}-${String(day).padStart(2, "0")}`;
  }

  return null;
}

export function extractDateRangeToIso(text: string | null | undefined): { start: string; end: string } | null {
  if (!text) return null;
  const raw = String(text);
  const dateToken = String.raw`(?:\d{4}-\d{2}-\d{2}|\d{4}-[\p{L}.]{2,}-\d{2}|\d{1,2}[./-]\d{1,2}(?:[./-]\d{4})?|\d{1,2}\s+[\p{L}.]{2,}(?:\s+\d{4})?)`;
  const wordConnector = String.raw`(?:to|bis|do|до|au|a|hasta|p(?:a|â)na\s+la|ile|إلى)`;

  const word = new RegExp(String.raw`\b(${dateToken})\s+${wordConnector}\s+(${dateToken})\b`, "iu");
  const dash = new RegExp(String.raw`\b(${dateToken})\s*[-–—]\s*(${dateToken})\b`, "u");

  const parseTokenParts = (tokenRaw: string): { year?: number; month: number; day: number } | null => {
    const token = tokenRaw.trim().replace(/[),;:]+$/g, "").replace(/\.+$/g, "");
    if (!token) return null;

    const iso = token.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) {
      return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
    }

    const ymdMon = token.match(/^(\d{4})-([\p{L}.]{2,})-(\d{2})$/u);
    if (ymdMon) {
      const idx = MONTH_TOKEN_TO_INDEX[normalizeMonthToken(ymdMon[2])];
      if (!Number.isFinite(idx) || idx < 0 || idx > 11) return null;
      return { year: Number(ymdMon[1]), month: idx + 1, day: Number(ymdMon[3]) };
    }

    const dmy = token.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (dmy) return { year: Number(dmy[3]), month: Number(dmy[2]), day: Number(dmy[1]) };

    const ymd = token.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
    if (ymd) return { year: Number(ymd[1]), month: Number(ymd[2]), day: Number(ymd[3]) };

    const namedFull = token.match(/^(\d{1,2})\s+([\p{L}.]{2,})\s+(\d{4})$/u);
    if (namedFull) {
      const idx = MONTH_TOKEN_TO_INDEX[normalizeMonthToken(namedFull[2])];
      if (!Number.isFinite(idx) || idx < 0 || idx > 11) return null;
      return { year: Number(namedFull[3]), month: idx + 1, day: Number(namedFull[1]) };
    }

    const namedPartial = token.match(/^(\d{1,2})\s+([\p{L}.]{2,})$/u);
    if (namedPartial) {
      const idx = MONTH_TOKEN_TO_INDEX[normalizeMonthToken(namedPartial[2])];
      if (!Number.isFinite(idx) || idx < 0 || idx > 11) return null;
      return { month: idx + 1, day: Number(namedPartial[1]) };
    }

    const dmyPartial = token.match(/^(\d{1,2})[./-](\d{1,2})$/);
    if (dmyPartial) return { month: Number(dmyPartial[2]), day: Number(dmyPartial[1]) };

    return null;
  };

  const toIso = (year: number | undefined, month: number, day: number) => {
    if (!year || !month || !day) return null;
    const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return parseDateToIso(iso) ? iso : null;
  };

  const pick = (m: RegExpMatchArray | null) => {
    if (!m || m.length < 3) return null;
    const a = parseTokenParts(m[1]);
    const b = parseTokenParts(m[2]);
    if (!a || !b) return null;
    const start = toIso(a.year ?? b.year, a.month, a.day);
    const end = toIso(b.year ?? a.year, b.month, b.day);
    if (!start || !end) return null;
    return start <= end ? { start, end } : { start: end, end: start };
  };

  return pick(raw.match(word)) ?? pick(raw.match(dash));
}

export function replaceIsoDatesInText(text: string | null | undefined, lang?: string | null): string | null {
  if (text == null) return null;
  const raw = String(text);

  const formatIso = (value: string) => {
    const iso = parseDateToIso(value);
    if (!iso) return null;
    const parts = parseIsoDateParts(iso);
    if (!parts) return null;
    return formatDateParts(parts.year, parts.month, parts.day, lang);
  };

  const formatIsoYearMonth = (value: string) => {
    const m = value.match(/^(\d{4})-(\d{2})$/);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    return formatYearMonthParts(year, month, lang);
  };

  const dateToken = String.raw`(?:\d{4}-\d{2}-\d{2}|\d{4}-[\p{L}.]{2,}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{4})`;
  const wordConnector = String.raw`(?:to|bis|do|до|au|a|hasta|p(?:a|â)na\s+la|ile|إلى)`;

  let out = raw;

  // Convert common date ranges first so we can compress repeated years for scanability.
  out = out.replace(
    new RegExp(String.raw`\b(${dateToken})\s+${wordConnector}\s+(${dateToken})\b`, "giu"),
    (m, a: string, b: string) => {
      const start = parseDateToIso(a);
      const end = parseDateToIso(b);
      if (!start || !end) return m;
      return formatDateRangeIso(start, end, lang) ?? m;
    }
  );
  out = out.replace(
    new RegExp(String.raw`\b(${dateToken})\s*[-–—]\s*(${dateToken})\b`, "gu"),
    (m, a: string, b: string) => {
      const start = parseDateToIso(a);
      const end = parseDateToIso(b);
      if (!start || !end) return m;
      return formatDateRangeIso(start, end, lang) ?? m;
    }
  );

  // YYYY-MM-DD (also matches timestamps like 2025-11-06T...)
  out = out.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m) => formatIso(m) ?? m);

  // YYYY-MM (but not YYYY-MM-DD)
  out = out.replace(/\b(\d{4})-(\d{2})\b(?!-\d{2})/g, (m) => formatIsoYearMonth(m) ?? m);

  // DD.MM.YYYY / DD/MM/YYYY / DD-MM-YYYY
  out = out.replace(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/g, (m) => formatIso(m) ?? m);

  // YYYY/MM/DD or YYYY.MM.DD
  out = out.replace(/\b(\d{4})[./](\d{1,2})[./](\d{1,2})\b/g, (m) => formatIso(m) ?? m);

  // Translate existing YYYY-MMM-DD into the target format (e.g. 2025-Oct-31 -> 31.10.2025 for de).
  out = out.replace(/\b(\d{4})-([\p{L}.]{2,})-(\d{2})\b/gu, (m, y: string, mon: string, dd: string) => {
    const idx = MONTH_TOKEN_TO_INDEX[normalizeMonthToken(mon)];
    if (!Number.isFinite(idx) || idx < 0 || idx > 11) return m;
    return formatDateParts(Number(y), idx + 1, Number(dd), lang) ?? m;
  });

  // Translate existing YYYY-MMM (but not YYYY-MMM-DD).
  out = out.replace(/\b(\d{4})-([\p{L}.]{2,})\b(?!-\d{2})/gu, (m, y: string, mon: string) => {
    const idx = MONTH_TOKEN_TO_INDEX[normalizeMonthToken(mon)];
    if (!Number.isFinite(idx) || idx < 0 || idx > 11) return m;
    return formatYearMonthParts(Number(y), idx + 1, lang) ?? m;
  });

  // Translate legacy "MMM YYYY" into the target year-month format (avoid matching "30 Nov 2025").
  out = out.replace(
    /(^|[^\p{L}\d])([\p{L}.]{2,})\s+(\d{4})(?=$|[^\p{L}\d])/gu,
    (m, prefix: string, mon: string, y: string) => {
      const idx = MONTH_TOKEN_TO_INDEX[normalizeMonthToken(mon)];
      if (!Number.isFinite(idx) || idx < 0 || idx > 11) return m;
      return `${prefix}${formatYearMonthParts(Number(y), idx + 1, lang) ?? `${mon} ${y}`}`;
    }
  );

  return out;
}
