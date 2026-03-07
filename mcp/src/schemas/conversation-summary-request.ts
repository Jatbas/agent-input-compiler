import { z } from "zod";

const conversationSummaryRequestShape = {
  conversationId: z
    .string()
    .max(128)
    .regex(/^[\x20-\x7E]+$/)
    .optional(),
} as const;

export const ConversationSummaryRequestSchema: typeof conversationSummaryRequestShape =
  conversationSummaryRequestShape;
