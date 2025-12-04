# Decision Log (append-only)

| Date | Decision | Rationale | Owner |
| --- | --- | --- | --- |
| 2025-12-04 | LLM: `gpt-4.1-mini` for text extracts; `gpt-4.1` vision fallback for image-only PDFs. Prompt lives in `src/app/api/process-document/route.ts`. | Keeps latency/cost lower on text; vision only when OCR via pdfjs fails. | JT |
| 2025-12-04 | OCR: text-first via `pdf-parse`; PDF images rendered with `pdfjs` + `canvas`, then OpenAI vision. No external OCR SaaS. | Avoids extra infra; vision only on scanned/image PDFs. | JT |
| 2025-12-04 | Storage/upload: bucket `documents`, non-public, path `${userId}/${uuid}-filename`, cache-control 3600, no size limit set. Insert row in `documents` table then trigger processing. | Simple per-user isolation; leverages Supabase storage + auth RLS on `documents`. | JT |
| 2025-12-04 | Language cache strategy: not implemented yet; plan to cache summaries per (doc, language) once multi-language UI wiring lands. | Avoid repeated LLM calls and ensure consistent outputs across sessions. | JT |
