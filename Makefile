.PHONY: up down restart logs token clean app-run app-install api-install api-run api-env api-call reset

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

# Install protected API dependencies
api-install:
	cd api && npm install

# Run protected API on localhost:4000
api-run:
	cd api && npm run dev

# Prepare protected API environment file
api-env:
	test -f api/.env || cp api/.env.example api/.env

# Call protected API (requires TOKEN env var)
api-call:
	@test -n "$(TOKEN)" || (echo "Usage: TOKEN=... make api-call" && exit 1)
	curl -s -H "Authorization: Bearer $(TOKEN)" http://localhost:4000/api/hello | jq

# Reset environment (stop, remove volumes, fresh start)
reset:
	docker compose down -v
	docker compose up -d
	./scripts/grant-service-account-role.sh

# Stop containers and remove persistent volumes
clean:
	docker compose down -v
