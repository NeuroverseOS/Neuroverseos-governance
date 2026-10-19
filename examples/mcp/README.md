# MCP example: `may_i`

A stdio [MCP](https://modelcontextprotocol.io) server that lets an agent ask a rulebook before it acts. The MCP SDK is a dependency of this example only; the core package stays zero-dependency.

```bash
cd examples/mcp
npm install
npm start -- ../../example-grocery-01.rules.json     # from `npm run demo -- --json` at the repo root, or a switchboard export
```

Client config (Claude Desktop, Claude Code, Cursor, or any MCP client):

```json
{ "mcpServers": { "robot-domain-rules": { "command": "npx", "args": ["tsx", "/path/to/examples/mcp/server.ts", "/path/to/site.rules.json"] } } }
```

Two tools:

- **`may_i`** `{ participant: { id, kind, roleId }, action }` → the request the harness built and the decision, exactly as `evaluateDomainAction` returns it. The agent reads `status`; on `PAUSE` it reads `approvalRequests` and asks a person; on `LIMIT` it reads `limits`.
- **`explain_rulebook`** → the rulebook as text, with the rules at odds.

**Facts come from the harness, never from the requester.** The agent says only who it is and what it wants to do. The area it is in, the people count, the alarm, the time (`now`), its recent history: the server takes all of that from its own fact source — in this example a stub (`harnessFacts` in `server.ts`) standing in for your spatial system, sensors and clock. An agent that could pass its own facts could talk the rulebook into anything, so the tool has no `areaId` and no `facts` parameters. Replace the stub with your real sources; keep the rule.

The server validates the rulebook on start and never changes it. It adds nothing to a decision.
