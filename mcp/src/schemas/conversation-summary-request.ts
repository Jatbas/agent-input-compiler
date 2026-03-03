import { z } from "zod";

export const ConversationSummaryRequestSchema = {
  conversationId: z.string().min(1),
} as const;
