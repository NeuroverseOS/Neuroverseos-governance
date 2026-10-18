/**
 * The sample site for the backtest example: the grocery-store template, the
 * switchboard's grocery vocabulary, plus
 *
 *   - aisle 5, and a `robotsInZone` fact (how many robots are already in the
 *     area, not counting the one asking — the count-fact mechanism, as the
 *     warehouse template's `robotsInArea`) that every request must bring;
 *   - the manager's rule under test: "at most N robots in aisle 5 at the
 *     same time" (`aisle5_robot_limit`, N = 2 by default; backtest.ts also
 *     tries 3);
 *   - a history rule (`scan_budget`: an inventory robot scans the same area
 *     at most four times an hour), so the replay shows history being built
 *     from earlier events;
 *   - the grocery example's manager rules, two of them deliberately at odds
 *     with the company's answers, so the report can show conflicts that
 *     actually occurred;
 *   - one rule nobody ever triggers (`back_room_evening_approval`), so the
 *     report can show a rule that never fired.
 *
 * `sampleSite(limit)` returns the compile input (plain JSON, template by ID,
 * so the switchboard can load it) and the compiled rulebook.
 */

import { DomainRulesBuilder, compileDomain, type CompileDomainInput, type Rulebook } from '../../src/index';

export function sampleSite(aisle5Limit = 2): { input: CompileDomainInput; rulebook: Rulebook } {
  const builder = new DomainRulesBuilder({ id: 'sample-grocery-week', name: 'Sample Grocery', hours: { open: '07:00', close: '22:00' } })
    .fromTemplate('grocery-store')
    .area({ id: 'entrance', name: 'Entrance', tags: ['public'] })
    .area({ id: 'aisle-3', name: 'Aisle 3', tags: ['public'] })
    .area({ id: 'aisle-5', name: 'Aisle 5', tags: ['public'] })
    .area({ id: 'checkout', name: 'Checkout', tags: ['public'] })
    .area({ id: 'restroom', name: 'Restroom', tags: ['public'], allowRoles: ['cleaning_robot', 'staff', 'shopper'] })
    .area({ id: 'back-room', name: 'Back room', tags: ['staff-only'] })
    .area({ id: 'electrical', name: 'Electrical room', tags: ['restricted'] })
    .area({ id: 'dock-a', name: 'Charging dock A', tags: ['dock'] })
    .role({ id: 'inventory_robot', name: 'Inventory robot', kind: 'robot', actions: ['enter_zone', 'move', 'scan', 'dock'] })
    .role({ id: 'restock_robot', name: 'Restock robot', kind: 'robot', inherits: 'inventory_robot', actions: ['manipulate', 'place'] })
    .role({ id: 'cleaning_robot', name: 'Cleaning robot', kind: 'robot', actions: ['enter_zone', 'move', 'dock'], tags: ['after-hours'] })
    .role({ id: 'shopper', name: 'Shopper', kind: 'person', actions: ['ai_overlay', 'camera_capture', 'record_audio'] })
    .role({ id: 'staff', name: 'Staff', kind: 'person', inherits: 'shopper', actions: ['share_location', 'command_robot'], tags: ['staff'] })
    .fact({ id: 'day', type: 'day', required: true, description: 'Day of the week.' })
    .fact({ id: 'robotsInZone', type: 'number', integer: true, min: 0, required: true, description: 'Robots already in the area, not counting the one asking, as the spatial system reports.', synonyms: ['robots', 'robots present', 'robots in the aisle'] })
    .answer('robots_near_people', 'slow').answer('robot_speed', 'walking').answer('robots_staff_zones', 'when_staff_present')
    .answer('robots_restricted_zones', 'with_approval').answer('robots_after_hours', 'listed_roles').answer('robot_scan_near_people', 'pause')
    .answer('glasses_capture', 'staff_only').answer('robot_commands', 'staff_only').answer('emergency', 'stop_then_dock').answer('unknown_actions', 'block')
    .as('site-manager');

  for (const [id, text] of [
    ['checkout_speed', 'robots slow to 0.3 m/s in checkout'],
    ['no_restock_saturday_pm', 'no restock robots in aisle 3 on Saturdays between 14:00 and 16:00'],
    ['shopper_photos_entrance', 'shoppers may take photos in the entrance'],                            // at odds with the company's staff-only answer
    ['no_audio_back_room_lunch', 'people may not record audio in the back room between 12:00 and 13:00'], // at odds with the rule below (same authority)
  ] as const) builder.confirm(builder.addRuleFromText(text, { id }));
  builder.addRule({ id: 'staff_audio_back_room', text: 'Staff may record audio in the back room.', who: 'staff', does: 'record_audio', where: 'back-room', then: { answer: 'allow' } });

  // The rule under test.
  builder.addRule({
    id: 'aisle5_robot_limit',
    text: `At most ${aisle5Limit} robots in aisle 5 at the same time.`,
    who: 'kind:robot', does: 'enter_zone', where: 'aisle-5',
    when: [{ fact: 'robotsInZone', op: '>=', value: aisle5Limit }],
    then: { answer: 'deny' },
    reason: `Aisle 5 already has ${aisle5Limit} robots in it; no more enter until one leaves.`,
  });
  // A rule that counts what the robot did recently (the replay builds that history from earlier events).
  builder.addRule({
    id: 'scan_budget',
    text: 'An inventory robot scans the same area at most four times an hour.',
    who: 'inventory_robot', does: 'scan', where: '*',
    history: [{ actions: 'scan', sameArea: true, withinMinutes: 60, op: '>=', value: 4 }],
    then: { answer: 'wait', for: 'condition' },
    reason: 'This area has been scanned four times in the last hour; wait before scanning it again.',
  });
  // A rule nothing in the sample week ever reaches.
  builder.addRule({
    id: 'back_room_evening_approval',
    text: 'Robots in the back room after 20:00 need the manager\'s approval.',
    who: 'kind:robot', does: '*', where: 'back-room',
    when: [{ fact: 'localTime', op: 'between', from: '20:00', to: '22:00' }],
    then: { answer: 'wait', for: 'approval', by: 'site-manager' },
  });

  const input: CompileDomainInput = { ...builder.toInput(), template: 'grocery-store' };
  return { input, rulebook: compileDomain(input) };
}
