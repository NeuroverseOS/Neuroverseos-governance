/**
 * neuroverse sign — Sign a World Artifact
 *
 * Creates a cryptographic signature over all files in a world directory.
 * Produces .nv-signature.json containing a SHA-256 manifest + Ed25519 signature.
 *
 * Usage:
 *   neuroverse sign --world <dir> [--key <path>]
 *
 * The signature covers every file in the world directory (excluding .nv-signature.json).
 * Any file change after signing invalidates the signature.
 */

import { createHash, sign } from 'crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { homedir } from 'os';

const USAGE = `
neuroverse sign — Sign a world artifact

Usage:
  neuroverse sign --world <dir> [--key <path>]

Options:
  --world <dir>    World directory to sign (required)
  --key <path>     Private key path (default: ~/.neuroverse/keys/neuroverse.key)

Examples:
  neuroverse sign --world ./world/
  neuroverse sign --world ./world/ --key ./keys/production.key
`.trim();

export interface WorldManifest {
  /** Schema version for the signature format */
  signatureVersion: '1.0';
  /** ISO 8601 timestamp of signing */
  signedAt: string;
  /** SHA-256 hashes of each file in the world directory */
  files: Record<string, string>;
  /** SHA-256 of the canonical manifest string (for verification) */
  manifestHash: string;
  /** Ed25519 signature of the manifest hash (base64) */
  signature: string;
}

function parseArgs(argv: string[]) {
  let worldPath = '';
  let keyPath = join(homedir(), '.neuroverse', 'keys', 'neuroverse.key');
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--world' && argv[i + 1]) {
      worldPath = argv[++i];
    } else if (arg === '--key' && argv[i + 1]) {
      keyPath = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      help = true;
    }
  }

  return { worldPath, keyPath, help };
}

/**
 * Recursively collect all files in a directory, returning relative paths sorted.
 */
function collectFiles(dir: string, base?: string): string[] {
  const root = base ?? dir;
  const files: string[] = [];

  for (const entry of readdirSync(dir)) {
    if (entry === '.nv-signature.json') continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...collectFiles(full, root));
    } else {
      files.push(relative(root, full));
    }
  }

  return files.sort();
}

/**
 * Build a SHA-256 manifest of all files in a world directory.
 */
export function buildManifest(worldPath: string): Record<string, string> {
  const files = collectFiles(worldPath);
  const manifest: Record<string, string> = {};

  for (const file of files) {
    const content = readFileSync(join(worldPath, file));
    manifest[file] = createHash('sha256').update(content).digest('hex');
  }

  return manifest;
}

/**
 * Produce a canonical string from the manifest for signing.
 * Sorted keys, deterministic JSON — same manifest always produces same string.
 */
export function canonicalManifest(files: Record<string, string>): string {
  const sorted = Object.keys(files).sort();
  return sorted.map(k => `${k}:${files[k]}`).join('\n');
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

  // Read private key
  let privateKey: string;
  try {
    privateKey = readFileSync(args.keyPath, 'utf-8');
  } catch {
    process.stderr.write(`Error: Cannot read private key at ${args.keyPath}\n`);
    process.stderr.write('Run "neuroverse keygen" to generate a keypair.\n');
    process.exit(1);
    return; // unreachable but satisfies TS
  }

  // Build manifest
  const files = buildManifest(args.worldPath);
  const canonical = canonicalManifest(files);
  const manifestHash = createHash('sha256').update(canonical).digest('hex');

  // Sign
  const signature = sign(null, Buffer.from(manifestHash), privateKey).toString('base64');

  const artifact: WorldManifest = {
    signatureVersion: '1.0',
    signedAt: new Date().toISOString(),
    files,
    manifestHash,
    signature,
  };

  const outPath = join(args.worldPath, '.nv-signature.json');
  writeFileSync(outPath, JSON.stringify(artifact, null, 2) + '\n', 'utf-8');

  process.stdout.write(`Signed ${Object.keys(files).length} files in ${args.worldPath}\n`);
  process.stdout.write(`Signature: ${outPath}\n`);
}
