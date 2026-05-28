---
name: dns-lookup
description: DNS and domain information lookup. Use for checking DNS records (A, AAAA, MX, TXT, NS, CNAME, SOA), WHOIS data, and domain availability. Helps with domain research, troubleshooting DNS issues, and finding if a domain is registered or free.
compatibility: Requires dig, whois, and host commands (available by default on macOS and most Linux distributions).
---

# DNS Lookup

Query DNS records, WHOIS information, and check domain availability.

## Scripts

### All DNS Records

```bash
./scripts/dns-records.sh <domain>
```

Returns all common DNS record types (A, AAAA, MX, TXT, NS, CNAME, SOA).

### Specific Record Type

```bash
./scripts/dns-record.sh <domain> <type>
```

Query a specific record type:
- `A` - IPv4 address
- `AAAA` - IPv6 address
- `MX` - Mail servers
- `TXT` - Text records (SPF, DKIM, etc.)
- `NS` - Name servers
- `CNAME` - Canonical name (alias)
- `SOA` - Start of authority
- `CAA` - Certificate authority authorization
- `SRV` - Service records
- `PTR` - Reverse DNS

Example:
```bash
./scripts/dns-record.sh google.com MX
./scripts/dns-record.sh example.com TXT
```

### WHOIS Lookup

```bash
./scripts/whois.sh <domain>
```

Returns WHOIS registration data including:
- Registrar
- Registration/expiration dates
- Name servers
- Registrant info (if not private)

### Domain Availability

```bash
./scripts/available.sh <domain>
```

Checks if a domain is registered or available for purchase.

### Bulk Availability Check

```bash
./scripts/bulk-available.sh <domain-list-file>
# or
echo -e "example1.com\nexample2.com" | ./scripts/bulk-available.sh
```

Check multiple domains at once.

### Full Domain Report

```bash
./scripts/report.sh <domain>
```

Comprehensive report including:
- All DNS records
- WHOIS summary
- Name server check
- Mail server check

## Examples

```bash
# Check all DNS records for a domain
./scripts/dns-records.sh github.com

# Check if a domain is available
./scripts/available.sh my-cool-startup.com

# Get WHOIS info
./scripts/whois.sh anthropic.com

# Full report
./scripts/report.sh linear.app
```

## Common Use Cases

| Task | Command |
|------|---------|
| Find mail servers | `./scripts/dns-record.sh domain.com MX` |
| Check SPF/DKIM | `./scripts/dns-record.sh domain.com TXT` |
| Find who owns domain | `./scripts/whois.sh domain.com` |
| Is domain taken? | `./scripts/available.sh domain.com` |
| Debug DNS issues | `./scripts/report.sh domain.com` |
