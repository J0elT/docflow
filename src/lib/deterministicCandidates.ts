export type CandidateWithSnippet = {
  value: string;
  source_snippet: string;
};

export type MoneyCandidate = {
  value: number;
  currency: string;
  source_snippet: string;
};

export type ReferenceIdCandidate = {
  kind: string;
  value: string;
  source_snippet: string;
};

export type DeterministicCandidates = {
  dates: CandidateWithSnippet[];
  money: MoneyCandidate[];
  emails: CandidateWithSnippet[];
  phones: CandidateWithSnippet[];
  ibans: CandidateWithSnippet[];
  bics: CandidateWithSnippet[];
  reference_ids: ReferenceIdCandidate[];
};

export function formatDeterministicCandidatesForPrompt(candidates: DeterministicCandidates): string {
  try {
    return JSON.stringify(candidates);
  } catch {
    return "{}";
  }
}

const normalizeSnippet = (raw: string, maxLen = 180) =>
  raw.replace(/\s+/g, " ").trim().slice(0, maxLen);

const snippetAround = (text: string, start: number, end: number, radius = 70) => {
  const safeStart = Math.max(0, start - radius);
  const safeEnd = Math.min(text.length, end + radius);
  return normalizeSnippet(text.slice(safeStart, safeEnd));
};

function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

function toIsoDate(y: number, m: number, d: number): string | null {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (y < 1900 || y > 2100) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isValidIsoDate(iso) ? iso : null;
}

function normalizeEmail(raw: string) {
  return raw.trim().replace(/[),.;:]+$/g, "");
}

function normalizePhone(raw: string) {
  const trimmed = raw.trim().replace(/[),.;:]+$/g, "");
  const hasPlus = trimmed.trim().startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length < 7 || digits.length > 18) return null;
  return `${hasPlus ? "+" : ""}${digits}`;
}

function normalizeIdValue(raw: string) {
  return raw.trim().replace(/[),.;:]+$/g, "").replace(/\s+/g, "");
}

function normalizeIban(raw: string) {
  return raw.replace(/\s+/g, "").toUpperCase();
}

function normalizeBic(raw: string) {
  return raw.replace(/\s+/g, "").toUpperCase();
}

function isValidIban(iban: string) {
  const compact = iban.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact)) return false;
  const rearranged = `${compact.slice(4)}${compact.slice(0, 4)}`;
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    if (code >= 48 && code <= 57) {
      remainder = (remainder * 10 + (code - 48)) % 97;
      continue;
    }
    if (code >= 65 && code <= 90) {
      const val = code - 55; // A=10
      remainder = (remainder * 10 + Math.floor(val / 10)) % 97;
      remainder = (remainder * 10 + (val % 10)) % 97;
      continue;
    }
    return false;
  }
  return remainder === 1;
}

function parseMoney(rawNumber: string): number | null {
  const cleaned = rawNumber.replace(/[^\d,.\-+\s]/g, "").trim();
  if (!cleaned) return null;
  const compact = cleaned.replace(/\s+/g, "");
  const unsigned = compact.replace(/^[+-]/, "");
  if (!unsigned) return null;
  if (!/^\d[\d,.\s]*\d$/.test(unsigned) && !/^\d$/.test(unsigned)) return null;

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
    const looksGrouped =
      parts.length > 2
        ? parts.slice(1).every((p) => p.length === 3)
        : parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3;
    if (looksGrouped) {
      normalized = unsigned.replace(/,/g, "");
    } else if (parts.length === 2) {
      normalized = `${parts[0].replace(/[^\d]/g, "")}.${parts[1]}`;
    } else {
      normalized = unsigned.replace(/,/g, "");
    }
  } else if (hasDot) {
    const parts = unsigned.split(".");
    const looksGrouped =
      parts.length > 2
        ? parts.slice(1).every((p) => p.length === 3)
        : parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3;
    if (looksGrouped) {
      normalized = unsigned.replace(/\./g, "");
    } else {
      normalized = unsigned;
    }
  }

  if (compact.startsWith("-") && normalized && !normalized.startsWith("-")) {
    normalized = `-${normalized}`;
  }
  const num = Number.parseFloat(normalized.replace(/^\+/, ""));
  if (!Number.isFinite(num)) return null;
  return num;
}

const hasAny = (s: string, ...needles: string[]) => needles.some((n) => s.includes(n));

export function extractDeterministicCandidates(rawText: string, opts?: { maxPerType?: number }): DeterministicCandidates {
  const max = typeof opts?.maxPerType === "number" && opts.maxPerType > 0 ? Math.floor(opts.maxPerType) : 25;
  const text = typeof rawText === "string" ? rawText : "";
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const out: DeterministicCandidates = {
    dates: [],
    money: [],
    emails: [],
    phones: [],
    ibans: [],
    bics: [],
    reference_ids: [],
  };

  const seen = {
    dates: new Set<string>(),
    money: new Set<string>(),
    emails: new Set<string>(),
    phones: new Set<string>(),
    ibans: new Set<string>(),
    bics: new Set<string>(),
    reference_ids: new Set<string>(),
  };

  const pushDate = (iso: string, snippet: string) => {
    if (!iso || seen.dates.has(iso)) return;
    seen.dates.add(iso);
    out.dates.push({ value: iso, source_snippet: snippet });
  };
  const pushMoney = (value: number, currency: string, snippet: string) => {
    if (!Number.isFinite(value) || !currency) return;
    const key = `${currency}:${value.toFixed(2)}`;
    if (seen.money.has(key)) return;
    seen.money.add(key);
    out.money.push({ value, currency, source_snippet: snippet });
  };
  const pushEmail = (email: string, snippet: string) => {
    const norm = email.toLowerCase();
    if (!norm || seen.emails.has(norm)) return;
    seen.emails.add(norm);
    out.emails.push({ value: email, source_snippet: snippet });
  };
  const pushPhone = (phone: string, snippet: string) => {
    if (!phone || seen.phones.has(phone)) return;
    seen.phones.add(phone);
    out.phones.push({ value: phone, source_snippet: snippet });
  };
  const pushIban = (iban: string, snippet: string) => {
    if (!iban || seen.ibans.has(iban)) return;
    seen.ibans.add(iban);
    out.ibans.push({ value: iban, source_snippet: snippet });
  };
  const pushBic = (bic: string, snippet: string) => {
    if (!bic || seen.bics.has(bic)) return;
    seen.bics.add(bic);
    out.bics.push({ value: bic, source_snippet: snippet });
  };
  const pushRefId = (kind: string, value: string, snippet: string) => {
    if (!kind || !value) return;
    const key = `${kind}:${value}`.toLowerCase();
    if (seen.reference_ids.has(key)) return;
    seen.reference_ids.add(key);
    out.reference_ids.push({ kind, value, source_snippet: snippet });
  };

  const dateIsoRe = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  const dateDmyRe = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/g;
  const dateYmdRe = /\b(\d{4})[./-](\d{1,2})[./-](\d{1,2})\b/g;

  const moneyBeforeRe = /([€$£])\s*([-+]?\d[\d\s.,]{0,20}\d)/g;
  const moneyAfterCodeRe = /([-+]?\d[\d\s.,]{0,20}\d)\s*(EUR|USD|GBP)\b/g;
  const moneyAfterSymbolRe = /([-+]?\d[\d\s.,]{0,20}\d)\s*([€$£])/g;

  const emailRe = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  const phoneHintRe = /\b(?:tel\.?|telefon|phone|call|hotline|kontakt|service)\b/i;
  const phoneRe = /(?:\+?\d[\d\s()./-]{6,}\d)/g;

  const ibanRe = /\b[A-Z]{2}\s*\d{2}(?:\s*[A-Z0-9]){10,30}\b/g;
  const bicHintRe = /\b(?:bic|swift)\b/i;
  const bicRe = /\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g;

  const refPatterns: { kind: string; re: RegExp }[] = [
    { kind: "aktenzeichen", re: /\b(?:aktenzeichen|az\.?|geschäftszeichen|gz\.?)\b\s*[:#]?\s*([A-Z0-9][A-Z0-9\/\-\.]{2,})/i },
    { kind: "kundennummer", re: /\b(?:kundennummer|kundennr\.?|kd\.?\s*nr\.?)\b\s*[:#]?\s*([A-Z0-9][A-Z0-9\/\-\.]{2,})/i },
    { kind: "vorgangsnummer", re: /\b(?:vorgangsnummer|vorgangsnr\.?|vorgang\s*nr\.?)\b\s*[:#]?\s*([A-Z0-9][A-Z0-9\/\-\.]{2,})/i },
    { kind: "invoice_number", re: /\b(?:rechnungsnummer|rechnung\s*nr\.?|invoice\s*number|invoice\s*no\.?)\b\s*[:#]?\s*([A-Z0-9][A-Z0-9\/\-\.]{2,})/i },
    { kind: "contract_number", re: /\b(?:vertragsnummer|vertrag\s*nr\.?|contract\s*number|contract\s*no\.?)\b\s*[:#]?\s*([A-Z0-9][A-Z0-9\/\-\.]{2,})/i },
    { kind: "tax_number", re: /\b(?:steuer(?:nummer|nr\.?)|tax\s*number|tax\s*no\.?)\b\s*[:#]?\s*([A-Z0-9][A-Z0-9\/\-\.]{2,})/i },
    { kind: "mandate_reference", re: /\b(?:mandatsreferenz|mandat(?:s)?ref\.?|mandate\s*reference)\b\s*[:#]?\s*([A-Z0-9][A-Z0-9\/\-\.]{2,})/i },
  ];

  for (const lineRaw of lines) {
    if (out.dates.length < max) {
      const line = lineRaw;
      const snippet = normalizeSnippet(line);
      for (const m of line.matchAll(dateIsoRe)) {
        const y = Number(m[1]);
        const mo = Number(m[2]);
        const d = Number(m[3]);
        const iso = toIsoDate(y, mo, d);
        if (iso) pushDate(iso, snippet);
      }
      for (const m of line.matchAll(dateDmyRe)) {
        const d = Number(m[1]);
        const mo = Number(m[2]);
        const y = Number(m[3]);
        const iso = toIsoDate(y, mo, d);
        if (iso) pushDate(iso, snippet);
      }
      for (const m of line.matchAll(dateYmdRe)) {
        const y = Number(m[1]);
        const mo = Number(m[2]);
        const d = Number(m[3]);
        const iso = toIsoDate(y, mo, d);
        if (iso) pushDate(iso, snippet);
      }
    }

    if (out.money.length < max) {
      const snippet = normalizeSnippet(lineRaw);
      for (const m of lineRaw.matchAll(moneyBeforeRe)) {
        const symbol = m[1];
        const amountRaw = m[2];
        const currency = symbol === "€" ? "EUR" : symbol === "$" ? "USD" : symbol === "£" ? "GBP" : "";
        const value = parseMoney(amountRaw);
        if (value !== null && currency) pushMoney(value, currency, snippet);
      }
      for (const m of lineRaw.matchAll(moneyAfterCodeRe)) {
        const amountRaw = m[1];
        const curToken = m[2];
        const currency =
          curToken === "EUR"
            ? "EUR"
            : curToken === "USD"
              ? "USD"
              : curToken === "GBP"
                ? "GBP"
                : "";
        const value = parseMoney(amountRaw);
        if (value !== null && currency) pushMoney(value, currency, snippet);
      }
      for (const m of lineRaw.matchAll(moneyAfterSymbolRe)) {
        const amountRaw = m[1];
        const symbol = m[2];
        const currency = symbol === "€" ? "EUR" : symbol === "$" ? "USD" : symbol === "£" ? "GBP" : "";
        const value = parseMoney(amountRaw);
        if (value !== null && currency) pushMoney(value, currency, snippet);
      }
    }

    if (out.emails.length < max) {
      const snippet = normalizeSnippet(lineRaw);
      for (const m of lineRaw.matchAll(emailRe)) {
        const email = normalizeEmail(m[0]);
        if (email) pushEmail(email, snippet);
      }
    }

    if (out.phones.length < max) {
      const lower = lineRaw.toLowerCase();
      if (phoneHintRe.test(lower)) {
        const snippet = normalizeSnippet(lineRaw);
        for (const m of lineRaw.matchAll(phoneRe)) {
          const normalized = normalizePhone(m[0]);
          if (normalized) pushPhone(normalized, snippet);
        }
      }
    }

    if (out.bics.length < max) {
      const lower = lineRaw.toLowerCase();
      if (bicHintRe.test(lower)) {
        const snippet = normalizeSnippet(lineRaw);
        for (const m of lineRaw.matchAll(bicRe)) {
          const bic = normalizeBic(m[0]);
          if (bic.length === 8 || bic.length === 11) pushBic(bic, snippet);
        }
      }
    }

    if (out.reference_ids.length < max) {
      const lineLower = lineRaw.toLowerCase();
      if (hasAny(lineLower, "aktenzeichen", "az", "geschäftszeichen", "gz", "kundennummer", "kundennr", "vorgang", "rechn", "invoice", "vertrag", "contract", "steuer", "tax", "mandat")) {
        const snippet = normalizeSnippet(lineRaw);
        for (const { kind, re } of refPatterns) {
          const m = lineRaw.match(re);
          const rawVal = m?.[1] ?? null;
          const val = rawVal ? normalizeIdValue(rawVal) : null;
          if (val) pushRefId(kind, val, snippet);
        }
      }
    }

    if (
      out.dates.length >= max &&
      out.money.length >= max &&
      out.emails.length >= max &&
      out.phones.length >= max &&
      out.bics.length >= max &&
      out.reference_ids.length >= max
    ) {
      break;
    }
  }

  // IBANs are often wrapped/spaced; scan the full text.
  if (text && out.ibans.length < max) {
    for (const m of text.matchAll(ibanRe)) {
      const raw = m[0];
      const start = m.index ?? 0;
      const normalized = normalizeIban(raw);
      const maxLen = Math.min(normalized.length, 34);
      let found: string | null = null;
      for (let len = maxLen; len >= 15; len--) {
        const candidate = normalized.slice(0, len);
        if (isValidIban(candidate)) {
          found = candidate;
          break;
        }
      }
      if (!found) continue;
      pushIban(found, snippetAround(text, start, start + raw.length));
      if (out.ibans.length >= max) break;
    }
  }

  // Also surface IBAN/BIC through reference_ids for downstream matching.
  out.ibans.forEach((c) => pushRefId("iban", c.value, c.source_snippet));
  out.bics.forEach((c) => pushRefId("bic", c.value, c.source_snippet));

  // Keep deterministic candidates small and stable.
  out.dates = out.dates.slice(0, max);
  out.money = out.money.slice(0, max);
  out.emails = out.emails.slice(0, max);
  out.phones = out.phones.slice(0, max);
  out.ibans = out.ibans.slice(0, max);
  out.bics = out.bics.slice(0, max);
  out.reference_ids = out.reference_ids.slice(0, max);

  return out;
}
