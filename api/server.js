require('dotenv/config');
const express = require('express');
const { createRemoteJWKSet, jwtVerify } = require('jose');

const {
  PORT = 4000,
  KEYCLOAK_URL = 'http://localhost:8080',
  REALM = 'oauth-study',
  AUDIENCE,
  REQUIRED_ROLE = 'service.reader'
} = process.env;

const ISSUER = `${KEYCLOAK_URL}/realms/${REALM}`;
const JWKS_URL = new URL(`${ISSUER}/protocol/openid-connect/certs`);
const JWKS = createRemoteJWKSet(JWKS_URL);

const app = express();

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/hello', authenticateToken, (req, res) => {
  const { payload, roles } = req.auth;
  res.json({
    message: 'Hello from the protected API!',
    subject: payload.sub,
    roles,
    issued_at: payload.iat,
    expires_at: payload.exp
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Protected API listening on http://localhost:${PORT}`);
});

async function authenticateToken(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  try {
    const verified = await jwtVerify(token, JWKS, {
      issuer: ISSUER,
      audience: AUDIENCE || undefined
    });
    const roles = extractRoles(verified.payload);
    if (REQUIRED_ROLE && !roles.includes(REQUIRED_ROLE)) {
      return res.status(403).json({
        error: `Missing required role: ${REQUIRED_ROLE}`
      });
    }
    req.auth = {
      token,
      payload: verified.payload,
      roles
    };
    next();
  } catch (error) {
    console.error('Token verification failed', error.message);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function extractRoles(payload) {
  const realmRoles = payload.realm_access?.roles || [];
  const resourceRoles = Object.values(payload.resource_access || {}).flatMap(
    resource => resource.roles || []
  );
  return [...new Set([...realmRoles, ...resourceRoles])];
}
