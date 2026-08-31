/**
 * Builds injectedJavaScriptBeforeContentLoaded for the admin WebView.
 * Mirrors apps/admin/lib/api/browser-client.ts startBrowserSession() —
 * token stays in native memory, never appears in the URL.
 */
export function buildAdminSessionCookieHeader(token: string, expiresAt: string | null): string {
  const parts = [
    `tally_session=${encodeURIComponent(token)}`,
    `tally_base_session=${encodeURIComponent(token)}`,
    "admin_ui_mode=classic",
    "admin_embedded=1",
  ];
  if (expiresAt) {
    parts.push(`tally_session_expires_at=${encodeURIComponent(expiresAt)}`);
  }
  return parts.join("; ");
}

export function buildAdminEmbedCookieScript(token: string, expiresAt: string | null): string {
  const ONE_YEAR = 60 * 60 * 24 * 365;
  const maxAge = expiresAt
    ? Math.max(1, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
    : ONE_YEAR;
  const tokenLiteral = JSON.stringify(token);
  const expiresLiteral = expiresAt ? JSON.stringify(expiresAt) : "null";

  return `
(function () {
  var token = ${tokenLiteral};
  var expiresAt = ${expiresLiteral};
  var secure = location.protocol === "https:" ? "; Secure" : "";
  var sessionMaxAge = ${maxAge};
  var yearMaxAge = ${ONE_YEAR};
  function setCookie(name, value, age) {
    document.cookie =
      name +
      "=" +
      encodeURIComponent(value) +
      "; Path=/; Max-Age=" +
      age +
      "; SameSite=Lax" +
      secure;
  }
  setCookie("tally_session", token, sessionMaxAge);
  setCookie("tally_base_session", token, sessionMaxAge);
  document.cookie = "tally_acting_company=; Path=/; Max-Age=0; SameSite=Lax" + secure;
  if (expiresAt) {
    setCookie("tally_session_expires_at", expiresAt, sessionMaxAge);
  } else {
    document.cookie = "tally_session_expires_at=; Path=/; Max-Age=0; SameSite=Lax" + secure;
  }
  setCookie("admin_ui_mode", "classic", yearMaxAge);
  setCookie("admin_embedded", "1", yearMaxAge);
})();
true;
`;
}
