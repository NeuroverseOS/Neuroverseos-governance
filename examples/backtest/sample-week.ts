/**
 * A SYNTHETIC sample week for the backtest example. Illustrative data, not
 * from a real store: every event below is made up, hand-structured, and
 * generated the same way every time (no randomness, no clock).
 *
 * Seven days (Mon 2026-10-05 to Sun 2026-10-11) at the sample site
 * (rulebook.ts) with the vocabulary of the harness replay: two inventory
 * robots (r-1, r-5), two restock robots (r-2, r-4), one cleaning robot (r-3),
 * the manager (dana, wearing glasses) and shoppers (p-1, p-2). What happens:
 *
 *   - every morning, robots file into aisle 5 one after another while the
 *     spatial system reports how many are already there — on four days a
 *     fourth robot follows — so "at most two robots in aisle 5" blocks entries
 *     the record says happened (the rule was not live when this was recorded);
 *   - three events on Wednesday evening carry no occupancy count at all
 *     (the feed dropped), and one on Friday carries no people count;
 *   - the shopper's photo at the entrance and the manager's lunchtime audio
 *     rule, both at odds with other rules, happen in the log;
 *   - on Wednesday an inventory robot scans aisle 3 five times in an hour;
 *   - the planner twice asks for an action the rulebook does not know;
 *   - one Saturday-afternoon restock in aisle 3, one fire alarm on Thursday,
 *     one robot working after hours on Friday, the cleaning robot every night.
 *
 * `outcome` is what the (imaginary) record says happened next; the backtest
 * only reports where the rule and the record differ, it never decides from it.
 */

import type { BacktestEvent, BacktestOutcome, DomainRequest } from '../../src/index';

export const SAMPLE_WEEK_NOTE = 'Synthetic sample week: illustrative data, not from a real store. Seven days, Mon 2026-10-05 to Sun 2026-10-11, at the sample grocery site in rulebook.ts.';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const robot = (id: string, roleId: string) => ({ id, kind: 'robot', roleId });
const person = (id: string, roleId: string) => ({ id, kind: 'person', roleId });
const R1 = robot('r-1', 'inventory_robot'), R5 = robot('r-5', 'inventory_robot');
const R2 = robot('r-2', 'restock_robot'), R4 = robot('r-4', 'restock_robot');
const R3 = robot('r-3', 'cleaning_robot');
const DANA = person('dana', 'staff'), P1 = person('p-1', 'shopper'), P2 = person('p-2', 'shopper');

export function sampleWeek(): BacktestEvent[] {
  const events: BacktestEvent[] = [];
  for (let d = 0; d < 7; d++) {
    const date = `2026-10-${String(5 + d).padStart(2, '0')}`;
    const day = DAYS[d];
    /** Every request brings the facts the rulebook requires; `extra` overrides or adds; `omit` leaves facts out (the feed dropped). */
    const ev = (time: string, participant: DomainRequest['participant'], action: string, areaId: string, extra: Record<string, unknown> = {}, outcome: BacktestOutcome = 'happened', omit: string[] = []) => {
      const facts: Record<string, unknown> = { localTime: time, day, peopleInZone: 0, robotsInZone: 0, ...extra };
      for (const k of omit) delete facts[k];
      events.push({ at: `${date}T${time}`, request: { participant, action, areaId, facts }, outcome });
    };

    // Opening: the inventory robot takes aisle 3; the restock robot waits for staff in the back room on even days.
    ev('07:05', R1, 'enter_zone', 'aisle-3', { requestedSpeedMps: 0.8 });
    ev('07:10', R1, 'scan', 'aisle-3');
    ev('07:20', R1, 'move', 'aisle-3', { peopleInZone: d % 3, requestedSpeedMps: 1.0 });
    ev('07:30', R2, 'enter_zone', 'back-room', { staffInZone: d % 2, requestedSpeedMps: 0.6 }, d % 2 ? 'happened' : 'did_not_happen');
    if (d % 2) ev('07:35', R2, 'manipulate', 'back-room', { staffInZone: 1 });

    // Aisle 5: robots file in one after another; the count is what the spatial system reports when each one asks.
    ev('08:00', R1, 'enter_zone', 'aisle-5', { robotsInZone: 0, requestedSpeedMps: 0.8 });
    ev('08:05', R2, 'enter_zone', 'aisle-5', { robotsInZone: 1, requestedSpeedMps: 0.6 });
    ev('08:10', R4, 'enter_zone', 'aisle-5', { robotsInZone: 2, requestedSpeedMps: 0.6 });
    if (d >= 3) ev('08:15', R5, 'enter_zone', 'aisle-5', { robotsInZone: 3, requestedSpeedMps: 0.8 });
    ev('08:40', R1, 'move', 'aisle-5', { peopleInZone: 2, robotsInZone: d >= 3 ? 3 : 2, requestedSpeedMps: 1.0 });
    ev('09:00', R1, 'scan', 'aisle-5', { peopleInZone: d % 2, robotsInZone: 2 }, d % 2 ? 'did_not_happen' : 'happened');

    // The second inventory robot scans aisle 3: three times most days, five times on Wednesday.
    const scans = d === 2 ? ['09:10', '09:20', '09:30', '09:40', '09:50'] : ['09:10', '09:30', '09:50'];
    for (const t of scans) ev(t, R5, 'scan', 'aisle-3');

    // The electrical room needs a person's approval; on Tuesday and Friday Dana gives it.
    if (d === 1 || d === 4) {
      ev('10:00', R2, 'enter_zone', 'electrical', { requestedSpeedMps: 0.4 }, 'did_not_happen');
      ev('10:05', R2, 'enter_zone', 'electrical', { requestedSpeedMps: 0.4, approvedBy: { id: 'dana', authority: 'site-manager' } });
    }

    // Glasses at the entrance: Dana may take photos; a shopper's glasses try too (the manager said yes, the company said staff only).
    ev('10:30', DANA, 'camera_capture', 'entrance', { peopleInZone: 3 });
    ev('10:31', d % 2 ? P1 : P2, 'camera_capture', 'entrance', { peopleInZone: 3 }, 'unknown');

    // The cleaning robot services the restroom (the one robot role allowed there).
    ev('11:00', R3, 'enter_zone', 'restroom', { requestedSpeedMps: 0.5 });

    // Lunch: Dana records a voice note in the back room (the manager allowed staff audio there, then forbade all audio at lunch).
    if (d === 0 || d === 3) ev('12:15', DANA, 'record_audio', 'back-room', { peopleInZone: 1 });

    // Afternoon.
    ev('13:00', DANA, 'command_robot', 'checkout', { peopleInZone: 4, targetRobotId: 'r-1' });
    if (d === 5) ev('14:30', R2, 'move', 'aisle-3', { requestedSpeedMps: 0.5 });              // Saturday afternoon: the manager's restock rule
    ev('15:00', R1, 'move', 'checkout', { peopleInZone: 0, requestedSpeedMps: 1.0 });        // the manager's checkout cap
    ev('15:30', R2, 'enter_zone', 'back-room', { staffInZone: 1, requestedSpeedMps: 0.6 });
    ev('15:35', R2, 'place', 'back-room', { staffInZone: 1 });

    // Thursday: fire alarm.
    if (d === 3) {
      ev('16:00', R1, 'move', 'aisle-3', { peopleInZone: 6, emergency: true, requestedSpeedMps: 0.5 }, 'did_not_happen');
      ev('16:01', R1, 'dock', 'aisle-3', { emergency: true, requestedSpeedMps: 0.3 });
      ev('16:02', DANA, 'command_robot', 'checkout', { peopleInZone: 5, emergency: true, targetRobotId: 'r-2' }, 'did_not_happen');
    }

    // The planner asks for an action the rulebook does not know, on even days.
    if (d % 2 === 0) ev('17:00', R1, 'open_door', 'entrance', {}, 'did_not_happen');

    // Wednesday evening: the occupancy feed dropped for three requests. Friday: one request without a people count.
    if (d === 2) for (const t of ['18:00', '18:05', '18:10']) ev(t, R2, 'enter_zone', 'aisle-5', { requestedSpeedMps: 0.6 }, 'happened', ['robotsInZone']);
    if (d === 4) ev('18:20', R1, 'move', 'aisle-5', { requestedSpeedMps: 0.8 }, 'happened', ['peopleInZone']);

    // Evening: robots dock; after closing the cleaning robot works, and on Friday an inventory robot tries to.
    ev('19:00', R1, 'dock', 'dock-a', { requestedSpeedMps: 0.5 });
    ev('19:05', R2, 'dock', 'dock-a', { requestedSpeedMps: 0.5 });
    ev('22:30', R3, 'move', 'aisle-3', { requestedSpeedMps: 1.0 });
    ev('22:40', R3, 'move', 'aisle-5', { requestedSpeedMps: 1.0 });
    if (d === 4) ev('22:45', R1, 'move', 'aisle-3', { requestedSpeedMps: 0.8 }, 'did_not_happen');
  }
  return events;
}

export const SAMPLE_WEEK: BacktestEvent[] = sampleWeek();
