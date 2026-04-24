import { z } from "zod";

export const apBaseSchema = z.object({
  "@context": z.unknown().optional(),
  id: z.string().url(),
  type: z.string()
});

const apReferenceObjectSchema = z.object({
  id: z.string().url(),
  type: z.string().optional(),
  name: z.string().optional(),
  title: z.string().optional(),
  preferredUsername: z.string().optional(),
  url: z.string().url().optional()
});

export const apReferenceSchema = z.union([z.string().url(), apReferenceObjectSchema]);

export const apAuthorSchema = apBaseSchema.extend({
  type: z.union([z.literal("Author"), z.literal("Person")]),
  name: z.string().optional(),
  preferredUsername: z.string().optional(),
  summary: z.string().optional(),
  url: z.string().url().optional()
}).superRefine((value, ctx) => {
  if (!value.name && !value.preferredUsername) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Author payload is missing a display name"
    });
  }
});

export const apWorkSchema = apBaseSchema.extend({
  type: z.union([z.literal("Work"), z.literal("Book")]),
  title: z.string().optional(),
  name: z.string().optional(),
  summary: z.string().optional(),
  authors: z.array(apReferenceSchema).default([]),
  url: z.string().url().optional()
}).superRefine((value, ctx) => {
  if (!value.title && !value.name) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Work payload is missing a title"
    });
  }
});

const apCoverSchema = z.union([
  z.string().url(),
  z.object({
    type: z.string().optional(),
    url: z.string().url(),
    mediaType: z.string().optional()
  })
]);

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
  title: z.string().optional(),
  name: z.string().optional(),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  authors: z.array(apReferenceSchema).default([]),
  work: apReferenceSchema.optional(),
  cover: apCoverSchema.optional(),
  isbn10: z.string().optional(),
  isbn13: z.string().optional(),
  url: z.string().url().optional()
}).superRefine((value, ctx) => {
  if (!value.title && !value.name) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Edition payload is missing a title"
    });
  }
});

export type APReview = z.infer<typeof apReviewSchema>;
export type APReference = z.infer<typeof apReferenceSchema>;
export type APAuthor = z.infer<typeof apAuthorSchema>;
export type APWork = z.infer<typeof apWorkSchema>;
export type APEdition = z.infer<typeof apEditionSchema>;

export function extractReferenceId(reference: APReference): string {
  return typeof reference === "string" ? reference : reference.id;
}

export function extractReferenceName(reference: APReference): string | undefined {
  if (typeof reference === "string") return undefined;
  return reference.name ?? reference.title ?? reference.preferredUsername;
}

export function extractCoverUrl(cover: APEdition["cover"]): string | undefined {
  if (!cover) return undefined;
  return typeof cover === "string" ? cover : cover.url;
}
