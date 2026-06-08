import crypto from "node:crypto";

const DEFAULT_PREFIX = "agf_live";
const KEY_ID_BYTES = 8;
const SECRET_BYTES = 32;

export function generateApiKey(prefix = DEFAULT_PREFIX) {
  const keyId = crypto.randomBytes(KEY_ID_BYTES).toString("hex");
  const secret = crypto.randomBytes(SECRET_BYTES).toString("hex");
  return `${prefix}_${keyId}_${secret}`;
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

export function parseApiKey(apiKey: string, prefix = DEFAULT_PREFIX) {
  const parts = apiKey.split("_");

  if (parts.length !== 4 || `${parts[0]}_${parts[1]}` !== prefix) {
    return null;
  }

  const keyId = parts[2];
  const secret = parts[3];

  if (!/^[a-f0-9]{16}$/i.test(keyId) || !/^[a-f0-9]{64}$/i.test(secret)) {
    return null;
  }

  return { keyId, secret };
}

export function createApiKeyPreview(apiKey: string) {
  const start = apiKey.slice(0, 13);
  const end = apiKey.slice(-4);
  return `${start}...${end}`;
}
