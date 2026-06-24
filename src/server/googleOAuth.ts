import { optionalEnv } from "@/server/env";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

export function getGoogleClientId() {
  return optionalEnv("GOOGLE_CLIENT_ID");
}

function getGoogleClientSecret() {
  return optionalEnv("GOOGLE_CLIENT_SECRET");
}

export function isGoogleOAuthConfigured() {
  return Boolean(getGoogleClientId() && getGoogleClientSecret());
}

export function getRedirectUri(origin: string) {
  return optionalEnv("GOOGLE_OAUTH_REDIRECT_URI") ?? `${origin}/api/account/auth/google/callback`;
}

export function buildGoogleAuthUrl(params: { origin: string; state: string }) {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", getGoogleClientId() ?? "");
  url.searchParams.set("redirect_uri", getRedirectUri(params.origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", params.state);
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("access_type", "online");
  return url.toString();
}

export async function exchangeGoogleCode(params: { code: string; origin: string }) {
  const body = new URLSearchParams({
    code: params.code,
    client_id: getGoogleClientId() ?? "",
    client_secret: getGoogleClientSecret() ?? "",
    redirect_uri: getRedirectUri(params.origin),
    grant_type: "authorization_code"
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json().catch(() => null)) as { access_token?: string } | null;
}

export async function fetchGoogleUserInfo(accessToken: string) {
  const response = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json().catch(() => null)) as {
    email?: string;
    email_verified?: boolean;
    name?: string;
  } | null;
}
