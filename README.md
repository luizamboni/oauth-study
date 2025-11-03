# OAuth Study Environment

Local playground for experimenting with OAuth 2.0 and OpenID Connect using [Keycloak](https://www.keycloak.org/) running in Docker.




## Prerequisites
- Docker Engine 24+
- Docker Compose plugin (bundled with recent Docker Desktop releases)
- `curl` and [`jq`](https://stedolan.github.io/jq/) for the helper scripts

## Getting Started
1. Boot the stack:
   ```bash
   make up
   ```
   Wait until you see `Keycloak 24.0` and `Listening on: http://0.0.0.0:8080`.

2. Open http://localhost:8080 in your browser and sign in to the admin console with:
   - Username: `admin`
   - Password: `admin`

The realm `oauth-study` is auto-imported with example clients, roles, and a demo user.

### Using the Authorization Code + PKCE Flow

<p align="center">
  <img src="docs/sequence-diagram-auth-code.svg" alt="Authorization Code + PKCE Flow" width="90%">
</p>

### Using the Client Credentials Flow

<p align="center">
  <img src="docs/sequence-diagram-client-credentials.svg" alt="Client Credentials Flow" width="90%">
</p>

### Makefile Shortcuts
- `make up` — start the stack
- `make logs` — tail Keycloak logs
- `make token` — request a client credentials token
- `make app-install` — install the sample app dependencies
- `make app-run` — run the sample app on port 3000
- `make down` — stop containers
- `make clean` — stop containers and remove volumes

## Sample Realm Contents
- **Realm:** `oauth-study`
- **User:** `demo` / `demo`
- **Clients:**
  - `public-pkce-client` (public, Authorization Code + PKCE, redirect URIs `http://localhost:3000/*`, `http://localhost:8000/callback`)
  - `confidential-cli` (confidential, Client Credentials, secret `confidential-cli-secret`)
- **Realm Roles:** `service.reader`, `service.writer`

| Property | `public-pkce-client` | `confidential-cli` |
| --- | --- | --- |
| Client type | Public SPA/native-style client using Authorization Code + PKCE | Confidential client (CLI/service) using Client Credentials |
| Key grant types | `standardFlowEnabled: true`; PKCE enforced via `pkce.code.challenge.method: S256` | `serviceAccountsEnabled: true`; other flows disabled (`standardFlowEnabled`, `implicitFlowEnabled`, `directAccessGrantsEnabled` all `false`) |
| Credentials | No client secret required | Secret `confidential-cli-secret` |
| Redirect URIs & web origins | `http://127.0.0.1:3000/*`, `http://localhost:3000/*`, `http://127.0.0.1:8000/callback`, `http://localhost:8000/callback`; origins set for port 3000 | None (non-browser client) |
| Scope behaviour | Default scopes `profile`, `email`, `roles`, `web-origins`; optional `address`, `phone`; `fullScopeAllowed: true` | Same default/optional scopes but `fullScopeAllowed: false` to require explicit role assignment |
| Protocol mappers | Relies on Keycloak defaults | Custom realm-role mapper ensures tokens expose `roles` claim |

## Try OAuth Flows

### Authorization Code + PKCE (Public Client)
1. Sign in to the Keycloak admin console and select the `oauth-study` realm.
2. Copy the client ID `public-pkce-client`.
3. Use an OAuth debugger (e.g. https://oidcdebugger.com) or your own local client to initiate the Authorization Code flow.
   - Authorization endpoint: `http://localhost:8080/realms/oauth-study/protocol/openid-connect/auth`
   - Token endpoint: `http://localhost:8080/realms/oauth-study/protocol/openid-connect/token`
   - Redirect URI: `http://localhost:8000/callback` (must match exactly)
   - PKCE method: `S256`
4. When prompted, sign in with user `demo` / `demo`.
5. Inspect the returned ID/access tokens in the debugger to understand claims, scopes, and expiry.

### Client Credentials (Confidential Client)
Use the helper script to request a token using the `confidential-cli` client:
```bash
./scripts/request-client-credentials-token.sh
```
The script POSTs to the token endpoint and pretty-prints the JSON response. You can supply a different client ID/secret and override the realm or Keycloak URL via environment variables:
```bash
REALM=oauth-study \
KEYCLOAK_URL=http://localhost:8080 \
./scripts/request-client-credentials-token.sh my-client my-secret
```

### Password Grant (Optional)
Direct Access Grants are disabled by default for security. You can enable them on a client by editing the client configuration in the admin console.

## Troubleshooting
- **Keycloak fails to connect to Postgres:** ensure the `postgres` container is running and healthy (`docker compose ps`).
- **Cannot log in to admin console:** wait for the server to finish booting; initial migrations can take ~30 seconds.
- **Realm not visible:** check the Keycloak logs — if the import failed, restart the stack (`docker compose restart keycloak`).

Happy experimenting!
