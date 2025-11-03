#!/usr/bin/env bash
set -euo pipefail

KEYCLOAK_URL=${KEYCLOAK_URL:-http://localhost:8080}
REALM=${REALM:-oauth-study}
ADMIN_USER=${KEYCLOAK_ADMIN:-admin}
ADMIN_PASS=${KEYCLOAK_ADMIN_PASSWORD:-admin}
CLIENT_ID=confidential-cli
ROLE_NAME=${ROLE_NAME:-service.reader}

wait_for_keycloak() {
  echo "Waiting for Keycloak at ${KEYCLOAK_URL}..."
  until curl -sf "${KEYCLOAK_URL}/realms/master/.well-known/openid-configuration" >/dev/null 2>&1; do
    sleep 2
  done
}

get_admin_token() {
  curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "client_id=admin-cli" \
    -d "username=${ADMIN_USER}" \
    -d "password=${ADMIN_PASS}" \
    -d "grant_type=password" | jq -r '.access_token'
}

assign_role() {
  local token=$1
  local client_uuid service_account_id role_repr

  client_uuid=$(curl -s -H "Authorization: Bearer ${token}" \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/clients?clientId=${CLIENT_ID}" | jq -r '.[0].id')

  service_account_id=$(curl -s -H "Authorization: Bearer ${token}" \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${client_uuid}/service-account-user" | jq -r '.id')

  role_repr=$(curl -s -H "Authorization: Bearer ${token}" \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/roles/${ROLE_NAME}")

  curl -s -o /dev/null -w '' -X POST \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${service_account_id}/role-mappings/realm" \
    -d "[${role_repr}]"

  echo "Assigned role '${ROLE_NAME}' to service account of ${CLIENT_ID}."

  echo "Current realm roles for service account:"
  curl -s -H "Authorization: Bearer ${token}" \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${service_account_id}/role-mappings/realm" | jq '.[].name'

  echo "Ensuring client scope mapping includes '${ROLE_NAME}'."
  curl -s -o /dev/null -w '' -X POST \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${client_uuid}/scope-mappings/realm" \
    -d "[${role_repr}]"
}

wait_for_keycloak
token=$(get_admin_token)
assign_role "${token}"
