import { promises as fs } from "node:fs";
import path from "node:path";

type TelemetryEvent = {
  timestamp: string;
  kind: "process-document";
  status: "success" | "error" | "skipped";
  documentId?: string | null;
  userId?: string | null;
  model?: string;
  usedOcrFallback?: boolean;
  message?: string;
  skipReason?: string;
  timings_ms?: Record<string, number>;
  page_count?: number;
  rendered_pages?: number;
  skipped_text_pages?: number;
};

const LOG_ROOT = path.join(process.cwd(), "logs");

export async function logTelemetryEvent(event: TelemetryEvent): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const dir = path.join(LOG_ROOT, day);
  const file = path.join(dir, "factory.ndjson");
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(file, JSON.stringify(event) + "\n", "utf8");
  } catch (err) {
    // Do not crash if logging fails; best effort only.
    console.warn("telemetry log failed", err);
  }
}
