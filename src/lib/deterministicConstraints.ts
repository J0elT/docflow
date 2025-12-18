import type { ExtractionPayload } from "./extractionSchema";
import type { DeterministicCandidates } from "./deterministicCandidates";

const normalizeString = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

const normalizeRefValue = (raw: string) => raw.trim().replace(/[),.;:]+$/g, "").replace(/\s+/g, "");

const moneyKey = (value: number, currency: string) => `${currency}:${value.toFixed(2)}`;

export function applyDeterministicConstraints<T extends ExtractionPayload>(
  extraction: T,
  candidates: DeterministicCandidates
): T {
  const out = { ...extraction } as T;
  const keyFields = { ...(out.key_fields ?? {}) };
  out.key_fields = keyFields;

  const dateSet = new Set(candidates.dates.map((d) => d.value));
  const constrainDate = (field: "document_date" | "letter_date" | "due_date") => {
    const raw = normalizeString(keyFields?.[field]);
    if (!raw) {
      keyFields[field] = raw;
      return;
    }
    keyFields[field] = dateSet.size === 0 || dateSet.has(raw) ? raw : null;
  };
  constrainDate("document_date");
  constrainDate("letter_date");
  constrainDate("due_date");

  const emailMap = new Map<string, string>();
  candidates.emails.forEach((c) => {
    const key = c.value.toLowerCase();
    if (!emailMap.has(key)) emailMap.set(key, c.value);
  });
  const email = normalizeString(keyFields?.contact_email);
  if (email) {
    keyFields.contact_email = emailMap.get(email.toLowerCase()) ?? null;
  }

  const phoneMap = new Map<string, string>();
  candidates.phones.forEach((c) => {
    const digits = c.value.replace(/[^\d]/g, "");
    if (digits && !phoneMap.has(digits)) phoneMap.set(digits, c.value);
  });
  const phone = normalizeString(keyFields?.contact_phone);
  if (phone) {
    const digits = phone.replace(/[^\d]/g, "");
    keyFields.contact_phone = (digits && phoneMap.get(digits)) ?? null;
  }

  const refCandidates = candidates.reference_ids;
  const refCandidateByNorm = new Map<string, string>();
  refCandidates.forEach((c) => {
    const norm = normalizeRefValue(c.value).toLowerCase();
    if (norm && !refCandidateByNorm.has(norm)) refCandidateByNorm.set(norm, c.value);
  });

  const rawRef = keyFields?.reference_ids;
  const refObj: Record<string, string | null> =
    rawRef && typeof rawRef === "object" && !Array.isArray(rawRef) ? { ...rawRef } : {};

  // Constrain model-provided reference IDs to deterministic candidates.
  Object.entries(refObj).forEach(([k, v]) => {
    const raw = normalizeString(v);
    if (!raw) {
      refObj[k] = null;
      return;
    }
    const norm = normalizeRefValue(raw).toLowerCase();
    const canonical = refCandidateByNorm.get(norm);
    refObj[k] = canonical ?? null;
  });

  // Auto-fill reference IDs from deterministic candidates (safe: hidden by default in UI).
  const setIfMissing = (k: string, v: string) => {
    const cur = refObj[k];
    if (typeof cur === "string" && cur.trim()) return;
    refObj[k] = v;
  };
  for (const cand of refCandidates) {
    const kind = cand.kind;
    const value = cand.value;
    if (!kind || !value) continue;
    if (kind === "kundennummer") {
      setIfMissing("kundennummer", value);
      setIfMissing("customer_number", value);
      continue;
    }
    if (kind === "aktenzeichen") {
      setIfMissing("aktenzeichen", value);
      setIfMissing("case_number", value);
      continue;
    }
    if (kind === "vorgangsnummer") {
      setIfMissing("vorgangsnummer", value);
      setIfMissing("case_number", value);
      continue;
    }
    setIfMissing(kind, value);
  }
  keyFields.reference_ids = refObj;

  const candidateMoney = candidates.money;
  const candidateMoneyKeys = new Set(
    candidateMoney.map((m) => moneyKey(m.value, m.currency))
  );
  const matchesCandidateMoney = (value: unknown, currency: unknown) => {
    if (!candidateMoneyKeys.size) return true;
    if (typeof value !== "number" || !Number.isFinite(value)) return false;
    if (typeof currency !== "string" || !currency.trim()) return false;
    const rounded = Number(value.toFixed(2));
    const key = moneyKey(rounded, currency.trim().toUpperCase());
    return candidateMoneyKeys.has(key);
  };

  const amountTotal = keyFields.amount_total;
  const currency = normalizeString(keyFields.currency)?.toUpperCase() ?? null;
  if (typeof amountTotal === "number" && Number.isFinite(amountTotal) && currency) {
    if (!matchesCandidateMoney(amountTotal, currency)) {
      keyFields.amount_total = null;
    } else {
      keyFields.currency = currency;
    }
  }

  if (Array.isArray(out.amounts) && candidateMoneyKeys.size) {
    out.amounts = out.amounts
      .filter((a) => matchesCandidateMoney(a?.value, a?.currency))
      .map((a) => ({ ...a, currency: normalizeString(a?.currency)?.toUpperCase() ?? a?.currency }));
  }

  if (Array.isArray(out.deadlines) && dateSet.size) {
    out.deadlines = out.deadlines.map((d) => {
      const dateExact = normalizeString(d?.date_exact);
      if (!dateExact) return d;
      if (dateSet.has(dateExact)) return d;
      return { ...d, date_exact: null };
    });
  }

  return out as T;
}
