# Lenses Improvement Spec
## For the developer maintaining NeuroverseOS/lenses

These are recommended improvements based on internal audit and UX review. Lenses now lives in its own repo — these changes should be made there.

---

## Critical Fixes

### 1. Add `--live` flag to demo.ts
The demo currently uses hardcoded responses (`Record<string, Record<string, string>>`). Add a `--live` flag that actually calls the AI with the compiled worldfile and a user-provided API key. This is the single most convincing proof that governance changes AI behavior.

```
npx tsx src/demo.ts --live --api-key sk-... --model claude-haiku-4-5-20251001
```

### 2. Add persistent voice indicator
After every AI response, append the voice name so the user always knows who's talking:
```
"That's outside your control. Here's what is." — Stoic
```
Not just on voice switch — on every response. Users forget.

### 3. Distinguish proactive from on-demand
When the proactive engine surfaces an insight (user didn't ask), prefix it differently so the user knows the AI spoke up uninvited:
```
On-demand (user tapped):    "Focus on what you can control."
Proactive (AI initiated):   * "Something just shifted — focus on what you can control."
```
The `*` prefix (or any other marker) builds trust by being transparent about who initiated.

### 4. Show AI call count mid-session
Use the Dashboard API to show session stats while the session is active, not just at end:
```
session.dashboard.content.writeToMain(`${metrics.aiCalls} lenses | ${voice.name}`);
```
Update after each AI call. User can glance at dashboard to see usage.

### 5. Journal persistence — USE SIMPLESTORAGE (confirmed working)
The MentraOS SDK has `SimpleStorage` — a cloud-backed key-value store:
```typescript
// Write (debounced cloud sync to MongoDB)
await session.storage.set('journal', journalData);

// Read (RAM-first, falls back to cloud)
const journal = await session.storage.get('journal');
```
- 1MB total per app/user, 100KB per value
- Persists across sessions automatically
- RAM-first with automatic cloud backup

The journal data (totalLenses, dismissals, streak, 7-day rolling window) is well under 100KB. Replace `loadJournal(settings)` / `writeJournalToDashboard()` with `session.storage.get('journal')` on load and `session.storage.set('journal', journal)` on save.

StarTalk and Negotiator already use this pattern — copy from their implementations.

### 6. Mode tracking
The AI auto-selects modes (direct/translate/reflect/challenge/teach) but we never log which mode was chosen. Add a mode detection pass on the AI response — even simple keyword matching — and track in metrics. This lets us answer: "Is the AI using CHALLENGE too much? Is it never REFLECTing?"

### 7. Sharing a lens
"That Stoic response was perfect — I want to send it to my friend." Use the MentraOS notification API or share intent to send the last response as a text message. The display is text — it's already shareable content.

### 8. Tests
The app has zero tests. Priority test targets:
- `buildSystemPrompt()` — verify world content is injected correctly
- `getAmbientContext()` with recency bias — verify last 15s get 3/4 budget
- `computeSimilarity()` — verify deduplication thresholds
- `validatePhilosophyWorld()` — verify all 10 world files pass validation
- Follow-up window timing (30s)
- Proactive classification pipeline (SILENT on 0-1 signals)

Tests should use the governance engine's built-in testing patterns if available.

---

## Nice-to-Haves

### 9. "Try with our key" onboarding
First 10 activations free with a developer-provided API key. Then require BYO-key. Removes the onboarding wall. Cost: ~$0.01 per new user on Haiku.

### 10. Custom worldfile loading
Not for end users (yet) — but for developers building on the platform. A `loadCustomWorld(path)` function that validates and loads a user-provided `.nv-world.md` file.

### 11. Bystander disclosure UX
The current implementation is a checkbox in Settings. Consider a first-time popup on ambient enable that requires reading + acknowledging specific text, not just toggling a boolean.

---

## What NOT to Change

- BYO-key model — correct for the platform
- Auto-scaling word limits — invisible and right
- Proactive defaults to OFF — correct governance
- No voice switching from hot path — Settings only is correct
- Philosophy worlds as string content (not structured data) — the AI prompt is the right interface; over-structuring would add complexity without benefit
- The worldfile format itself — it's the best idea in the system
