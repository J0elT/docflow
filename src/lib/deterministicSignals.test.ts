import { describe, expect, it } from "vitest";
import { extractDeterministicSignals } from "./deterministicSignals";

describe("extractDeterministicSignals", () => {
  it("extracts Sperrzeit ranges (including 'bis zum')", () => {
    const text = [
      "Es tritt eine Sperrzeit vom 24.01.2026 bis zum 23.02.2026 ein.",
      "Weitere Hinweise folgen.",
    ].join("\n");

    const out = extractDeterministicSignals(text);
    expect(out.blocking_periods.length).toBeGreaterThan(0);
    expect(out.blocking_periods[0]?.kind).toBe("sperrzeit");
    expect(out.blocking_periods[0]?.start_date).toBe("2026-01-24");
    expect(out.blocking_periods[0]?.end_date).toBe("2026-02-23");
  });

  it("extracts Sperrfrist ranges", () => {
    const text = "Sperrfrist: 24.01.2026 - 23.02.2026.";
    const out = extractDeterministicSignals(text);
    expect(out.blocking_periods[0]?.kind).toBe("sperrfrist");
    expect(out.blocking_periods[0]?.start_date).toBe("2026-01-24");
    expect(out.blocking_periods[0]?.end_date).toBe("2026-02-23");
  });
});

