# Backend Cost Control Suggestions (Vercel + Supabase + LLM)

These are pragmatic switches to keep bills sane as usage grows. Implement incrementally; start with the “must” items.

## Must-do (low effort, high impact)
- **Text-first extraction:** Use text layer for PDFs/DOC/TXT; invoke vision/OCR only when no text layer. Enforce max pages per vision call.
- **Client-side compression:** Keep current image downscaling/compression; cap upload size per file (e.g., 25MB) and per batch.
- **Cache extraction results:** Don’t re-run LLM unless the user explicitly reprocesses; reuse stored extraction JSON.
- **Cheap model routing:** Use mini/smaller model for text-only; reserve vision for scans. Add a per-user/per-day vision call cap.
- **Per-user quotas:** Set daily upload size/page limits and enforce max pages per doc for processing.
- **Short serverless work:** Push heavy processing off the request path (queue/job); keep API routes quick to avoid Vercel runtime burn.

## Should-do (medium effort)
- **Background jobs:** Use Supabase Edge Functions or a lightweight worker to process uploads asynchronously; UI polls status.
- **Lifecycle rules:** Add storage lifecycle for old/large originals (e.g., archive infrequently accessed files to cheaper tier if available).
- **Deduplication:** Hash uploads client-side; skip duplicates to save storage/processing.
- **Egress control:** Serve downloads/bundles via Supabase Storage signed URLs; avoid routing large files through Vercel.
- **Rate limits:** Per-user rate limits on upload/process/reprocess endpoints to avoid spikes and abuse.
- **Observability:** Track per-user LLM/vision usage, storage growth, and failures; set alerts on cost hotspots.

## Nice-to-have (optional)
- **Quality tiers:** Offer “fast/cheap” vs. “best/vision” modes; default to fast unless user opts in.
- **Batching small pages:** If scanning multi-page, batch smaller pages to reduce overhead; still cap total pages per doc.
- **Throttled reprocess:** Queue reprocess requests and dedupe multiple triggers for the same doc.
- **Download shaping:** Cap bundle size/count; require confirmation for large exports and stream from storage directly.

## Guardrails to implement in code
- File/page caps: hard limits on pages per doc for vision and total MB per day per user.
- Model routing: if `hasTextLayer`, use text model; else vision; reject overly large scans unless user confirms.
- Queued processing: on upload, enqueue job; return immediately; UI polls `/status`.
- Reuse extraction: skip if extraction exists and not stale; only re-run on explicit reprocess.
- Storage checks: before upload, check user quota; block/notify when exceeded.
