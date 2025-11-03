.PHONY: up down restart logs token clean app-run app-install

# Start Keycloak playground in detached mode
up:
	docker compose up -d

# Stop containers but keep volumes
down:
	docker compose down

# Bounce Keycloak service for realm re-imports or config tweaks
restart:
	docker compose restart keycloak

# Tail Keycloak logs to watch startup progress
logs:
	docker compose logs -f keycloak

# Fetch a client credentials access token using helper script
token:
	./scripts/request-client-credentials-token.sh

# Install app dependencies
app-install:
	cd app && npm install

# Run sample OAuth client on localhost:3000
app-run:
	cd app && npm run dev

# Stop containers and remove persistent volumes
clean:
	docker compose down -v
