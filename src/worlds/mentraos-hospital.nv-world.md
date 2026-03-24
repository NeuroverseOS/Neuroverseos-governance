---
world_id: mentraos-hospital
name: MentraOS Hospital — Clinical AI Glasses Governance
version: 1.0.0
runtime_mode: COMPLIANCE
default_profile: clinical
alternative_profile: emergency
---

# Thesis

Doctors are integrating AI glasses into clinical workflows. A surgeon wears smart glasses that overlay patient vitals during a procedure. A resident uses AI transcription to generate clinical notes from patient conversations. A radiologist views AI-analyzed imaging results on their display while reviewing scans. These are not hypothetical — hospitals are piloting AI glasses in the US, Europe, and Asia right now.

The governance challenge is specific: patient data is regulated (HIPAA in the US, GDPR in the EU), clinical AI must not hallucinate treatment recommendations, and every data access must produce an audit trail. A doctor's AI glasses that send patient transcription to OpenAI's public API just violated HIPAA. An AI that auto-orders medication without the doctor confirming on their display just committed a medical error.

This world governs AI glasses in clinical environments. It layers on top of the user's personal rules and the platform world. It adds institutional constraints: which AI endpoints are approved by the hospital IT, what patient data can be processed, and what clinical actions require physician confirmation. The hospital's rules compose with the user's rules — most restrictive wins, as always.

# Invariants

- `patient_data_stays_in_network` — Patient health information (PHI) must never be sent to AI endpoints outside the hospital's approved network. All AI processing of patient data must use hospital-sanctioned endpoints (on-premise or BAA-covered cloud). (structural, immutable)
- `no_ai_clinical_orders` — AI must never create, modify, or submit clinical orders (medications, procedures, lab tests) without explicit physician confirmation on the glasses display. Display-then-confirm is mandatory, no exceptions. (structural, immutable)
- `every_record_access_logged` — Every access to patient records through the glasses must produce an audit entry: who accessed what, when, for which patient, and what data was sent to AI. No silent access. (structural, immutable)
- `ai_cannot_diagnose` — AI can suggest differential diagnoses for the physician to consider. AI must never present a diagnosis as definitive or final. All AI clinical suggestions must be labeled as "AI suggestion — physician review required." (structural, immutable)
- `no_patient_images_retained` — Camera-captured patient images (wounds, surgical field, skin conditions) must not be retained by the AI provider after the clinical session ends unless explicitly saved to the patient's medical record through the hospital's EHR system. (structural, immutable)
- `non_staff_data_isolation` — If the glasses camera or microphone captures data about non-patients (visitors, other patients in shared rooms), that data must be excluded from AI processing. AI should only process data about the physician's assigned patient. (structural, immutable)

# State

## phi_data_sends
- type: number
- min: 0
- max: 100000
- step: 1
- default: 0
- label: PHI Data Sends
- description: Number of times patient health information was sent to an AI endpoint

## phi_sends_unapproved
- type: number
- min: 0
- max: 100
- step: 1
- default: 0
- label: Unapproved PHI Sends
- description: Number of times PHI was sent to an AI endpoint not on the hospital's approved list

## clinical_orders_attempted
- type: number
- min: 0
- max: 1000
- step: 1
- default: 0
- label: Clinical Orders Attempted
- description: Number of times AI attempted to create or modify a clinical order

## clinical_orders_unconfirmed
- type: number
- min: 0
- max: 100
- step: 1
- default: 0
- label: Unconfirmed Clinical Orders
- description: Clinical orders AI attempted without physician display confirmation

## record_accesses
- type: number
- min: 0
- max: 10000
- step: 1
- default: 0
- label: Record Accesses
- description: Number of patient record accesses through the glasses

## record_accesses_unlogged
- type: number
- min: 0
- max: 100
- step: 1
- default: 0
- label: Unlogged Record Accesses
- description: Record accesses that failed to produce an audit entry

## ai_diagnosis_presented
- type: number
- min: 0
- max: 1000
- step: 1
- default: 0
- label: AI Diagnoses Presented
- description: Number of times AI presented diagnostic suggestions

## ai_diagnosis_unlabeled
- type: number
- min: 0
- max: 100
- step: 1
- default: 0
- label: Unlabeled AI Diagnoses
- description: AI diagnostic suggestions presented without "AI suggestion" label

## patient_images_retained
- type: number
- min: 0
- max: 100
- step: 1
- default: 0
- label: Patient Images Retained
- description: Patient images retained by AI provider outside the hospital EHR

## session_patient_id
- type: enum
- options: assigned, unassigned
- default: unassigned
- label: Session Patient Assignment
- description: Whether the current session is assigned to a specific patient
- mutable: true

# Assumptions

## clinical
- name: Standard Clinical Operation
- description: Normal clinical workflow. Physician is assigned a patient. AI can process transcription and images through hospital-approved endpoints only. All record accesses logged. Clinical orders require display confirmation. AI suggestions labeled. Patient images deleted after session unless saved to EHR.
- phi_policy: approved_endpoints_only
- order_policy: display_then_confirm
- audit_policy: mandatory_logging
- ai_suggestion_policy: labeled_as_suggestion
- image_retention_policy: delete_after_session
- network_policy: hospital_network_only

## emergency
- name: Emergency Clinical Operation
- description: Emergency situations where speed matters. AI can process through approved endpoints without per-send confirmation (but still logged). Clinical orders still require physician confirmation — there is no scenario where AI should auto-order medication. Image retention relaxed for trauma documentation. All other constraints remain.
- phi_policy: approved_endpoints_auto
- order_policy: display_then_confirm
- audit_policy: mandatory_logging
- ai_suggestion_policy: labeled_as_suggestion
- image_retention_policy: session_plus_trauma_hold
- network_policy: hospital_network_only

# Rules

## rule-001: PHI to Unapproved Endpoint (structural)
Patient data was sent to an AI endpoint not on the hospital's approved list. This is a HIPAA violation.

When phi_sends_unapproved > 0 [state]
Then compliance_trust *= 0.05
Collapse: compliance_trust < 0.10

> trigger: App sent patient health information (transcription containing symptoms, diagnoses, medications; or patient images) to an AI API endpoint not on the hospital IT department's approved list.
> rule: Hospitals maintain a list of AI endpoints that have Business Associate Agreements (BAA) and meet security requirements. Sending PHI to any other endpoint — including OpenAI's public API, free translation services, or any unlisted provider — is a HIPAA violation subject to fines up to $1.5M per incident.
> shift: Compliance trust collapses immediately. Incident reported to compliance officer.
> effect: Compliance trust reduced to 5%. Immediate collapse.

## rule-002: Unconfirmed Clinical Order (structural)
AI attempted to create or submit a clinical order without the physician confirming on their glasses display.

When clinical_orders_unconfirmed > 0 [state]
Then compliance_trust *= 0.10
Collapse: compliance_trust < 0.10

> trigger: AI attempted to submit a medication order, lab order, imaging order, or procedure order without the physician first seeing the order on their glasses display and explicitly confirming.
> rule: Clinical orders are physician decisions with direct patient safety implications. An AI that auto-orders the wrong medication can harm or kill a patient. The physician must see the exact order — drug name, dose, route, frequency — on their glasses display and confirm before submission. There is zero tolerance for unconfirmed orders.
> shift: Compliance trust collapses. App's clinical order capability permanently revoked.
> effect: Compliance trust reduced to 10%. Immediate collapse.

## rule-003: Unlogged Record Access (structural)
Patient record was accessed through the glasses without producing an audit entry.

When record_accesses_unlogged > 0 [state]
Then compliance_trust *= 0.25
Collapse: compliance_trust < 0.10

> trigger: A patient record was accessed or displayed on the glasses but no audit entry was written to the hospital's audit log.
> rule: HIPAA requires an audit trail of all PHI access. Every time patient data appears on the glasses — a lab result, a medication list, a clinical note — that access must be logged with the physician's ID, the patient's ID, the timestamp, and what was accessed.
> shift: Compliance trust drops severely. Audit gap flagged for compliance review.
> effect: Compliance trust reduced to 25%.

## rule-004: Unlabeled AI Diagnosis (degradation)
AI presented a diagnostic suggestion without labeling it as an AI suggestion.

When ai_diagnosis_unlabeled > 0 [state]
Then compliance_trust *= 0.50

> trigger: AI displayed a differential diagnosis, treatment suggestion, or clinical recommendation on the glasses without clearly marking it as "AI suggestion — physician review required."
> rule: Physicians must know what comes from AI versus what comes from the patient's medical record. An unlabeled AI suggestion could be mistaken for an established diagnosis, leading to incorrect treatment decisions. Every AI-generated clinical suggestion must be visually distinct and labeled.
> shift: Compliance trust degrades. App required to add AI suggestion labels.
> effect: Compliance trust reduced to 50%.

## rule-005: Patient Image Retained Outside EHR (degradation)
A patient image captured by the glasses was retained by the AI provider instead of being deleted after the session.

When patient_images_retained > 0 [state]
Then compliance_trust *= 0.40

> trigger: A camera-captured patient image (wound photo, surgical field, dermatological image) was retained by the AI provider's servers after the clinical session ended, without being saved to the patient's record through the hospital's EHR system.
> rule: Patient images are PHI. AI providers should process them and return results, not store them. If a physician wants to keep an image, it goes in the patient's EHR through the hospital's approved workflow — not on OpenAI's servers.
> shift: Compliance trust degrades. AI provider's image handling under review.
> effect: Compliance trust reduced to 40%.

## rule-006: Clean Clinical Session (advantage)
Physician used AI glasses for clinical workflow with full compliance — approved endpoints, confirmed orders, complete audit trail.

When phi_data_sends > 0 [state] AND phi_sends_unapproved == 0 [state] AND clinical_orders_unconfirmed == 0 [state] AND record_accesses_unlogged == 0 [state] AND ai_diagnosis_unlabeled == 0 [state]
Then compliance_trust *= 1.15

> trigger: Active clinical session with AI usage and zero compliance violations.
> rule: A clean clinical session proves that AI glasses can be used safely in healthcare. Every PHI send went to an approved endpoint. Every order was physician-confirmed. Every access was logged. Every AI suggestion was labeled. This is the model for clinical AI governance.
> shift: Compliance trust improves. Department's AI adoption score increases.
> effect: Compliance trust boosted by 15%.

# Gates

- COMPLIANT: compliance_trust >= 90
- OPERATIONAL: compliance_trust >= 60
- REVIEW_REQUIRED: compliance_trust >= 30
- SUSPENDED: compliance_trust > 10
- VIOLATION: compliance_trust <= 10

# Outcomes

## compliance_trust
- type: number
- range: 0-100
- display: percentage
- label: Compliance Trust Score
- primary: true

## phi_sends_unapproved
- type: number
- range: 0-100
- display: integer
- label: Unapproved PHI Sends

## clinical_orders_unconfirmed
- type: number
- range: 0-100
- display: integer
- label: Unconfirmed Clinical Orders

## record_accesses_unlogged
- type: number
- range: 0-100
- display: integer
- label: Unlogged Record Accesses
