#!/bin/bash
# Check if a domain is available (not registered)

set -e

DOMAIN="$1"

if [[ -z "$DOMAIN" ]]; then
    echo "Usage: $0 <domain>" >&2
    exit 1
fi

# Strip protocol and path if present
DOMAIN=$(echo "$DOMAIN" | sed -E 's|^https?://||' | sed -E 's|/.*$||')

# Get WHOIS output
whois_output=$(whois "$DOMAIN" 2>/dev/null)

# Check for common "not found" patterns across different TLDs
# Different registries use different messages
if echo "$whois_output" | grep -qiE '(no match|not found|no data found|domain not found|no entries found|available|status: free|is free|no object found|object does not exist|nothing found|domain is available)'; then
    echo "✓ AVAILABLE: $DOMAIN"
    echo "  This domain appears to be available for registration."
    exit 0
fi

# Check for common "registered" patterns
if echo "$whois_output" | grep -qiE '(domain name:|registrar:|creation date|registry expiry|name server|registrant)'; then
    echo "✗ TAKEN: $DOMAIN"
    
    # Try to extract registrar and expiry
    registrar=$(echo "$whois_output" | grep -iE '^registrar:' | head -1 | sed 's/^[^:]*: *//')
    expiry=$(echo "$whois_output" | grep -iE '(expir|expiry)' | head -1 | sed 's/^[^:]*: *//')
    
    if [[ -n "$registrar" ]]; then
        echo "  Registrar: $registrar"
    fi
    if [[ -n "$expiry" ]]; then
        echo "  Expires: $expiry"
    fi
    exit 1
fi

# Uncertain - couldn't determine
echo "? UNKNOWN: $DOMAIN"
echo "  Could not determine availability. Check manually:"
echo "  whois $DOMAIN"
exit 2
