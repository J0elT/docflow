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
        category_path: z.array(z.string()).nullable().optional(),
        reference_ids: z
          .object({
            steuernummer: z.union([z.string(), z.null()]).optional(),
            kundennummer: z.union([z.string(), z.null()]).optional(),
            vertragsnummer: z.union([z.string(), z.null()]).optional(),
          })
          .partial()
          .optional(),
        parties: z
          .array(
            z
              .object({
                role: z.string().nullable().optional(),
                name: z.string().nullable().optional(),
                type: z.string().nullable().optional(),
                label: z.string().nullable().optional(),
              })
              .partial()
          )
          .nullable()
          .optional(),
        sender_type_label: z.string().nullable().optional(),
        primary_topic_label: z.string().nullable().optional(),
        domain_profile_label: z.string().nullable().optional(),
        case_labels: z.array(z.string()).nullable().optional(),
        workflow_status: z.string().nullable().optional(),
        document_kind_fine: z.string().nullable().optional(),
        raw_text: z.string().nullable().optional(),
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
        urgency: z.enum(["low", "normal", "high"]).nullable().optional(),
      })
      .partial()
      .optional(),
    deadlines: z
      .array(
        z
          .object({
            id: z.string().nullable().optional(),
            date_exact: z.string().nullable().optional(),
            relative_text: z.string().nullable().optional(),
            kind: z.string().nullable().optional(),
            description: z.string().nullable().optional(),
            is_hard_deadline: z.boolean().nullable().optional(),
            source_snippet: z.string().nullable().optional(),
            confidence: z.number().nullable().optional(),
          })
          .partial()
      )
      .nullable()
      .optional(),
    amounts: z
      .array(
        z
          .object({
            value: z.number().nullable().optional(),
            currency: z.string().nullable().optional(),
            direction: z.string().nullable().optional(),
            frequency: z.string().nullable().optional(),
            description: z.string().nullable().optional(),
            source_snippet: z.string().nullable().optional(),
            confidence: z.number().nullable().optional(),
          })
          .partial()
      )
      .nullable()
      .optional(),
    actions_required: z
      .array(
        z
          .object({
            id: z.string().nullable().optional(),
            label: z.string().nullable().optional(),
            description: z.string().nullable().optional(),
            due_date: z.string().nullable().optional(),
            severity: z.string().nullable().optional(),
            is_blocking: z.boolean().nullable().optional(),
            source_snippet: z.string().nullable().optional(),
            confidence: z.number().nullable().optional(),
          })
          .partial()
      )
      .nullable()
      .optional(),
    rights_options: z
      .array(
        z
          .object({
            id: z.string().nullable().optional(),
            description: z.string().nullable().optional(),
            related_deadline_ids: z.array(z.string()).nullable().optional(),
            source_snippet: z.string().nullable().optional(),
            confidence: z.number().nullable().optional(),
          })
          .partial()
      )
      .nullable()
      .optional(),
    consequences_if_ignored: z
      .array(
        z
          .object({
            description: z.string().nullable().optional(),
            severity: z.string().nullable().optional(),
            source_snippet: z.string().nullable().optional(),
            confidence: z.number().nullable().optional(),
          })
          .partial()
      )
      .nullable()
      .optional(),
    risk_level: z.string().nullable().optional(),
    uncertainty_flags: z.array(z.string()).nullable().optional(),
    comments_for_user: z.string().nullable().optional(),
    field_confidence: z.record(z.number()).nullable().optional(),
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
