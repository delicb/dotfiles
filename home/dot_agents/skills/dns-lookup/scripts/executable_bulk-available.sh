#!/bin/bash
# Check availability of multiple domains

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

FILE="$1"

# Read from file or stdin
if [[ -n "$FILE" && -f "$FILE" ]]; then
    domains=$(cat "$FILE")
elif [[ ! -t 0 ]]; then
    domains=$(cat)
else
    echo "Usage: $0 <domain-list-file>" >&2
    echo "   or: echo -e 'domain1.com\\ndomain2.com' | $0" >&2
    exit 1
fi

echo "Checking domain availability..."
echo "========================================"
echo ""

available=()
taken=()
unknown=()

while IFS= read -r domain; do
    # Skip empty lines and comments
    [[ -z "$domain" || "$domain" =~ ^# ]] && continue
    
    # Strip whitespace
    domain=$(echo "$domain" | tr -d '[:space:]')
    
    result=$("$SCRIPT_DIR/available.sh" "$domain" 2>/dev/null) || true
    echo "$result"
    echo ""
    
    if echo "$result" | grep -q "✓ AVAILABLE"; then
        available+=("$domain")
    elif echo "$result" | grep -q "✗ TAKEN"; then
        taken+=("$domain")
    else
        unknown+=("$domain")
    fi
    
    # Rate limit to avoid being blocked
    sleep 1
done <<< "$domains"

echo "========================================"
echo "Summary:"
echo "  Available: ${#available[@]}"
echo "  Taken: ${#taken[@]}"
echo "  Unknown: ${#unknown[@]}"

if [[ ${#available[@]} -gt 0 ]]; then
    echo ""
    echo "Available domains:"
    for d in "${available[@]}"; do
        echo "  ✓ $d"
    done
fi
