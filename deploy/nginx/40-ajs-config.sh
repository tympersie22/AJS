#!/bin/sh
set -eu

CERTIFICATE="/etc/letsencrypt/live/${AJS_DOMAIN}/fullchain.pem"
PRIVATE_KEY="/etc/letsencrypt/live/${AJS_DOMAIN}/privkey.pem"

if [ -f "$CERTIFICATE" ] && [ -f "$PRIVATE_KEY" ]; then
  TEMPLATE="/etc/nginx/ajs-templates/https.conf.template"
  echo "AJS TLS certificate found; enabling HTTPS."
else
  TEMPLATE="/etc/nginx/ajs-templates/http.conf.template"
  echo "AJS TLS certificate not found; starting HTTP for Certbot bootstrap."
fi

envsubst '${AJS_DOMAIN}' < "$TEMPLATE" > /etc/nginx/conf.d/default.conf
