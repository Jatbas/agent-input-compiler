import { z } from "zod";

const conversationSummaryRequestShape = {
  conversationId: z.string().min(1).optional(),
} as const;

export const ConversationSummaryRequestSchema: typeof conversationSummaryRequestShape =
  conversationSummaryRequestShape;
