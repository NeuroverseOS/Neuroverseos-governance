# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in NeuroVerse Governance, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, email: **security@neuroverseos.org**

Include:
- Description of the vulnerability
- Steps to reproduce
- Affected versions
- Potential impact

We will acknowledge receipt within 48 hours and provide a detailed response within 7 days.

## Scope

The following are in scope for security reports:

- **Guard engine bypass** — any input that should be BLOCKED but isn't
- **Prompt injection evasion** — patterns that bypass the 63+ safety checks
- **World loader path traversal** — reading files outside the world directory
- **MCP server vulnerabilities** — command injection, buffer overflow, unauthorized access
- **Playground XSS** — cross-site scripting in the web UI
- **Plan enforcement bypass** — circumventing plan constraints

## Out of Scope

- Denial of service via extremely large inputs (we enforce size limits, but resource exhaustion on the host machine is out of scope)
- Vulnerabilities in dependencies (report to the dependency maintainer)
- Social engineering

## Security Design Principles

NeuroVerse Governance is built on these security principles:

1. **Deterministic evaluation** — no LLM in the guard loop. Same input = same verdict.
2. **Zero runtime dependencies** — no supply chain attack surface.
3. **Input validation** — all inputs are length-limited before regex evaluation.
4. **Fail-closed by default** — if the engine can't evaluate, it returns ERROR, not ALLOW.
5. **No secrets in code** — API keys read from environment variables, config stored with 0600 permissions.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.2.x   | Yes       |
| < 0.2   | No        |
