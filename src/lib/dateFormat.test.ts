import { describe, expect, it } from "vitest";
import { extractDateRangeToIso, formatDateYmdMon, replaceIsoDatesInText } from "./dateFormat";

describe("dateFormat", () => {
  it("formats ISO dates in German UI style", () => {
    expect(formatDateYmdMon("2025-11-06", "de")).toBe("06.11.2025");
    expect(replaceIsoDatesInText("Dokumentdatum: 2025-11-06", "de")).toBe("Dokumentdatum: 06.11.2025");
  });

  it("formats ISO dates in English UI style", () => {
    expect(formatDateYmdMon("2025-11-06", "en")).toBe("6 Nov 2025");
    expect(replaceIsoDatesInText("Document date: 2025-11-06", "en")).toBe("Document date: 6 Nov 2025");
  });

  it("renders ISO date ranges as compact scanable ranges", () => {
    expect(replaceIsoDatesInText("Sperrzeit: 2026-01-24 to 2026-02-23", "de")).toBe(
      "Sperrzeit: 24.01–23.02.2026"
    );
    expect(replaceIsoDatesInText("Blocking period: 2026-01-24 to 2026-02-23", "en")).toBe(
      "Blocking period: 24 Jan–23 Feb 2026"
    );
  });

  it("extracts date ranges from compact display forms", () => {
    expect(extractDateRangeToIso("24.01–23.02.2026")).toEqual({ start: "2026-01-24", end: "2026-02-23" });
    expect(extractDateRangeToIso("01.11–30.11.2025")).toEqual({ start: "2025-11-01", end: "2025-11-30" });
    expect(extractDateRangeToIso("1 Nov–30 Nov 2025")).toEqual({ start: "2025-11-01", end: "2025-11-30" });
  });
});

