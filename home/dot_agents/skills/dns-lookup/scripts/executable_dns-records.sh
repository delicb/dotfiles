#!/bin/bash
# Get all common DNS records for a domain

set -e

DOMAIN="$1"

if [[ -z "$DOMAIN" ]]; then
    echo "Usage: $0 <domain>" >&2
    exit 1
fi

# Strip protocol and path if present
DOMAIN=$(echo "$DOMAIN" | sed -E 's|^https?://||' | sed -E 's|/.*$||')

echo "DNS Records for: $DOMAIN"
echo "========================================"
echo ""

for TYPE in A AAAA MX TXT NS CNAME SOA CAA; do
    result=$(dig +noall +answer "$DOMAIN" "$TYPE" 2>/dev/null)
    if [[ -n "$result" ]]; then
        echo "=== $TYPE Records ==="
        echo "$result"
        echo ""
    fi
done
