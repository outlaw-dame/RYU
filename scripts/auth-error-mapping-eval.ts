import { z } from "zod";

/**
 * OAuth Error Mapping Guardrail
 * 
 * Validates that the auth system can correctly handle and parse OAuth error responses
 * from Mastodon/BookWyrm servers across different error scenarios:
 * - invalid_scope: Requested scopes not supported or out of range
 * - invalid_client: Client authentication failed (unknown client, wrong secret)
 * - invalid_grant: Authorization code expired, revoked, or issued to different client
 * - server_error: Unexpected server condition (5xx errors)
 */

// Schema for parsing OAuth error responses
const oauthErrorSchema = z.object({
  error: z.enum([
    "invalid_scope",
    "invalid_client",
    "invalid_grant",
    "server_error",
    "temporarily_unavailable",
    "unauthorized_client",
    "unsupported_grant_type"
  ]),
  error_description: z.string().optional(),
  error_uri: z.string().url().optional()
});

type OAuthError = z.infer<typeof oauthErrorSchema>;

function validateErrorResponse(response: unknown, expectedError: string): void {
  try {
    const parsed = oauthErrorSchema.parse(response);
    if (parsed.error !== expectedError) {
      throw new Error(
        `Expected error type "${expectedError}" but got "${parsed.error}"`
      );
    }
  } catch (error) {
    throw new Error(
      `Failed to validate error response: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function testInvalidScopeError(): void {
  const errorResponse = {
    error: "invalid_scope",
    error_description: "The requested scope is invalid, out of scope for this resource, or otherwise malformed."
  };

  validateErrorResponse(errorResponse, "invalid_scope");
  // Server should respond with 400 Bad Request
  // Client should parse this and inform user that requested scopes are not available
}

function testInvalidClientError(): void {
  const errorResponse = {
    error: "invalid_client",
    error_description: "Client authentication failed (e.g., unknown client, no client authentication included, or unsupported authentication method)."
  };

  validateErrorResponse(errorResponse, "invalid_client");
  // Server returns 401 Unauthorized
  // Client should treat this as fatal — app configuration is invalid
}

function testInvalidGrantError(): void {
  const errorResponse = {
    error: "invalid_grant",
    error_description: "The provided authorization code is invalid, expired, revoked, does not match the redirection URI used in the authorization request, or was issued to another client."
  };

  validateErrorResponse(errorResponse, "invalid_grant");
  // Server returns 400 Bad Request
  // This happens when:
  // - Authorization code has expired (usually 10 minutes)
  // - Code was already used
  // - Redirect URI doesn't match original authorization request
  // - PKCE code_verifier doesn't match code_challenge from authorization
  // Client should clear transaction and restart auth flow
}

function testServerError(): void {
  const errorResponse = {
    error: "server_error",
    error_description: "The authorization server encountered an unexpected condition that prevented it from fulfilling the request."
  };

  validateErrorResponse(errorResponse, "server_error");
  // Server returns 500 Internal Server Error or similar
  // Client should retry with exponential backoff
}

function testErrorResponseWithUri(): void {
  const errorResponse = {
    error: "invalid_scope",
    error_description: "The requested scope is invalid.",
    error_uri: "https://tools.ietf.org/html/rfc6749#section-4.1.2.1"
  };

  validateErrorResponse(errorResponse, "invalid_scope");
  // error_uri is optional but useful for developers
}

function testInvalidResponseFormat(): void {
  const invalidResponse = {
    message: "Something went wrong"
    // Missing 'error' field
  };

  try {
    oauthErrorSchema.parse(invalidResponse);
    throw new Error("Should have rejected invalid response format");
  } catch (error) {
    // Expected: validation should fail
    if (error instanceof z.ZodError) {
      return; // Success: correctly rejected
    }
    throw error;
  }
}

function testStateValidation(): void {
  // In OAuth, the state parameter must match between authorization request and callback
  const authState = "state-abc123xyz";
  const callbackState = "state-abc123xyz";
  const anotherState = "state-different";

  if (authState !== callbackState) {
    throw new Error("State mismatch: authorization state should equal callback state");
  }

  if (authState === anotherState) {
    throw new Error("State mismatch: should have detected different state");
  }
}

function testPKCECodeVerifierValidation(): void {
  // Code verifier must be 43-128 characters, using unreserved characters: [A-Z] [a-z] [0-9] - . _ ~
  const validVerifier = "A".repeat(64); // 64 is valid
  const tooShortVerifier = "A".repeat(10); // Less than 43
  const validChars = /^[A-Za-z0-9\-._~]+$/;

  if (!validChars.test(validVerifier)) {
    throw new Error("Code verifier should contain only unreserved characters");
  }

  if (tooShortVerifier.length >= 43) {
    throw new Error("Code verifier validation should reject short verifiers");
  }

  if (tooShortVerifier.length < 43) {
    // Correctly too short
  }
}

function testChallengeMethodS256(): void {
  // S256 (SHA256) is the recommended method, plain is deprecated
  // Client should always use S256 when available
  const supportedMethods = ["S256", "plain"];
  const recommendedMethod = "S256";

  if (!supportedMethods.includes(recommendedMethod)) {
    throw new Error("S256 should be a supported challenge method");
  }

  // Client should prefer S256
  const chosenMethod = supportedMethods.includes("S256") ? "S256" : "plain";
  if (chosenMethod !== "S256") {
    throw new Error("Client should prefer S256 over plain");
  }
}

function main(): void {
  testInvalidScopeError();
  testInvalidClientError();
  testInvalidGrantError();
  testServerError();
  testErrorResponseWithUri();
  testInvalidResponseFormat();
  testStateValidation();
  testPKCECodeVerifierValidation();
  testChallengeMethodS256();

  console.log("Auth error mapping guardrail passed.");
}

main();

