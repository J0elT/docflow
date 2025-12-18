const normalizeSentence = (value: string) => {
  const lowered = value
    .replace(/[…]/g, "...")
    .replace(/[.,;:!?()[\]"']/g, "")
    .trim()
    .toLowerCase();

  const withoutDiacritics = lowered
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/ı/g, "i")
    .replace(/\s+/g, " ")
    .trim();

  return withoutDiacritics;
};

const NO_ACTION_SENTENCES = [
  // English
  "No action required",
  "No action is required",
  "No action needed",
  "No action is needed",
  "No action necessary",
  "No action is necessary",
  "No further action required",
  "No further action is required",
  "No further action needed",
  "No further action is needed",
  "No further action necessary",
  "No further action is necessary",
  // German
  "Kein Handlungsbedarf",
  "Kein weiterer Handlungsbedarf",
  "Keine Aktion erforderlich",
  "Keine Handlung erforderlich",
  "Keine weiteren Schritte erforderlich",
  // Other supported UI languages (from `src/lib/language.tsx`)
  "Nicio acțiune necesară",
  "İşlem gerekmez",
  "Aucune action requise",
  "Sin acción necesaria",
  "لا يلزم إجراء",
  "Nenhuma ação necessária",
  "Действий не требуется",
  "Brak wymaganych działań",
  "Дій не потрібно",
];

const NO_ACTION_SENTENCES_NORMALIZED = new Set(
  NO_ACTION_SENTENCES.map((s) => normalizeSentence(s)).filter(Boolean)
);

export const isStandaloneNoActionSentence = (sentence: string) => {
  const normalized = normalizeSentence(sentence);
  if (!normalized) return false;
  return NO_ACTION_SENTENCES_NORMALIZED.has(normalized);
};

