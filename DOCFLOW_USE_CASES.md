# DocFlow – Document & Screenshot Use Cases

> What users will upload, what we should extract, and what we should surface.

---

## 0. General Principles

For every document we try to extract four things:

1. **Gist** – 1–2 sentences: what is this and what’s the core outcome?
2. **Facts** – dates, amounts, parties, IDs.
3. **Risks / Rights** – e.g. Sperrzeit, Kündigung, Rückforderung, Fristen, waivers.
4. **Actions** – concrete things the user may need to do and by when.

We stay descriptive and non-legal:  
**“What it says”**, not **“what you should decide.”**

---

## 1. Government & Social Benefits

### 1.1 Arbeitsagentur / Jobcenter / Sozialamt

**Examples**

- Bewilligungsbescheid / Ablehnungsbescheid (ALG I, Bürgergeld, Sozialhilfe)
- Änderungsbescheid, Aufhebungs- und Erstattungsbescheid
- Aufforderung zur Mitwirkung / Nachweise
- Sperrzeit- oder Ruhensbescheide
- Einladungen zu Terminen / Maßnahmen

**Extract**

- Sender: Agentur für Arbeit / Jobcenter / Stadt / Kreis
- Art des Bescheids (Bewilligung, Ablehnung, Aufhebung, Rückforderung)
- Leistungstyp (ALG I, Bürgergeld, Sozialhilfe…)
- Beträge:
  - täglicher / monatlicher Betrag
  - Nachzahlungen / Rückforderungen
- Zeiträume:
  - Bewilligungszeitraum
  - Sperrzeiten / Ruhenszeiträume
- Fristen:
  - Widerspruchsfrist
  - Frist zur Mitwirkung / Nachreichung
- Termine:
  - Datum/Uhrzeit/Ort von Terminen / Maßnahmen
- Konto / Zahlungsweise

**Surface**

- Badge: `Widerspruchsfrist bis …` / `Sperrzeit …–…` / `Rückforderung … EUR`
- Gist: „ALG für Zeitraum X bewilligt/abgelehnt, Sperrzeit von …, Rückforderung …“
- Bullets:
  - Bewilligte Beträge & Zeiträume
  - Sperrzeit mit Grund
  - Rückforderungen + Zahlungsweg
  - fehlende Unterlagen
  - Termine
- Tasks:
  - „Bescheid prüfen, ggf. Widerspruch bis … möglich“
  - „Unterlagen bis … nachreichen“
  - „Zu Termin am … erscheinen“

### 1.2 Familienkasse / Elterngeld / Wohngeld / Kindergeld etc.

**Examples**

- Bescheid Kindergeld / Kinderzuschlag
- Wohngeld-Bescheid
- Elterngeld-Bescheid
- Unterhaltsvorschuss

**Extract**

- Leistungstyp
- Kind(er) & Zeiträume
- Beträge
- Beginn/Ende der Leistung
- Widerspruchsfrist
- Nachweise / Änderungsmitteilungspflichten (z.B. bei Einkommen / Umzug)

**Surface**

- Badge: `Widerspruchsfrist bis …`
- Gist: „Elterngeld für Zeitraum X in Höhe von … EUR bewilligt/abgelehnt.“
- Tasks:
  - „Änderungen (Einkommen/Betreuung/Umzug) melden, falls zutreffend.“
  - „Bescheid prüfen, ggf. Widerspruch bis …“

---

## 2. Tax & Finanzamt

**Examples**

- Einkommensteuerbescheid
- Vorauszahlungsbescheid
- Umsatzsteuer / Gewerbesteuer / Grundsteuer
- Mahnungen, Säumniszuschläge
- Erinnerung an Abgabe

**Extract**

- Steuerart und Veranlagungsjahr
- Festgesetzte Steuer, Vorauszahlungen, Erstattungen
- Fälligkeitstermine (Zahlung / Nachzahlung)
- Widerspruchsfrist (Einspruch)
- Bankverbindung / SEPA

**Surface**

- Badge: `Zahlungsfrist bis …` / `Erstattung … EUR`
- Gist: „ESt-Bescheid 2024: Nachzahlung/Erstattung … EUR, Einspruch bis … möglich.“
- Bullets:
  - Nachzahlung + Fälligkeit
  - Raten-/Stundungs-Hinweise
- Tasks:
  - „Steuerbescheid prüfen, ggf. Einspruch bis …“
  - „Betrag … bis … zahlen.“

---

## 3. Health & Care (Krankenkasse, Pflege, Krankengeld)

**Examples**

- Kassenwechsel / Beitragsanpassung
- Kostenübernahme / Ablehnung (Behandlung, Hilfsmittel)
- Krankengeld-Bescheide
- Pflegegrad-Bescheid
- Zuzahlungsbefreiung

**Extract**

- Versicherungsnummer / Versichertennummer
- Entscheidung: bewilligt / abgelehnt / teilweise
- Leistung: Art & Umfang
- Beträge, Eigenanteile
- Gültigkeits-/Bewilligungszeiträume
- Widerspruchsfrist
- benötigte weitere Unterlagen

**Surface**

- Badge: `Kostenübernahme bewilligt` / `abgelehnt` / `Eigenanteil … EUR`
- Gist: „Krankenkasse übernimmt / lehnt Leistung X ab; ggf. Zuzahlung … EUR.“
- Tasks:
  - „Rechnung einreichen / Originale aufbewahren“
  - „Ggf. Widerspruch bis …“

---

## 4. Employment, HR & Contracts

### 4.1 Jobangebote & Arbeitsverträge

**Extract**

- Arbeitgeber, Jobtitel
- Beginn, Arbeitszeitmodell, Probezeit
- Vergütung (Brutto, Bonus, variable Teile)
- Befristung / unbefristet
- Kündigungsfristen
- besondere Klauseln (Wettbewerbsverbot, IP, Nebenjobs)

**Surface**

- Badge: `Angebot` / `Arbeitsvertrag`
- Gist: „Angebot als X ab …, Gehalt … EUR, befristet/unbefristet.“
- Tasks:
  - „Vertrag prüfen/unterschreiben bis …“
  - „Fragen klären (Probezeit, Urlaub, …).“

### 4.2 Kündigung / Aufhebungsvertrag / Abmahnung

**Extract**

- Art: betriebsbedingte/personenbedingte Kündigung, Aufhebungsvertrag, Abmahnung
- Datum des Zugangs
- Beendigungsdatum
- Fristen (Klagefrist §4 KSchG, Widerspruch o.Ä.)
- Abfindung / Resturlaub / Freistellung
- Rückgabe von Firmeneigentum
- Klageverzicht / Ausgleichsklausel / Geheimhaltung

**Surface**

- Badges:
  - `Beendigung zum …`
  - ggf. `Abfindung … EUR`
  - `Klagefrist (Kündigungsschutz) bis …` (faktisch 3 Wochen, aber wir schreiben nur „Frist …“ falls klar genannt)
- Gist: „Arbeitsverhältnis endet zum …; Abfindung … EUR; Rückgabe von Arbeitsmitteln.“
- Bullets:
  - Abfindung & Anspruchsdauer
  - Rückgabe von Eigentum
  - Klageverzicht/Ausgleichsklausel
- Tasks:
  - „Firmeneigentum bis … zurückgeben.“
  - „Bescheid/Vertrag mit Beratung besprechen, falls unklar.“

### 4.3 Gehaltsabrechnungen & HR-Schreiben

**Extract**

- Zeitraum, Brutto/Netto, Steuerklasse
- Zuschläge, Boni, Sonderzahlungen
- Rückstände / Korrekturen
- relevante Änderungen (Steuerklasse, SV, Kinderfreibeträge)

**Surface**

- Gist: „Lohnabrechnung für Monat X, Netto … EUR.“
- Badges: `Steuerrelevant`
- Tasks: keine, außer bei offensichtlichen Fehlern („Abweichung zu Vertrag“ → optionaler Hinweis).

---

## 5. Housing, Utilities & Energy

### 5.1 Mietvertrag / Mieterhöhung / Kündigung

**Extract**

- Adresse, Vermieter
- Mietbeginn / -ende
- Kaltmiete, Nebenkosten, Gesamtmiete
- Kaution
- Erhöhungsbetrag/-prozent & Wirksamkeitsdatum
- Kündigungsfrist
- Übergabe- / Rückgabetermine

**Surface**

- Badges: `Neue Miete ab …`, `Kündigung zum …`
- Gist: „Miete erhöht sich ab … auf … EUR.“ / „Wohnungsvertrag endet am …“
- Tasks:
  - „Wohnungsübergabe organisieren“
  - „Mieterhöhung prüfen, ggf. Beratung.“

### 5.2 Nebenkosten- & Heizkostenabrechnungen

**Extract**

- Abrechnungszeitraum
- Vorauszahlungen vs. tatsächliche Kosten
- Nachzahlung / Guthaben + Fälligkeit
- Frist für Einwendungen

**Surface**

- Badge: `Nachzahlung … EUR bis …` / `Guthaben … EUR`
- Tasks:
  - „Abrechnung prüfen, ggf. Einwendungen bis …“
  - „Nachzahlung bis … überweisen.“

### 5.3 Strom / Gas / Wasser / Internet / Handy

**Extract**

- Vertragspartner, Kundennummer
- Tarifänderungen, Preiserhöhungen
- Mindestvertragslaufzeit / Kündigungsfristen
- Mahnungen / Sperrandrohungen
- Rückstände / Raten

**Surface**

- Badges: `Preisänderung ab …`, `Mahnung: … EUR bis …`
- Tasks:
  - „Rechnung bis … bezahlen“
  - „Kündigungsfrist beachten (vertragliche Bindung bis …).“

---

## 6. Banking, Loans & Debt Collection

**Examples**

- Kontoeröffnung / AGB-/Preisänderung
- Kredit- und Kreditkartenverträge
- Mahnungen, Inkasso, Pfändungsandrohung
- SCHUFA-Auskunft / Eintragungen

**Extract**

- Konto-/Kartennummer (maskiert)
- Kreditbetrag, Zinssatz, Laufzeit, Rate
- Fälligkeiten / Rückstände
- Inkasso-Forderung, Gläubiger, Aktenzeichen
- Fristen für Zahlung / Ratenvereinbarung

**Surface**

- Badges:
  - `Mahnung: … EUR bis …`
  - `Ratenkredit: Rate … EUR/Monat`
- Tasks:
  - „Forderung prüfen und bis … zahlen oder Raten/Einwand klären.“
  - „Kündigung des Kontos/der Karte ab … beachten.“

---

## 7. Insurance (Non-health)

**Examples**

- Haftpflicht, Hausrat, Kfz, Reise, Berufsunfähigkeit
- Policen, Beitragsanpassungen, Kündigungen
- Schadenregulierung (Zusage/Ablehnung)

**Extract**

- Versicherungstyp, Vertragsnummer
- Beginn/Ende der Deckung
- Prämienänderungen
- Regulierungsergebnis (Zahlung, Ablehnung, Selbstbeteiligung)
- Widerspruchs-/Kündigungsfristen

**Surface**

- Badge: `Schaden reguliert: … EUR` / `Beitrag steigt ab …`
- Tasks:
  - „Kündigungsfrist bis … nutzen, falls Wechsel gewünscht.“
- „Unterlagen/Fotos nachreichen bis …“

---

## 8. Education & Childcare

**Examples**

- Schul-/Studienzulassung, Exmatrikulation
- BAföG-Bescheid
- Kita-Verträge, Gebührenbescheide
- Prüfungsanmeldungen / -ergebnisse

**Extract**

- Institution, Kind/Student
- Zeitraum (Semester, Schuljahr, Kitajahr)
- Gebühren / Zahlungen / Förderungen
- Fristen (An-/Abmeldung, Widerspruch, Prüfungsfristen)
- benötigte Nachweise

**Surface**

- Badges: `Zahlung bis …`, `Annahmefrist bis …`
- Tasks:
  - „Studienplatz/Kitaplatz bis … bestätigen.“
  - „Unterlagen (Immatrikulation, Impfungen) nachreichen.“

---

## 9. Immigration & Residency

**Examples**

- Aufenthaltstitel / Visa / Fiktionsbescheinigung
- Einladungen / Termine Ausländerbehörde
- Aufforderung zu Nachweisen (Mietvertrag, Einkommen, Sprachzertifikat)

**Extract**

- Aktenzeichen
- Aktueller Status (verlängert, genehmigt, abgelehnt)
- Gültigkeitszeitraum / Ablaufdatum
- Termine (Datum/Uhrzeit/Ort)
- Liste benötigter Unterlagen
- Gebühren

**Surface**

- Badges:
  - `Aufenthaltstitel gültig bis …`
  - `Termin am … um …`
- Tasks:
  - „Zu Termin erscheinen und Unterlagen X/Y/Z mitbringen.“
  - „Neuen Antrag rechtzeitig vor Ablauf vorbereiten.“

---

## 10. Travel, Tickets & Fines

**Examples**

- Flug/ Bahn-Buchungsbestätigungen, Umbuchungen
- ÖPNV-Bußgelder, Park-/Geschwindigkeitsverstöße
- Maut-/Zollschreiben

**Extract**

- Reisezeiten, Buchungsnummern, Umbuchungsbedingungen
- Höhe der Strafe, Rabatt bei schneller Zahlung
- Zahlungs- und Einspruchsfristen

**Surface**

- Badges:
  - `Bußgeld: … EUR bis … (Rabatt bis …)`
- Tasks:
  - „Bußgeld bis … bezahlen oder Einspruch bis … prüfen.“
  - „Gutschein/Bahn-Gutschein bis … einlösen.“

---

## 11. Purchases, Deliveries, Warranties & Subscriptions

**Examples**

- Online-Rechnungen, Lieferscheine
- Retouren/RMA, Widerrufsbestätigungen
- Garantieabwicklung
- Mitgliedschaften (Fitnessstudio, Vereine, Streaming) – Vertragsbestätigung, Preiserhöhung, Kündigung

**Extract**

- Händler, Bestell-/Rechnungsnummer
- Artikel, Beträge
- Widerrufs-/Rückgabefristen
- Garantie-/Gewährleistungszeiträume
- Kündigungsfristen, Laufzeiten

**Surface**

- Badges:
  - `Widerrufsfrist bis …`
  - `Kündigungsfrist ab … möglich`
- Tasks:
  - „Paket bis … zurücksenden.“
  - „Abo bis … kündigen, falls nicht verlängern gewünscht.“

---

## 12. Legal, Courts & Enforcement

**Examples**

- Mahnbescheid, Vollstreckungsbescheid
- Ladung zur Gerichtsverhandlung
- Vergleichsvorschläge, Beschlüsse
- Pfändungs- / Räumungsandrohung

**Extract**

- Gericht / Behörde, Aktenzeichen
- Forderungshöhe
- Fristen (Widerspruch, Einspruch, Zahlung, Räumungstermin)
- Termine (Verhandlung, Anhörung)

**Surface**

- Badges:
  - `Frist zur Reaktion bis …`
  - `Gerichtstermin am …`
- Tasks:
  - „Unbedingt rechtliche Beratung einholen.“
  - „Fristgerechte Reaktion (Zahlung/Widerspruch) organisieren.“

---

## 13. Healthcare Appointments & Prescriptions

**Examples**

- Arzt-/Therapie-/OP-Termine
- Überweisungen
- eRezept-Screenshots

**Extract**

- Datum/Uhrzeit/Ort
- Vorbereitungen (nüchtern, Medikamente absetzen, Unterlagen mitbringen)
- Rezeptdetails & Ablaufdatum

**Surface**

- Badges:
  - `Termin am …`
  - `Rezept gültig bis …`
- Tasks:
  - „Termin wahrnehmen, Unterlagen X/Y mitbringen.“
  - „Medikament vor Ablauf einlösen.“

---

## 14. Identity & Proof Documents

**Examples**

- Personalausweis, Pass, Aufenthaltstitel (Scans)
- Führerschein
- Gehaltsnachweise, Mietverträge als Nachweis
- Immatrikulationsbescheinigungen

**Extract**

- Dokumentart
- Ausstellungs- & Ablaufdatum
- Ausstellende Stelle

**Surface**

- Badge: `Dokument gültig bis …`
- Tasks:
  - „Neuen Ausweis/Pass rechtzeitig vor Ablauf beantragen.“

*(Intern: sehr vorsichtig mit Anzeige/ Speicherung sensibler Nummern.)*

---

## 15. Random Screenshots & Text Snippets (Chat, Mail, Web)

**Examples**

- WhatsApp mit „Ich überweise dir … bis Freitag.“
- Screenshot von Online-Formular mit Bestätigung
- E-Mail mit „Vielen Dank für Ihre Bewerbung, Frist …“

**Extract**

- Eventuelle Zusagen/Deadlines/Termine
- Beträge
- Links zu „richtigen“ Schreiben (z. B. „Sie erhalten noch ein offizielles Schreiben“)

**Surface**

- Gist: „Lockere Bestätigung/Zusage ohne offizielles Schreiben.“
- Tasks nur, wenn explizite Frist/Verpflichtung genannt wird:
  - „Unterlagen bis … schicken“
  - „Bis … zusagen/absagen.“

---

## 16. Cross-cutting “Danger Words” to Flag

Whenever these appear, we consider special badges / warnings:

- **Fristen:** Frist, Widerspruch, Einspruch, Klagefrist, Zahlungsfrist, Räumungstermin
- **Negatives Geld:** Rückforderung, Erstattung zurückzahlen, Nachzahlung, Mahnung, Säumniszuschlag, Inkasso, Vollstreckung, Pfändung
- **Leistungsentzug:** Sperrzeit, Ruhen, Kürzung, Minderung, Einstellen der Leistungen
- **Beendigung:** Kündigung, Aufhebung, Widerruf, Vertragsende, Rücktritt
- **Rechtliche Schritte:** Mahnbescheid, Vollstreckungsbescheid, Ladung, Klage, Abmahnung

These can drive:

- danger badges (`Sperrzeit`, `Rückforderung`, `Mahnung`)
- and “high-priority” tasks.

---

## 17. Filing Categories (for the dropdown / Files view)

Keep this list short & human. Each category can still have sub-tags internally.

1. **Arbeitsagentur / Jobcenter / Sozialleistungen**
2. **Steuern & Finanzamt**
3. **Gesundheit & Pflege**  
   (Krankenkasse, Krankengeld, Pflege, Ärzte)
4. **Arbeit & Verträge**  
   (Arbeitsverträge, Kündigungen, Abmahnungen, Gehaltsabrechnungen)
5. **Miete & Wohnen**  
   (Mietvertrag, Nebenkosten, Hausverwaltung)
6. **Energie, Telefon & Internet**
7. **Banken, Kredite & Inkasso**
8. **Versicherungen (nicht Gesundheit)**
9. **Bildung & Kinderbetreuung**  
   (Schule, Uni, Kita, BAföG)
10. **Aufenthalt & Behörden**  
    (Ausländerbehörde, Bürgeramt, Pass/ID)
11. **Auto & Verkehr**  
    (Kfz-Versicherung, Zulassung, Bußgelder, ÖPNV-Strafen)
12. **Einkäufe, Rechnungen & Garantien**
13. **Gerichte & Rechtsstreit**
14. **Mitgliedschaften & Abos**  
    (Fitness, Vereine, Streaming)
15. **Sonstiges**

For each document we store both:

- `category` (one of the above), and
- optional `tags` (e.g. `ALG`, `Kündigung`, `Nebenkosten`, `Bußgeld`) for future search/filters.

---

## 18. Task Creation – Global Heuristics

Create a task when:

- There is a **date + verb**:
  - zahlen, überweisen, einreichen, erscheinen, antworten, unterschreiben, kündigen.
- There is a **Frist** and a potential user decision:
  - Widerspruch, Einspruch, Einsichtnahme, Terminbestätigung.
- There is a **consequence** mentioned:
  - sonst Sperrzeit, sonst Mahnverfahren, sonst Räumung, sonst Leistungsentzug.

Otherwise:

- mark the doc as `No action required` but still show key info in bullets (z. B. Preiserhöhung, Informationsschreiben).

---
