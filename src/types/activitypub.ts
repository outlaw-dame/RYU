import { z } from "zod";

export const apBaseSchema = z.object({
  "@context": z.unknown().optional(),
  id: z.string().url(),
  type: z.string()
});

export const apReviewSchema = apBaseSchema.extend({
  type: z.literal("Review"),
  name: z.string().optional(),
  content: z.string(),
  inReplyToBook: z.string().url(),
  attributedTo: z.string().url(),
  rating: z.number().min(0).max(5).optional(),
  published: z.string(),
  to: z.array(z.string()).default([]),
  cc: z.array(z.string()).default([]),
  sensitive: z.boolean().optional(),
  summary: z.string().optional()
});

export const apEditionSchema = apBaseSchema.extend({
  type: z.literal("Edition"),
  title: z.string(),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  authors: z.array(z.string()).default([]),
  work: z.string().optional(),
  cover: z.object({ type: z.string().optional(), url: z.string(), mediaType: z.string().optional() }).optional()
});

export type APReview = z.infer<typeof apReviewSchema>;
export type APEdition = z.infer<typeof apEditionSchema>;
