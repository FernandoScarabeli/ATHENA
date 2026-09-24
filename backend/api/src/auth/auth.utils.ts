import { createHash, randomBytes } from "crypto";

export const normalizeEmail = (value: string) => value.trim().toLowerCase();
export const tokenDigest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const createToken = () => randomBytes(32).toString("base64url");

/** Only routes owned by this SPA are valid return destinations. */
export function safeReturnTo(value?: string | null): string | undefined {
  if (!value || !value.startsWith("/") || value.startsWith("//"))
    return undefined;
  try {
    const parsed = new URL(value, "http://athena.local");
    return parsed.origin === "http://athena.local"
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : undefined;
  } catch {
    return undefined;
  }
}
