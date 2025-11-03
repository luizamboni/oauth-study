#!/usr/bin/env bash
set -euo pipefail

CLIENT_ID=${1:-confidential-cli}
CLIENT_SECRET=${2:-confidential-cli-secret}
KEYCLOAK_URL=${KEYCLOAK_URL:-http://localhost:8080}
REALM=${REALM:-oauth-study}
PROTECTED_API_URL=${PROTECTED_API_URL:-http://localhost:4000/api/hello}
CALL_API=${CALL_API:-true}

token_endpoint="${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token"

response=$(curl -s \
  -X POST "${token_endpoint}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=${CLIENT_ID}" \
  -d "client_secret=${CLIENT_SECRET}")

printf '%s\n' "${response}" | jq .

access_token=$(jq -r '.access_token // empty' <<< "${response}")

if [[ -n "${access_token}" && "${CALL_API}" == "true" ]]; then
  echo
  echo "Calling ${PROTECTED_API_URL}"
  api_response=$(curl -s \
    -H "Authorization: Bearer ${access_token}" \
    "${PROTECTED_API_URL}")
  printf '%s\n' "${api_response}" | jq .
fi
