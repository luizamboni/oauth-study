#!/usr/bin/env bash
set -euo pipefail

CLIENT_ID=${1:-confidential-cli}
CLIENT_SECRET=${2:-confidential-cli-secret}
KEYCLOAK_URL=${KEYCLOAK_URL:-http://localhost:8080}
REALM=${REALM:-oauth-study}
PROTECTED_API_URL=${PROTECTED_API_URL:-http://localhost:4000/api/hello}
CALL_API=${CALL_API:-true}
MIN_ROLE=${MIN_ROLE:-service.reader}
SCOPE=${SCOPE:-}

token_endpoint="${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token"

curl_args=(
  -s
  -X POST "${token_endpoint}"
  -H "Content-Type: application/x-www-form-urlencoded"
  -d "grant_type=client_credentials"
  -d "client_id=${CLIENT_ID}"
  -d "client_secret=${CLIENT_SECRET}"
)

if [[ -n "${SCOPE}" ]]; then
  curl_args+=(-d "scope=${SCOPE}")
fi

response=$(curl "${curl_args[@]}")

printf '%s\n' "${response}" | jq .

access_token=$(jq -r '.access_token // empty' <<< "${response}")

if [[ -n "${access_token}" && "${CALL_API}" == "true" ]]; then
  echo
  echo "Calling ${PROTECTED_API_URL}"
  if api_response=$(curl -s \
    -H "Authorization: Bearer ${access_token}" \
    "${PROTECTED_API_URL}"); then
    printf '%s\n' "${api_response}" | jq .
    if jq -e --arg role "${MIN_ROLE}" '.roles[]? | select(. == $role)' <<< "${api_response}" >/dev/null 2>&1; then
      has_role=yes
    else
      has_role=no
    fi
    if [[ "${has_role}" != "yes" ]]; then
      echo "Warning: response indicates token is missing role '${MIN_ROLE}'."
      echo "Assign the role to the service account or update REQUIRED_ROLE in api/.env."
    fi
  else
  echo "Unable to reach ${PROTECTED_API_URL}. Is the protected API running?" >&2
fi
fi
