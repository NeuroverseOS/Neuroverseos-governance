/**
 * Example: a clinic, built without a template. Everything is declared by
 * hand — its own kinds of actions (deliver_meds), its own facts
 * (patient_present, ward_status), its own authorities — to show the model
 * is not tied to stores or to any fixed list of things.
 */

import { compileDomain } from '../src/index';
import type { CompileDomainInput, DomainRequest } from '../src/index';

export const clinic: CompileDomainInput = {
  site: { id: 'example-clinic-01', name: 'Example Clinic' },
  kinds: ['robot', 'person'],
  authorities: [
    { id: 'regulator', name: 'Health regulator' },
    { id: 'clinic', name: 'Clinic management' },
    { id: 'charge-nurse', name: 'Charge nurse' },
  ],
  actions: [
    { id: 'deliver_meds', name: 'deliver medication', kinds: ['robot'], tags: ['handling'] },
    { id: 'move', name: 'move', kinds: ['robot'], tags: ['movement'] },
    { id: 'enter', name: 'enter', kinds: ['robot', 'person'], tags: ['movement'] },
    { id: 'clean', name: 'clean', kinds: ['robot'] },
    { id: 'visit', name: 'visit a patient', kinds: ['person'] },
    { id: 'camera_capture', name: 'take photos or video', kinds: ['person'], tags: ['capture'] },
  ],
  facts: [
    { id: 'patient_present', type: 'boolean', required: true, description: 'A patient is in the area.' },
    { id: 'ward_status', type: 'enum', values: ['open', 'quiet', 'isolation'], default: 'open' },
    { id: 'localTime', type: 'time', required: true },
    { id: 'requestedSpeedMps', type: 'number', min: 0 },
  ],
  limits: [{ id: 'maxSpeedMps', unit: 'm/s', requestedFact: 'requestedSpeedMps', appliesTo: 'tag:movement' }],
  tags: { areas: ['ward', 'restricted'], roles: ['staff'] },
  areas: [
    { id: 'ward-a', name: 'Ward A', tags: ['ward'] },
    { id: 'ward-b', name: 'Ward B', tags: ['ward'] },
    { id: 'pharmacy', name: 'Pharmacy', tags: ['restricted'], allowRoles: ['pharmacist', 'med_robot'] },
    { id: 'corridor', name: 'Corridor' },
  ],
  roles: [
    { id: 'med_robot', name: 'Medication robot', kind: 'robot', actions: ['deliver_meds', 'move', 'enter'] },
    { id: 'clean_robot', name: 'Cleaning robot', kind: 'robot', actions: ['clean', 'move', 'enter'] },
    { id: 'nurse', name: 'Nurse', kind: 'person', actions: ['enter', 'visit', 'camera_capture'], tags: ['staff'] },
    { id: 'pharmacist', name: 'Pharmacist', kind: 'person', actions: ['enter'], tags: ['staff'] },
    { id: 'visitor', name: 'Visitor', kind: 'person', actions: ['enter', 'visit'] },
  ],
  rules: [
    { id: 'no_visitors_in_isolation', never: true, setBy: 'regulator', text: 'Visitors never enter a ward in isolation.',
      who: ['kind:person', '!tag:staff'], does: '*', where: 'tag:ward', when: [{ fact: 'ward_status', op: '==', value: 'isolation' }], then: { answer: 'deny' },
      source: { kind: 'manual', ref: 'infection-control' } },
    { id: 'no_photos_in_wards', setBy: 'regulator', text: 'No photos or video in wards.',
      who: '*', does: 'tag:capture', where: 'tag:ward', then: { answer: 'deny' }, source: { kind: 'manual', ref: 'privacy' } },
    { id: 'meds_need_pharmacist', setBy: 'clinic', text: 'A medication robot delivers only with a pharmacist\'s approval.',
      who: 'med_robot', does: 'deliver_meds', where: '*', then: { answer: 'wait', for: 'approval', by: 'pharmacist' }, source: { kind: 'manual', ref: 'meds-policy' } },
    { id: 'quiet_hours', setBy: 'clinic', text: 'Robots do not move through wards between 22:00 and 06:00.',
      who: 'kind:robot', does: 'tag:movement', where: 'tag:ward', when: [{ fact: 'localTime', op: 'between', from: '22:00', to: '06:00' }], then: { answer: 'deny' }, source: { kind: 'manual', ref: 'quiet-hours' } },
    { id: 'robots_slow_in_wards', setBy: 'clinic', text: 'Robots move at most 0.5 m/s in wards.',
      who: 'kind:robot', does: 'tag:movement', where: 'tag:ward', then: { answer: 'limit', limits: { maxSpeedMps: 0.5 } }, source: { kind: 'manual', ref: 'safety' } },
    { id: 'robots_wait_for_patients', setBy: 'charge-nurse', text: 'Robots wait outside a ward while a patient is being seen there.',
      who: 'kind:robot', does: '*', where: 'tag:ward', when: [{ fact: 'patient_present', op: '==', value: true }], then: { answer: 'wait', for: 'condition' }, source: { kind: 'manual', ref: 'ward-round' } },
    // The charge nurse tries to let the cleaning robot through quiet hours — a lower authority cannot loosen the clinic's rule.
    { id: 'night_cleaning', setBy: 'charge-nurse', text: 'The cleaning robot may move through wards at night.',
      who: 'clean_robot', does: 'move', where: 'tag:ward', when: [{ fact: 'localTime', op: 'between', from: '23:00', to: '05:00' }], then: { answer: 'allow' }, source: { kind: 'manual', ref: 'night-shift' } },
  ],
};

export const rulebook = compileDomain(clinic);

const med = { id: 'm-1', kind: 'robot', roleId: 'med_robot' };
const f = (localTime: string, extra: Record<string, unknown> = {}) => ({ localTime, patient_present: false, ...extra });

export const day: Array<[string, DomainRequest]> = [
  ['Medication robot wants to deliver in Ward A', { participant: med, action: 'deliver_meds', areaId: 'ward-a', facts: f('09:00') }],
  ['…a nurse approves (not a pharmacist)', { participant: med, action: 'deliver_meds', areaId: 'ward-a', facts: f('09:01', { approvedBy: { id: 'nurse-lee', roleId: 'nurse' } }) }],
  ['…the pharmacist approves', { participant: med, action: 'deliver_meds', areaId: 'ward-a', facts: f('09:02', { approvedBy: { id: 'pharm-kim', roleId: 'pharmacist' } }) }],
  ['A patient is being seen in Ward B', { participant: med, action: 'enter', areaId: 'ward-b', facts: f('10:00', { patient_present: true, requestedSpeedMps: 0.4 }) }],
  ['Cleaning robot through Ward A at midnight (the nurse said yes; the clinic said no)', { participant: { id: 'c-1', kind: 'robot', roleId: 'clean_robot' }, action: 'move', areaId: 'ward-a', facts: f('00:30', { requestedSpeedMps: 0.3 }) }],
  ['Visitor enters Ward B in isolation', { participant: { id: 'v-1', kind: 'person', roleId: 'visitor' }, action: 'enter', areaId: 'ward-b', facts: f('11:00', { ward_status: 'isolation' }) }],
  ['Nurse takes a photo in Ward A', { participant: { id: 'n-1', kind: 'person', roleId: 'nurse' }, action: 'camera_capture', areaId: 'ward-a', facts: f('11:30') }],
  ['A request without patient_present (never permission)', { participant: med, action: 'move', areaId: 'ward-a', facts: { localTime: '12:00' } }],
];
