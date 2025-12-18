import { describe, expect, it } from "vitest";
import { isStandaloneNoActionSentence } from "./summary";

describe("isStandaloneNoActionSentence", () => {
  it("matches common English variants (with punctuation)", () => {
    expect(isStandaloneNoActionSentence("No action required.")).toBe(true);
    expect(isStandaloneNoActionSentence("No action needed!")).toBe(true);
    expect(isStandaloneNoActionSentence("No further action is required")).toBe(true);
  });

  it("matches supported UI language phrases", () => {
    expect(isStandaloneNoActionSentence("Kein Handlungsbedarf.")).toBe(true);
    expect(isStandaloneNoActionSentence("Nicio acțiune necesară.")).toBe(true);
    expect(isStandaloneNoActionSentence("İşlem gerekmez.")).toBe(true);
    expect(isStandaloneNoActionSentence("Aucune action requise.")).toBe(true);
    expect(isStandaloneNoActionSentence("Sin acción necesaria.")).toBe(true);
    expect(isStandaloneNoActionSentence("Nenhuma ação necessária.")).toBe(true);
    expect(isStandaloneNoActionSentence("Действий не требуется.")).toBe(true);
    expect(isStandaloneNoActionSentence("Brak wymaganych działań.")).toBe(true);
    expect(isStandaloneNoActionSentence("Дій не потрібно.")).toBe(true);
  });

  it("does not match when additional meaning is present", () => {
    expect(
      isStandaloneNoActionSentence("No action needed because payment will be debited automatically.")
    ).toBe(false);
    expect(isStandaloneNoActionSentence("No action required by 2025-11-11.")).toBe(false);
  });
});

