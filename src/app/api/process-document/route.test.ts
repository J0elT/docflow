/* eslint-disable @typescript-eslint/no-explicit-any */
import { mapToCategoryPath, buildFriendlyTitle, normalizeExtraction, shouldCreateAppealTask } from "./route";

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
  it("uses issuer_short + document_kind_fine + billing_period when present", () => {
    const parsed = {
      key_fields: {
        language: "de",
        issuer_short: "SIM.de",
        document_kind_fine: "Mobilfunkrechnung",
        billing_period: "2025-10",
      },
      summary: "Monatliche Mobilfunkrechnung",
    };
    expect(buildFriendlyTitle(parsed as any)).toBe("SIM.de Mobilfunkrechnung (10.2025)");
  });

  it("falls back to issuer_short + document_kind_fine + document_date when no billing_period", () => {
    const parsed = {
      key_fields: {
        language: "de",
        issuer_short: "AOK",
        document_kind_fine: "Beitragsbescheid",
        document_date: "2025-10-31",
        sender: "AOK Nordost – Die Gesundheitskasse, Service Center Berlin",
      },
      summary: "Beitragsbescheid",
    };
    expect(buildFriendlyTitle(parsed as any)).toBe("AOK Beitragsbescheid (31.10.2025)");
  });

  it("prefers topic and appends month/year when present", () => {
    const parsed = {
      key_fields: {
        topic: "Nebenkostenabrechnung",
        letter_date: "2024-11-02",
      },
      summary: "Abrechnung über 2024",
    };
    expect(buildFriendlyTitle(parsed as any)).toBe("Nebenkostenabrechnung 2 Nov 2024");
  });

  it("falls back to summary when topic missing", () => {
    const parsed = {
      document_kind: "notice",
      summary: "Krankenkasse bestätigt Beitrag",
    };
    expect(buildFriendlyTitle(parsed as any)).toBe("Krankenkasse bestätigt Beitrag");
  });
});

describe("normalizeExtraction", () => {
  it("preserves short summary vs longer main_summary", () => {
    const parsed = {
      summary: "Short gist.",
      main_summary: "Longer explanation that should not overwrite the gist.",
      extra_details: [],
      key_fields: {},
    };
    const out = normalizeExtraction(parsed as any, "en" as any, false);
    expect(out.summary).toBe("Short gist.");
    expect(out.main_summary).toBe("Longer explanation that should not overwrite the gist.");
  });

  it("backfills missing summary/main_summary for older extractions", () => {
    const onlySummary = normalizeExtraction({ summary: "Only summary.", extra_details: [], key_fields: {} } as any, "en" as any, false);
    expect(onlySummary.summary).toBe("Only summary.");
    expect(onlySummary.main_summary).toBe("Only summary.");

    const onlyMain = normalizeExtraction({ main_summary: "Only main.", extra_details: [], key_fields: {} } as any, "en" as any, false);
    expect(onlyMain.summary).toBe("Only main.");
    expect(onlyMain.main_summary).toBe("Only main.");
  });

  it("does not treat appeal boilerplate as a task in positive decisions", () => {
    const parsed = {
      summary: "Provisional approval for unemployment benefit.",
      main_summary: "Your entitlement is granted; appeal is possible if something is wrong.",
      extra_details: [],
      risk_level: "low",
      key_fields: {
        language: "de",
        action_required: true,
        action_description: "Widerspruch einlegen",
        due_date: "2025-12-06",
      },
      deadlines: [
        {
          kind: "appeal",
          date_exact: "2025-12-06",
          relative_text: "innerhalb eines Monats nach Bekanntgabe",
          description: "Widerspruch einlegen",
          is_hard_deadline: true,
        },
      ],
      actions_required: [{ label: "Widerspruch einlegen" }],
      task_suggestion: { should_create_task: true, title: "Widerspruch einlegen" },
    };

    expect(shouldCreateAppealTask(parsed as any)).toBe(false);
    const out = normalizeExtraction(parsed as any, "de" as any, false) as any;
    expect(out.key_fields.action_required).toBe(false);
    expect(out.key_fields.action_description).toBeNull();
    expect(out.task_suggestion.should_create_task).toBe(false);
    expect(out.task_suggestion.title).toBeNull();
    expect(out.actions_required).toEqual([]);
    expect(out.key_fields.due_date).toBeNull();
  });

  it("keeps appeal tasks when there is a negative impact signal", () => {
    const parsed = {
      summary: "Decision includes a Sperrzeit.",
      extra_details: ["Sperrzeit: 2026-01-24 to 2026-01-30 - Zeitraum ohne Auszahlung."],
      key_fields: {
        language: "de",
        action_required: true,
        action_description: "Widerspruch einlegen",
      },
      actions_required: [{ label: "Widerspruch einlegen" }],
      task_suggestion: { should_create_task: true, title: "Widerspruch einlegen" },
    };

    expect(shouldCreateAppealTask(parsed as any)).toBe(true);
    const out = normalizeExtraction(parsed as any, "de" as any, false) as any;
    expect(out.key_fields.action_required).toBe(true);
    expect(out.key_fields.action_description).toBe("Widerspruch einlegen");
    expect(out.task_suggestion.should_create_task).toBe(true);
    expect(out.actions_required.length).toBe(1);
  });
});
