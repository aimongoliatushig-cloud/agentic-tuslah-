import crypto from "node:crypto";

const DEFAULT_PREFIX = "agf_live";

export function generateApiKey(prefix = DEFAULT_PREFIX) {
  return `${prefix}_${crypto.randomBytes(24).toString("hex")}`;
}

export function hashApiKey(apiKey: string) {
  return crypto.createHash("sha256").update(apiKey, "utf8").digest("hex");
}

export function verifyApiKey(apiKey: string, storedHash: string) {
  const candidateHash = hashApiKey(apiKey);
  const candidate = Buffer.from(candidateHash, "hex");
  const stored = Buffer.from(storedHash, "hex");

  if (candidate.length !== stored.length) {
    return false;
  }

  return crypto.timingSafeEqual(candidate, stored);
}

export function createApiKeyPreview(apiKey: string) {
  const start = apiKey.slice(0, 13);
  const end = apiKey.slice(-4);
  return `${start}...${end}`;
}
