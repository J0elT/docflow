const LOCALE_BY_LANG: Record<string, string> = {
  de: "de-DE",
  en: "en-US",
  fr: "fr-FR",
  es: "es-ES",
  pt: "pt-PT",
  ro: "ro-RO",
  tr: "tr-TR",
  ru: "ru-RU",
  pl: "pl-PL",
  uk: "uk-UA",
  ar: "ar-EG",
};

const normalizeLangKey = (lang: string | null | undefined) => {
  const raw = typeof lang === "string" ? lang.trim() : "";
  if (!raw) return "en";
  const base = raw.toLowerCase().split(/[-_]/)[0] || "en";
  if (base === "ua") return "uk";
  return base;
};

const getLocaleForLang = (lang: string | null | undefined) => {
  const key = normalizeLangKey(lang);
  return LOCALE_BY_LANG[key] ?? LOCALE_BY_LANG.en;
};

type NumberStyle = {
  decimalSeparator: "." | ",";
  thousandSeparator: "." | "," | " " | null;
  useGrouping: boolean;
};

const parseLocaleNumber = (raw: string): number | null => {
  const s = raw.replace(/\s+/g, "").trim();
  if (!s) return null;
  const unsigned = s.replace(/^[+-]/, "");
  const hasComma = unsigned.includes(",");
  const hasDot = unsigned.includes(".");

  let normalized = unsigned;
  if (hasComma && hasDot) {
    const lastComma = unsigned.lastIndexOf(",");
    const lastDot = unsigned.lastIndexOf(".");
    if (lastComma > lastDot) {
      normalized = unsigned.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = unsigned.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = unsigned.split(",");
    if (
      parts.length > 2 &&
      parts.slice(1).every((p) => p.length === 3)
    ) {
      normalized = unsigned.replace(/,/g, "");
    } else if (parts.length === 2) {
      const [head, tail] = parts;
      if (tail.length === 3 && head.length <= 3) {
        normalized = unsigned.replace(/,/g, "");
      } else {
        normalized = `${head}.${tail}`;
      }
    }
  } else if (hasDot) {
    const parts = unsigned.split(".");
    if (
      parts.length > 2 &&
      parts.slice(1).every((p) => p.length === 3)
    ) {
      normalized = unsigned.replace(/\./g, "");
    } else if (parts.length === 2) {
      const [head, tail] = parts;
      if (tail.length === 3 && head.length <= 3) {
        normalized = unsigned.replace(/\./g, "");
      } else {
        normalized = unsigned;
      }
    }
  }

  if (s.startsWith("-") && normalized && normalized[0] !== "-") {
    normalized = `-${normalized}`;
  }
  const out = Number.parseFloat(normalized.replace(/^\+/, ""));
  return Number.isFinite(out) ? out : null;
};

const inferNumberStyle = (raw: string): NumberStyle => {
  const compact = raw.trim();
  const unsigned = compact.replace(/^[+-]/, "");
  const hasSpace = /\s/.test(unsigned);
  const hasComma = unsigned.includes(",");
  const hasDot = unsigned.includes(".");

  // Default to "." decimal for safety if ambiguous.
  let decimalSeparator: "." | "," = ".";
  let thousandSeparator: "." | "," | " " | null = null;
  let useGrouping = false;

  if (hasComma && hasDot) {
    const lastComma = unsigned.lastIndexOf(",");
    const lastDot = unsigned.lastIndexOf(".");
    if (lastComma > lastDot) {
      decimalSeparator = ",";
      thousandSeparator = ".";
      useGrouping = unsigned.includes(".");
    } else {
      decimalSeparator = ".";
      thousandSeparator = ",";
      useGrouping = unsigned.includes(",");
    }
  } else if (hasComma) {
    const parts = unsigned.split(",");
    const looksGrouped =
      parts.length > 2
        ? parts.slice(1).every((p) => p.length === 3)
        : parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3;
    if (!looksGrouped && /,\d{1,8}$/.test(unsigned)) {
      decimalSeparator = ",";
      thousandSeparator = unsigned.includes(".") ? "." : hasSpace ? " " : null;
      useGrouping = thousandSeparator != null && unsigned.includes(thousandSeparator);
    } else {
      decimalSeparator = ".";
      thousandSeparator = ",";
      useGrouping = unsigned.includes(",");
    }
  } else if (hasDot) {
    const parts = unsigned.split(".");
    const looksGrouped =
      parts.length > 2
        ? parts.slice(1).every((p) => p.length === 3)
        : parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3;
    if (!looksGrouped && /\.\d{1,8}$/.test(unsigned)) {
      decimalSeparator = ".";
      thousandSeparator = unsigned.includes(",") ? "," : hasSpace ? " " : null;
      useGrouping = thousandSeparator != null && unsigned.includes(thousandSeparator);
    } else {
      decimalSeparator = ",";
      thousandSeparator = ".";
      useGrouping = unsigned.includes(".");
    }
  } else {
    decimalSeparator = ".";
    thousandSeparator = hasSpace ? " " : null;
    useGrouping = false;
  }

  if (hasSpace && !useGrouping && thousandSeparator == null) {
    thousandSeparator = " ";
  }

  return { decimalSeparator, thousandSeparator, useGrouping };
};

const formatNumberLike = (value: number, style: NumberStyle) => {
  const amount = Number.isFinite(value) ? value : NaN;
  if (!Number.isFinite(amount)) return null;

  const rounded = Math.round(amount * 100) / 100;
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded);

  const integer = Math.floor(abs).toString(10);
  const decimals = Math.round((abs - Math.floor(abs)) * 100)
    .toString(10)
    .padStart(2, "0");

  const showDecimals = decimals !== "00";
  const groupedInteger =
    style.useGrouping && style.thousandSeparator
      ? integer.replace(/\B(?=(\d{3})+(?!\d))/g, style.thousandSeparator)
      : integer;
  const fractional = showDecimals ? `${style.decimalSeparator}${decimals}` : "";
  return `${sign}${groupedInteger}${fractional}`;
};

export function formatMoney(value: number, currency: string, lang?: string | null) {
  const amount = Number.isFinite(value) ? value : NaN;
  if (!Number.isFinite(amount)) return null;
  const c = typeof currency === "string" && currency.trim() ? currency.trim().toUpperCase() : "";
  if (!c) return null;
  const locale = getLocaleForLang(lang);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: c,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    const rounded = Math.round(amount * 100) / 100;
    return `${rounded} ${c}`.trim();
  }
}

const SYMBOL_TO_CURRENCY: Record<string, string> = { "€": "EUR", $: "USD", "£": "GBP" };

export function replaceMoneyInText(text: string | null | undefined, lang?: string | null): string | null {
  if (text == null) return null;
  const raw = String(text);
  if (!raw) return raw;

  const currencyCodes = ["EUR", "USD", "GBP", "CHF", "PLN", "RON", "TRY", "UAH", "RUB"];
  const codes = currencyCodes.join("|");
  const numberRe = String.raw`[-+]?(?:\d[\d.,\s]{0,24}\d|\d)(?:[.,]\d{1,8})?`;

  const apply = (template: { prefix: string; suffix: string; hasSpace: boolean; number: string }) => {
    const amount = parseLocaleNumber(template.number);
    if (amount === null) return null;
    const style = inferNumberStyle(template.number);
    const formattedNumber = formatNumberLike(amount, style);
    if (!formattedNumber) return null;
    const join = template.hasSpace ? " " : "";
    return `${template.prefix}${join}${formattedNumber}${template.suffix}`.trim();
  };

  // € 12,34 / $12.34 / £12
  const symbolFirst = new RegExp(String.raw`([€$£])(\s*)(${numberRe})`, "g");
  let out = raw.replace(symbolFirst, (m, sym: string, space: string, num: string) => {
    const replacement = apply({ prefix: sym, suffix: "", hasSpace: !!space, number: num });
    return replacement ?? m;
  });

  // 12,34 € / 12.34 $
  const symbolAfter = new RegExp(String.raw`(${numberRe})(\s*)([€$£])`, "g");
  out = out.replace(symbolAfter, (m, num: string, space: string, sym: string) => {
    const replacement = apply({ prefix: "", suffix: `${!!space ? " " : ""}${sym}`, hasSpace: false, number: num });
    return replacement ?? m;
  });

  // 12,34 EUR / 12.34 USD
  const codeAfter = new RegExp(String.raw`(${numberRe})(\s*)(${codes})\b`, "gi");
  out = out.replace(codeAfter, (m, num: string, space: string, code: string) => {
    const replacement = apply({ prefix: "", suffix: `${!!space ? " " : ""}${code}`, hasSpace: false, number: num });
    return replacement ?? m;
  });

  // EUR 12,34
  const codeBefore = new RegExp(String.raw`\b(${codes})(\s*)(${numberRe})`, "gi");
  out = out.replace(codeBefore, (m, code: string, space: string, num: string) => {
    const replacement = apply({ prefix: code, suffix: "", hasSpace: !!space, number: num });
    return replacement ?? m;
  });

  return out;
}
