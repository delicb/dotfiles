#!/bin/bash
# Generate comprehensive DNS report for a domain

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOMAIN="$1"

if [[ -z "$DOMAIN" ]]; then
    echo "Usage: $0 <domain>" >&2
    exit 1
fi

# Strip protocol and path if present
DOMAIN=$(echo "$DOMAIN" | sed -E 's|^https?://||' | sed -E 's|/.*$||')

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           DNS REPORT: $DOMAIN"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Availability / Registration Status
echo "┌──────────────────────────────────────────────────────────────┐"
echo "│ REGISTRATION STATUS                                          │"
echo "└──────────────────────────────────────────────────────────────┘"
"$SCRIPT_DIR/available.sh" "$DOMAIN" 2>/dev/null || true
echo ""

# DNS Records
echo "┌──────────────────────────────────────────────────────────────┐"
echo "│ DNS RECORDS                                                   │"
echo "└──────────────────────────────────────────────────────────────┘"

echo "A (IPv4):"
dig +short "$DOMAIN" A 2>/dev/null | sed 's/^/  /' || echo "  (none)"
echo ""

echo "AAAA (IPv6):"
dig +short "$DOMAIN" AAAA 2>/dev/null | sed 's/^/  /' || echo "  (none)"
echo ""

echo "NS (Name Servers):"
dig +short "$DOMAIN" NS 2>/dev/null | sed 's/^/  /' || echo "  (none)"
echo ""

echo "MX (Mail Servers):"
dig +short "$DOMAIN" MX 2>/dev/null | sed 's/^/  /' || echo "  (none)"
echo ""

echo "TXT Records:"
dig +short "$DOMAIN" TXT 2>/dev/null | sed 's/^/  /' || echo "  (none)"
echo ""

echo "CAA (Certificate Authority):"
dig +short "$DOMAIN" CAA 2>/dev/null | sed 's/^/  /' || echo "  (none)"
echo ""

# WHOIS Summary
echo "┌──────────────────────────────────────────────────────────────┐"
echo "│ WHOIS SUMMARY                                                 │"
echo "└──────────────────────────────────────────────────────────────┘"

whois_out=$(whois "$DOMAIN" 2>/dev/null)

registrar=$(echo "$whois_out" | grep -iE '^registrar:' | head -1 | sed 's/^[^:]*: *//')
created=$(echo "$whois_out" | grep -iE '(creation date|created)' | head -1 | sed 's/^[^:]*: *//')
expires=$(echo "$whois_out" | grep -iE '(expir|expiry)' | head -1 | sed 's/^[^:]*: *//')
updated=$(echo "$whois_out" | grep -iE '(updated|modified)' | head -1 | sed 's/^[^:]*: *//')
dnssec=$(echo "$whois_out" | grep -iE 'dnssec' | head -1 | sed 's/^[^:]*: *//')

[[ -n "$registrar" ]] && echo "Registrar:    $registrar"
[[ -n "$created" ]] && echo "Created:      $created"
[[ -n "$expires" ]] && echo "Expires:      $expires"
[[ -n "$updated" ]] && echo "Updated:      $updated"
[[ -n "$dnssec" ]] && echo "DNSSEC:       $dnssec"

echo ""
echo "┌──────────────────────────────────────────────────────────────┐"
echo "│ CONNECTIVITY TEST                                             │"
echo "└──────────────────────────────────────────────────────────────┘"

# Check if web server responds
if curl -s --max-time 5 -o /dev/null -w "%{http_code}" "https://$DOMAIN" 2>/dev/null | grep -qE '^[23]'; then
    echo "HTTPS: ✓ Responding"
elif curl -s --max-time 5 -o /dev/null -w "%{http_code}" "http://$DOMAIN" 2>/dev/null | grep -qE '^[23]'; then
    echo "HTTP:  ✓ Responding (no HTTPS)"
else
    echo "Web:   ✗ Not responding or no web server"
fi

# Check mail
mx=$(dig +short "$DOMAIN" MX 2>/dev/null | head -1)
if [[ -n "$mx" ]]; then
    echo "Mail:  ✓ MX records present"
else
    echo "Mail:  ✗ No MX records"
fi

echo ""
echo "Report generated: $(date)"
