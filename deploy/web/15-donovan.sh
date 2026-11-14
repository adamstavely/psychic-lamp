#!/bin/sh
# Runs as the container starts (nginx image, /docker-entrypoint.d): writes the web app's runtime settings
# (/config.json) and the nginx site, with the API's address and the identity provider's origin filled in. Both go in
# /tmp/donovan, the one writable place, so the root filesystem can be read-only.
set -eu
: "${OIDC_AUTHORITY:?Set OIDC_AUTHORITY to the identity provider's issuer URL}"
: "${OIDC_CLIENT_ID:?Set OIDC_CLIENT_ID to the web app's client id}"
: "${API_UPSTREAM:?Set API_UPSTREAM to the API's address, e.g. http://donovan-api:3870}"
case "$OIDC_AUTHORITY" in https://*) ;; *) echo "OIDC_AUTHORITY must be https" >&2; exit 1 ;; esac
mkdir -p /tmp/donovan
printf '{"oidc":{"authority":"%s","clientId":"%s"}}\n' "$OIDC_AUTHORITY" "$OIDC_CLIENT_ID" > /tmp/donovan/config.json
# scheme://host[:port] of the issuer: what the security policy lets the page talk to and frame for sign-in.
OIDC_ORIGIN=$(printf '%s' "$OIDC_AUTHORITY" | sed -E 's#^(https://[^/]+).*#\1#')
export OIDC_ORIGIN API_UPSTREAM
envsubst '${API_UPSTREAM} ${OIDC_ORIGIN}' < /etc/nginx/donovan.conf.template > /tmp/donovan/site.conf
