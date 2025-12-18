import { describe, expect, it } from "vitest";
import { extractDeterministicCandidates } from "./deterministicCandidates";

describe("extractDeterministicCandidates", () => {
  it("extracts dates, money, bank details, IDs, and contact candidates", () => {
    const text = [
      "Kundennummer: 12345678",
      "Aktenzeichen: AB-12/345",
      "Vorgangsnummer: V-9999",
      "Bitte zahlen Sie bis 28.02.2025 den Betrag 1.234,56 €.",
      "IBAN: DE89 3704 0044 0532 0130 00",
      "BIC: COBADEFFXXX",
      "Kontakt: service@example.de, Tel. +49 (0)30 1234 5678",
    ].join("\n");

    const out = extractDeterministicCandidates(text);

    expect(out.dates.map((d) => d.value)).toContain("2025-02-28");
    expect(out.money.some((m) => m.currency === "EUR" && Math.abs(m.value - 1234.56) < 0.001)).toBe(true);
    expect(out.ibans.map((i) => i.value)).toContain("DE89370400440532013000");
    expect(out.bics.map((b) => b.value)).toContain("COBADEFFXXX");
    expect(out.emails.map((e) => e.value.toLowerCase())).toContain("service@example.de");
    expect(out.phones.map((p) => p.value)).toContain("+4903012345678");

    const refKinds = out.reference_ids.map((r) => `${r.kind}:${r.value}`);
    expect(refKinds).toContain("kundennummer:12345678");
    expect(refKinds).toContain("aktenzeichen:AB-12/345");
    expect(refKinds).toContain("vorgangsnummer:V-9999");
  });

  it("dedupes values across multiple occurrences", () => {
    const text = [
      "Kundennummer: 12345678",
      "Kundennummer: 12345678",
      "Bitte zahlen Sie bis 2025-02-28 den Betrag 10,00 EUR.",
      "Zahlbar bis 28.02.2025: 10.00 EUR",
      "IBAN DE89 3704 0044 0532 0130 00",
      "IBAN: DE89 3704 0044 0532 0130 00",
    ].join("\n");
    const out = extractDeterministicCandidates(text);
    expect(out.reference_ids.filter((r) => r.kind === "kundennummer").length).toBe(1);
    expect(out.dates.filter((d) => d.value === "2025-02-28").length).toBe(1);
    expect(out.ibans.filter((i) => i.value === "DE89370400440532013000").length).toBe(1);
  });
});

