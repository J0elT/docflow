/* eslint-disable @typescript-eslint/no-explicit-any */
import { mapToCategoryPath, buildFriendlyTitle } from "./route";

describe("category helpers", () => {
  it("uses key_fields.category_path when present", () => {
    const parsed = {
      key_fields: { category_path: ["Finanzen", "Steuern"] },
      category_suggestion: { path: ["Ignored"], confidence: 0.9 },
    };
    expect(mapToCategoryPath(parsed as any)).toEqual({
      path: ["Finanzen", "Steuern"],
      confidence: 0.9,
    });
  });

  it("falls back to category_suggestion.path", () => {
    const parsed = {
      category_suggestion: { path: ["Gesundheit"], confidence: 0.8 },
    };
    expect(mapToCategoryPath(parsed as any)).toEqual({
      path: ["Gesundheit"],
      confidence: 0.8,
    });
  });

  it("coarsely maps legacy slug to a generic path", () => {
    const parsed = {
      category_suggestion: { slug: "finanzamt", confidence: 0.6 },
    };
    expect(mapToCategoryPath(parsed as any)).toEqual({
      path: ["Finance & Assets"],
      confidence: 0.6,
    });
  });
});

describe("buildFriendlyTitle", () => {
  it("prefers topic and appends month/year when present", () => {
    const parsed = {
      key_fields: {
        topic: "Nebenkostenabrechnung",
        letter_date: "2024-11-02",
      },
      summary: "Abrechnung über 2024",
    };
    expect(buildFriendlyTitle(parsed as any)).toBe("Nebenkostenabrechnung 2024-11-02");
  });

  it("falls back to summary when topic missing", () => {
    const parsed = {
      document_kind: "notice",
      summary: "Krankenkasse bestätigt Beitrag",
    };
    expect(buildFriendlyTitle(parsed as any)).toBe("Krankenkasse bestätigt Beitrag");
  });
});
