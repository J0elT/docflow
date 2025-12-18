import { describe, expect, it } from "vitest";
import { replaceMoneyInText } from "./moneyFormat";

describe("replaceMoneyInText", () => {
  it("rounds to 2 decimals and drops trailing .00 while preserving token placement", () => {
    expect(replaceMoneyInText("Bankrücklastschrift: 4,0000 EUR", "de")).toBe("Bankrücklastschrift: 4 EUR");
    expect(replaceMoneyInText("EUR 4,0000", "de")).toBe("EUR 4");
    expect(replaceMoneyInText("€ 4,0000", "de")).toBe("€ 4");
    expect(replaceMoneyInText("4,0000 €", "de")).toBe("4 €");
  });

  it("preserves grouping and decimal separators", () => {
    expect(replaceMoneyInText("Monatszahlung: 1.580,10 EUR", "de")).toBe("Monatszahlung: 1.580,10 EUR");
    expect(replaceMoneyInText("Total: 23.94 EUR", "de")).toBe("Total: 23.94 EUR");
    expect(replaceMoneyInText("USD 1,000.00", "en")).toBe("USD 1,000");
  });
});

