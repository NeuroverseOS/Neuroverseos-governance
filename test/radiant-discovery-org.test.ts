import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  parseRemoteUrl,
  readOriginRemote,
  getRepoOrigin,
} from '../src/radiant/core/git-remote';
import { detectOrgExtendsSpec, type Fetcher } from '../src/radiant/core/extends';
import { discoverWorlds } from '../src/radiant/core/discovery';

const TEST_ROOT = join(tmpdir(), 'nv-org-test');

beforeEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
  mkdirSync(TEST_ROOT, { recursive: true });
  delete process.env.NEUROVERSE_NO_ORG;
  delete process.env.NEUROVERSE_REFRESH;
  delete process.env.NEUROVERSE_NO_FETCH;
});

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
  delete process.env.NEUROVERSE_NO_ORG;
  delete process.env.NEUROVERSE_REFRESH;
  delete process.env.NEUROVERSE_NO_FETCH;
});

function makeRepo(dir: string, remoteUrl: string | null) {
  mkdirSync(join(dir, '.git'), { recursive: true });
  if (remoteUrl !== null) {
    writeFileSync(
      join(dir, '.git', 'config'),
      `[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = ${remoteUrl}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`,
    );
  } else {
    writeFileSync(join(dir, '.git', 'config'), `[core]\n\trepositoryformatversion = 0\n`);
  }
}

// ─── parseRemoteUrl ────────────────────────────────────────────────────────

describe('parseRemoteUrl', () => {
  it('parses https github URL', () => {
    expect(parseRemoteUrl('https://github.com/NeuroverseOS/governance.git')).toEqual({
      host: 'github.com',
      owner: 'NeuroverseOS',
      repo: 'governance',
    });
  });

  it('parses https without .git suffix', () => {
    expect(parseRemoteUrl('https://github.com/NeuroverseOS/governance')).toEqual({
      host: 'github.com',
      owner: 'NeuroverseOS',
      repo: 'governance',
    });
  });

  it('parses ssh git@host:owner/repo', () => {
    expect(parseRemoteUrl('git@github.com:NeuroverseOS/governance.git')).toEqual({
      host: 'github.com',
      owner: 'NeuroverseOS',
      repo: 'governance',
    });
  });

  it('parses ssh:// protocol form', () => {
    expect(parseRemoteUrl('ssh://git@github.com/NeuroverseOS/governance.git')).toEqual({
      host: 'github.com',
      owner: 'NeuroverseOS',
      repo: 'governance',
    });
  });

  it('handles https with embedded credentials', () => {
    expect(parseRemoteUrl('https://user@github.com/NeuroverseOS/governance.git')).toEqual({
      host: 'github.com',
      owner: 'NeuroverseOS',
      repo: 'governance',
    });
  });

  it('handles non-github hosts', () => {
    expect(parseRemoteUrl('https://gitlab.com/myorg/myrepo.git')).toEqual({
      host: 'gitlab.com',
      owner: 'myorg',
      repo: 'myrepo',
    });
  });

  it('returns null for unparseable URLs', () => {
    expect(parseRemoteUrl('')).toBeNull();
    expect(parseRemoteUrl('not a url')).toBeNull();
  });
});

// ─── readOriginRemote ──────────────────────────────────────────────────────

describe('readOriginRemote', () => {
  it('returns null when no .git exists', () => {
    expect(readOriginRemote(TEST_ROOT)).toBeNull();
  });

  it('returns null when no remote origin is set', () => {
    makeRepo(TEST_ROOT, null);
    expect(readOriginRemote(TEST_ROOT)).toBeNull();
  });

  it('returns the origin URL', () => {
    makeRepo(TEST_ROOT, 'git@github.com:NeuroverseOS/foo.git');
    expect(readOriginRemote(TEST_ROOT)).toBe('git@github.com:NeuroverseOS/foo.git');
  });

  it('follows gitdir file to resolve worktree config', () => {
    const realGit = join(TEST_ROOT, 'real-git');
    mkdirSync(realGit, { recursive: true });
    writeFileSync(
      join(realGit, 'config'),
      `[remote "origin"]\n\turl = https://github.com/NeuroverseOS/bar.git\n`,
    );
    const worktree = join(TEST_ROOT, 'worktree');
    mkdirSync(worktree, { recursive: true });
    writeFileSync(join(worktree, '.git'), `gitdir: ${realGit}\n`);
    expect(readOriginRemote(worktree)).toBe('https://github.com/NeuroverseOS/bar.git');
  });
});

// ─── getRepoOrigin ─────────────────────────────────────────────────────────

describe('getRepoOrigin', () => {
  it('combines read + parse', () => {
    makeRepo(TEST_ROOT, 'https://github.com/NeuroverseOS/governance.git');
    expect(getRepoOrigin(TEST_ROOT)).toEqual({
      host: 'github.com',
      owner: 'NeuroverseOS',
      repo: 'governance',
    });
  });

  it('returns null when no remote', () => {
    expect(getRepoOrigin(TEST_ROOT)).toBeNull();
  });
});

// ─── detectOrgExtendsSpec ──────────────────────────────────────────────────

describe('detectOrgExtendsSpec', () => {
  it('returns spec for github org', () => {
    makeRepo(TEST_ROOT, 'git@github.com:NeuroverseOS/foo.git');
    expect(detectOrgExtendsSpec(TEST_ROOT)).toEqual({
      raw: 'github:NeuroverseOS/worlds',
      kind: 'github',
      owner: 'NeuroverseOS',
      repo: 'worlds',
      ref: 'HEAD',
      subpath: '',
    });
  });

  it('returns null for non-github host', () => {
    makeRepo(TEST_ROOT, 'https://gitlab.com/NeuroverseOS/foo.git');
    expect(detectOrgExtendsSpec(TEST_ROOT)).toBeNull();
  });

  it('returns null when current repo IS the worlds repo (self-reference)', () => {
    makeRepo(TEST_ROOT, 'git@github.com:NeuroverseOS/worlds.git');
    expect(detectOrgExtendsSpec(TEST_ROOT)).toBeNull();
  });

  it('returns null when no git', () => {
    expect(detectOrgExtendsSpec(TEST_ROOT)).toBeNull();
  });
});

// ─── discoverWorlds integration ────────────────────────────────────────────

describe('discoverWorlds with org tier', () => {
  it('auto-loads org worlds from git remote', () => {
    const repoDir = join(TEST_ROOT, 'consumer');
    makeRepo(repoDir, 'git@github.com:NeuroverseOS/somerepo.git');

    const stubFetcher: Fetcher = (_s, dest) => {
      const w = join(dest, 'worlds');
      mkdirSync(w, { recursive: true });
      writeFileSync(
        join(w, 'neuroverseos-sovereign-conduit.worldmodel.md'),
        '# NeuroverseOS sovereign conduit',
      );
    };

    const stack = discoverWorlds({
      repoDir,
      userWorldsDir: join(TEST_ROOT, 'no-user'),
      extendsCacheDir: join(TEST_ROOT, 'cache'),
      extendsFetcher: stubFetcher,
    });

    const orgWorld = stack.worlds.find((w) => w.source === 'org');
    expect(orgWorld).toBeDefined();
    expect(orgWorld!.name).toBe('neuroverseos-sovereign-conduit');
    expect(orgWorld!.extendsFrom).toBe('github:NeuroverseOS/worlds');
    expect(stack.combinedContent).toContain('# NeuroverseOS sovereign conduit');
  });

  it('silently skips when org/worlds does not exist (no warning)', () => {
    const repoDir = join(TEST_ROOT, 'consumer');
    makeRepo(repoDir, 'git@github.com:NeuroverseOS/somerepo.git');

    const failingFetcher: Fetcher = () => {
      throw new Error('404 not found');
    };

    const stack = discoverWorlds({
      repoDir,
      userWorldsDir: join(TEST_ROOT, 'no-user'),
      extendsCacheDir: join(TEST_ROOT, 'cache'),
      extendsFetcher: failingFetcher,
    });

    expect(stack.worlds.find((w) => w.source === 'org')).toBeUndefined();
    expect(stack.warnings).toHaveLength(0);
  });

  it('NEUROVERSE_NO_ORG disables the tier', () => {
    const repoDir = join(TEST_ROOT, 'consumer');
    makeRepo(repoDir, 'git@github.com:NeuroverseOS/somerepo.git');

    process.env.NEUROVERSE_NO_ORG = '1';

    const stubFetcher: Fetcher = (_s, dest) => {
      const w = join(dest, 'worlds');
      mkdirSync(w, { recursive: true });
      writeFileSync(join(w, 'x.worldmodel.md'), '# x');
    };

    const stack = discoverWorlds({
      repoDir,
      userWorldsDir: join(TEST_ROOT, 'no-user'),
      extendsCacheDir: join(TEST_ROOT, 'cache'),
      extendsFetcher: stubFetcher,
    });

    expect(stack.worlds.find((w) => w.source === 'org')).toBeUndefined();
  });

  it('disableOrg option skips the tier', () => {
    const repoDir = join(TEST_ROOT, 'consumer');
    makeRepo(repoDir, 'git@github.com:NeuroverseOS/somerepo.git');

    const stubFetcher: Fetcher = (_s, dest) => {
      const w = join(dest, 'worlds');
      mkdirSync(w, { recursive: true });
      writeFileSync(join(w, 'x.worldmodel.md'), '# x');
    };

    const stack = discoverWorlds({
      repoDir,
      userWorldsDir: join(TEST_ROOT, 'no-user'),
      extendsCacheDir: join(TEST_ROOT, 'cache'),
      extendsFetcher: stubFetcher,
      disableOrg: true,
    });

    expect(stack.worlds.find((w) => w.source === 'org')).toBeUndefined();
  });

  it('org tier does not fire when repo IS the worlds repo', () => {
    const repoDir = join(TEST_ROOT, 'worlds-repo');
    makeRepo(repoDir, 'git@github.com:NeuroverseOS/worlds.git');

    const stack = discoverWorlds({
      repoDir,
      userWorldsDir: join(TEST_ROOT, 'no-user'),
      extendsCacheDir: join(TEST_ROOT, 'cache'),
      extendsFetcher: () => {
        throw new Error('should not be called');
      },
    });

    expect(stack.worlds.find((w) => w.source === 'org')).toBeUndefined();
  });

  it('orders tiers user → org → extends → repo', () => {
    const userDir = join(TEST_ROOT, 'user');
    mkdirSync(userDir, { recursive: true });
    writeFileSync(join(userDir, 'personal.worldmodel.md'), '# personal');

    const repoDir = join(TEST_ROOT, 'repo');
    makeRepo(repoDir, 'git@github.com:NeuroverseOS/somerepo.git');

    const repoWorldsDir = join(repoDir, 'worlds');
    mkdirSync(repoWorldsDir, { recursive: true });
    writeFileSync(join(repoWorldsDir, 'local.worldmodel.md'), '# local');

    const extendsLocal = join(TEST_ROOT, 'shared');
    mkdirSync(extendsLocal, { recursive: true });
    writeFileSync(join(extendsLocal, 'shared.worldmodel.md'), '# shared');
    mkdirSync(join(repoDir, '.neuroverse'), { recursive: true });
    writeFileSync(
      join(repoDir, '.neuroverse', 'config.json'),
      JSON.stringify({ extends: [extendsLocal] }),
    );

    const stubFetcher: Fetcher = (_s, dest) => {
      const w = join(dest, 'worlds');
      mkdirSync(w, { recursive: true });
      writeFileSync(join(w, 'org.worldmodel.md'), '# org');
    };

    const stack = discoverWorlds({
      repoDir,
      userWorldsDir: userDir,
      extendsCacheDir: join(TEST_ROOT, 'cache'),
      extendsFetcher: stubFetcher,
    });

    expect(stack.worlds.map((w) => w.source)).toEqual(['user', 'org', 'extends', 'repo']);
  });
});
