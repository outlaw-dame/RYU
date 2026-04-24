const privateIpv4Ranges = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./
];

export function normalizeRemoteHttpUrl(input: string): URL {
  const url = new URL(input.trim());
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only http and https URLs are supported");
  }

  assertPublicHostname(url.hostname);
  url.hash = "";
  return url;
}

export function assertPublicHostname(hostname: string): void {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) throw new Error("URL is missing a host");

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "::1" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80:")
  ) {
    throw new Error("Private or local network hosts are not allowed");
  }

  if (privateIpv4Ranges.some((range) => range.test(host))) {
    throw new Error("Private or local network hosts are not allowed");
  }
}
