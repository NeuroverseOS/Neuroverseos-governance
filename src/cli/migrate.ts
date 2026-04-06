/**
 * neuroverse migrate — World Schema Version Migration
 *
 * Detects the current schema version of a world directory and applies
 * any necessary migrations to bring it to the latest version.
 *
 * Migrations are declarative, pure functions: (oldWorld) => newWorld.
 * Each migration is reversible (backup before apply).
 *
 * Usage:
 *   neuroverse migrate --world <dir> [--dry-run] [--backup] [--target <version>]
 */

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'fs';
import { join, basename } from 'path';

const USAGE = `
neuroverse migrate — World schema version migration

Usage:
  neuroverse migrate --world <dir> [options]

Options:
  --world <dir>       World directory to migrate (required)
  --dry-run           Show what would change without modifying files
  --backup            Copy original world to <dir>.backup before migrating
  --target <version>  Target schema version (default: latest)
  --json              Output migration plan as JSON

Examples:
  neuroverse migrate --world ./world/ --dry-run
  neuroverse migrate --world ./world/ --backup
  neuroverse migrate --world ./world/ --target 1.1.0
`.trim();

// ─── Migration Registry ─────────────────────────────────────────────────────

export interface Migration {
  from: string;
  to: string;
  description: string;
  /** Apply transforms to files in the world directory */
  apply: (worldPath: string) => MigrationChange[];
}

export interface MigrationChange {
  file: string;
  action: 'modified' | 'added' | 'removed';
  description: string;
}

export interface MigrationPlan {
  currentVersion: string;
  targetVersion: string;
  migrations: { from: string; to: string; description: string }[];
  changes: MigrationChange[];
}

/**
 * Registry of all migrations, ordered by version.
 * Add new migrations here as the schema evolves.
 */
const MIGRATIONS: Migration[] = [
  {
    from: '1.0.0',
    to: '1.1.0',
    description: 'Add enforcement_level to world.json, normalize metadata fields',
    apply: (worldPath: string): MigrationChange[] => {
      const changes: MigrationChange[] = [];

      // Add enforcement_level to world.json if missing
      const worldJsonPath = join(worldPath, 'world.json');
      if (existsSync(worldJsonPath)) {
        const world = JSON.parse(readFileSync(worldJsonPath, 'utf-8'));
        if (!world.enforcement_level) {
          world.enforcement_level = 'standard';
          writeFileSync(worldJsonPath, JSON.stringify(world, null, 2) + '\n', 'utf-8');
          changes.push({
            file: 'world.json',
            action: 'modified',
            description: 'Added enforcement_level: "standard"',
          });
        }
      }

      // Normalize metadata.json
      const metaPath = join(worldPath, 'metadata.json');
      if (existsSync(metaPath)) {
        const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
        let modified = false;

        // Rename configurator_version → authoring_method if present
        if (meta.configurator_version && !meta.authoring_method) {
          meta.authoring_method = meta.configurator_version;
          delete meta.configurator_version;
          modified = true;
        }

        // Ensure schema_version is present
        if (!meta.schema_version) {
          meta.schema_version = '1.1.0';
          modified = true;
        } else {
          meta.schema_version = '1.1.0';
          modified = true;
        }

        if (modified) {
          writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf-8');
          changes.push({
            file: 'metadata.json',
            action: 'modified',
            description: 'Normalized metadata fields, updated schema_version to 1.1.0',
          });
        }
      }

      return changes;
    },
  },
];

/** The latest schema version */
export const LATEST_VERSION = MIGRATIONS.length > 0
  ? MIGRATIONS[MIGRATIONS.length - 1].to
  : '1.0.0';

// ─── Version Utilities ──────────────────────────────────────────────────────

function detectVersion(worldPath: string): string {
  const metaPath = join(worldPath, 'metadata.json');
  if (existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      if (meta.schema_version) return meta.schema_version;
    } catch { /* fall through */ }
  }
  return '1.0.0'; // default for worlds without explicit version
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return -1;
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return 1;
  }
  return 0;
}

function findMigrationPath(from: string, to: string): Migration[] {
  const path: Migration[] = [];
  let current = from;

  while (compareVersions(current, to) < 0) {
    const next = MIGRATIONS.find(m => m.from === current);
    if (!next) break;
    path.push(next);
    current = next.to;
  }

  return path;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]) {
  let worldPath = '';
  let dryRun = false;
  let backup = false;
  let target = LATEST_VERSION;
  let json = false;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--world' && argv[i + 1]) {
      worldPath = argv[++i];
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--backup') {
      backup = true;
    } else if (arg === '--target' && argv[i + 1]) {
      target = argv[++i];
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--help' || arg === '-h') {
      help = true;
    }
  }

  return { worldPath, dryRun, backup, target, json, help };
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);

  if (args.help) {
    process.stdout.write(USAGE + '\n');
    return;
  }

  if (!args.worldPath) {
    process.stderr.write('Error: --world <dir> is required.\n');
    process.exit(1);
  }

  const currentVersion = detectVersion(args.worldPath);
  const targetVersion = args.target;

  if (compareVersions(currentVersion, targetVersion) >= 0) {
    const plan: MigrationPlan = {
      currentVersion,
      targetVersion,
      migrations: [],
      changes: [],
    };

    if (args.json) {
      process.stdout.write(JSON.stringify(plan, null, 2) + '\n');
    } else {
      process.stdout.write(`World is already at version ${currentVersion} (target: ${targetVersion})\n`);
      process.stdout.write('No migrations needed.\n');
    }
    return;
  }

  const migrationPath = findMigrationPath(currentVersion, targetVersion);

  if (migrationPath.length === 0) {
    process.stderr.write(`No migration path from ${currentVersion} to ${targetVersion}\n`);
    process.exit(1);
    return;
  }

  // Dry run: show plan without applying
  if (args.dryRun) {
    const plan: MigrationPlan = {
      currentVersion,
      targetVersion,
      migrations: migrationPath.map(m => ({ from: m.from, to: m.to, description: m.description })),
      changes: [],
    };

    if (args.json) {
      process.stdout.write(JSON.stringify(plan, null, 2) + '\n');
    } else {
      process.stdout.write(`Migration plan: ${currentVersion} → ${targetVersion}\n`);
      process.stdout.write(`Steps: ${migrationPath.length}\n\n`);
      for (const m of migrationPath) {
        process.stdout.write(`  ${m.from} → ${m.to}: ${m.description}\n`);
      }
      process.stdout.write('\nRun without --dry-run to apply.\n');
    }
    return;
  }

  // Backup
  if (args.backup) {
    const backupPath = args.worldPath + '.backup';
    cpSync(args.worldPath, backupPath, { recursive: true });
    process.stdout.write(`Backup created: ${backupPath}\n`);
  }

  // Apply migrations
  const allChanges: MigrationChange[] = [];
  for (const migration of migrationPath) {
    process.stdout.write(`Applying: ${migration.from} → ${migration.to} (${migration.description})\n`);
    const changes = migration.apply(args.worldPath);
    allChanges.push(...changes);
    for (const change of changes) {
      process.stdout.write(`  ${change.action}: ${change.file} — ${change.description}\n`);
    }
  }

  const plan: MigrationPlan = {
    currentVersion,
    targetVersion,
    migrations: migrationPath.map(m => ({ from: m.from, to: m.to, description: m.description })),
    changes: allChanges,
  };

  if (args.json) {
    process.stdout.write(JSON.stringify(plan, null, 2) + '\n');
  }

  process.stdout.write(`\nMigration complete: ${currentVersion} → ${targetVersion} (${allChanges.length} changes)\n`);
}
