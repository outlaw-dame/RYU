import { z } from "zod";

const originSchema = z.string().url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" || url.hostname === "localhost";
}, "Origin must use https (except localhost)");

const redirectUriSchema = z.string().url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" || url.hostname === "localhost";
}, "Redirect URI must use https (except localhost)");

const scopeSchema = z.string().min(1).max(128);

export const mastodonSessionAccountSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  acct: z.string().min(1),
  url: z.string().url().optional()
});

export const mastodonRegisterRequestSchema = z.object({
  instanceOrigin: originSchema,
  redirectUris: z.array(redirectUriSchema).min(1),
  scopes: z.array(scopeSchema).min(1),
  clientName: z.string().min(1).max(128).optional(),
  website: z.string().url().optional()
});

export const mastodonRegisterResponseSchema = z.object({
  clientId: z.string().min(1),
  instanceOrigin: originSchema,
  scopes: z.array(scopeSchema).min(1)
});

export const mastodonExchangeRequestSchema = z.object({
  instanceOrigin: originSchema,
  code: z.string().min(1),
  codeVerifier: z.string().min(43).max(128),
  redirectUri: redirectUriSchema
});

export const mastodonExchangeResponseSchema = z.object({
  connected: z.literal(true),
  instanceOrigin: originSchema,
  scope: z.string().min(1).optional(),
  tokenType: z.string().min(1).optional(),
  account: mastodonSessionAccountSchema.optional(),
  expiresAt: z.number().int().nonnegative().nullable().optional()
});

export const mastodonSessionResponseSchema = z.discriminatedUnion("connected", [
  z.object({ connected: z.literal(false) }),
  z.object({
    connected: z.literal(true),
    instanceOrigin: originSchema,
    account: mastodonSessionAccountSchema.nullable().optional(),
    scope: z.string().optional()
  })
]);

export const mastodonRevokeResponseSchema = z.object({
  revoked: z.literal(true)
});

export const mastodonErrorResponseSchema = z.object({
  error: z.string().min(1),
  message: z.string().min(1).optional(),
  code: z.string().min(1).optional()
});

export type MastodonSessionAccount = z.infer<typeof mastodonSessionAccountSchema>;
export type MastodonRegisterRequest = z.infer<typeof mastodonRegisterRequestSchema>;
export type MastodonRegisterResponse = z.infer<typeof mastodonRegisterResponseSchema>;
export type MastodonExchangeRequest = z.infer<typeof mastodonExchangeRequestSchema>;
export type MastodonExchangeResponse = z.infer<typeof mastodonExchangeResponseSchema>;
export type MastodonSessionResponse = z.infer<typeof mastodonSessionResponseSchema>;
export type MastodonRevokeResponse = z.infer<typeof mastodonRevokeResponseSchema>;
export type MastodonErrorResponse = z.infer<typeof mastodonErrorResponseSchema>;

export function parseMastodonRegisterRequest(input: unknown): MastodonRegisterRequest {
  return mastodonRegisterRequestSchema.parse(input);
}

export function parseMastodonRegisterResponse(input: unknown): MastodonRegisterResponse {
  return mastodonRegisterResponseSchema.parse(input);
}

export function parseMastodonExchangeRequest(input: unknown): MastodonExchangeRequest {
  return mastodonExchangeRequestSchema.parse(input);
}

export function parseMastodonExchangeResponse(input: unknown): MastodonExchangeResponse {
  return mastodonExchangeResponseSchema.parse(input);
}

export function parseMastodonSessionResponse(input: unknown): MastodonSessionResponse {
  return mastodonSessionResponseSchema.parse(input);
}

export function parseMastodonErrorResponse(input: unknown): MastodonErrorResponse {
  return mastodonErrorResponseSchema.parse(input);
}
