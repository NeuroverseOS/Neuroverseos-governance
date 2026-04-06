/**
 * Migration Tests
 *
 * Tests the world schema version migration system:
 *   1. Detect current schema version
 *   2. Apply migrations
 *   3. Verify idempotency (already at target = no-op)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, cpSync } from 'fs';
import { join } from 'path';

const TEST_DIR = join(__dirname, '../.test-migrate');
const WORLD_DIR = join(TEST_DIR, 'world');

beforeAll(() => {
  mkdirSync(WORLD_DIR, { recursive: true });

  writeFileSync(join(WORLD_DIR, 'world.json'), JSON.stringify({
    world_id: 'migrate_test',
    name: 'Migration Test World',
    version: '1.0.0',
  }, null, 2));

  writeFileSync(join(WORLD_DIR, 'metadata.json'), JSON.stringify({
    format_version: 'nv-world-1.0',
    schema_version: '1.0.0',
    configurator_version: 'manual-authoring',
    created_at: '2026-01-01T00:00:00Z',
  }, null, 2));
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('neuroverse migrate', () => {
  it('detects 1.0.0 world and applies migration to 1.1.0', async () => {
    const { main: migrateMain } = await import('../src/cli/migrate');

    const originalExit = process.exit;
    process.exit = (() => {}) as any;

    await migrateMain(['--world', WORLD_DIR]);

    process.exit = originalExit;

    // Check world.json got enforcement_level
    const world = JSON.parse(readFileSync(join(WORLD_DIR, 'world.json'), 'utf-8'));
    expect(world.enforcement_level).toBe('standard');

    // Check metadata.json got normalized
    const meta = JSON.parse(readFileSync(join(WORLD_DIR, 'metadata.json'), 'utf-8'));
    expect(meta.schema_version).toBe('1.1.0');
    expect(meta.authoring_method).toBe('manual-authoring');
    expect(meta.configurator_version).toBeUndefined();
  });

  it('reports no migration needed when already at target', async () => {
    const { main: migrateMain } = await import('../src/cli/migrate');

    const originalExit = process.exit;
    let exitCode: number | undefined;
    process.exit = ((code: number) => { exitCode = code; }) as any;

    // Should be a no-op since we already migrated
    await migrateMain(['--world', WORLD_DIR]);

    process.exit = originalExit;

    // Should not error
    expect(exitCode).toBeUndefined();
  });

  it('dry-run does not modify files', async () => {
    // Reset to 1.0.0
    const metaPath = join(WORLD_DIR, 'metadata.json');
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
    meta.schema_version = '1.0.0';
    meta.configurator_version = meta.authoring_method;
    delete meta.authoring_method;
    writeFileSync(metaPath, JSON.stringify(meta, null, 2));

    const worldPath = join(WORLD_DIR, 'world.json');
    const world = JSON.parse(readFileSync(worldPath, 'utf-8'));
    delete world.enforcement_level;
    writeFileSync(worldPath, JSON.stringify(world, null, 2));

    const { main: migrateMain } = await import('../src/cli/migrate');

    const originalExit = process.exit;
    process.exit = (() => {}) as any;

    await migrateMain(['--world', WORLD_DIR, '--dry-run']);

    process.exit = originalExit;

    // Files should NOT be modified
    const metaAfter = JSON.parse(readFileSync(metaPath, 'utf-8'));
    expect(metaAfter.schema_version).toBe('1.0.0');

    const worldAfter = JSON.parse(readFileSync(worldPath, 'utf-8'));
    expect(worldAfter.enforcement_level).toBeUndefined();
  });

  it('backup creates a copy before migrating', async () => {
    const { main: migrateMain } = await import('../src/cli/migrate');

    const originalExit = process.exit;
    process.exit = (() => {}) as any;

    await migrateMain(['--world', WORLD_DIR, '--backup']);

    process.exit = originalExit;

    const backupDir = WORLD_DIR + '.backup';
    expect(existsSync(backupDir)).toBe(true);

    // Backup should have old schema version
    const backupMeta = JSON.parse(readFileSync(join(backupDir, 'metadata.json'), 'utf-8'));
    expect(backupMeta.schema_version).toBe('1.0.0');

    rmSync(backupDir, { recursive: true, force: true });
  });
});
