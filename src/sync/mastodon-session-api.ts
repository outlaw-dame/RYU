import { z } from "zod";
import {
  mastodonNotificationSchema,
  mastodonStatusSchema,
  type MastodonNotification,
  type MastodonPage,
  type MastodonStatus
} from "./mastodon-client";

const paginationParamsSchema = z.object({
  limit: z.number().optional(),
  maxId: z.string().optional(),
  sinceId: z.string().optional(),
  minId: z.string().optional()
}).partial();

const paginationLinksSchema = z.object({
  next: paginationParamsSchema.optional(),
  prev: paginationParamsSchema.optional(),
  nextUrl: z.string().optional(),
  prevUrl: z.string().optional()
}).partial();

const errorResponseSchema = z.object({
  error: z.string().optional(),
  message: z.string().optional()
}).passthrough();

const statusPageSchema = z.object({
  items: z.array(mastodonStatusSchema),
  links: paginationLinksSchema.default({})
});

const notificationPageSchema = z.object({
  items: z.array(mastodonNotificationSchema),
  links: paginationLinksSchema.default({})
});

export class MastodonSessionApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export async function parseMastodonStatusPageResponse(response: Response): Promise<MastodonPage<MastodonStatus>> {
  await assertOkResponse(response);
  return statusPageSchema.parse(await response.json());
}

export async function parseMastodonNotificationPageResponse(response: Response): Promise<MastodonPage<MastodonNotification>> {
  await assertOkResponse(response);
  return notificationPageSchema.parse(await response.json());
}

async function assertOkResponse(response: Response): Promise<void> {
  if (response.ok) return;

  const parsed = errorResponseSchema.safeParse(await response.json().catch(() => ({})));
  const code = parsed.success && parsed.data.error ? parsed.data.error : "mastodon_session_error";
  const message = parsed.success && parsed.data.message ? parsed.data.message : `Mastodon request failed (${response.status})`;
  throw new MastodonSessionApiError(response.status, code, message);
}
