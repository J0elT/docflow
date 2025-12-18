import { extractDateRangeToIso, parseDateToIso } from "./dateFormat";

export type BlockingPeriodSignal = {
  kind: "sperrzeit" | "sperrfrist" | "ruhenszeit" | "ruhezeit";
  start_date: string | null;
  end_date: string | null;
  source_snippet: string;
  confidence: number;
};

export type DeterministicSignals = {
  blocking_periods: BlockingPeriodSignal[];
};

const normalizeSnippet = (raw: string, maxLen = 220) =>
  raw.replace(/\s+/g, " ").trim().slice(0, maxLen);

const snippetAround = (text: string, start: number, end: number, radius = 180) => {
  const safeStart = Math.max(0, start - radius);
  const safeEnd = Math.min(text.length, end + radius);
  return normalizeSnippet(text.slice(safeStart, safeEnd));
};

const sanitizeRangeText = (raw: string) =>
  raw
    .replace(/\bbis\s+(zum|zur)\b/gi, "bis")
    .replace(/\bbis\s+(einschlie(?:ß|ss)lich|einschl\.)\b/gi, "bis")
    .replace(/\bto\s+the\b/gi, "to")
    .replace(/\s+/g, " ");

const extractStartEnd = (raw: string) => {
  const dateToken = String.raw`(?:\d{4}-\d{2}-\d{2}|\d{4}-[\p{L}.]{2,}-\d{2}|\d{1,2}[./-]\d{1,2}(?:[./-]\d{4})?|\d{1,2}\s+[\p{L}.]{2,}(?:\s+\d{4})?)`;

  const startRe = new RegExp(String.raw`(?:\b(?:ab|from|starting|beginn(?:end)?|seit)\b\s*(?:dem|den|the)?\s*)(${dateToken})`, "iu");
  const endRe = new RegExp(String.raw`(?:\b(?:bis|to|until|till)\b\s*(?:zum|zur|the)?\s*)(${dateToken})`, "iu");

  const startMatch = raw.match(startRe);
  const endMatch = raw.match(endRe);
  const start = startMatch ? parseDateToIso(startMatch[1]) : null;
  const end = endMatch ? parseDateToIso(endMatch[1]) : null;
  return { start, end };
};

export function extractDeterministicSignals(rawText: string, opts?: { maxPerType?: number }): DeterministicSignals {
  const max = typeof opts?.maxPerType === "number" && opts.maxPerType > 0 ? Math.floor(opts.maxPerType) : 6;
  const text = typeof rawText === "string" ? rawText : "";
  if (!text.trim()) return { blocking_periods: [] };

  const out: DeterministicSignals = { blocking_periods: [] };
  const seen = new Set<string>();

  const keywordRe = /\b(sperrzeit|sperrfrist|ruhenszeit|ruhezeit)\b/gi;
  for (const m of text.matchAll(keywordRe)) {
    const kindRaw = String(m[1] || "").toLowerCase();
    const kind = (kindRaw === "sperrfrist" ? "sperrfrist"
      : kindRaw === "ruhenszeit" ? "ruhenszeit"
        : kindRaw === "ruhezeit" ? "ruhezeit"
          : "sperrzeit") as BlockingPeriodSignal["kind"];
    const startIdx = m.index ?? 0;
    const snippet = snippetAround(text, startIdx, startIdx + m[0].length);
    const sanitized = sanitizeRangeText(snippet);

    const range = extractDateRangeToIso(snippet) || extractDateRangeToIso(sanitized);
    const byWords = extractStartEnd(sanitized);
    const start = range?.start ?? byWords.start;
    const end = range?.end ?? byWords.end;

    if (!start && !end) continue;
    const key = `${kind}:${start ?? ""}:${end ?? ""}:${snippet}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.blocking_periods.push({
      kind,
      start_date: start,
      end_date: end,
      source_snippet: snippet,
      confidence: range ? 0.95 : start && end ? 0.85 : 0.7,
    });
    if (out.blocking_periods.length >= max) break;
  }

  return out;
}

