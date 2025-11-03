require('dotenv/config');
const express = require('express');
const { createRemoteJWKSet, jwtVerify } = require('jose');

const {
  PORT = 4000,
  KEYCLOAK_URL = 'http://localhost:8080',
  REALM = 'oauth-study',
  AUDIENCE,
  REQUIRED_ROLE = 'service.reader',
  REQUIRED_SCOPE_READ = 'protected-api.read',
  REQUIRED_SCOPE_WRITE = 'protected-api.write'
} = process.env;

const ISSUER = `${KEYCLOAK_URL}/realms/${REALM}`;
const JWKS_URL = new URL(`${ISSUER}/protocol/openid-connect/certs`);
const JWKS = createRemoteJWKSet(JWKS_URL);

function authenticateToken(options = {}) {
  const {
    requiredRole = REQUIRED_ROLE,
    requiredScope
  } = options;

  return async function middleware(req, res, next) {
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
      const scopes = extractScopes(verified.payload);
      if (requiredScope && !scopes.includes(requiredScope)) {
        return res.status(403).json({
          error: `Missing required scope: ${requiredScope}`
        });
      }
      if (requiredRole && !roles.includes(requiredRole)) {
        return res.status(403).json({
          error: `Missing required role: ${requiredRole}`
        });
      }
      req.auth = {
        token,
        payload: verified.payload,
        roles,
        scopes
      };
      next();
    } catch (error) {
      console.error('Token verification failed', error.message);
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

function extractRoles(payload) {
  const directRoles = Array.isArray(payload.roles) ? payload.roles : [];
  const realmRoles = payload.realm_access?.roles || [];
  const resourceRoles = Object.values(payload.resource_access || {}).flatMap(
    resource => resource.roles || []
  );
  return [...new Set([...directRoles, ...realmRoles, ...resourceRoles])];
}

function extractScopes(payload) {
  if (Array.isArray(payload.scopes)) {
    return payload.scopes;
  }
  if (typeof payload.scope === 'string') {
    return payload.scope
      .split(/\s+/)
      .map(scope => scope.trim())
      .filter(Boolean);
  }
  return [];
}

const app = express();

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get(
  '/api/hello',
  authenticateToken({ requiredScope: REQUIRED_SCOPE_READ }),
  (req, res) => {
    const { payload, roles, scopes } = req.auth;
    res.json({
      message: 'Hello from the protected API!',
      subject: payload.sub,
      roles,
      scopes,
      audit_roles: payload.audit_roles || [],
      scope: payload.scope,
      issued_at: payload.iat,
      expires_at: payload.exp
    });
  }
);

app.post(
  '/api/metrics',
  authenticateToken({
    requiredRole: 'service.writer',
    requiredScope: REQUIRED_SCOPE_WRITE
  }),
  (req, res) => {
    const { payload, scopes } = req.auth;
    res.json({
      message: 'Metrics update accepted',
      subject: payload.sub,
      audit_roles: payload.audit_roles || [],
      scopes,
      accepted_at: Date.now()
    });
  }
);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Protected API listening on http://localhost:${PORT}`);
});
