#!/usr/bin/env bash
set -euo pipefail

CLIENT_ID=${1:-confidential-cli}
CLIENT_SECRET=${2:-confidential-cli-secret}
KEYCLOAK_URL=${KEYCLOAK_URL:-http://localhost:8080}
REALM=${REALM:-oauth-study}

token_endpoint="${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token"

response=$(curl -s \
  -X POST "${token_endpoint}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=${CLIENT_ID}" \
  -d "client_secret=${CLIENT_SECRET}")

jq . <<< "${response}"
