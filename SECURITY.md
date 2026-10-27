# Security policy

## Reporting

Report vulnerabilities privately through
[GitHub Security Advisories](https://github.com/AirysChat/mcp/security/advisories/new).
Do not open public issues for security problems. Expect an acknowledgement within 3 business days.

## Scope

- The `@airyschat/mcp` server (stdio and hosted `mcp.airys.chat`).
- Plugins and skills in this repository.

Vulnerabilities in AirysChat itself go to the AirysChat repository's security process.

## Threat model in brief

- **Prompt injection through customer content** is the primary risk: conversations, contacts,
  templates and deals contain third-party text. The server fences it as untrusted data and gates
  every irreversible action behind explicit confirmation.
- **Tokens**: the server acts with the user's own AirysChat token and never logs headers or bodies.
- **Hosted service**: only talks to an allowlist of Airys-operated instances (no arbitrary base URLs).

## Supported versions

Pre-1.0: only the latest minor receives fixes.
