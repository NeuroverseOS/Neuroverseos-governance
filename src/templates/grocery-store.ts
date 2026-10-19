/**
 * Template: grocery store — robots on the floor, staff and shoppers wearing
 * smart glasses. Reproduces the ten questions of 0.2 as emitted rules.
 *
 * Which authority sets which rule:
 *   law-and-safety  people near robots, robot speed, emergencies
 *   company         staff and restricted areas, opening hours, scanning near
 *                   people, glasses capture, robot commands, unknown actions
 *   site-manager    area declarations (role limits), the manager's own rules
 *   staff           rules staff may add (none by default)
 *   agent           rules an AI agent the site trusts may add: the lowest
 *                   level, so an agent can only ever tighten
 */

import type { Template, TemplateRule } from './template';

const NEAR_PEOPLE_SPEED: Record<string, number> = { careful: 0.2, walking: 0.3, brisk: 0.5 };
const MAX_SPEED: Record<string, number> = { careful: 0.5, walking: 1.0, brisk: 1.5 };

export const GROCERY_STORE: Template = {
  id: 'grocery-store',
  name: 'Grocery store',
  description: 'Robots on the floor; staff and shoppers wearing smart glasses.',
  kinds: ['robot', 'person'],
  authorities: [
    { id: 'law-and-safety', name: 'Law and safety' },
    { id: 'company', name: 'Company' },
    { id: 'site-manager', name: 'Site manager' },
    { id: 'staff', name: 'Staff' },
    { id: 'agent', name: 'AI agent' },
  ],
  requires: ['hours'],
  actions: [
    { id: 'enter_zone', name: 'enter an area', kinds: ['robot'], tags: ['movement'], synonyms: ['enter', 'go into', 'go in', 'drive into'], effects: [{ op: 'move' }] },
    { id: 'move', name: 'move', kinds: ['robot'], tags: ['movement'], synonyms: ['drive', 'navigate', 'travel'] },
    { id: 'manipulate', name: 'pick up or handle things', kinds: ['robot'], tags: ['handling'], synonyms: ['pick up', 'handle', 'restock', 'touch', 'manipulate'], effects: [{ op: 'set', fact: 'carrying', value: true }] },
    { id: 'place', name: 'put things down', kinds: ['robot'], tags: ['handling'], synonyms: ['put down', 'place', 'drop', 'shelve'], effects: [{ op: 'set', fact: 'carrying', value: false }] },
    { id: 'scan', name: 'scan', kinds: ['robot'], tags: ['sensing'], synonyms: ['scan', 'take images', 'lidar'] },
    { id: 'dock', name: 'dock', kinds: ['robot'], tags: ['movement'], synonyms: ['dock', 'charge', 'return to dock'], effects: [{ op: 'move' }] },
    { id: 'camera_capture', name: 'take photos or video', kinds: ['person'], tags: ['capture'], synonyms: ['take photos', 'take pictures', 'photograph', 'film', 'record video', 'take a photo', 'take photo'] },
    { id: 'record_audio', name: 'record audio', kinds: ['person'], tags: ['capture'], synonyms: ['record audio', 'record sound', 'record', 'transcribe'] },
    { id: 'ai_overlay', name: 'show AI overlays', kinds: ['person'], synonyms: ['overlay', 'show overlays', 'ai overlay'] },
    { id: 'share_location', name: 'share location', kinds: ['person'], synonyms: ['share location', 'share position'] },
    { id: 'command_robot', name: 'command robots', kinds: ['person'], requires: ['targetRobotId'], synonyms: ['command robots', 'command a robot', 'give robots commands', 'control robots'] },
  ],
  facts: [
    { id: 'peopleInZone', type: 'number', integer: true, min: 0, required: true, description: 'People (not robots) in the area, as the spatial system reports.', synonyms: ['people', 'people present', 'people in the area', 'people in the zone', 'shoppers present'] },
    { id: 'staffInZone', type: 'number', integer: true, min: 0, default: 0, description: 'Staff in the area. Absent means 0.', synonyms: ['staff present', 'staff in the area', 'staff in the zone'] },
    { id: 'localTime', type: 'time', required: true, description: 'Local time "HH:MM". The rulebook has no clock.', synonyms: ['time'] },
    { id: 'requestedSpeedMps', type: 'number', min: 0, description: 'Requested speed in m/s for movement. Absent means "cap me".' },
    { id: 'emergency', type: 'boolean', default: false, description: 'True while a site emergency is active. The one fact with a default, because an emergency is an explicit event your system raises.', synonyms: ['emergency', 'alarm', 'fire alarm'] },
    { id: 'targetRobotId', type: 'string', description: 'For command_robot: the robot being commanded.' },
    { id: 'carrying', type: 'boolean', default: false, description: 'True while a robot is carrying stock. In a plan, manipulate sets it and place clears it.', synonyms: ['carrying', 'loaded', 'carrying stock'] },
  ],
  limits: [
    { id: 'maxSpeedMps', name: 'top speed', unit: 'm/s', requestedFact: 'requestedSpeedMps', appliesTo: 'tag:movement', synonyms: ['speed', 'slow', 'slow down', 'top speed', 'max speed'] },
  ],
  tags: {
    actions: ['movement', 'handling', 'sensing', 'capture'],
    areas: ['public', 'staff-only', 'restricted', 'dock'],
    roles: ['staff', 'after-hours'],
  },
  otherwise: 'deny',
  questions: [
    {
      id: 'robots_near_people', setBy: 'law-and-safety', governs: 'robots',
      prompt: 'When people are in the same area as a robot, what should the robot do?',
      defaultIndex: 0,
      options: [
        { value: 'stop', label: 'Stop until they leave', rule: 'Robots stop while people are in their area.',
          rules: () => [{ id: 'robots_near_people', text: 'Robots stop while people are in their area.', who: 'kind:robot', does: ['*', '!scan'], where: '*', when: [{ fact: 'peopleInZone', op: '>', value: 0 }], then: { answer: 'wait', for: 'condition' }, reason: 'People are in the area; robots stop until they leave.' }] },
        { value: 'slow', label: 'Slow down', rule: 'Robots slow to the near-people speed while people are in their area.',
          rules: ctx => [{ id: 'robots_near_people', text: `Robots slow to ${NEAR_PEOPLE_SPEED[ctx.answers.robot_speed]} m/s while people are in their area.`, who: 'kind:robot', does: 'tag:movement', where: '*', when: [{ fact: 'peopleInZone', op: '>', value: 0 }], then: { answer: 'limit', limits: { maxSpeedMps: NEAR_PEOPLE_SPEED[ctx.answers.robot_speed] } }, reason: 'People are in the area; robots slow down.' }] },
        { value: 'continue', label: 'Carry on at normal speed', rule: 'Robots keep normal speed when people are in their area.' },
      ],
    },
    {
      id: 'robot_speed', setBy: 'law-and-safety', governs: 'robots',
      prompt: 'How fast may robots move?',
      defaultIndex: 0,
      options: (['careful', 'walking', 'brisk'] as const).map(value => ({
        value,
        label: `${value[0].toUpperCase()}${value.slice(1)} (${MAX_SPEED[value]} m/s, ${NEAR_PEOPLE_SPEED[value]} near people)`,
        rule: `Robots move at most ${MAX_SPEED[value]} m/s.`,
        rules: (): TemplateRule[] => [{ id: 'robot_speed', text: `Robots move at most ${MAX_SPEED[value]} m/s.`, who: 'kind:robot', does: 'tag:movement', where: '*', then: { answer: 'limit', limits: { maxSpeedMps: MAX_SPEED[value] } }, reason: `Robots move at most ${MAX_SPEED[value]} m/s.` }],
      })),
    },
    {
      id: 'robots_staff_zones', setBy: 'company', governs: 'robots',
      prompt: 'May robots go into staff-only areas?',
      defaultIndex: 0,
      options: [
        { value: 'never', label: 'Never', rule: 'Robots never enter staff-only areas.',
          rules: () => [{ id: 'robots_staff_zones', text: 'Robots never enter staff-only areas.', who: 'kind:robot', does: '*', where: 'tag:staff-only', then: { answer: 'deny' }, reason: 'This area is staff-only; robots never go there.' }] },
        { value: 'when_staff_present', label: 'Only when staff are there', rule: 'Robots act in staff-only areas only while staff are in them.',
          rules: () => [{ id: 'robots_staff_zones', text: 'Robots act in staff-only areas only while staff are in them.', who: 'kind:robot', does: '*', where: 'tag:staff-only', when: [{ fact: 'staffInZone', op: '==', value: 0 }], then: { answer: 'wait', for: 'condition' }, reason: 'This area is staff-only; wait until staff are there.' }] },
        { value: 'allowed', label: 'Yes', rule: 'Robots may act in staff-only areas.' },
      ],
    },
    {
      id: 'robots_restricted_zones', setBy: 'company', governs: 'robots',
      prompt: 'May robots go into restricted areas?',
      defaultIndex: 0,
      options: [
        { value: 'never', label: 'Never', rule: 'Robots never enter restricted areas.',
          rules: () => [{ id: 'robots_restricted_zones', text: 'Robots never enter restricted areas.', who: 'kind:robot', does: '*', where: 'tag:restricted', then: { answer: 'deny' }, reason: 'This area is restricted; robots never go there.' }] },
        { value: 'with_approval', label: 'Only when a person approves each time', rule: "Robots act in restricted areas only with a person's approval each time.",
          rules: () => [{ id: 'robots_restricted_zones', text: "Robots act in restricted areas only with a person's approval each time.", who: 'kind:robot', does: '*', where: 'tag:restricted', then: { answer: 'wait', for: 'approval' }, reason: 'This area is restricted.' }] },
      ],
    },
    {
      id: 'robots_after_hours', setBy: 'company', governs: 'robots',
      prompt: 'May robots work outside opening hours?',
      defaultIndex: 0,
      options: [
        { value: 'never', label: 'No', rule: 'Robots do not work outside opening hours.',
          rules: ctx => closedWindow(ctx.site.hours!) ? [{ id: 'robots_after_hours', text: 'Robots do not work outside opening hours.', who: 'kind:robot', does: '*', where: '*', when: [closedWindow(ctx.site.hours!)!], then: { answer: 'deny' }, reason: `${ctx.site.name} is closed; robots do not work after hours.` }] : [] },
        { value: 'listed_roles', label: 'Only robot roles tagged after-hours', rule: 'Outside opening hours, only robot roles tagged "after-hours" may work.',
          rules: ctx => closedWindow(ctx.site.hours!) ? [{ id: 'robots_after_hours', text: 'Outside opening hours, only robot roles tagged "after-hours" may work.', who: ['kind:robot', '!tag:after-hours'], does: '*', where: '*', when: [closedWindow(ctx.site.hours!)!], then: { answer: 'deny' }, reason: `${ctx.site.name} is closed and this robot is not tagged for after-hours work.` }] : [] },
        { value: 'allowed', label: 'Yes', rule: 'Robots may work outside opening hours.' },
      ],
    },
    {
      id: 'robot_scan_near_people', setBy: 'company', governs: 'robots',
      prompt: 'May robots scan (cameras, lidar) while people are in the area?',
      defaultIndex: 0,
      options: [
        { value: 'never', label: 'No', rule: 'Robots do not scan while people are in the area.',
          rules: () => [{ id: 'robot_scan_near_people', text: 'Robots do not scan while people are in the area.', who: 'kind:robot', does: 'scan', where: '*', when: [{ fact: 'peopleInZone', op: '>', value: 0 }], then: { answer: 'deny' }, reason: 'People are in the area; robots do not scan near people.' }] },
        { value: 'pause', label: 'Wait until the area is clear', rule: 'Robot scans wait until the area is clear of people.',
          rules: () => [{ id: 'robot_scan_near_people', text: 'Robot scans wait until the area is clear of people.', who: 'kind:robot', does: 'scan', where: '*', when: [{ fact: 'peopleInZone', op: '>', value: 0 }], then: { answer: 'wait', for: 'condition' }, reason: 'People are in the area; wait until it is clear to scan.' }] },
        { value: 'allowed', label: 'Yes', rule: 'Robots may scan while people are in the area.' },
      ],
    },
    {
      id: 'glasses_capture', setBy: 'company', governs: 'glasses',
      prompt: 'May smart glasses take photos, video or audio in this site?',
      defaultIndex: 0,
      options: [
        { value: 'blocked', label: 'No', rule: 'Glasses do not capture photos, video or audio here.',
          rules: () => [{ id: 'glasses_capture', text: 'Glasses do not capture photos, video or audio here.', who: 'kind:person', does: 'tag:capture', where: '*', then: { answer: 'deny' }, reason: 'Glasses may not capture photos, video or audio here.' }] },
        { value: 'staff_only', label: 'Staff only', rule: 'Only staff glasses may capture photos, video or audio here.',
          rules: () => [{ id: 'glasses_capture', text: 'Only staff glasses may capture photos, video or audio here.', who: ['kind:person', '!tag:staff'], does: 'tag:capture', where: '*', then: { answer: 'deny' }, reason: 'Glasses may not capture photos, video or audio here (staff only).' }] },
        { value: 'confirm_each', label: 'Yes, but the wearer confirms each time', rule: 'Glasses capture only after the wearer confirms each time.',
          rules: () => [{ id: 'glasses_capture', text: 'Glasses capture only after the wearer confirms each time.', who: 'kind:person', does: 'tag:capture', where: '*', then: { answer: 'wait', for: 'approval' }, reason: 'The wearer must confirm before glasses capture.' }] },
        { value: 'allowed', label: 'Yes', rule: 'Glasses may capture photos, video and audio here.' },
      ],
    },
    {
      id: 'robot_commands', setBy: 'company', governs: 'glasses',
      prompt: 'Who may give robots commands from their glasses?',
      defaultIndex: 0,
      options: [
        { value: 'nobody', label: 'Nobody', rule: 'Nobody commands robots from glasses.',
          rules: () => [{ id: 'robot_commands', text: 'Nobody commands robots from glasses.', who: 'kind:person', does: 'command_robot', where: '*', then: { answer: 'deny' }, reason: 'Nobody commands robots from glasses.' }] },
        { value: 'staff_only', label: 'Staff only', rule: 'Only staff may command robots from glasses.',
          rules: () => [{ id: 'robot_commands', text: 'Only staff may command robots from glasses.', who: ['kind:person', '!tag:staff'], does: 'command_robot', where: '*', then: { answer: 'deny' }, reason: 'Only staff may command robots.' }] },
        { value: 'anyone_with_approval', label: 'Anyone, with staff approval each time', rule: 'Anyone may command robots from glasses, with staff approval each time.',
          rules: () => [{ id: 'robot_commands', text: 'Anyone may command robots from glasses, with staff approval each time.', who: ['kind:person', '!tag:staff'], does: 'command_robot', where: '*', then: { answer: 'wait', for: 'approval' }, reason: 'A non-staff wearer commanding a robot needs staff approval.' }] },
      ],
    },
    {
      id: 'emergency', setBy: 'law-and-safety', governs: 'site',
      prompt: 'In an emergency, after robots stop, what should they do?',
      defaultIndex: 0,
      options: [
        { value: 'stop_all', label: 'Stay stopped', rule: 'In an emergency, all robots stop and stay stopped; nobody commands robots from glasses.',
          rules: () => [
            { id: 'emergency_stop', never: true, text: 'In an emergency, all robots stop and stay stopped.', who: 'kind:robot', does: '*', where: '*', when: [{ fact: 'emergency', op: '==', value: true }], then: { answer: 'deny' }, reason: 'Emergency: robots stop.' },
            { id: 'emergency_stop_commands', never: true, text: 'In an emergency, nobody commands robots from glasses.', who: 'kind:person', does: 'command_robot', where: '*', when: [{ fact: 'emergency', op: '==', value: true }], then: { answer: 'deny' }, reason: 'Emergency: nobody commands robots from glasses.' },
          ] },
        { value: 'stop_then_dock', label: 'Stop, then return to dock when told', rule: 'In an emergency, all robots stop; the only thing they may do is return to dock. Nobody commands robots from glasses.',
          rules: () => [
            { id: 'emergency_stop', never: true, text: 'In an emergency, all robots stop; the only thing they may do is return to dock.', who: 'kind:robot', does: ['*', '!dock'], where: '*', when: [{ fact: 'emergency', op: '==', value: true }], then: { answer: 'deny', instead: 'dock' }, reason: 'Emergency: robots stop.' },
            { id: 'emergency_stop_commands', never: true, text: 'In an emergency, nobody commands robots from glasses.', who: 'kind:person', does: 'command_robot', where: '*', when: [{ fact: 'emergency', op: '==', value: true }], then: { answer: 'deny' }, reason: 'Emergency: nobody commands robots from glasses.' },
          ] },
      ],
    },
    {
      id: 'unknown_actions', setBy: 'company', governs: 'site',
      prompt: 'If something asks to do an action no rule covers, what happens?',
      defaultIndex: 0,
      options: [
        { value: 'block', label: 'Block it', rule: 'Actions the rulebook does not know are blocked.', otherwise: 'deny' },
        { value: 'pause', label: 'Pause and ask a person', rule: "Actions the rulebook does not know wait for a person's approval.", otherwise: 'wait-for-approval' },
      ],
    },
  ],
};

/**
 * The hours the site is closed, as a `between` condition on localTime (the
 * exact complement of `isOpen`); null when open === close, which means always open.
 */
function closedWindow(hours: { open: string; close: string }): { fact: 'localTime'; op: 'between'; from: string; to: string } | null {
  if (hours.open === hours.close) return null;
  return { fact: 'localTime', op: 'between', from: hours.close, to: hours.open };
}
