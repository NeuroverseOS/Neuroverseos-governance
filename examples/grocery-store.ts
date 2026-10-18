/**
 * Example: a grocery store, built from the grocery-store template, with the
 * manager's own rules written in plain words.
 *
 * Two of the manager's rules are deliberately at odds, so the demo shows
 * what the rulebook reports:
 *   - "shoppers may take photos in the entrance" tries to loosen the company's
 *     staff-only capture answer → authority-override (never takes effect)
 *   - the manager allows staff audio in the back room, then forbids all audio
 *     there at lunch → same-authority contradiction
 *
 * Copy this file to start your own site. Replace the area IDs with the IDs
 * your spatial system reports (for example posemesh zone or anchor IDs).
 */

import { DomainRulesBuilder } from '../src/index';
import type { DomainRequest } from '../src/index';

export const builder = new DomainRulesBuilder({
  id: 'example-grocery-01',
  name: 'Example Grocery',
  spatialDomainId: 'posemesh-domain-id-goes-here',
  hours: { open: '07:00', close: '22:00' },
})
  .fromTemplate('grocery-store')
  .area({ id: 'entrance', name: 'Entrance', tags: ['public'] })
  .area({ id: 'aisle-3', name: 'Aisle 3', tags: ['public'] })
  .area({ id: 'checkout', name: 'Checkout', tags: ['public'] })
  // Only these roles may act here. A role must be listed itself; inheriting a listed role does not count.
  .area({ id: 'restroom', name: 'Restroom', tags: ['public'], allowRoles: ['cleaning_robot', 'staff', 'shopper'] })
  .area({ id: 'back-room', name: 'Back room', tags: ['staff-only'] })
  .area({ id: 'electrical', name: 'Electrical room', tags: ['restricted'] })
  .area({ id: 'dock-a', name: 'Charging dock A', tags: ['dock'] })

  .role({ id: 'inventory_robot', name: 'Inventory robot', kind: 'robot', actions: ['enter_zone', 'move', 'scan', 'dock'] })
  .role({ id: 'restock_robot', name: 'Restock robot', kind: 'robot', inherits: 'inventory_robot', actions: ['manipulate', 'place'] })
  .role({ id: 'cleaning_robot', name: 'Cleaning robot', kind: 'robot', actions: ['enter_zone', 'move', 'dock'], tags: ['after-hours'] })
  .role({ id: 'shopper', name: 'Shopper', kind: 'person', actions: ['ai_overlay', 'camera_capture', 'record_audio'] })
  .role({ id: 'staff', name: 'Staff', kind: 'person', inherits: 'shopper', actions: ['share_location', 'command_robot'], tags: ['staff'] })

  // The manager's Saturday rule needs to know the day, so every request must bring it.
  .fact({ id: 'day', type: 'day', required: true, description: 'Day of the week.' })

  .answer('robots_near_people', 'slow')
  .answer('robot_speed', 'walking')
  .answer('robots_staff_zones', 'when_staff_present')
  .answer('robots_restricted_zones', 'with_approval')
  .answer('robots_after_hours', 'listed_roles')
  .answer('robot_scan_near_people', 'pause')
  .answer('glasses_capture', 'staff_only')
  .answer('robot_commands', 'staff_only')
  .answer('emergency', 'stop_then_dock')
  .answer('unknown_actions', 'block')

  .as('site-manager');

// The manager's own rules, in plain words. Each draft is read, then confirmed.
export const managerTexts: Array<[string, string]> = [
  ['checkout_speed', 'robots slow to 0.3 m/s in checkout'],
  ['no_restock_saturday_pm', 'no restock robots in aisle 3 on Saturdays between 14:00 and 16:00'],
  ['shopper_photos_entrance', 'shoppers may take photos in the entrance'],                            // at odds with the company's staff-only answer
  ['no_audio_back_room_lunch', 'people may not record audio in the back room between 12:00 and 13:00'], // at odds with the rule below (same authority)
];
export const drafts = managerTexts.map(([id, text]) => builder.addRuleFromText(text, { id }));
for (const d of drafts) builder.confirm(d);
builder.addRule({
  id: 'staff_audio_back_room',
  text: 'Staff may record audio in the back room.',
  who: 'staff', does: 'record_audio', where: 'back-room',
  then: { answer: 'allow' },
});

// Rules a planner meets when it proposes a whole plan (evaluatePlan). The
// template's actions declare their effects — manipulate sets `carrying`,
// place clears it, enter_zone and dock move the robot — so a plan is checked
// step by step on the facts the earlier steps leave behind.
builder.addRule({
  id: 'no_carrying_through_checkout',
  text: 'Robots carrying stock do not enter the checkout.',
  who: 'kind:robot', does: 'enter_zone', where: 'checkout',
  when: [{ fact: 'carrying', op: '==', value: true }],
  then: { answer: 'deny', instead: 'place' },
  reason: 'Robots carrying stock do not enter the checkout; put it down first.',
});
builder.addPlanRule({ id: 'scan_before_restock', text: 'A robot scans a shelf before it restocks it.', who: 'kind:robot', check: { kind: 'before', first: 'scan', then: 'manipulate', sameArea: true }, reason: 'Scan the shelf before restocking it, so the plan works from what is actually there.' });
builder.addPlanRule({ id: 'end_at_dock', text: 'Every robot plan ends at a charging dock.', who: 'kind:robot', check: { kind: 'ends_in', areas: 'tag:dock' }, reason: 'Every plan ends at a charging dock.' });

export const rulebook = builder.compile();

const robot = (id: string, roleId: string) => ({ id, kind: 'robot', roleId });
const person = (id: string, roleId: string) => ({ id, kind: 'person', roleId });
const at = (localTime: string, extra: Record<string, unknown> = {}) => ({ localTime, day: 'sat', peopleInZone: 0, ...extra });

/** A day in the store. */
export const day: Array<[string, DomainRequest]> = [
  ['Inventory robot drives down an empty aisle at 1.2 m/s',
    { participant: robot('r-1', 'inventory_robot'), action: 'move', areaId: 'aisle-3', facts: at('09:00', { requestedSpeedMps: 1.2 }) }],
  ['Two shoppers walk into the aisle',
    { participant: robot('r-1', 'inventory_robot'), action: 'move', areaId: 'aisle-3', facts: at('09:01', { peopleInZone: 2, requestedSpeedMps: 1.0 }) }],
  ['The robot wants to scan the shelf while they are there',
    { participant: robot('r-1', 'inventory_robot'), action: 'scan', areaId: 'aisle-3', facts: at('09:01', { peopleInZone: 2 }) }],
  ['Restock robot in aisle 3 on Saturday afternoon (the manager\'s rule)',
    { participant: robot('r-2', 'restock_robot'), action: 'move', areaId: 'aisle-3', facts: at('14:30', { requestedSpeedMps: 0.5 }) }],
  ['Restock robot heads to the back room — nobody there',
    { participant: robot('r-2', 'restock_robot'), action: 'enter_zone', areaId: 'back-room', facts: at('10:00', { staffInZone: 0, requestedSpeedMps: 0.8 }) }],
  ['Restock robot asks to enter the electrical room',
    { participant: robot('r-2', 'restock_robot'), action: 'enter_zone', areaId: 'electrical', facts: at('10:30', { requestedSpeedMps: 0.5 }) }],
  ['…and a manager approves it',
    { participant: robot('r-2', 'restock_robot'), action: 'enter_zone', areaId: 'electrical', facts: at('10:31', { requestedSpeedMps: 0.5, approvedBy: { id: 'manager-dana', authority: 'site-manager' } }) }],
  ['Robot at the checkout at 1 m/s (the manager\'s cap)',
    { participant: robot('r-1', 'inventory_robot'), action: 'move', areaId: 'checkout', facts: at('11:00', { peopleInZone: 0, requestedSpeedMps: 1.0 }) }],
  ['A shopper\'s glasses try to take a photo at the entrance (the manager said yes; the company said staff only)',
    { participant: person('p-1', 'shopper'), action: 'camera_capture', areaId: 'entrance', facts: at('12:00', { peopleInZone: 3 }) }],
  ['Staff record audio in the back room at lunch (the manager said yes, then no)',
    { participant: person('s-1', 'staff'), action: 'record_audio', areaId: 'back-room', facts: at('12:30', { peopleInZone: 1 }) }],
  ['Staff tells the cleaning robot to go to checkout',
    { participant: person('s-1', 'staff'), action: 'command_robot', areaId: 'checkout', facts: at('13:00', { peopleInZone: 4, targetRobotId: 'r-3' }) }],
  ['Fire alarm: the inventory robot wants to keep moving',
    { participant: robot('r-1', 'inventory_robot'), action: 'move', areaId: 'aisle-3', facts: at('15:00', { peopleInZone: 6, emergency: true }) }],
  ['Fire alarm: it returns to dock instead',
    { participant: robot('r-1', 'inventory_robot'), action: 'dock', areaId: 'aisle-3', facts: at('15:02', { emergency: true, requestedSpeedMps: 0.3 }) }],
  ['After closing: the cleaning robot (tagged after-hours) works',
    { participant: robot('r-3', 'cleaning_robot'), action: 'move', areaId: 'aisle-3', facts: at('23:30', { requestedSpeedMps: 1.0 }) }],
  ['A robot asks for an action the rulebook does not know',
    { participant: robot('r-1', 'inventory_robot'), action: 'open_door', areaId: 'entrance', facts: at('11:00') }],
];
