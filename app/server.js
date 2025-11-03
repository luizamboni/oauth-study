require('dotenv/config');
const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const { fetch } = require('undici');
const { Issuer, generators } = require('openid-client');

const app = express();

const {
  PORT = 3000,
  SESSION_SECRET = 'change-me',
  KEYCLOAK_URL = 'http://localhost:8080',
  REALM = 'oauth-study',
  CLIENT_ID = 'public-pkce-client',
  REDIRECT_URI = 'http://localhost:3000/callback',
  PROTECTED_API_URL = 'http://localhost:4000/api/hello',
  AUTH_SCOPE = 'openid profile email service-audit protected-api.read protected-api.write'
} = process.env;

if (SESSION_SECRET === 'change-me') {
  console.warn('SESSION_SECRET is using the default value. Set a random secret string in your .env file.');
}

app.set('trust proxy', 1);
app.use(
  session({
    name: 'oauth-study.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60
    }
  })
);

app.use(express.urlencoded({ extended: false }));

let clientPromise;

async function getOidcClient() {
  if (clientPromise) {
    return clientPromise;
  }
  clientPromise = (async () => {
    const issuer = await Issuer.discover(`${KEYCLOAK_URL}/realms/${REALM}`);
    return new issuer.Client({
      client_id: CLIENT_ID,
      token_endpoint_auth_method: 'none'
    });
  })();

  return clientPromise;
}

app.get('/', async (req, res) => {
  if (req.session.tokenSet) {
    const { access_token: accessToken, id_token: idToken } = req.session.tokenSet;
    const apiResult = req.session.apiResult;
    res.send(`
      <main>
        <h1>OAuth Study App</h1>
        <p>You are logged in.</p>
        <section>
          <h2>Tokens</h2>
          <h3>Access Token</h3>
          <pre>${accessToken ? JSON.stringify(parseJwt(accessToken), null, 2) : 'Unavailable'}</pre>
          <h3>ID Token</h3>
          <pre>${idToken ? JSON.stringify(parseJwt(idToken), null, 2) : 'Unavailable'}</pre>
          <h3>Protected API Response (${PROTECTED_API_URL})</h3>
          ${apiResult ? `<pre>${JSON.stringify(apiResult, null, 2)}</pre>` : '<p>No response yet. Click the button below to call the protected API.</p>'}
        </section>
        <form method="post" action="/call-protected">
          <button type="submit">Call Protected API</button>
        </form>
        <p><a href="/logout">Log out</a></p>
      </main>
    `);
  } else {
    res.send(`
      <main>
        <h1>OAuth Study App</h1>
        <p>You are not logged in.</p>
        <p><a href="/login">Start Authorization Code + PKCE flow</a></p>
      </main>
    `);
  }
});

app.get('/login', async (req, res, next) => {
  try {
    const client = await getOidcClient();
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    const state = crypto.randomBytes(16).toString('hex');
    req.session.codeVerifier = codeVerifier;
    req.session.state = state;

    const authorizationUrl = client.authorizationUrl({
      scope: AUTH_SCOPE,
      redirect_uri: REDIRECT_URI,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state
    });

    res.redirect(authorizationUrl);
  } catch (err) {
    next(err);
  }
});

app.get('/callback', async (req, res, next) => {
  try {
    const client = await getOidcClient();
    const params = client.callbackParams(req);
    if (!req.session.codeVerifier || !req.session.state) {
      throw new Error('Missing PKCE verifier or state in session. Start the login flow again.');
    }

    if (req.session.state !== params.state) {
      throw new Error('State mismatch detected. Possible CSRF attack.');
    }

    const tokenSet = await client.callback(
      REDIRECT_URI,
      params,
      {
        code_verifier: req.session.codeVerifier,
        state: req.session.state
      }
    );

    delete req.session.codeVerifier;
    delete req.session.state;

    req.session.tokenSet = {
      access_token: tokenSet.access_token,
      id_token: tokenSet.id_token,
      refresh_token: tokenSet.refresh_token,
      expires_at: tokenSet.expires_at
    };
    req.session.apiResult = null;

    res.redirect('/');
  } catch (err) {
    next(err);
  }
});

app.get('/logout', async (req, res, next) => {
  try {
    const client = await getOidcClient();
    const endSessionUrl = client.endSessionUrl({
      post_logout_redirect_uri: `http://localhost:${PORT}/`,
      id_token_hint: req.session?.tokenSet?.id_token
    });
    req.session.destroy(() => {
      res.redirect(endSessionUrl);
    });
  } catch (err) {
    next(err);
  }
});

app.post('/call-protected', async (req, res, next) => {
  try {
    if (!req.session.tokenSet?.access_token) {
      return res.redirect('/');
    }
    const result = await callProtectedApi(req.session.tokenSet.access_token);
    req.session.apiResult = result;
    res.redirect('/');
  } catch (err) {
    next(err);
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).send(`<pre>${err.message}</pre>`);
});

app.listen(PORT, () => {
  console.log(`OAuth study app listening on http://localhost:${PORT}`);
});

function parseJwt(token) {
  try {
    const [, payload] = token.split('.');
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    return JSON.parse(decoded);
  } catch (error) {
    return { error: 'Unable to decode token', details: String(error) };
  }
}

async function callProtectedApi(accessToken) {
  if (!accessToken) {
    return { error: 'Missing access token' };
  }
  try {
    const response = await fetch(PROTECTED_API_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    const body = await response.json().catch(() => ({}));
    return {
      status: response.status,
      ok: response.ok,
      body
    };
  } catch (error) {
    return {
      status: 'error',
      message: error.message
    };
  }
}
