import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  parseExtendsSpec,
  loadExtendsConfig,
  resolveExtendsSpec,
  resolveAllExtends,
  getCacheDir,
  type Fetcher,
} from '../src/radiant/core/extends';
import { discoverWorlds } from '../src/radiant/core/discovery';

const TEST_ROOT = join(tmpdir(), 'nv-extends-test');

beforeEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
  mkdirSync(TEST_ROOT, { recursive: true });
  delete process.env.NEUROVERSE_REFRESH;
  delete process.env.NEUROVERSE_NO_FETCH;
});

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
  delete process.env.NEUROVERSE_REFRESH;
  delete process.env.NEUROVERSE_NO_FETCH;
});

function writeWorld(dir: string, name: string, content: string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.worldmodel.md`), content);
}

// ─── parseExtendsSpec ──────────────────────────────────────────────────────

describe('parseExtendsSpec', () => {
  it('parses github:owner/repo', () => {
    const s = parseExtendsSpec('github:auki/worlds');
    expect(s).toEqual({
      raw: 'github:auki/worlds',
      kind: 'github',
      owner: 'auki',
      repo: 'worlds',
      ref: 'HEAD',
      subpath: '',
    });
  });

  it('parses github:owner/repo@ref', () => {
    const s = parseExtendsSpec('github:auki/worlds@main');
    expect(s?.ref).toBe('main');
    expect(s?.subpath).toBe('');
  });

  it('parses github:owner/repo@ref:subpath', () => {
    const s = parseExtendsSpec('github:auki/worlds@v1.0:worlds/');
    expect(s?.ref).toBe('v1.0');
    expect(s?.subpath).toBe('worlds/');
  });

  it('parses relative local path', () => {
    const s = parseExtendsSpec('./shared/worlds');
    expect(s?.kind).toBe('local');
    expect(s?.path).toBe('./shared/worlds');
  });

  it('parses absolute local path', () => {
    const s = parseExtendsSpec('/abs/path');
    expect(s?.kind).toBe('local');
    expect(s?.path).toBe('/abs/path');
  });

  it('rejects unrecognized specs', () => {
    expect(parseExtendsSpec('http://example.com')).toBeNull();
    expect(parseExtendsSpec('random-string')).toBeNull();
    expect(parseExtendsSpec('')).toBeNull();
  });
});

// ─── loadExtendsConfig ─────────────────────────────────────────────────────

describe('loadExtendsConfig', () => {
  it('returns null when no config exists', () => {
    expect(loadExtendsConfig(TEST_ROOT)).toBeNull();
  });

  it('loads a valid config', () => {
    mkdirSync(join(TEST_ROOT, '.neuroverse'), { recursive: true });
    writeFileSync(
      join(TEST_ROOT, '.neuroverse', 'config.json'),
      JSON.stringify({ extends: ['github:auki/worlds'] }),
    );
    expect(loadExtendsConfig(TEST_ROOT)).toEqual({ extends: ['github:auki/worlds'] });
  });

  it('returns null on malformed JSON', () => {
    mkdirSync(join(TEST_ROOT, '.neuroverse'), { recursive: true });
    writeFileSync(join(TEST_ROOT, '.neuroverse', 'config.json'), '{ broken');
    expect(loadExtendsConfig(TEST_ROOT)).toBeNull();
  });
});

// ─── resolveExtendsSpec: local ─────────────────────────────────────────────

describe('resolveExtendsSpec (local)', () => {
  it('resolves a relative path under the repo', () => {
    const worldsDir = join(TEST_ROOT, 'shared');
    writeWorld(worldsDir, 'team', '# team world');
    const spec = parseExtendsSpec('./shared')!;
    const r = resolveExtendsSpec(spec, TEST_ROOT);
    expect(r.dir).toBe(worldsDir);
    expect(r.warning).toBeUndefined();
  });

  it('warns when local path is missing', () => {
    const spec = parseExtendsSpec('./nope')!;
    const r = resolveExtendsSpec(spec, TEST_ROOT);
    expect(r.dir).toBeNull();
    expect(r.warning).toMatch(/not found/);
  });
});

// ─── resolveExtendsSpec: github (with stub fetcher) ────────────────────────

describe('resolveExtendsSpec (github, stubbed)', () => {
  it('fetches and resolves to cache', () => {
    const cacheDir = join(TEST_ROOT, 'cache');
    const spec = parseExtendsSpec('github:auki/worlds')!;

    const fetcher: Fetcher = (_s, dest) => {
      const worldsDir = join(dest, 'worlds');
      mkdirSync(worldsDir, { recursive: true });
      writeFileSync(join(worldsDir, 'auki.worldmodel.md'), '# auki org world');
    };

    const r = resolveExtendsSpec(spec, TEST_ROOT, { cacheDir, fetcher });
    expect(r.dir).toBeTruthy();
    // When spec has no subpath and ./worlds/ exists, resolver prefers it
    expect(r.dir).toBe(join(getCacheDir(spec, cacheDir), 'worlds'));
    expect(existsSync(join(r.dir!, 'auki.worldmodel.md'))).toBe(true);
  });

  it('reuses fresh cache on second call', () => {
    const cacheDir = join(TEST_ROOT, 'cache');
    const spec = parseExtendsSpec('github:auki/worlds')!;

    let calls = 0;
    const fetcher: Fetcher = (_s, dest) => {
      calls += 1;
      mkdirSync(join(dest, 'worlds'), { recursive: true });
      writeFileSync(join(dest, 'worlds', 'x.worldmodel.md'), '# x');
    };

    resolveExtendsSpec(spec, TEST_ROOT, { cacheDir, fetcher });
    resolveExtendsSpec(spec, TEST_ROOT, { cacheDir, fetcher });
    expect(calls).toBe(1);
  });

  it('refetches when forceRefresh=true', () => {
    const cacheDir = join(TEST_ROOT, 'cache');
    const spec = parseExtendsSpec('github:auki/worlds')!;

    let calls = 0;
    const fetcher: Fetcher = (_s, dest) => {
      calls += 1;
      mkdirSync(join(dest, 'worlds'), { recursive: true });
      writeFileSync(join(dest, 'worlds', 'x.worldmodel.md'), '# x');
    };

    resolveExtendsSpec(spec, TEST_ROOT, { cacheDir, fetcher });
    resolveExtendsSpec(spec, TEST_ROOT, { cacheDir, fetcher, forceRefresh: true });
    expect(calls).toBe(2);
  });

  it('respects noFetch: uses stale cache if present', () => {
    const cacheDir = join(TEST_ROOT, 'cache');
    const spec = parseExtendsSpec('github:auki/worlds')!;

    // Pre-populate cache
    const fetcher: Fetcher = (_s, dest) => {
      mkdirSync(join(dest, 'worlds'), { recursive: true });
      writeFileSync(join(dest, 'worlds', 'x.worldmodel.md'), '# x');
    };
    resolveExtendsSpec(spec, TEST_ROOT, { cacheDir, fetcher });

    // Now noFetch with ttl=0 (so "fresh" check fails) — should still use cache
    let calls = 0;
    const blockedFetcher: Fetcher = () => {
      calls += 1;
      throw new Error('should not fetch');
    };
    const r = resolveExtendsSpec(spec, TEST_ROOT, {
      cacheDir,
      fetcher: blockedFetcher,
      ttlMs: 0,
      noFetch: true,
    });
    expect(calls).toBe(0);
    expect(r.dir).toBeTruthy();
  });

  it('warns when noFetch and no cache', () => {
    const spec = parseExtendsSpec('github:auki/worlds')!;
    const r = resolveExtendsSpec(spec, TEST_ROOT, {
      cacheDir: join(TEST_ROOT, 'empty-cache'),
      noFetch: true,
    });
    expect(r.dir).toBeNull();
    expect(r.warning).toMatch(/NEUROVERSE_NO_FETCH/);
  });

  it('uses stale cache on fetch failure with a warning', () => {
    const cacheDir = join(TEST_ROOT, 'cache');
    const spec = parseExtendsSpec('github:auki/worlds')!;

    // Populate cache
    const fetcher: Fetcher = (_s, dest) => {
      mkdirSync(join(dest, 'worlds'), { recursive: true });
      writeFileSync(join(dest, 'worlds', 'x.worldmodel.md'), '# x');
    };
    resolveExtendsSpec(spec, TEST_ROOT, { cacheDir, fetcher });

    // Now fail the fetch with forceRefresh
    const failingFetcher: Fetcher = () => {
      throw new Error('network down');
    };
    const r = resolveExtendsSpec(spec, TEST_ROOT, {
      cacheDir,
      fetcher: failingFetcher,
      forceRefresh: true,
    });
    expect(r.dir).toBeTruthy();
    expect(r.warning).toMatch(/fetch failed/);
  });
});

// ─── resolveAllExtends ─────────────────────────────────────────────────────

describe('resolveAllExtends', () => {
  it('resolves every spec from config.json', () => {
    const worldsA = join(TEST_ROOT, 'a');
    writeWorld(worldsA, 'a', '# a');
    const worldsB = join(TEST_ROOT, 'b');
    writeWorld(worldsB, 'b', '# b');

    mkdirSync(join(TEST_ROOT, '.neuroverse'), { recursive: true });
    writeFileSync(
      join(TEST_ROOT, '.neuroverse', 'config.json'),
      JSON.stringify({ extends: ['./a', './b'] }),
    );

    const results = resolveAllExtends(TEST_ROOT);
    expect(results).toHaveLength(2);
    expect(results[0].dir).toBe(worldsA);
    expect(results[1].dir).toBe(worldsB);
  });

  it('returns empty when no config', () => {
    expect(resolveAllExtends(TEST_ROOT)).toEqual([]);
  });

  it('flags unparseable specs', () => {
    mkdirSync(join(TEST_ROOT, '.neuroverse'), { recursive: true });
    writeFileSync(
      join(TEST_ROOT, '.neuroverse', 'config.json'),
      JSON.stringify({ extends: ['nonsense-spec'] }),
    );
    const results = resolveAllExtends(TEST_ROOT);
    expect(results[0].dir).toBeNull();
    expect(results[0].warning).toMatch(/unparseable/);
  });
});

// ─── discoverWorlds integration ────────────────────────────────────────────

describe('discoverWorlds with extends', () => {
  it('loads extends worlds with source=extends and extendsFrom set', () => {
    const repoDir = join(TEST_ROOT, 'repo');
    mkdirSync(repoDir, { recursive: true });
    const shared = join(TEST_ROOT, 'shared');
    writeWorld(shared, 'org', '# org truth');

    mkdirSync(join(repoDir, '.neuroverse'), { recursive: true });
    writeFileSync(
      join(repoDir, '.neuroverse', 'config.json'),
      JSON.stringify({ extends: [shared] }),
    );

    const stack = discoverWorlds({
      repoDir,
      userWorldsDir: join(TEST_ROOT, 'no-user-dir'),
    });

    const extendsWorld = stack.worlds.find((w) => w.source === 'extends');
    expect(extendsWorld).toBeDefined();
    expect(extendsWorld!.name).toBe('org');
    expect(extendsWorld!.extendsFrom).toBe(shared);
    expect(stack.combinedContent).toContain('# org truth');
  });

  it('orders tiers user → extends → repo', () => {
    const userDir = join(TEST_ROOT, 'user');
    writeWorld(userDir, 'personal', '# personal');

    const repoDir = join(TEST_ROOT, 'repo');
    const repoWorlds = join(repoDir, 'worlds');
    writeWorld(repoWorlds, 'local', '# local override');

    const shared = join(TEST_ROOT, 'shared');
    writeWorld(shared, 'org', '# org truth');

    mkdirSync(join(repoDir, '.neuroverse'), { recursive: true });
    writeFileSync(
      join(repoDir, '.neuroverse', 'config.json'),
      JSON.stringify({ extends: [shared] }),
    );

    const stack = discoverWorlds({ repoDir, userWorldsDir: userDir });
    const sources = stack.worlds.map((w) => w.source);
    expect(sources).toEqual(['user', 'extends', 'repo']);
  });

  it('disableExtends skips the extends tier', () => {
    const repoDir = join(TEST_ROOT, 'repo');
    mkdirSync(repoDir, { recursive: true });
    const shared = join(TEST_ROOT, 'shared');
    writeWorld(shared, 'org', '# org');
    mkdirSync(join(repoDir, '.neuroverse'), { recursive: true });
    writeFileSync(
      join(repoDir, '.neuroverse', 'config.json'),
      JSON.stringify({ extends: [shared] }),
    );

    const stack = discoverWorlds({
      repoDir,
      userWorldsDir: join(TEST_ROOT, 'no-user'),
      disableExtends: true,
    });
    expect(stack.worlds.find((w) => w.source === 'extends')).toBeUndefined();
  });

  it('propagates warnings from failed extends', () => {
    const repoDir = join(TEST_ROOT, 'repo');
    mkdirSync(join(repoDir, '.neuroverse'), { recursive: true });
    writeFileSync(
      join(repoDir, '.neuroverse', 'config.json'),
      JSON.stringify({ extends: ['./missing-dir'] }),
    );

    const stack = discoverWorlds({
      repoDir,
      userWorldsDir: join(TEST_ROOT, 'no-user'),
    });
    expect(stack.warnings.length).toBeGreaterThan(0);
    expect(stack.warnings[0]).toMatch(/not found/);
  });

  it('uses stubbed fetcher to avoid network', () => {
    const repoDir = join(TEST_ROOT, 'repo');
    mkdirSync(join(repoDir, '.neuroverse'), { recursive: true });
    writeFileSync(
      join(repoDir, '.neuroverse', 'config.json'),
      JSON.stringify({ extends: ['github:auki/worlds'] }),
    );

    const stubFetcher: Fetcher = (_s, dest) => {
      const w = join(dest, 'worlds');
      mkdirSync(w, { recursive: true });
      writeFileSync(join(w, 'auki.worldmodel.md'), '# auki');
    };

    const stack = discoverWorlds({
      repoDir,
      userWorldsDir: join(TEST_ROOT, 'no-user'),
      extendsCacheDir: join(TEST_ROOT, 'cache'),
      extendsFetcher: stubFetcher,
    });

    const ext = stack.worlds.find((w) => w.source === 'extends');
    expect(ext).toBeDefined();
    expect(ext!.name).toBe('auki');
    expect(ext!.extendsFrom).toBe('github:auki/worlds');
  });

  it('explicitWorldsDir bypasses extends', () => {
    const repoDir = join(TEST_ROOT, 'repo');
    mkdirSync(join(repoDir, '.neuroverse'), { recursive: true });
    const shared = join(TEST_ROOT, 'shared');
    writeWorld(shared, 'org', '# org');
    writeFileSync(
      join(repoDir, '.neuroverse', 'config.json'),
      JSON.stringify({ extends: [shared] }),
    );
    const explicit = join(TEST_ROOT, 'explicit');
    writeWorld(explicit, 'explicit', '# explicit');

    const stack = discoverWorlds({
      repoDir,
      userWorldsDir: join(TEST_ROOT, 'no-user'),
      explicitWorldsDir: explicit,
    });

    expect(stack.worlds.map((w) => w.source)).not.toContain('extends');
    expect(stack.worlds.map((w) => w.name)).toContain('explicit');
  });
});

// ─── Regression: WorldStack shape ──────────────────────────────────────────

describe('WorldStack shape', () => {
  it('always returns warnings array', () => {
    const stack = discoverWorlds({ userWorldsDir: join(TEST_ROOT, 'no-user') });
    expect(Array.isArray(stack.warnings)).toBe(true);
  });

  it('combinedContent annotates extends source', () => {
    const repoDir = join(TEST_ROOT, 'repo');
    mkdirSync(repoDir, { recursive: true });
    const shared = join(TEST_ROOT, 'shared');
    writeWorld(shared, 'org', '# org truth');
    mkdirSync(join(repoDir, '.neuroverse'), { recursive: true });
    writeFileSync(
      join(repoDir, '.neuroverse', 'config.json'),
      JSON.stringify({ extends: [shared] }),
    );

    const stack = discoverWorlds({
      repoDir,
      userWorldsDir: join(TEST_ROOT, 'no-user'),
    });
    expect(stack.combinedContent).toMatch(/extends/);
    expect(stack.combinedContent).toContain(shared);
  });
});

// silence unused import warning
void readFileSync;
