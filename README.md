# @neuroverseos/governance

**AI agents and robots propose. The rules decide — with a reason, and the authority behind it.**

[![CI](https://github.com/NeuroverseOS/neuroverseos-governance/actions/workflows/ci.yml/badge.svg)](https://github.com/NeuroverseOS/neuroverseos-governance/actions/workflows/ci.yml)

**[PRINCIPLES](PRINCIPLES.md)** · **[SPEC](SPEC.md)** · **[BOUNDARY](BOUNDARY.md)** · **[conformance](conformance/)** · **[the invoice scenario](acceptance/invoice-reconciliation/)**

One rulebook, written under authority the organisation declares, applied the same way to every AI agent calling a tool, every robot on a floor and every person wearing glasses. A call comes in — *may this participant use this tool, in this scope, with these arguments, under this principal's authority, given these facts?* — and one answer comes out: `ALLOW`, `LIMIT` (within these ceilings), `PAUSE` (a person must approve, or the situation must change) or `BLOCK`, with every rule that decided, who set each one, and the fingerprint of the rulebook in force. Nothing runs on a refusal. No model is inside the decision. The same facts give the same answer every time.

Two formats, one engine: `neuroverse-governance/1` for software (tools, scopes, principals, delegation, arguments bound to facts, missions) and `robot-domain-rules/3` for physical sites (actions, areas), decided by one evaluator through one dialect table ([SPEC § 16.2](SPEC.md#162-one-evaluator)). The engine is derived from [robot-domain-rules](https://github.com/NeuroverseOS/robot-domain-rules) and keeps its 261 conformance cases byte for byte ([NOTICE](NOTICE)).

## Which should I use?

**Relationship to robot-domain-rules:** this package builds on [robot-domain-rules](https://github.com/NeuroverseOS/robot-domain-rules), carrying its physical-space format (`robot-domain-rules/3`) unchanged alongside the software-agent format (`neuroverse-governance/1`). You generally do not need both packages: use this one for software agents, or for agents and robots together; use robot-domain-rules alone if you only need the physical-space rulebook and want the smaller package.

**Separately versioned:** the two repositories have separate release lines and nothing propagates automatically between them in either direction. The compatibility check is the conformance suite: this repository runs robot-domain-rules' 261 published cases byte for byte on every commit (see [docs/provenance/PROVENANCE.md](docs/provenance/PROVENANCE.md)); a change to those cases upstream is re-imported here through a pull request, and a fix to the shared engine here reaches robot-domain-rules only through a pull request there.

## For engineers, and the agents that work with you

You do not have to adopt this package; you can take the principles, the formats and the tests. That is the point.

1. **Read [PRINCIPLES.md](PRINCIPLES.md)** (5 minutes): nine rules for agents, robots and people under one law, each one enforced by named conformance cases in both formats.
2. **Read [SPEC.md](SPEC.md)** (25 minutes): start at [§ 16](SPEC.md#16-neuroverse-governance1--ai-agents-calling-tools), the general contract — the rulebook, request, decision, approval and mission formats, the algorithm as numbered steps, the adapter's fail-closed table — then § 1–15, the shared language written in the robotics dialect, and § 8, the canonical encoding a port reproduces byte for byte.
3. **Run [`conformance/`](conformance/) against your implementation**: 371 language-neutral JSON cases, one line each saying what it proves — 266 for the robotics dialect (`p1`–`p9`, plans, history, backtest, fingerprint, approvals, versions, integrity) and 105 for the digital format (`d1` tools and arguments, `d2` delegation, `d3` approvals bound to the exact call, `d4` limits and projected spend, `d5` missions, `d6` enforcement through the adapter, `d7` backtest), with fixed Ed25519 TEST ONLY keys so every signature is reproducible. `node conformance/run-node.mjs` is the ten-line loop; [`conformance/README.md`](conformance/README.md) is the whole comparison contract.
4. **Run the invoice scenario**: `npm run acceptance`. A small-business owner delegates invoice reconciliation to an AI agent; 28 recorded tool calls — reads, a destructive `DELETE`, a vendor bank change, refunds with valid, replayed, altered and expired approvals, a subagent overstepping, an unknown tool, malformed arguments, cumulative purchases against a weekly cap — each with a hand-authored verdict, replayed through the real engine via the enforcing adapter with a reference harness. The expectations are the contract; the engine is what is tested. Then `npm run acceptance:backtest`: the same recorded log through the rulebook and through a proposed change (a cap of 750 instead of 500), and what that change would have changed.
5. **Backtest your own log before going live.** `backtest(rulebook, events)` replays what your agents asked (the adapter's `Governed.request`, plus whether it ran) and reports what the rules would have decided, the rules that never fired, the rules that would have stalled work, the facts the log did not carry, and where the rule and the record differ; `compareBacktests` says what a proposed rulebook would change ([SPEC § 13](SPEC.md#13-backtest), [§ 16.11](SPEC.md#1611-backtest)).
6. **Trust the conflict analysis, or check it.** Two rules are reported as able to meet if and only if some lawful request matches both, with a witness request on every certain finding; the reachability law is cross-checked against the Z3 SMT solver on every generated pair in `npm test`.

```bash
npm install @neuroverseos/governance      # Node 20+ (Ed25519 via WebCrypto); zero runtime dependencies
```

```ts
import { compileGovernance, compileMission, govern, referenceHarness, evaluate } from '@neuroverseos/governance';

const rulebook = compileGovernance({
  id: 'desk', name: 'The desk', kinds: ['agent', 'human'],
  authorities: [{ id: 'law' }, { id: 'owner' }, { id: 'agent' }],              // highest first; a lower level can only tighten
  tools: [
    { id: 'pay', kinds: ['agent', 'human'], scopes: ['bank'], args: { amount: { fact: 'amount' } }, requires: ['projected_spend'] },
    { id: 'send', kinds: ['agent', 'human'], scopes: ['mail'], args: { to: { fact: 'to_domain' } }, requires: ['external'] },
  ],
  scopes: [{ id: 'bank', name: 'Bank' }, { id: 'mail', name: 'Mail' }],
  roles: [{ id: 'worker', name: 'Worker', kind: 'agent', tools: ['pay', 'send'] }],
  facts: [{ id: 'amount', type: 'number', min: 0 }, { id: 'projected_spend', type: 'number', min: 0 }, { id: 'to_domain', type: 'string' }, { id: 'external', type: 'boolean' }],
  rules: [
    { id: 'cap', text: 'No more than 500 a week.', who: '*', does: 'pay', where: '*', when: [{ fact: 'projected_spend', op: '>', value: 500 }], then: { answer: 'deny' }, setBy: 'owner', source: { kind: 'manual', ref: 'cap' } },
    { id: 'pay_waits', text: 'Payments wait for the owner.', who: 'worker', does: 'pay', where: '*', then: { answer: 'wait', for: 'approval', by: 'owner' }, setBy: 'owner', source: { kind: 'manual', ref: 'pay_waits' } },
    { id: 'no_external', text: 'Nothing to outside domains.', who: '*', does: 'send', where: '*', when: [{ fact: 'external', op: '==', value: true }], then: { answer: 'deny' }, never: true, setBy: 'law', source: { kind: 'manual', ref: 'no_external' } },
  ],
});

// The adapter stands between the model's tool call and the tool. Facts come from YOUR harness, never from the model.
const harness = referenceHarness({
  now: () => new Date().toISOString(),
  resolveScope: tool => (tool === 'pay' ? 'bank' : 'mail'),
  derive: { external: args => !String(args.to).endsWith('yourcompany.example') },      // derived facts are integrator functions
  ledgers: [{ fact: 'projected_spend', tool: 'pay', amountArg: 'amount' }],               // cumulative limits: atomic reserve-then-commit
});
const outcome = await govern(
  { id: 'call_1', function: { name: 'send', arguments: '{"to":"acme.example"}' } },      // a function-call object, or { name, args }
  { rulebook, principal: { id: 'owner-sam' }, participant: { id: 'agent-1', kind: 'agent', roleId: 'worker' } },
  harness,
  async (tool, args) => runTheTool(tool, args),                                           // called only on ALLOW or LIMIT
);
// outcome.status → 'BLOCK'; outcome.executed → false; outcome.decision.reasons → [{ ruleId: 'no_external', setBy: 'law', … }]

// The same evaluator, directly, for a robot on a floor (the robotics dialect, unchanged):
// evaluate(robotRulebook, { participant: { id: 'robot-7', kind: 'robot', roleId: 'inventory_robot' }, action: 'move', areaId: 'aisle-3', facts: { … } })
```

- **A mission that only tightens:** `compileMission(rulebook, { format: 'neuroverse-governance-plan/1', id, objective, permits: [{ tool: 'pay' }], approvals: [{ tool: 'pay', by: 'owner' }], order: [{ first: 'read', then: 'write' }] })` returns a new rulebook with the mission's rules at a lowest `plan` authority: everything not permitted is denied, order becomes a history rule, and a permanent rule is never loosened. Approvals bound to the base rulebook do not clear waits under the mission; a backtest shows that cost before the change ([`acceptance/invoice-reconciliation/backtest.ts`](acceptance/invoice-reconciliation/backtest.ts)).
- **Approvals bound to the exact call:** a signed `neuroverse-governance-approval/1` names the rule, the rulebook fingerprint, the principal, the participant, the tool, the scope and a digest of the arguments, with a nonce and a window. Approving a 120 refund never clears a 1,200 one; a rejected approval never blocks — the call waits, and the decision says why in `approvalsRejected` ([SPEC § 16.6](SPEC.md#166-approvals-bound-to-arguments)).
- **Delegation stays bounded:** a subagent may use a tool only if its own role and every role in the harness-assembled chain list it ([SPEC § 16.5](SPEC.md#165-delegation-stays-bounded)).
- **The robotics dialect, whole:** `compileDomain`, `evaluateDomainAction`, `evaluatePlan`, `glassesZoneRules`, the templates, the plain-text drafter and the examples of robot-domain-rules 0.5.3 are here unchanged (`examples/demo.ts`, `examples/harness/`, `examples/backtest/`, `examples/mcp/`).

## Repo map

| Path | What it is |
|---|---|
| [`PRINCIPLES.md`](PRINCIPLES.md), [`SPEC.md`](SPEC.md), [`BOUNDARY.md`](BOUNDARY.md), [`RELATED-WORK.md`](RELATED-WORK.md) | The principles, the normative spec (both formats), what this layer is and is not with the threat table and the cases that prove each row, how it compares. |
| [`spec/`](spec/) | JSON Schemas (draft 2020-12) for both formats: rulebook, request, decision, plan, plan evaluation, findings, approvals, backtest, the adapter's tool-call input. |
| [`conformance/`](conformance/) | 371 language-neutral cases (`p1`–`p9` and the robotics files; `d1`–`d7` for the digital format), shared rulebooks, TEST ONLY Ed25519 keys and SHA-256 vectors, a framework-free runner, a schema validator, the generator. |
| [`src/`](src/) | The engine. Zero runtime dependencies. `types.ts` first; `model.ts` (the dialect table and the normalised model); `compile.ts`, `governance.ts` (the `/1` compiler and missions), `evaluate.ts` (the one evaluator), `plan.ts`, `check.ts`, `backtest.ts`, `approvals.ts` with `verified.ts` (the verified handle), `canonical.ts`; `templates/`, `draft.ts`, `glasses.ts`, `zone-rules.ts`, `legacy.ts` (the robotics dialect's tooling). |
| [`adapters/tool-call/`](adapters/tool-call/) | The enforcing adapter (`govern`), the reference harness (spend ledger with reserve-then-commit, nonce set, history store) and a data-driven harness for conformance. Exported from the root bundle. |
| [`acceptance/invoice-reconciliation/`](acceptance/invoice-reconciliation/) | The scenario: rules, mission, 28 recorded calls with hand-authored verdicts, the runner and the backtest. |
| [`examples/`](examples/) | The robotics examples: a grocery store, a warehouse, a clinic, `demo.ts`, the semantic-volumes harness replays, a synthetic week to backtest, a `/3` MCP server (its own package). |
| [`test/`](test/) | Core tests, the Z3 cross-check, the tool-call adapter tests, and the conformance runner. |
| [`AGENTS.md`](AGENTS.md) | Invariants and working rules for people and coding agents. [`CHANGELOG.md`](CHANGELOG.md) for what changed. [`docs/provenance/`](docs/provenance/) for how the engine came to be. |

```bash
git clone https://github.com/NeuroverseOS/neuroverseos-governance && cd neuroverseos-governance && npm install
npm test                                      # core tests + the Z3 cross-check + the adapter tests + every conformance case
npm run build && npm run conformance && npm run conformance:schemas
npm run acceptance && npm run acceptance:backtest
npm run demo                                  # three robotics rulebooks in plain text, their findings, a day of decisions each
npx tsx examples/harness/replay.ts            # the robot replay;  examples/harness/plan-replay.ts  the planner replay
npm run backtest                              # a robotics rulebook against a synthetic week
```

## Stability and versioning

`1.0.0-rc.1`: a release candidate. The two specifications are versioned separately from the package — `neuroverse-governance/1` and `robot-domain-rules/3` ([SPEC § 11](SPEC.md#11-versioning-and-explicit-version-handling), [§ 16.10](SPEC.md#1610-versions-and-doors)); a change that alters any decision, finding, fingerprint or signature for a valid rulebook bumps the spec, with new conformance cases. Every artifact declares its version and an implementation never reinterprets another one: a `/3` rulebook at a `/1`-only door, or a `/1` approval at a `/3` rulebook, is refused by name.

**Releases publish only through the `publish` workflow** ([`.github/workflows/publish.yml`](.github/workflows/publish.yml)): npm trusted publishing over OIDC with provenance — no token, no secret, nothing from a laptop. The trusted publisher registered on npm is owner `NeuroverseOS`, repository `neuroverseos-governance`, workflow `publish.yml`; a release tag must equal `package.json`'s version, and `prepublishOnly` runs the whole gate before anything is uploaded.

**The 0.x API is gone.** Versions 0.x of this package were a different engine (worlds, lenses, the `neuroverse` CLI, its framework and HTTP adapters, Radiant, chat, spatial). That code lives on, with its full history, on the branch [`legacy/main`](https://github.com/NeuroverseOS/neuroverseos-governance/tree/legacy/main) of this repository (the last pre-cut tree is the ref [`legacy/pre-cut`](https://github.com/NeuroverseOS/neuroverseos-governance/tree/legacy/pre-cut); a private archive also holds the full history); the last 0.x published to npm is 0.12. Nothing of it is exported here. See [CHANGELOG.md](CHANGELOG.md).

## License and provenance

MIT, copyright (c) 2026 NeuroverseOS ([LICENSE](LICENSE)). The engine is derived from robot-domain-rules 0.5.3 (commit `ef13e19`, MIT); its notice is preserved in [NOTICE](NOTICE), and [`docs/provenance/PROVENANCE.md`](docs/provenance/PROVENANCE.md) records the copy byte for byte. Versions 0.x were Apache-2.0; that license text is on `legacy/main`.
