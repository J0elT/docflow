import { z } from "zod";

export const extractionSchema = z
  .object({
    summary: z.string().nullable().optional(),
    main_summary: z.string().nullable().optional(),
    badge_text: z.string().nullable().optional(),
    extra_details: z.array(z.string()).optional(),
    document_kind: z
      .enum(["letter", "invoice", "contract", "notice", "info", "other"])
      .nullable()
      .optional(),
    key_fields: z
      .object({
        language: z.string().nullable().optional(),
        sender: z.string().nullable().optional(),
        topic: z.string().nullable().optional(),
        letter_date: z.string().nullable().optional(),
        due_date: z.string().nullable().optional(),
        amount_total: z.number().nullable().optional(),
        currency: z.string().nullable().optional(),
        action_required: z.boolean().optional(),
        action_description: z.string().nullable().optional(),
        follow_up: z.string().nullable().optional(),
        reference_ids: z
          .object({
            steuernummer: z.union([z.string(), z.null()]).optional(),
            kundennummer: z.union([z.string(), z.null()]).optional(),
            vertragsnummer: z.union([z.string(), z.null()]).optional(),
          })
          .partial()
          .optional(),
      })
      .partial()
      .optional(),
    category_suggestion: z
      .object({
        slug: z.string().nullable().optional(),
        path: z.array(z.string()).optional(),
        confidence: z.number().optional(),
      })
      .partial()
      .optional(),
    task_suggestion: z
      .object({
        should_create_task: z.boolean().optional(),
        title: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        due_date: z.string().nullable().optional(),
        urgency: z.enum(["low", "normal", "high"]).optional(),
      })
      .partial()
      .optional(),
  })
  .passthrough();

export type ExtractionPayload = z.infer<typeof extractionSchema>;

export function validateExtraction(raw: unknown, source: string): ExtractionPayload {
  const result = extractionSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Extraction validation failed (${source}): ${issues}`);
  }
  return result.data;
}
