# Files page chat agent – manual test fixtures

Create these sample documents (simple PDFs or text uploads) to exercise the Files assistant, cross-doc queries, aggregation, bundles, and category moves.

## Fixture docs

1) Mobile bill (2024-01-mobile-bill.pdf)
```
Sender: Telekom
Invoice date: 2024-01-10
Amount due: 45.90 EUR
Due date: 2024-02-05
Notes: monthly mobile plan for personal use.
```

2) Health claim – knee injury (2024-03-health-knee-claim.pdf)
```
Sender: Techniker Krankenkasse
Topic: knee injury physiotherapy reimbursement
Decision: approved, reimbursement 210 EUR
Action: none required
```

3) Rent increase (2024-04-rent-increase.pdf)
```
Sender: Vermieter Müller
Topic: Mieterhöhung / Nebenkosten
Effective: 2024-06-01
Action: review and respond if disagree
```

4) Tax notice (2024-06-tax-notice.pdf)
```
Sender: Finanzamt Berlin
Amount due: 423.70 EUR
Due date: 2024-07-15
Notes: Einkommensteuer 2023
```

5) Business contract (2024-08-contract-business.pdf)
```
Sender: ACME Services GmbH
Type: service contract, B2B
Action: none
```

6) Health appeal request (2024-10-health-appeal.pdf)
```
Sender: Techniker Krankenkasse
Topic: appeal response, knee injury
Action: submit missing documents by 2024-11-05
```

## Manual scenarios

- Aggregation: “How much did I spend on mobile phone bills in 2024?” → expect clarifier if business/private unclear, then aggregation with doc ids (mobile bill).
- Semantic case: “Show letters about my knee injury” → returns health docs with provenance.
- Tasks: “What are my most urgent tasks next 30 days?” → returns tax notice + appeal tasks with due dates and doc links.
- Bundle: “Prepare a ZIP of all landlord letters” → confirm set before bundle response (note bundle_url is a stub).
- Reorg: “Move my mobile bills to Finanzen > Telefon/Internet and create missing folders” → tool runs and reports moved docs.
- Ambiguity: “Which expenses could be relevant for taxes?” → assistant asks for year + business/private, then lists doc ids with reasoning.
