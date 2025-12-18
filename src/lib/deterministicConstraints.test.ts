import { describe, expect, it } from "vitest";
import type { ExtractionPayload } from "./extractionSchema";
import type { DeterministicCandidates } from "./deterministicCandidates";
import { applyDeterministicConstraints } from "./deterministicConstraints";

describe("applyDeterministicConstraints", () => {
  it("drops model values not present in candidates and auto-fills deterministic IDs", () => {
    const candidates: DeterministicCandidates = {
      dates: [{ value: "2025-02-28", source_snippet: "bis 28.02.2025" }],
      money: [{ value: 1234.56, currency: "EUR", source_snippet: "1.234,56 €" }],
      emails: [{ value: "service@example.de", source_snippet: "service@example.de" }],
      phones: [{ value: "+4903012345678", source_snippet: "+49 (0)30 1234 5678" }],
      ibans: [{ value: "DE89370400440532013000", source_snippet: "IBAN: DE89..." }],
      bics: [{ value: "COBADEFFXXX", source_snippet: "BIC: COBADEFFXXX" }],
      reference_ids: [
        { kind: "kundennummer", value: "12345678", source_snippet: "Kundennummer: 12345678" },
        { kind: "iban", value: "DE89370400440532013000", source_snippet: "IBAN: DE89..." },
      ],
    };

    const extraction: ExtractionPayload = {
      key_fields: {
        document_date: "2025-02-27", // not in candidates -> dropped
        due_date: "2025-02-28", // ok
        contact_email: "invented@example.de", // dropped
        contact_phone: "030 1234 5678", // not exact candidate -> dropped
        reference_ids: {
          customer_number: "999999", // dropped but auto-filled with deterministic kundennummer
          iban: "DE89 3704 0044 0532 0130 00", // normalized mismatch -> dropped but auto-filled
        },
        amount_total: 999.99, // dropped
        currency: "EUR",
      },
      deadlines: [{ id: "d1", date_exact: "2025-02-27", description: "Bad date" }],
      amounts: [{ value: 999.99, currency: "EUR", description: "Bad amount" }],
    };

    const out = applyDeterministicConstraints(extraction, candidates);
    expect(out.key_fields?.document_date).toBeNull();
    expect(out.key_fields?.due_date).toBe("2025-02-28");
    expect(out.key_fields?.contact_email).toBeNull();
    expect(out.key_fields?.contact_phone).toBeNull();
    expect(out.key_fields?.amount_total).toBeNull();
    expect(out.amounts?.length ?? 0).toBe(0);
    expect(out.deadlines?.[0]?.date_exact ?? null).toBeNull();

    const refs = (out.key_fields?.reference_ids ?? {}) as Record<string, string | null>;
    expect(refs.customer_number).toBe("12345678");
    expect(refs.kundennummer).toBe("12345678");
    expect(refs.iban).toBe("DE89370400440532013000");
  });
});
