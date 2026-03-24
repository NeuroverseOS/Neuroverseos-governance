---
world_id: mentraos-retail
name: MentraOS Retail — Store AI Glasses Governance
version: 1.0.0
runtime_mode: COMPLIANCE
default_profile: standard
alternative_profile: privacy_enhanced
---

# Thesis

Retail is one of the first industries integrating AI with spatial technology. In China, stores already use computer vision, robotics, and AI-powered customer analytics. Globally, retailers are piloting AR-assisted shopping: point your glasses at a product, see reviews, compare prices, check ingredients. Staff wear AI glasses for inventory management, real-time planogram compliance, and customer service assistance.

The governance problem is two-sided. For shoppers: a retail app that sends everything you look at to an AI for "personalized recommendations" is building a behavioral profile. The AI sees what you browse, how long you look, what you pick up and put back. That data has commercial value, and the shopper may not realize it's being collected. For store staff: AI glasses that track employee movement patterns, monitor "engagement metrics," or score customer interactions create surveillance risks that labor advocates are already pushing back on.

This world governs AI glasses in retail environments — both shopper-facing apps and staff-facing tools. It enforces: what shopping behavior data AI can collect, how product recognition data flows, whether AI can push unsolicited recommendations, and what employee monitoring limits apply. User rules still override everything. This world adds retail-specific constraints.

# Invariants

- `no_behavioral_profiling_without_consent` — AI must not build or contribute to a behavioral profile of the shopper (browsing patterns, dwell times, gaze tracking, purchase correlation) without explicit opt-in consent. Aggregate anonymous analytics are permitted; individual profiling requires consent. (structural, immutable)
- `no_unsolicited_ai_recommendations` — AI must not push product recommendations, promotions, or advertisements to the glasses display unless the user explicitly requested assistance or has opted in to receive suggestions. The user must initiate, not the AI. (structural, immutable)
- `product_data_only` — When scanning products, AI should receive only the product image or barcode data needed for recognition. AI should not receive the shopper's location within the store, their browsing history, or their purchase history as part of a product scan request. (structural, immutable)
- `no_employee_scoring` — For staff-facing tools, AI must not generate employee performance scores, engagement ratings, or behavioral assessments based on glasses data. Inventory counts and planogram data are permitted; employee surveillance is not. (structural, immutable)
- `price_comparison_neutral` — AI price comparison and product information must present factual data. AI must not manipulate comparisons to favor the host retailer's products over competitors. Information must be neutral. (structural, immutable)
- `purchase_data_ephemeral` — What the shopper looked at, considered, and did not buy is not retained after the shopping session. Only completed purchases (if the user opts in) may be retained for receipt/warranty purposes. Browsing data is ephemeral. (structural, immutable)

# State

## product_scans
- type: number
- min: 0
- max: 10000
- step: 1
- default: 0
- label: Product Scans
- description: Number of products scanned or recognized via AI during this session

## behavioral_data_collected
- type: number
- min: 0
- max: 1000
- step: 1
- default: 0
- label: Behavioral Data Points
- description: Number of behavioral data points collected (dwell time, gaze direction, browsing path)

## behavioral_consent_given
- type: number
- min: 0
- max: 1
- step: 1
- default: 0
- label: Behavioral Consent
- description: Whether the shopper has opted in to behavioral data collection (1 = yes, 0 = no)
- mutable: true

## unsolicited_recommendations
- type: number
- min: 0
- max: 100
- step: 1
- default: 0
- label: Unsolicited Recommendations
- description: Number of AI recommendations pushed without user request

## extra_data_in_scans
- type: number
- min: 0
- max: 100
- step: 1
- default: 0
- label: Extra Data in Scans
- description: Number of product scans that included unnecessary shopper data (location, history)

## employee_scores_generated
- type: number
- min: 0
- max: 100
- step: 1
- default: 0
- label: Employee Scores Generated
- description: Number of employee performance scores generated from glasses data

## biased_comparisons
- type: number
- min: 0
- max: 100
- step: 1
- default: 0
- label: Biased Comparisons
- description: Number of price comparisons that favored the host retailer unfairly

## browsing_data_retained
- type: number
- min: 0
- max: 1000
- step: 1
- default: 0
- label: Browsing Data Retained
- description: Browsing data points retained after session end (should be 0)

## user_requested_help
- type: number
- min: 0
- max: 1
- step: 1
- default: 0
- label: User Requested Help
- description: Whether the user has actively requested AI shopping assistance (1 = yes, 0 = no)
- mutable: true

## is_staff_device
- type: number
- min: 0
- max: 1
- step: 1
- default: 0
- label: Staff Device
- description: Whether this is a staff-issued device vs. shopper's personal glasses (1 = staff, 0 = shopper)
- mutable: true

# Assumptions

## standard
- name: Standard Retail Governance
- description: Normal shopping session. Product scans send only product data to AI. No behavioral profiling without consent. No unsolicited recommendations. Browsing data deleted at session end. Employee monitoring restricted to inventory tasks.
- product_scan_policy: product_data_only
- behavioral_policy: consent_required
- recommendation_policy: user_initiated
- retention_policy: ephemeral_browsing
- employee_policy: no_scoring

## privacy_enhanced
- name: Privacy-Enhanced Retail
- description: Maximum shopper privacy. No behavioral data collection under any circumstances. No AI recommendations even if requested (manual browsing only). Product scans processed locally where possible. No data retention of any kind.
- product_scan_policy: local_only
- behavioral_policy: blocked
- recommendation_policy: blocked
- retention_policy: no_retention
- employee_policy: no_scoring

# Rules

## rule-001: Behavioral Profiling Without Consent (structural)
AI collected behavioral data (browsing patterns, dwell times, gaze tracking) without the shopper's opt-in consent.

When behavioral_data_collected > 0 [state] AND behavioral_consent_given == 0 [state]
Then retail_trust *= 0.15
Collapse: retail_trust < 0.10

> trigger: The app's AI collected data about the shopper's browsing behavior — which products they looked at, how long they lingered, their movement path through the store — without the shopper having opted in to behavioral data collection.
> rule: Behavioral profiling is commercially valuable and privacy-invasive. A shopper who scans a product to check its ingredients did not consent to having their entire browsing pattern analyzed. Aggregate anonymous foot traffic data is fine. Individual behavioral profiles require explicit consent.
> shift: Retail trust collapses. App flagged for privacy violation.
> effect: Retail trust reduced to 15%. Near-certain collapse.

## rule-002: Unsolicited AI Recommendations (degradation)
AI pushed product recommendations without the shopper requesting help.

When unsolicited_recommendations > 0 [state] AND user_requested_help == 0 [state]
Then retail_trust *= 0.40

> trigger: The app's AI displayed product recommendations, promotions, or advertisements on the glasses without the shopper having asked for help or opted in to suggestions.
> rule: The user's glasses display is their space. AI should not hijack it with ads disguised as "recommendations." If the user points at a product and asks "what's similar?", recommendations are appropriate. If the user is just walking through the store and the AI starts suggesting products, that's an ad.
> shift: Retail trust drops. App's recommendation capability suspended.
> effect: Retail trust reduced to 40%.

## rule-003: Extra Data in Product Scans (degradation)
Product scan requests included unnecessary shopper data beyond what's needed for product recognition.

When extra_data_in_scans > 0 [state]
Then retail_trust *= 0.50

> trigger: A product scan (barcode or image recognition) request to the AI included the shopper's in-store location, browsing history, previous purchases, or other data not necessary for identifying the product.
> rule: A product scan needs the product image or barcode. It does not need the shopper's GPS position, their path through the store, or what they looked at 5 minutes ago. Bundling extra data into scan requests is over-collection.
> shift: Retail trust degrades. App required to strip extra data from scans.
> effect: Retail trust reduced to 50%.

## rule-004: Employee Surveillance Scoring (structural)
AI generated employee performance scores or behavioral assessments from glasses data.

When employee_scores_generated > 0 [state] AND is_staff_device == 1 [state]
Then retail_trust *= 0.20
Collapse: retail_trust < 0.10

> trigger: A staff-facing AI app used glasses data (movement patterns, customer interaction timing, task completion speed) to generate an employee performance score or behavioral assessment.
> rule: AI glasses for staff are tools for inventory management, planogram compliance, and customer service assistance. They are not surveillance devices. Using glasses data to score employees creates a panopticon workplace that violates labor dignity and, in many jurisdictions, labor law.
> shift: Retail trust drops severely. App's staff features suspended.
> effect: Retail trust reduced to 20%.

## rule-005: Biased Price Comparisons (degradation)
AI price comparisons favored the host retailer's products over competitors.

When biased_comparisons > 0 [state]
Then retail_trust *= 0.55

> trigger: AI presented price comparisons or product alternatives that systematically favored the host retailer's own brands or products, suppressed better-priced competitors, or manipulated comparison criteria to make the host's products appear superior.
> rule: If an app offers price comparison, it must be neutral. A shopper using AI glasses to compare prices trusts the AI to show real data. Manipulating comparisons to favor the store the app is affiliated with is deceptive. The shopper deserves honest information.
> shift: Retail trust degrades. App's comparison feature marked as biased.
> effect: Retail trust reduced to 55%.

## rule-006: Browsing Data Retained After Session (structural)
Shopper browsing data was retained after the shopping session ended.

When browsing_data_retained > 0 [state]
Then retail_trust *= 0.25
Collapse: retail_trust < 0.10

> trigger: After the shopping session ended, the app or its AI retained data about what the shopper looked at, considered, or browsed — products viewed but not purchased, sections visited, dwell times.
> rule: What you looked at and didn't buy is private. It reveals interest, hesitation, budget constraints, and preferences. This data must be deleted when the session ends. Only completed purchases (with user opt-in) may be retained for receipts or warranties.
> shift: Retail trust drops severely. Data deletion verification required.
> effect: Retail trust reduced to 25%.

## rule-007: Clean Shopping Session (advantage)
Shopper used AI glasses for product scanning with full privacy compliance — no profiling, no unsolicited ads, no retained browsing data.

When product_scans > 0 [state] AND behavioral_data_collected == 0 [state] AND unsolicited_recommendations == 0 [state] AND browsing_data_retained == 0 [state]
Then retail_trust *= 1.12

> trigger: Active shopping session with product scans and zero privacy violations.
> rule: An AI shopping assistant that helps without surveilling earns trust. Scan products, show info, delete everything after. This is how retail AI should work — useful without being invasive.
> shift: Retail trust improves. App earns privacy-compliant retail badge.
> effect: Retail trust boosted by 12%.

## rule-008: User-Initiated Recommendations (advantage)
AI provided recommendations only when the shopper explicitly asked for help.

When user_requested_help == 1 [state] AND unsolicited_recommendations == 0 [state] AND product_scans > 0 [state]
Then retail_trust *= 1.10

> trigger: Shopper explicitly requested assistance and all AI recommendations were in response to that request.
> rule: The right model: user asks, AI answers. No ambient suggestions, no push notifications, no "you might also like." When the user initiates, the AI serves.
> shift: Retail trust improves. App demonstrates respectful recommendation pattern.
> effect: Retail trust boosted by 10%.

# Gates

- TRUSTED: retail_trust >= 90
- OPERATING: retail_trust >= 60
- CAUTIOUS: retail_trust >= 35
- RESTRICTED: retail_trust > 10
- BANNED: retail_trust <= 10

# Outcomes

## retail_trust
- type: number
- range: 0-100
- display: percentage
- label: Retail Trust Score
- primary: true

## behavioral_data_collected
- type: number
- range: 0-1000
- display: integer
- label: Behavioral Data Points

## unsolicited_recommendations
- type: number
- range: 0-100
- display: integer
- label: Unsolicited Recommendations

## employee_scores_generated
- type: number
- range: 0-100
- display: integer
- label: Employee Scores Generated

## browsing_data_retained
- type: number
- range: 0-1000
- display: integer
- label: Browsing Data Retained
