/**
 * Template: warehouse — forklift-style robots in aisles, pickers wearing
 * smart glasses. Small on purpose: it exists to prove the model is generic.
 *
 * Which authority sets which rule:
 *   law-and-safety  aisle exclusivity, robot speed, emergencies
 *   company         robots per aisle, dock access, glasses capture
 *   site-manager    area declarations, the manager's own rules
 *   staff           rules staff may add (none by default)
 */

import type { Template } from './template';

export const WAREHOUSE: Template = {
  id: 'warehouse',
  name: 'Warehouse',
  description: 'Forklift-style robots in aisles; pickers wearing smart glasses.',
  kinds: ['robot', 'person'],
  authorities: [
    { id: 'law-and-safety', name: 'Law and safety' },
    { id: 'company', name: 'Company' },
    { id: 'site-manager', name: 'Site manager' },
    { id: 'staff', name: 'Staff' },
  ],
  actions: [
    { id: 'enter', name: 'enter an area', kinds: ['robot', 'person'], tags: ['movement'], synonyms: ['enter', 'go into', 'drive into'], effects: [{ op: 'move' }] },
    { id: 'move', name: 'move', kinds: ['robot'], tags: ['movement'], synonyms: ['drive', 'travel'] },
    { id: 'lift', name: 'lift a load', kinds: ['robot'], tags: ['handling'], synonyms: ['lift', 'carry', 'raise'] },
    { id: 'dock', name: 'dock', kinds: ['robot'], tags: ['movement'], synonyms: ['dock', 'charge'], effects: [{ op: 'move' }] },
    { id: 'pick', name: 'pick an order', kinds: ['person'], synonyms: ['pick', 'pick orders'] },
    { id: 'camera_capture', name: 'take photos or video', kinds: ['person'], tags: ['capture'], synonyms: ['take photos', 'photograph', 'film', 'record video'] },
    { id: 'command_robot', name: 'command robots', kinds: ['person'], requires: ['targetRobotId'], synonyms: ['command robots', 'control robots'] },
  ],
  facts: [
    { id: 'peopleInArea', type: 'number', integer: true, min: 0, required: true, description: 'People in the area, as the spatial system reports.', synonyms: ['people', 'people present', 'pickers present'] },
    { id: 'robotsInArea', type: 'number', integer: true, min: 0, required: true, description: 'Robots already in the area (not counting the one asking).', synonyms: ['robots', 'robots present', 'robots in the aisle'] },
    { id: 'localTime', type: 'time', required: true, synonyms: ['time'] },
    { id: 'emergency', type: 'boolean', default: false, synonyms: ['emergency', 'alarm'] },
    { id: 'requestedSpeedMps', type: 'number', min: 0 },
    { id: 'targetRobotId', type: 'string' },
  ],
  limits: [
    { id: 'maxSpeedMps', name: 'top speed', unit: 'm/s', requestedFact: 'requestedSpeedMps', appliesTo: 'tag:movement', synonyms: ['speed', 'slow', 'slow down', 'max speed'] },
  ],
  tags: {
    actions: ['movement', 'handling', 'capture'],
    areas: ['aisle', 'dock', 'office', 'staff-only'],
    roles: ['staff', 'picker'],
  },
  otherwise: 'deny',
  questions: [
    {
      id: 'aisle_exclusivity', setBy: 'law-and-safety', governs: 'robots',
      prompt: 'When a picker is in an aisle, what do robots do there?',
      defaultIndex: 0,
      options: [
        { value: 'wait', label: 'Wait until the aisle is clear', rule: 'Robots wait outside an aisle while a person is in it.',
          rules: () => [{ id: 'aisle_exclusivity', text: 'Robots wait outside an aisle while a person is in it.', who: 'kind:robot', does: ['*', '!dock'], where: 'tag:aisle', when: [{ fact: 'peopleInArea', op: '>', value: 0 }], then: { answer: 'wait', for: 'condition' }, reason: 'A person is in the aisle; robots wait until it is clear.' }] },
        { value: 'slow', label: 'Slow to 0.3 m/s', rule: 'Robots slow to 0.3 m/s while a person is in the aisle.',
          rules: () => [{ id: 'aisle_exclusivity', text: 'Robots slow to 0.3 m/s while a person is in the aisle.', who: 'kind:robot', does: 'tag:movement', where: 'tag:aisle', when: [{ fact: 'peopleInArea', op: '>', value: 0 }], then: { answer: 'limit', limits: { maxSpeedMps: 0.3 } }, reason: 'A person is in the aisle; robots slow down.' }] },
        { value: 'share', label: 'Carry on', rule: 'Robots and pickers share aisles at normal speed.' },
      ],
    },
    {
      id: 'max_robots_per_aisle', setBy: 'company', governs: 'robots',
      prompt: 'How many robots may be in one aisle at once?',
      defaultIndex: 0,
      options: ['1', '2', '3'].map(n => ({
        value: n, label: n, rule: `At most ${n} robot${n === '1' ? '' : 's'} in an aisle at once.`,
        rules: () => [{ id: 'max_robots_per_aisle', text: `At most ${n} robot${n === '1' ? '' : 's'} in an aisle at once.`, who: 'kind:robot', does: 'enter', where: 'tag:aisle', when: [{ fact: 'robotsInArea', op: '>=', value: Number(n) }], then: { answer: 'wait', for: 'condition' }, reason: `The aisle already has ${n} robot${n === '1' ? '' : 's'}; wait for one to leave.` }],
      })),
    },
    {
      id: 'dock_access', setBy: 'company', governs: 'people',
      prompt: 'Who may be in the charging dock?',
      defaultIndex: 0,
      options: [
        { value: 'robots_only', label: 'Robots only', rule: 'People do not enter the charging dock.',
          rules: () => [{ id: 'dock_access', text: 'People do not enter the charging dock.', who: 'kind:person', does: '*', where: 'tag:dock', then: { answer: 'deny' }, reason: 'The charging dock is for robots only.' }] },
        { value: 'staff_too', label: 'Robots and staff', rule: 'Only staff enter the charging dock.',
          rules: () => [{ id: 'dock_access', text: 'Only staff enter the charging dock.', who: ['kind:person', '!tag:staff'], does: '*', where: 'tag:dock', then: { answer: 'deny' }, reason: 'Only staff enter the charging dock.' }] },
        { value: 'anyone', label: 'Anyone', rule: 'Anyone may enter the charging dock.' },
      ],
    },
    {
      id: 'robot_speed', setBy: 'law-and-safety', governs: 'robots',
      prompt: 'How fast may robots move?',
      defaultIndex: 0,
      options: [
        { value: 'careful', label: 'Careful (0.5 m/s)', rule: 'Robots move at most 0.5 m/s.',
          rules: () => [{ id: 'robot_speed', text: 'Robots move at most 0.5 m/s.', who: 'kind:robot', does: 'tag:movement', where: '*', then: { answer: 'limit', limits: { maxSpeedMps: 0.5 } } }] },
        { value: 'normal', label: 'Normal (1.5 m/s)', rule: 'Robots move at most 1.5 m/s.',
          rules: () => [{ id: 'robot_speed', text: 'Robots move at most 1.5 m/s.', who: 'kind:robot', does: 'tag:movement', where: '*', then: { answer: 'limit', limits: { maxSpeedMps: 1.5 } } }] },
        { value: 'fast', label: 'Fast (2.0 m/s)', rule: 'Robots move at most 2.0 m/s.',
          rules: () => [{ id: 'robot_speed', text: 'Robots move at most 2.0 m/s.', who: 'kind:robot', does: 'tag:movement', where: '*', then: { answer: 'limit', limits: { maxSpeedMps: 2.0 } } }] },
      ],
    },
    {
      id: 'emergency', setBy: 'law-and-safety', governs: 'site',
      prompt: 'In an emergency, after robots stop, what should they do?',
      defaultIndex: 0,
      options: [
        { value: 'stop_all', label: 'Stay stopped', rule: 'In an emergency, all robots stop and stay stopped.',
          rules: () => [{ id: 'emergency_stop', never: true, text: 'In an emergency, all robots stop and stay stopped.', who: 'kind:robot', does: '*', where: '*', when: [{ fact: 'emergency', op: '==', value: true }], then: { answer: 'deny' }, reason: 'Emergency: robots stop.' }] },
        { value: 'stop_then_dock', label: 'Stop, then return to dock', rule: 'In an emergency, all robots stop; the only thing they may do is return to dock.',
          rules: () => [{ id: 'emergency_stop', never: true, text: 'In an emergency, all robots stop; the only thing they may do is return to dock.', who: 'kind:robot', does: ['*', '!dock'], where: '*', when: [{ fact: 'emergency', op: '==', value: true }], then: { answer: 'deny', instead: 'dock' }, reason: 'Emergency: robots stop.' }] },
      ],
    },
    {
      id: 'glasses_capture', setBy: 'company', governs: 'glasses',
      prompt: 'May smart glasses take photos or video here?',
      defaultIndex: 0,
      options: [
        { value: 'blocked', label: 'No', rule: 'Glasses do not take photos or video here.',
          rules: () => [{ id: 'glasses_capture', text: 'Glasses do not take photos or video here.', who: 'kind:person', does: 'tag:capture', where: '*', then: { answer: 'deny' } }] },
        { value: 'staff_only', label: 'Staff only', rule: 'Only staff glasses take photos or video here.',
          rules: () => [{ id: 'glasses_capture', text: 'Only staff glasses take photos or video here.', who: ['kind:person', '!tag:staff'], does: 'tag:capture', where: '*', then: { answer: 'deny' } }] },
        { value: 'allowed', label: 'Yes', rule: 'Glasses may take photos and video here.' },
      ],
    },
  ],
};
