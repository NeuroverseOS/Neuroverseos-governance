# Trusted AI Email Agent with Governance Guardrails

## Summary

This workflow demonstrates how AI-powered email agents can be made trustworthy inside n8n.

Incoming emails are classified and drafted by AI, but before any reply is sent, the **NeuroVerse Guard** node evaluates the response against governance rules. Each action returns one of three decisions:

- **ALLOW** — safe to send
- **BLOCK** — policy violation (logged for audit)
- **PAUSE** — requires human approval

A second AI evaluation step scores the response for accuracy, tone, and policy compliance before final approval.

This ensures companies can safely deploy AI agents while maintaining control over customer communication.

## Workflow Architecture

```
Incoming Email (Webhook)
       ↓
  Classify Email (AI)
       ↓
  Draft Reply (AI)
       ↓
  NeuroVerse Guard ──────────────────────┐
       │              │                  │
     ALLOW          BLOCK              PAUSE
       │              │                  │
  AI Evaluation    Governance Log    Queue for
       │              │              Approval
  Eval Check      Respond 403       Respond 202
   ├ PASS ──→ Send (200)
   └ FAIL ──→ Queue for Review (202)
```

## What Makes This Different

Most submissions will look like:

```
Email → AI → Reply
```

This submission adds **three layers of trust**:

1. **AI Classification** — categorize the email before responding
2. **Governance Enforcement** — deterministic rules that BLOCK refund promises, legal claims, discount offers, and confidential disclosures before they reach the customer
3. **AI Evaluation** — score accuracy, tone, and policy compliance as a second check

The governance layer is not an AI — it's a deterministic rule engine. Sub-millisecond, no LLM calls, fully auditable. That's what makes it trustworthy.

## Governance Rules Enforced

The NeuroVerse Guard evaluates every AI-drafted reply against these policies:

| Rule | Action | Why |
|------|--------|-----|
| Refund approval language | BLOCK | AI cannot approve refunds — only billing team can |
| Discount/pricing offers | BLOCK | AI cannot offer discounts — requires sales authorization |
| Legal statements | BLOCK | AI cannot interpret contracts or discuss liability |
| Confidential information | BLOCK | AI cannot disclose internal systems or other customer data |
| Unprofessional tone | PAUSE | Blame or sarcasm requires human review before sending |
| Legal/escalation threats | PAUSE | Customer mentioning attorneys or regulators → senior support |
| Account deletion (GDPR) | PAUSE | Privacy compliance requires human verification |

All blocked and paused actions are logged with full audit evidence.

## How to Test

**POST** to `/webhook/incoming-email` with:

```json
{
  "from": "customer@example.com",
  "subject": "Refund request",
  "body": "I want to cancel my subscription and get a refund."
}
```

Try different scenarios:

| Test Email | Expected Result |
|-----------|----------------|
| "I have a question about your product" | ALLOW → Sent |
| "I want a refund for my last invoice" | BLOCK (if AI drafts refund approval language) |
| "I'm going to contact my attorney" | PAUSE → Human review |
| "Your service is terrible, this is your fault" | PAUSE → Tone review |
| "What are your internal pricing margins?" | BLOCK → Confidential |

## Technology

- **NeuroVerse Guard**: Deterministic governance engine — `@neuroverseos/governance`
- **World File**: `nexus-email-governance.nv-world.zip` — portable policy rules
- **AI**: GPT-4o-mini for classification, drafting, and evaluation
- **n8n**: Orchestration with visual 3-branch routing

Build your own governance world file free at **[neuroverseos.com](https://neuroverseos.com)**.
