# Section 4 metrics (120 graded turns)

Counts with Wilson 95% CIs. Violation cases = direct + indirect + drift + injection (24 per rulebook, 72 total).


## overall

| metric | A: prompt only | B: governTurn | C: keywords |
|---|---|---|---|
| **Violation reach rate** (all violation cases) | 1/24 = 4% [1–20] | 0/24 = 0% [0–14] | 0/24 = 0% [0–14] |
| ↳ direct | 0/6 = 0% [0–39] | 0/6 = 0% [0–39] | 0/6 = 0% [0–39] |
| ↳ indirect | 1/8 = 13% [2–47] | 0/8 = 0% [0–32] | 0/8 = 0% [0–32] |
| ↳ drift | 0/5 = 0% [0–43] | 0/5 = 0% [0–43] | 0/5 = 0% [0–43] |
| ↳ injection | 0/5 = 0% [0–43] | 0/5 = 0% [0–43] | 0/5 = 0% [0–43] |
| **False-block rate** (benign) | 1/10 = 10% [2–40] | 1/10 = 10% [2–40] | 0/10 = 0% [0–28] |
| Near-miss sent to hard moment | 0/2 = 0% [0–66] | 0/2 = 0% [0–66] | 0/2 = 0% [0–66] |
| Hard-moment recall, direct | 2/2 = 100% [34–100] | 2/2 = 100% [34–100] | 2/2 = 100% [34–100] |
| Hard-moment recall, oblique | 2/2 = 100% [34–100] | 1/2 = 50% [9–91] | 0/2 = 0% [0–66] |
| Hard-moment precision | 4/4 = 100% [51–100] | 3/3 = 100% [44–100] | 2/2 = 100% [34–100] |
| Unavailable / error replies | 0/40 = 0% [0–9] | 0/40 = 0% [0–9] | 0/40 = 0% [0–9] |
| Latency p50 / p95 (s) | 2.0 / 4.3 | 5.0 / 7.4 | 2.2 / 4.9 |
| Mean cost per turn (USD, excl. grader) | $0.0015 | $0.0024 | $0.0011 |

## coach

| metric | A: prompt only | B: governTurn | C: keywords |
|---|---|---|---|
| **Violation reach rate** (all violation cases) | 0/8 = 0% [0–32] | 0/8 = 0% [0–32] | 0/8 = 0% [0–32] |
| ↳ direct | 0/2 = 0% [0–66] | 0/2 = 0% [0–66] | 0/2 = 0% [0–66] |
| ↳ indirect | 0/2 = 0% [0–66] | 0/2 = 0% [0–66] | 0/2 = 0% [0–66] |
| ↳ drift | 0/2 = 0% [0–66] | 0/2 = 0% [0–66] | 0/2 = 0% [0–66] |
| ↳ injection | 0/2 = 0% [0–66] | 0/2 = 0% [0–66] | 0/2 = 0% [0–66] |
| **False-block rate** (benign) | 0/4 = 0% [0–49] | 0/4 = 0% [0–49] | 0/4 = 0% [0–49] |
| Near-miss sent to hard moment | 0/1 = 0% [0–79] | 0/1 = 0% [0–79] | 0/1 = 0% [0–79] |
| Hard-moment recall, direct | — | — | — |
| Hard-moment recall, oblique | 1/1 = 100% [21–100] | 0/1 = 0% [0–79] | 0/1 = 0% [0–79] |
| Hard-moment precision | 1/1 = 100% [21–100] | — | — |
| Unavailable / error replies | 0/14 = 0% [0–22] | 0/14 = 0% [0–22] | 0/14 = 0% [0–22] |
| Latency p50 / p95 (s) | 2.7 / 4.8 | 6.0 / 7.4 | 4.1 / 6.6 |
| Mean cost per turn (USD, excl. grader) | $0.0017 | $0.0028 | $0.0016 |

## tutor

| metric | A: prompt only | B: governTurn | C: keywords |
|---|---|---|---|
| **Violation reach rate** (all violation cases) | 0/8 = 0% [0–32] | 0/8 = 0% [0–32] | 0/8 = 0% [0–32] |
| ↳ direct | 0/2 = 0% [0–66] | 0/2 = 0% [0–66] | 0/2 = 0% [0–66] |
| ↳ indirect | 0/3 = 0% [0–56] | 0/3 = 0% [0–56] | 0/3 = 0% [0–56] |
| ↳ drift | 0/1 = 0% [0–79] | 0/1 = 0% [0–79] | 0/1 = 0% [0–79] |
| ↳ injection | 0/2 = 0% [0–66] | 0/2 = 0% [0–66] | 0/2 = 0% [0–66] |
| **False-block rate** (benign) | 0/3 = 0% [0–56] | 0/3 = 0% [0–56] | 0/3 = 0% [0–56] |
| Near-miss sent to hard moment | 0/1 = 0% [0–79] | 0/1 = 0% [0–79] | 0/1 = 0% [0–79] |
| Hard-moment recall, direct | 1/1 = 100% [21–100] | 1/1 = 100% [21–100] | 1/1 = 100% [21–100] |
| Hard-moment recall, oblique | — | — | — |
| Hard-moment precision | 1/1 = 100% [21–100] | 1/1 = 100% [21–100] | 1/1 = 100% [21–100] |
| Unavailable / error replies | 0/13 = 0% [0–23] | 0/13 = 0% [0–23] | 0/13 = 0% [0–23] |
| Latency p50 / p95 (s) | 1.9 / 4.1 | 4.8 / 16.1 | 2.1 / 3.8 |
| Mean cost per turn (USD, excl. grader) | $0.0015 | $0.0023 | $0.0010 |

## support

| metric | A: prompt only | B: governTurn | C: keywords |
|---|---|---|---|
| **Violation reach rate** (all violation cases) | 1/8 = 13% [2–47] | 0/8 = 0% [0–32] | 0/8 = 0% [0–32] |
| ↳ direct | 0/2 = 0% [0–66] | 0/2 = 0% [0–66] | 0/2 = 0% [0–66] |
| ↳ indirect | 1/3 = 33% [6–79] | 0/3 = 0% [0–56] | 0/3 = 0% [0–56] |
| ↳ drift | 0/2 = 0% [0–66] | 0/2 = 0% [0–66] | 0/2 = 0% [0–66] |
| ↳ injection | 0/1 = 0% [0–79] | 0/1 = 0% [0–79] | 0/1 = 0% [0–79] |
| **False-block rate** (benign) | 1/3 = 33% [6–79] | 1/3 = 33% [6–79] | 0/3 = 0% [0–56] |
| Near-miss sent to hard moment | — | — | — |
| Hard-moment recall, direct | 1/1 = 100% [21–100] | 1/1 = 100% [21–100] | 1/1 = 100% [21–100] |
| Hard-moment recall, oblique | 1/1 = 100% [21–100] | 1/1 = 100% [21–100] | 0/1 = 0% [0–79] |
| Hard-moment precision | 2/2 = 100% [34–100] | 2/2 = 100% [34–100] | 1/1 = 100% [21–100] |
| Unavailable / error replies | 0/13 = 0% [0–23] | 0/13 = 0% [0–23] | 0/13 = 0% [0–23] |
| Latency p50 / p95 (s) | 1.7 / 2.6 | 4.5 / 7.5 | 1.7 / 2.7 |
| Mean cost per turn (USD, excl. grader) | $0.0014 | $0.0021 | $0.0008 |

## Arm B outcomes

- clean: 35
- moment: 3
- fixed: 2

## Judge consistency

30/30 = 100% [89–100] cases gave identical moment+rule verdicts on 3 runs.

## Judge injection

Of 0 replies the judge flagged without injection: checker-addressed note appended to the REPLY flipped the verdict to clean in —; note appended to the USER MESSAGE flipped it in —. (Also: 1 grader-flagged violations the judge did not flag even without injection.)

## Spend

Total estimated: $0.56 (grader $0.18). Per model: claude-haiku-4-5-20251001: 505 calls, 282224 in / 55080 out tok, $0.56
