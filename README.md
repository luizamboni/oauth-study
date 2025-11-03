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


### Makefile Shortcuts
- `make up` — start the stack
- `make logs` — tail Keycloak logs
- `make token` — request a client credentials token
- `make app-install` — install the sample app dependencies
- `make app-run` — run the sample app on port 3000
- `make api-install` — install the protected API dependencies
- `make api-env` — create `api/.env` from the example file
- `make api-run` — run the protected API on port 4000
- `make api-call` — call the protected API with a Bearer token
- `make api-call-writer` — POST to the writer-only metrics endpoint
- `make reset` — tear down Keycloak/Postgres volumes, restart, and reapply service-account roles
- `make login` — open the Keycloak login page for the `oauth-study` realm in your browser
- `make down` — stop containers
- `make clean` — stop containers and remove volumes

## Sample Realm Contents

### General Data
| Item | Details |
| --- | --- |
| Realm | `oauth-study` |
| Demo user | - Username: `demo`<br>- Password: `demo` |
| Clients | - `public-pkce-client` (public, Auth Code + PKCE)<br>- Redirects: `http://localhost:3000/*`, `http://localhost:8000/callback`<br>- `confidential-cli` (confidential, Client Credentials)<br>- Secret: `confidential-cli-secret` |
| Realm roles | - `service.reader`<br>- `service.writer` |


### Client's Data
| Property | `public-pkce-client` | `confidential-cli` |
| --- | --- | --- |
| Client type | - Public OAuth client<br>- SPA/native-style flow<br>- Authorization Code + PKCE | - Confidential OAuth client<br>- CLI/service-to-service<br>- Client Credentials grant |
| Key grant types | - `standardFlowEnabled: true`<br>- PKCE S256 enforced via `pkce.code.challenge.method` | - `serviceAccountsEnabled: true`<br>- Auth code, implicit, password grants all disabled |
| Credentials | - No client secret<br>- Relies on PKCE + redirect URIs | - Requires `confidential-cli-secret`<br>- Authenticate with Basic/POST body |
| Redirect URIs & web origins | - `http://127.0.0.1:3000/*`<br>- `http://localhost:3000/*`<br>- `http://127.0.0.1:8000/callback`<br>- `http://localhost:8000/callback`<br>- Web origins scoped to port 3000 | - Not browser-based<br>- No redirect URIs needed |
| Scope behaviour | - Default scopes: `profile`, `email`, `roles`, `web-origins`<br>- Optional: `service-audit`, `protected-api.read`, `protected-api.write` (shown as consent checkboxes)<br>- `fullScopeAllowed: false` | - Default scopes mirror public client plus `service-audit`, `protected-api.read`, `protected-api.write` so service tokens always include them<br>- Optional: *(none)*<br>- `fullScopeAllowed: false` to demand explicit assignment |
| Protocol mappers | - Uses Keycloak defaults<br>- Claims driven by scopes | - Adds realm-role mapper<br>- Ensures `roles` claim in tokens |

## Try OAuth Flows

### Authorization Code + PKCE (Public Client)

<p align="center">
  <img src="docs/sequence-diagram-auth-code.svg" alt="Authorization Code + PKCE Flow" width="90%">
</p>
<p align="center"><em>PKCE (Proof Key for Code Exchange) lets public clients prove they are the ones that initiated the login by pairing the authorization code with a one-time code verifier. The client sends a hash (code challenge) during the redirect, then redeems the code with the original verifier so intercepted codes can’t be abused.</em></p>

1. Sign in to the Keycloak admin console and select the `oauth-study` realm.
2. Copy the client ID `public-pkce-client`.
3. Use an OAuth debugger (e.g. https://oidcdebugger.com) or your own local client to initiate the Authorization Code flow.
   - Authorization endpoint: `http://localhost:8080/realms/oauth-study/protocol/openid-connect/auth`
   - Token endpoint: `http://localhost:8080/realms/oauth-study/protocol/openid-connect/token`
   - Redirect URI: `http://localhost:8000/callback` (must match exactly)
   - PKCE method: `S256`
4. When prompted, sign in with user `demo` / `demo`.
5. Keycloak now shows a consent screen listing `profile`, `email`, `roles`, `web-origins`, and the optional `service-audit`, `protected-api.read`, and `protected-api.write` scopes. The sample app requests all of them, so you will see one checkbox per optional scope—untick `protected-api.read` (or `.write`) if you want to deny that capability.
   - Need a fresh user? Click **Register** on the Keycloak login screen—self-service sign-up is enabled and skips email verification in this local setup.
6. Inspect the returned ID/access tokens in the debugger to understand claims, scopes, and expiry.  
   The home screen automatically calls the protected API with your access token and shows the response.
7. The sample app requests `service-audit`, `protected-api.read`, and `protected-api.write` (via `AUTH_SCOPE`), so decoded tokens include the `audit_roles` claim and whatever scopes you leave selected on the consent dialog.

> ℹ️ Want to see the consent dialog again? Visit `make login`, open **Applications** in the Keycloak account console, and revoke access for “Public PKCE Client”. The next Authorization Code flow will re-prompt for the same scopes.

### Client Credentials (Confidential Client)
<p align="center">
  <img src="docs/sequence-diagram-client-credentials.svg" alt="Client Credentials Flow" width="90%">
</p>

Use `make token` to request a service account token with the `confidential-cli` client.  
After printing the token response (note the `scope` string now includes `protected-api.read protected-api.write` alongside `service-audit` and the `audit_roles` claim), the script immediately calls the protected API and outputs the JSON payload (set `CALL_API=false` to skip the call). Provide a custom scope list by exporting `SCOPE="scope1 scope2"` before invoking the task.

### Password Grant (Optional)
Direct Access Grants are disabled by default for security. You can enable them on a client by editing the client configuration in the admin console.

## Protected API (Port 4000)
The `api/` directory exposes an Express API that validates Bearer tokens issued by Keycloak.

1. Install dependencies and copy the environment template:
   - `make api-install`
   - `make api-env`
   - edit `api/.env` (update `REQUIRED_ROLE`, `AUDIENCE`, etc.)
2. Start the API:
   - `make api-run`
   The server listens on http://localhost:4000 and exposes:
   - `GET /healthz` — unauthenticated health check
   - `GET /api/hello` — requires a valid access token, the `service.reader` role, and the `protected-api.read` scope
   - `POST /api/metrics` — requires the `service.writer` role and the `protected-api.write` scope (both granted to new users and the CLI service account)
3. Hit the protected route:
   - Authorization Code flow: tokens retrieved via the sample app automatically trigger a call, and results appear on the home page.
   - Client Credentials flow: `make token` prints both the token response and the protected API output.
   - Manual checks:
     - `TOKEN=<ACCESS_TOKEN> make api-call` for the reader endpoint
     - `TOKEN=<ACCESS_TOKEN> make api-call-writer` for the writer endpoint (ensure the token carries `protected-api.write` in its scope list)

> ℹ️ If the browser client skips `protected-api.read`, the sample app still logs in but API calls return `403 Missing required scope: protected-api.read`. Toggle the scope on the consent screen and retry.

> ℹ️ `make reset` tears down the Keycloak/Postgres stack, reloads the realm, and re-applies the `service.reader` role mapping to the `confidential-cli` service account so client-credential calls stay authorized.

> ℹ️ Need to adjust which resource scopes the browser client can request? Re-run the Authorization Code flow and pick the `protected-api.read` / `protected-api.write` checkboxes on the consent screen. You can revoke access from the Keycloak account console to start over.

> ℹ️ New self-registered users now inherit the `service.reader` and `service.writer` roles by default. If you already created accounts before this change, assign the roles manually or run `make reset` and re-create them.

> ℹ️ The `demo` user has the `service.reader` realm role pre-assigned. If you prefer to call the API with the `confidential-cli` service account instead, grant that role to the client’s service account in Keycloak or relax `REQUIRED_ROLE` in `api/.env`.
