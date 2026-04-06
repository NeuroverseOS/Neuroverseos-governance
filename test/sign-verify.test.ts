/**
 * Sign / Verify / Keygen Tests
 *
 * Tests the world signing and verification pipeline:
 *   1. Generate an Ed25519 keypair
 *   2. Sign a world directory
 *   3. Verify the signature
 *   4. Detect tampering
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateKeyPairSync } from 'crypto';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { buildManifest, canonicalManifest } from '../src/cli/sign';

// ─── Test Fixtures ──────────────────────────────────────────────────────────

const TEST_DIR = join(__dirname, '../.test-sign-verify');
const WORLD_DIR = join(TEST_DIR, 'world');
const KEYS_DIR = join(TEST_DIR, 'keys');

beforeAll(() => {
  // Create test world
  mkdirSync(join(WORLD_DIR, 'rules'), { recursive: true });
  mkdirSync(KEYS_DIR, { recursive: true });

  writeFileSync(join(WORLD_DIR, 'world.json'), JSON.stringify({
    world_id: 'test_world',
    name: 'Test World',
    version: '1.0.0',
  }, null, 2));

  writeFileSync(join(WORLD_DIR, 'metadata.json'), JSON.stringify({
    format_version: 'nv-world-1.0',
    schema_version: '1.0.0',
    created_at: '2026-01-01T00:00:00Z',
  }, null, 2));

  writeFileSync(join(WORLD_DIR, 'rules', 'rule-01.json'), JSON.stringify({
    id: 'test-rule',
    label: 'Test Rule',
    order: 1,
    triggers: [],
    effects: [],
  }, null, 2));

  // Generate keypair
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  writeFileSync(join(KEYS_DIR, 'test.pub'), publicKey);
  writeFileSync(join(KEYS_DIR, 'test.key'), privateKey);
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

// ─── Manifest Tests ─────────────────────────────────────────────────────────

describe('buildManifest', () => {
  it('produces SHA-256 hashes for all files', () => {
    const manifest = buildManifest(WORLD_DIR);
    expect(Object.keys(manifest).length).toBeGreaterThanOrEqual(3);
    expect(manifest['world.json']).toBeDefined();
    expect(manifest['metadata.json']).toBeDefined();
    expect(manifest['rules/rule-01.json']).toBeDefined();

    // SHA-256 is 64 hex chars
    for (const hash of Object.values(manifest)) {
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('excludes .nv-signature.json', () => {
    // Write a fake signature file
    writeFileSync(join(WORLD_DIR, '.nv-signature.json'), '{}');
    const manifest = buildManifest(WORLD_DIR);
    expect(manifest['.nv-signature.json']).toBeUndefined();
    rmSync(join(WORLD_DIR, '.nv-signature.json'));
  });

  it('is deterministic', () => {
    const m1 = buildManifest(WORLD_DIR);
    const m2 = buildManifest(WORLD_DIR);
    expect(m1).toEqual(m2);
  });
});

describe('canonicalManifest', () => {
  it('sorts keys alphabetically', () => {
    const canonical = canonicalManifest({ 'z.json': 'abc', 'a.json': 'def' });
    expect(canonical).toBe('a.json:def\nz.json:abc');
  });

  it('is deterministic regardless of insertion order', () => {
    const a = canonicalManifest({ b: '1', a: '2', c: '3' });
    const b = canonicalManifest({ c: '3', a: '2', b: '1' });
    expect(a).toBe(b);
  });
});

// ─── Sign + Verify Flow ─────────────────────────────────────────────────────

describe('Sign and Verify flow', () => {
  it('signs a world directory and produces .nv-signature.json', async () => {
    const { main: signMain } = await import('../src/cli/sign');

    // Capture process.exit to prevent test from dying
    const originalExit = process.exit;
    process.exit = (() => {}) as any;

    await signMain(['--world', WORLD_DIR, '--key', join(KEYS_DIR, 'test.key')]);

    process.exit = originalExit;

    const sigPath = join(WORLD_DIR, '.nv-signature.json');
    expect(existsSync(sigPath)).toBe(true);

    const sig = JSON.parse(readFileSync(sigPath, 'utf-8'));
    expect(sig.signatureVersion).toBe('1.0');
    expect(sig.files).toBeDefined();
    expect(sig.manifestHash).toBeDefined();
    expect(sig.signature).toBeDefined();
    expect(sig.signedAt).toBeDefined();
  });

  it('verify succeeds on untampered world', async () => {
    const { main: verifyMain } = await import('../src/cli/verify');

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code: number) => { exitCode = code; }) as any;

    await verifyMain(['--world', WORLD_DIR, '--key', join(KEYS_DIR, 'test.pub')]);

    process.exit = originalExit;

    // exitCode undefined means it didn't call process.exit (success path)
    // or 0
    expect(exitCode === undefined || exitCode === 0).toBe(true);
  });

  it('verify detects file tampering', async () => {
    // Tamper with a file
    const worldJson = join(WORLD_DIR, 'world.json');
    const original = readFileSync(worldJson, 'utf-8');
    writeFileSync(worldJson, original.replace('Test World', 'Tampered World'));

    const { main: verifyMain } = await import('../src/cli/verify');

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code: number) => { exitCode = code; }) as any;

    await verifyMain(['--world', WORLD_DIR, '--key', join(KEYS_DIR, 'test.pub')]);

    process.exit = originalExit;

    expect(exitCode).toBe(1);

    // Restore
    writeFileSync(worldJson, original);
  });
});
