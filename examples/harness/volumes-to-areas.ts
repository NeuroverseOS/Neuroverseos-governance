/**
 * Example adapter: semantic volumes → rulebook areas.
 *
 * The input is EXACTLY the collection aukilabs/domain-harness stores, as its
 * `src/semantic_volumes.rs` (branch `develop`) defines it — the shape, the
 * default and the validation limits below are transcribed from that file:
 *
 *   { schema: "spatial-harness.semantic-volumes/v1",
 *     frame:  "<scene frame>",
 *     items:  [ { id, title, description, semantic_type?, center: [x,y,z], size: [x,y,z], yaw }, … ] }
 *
 *   - `deny_unknown_fields` on the collection and on every item: an unknown
 *     field is an error, never ignored;
 *   - `semantic_type` defaults to "region" when absent (`default_semantic_type`);
 *   - `validate(frame)`: schema and frame must match; at most 256 items; the
 *     serialised collection at most 4 MiB; `id` a UUID, unique; `title`
 *     non-blank and at most 120 characters; `description` at most 10 000;
 *     `semantic_type` non-blank, at most 80 characters, no control characters;
 *     `center` finite with |n| <= 100 000; `size` finite in [0.01, 10 000];
 *     `yaw` finite with |yaw| <= 2π (radians about the OpenGL Y axis);
 *     metres throughout, in one explicit scene frame.
 *
 * The mapping onto a rulebook's areas:
 *
 *   area.id   = item.id             (the UUID your spatial system reports)
 *   area.name = item.title
 *   area.tags = [item.semantic_type] (the authored type — "aisle", "dock",
 *                                     "staff-only", … — "region" by default)
 *
 * Membership — which volume a participant is in — is the spatial system's
 * job and is NOT done here: this example has no point-in-box test. A pose
 * test on its own has no frame check, no freshness, no dwell and no
 * hysteresis, and teaches the wrong habit. The replay takes the spatial
 * system's area reports as events (PRINCIPLES.md § 9, BOUNDARY.md).
 */

import type { AreaDef } from '../../src/index';

export const SEMANTIC_VOLUMES_SCHEMA = 'spatial-harness.semantic-volumes/v1';

export interface SemanticVolume {
  /** A UUID, unique within the collection (any form `uuid::Uuid::parse_str` accepts: hyphenated, simple, braced, urn:uuid:). */
  id: string;
  title: string;
  description: string;
  /** Defaults to "region". */
  semantic_type?: string;
  /** Box centre, metres, in the collection's frame. */
  center: [number, number, number];
  /** Box size, metres. */
  size: [number, number, number];
  /** Rotation about the OpenGL Y axis, radians. */
  yaw: number;
}

export interface SemanticVolumes {
  schema: typeof SEMANTIC_VOLUMES_SCHEMA;
  frame: string;
  items: SemanticVolume[];
}

const DEFAULT_SEMANTIC_TYPE = 'region';
/**
 * Every form Rust's `uuid` crate (`Uuid::parse_str`, which the harness uses) accepts: hyphenated, simple (32 hex),
 * braced, and `urn:uuid:`. The id is kept as written (it is the area id the spatial system reports); uniqueness is
 * judged on the 32 hex digits, as the harness would after parsing.
 */
const HYPHENATED = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const UUID = new RegExp(`^(?:(${HYPHENATED})|\\{(${HYPHENATED})\\}|urn:uuid:(${HYPHENATED})|([0-9a-fA-F]{32}))$`);
const uuidHex = (id: string): string | null => { const m = UUID.exec(id); return m ? (m[1] ?? m[2] ?? m[3] ?? m[4]).replace(/-/g, '').toLowerCase() : null; };
const ITEM_FIELDS = new Set(['id', 'title', 'description', 'semantic_type', 'center', 'size', 'yaw']);
const COLLECTION_FIELDS = new Set(['schema', 'frame', 'items']);

const vec3 = (v: unknown, ok: (n: number) => boolean): v is [number, number, number] =>
  Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n) && ok(n));

/**
 * Parse and validate a semantic-volumes collection the way the harness does,
 * for the expected scene frame. Throws with the harness's own messages where
 * it has them. Returns the collection with `semantic_type` defaulted.
 */
export function parseSemanticVolumes(value: unknown, frame: string): SemanticVolumes {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Semantic volumes must be an object { schema, frame, items }');
  for (const k of Object.keys(value)) if (!COLLECTION_FIELDS.has(k)) throw new Error(`unknown field \`${k}\` (a collection has schema, frame and items only)`);
  const c = value as Record<string, unknown>;
  if (typeof c.schema !== 'string' || typeof c.frame !== 'string' || !Array.isArray(c.items)) throw new Error('Semantic volumes must be an object { schema, frame, items }');
  if (c.schema !== SEMANTIC_VOLUMES_SCHEMA || c.frame !== frame) throw new Error('Semantic volume frame or schema mismatch');
  if (c.items.length > 256) throw new Error('Scene has too many volumes');
  if (new TextEncoder().encode(JSON.stringify(value)).length > 4 * 1024 * 1024) throw new Error('Semantic volume collection is too large');
  const ids = new Set<string>();
  const items: SemanticVolume[] = c.items.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Each volume must be an object');
    for (const k of Object.keys(raw)) if (!ITEM_FIELDS.has(k)) throw new Error(`unknown field \`${k}\` on a volume (id, title, description, semantic_type, center, size, yaw only)`);
    const v = raw as Record<string, unknown>;
    const hex = typeof v.id === 'string' ? uuidHex(v.id) : null;
    if (typeof v.id !== 'string' || hex === null || ids.has(hex)) throw new Error('Invalid or duplicate volume identity');
    ids.add(hex);
    if (typeof v.title !== 'string' || !v.title.trim() || [...v.title].length > 120 || typeof v.description !== 'string' || [...v.description].length > 10000) throw new Error('Provide a title (up to 120 characters) and a description up to 10000 characters');
    const semantic_type = v.semantic_type === undefined ? DEFAULT_SEMANTIC_TYPE : v.semantic_type;
    if (typeof semantic_type !== 'string' || !semantic_type.trim() || [...semantic_type].length > 80 || /\p{Cc}/u.test(semantic_type)) throw new Error('Invalid semantic type');
    if (!vec3(v.center, n => Math.abs(n) <= 100000) || !vec3(v.size, n => n >= 0.01 && n <= 10000) || typeof v.yaw !== 'number' || !Number.isFinite(v.yaw) || Math.abs(v.yaw) > 2 * Math.PI) throw new Error('Invalid volume position, dimensions or rotation');
    return { id: v.id, title: v.title, description: v.description, semantic_type, center: v.center, size: v.size, yaw: v.yaw };
  });
  return { schema: SEMANTIC_VOLUMES_SCHEMA, frame: c.frame, items };
}

/** The rulebook areas for a validated collection: id, title as the name, semantic_type as the one tag. */
export function volumesToAreas(collection: SemanticVolumes): AreaDef[] {
  return collection.items.map(v => ({ id: v.id, name: v.title, tags: [v.semantic_type ?? DEFAULT_SEMANTIC_TYPE] }));
}
