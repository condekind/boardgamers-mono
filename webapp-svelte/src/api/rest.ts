import { omit } from "lodash";
import { get as $ } from "svelte/store";
import type { Token } from "../store";
import { accessTokens, refreshToken } from "../store";

const baseUrl = "/api";

function transformUrl(url: string) {
  return url.startsWith("http") || url.startsWith("//") ? url : baseUrl + url;
}

export async function get<T = any>(url: string, query?: Record<string, unknown>) {
  const token = await getAccessToken(url);
  return getResponseData<T>(
    await fetch(
      transformUrl(url) + (query ? "?" + new URLSearchParams(query as Record<string, string>).toString() : ""),
      {
        headers: { ...(token && { Authorization: `Bearer ${token.code}` }) },
      }
    )
  );
}

export async function post<T = any>(url: string, data: Record<string, unknown> = {}) {
  const token = await getAccessToken(url);

  return getResponseData<T>(
    await fetch(transformUrl(url), {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token.code}` }) },
    })
  );
}

async function getResponseData<T = any>(response: Response): Promise<T> {
  const body = response.headers.get("content-type")?.startsWith("application/json")
    ? await response.json()
    : await response.text();

  if (response.status >= 400) {
    throw body;
  }

  return body;
}

export function setAccessToken(token: Token | null, scopes: string[] = ["all"]) {
  if (token) {
    accessTokens.set({ ...$(accessTokens), [scopes.join(",")]: token });
  } else {
    accessTokens.set({ ...omit($(accessTokens), scopes.join(",")) });
  }
}

/**
 * Get accessToken, generating from refreshToken if needed, with the correct scopes
 * @param url Used to determine the scopes needed for the accessToken
 * @returns Access token or null if logged out
 */
export async function getAccessToken(url: string): Promise<Token | null> {
  if (!$(refreshToken)) {
    return null;
  }

  let scopes = ["all"];

  if (url.startsWith("/gameplay")) {
    scopes = ["gameplay"];
  } else if (url.startsWith("ws")) {
    scopes = ["site"];
  }

  const accessToken = $(accessTokens)[scopes.join(",")];

  if (accessToken?.expiresAt > Date.now() + 5 * 60 * 1000) {
    return accessToken;
  }

  const body = await getResponseData<Token>(
    await fetch(transformUrl("/account/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: $(refreshToken)!.code, scopes }),
    })
  );

  setAccessToken(body, scopes);

  return body;
}
