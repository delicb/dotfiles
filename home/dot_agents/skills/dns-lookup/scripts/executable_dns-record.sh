#!/bin/bash
# Get specific DNS record type for a domain

set -e

DOMAIN="$1"
TYPE="$2"

if [[ -z "$DOMAIN" || -z "$TYPE" ]]; then
    echo "Usage: $0 <domain> <record-type>" >&2
    echo "" >&2
    echo "Record types: A, AAAA, MX, TXT, NS, CNAME, SOA, CAA, SRV, PTR" >&2
    exit 1
fi

# Strip protocol and path if present
DOMAIN=$(echo "$DOMAIN" | sed -E 's|^https?://||' | sed -E 's|/.*$||')
TYPE=$(echo "$TYPE" | tr '[:lower:]' '[:upper:]')

echo "$TYPE records for $DOMAIN:"
echo "----------------------------------------"
dig +noall +answer "$DOMAIN" "$TYPE"
