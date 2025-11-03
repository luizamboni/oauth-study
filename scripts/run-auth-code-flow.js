#!/usr/bin/env node
/**
 * Programmatically executes the Authorization Code + PKCE flow against Keycloak
 * using demo credentials, then calls the protected API with the resulting token.
 */

const { randomBytes, createHash } = require('crypto');
const { URL, URLSearchParams } = require('url');

const {
  KEYCLOAK_URL = 'http://localhost:8080',
  REALM = 'oauth-study',
  CLIENT_ID = 'public-pkce-client',
  REDIRECT_URI = 'http://localhost:3000/callback',
  SCOPE = 'openid profile email',
  OIDC_USERNAME = 'demo',
  OIDC_PASSWORD = 'demo',
  PROTECTED_API_URL = 'http://localhost:4000/api/hello'
} = process.env;

const STATE = randomString(16);
const { codeVerifier, codeChallenge } = createPkcePair();

const cookieJar = new Map();

(async () => {
  try {
    console.log('Starting Authorization Code + PKCE flow...');
    const authUrl = buildAuthUrl();

    const authResponse = await fetchWithCookies(authUrl, { redirect: 'manual' });
    const html = await authResponse.text();
    const form = parseLoginForm(html, authUrl);

    if (!form) {
      throw new Error('Unable to locate login form in Keycloak response.');
    }

    form.params.set('username', OIDC_USERNAME);
    form.params.set('password', OIDC_PASSWORD);

    const loginResponse = await fetchWithCookies(form.action, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form.params.toString()
    });

    const authCode = await followRedirectsForCode(loginResponse);

    if (!authCode || authCode.state !== STATE) {
      throw new Error('Authorization code not received or state mismatch.');
    }

    console.log('Exchanging authorization code for tokens...');
    const tokenSet = await exchangeForTokens(authCode.code);
    console.log(JSON.stringify(tokenSet, null, 2));

    if (!tokenSet.access_token) {
      throw new Error('Access token missing from response.');
    }

    console.log(`\nCalling protected API: ${PROTECTED_API_URL}`);
    const apiResponse = await fetch(PROTECTED_API_URL, {
      headers: {
        Authorization: `Bearer ${tokenSet.access_token}`
      }
    });

    const apiJson = await safeJson(apiResponse);
    console.log(JSON.stringify(apiJson, null, 2));
  } catch (error) {
    console.error('Auth code flow failed:', error.message);
    process.exitCode = 1;
  }
})();

function buildAuthUrl() {
  const authEndpoint = new URL(`/realms/${REALM}/protocol/openid-connect/auth`, KEYCLOAK_URL);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state: STATE
  });
  authEndpoint.search = params.toString();
  return authEndpoint.toString();
}

function createPkcePair() {
  const verifier = randomString(64);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { codeVerifier: verifier, codeChallenge: challenge };
}

function randomString(length) {
  return randomBytes(length).toString('base64url');
}

async function fetchWithCookies(url, options = {}) {
  const target = new URL(url);
  const headers = Object.assign({}, options.headers);
  const cookieHeader = getCookieHeader(target);
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  storeCookies(target, response.headers.getSetCookie?.() ?? []);
  return response;
}

function storeCookies(url, setCookieHeaders) {
  if (!setCookieHeaders.length) return;
  const origin = `${url.protocol}//${url.host}`;
  const jarEntry = cookieJar.get(origin) || {};
  setCookieHeaders.forEach(cookieStr => {
    const [cookie] = cookieStr.split(';');
    const [name, value] = cookie.split('=');
    if (name && value !== undefined) {
      jarEntry[name.trim()] = value.trim();
    }
  });
  cookieJar.set(origin, jarEntry);
}

function getCookieHeader(url) {
  const origin = `${url.protocol}//${url.host}`;
  const jarEntry = cookieJar.get(origin);
  if (!jarEntry) return '';
  return Object.entries(jarEntry)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function parseLoginForm(html, baseUrl) {
  const formMatch = html.match(/<form[^>]*action="([^"]+)"[^>]*>/i);
  if (!formMatch) return null;
  const action = new URL(formMatch[1], baseUrl).toString();

  const inputs = [...html.matchAll(/<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"[^>]*>/gi)];
  const params = new URLSearchParams();
  inputs.forEach(([, name, value]) => {
    params.set(name, value);
  });
  return { action, params };
}

async function followRedirectsForCode(initialResponse) {
  let response = initialResponse;
  let location = response.headers.get('location');
  while (response.status >= 300 && response.status < 400 && location) {
    const resolved = resolveUrl(location, response.url);
    if (resolved.startsWith(REDIRECT_URI)) {
      const url = new URL(resolved);
      return { code: url.searchParams.get('code'), state: url.searchParams.get('state') };
    }
    response = await fetchWithCookies(resolved, { redirect: 'manual' });
    location = response.headers.get('location');
  }
  return null;
}

function resolveUrl(location, currentUrl) {
  try {
    return new URL(location, currentUrl).toString();
  } catch {
    return location;
  }
}

async function exchangeForTokens(code) {
  const tokenEndpoint = new URL(`/realms/${REALM}/protocol/openid-connect/token`, KEYCLOAK_URL);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: codeVerifier
  });
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token endpoint error (${response.status}): ${text}`);
  }
  return response.json();
}

async function safeJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    return { status: response.status, body: text, parseError: error.message };
  }
}
