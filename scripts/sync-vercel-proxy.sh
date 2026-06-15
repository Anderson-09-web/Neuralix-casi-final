#!/usr/bin/env bash
# sync-vercel-proxy.sh
# Run after deploying on Replit to automatically update vercel.json
# with the stable *.replit.app backend URL.
#
# Usage:
#   bash scripts/sync-vercel-proxy.sh
#
# What it does:
#   1. Reads REPLIT_DOMAINS env var (set automatically by Replit in production)
#   2. Finds the stable *.replit.app domain
#   3. Updates vercel.json and artifacts/neuralix/vercel.json with that URL

set -e

# Try to find the production *.replit.app domain
PROD_DOMAIN=""

if [ -n "$REPLIT_DOMAINS" ]; then
  IFS=',' read -ra DOMAINS <<< "$REPLIT_DOMAINS"
  for domain in "${DOMAINS[@]}"; do
    domain=$(echo "$domain" | xargs)
    if [[ "$domain" == *.replit.app ]]; then
      PROD_DOMAIN="$domain"
      break
    fi
  done
fi

if [ -z "$PROD_DOMAIN" ]; then
  echo ""
  echo "ERROR: No *.replit.app domain found."
  echo "This script must be run after deploying on Replit."
  echo "REPLIT_DOMAINS value: ${REPLIT_DOMAINS:-'(not set)'}"
  echo ""
  echo "To fix manually: paste your *.replit.app URL as the BACKEND_URL below:"
  echo "  BACKEND_URL=https://your-app.replit.app bash scripts/sync-vercel-proxy.sh"
  exit 1
fi

# Allow manual override
BACKEND_URL="${BACKEND_URL:-https://$PROD_DOMAIN}"

echo "Backend URL: $BACKEND_URL"

VERCEL_JSON_1="vercel.json"
VERCEL_JSON_2="artifacts/neuralix/vercel.json"

update_vercel_json() {
  local file="$1"
  if [ ! -f "$file" ]; then
    echo "  Skipping $file (not found)"
    return
  fi
  # Replace any https://...replit.dev or https://...replit.app URL in destination
  node -e "
    const fs = require('fs');
    const content = fs.readFileSync('$file', 'utf8');
    const updated = content.replace(
      /(\"destination\":\s*\")https?:\/\/[^\"\/]+(\/api\/)/g,
      '\$1${BACKEND_URL}\$2'
    );
    fs.writeFileSync('$file', updated);
    console.log('  Updated: $file');
  "
}

echo ""
echo "Updating vercel.json files..."
update_vercel_json "$VERCEL_JSON_1"
update_vercel_json "$VERCEL_JSON_2"

echo ""
echo "Done! vercel.json now points to: $BACKEND_URL"
echo ""
echo "Next steps:"
echo "  1. Push this change to Git (git commit -am 'fix: update Vercel proxy to production URL')"
echo "  2. Vercel will auto-redeploy with the new backend URL"
echo "  3. Make sure Discord portal has: https://neuralixallow.vercel.app/api/auth/discord/callback"
