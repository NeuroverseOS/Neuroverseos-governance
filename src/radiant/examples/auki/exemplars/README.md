# Auki Exemplars

**Worked examples of the vanguard leadership model being implemented in practice.**

These are not the worldmodel. They are not the lens. They are **reference material** — specific instances of what the vanguard model produces when it runs on real strategic material.

## Role of exemplars

Three uses:

1. **Voice calibration for the lens** — when the `aukiBuilderLens` applies its voice / framing / vocabulary rules, these exemplars are the ground-truth reference. Output produced through the lens should fall in the same neighborhood as these, not match them verbatim.

2. **Few-shot grounding for the AI prompt** — the `neuroverse radiant think` / `emergent` / `decision` commands can include snippets from these exemplars in the system prompt to anchor voice and reasoning pattern.

3. **Evaluation baselines** — when testing Radiant's output against Auki's real repos, compare the output to these exemplars. Does the new output read as "vanguard being implemented" the way these do? If yes, the system is aligned. If not, tune the lens.

## The three-domain framing (internal-only vocabulary)

The vanguard model — Future Foresight, Narrative Dynamics, Shared Prosperity — is the **model-maker's internal scaffold**. Readers of Radiant's output never see those bucket names. They see the specific skills inside each bucket (strategic thinking, storytelling, partnership development, etc.) and the plain-English overlap states (Inspiration, Trust, Hope).

Each exemplar below is annotated with which domains it exhibits, for calibration purposes. This annotation is for the lens-tuning developer, not the end reader.

## The exemplars

| File | What it is | Domains exhibited | Integration quality |
|---|---|---|---|
| `intercognitive-foundation.md` | The Intercognitive Foundation announcement | All three integrated | **Full** — Collective Vanguard Leader manifests through the coalition itself |
| `hybrid-robotics-essay.md` | The Case for Hybrid Robotics | Future Foresight (dominant), Shared Prosperity (secondary) | Partial — Hope emergent state (long-horizon infrastructure for collective benefit) |
| `glossary.md` | Auki technical glossary | Future Foresight (dominant), Shared Prosperity (implicit via openness) | Primary-dominant — foundation-laying definitions |
| `year-recap-2025.md` | Auki 2025 year-end retrospective | Narrative Dynamics (dominant), Shared Prosperity (strong) | Partial — Trust emergent state (stakeholders see their place in collective progress) |
| `vanguard-diagram.md` | Kirsten's original vanguard model diagram + skill lists | Defines the model | N/A — this is the scaffold itself |

**Note on content.** The markdown files here carry summaries and excerpts, not full copies of each source where copyright is ambiguous. Full texts can be added where explicitly authorized. The summaries are enough for the AI-prompt few-shot use and the voice-calibration use.

## Adding new exemplars

When new Auki writing emerges (strategy memos, new blog posts, retrospectives, important Slack threads), drop it into this directory. The lens's `exemplar_refs` list should be updated to include the new file, annotated with which domains it exhibits and what it teaches for lens calibration.

Over time this corpus grows. The worldmodel stays stable. The lens can be re-tuned against the expanded corpus without rewriting the fundamentals.
