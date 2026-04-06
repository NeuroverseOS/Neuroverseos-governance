/**
 * neuroverse verify — Verify a Signed World Artifact
 *
 * Checks that a world directory matches its .nv-signature.json.
 * Exits 0 if valid, 1 if tampered or missing signature.
 *
 * Usage:
 *   neuroverse verify --world <dir> [--key <path>]
 */

import { createHash, verify } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { buildManifest, canonicalManifest } from './sign';
import type { WorldManifest } from './sign';

const USAGE = `
neuroverse verify — Verify a signed world artifact

Usage:
  neuroverse verify --world <dir> [--key <path>]

Options:
  --world <dir>    World directory to verify (required)
  --key <path>     Public key path (default: ~/.neuroverse/keys/neuroverse.pub)
  --json           Output result as JSON

Exit codes:
  0  Valid — world matches signature
  1  Invalid — signature mismatch, tampered files, or missing signature

Examples:
  neuroverse verify --world ./world/
  neuroverse verify --world ./world/ --key ./keys/production.pub
`.trim();

function parseArgs(argv: string[]) {
  let worldPath = '';
  let keyPath = join(homedir(), '.neuroverse', 'keys', 'neuroverse.pub');
  let json = false;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--world' && argv[i + 1]) {
      worldPath = argv[++i];
    } else if (arg === '--key' && argv[i + 1]) {
      keyPath = argv[++i];
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--help' || arg === '-h') {
      help = true;
    }
  }

  return { worldPath, keyPath, json, help };
}

export interface VerifyResult {
  valid: boolean;
  worldPath: string;
  signedAt?: string;
  fileCount: number;
  errors: string[];
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

  const result: VerifyResult = {
    valid: false,
    worldPath: args.worldPath,
    fileCount: 0,
    errors: [],
  };

  // Check signature file exists
  const sigPath = join(args.worldPath, '.nv-signature.json');
  if (!existsSync(sigPath)) {
    result.errors.push('No .nv-signature.json found — world is unsigned.');
    outputResult(result, args.json);
    process.exit(1);
  }

  // Parse signature
  let artifact: WorldManifest;
  try {
    artifact = JSON.parse(readFileSync(sigPath, 'utf-8'));
  } catch {
    result.errors.push('Cannot parse .nv-signature.json — file is corrupt.');
    outputResult(result, args.json);
    process.exit(1);
    return;
  }

  result.signedAt = artifact.signedAt;
  result.fileCount = Object.keys(artifact.files).length;

  // Read public key
  let publicKey: string;
  try {
    publicKey = readFileSync(args.keyPath, 'utf-8');
  } catch {
    result.errors.push(`Cannot read public key at ${args.keyPath}`);
    outputResult(result, args.json);
    process.exit(1);
    return;
  }

  // Rebuild manifest from current files
  const currentFiles = buildManifest(args.worldPath);

  // Check for added files
  for (const file of Object.keys(currentFiles)) {
    if (!(file in artifact.files)) {
      result.errors.push(`Added: ${file} (not in signature)`);
    }
  }

  // Check for removed or changed files
  for (const [file, hash] of Object.entries(artifact.files)) {
    if (!(file in currentFiles)) {
      result.errors.push(`Missing: ${file} (was in signature)`);
    } else if (currentFiles[file] !== hash) {
      result.errors.push(`Changed: ${file} (hash mismatch)`);
    }
  }

  if (result.errors.length > 0) {
    outputResult(result, args.json);
    process.exit(1);
    return;
  }

  // Verify manifest hash
  const canonical = canonicalManifest(artifact.files);
  const manifestHash = createHash('sha256').update(canonical).digest('hex');

  if (manifestHash !== artifact.manifestHash) {
    result.errors.push('Manifest hash mismatch — signature metadata is corrupt.');
    outputResult(result, args.json);
    process.exit(1);
    return;
  }

  // Verify Ed25519 signature
  const isValid = verify(null, Buffer.from(manifestHash), publicKey, Buffer.from(artifact.signature, 'base64'));

  if (!isValid) {
    result.errors.push('Signature verification failed — wrong key or tampered manifest.');
    outputResult(result, args.json);
    process.exit(1);
    return;
  }

  result.valid = true;
  outputResult(result, args.json);
}

function outputResult(result: VerifyResult, json: boolean): void {
  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }

  if (result.valid) {
    process.stdout.write(`VALID — ${result.fileCount} files verified\n`);
    process.stdout.write(`  Signed at: ${result.signedAt}\n`);
    process.stdout.write(`  World: ${result.worldPath}\n`);
  } else {
    process.stdout.write(`INVALID — signature verification failed\n`);
    for (const error of result.errors) {
      process.stdout.write(`  ${error}\n`);
    }
  }
}
