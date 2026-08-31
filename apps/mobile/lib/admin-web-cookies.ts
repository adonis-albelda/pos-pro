/**
 * Session cookies for the admin WebView. Mirrors apps/admin/lib/api/browser-client.ts
 * startBrowserSession() — token stays in native memory, never in the URL.
 */

function buildSetSessionCookiesScript(token: string, expiresAt: string | null): string {
  const ONE_YEAR = 60 * 60 * 24 * 365;
  const maxAge = expiresAt
    ? Math.max(1, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
    : ONE_YEAR;
  const tokenLiteral = JSON.stringify(token);
  const expiresLiteral = expiresAt ? JSON.stringify(expiresAt) : "null";

  return `
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
  `;
}

/** Keeps document.cookie in sync after in-app navigations. */
export function buildAdminEmbedCookieScript(token: string, expiresAt: string | null): string {
  return `(function () {${buildSetSessionCookiesScript(token, expiresAt)}})(); true;`;
}

/**
 * Android WebView ignores Cookie headers on source.uri — bootstrap on the admin
 * origin sets the jar, then redirects into the dashboard with cookies attached.
 */
export function buildAdminBootstrapHtml(
  token: string,
  expiresAt: string | null,
  redirectUrl: string,
): string {
  const redirectLiteral = JSON.stringify(redirectUrl);
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Opening admin…</title>
  </head>
  <body>
    <script>
      ${buildSetSessionCookiesScript(token, expiresAt)}
      window.location.replace(${redirectLiteral});
    </script>
  </body>
</html>`;
}
