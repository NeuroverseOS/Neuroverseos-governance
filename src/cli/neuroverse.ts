#!/usr/bin/env node
/**
 * neuroverse — CLI Governance Tool
 *
 * Unified entrypoint that routes to subcommands.
 *
 * Usage:
 *   neuroverse init                    Scaffold a new .nv-world.md template
 *   neuroverse bootstrap               Compile .nv-world.md → world JSON files
 *   neuroverse validate                 Static analysis on world files
 *   neuroverse guard                    Runtime governance evaluation
 *
 * Run any command with --help for usage details.
 */

const USAGE = `
neuroverse — Behavioral governance for AI systems.

Behavioral modeling:
  worldmodel     Build behavioral models (init, validate, build, explain, infer)
  radiant        Behavioral intelligence for collaboration (think, emergent, lenses)
  lens           Manage behavioral lenses (list, preview, compile, compare, add)

Runtime governance:
  guard          Evaluate events against a world (stdin → stdout)
  plan           Plan enforcement (compile, check, status, advance, derive)
  run            Governed runtime (pipe mode or interactive chat)
  mcp            MCP governance server (for Claude, Cursor, etc.)

World management:
  world          Manage worlds (status, diff, snapshot, rollback, list)
  add            Add a guard, rule, or invariant to a world
  build          Build a world from markdown (derive + compile)
  validate       Static analysis on world files
  explain        Human-readable summary of a compiled world

Testing:
  test           Run guard simulation suite against a world
  redteam        Adversarial containment testing (agent escape detection)
  doctor         Environment sanity check

Administration:
  keygen         Generate Ed25519 signing keypair
  sign           Sign a world artifact
  verify         Verify a signed world artifact
  migrate        Migrate world schema between versions
  configure-ai   Configure AI provider credentials

Quick start:
  neuroverse worldmodel init --name "My Model"        Create a behavioral model
  neuroverse worldmodel build ./model.worldmodel.md   Compile it
  neuroverse radiant think --lens auki-builder \\
    --worlds ./worlds/ --query "..."                  Ask through the model
  neuroverse radiant emergent owner/repo \\
    --lens auki-builder --worlds ./worlds/             Behavioral read on a repo

Governance:
  echo '{"intent":"..."}' | neuroverse guard --world ./world/
  neuroverse plan compile plan.md --output plan.json
  neuroverse run --pipe --world ./world/ --plan plan.json
  neuroverse mcp --world ./world/ --plan plan.json
  neuroverse test --world ./world/ --fuzz --count 50
`.trim();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const subArgs = args.slice(1);

  switch (command) {
    case 'add': {
      const { main: addMain } = await import('./add');
      return addMain(subArgs);
    }
    case 'build': {
      const { main: buildMain } = await import('./build');
      return buildMain(subArgs);
    }
    case 'explain': {
      const { main: explainMain } = await import('./explain');
      return explainMain(subArgs);
    }
    case 'simulate': {
      const { main: simulateMain } = await import('./simulate');
      return simulateMain(subArgs);
    }
    case 'improve': {
      const { main: improveMain } = await import('./improve');
      return improveMain(subArgs);
    }
    case 'init': {
      process.stderr.write('\x1b[2mNote: `neuroverse init` scaffolds .nv-world.md files. For behavioral models, use `neuroverse worldmodel init` instead.\x1b[0m\n');
      const { main: initMain } = await import('./init');
      return initMain(subArgs);
    }
    case 'init-world': {
      const { main: initWorldMain } = await import('./init-world');
      return initWorldMain(subArgs);
    }
    case 'infer-world': {
      const { main: inferWorldMain } = await import('./infer-world');
      return inferWorldMain(subArgs);
    }
    case 'bootstrap': {
      process.stderr.write('\x1b[2mNote: `neuroverse bootstrap` compiles .nv-world.md files. For behavioral models, use `neuroverse worldmodel build` instead.\x1b[0m\n');
      const { main: bootstrapMain } = await import('./bootstrap');
      return bootstrapMain(subArgs);
    }
    case 'validate': {
      const { main: validateMain } = await import('./validate');
      return validateMain(subArgs);
    }
    case 'guard': {
      const { main: guardMain } = await import('./guard');
      return guardMain(subArgs);
    }
    case 'test': {
      const { main: testMain } = await import('./test');
      return testMain(subArgs);
    }
    case 'redteam': {
      const { main: redteamMain } = await import('./redteam');
      return redteamMain(subArgs);
    }
    case 'demo': {
      const { main: demoMain } = await import('./demo');
      return demoMain(subArgs);
    }
    case 'doctor': {
      const { main: doctorMain } = await import('./doctor');
      return doctorMain(subArgs);
    }
    case 'playground': {
      const { main: playgroundMain } = await import('./playground');
      return playgroundMain(subArgs);
    }
    case 'plan': {
      const { main: planMain } = await import('./plan');
      return planMain(subArgs);
    }
    case 'run': {
      const { main: runMain } = await import('./run');
      return runMain(subArgs);
    }
    case 'mcp': {
      const { startMcpServer } = await import('../runtime/mcp-server');
      return startMcpServer(subArgs);
    }
    case 'worlds': {
      const { main: worldMain } = await import('./world');
      return worldMain(['list', ...subArgs]);
    }
    case 'trace': {
      const { main: traceMain } = await import('./trace');
      return traceMain(subArgs);
    }
    case 'impact': {
      const { main: impactMain } = await import('./impact');
      return impactMain(subArgs);
    }
    case 'behavioral': {
      const { main: behavioralMain } = await import('./behavioral');
      return behavioralMain(subArgs);
    }
    case 'world': {
      const { main: worldMain } = await import('./world');
      return worldMain(subArgs);
    }
    case 'derive': {
      process.stderr.write('\x1b[2mNote: `neuroverse derive` is included in `neuroverse build`. Consider using `neuroverse build` for the combined derive + compile step.\x1b[0m\n');
      const { main: deriveMain } = await import('./derive');
      return deriveMain(subArgs);
    }
    case 'decision-flow': {
      const { main: decisionFlowMain } = await import('./decision-flow');
      return decisionFlowMain(subArgs);
    }
    case 'equity-penalties': {
      const { main: equityPenaltiesMain } = await import('./equity-penalties');
      return equityPenaltiesMain(subArgs);
    }
    case 'keygen': {
      const { main: keygenMain } = await import('./keygen');
      return keygenMain(subArgs);
    }
    case 'sign': {
      const { main: signMain } = await import('./sign');
      return signMain(subArgs);
    }
    case 'verify': {
      const { main: verifyMain } = await import('./verify');
      return verifyMain(subArgs);
    }
    case 'migrate': {
      const { main: migrateMain } = await import('./migrate');
      return migrateMain(subArgs);
    }
    case 'configure-ai': {
      const { main: configureAiMain } = await import('./configure-ai');
      return configureAiMain(subArgs);
    }
    case 'configure-world': {
      process.stderr.write('\x1b[2mNote: For behavioral models, use `neuroverse worldmodel init` instead. `configure-world` is the interactive wizard for .nv-world.md files.\x1b[0m\n');
      const { main: configureWorldMain } = await import('./configure-world');
      return configureWorldMain(subArgs);
    }
    case 'lens': {
      const { main: lensMain } = await import('./lens');
      return lensMain(subArgs);
    }
    case 'worldmodel': {
      const { main: worldmodelMain } = await import('./worldmodel');
      return worldmodelMain(subArgs);
    }
    case 'radiant': {
      const { main: radiantMain } = await import('./radiant');
      return radiantMain(subArgs);
    }
    case '--help':
    case '-h':
    case 'help':
    case undefined: {
      process.stdout.write(USAGE + '\n');
      process.exit(0);
      break;
    }
    default: {
      process.stderr.write(`Unknown command: "${command}"\n\n`);
      process.stdout.write(USAGE + '\n');
      process.exit(1);
    }
  }
}

main().catch(e => {
  process.stderr.write(`Fatal: ${e}\n`);
  process.exit(3);
});
