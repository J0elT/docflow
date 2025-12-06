/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  slugToLabel,
  inferSuggestedCategorySlug,
  canonicalizeCategorySegment,
  mapToCategoryPath,
  buildFriendlyTitle,
} from "./route";

describe("category helpers", () => {
  it("maps slugs to labels with Sonstiges fallback", () => {
    expect(slugToLabel("jobcenter")).toBe("Jobcenter (Bürgergeld, SGB II)");
    expect(slugToLabel("unknown")).toBe("Sonstiges");
    expect(slugToLabel(null)).toBe("Sonstiges");
  });

  it("infers category slugs from indicative text", () => {
    expect(inferSuggestedCategorySlug("Schreiben vom Jobcenter über Bürgergeld")).toBe("jobcenter");
    expect(inferSuggestedCategorySlug("Finanzamt Steuerbescheid 2024")).toBe("finanzamt");
    expect(inferSuggestedCategorySlug("Krankenkasse Beitrag")).toBe("krankenkasse");
    expect(inferSuggestedCategorySlug("unbekannt")).toBe("sonstiges");
  });

  it("canonicalizes category segments to known labels", () => {
    expect(canonicalizeCategorySegment("jobcenter")).toBe("Jobcenter (Bürgergeld, SGB II)");
    expect(canonicalizeCategorySegment("  FINANZAMT ")).toBe("Finanzamt / Steuern");
    expect(canonicalizeCategorySegment("Steuerbescheid")).toBe("Finanzamt / Steuern");
  });

  it("maps parsed extraction to category path using suggestion or inference", () => {
    const parsedWithSuggestion = {
      category_suggestion: { slug: "miete" },
      key_fields: { topic: "Mietvertrag" },
      summary: "Etwas zum Mietvertrag",
    };
    expect(mapToCategoryPath(parsedWithSuggestion as any, "")).toEqual(["Miete & Wohnen"]);

    const parsedWithInference = {
      key_fields: { topic: "Bürgergeld Antrag" },
      summary: "Schreiben vom Jobcenter",
    };
    expect(mapToCategoryPath(parsedWithInference as any, "")).toEqual([
      "Jobcenter (Bürgergeld, SGB II)",
    ]);
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
