/**
 * Example: a warehouse from the warehouse template — forklift-style robots
 * in aisles, pickers wearing glasses, a charging dock. Small on purpose.
 */

import { DomainRulesBuilder } from '../src/index';
import type { DomainRequest } from '../src/index';

export const builder = new DomainRulesBuilder({ id: 'example-warehouse-01', name: 'Example Warehouse' })
  .fromTemplate('warehouse')
  .area({ id: 'aisle-a', name: 'Aisle A', tags: ['aisle'] })
  .area({ id: 'aisle-b', name: 'Aisle B', tags: ['aisle'] })
  .area({ id: 'dock-1', name: 'Charging dock', tags: ['dock'] })
  .area({ id: 'office', name: 'Office', tags: ['office', 'staff-only'], denyRoles: ['forklift_robot'] })
  .role({ id: 'forklift_robot', name: 'Forklift robot', kind: 'robot', actions: ['enter', 'move', 'lift', 'dock'] })
  .role({ id: 'picker', name: 'Picker', kind: 'person', actions: ['enter', 'pick', 'camera_capture'], tags: ['picker'] })
  .role({ id: 'supervisor', name: 'Supervisor', kind: 'person', inherits: 'picker', actions: ['command_robot'], tags: ['staff'] })
  .answer('aisle_exclusivity', 'wait')
  .answer('max_robots_per_aisle', '2')
  .answer('dock_access', 'anyone')
  .answer('robot_speed', 'normal')
  .answer('emergency', 'stop_then_dock')
  .answer('glasses_capture', 'staff_only')
  .as('site-manager');

export const drafts = [
  builder.addRuleFromText('robots slow to 0.5 m/s in aisle B', { id: 'aisle_b_speed' }),
  builder.addRuleFromText('pickers wait for supervisor approval to enter the charging dock', { id: 'pickers_dock_approval' }),
];
for (const d of drafts) builder.confirm(d);

export const rulebook = builder.compile();

const robot = (id: string) => ({ id, kind: 'robot', roleId: 'forklift_robot' });
const facts = (localTime: string, extra: Record<string, unknown> = {}) => ({ localTime, peopleInArea: 0, robotsInArea: 0, ...extra });

export const day: Array<[string, DomainRequest]> = [
  ['Forklift robot enters an empty aisle', { participant: robot('f-1'), action: 'enter', areaId: 'aisle-a', facts: facts('08:00', { requestedSpeedMps: 1.2 }) }],
  ['A picker is in the aisle', { participant: robot('f-1'), action: 'move', areaId: 'aisle-a', facts: facts('08:05', { peopleInArea: 1 }) }],
  ['Two robots already in aisle B; a third wants in', { participant: robot('f-3'), action: 'enter', areaId: 'aisle-b', facts: facts('08:10', { robotsInArea: 2 }) }],
  ['Robot in aisle B at 1.2 m/s (manager cap 0.5)', { participant: robot('f-1'), action: 'move', areaId: 'aisle-b', facts: facts('08:15', { requestedSpeedMps: 1.2 }) }],
  ['A picker walks into the charging dock', { participant: { id: 'p-1', kind: 'person', roleId: 'picker' }, action: 'enter', areaId: 'dock-1', facts: facts('09:00') }],
  ['…with a supervisor\'s approval', { participant: { id: 'p-1', kind: 'person', roleId: 'picker' }, action: 'enter', areaId: 'dock-1', facts: facts('09:01', { approvedBy: { id: 'sam', roleId: 'supervisor' } }) }],
  ['…with another picker\'s approval (not enough)', { participant: { id: 'p-1', kind: 'person', roleId: 'picker' }, action: 'enter', areaId: 'dock-1', facts: facts('09:02', { approvedBy: { id: 'pat', roleId: 'picker' } }) }],
  ['Forklift robot tries the office', { participant: robot('f-1'), action: 'enter', areaId: 'office', facts: facts('10:00') }],
  ['Alarm: robot wants to lift', { participant: robot('f-1'), action: 'lift', areaId: 'aisle-a', facts: facts('11:00', { emergency: true }) }],
];
