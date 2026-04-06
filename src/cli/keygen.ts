/**
 * neuroverse keygen — Generate Ed25519 Signing Keypair
 *
 * Creates a keypair for signing world artifacts.
 * Keys are stored in ~/.neuroverse/keys/ by default.
 *
 * Usage:
 *   neuroverse keygen [--output <dir>] [--name <name>]
 *
 * Output:
 *   <dir>/<name>.pub    — Public key (share with verifiers)
 *   <dir>/<name>.key    — Private key (keep secret)
 */

import { generateKeyPairSync, randomBytes } from 'crypto';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const USAGE = `
neuroverse keygen — Generate Ed25519 signing keypair

Usage:
  neuroverse keygen [--output <dir>] [--name <name>]

Options:
  --output <dir>   Key directory (default: ~/.neuroverse/keys/)
  --name <name>    Key name (default: neuroverse)
  --force          Overwrite existing keys

Examples:
  neuroverse keygen
  neuroverse keygen --name production --output ./keys/
`.trim();

function parseArgs(argv: string[]) {
  let output = join(homedir(), '.neuroverse', 'keys');
  let name = 'neuroverse';
  let force = false;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === '--output' || arg === '-o') && argv[i + 1]) {
      output = argv[++i];
    } else if ((arg === '--name' || arg === '-n') && argv[i + 1]) {
      name = argv[++i];
    } else if (arg === '--force') {
      force = true;
    } else if (arg === '--help' || arg === '-h') {
      help = true;
    }
  }

  return { output, name, force, help };
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);

  if (args.help) {
    process.stdout.write(USAGE + '\n');
    return;
  }

  const pubPath = join(args.output, `${args.name}.pub`);
  const keyPath = join(args.output, `${args.name}.key`);

  if (!args.force && (existsSync(pubPath) || existsSync(keyPath))) {
    process.stderr.write(`Keys already exist at ${args.output}/${args.name}.*\n`);
    process.stderr.write('Use --force to overwrite.\n');
    process.exit(1);
  }

  // Generate Ed25519 keypair
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  mkdirSync(args.output, { recursive: true });
  writeFileSync(pubPath, publicKey, 'utf-8');
  writeFileSync(keyPath, privateKey, { encoding: 'utf-8', mode: 0o600 });

  process.stdout.write(`Keypair generated:\n`);
  process.stdout.write(`  Public:  ${pubPath}\n`);
  process.stdout.write(`  Private: ${keyPath}\n`);
  process.stdout.write(`\nShare the .pub file with anyone who needs to verify your worlds.\n`);
  process.stdout.write(`Keep the .key file secret.\n`);
}
