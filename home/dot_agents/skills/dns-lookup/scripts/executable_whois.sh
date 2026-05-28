#!/bin/bash
# Get WHOIS information for a domain

set -e

DOMAIN="$1"

if [[ -z "$DOMAIN" ]]; then
    echo "Usage: $0 <domain>" >&2
    exit 1
fi

# Strip protocol and path if present
DOMAIN=$(echo "$DOMAIN" | sed -E 's|^https?://||' | sed -E 's|/.*$||')

echo "WHOIS for: $DOMAIN"
echo "========================================"
echo ""

whois "$DOMAIN" 2>/dev/null | grep -iE '(domain name|registrar|registration|expir|name server|status|created|updated|registrant|admin|tech|dnssec)' | head -50

echo ""
echo "----------------------------------------"
echo "Run 'whois $DOMAIN' for full output"
