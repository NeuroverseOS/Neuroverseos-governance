/**
 * Example domain: a grocery store with two kinds of robots, staff wearing
 * smart glasses, and shoppers (some wearing glasses).
 *
 * Copy this file to start your own site. Replace the zone IDs with the IDs
 * your spatial system reports (e.g. posemesh zone or anchor IDs).
 */

import type { LegacyCompileInput } from '../src/index';

/** @deprecated 0.2 input shape; still accepted by compileDomain and translated through the grocery-store template. */
export const store: LegacyCompileInput = {
  site: {
    domainId: 'example-grocery-01',
    name: 'Example Grocery',
    spatialDomainId: 'posemesh-domain-id-goes-here',
    hours: { open: '07:00', close: '22:00' },
  },

  zones: [
    { zoneId: 'entrance', name: 'Entrance', kind: 'public' },
    { zoneId: 'aisle-3', name: 'Aisle 3', kind: 'public' },
    { zoneId: 'checkout', name: 'Checkout', kind: 'public', maxSpeedMps: 0.3 },
    // Only these roles may act here. A role must be listed itself; inheriting a listed role does not count.
    { zoneId: 'restroom', name: 'Restroom', kind: 'public', allowRoles: ['cleaning_robot', 'staff', 'shopper'] },
    { zoneId: 'back-room', name: 'Back room', kind: 'staff_only' },
    { zoneId: 'electrical', name: 'Electrical room', kind: 'restricted' },
    { zoneId: 'dock-a', name: 'Charging dock A', kind: 'dock' },
  ],

  roles: [
    // Robots
    { roleId: 'inventory_robot', name: 'Inventory robot', kind: 'robot', actions: ['enter_zone', 'move', 'scan', 'dock'] },
    { roleId: 'restock_robot', name: 'Restock robot', kind: 'robot', inherits: 'inventory_robot', actions: ['manipulate'] },
    { roleId: 'cleaning_robot', name: 'Cleaning robot', kind: 'robot', actions: ['enter_zone', 'move', 'dock'], afterHours: true },

    // People (wearing glasses)
    { roleId: 'shopper', name: 'Shopper', kind: 'person', actions: ['ai_overlay', 'camera_capture', 'record_audio'] },
    { roleId: 'staff', name: 'Staff', kind: 'person', inherits: 'shopper', actions: ['share_location', 'command_robot'], isStaff: true },
  ],

  answers: {
    robots_near_people: 'slow',
    robot_speed: 'walking',
    robots_staff_zones: 'when_staff_present',
    robots_restricted_zones: 'with_approval',
    robots_after_hours: 'listed_roles',
    robot_scan_near_people: 'pause',
    glasses_capture: 'staff_only',
    robot_commands: 'staff_only',
    emergency: 'stop_then_dock',
    unknown_actions: 'block',
  },
};
