/**
 * Deep Agents + NeuroVerse Governance Demo
 *
 * Shows how NeuroVerse intercepts coding agent actions and blocks
 * dangerous operations before they execute.
 *
 * Run: npx tsx examples/deep-agents/demo.ts
 */

import { createDeepAgentsGuard, GovernanceBlockedError } from '../../src/adapters/deep-agents';

async function main() {
  // Load governance world
  const guard = await createDeepAgentsGuard('./examples/deep-agents/world.nv-world.md', {
    trace: true,
    onBlock: (verdict, toolCall) => {
      console.log('\n⛔ NeuroVerse BLOCKED');
      console.log(`   Tool:   ${toolCall.tool}`);
      console.log(`   Reason: ${verdict.reason ?? verdict.ruleId ?? 'governance rule'}`);
      console.log(`   Rule:   ${verdict.ruleId ?? 'n/a'}`);
    },
    onEvaluate: (result) => {
      const icon = result.allowed ? '✅' : '⛔';
      console.log(`${icon} [${result.verdict.status}] ${result.toolCall.tool}`);
    },
  });

  // Simulate a mock tool runner (would be Deep Agents' actual executor)
  const mockRunner = async (tool: string, args: Record<string, unknown>) => {
    return `Executed ${tool} successfully`;
  };

  console.log('═══════════════════════════════════════════════');
  console.log('  Deep Agents + NeuroVerse Governance Demo');
  console.log('═══════════════════════════════════════════════\n');

  // ─── Scenario 1: Safe file read (ALLOWED) ────────────────────────────────
  console.log('── Scenario 1: Read a source file ──');
  try {
    await guard.execute(
      { tool: 'read_file', args: { path: 'src/index.ts' } },
      mockRunner,
    );
    console.log('   → File read completed\n');
  } catch (e) {
    if (e instanceof GovernanceBlockedError) console.log('   → Blocked\n');
  }

  // ─── Scenario 2: Safe file write (ALLOWED) ───────────────────────────────
  console.log('── Scenario 2: Write to project file ──');
  try {
    await guard.execute(
      { tool: 'write_file', args: { path: 'src/utils.ts', content: 'export const add = (a, b) => a + b;' } },
      mockRunner,
    );
    console.log('   → File write completed\n');
  } catch (e) {
    if (e instanceof GovernanceBlockedError) console.log('   → Blocked\n');
  }

  // ─── Scenario 3: Safe shell command (ALLOWED) ────────────────────────────
  console.log('── Scenario 3: Run tests ──');
  try {
    await guard.execute(
      { tool: 'run_shell', args: { command: 'npm test' } },
      mockRunner,
    );
    console.log('   → Tests executed\n');
  } catch (e) {
    if (e instanceof GovernanceBlockedError) console.log('   → Blocked\n');
  }

  // ─── Scenario 4: DESTRUCTIVE command (BLOCKED) ───────────────────────────
  console.log('── Scenario 4: Agent tries rm -rf / ──');
  try {
    await guard.execute(
      { tool: 'run_shell', args: { command: 'rm -rf /' } },
      mockRunner,
    );
    console.log('   → Command executed\n');
  } catch (e) {
    if (e instanceof GovernanceBlockedError) {
      console.log('   → BLOCKED by NeuroVerse governance\n');
    }
  }

  // ─── Scenario 5: Secret access (BLOCKED) ─────────────────────────────────
  console.log('── Scenario 5: Agent tries to read .env ──');
  try {
    await guard.execute(
      { tool: 'read_file', args: { path: '.env' } },
      mockRunner,
    );
    console.log('   → File read completed\n');
  } catch (e) {
    if (e instanceof GovernanceBlockedError) {
      console.log('   → BLOCKED by NeuroVerse governance\n');
    }
  }

  // ─── Scenario 6: System file modification (BLOCKED) ──────────────────────
  console.log('── Scenario 6: Agent tries to write /etc/passwd ──');
  try {
    await guard.execute(
      { tool: 'write_file', args: { path: '/etc/passwd', content: 'hacked' } },
      mockRunner,
    );
    console.log('   → File written\n');
  } catch (e) {
    if (e instanceof GovernanceBlockedError) {
      console.log('   → BLOCKED by NeuroVerse governance\n');
    }
  }

  // ─── Scenario 7: Git push to main (BLOCKED) ─────────────────────────────
  console.log('── Scenario 7: Agent tries to push to main ──');
  try {
    await guard.execute(
      { tool: 'git_push', args: { command: 'git push origin main' } },
      mockRunner,
    );
    console.log('   → Push completed\n');
  } catch (e) {
    if (e instanceof GovernanceBlockedError) {
      console.log('   → BLOCKED by NeuroVerse governance\n');
    }
  }

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════');
  console.log('  Without NeuroVerse: Agent → rm -rf / → 💀');
  console.log('  With NeuroVerse:    Agent → evaluateGuard() → ⛔ BLOCKED');
  console.log('═══════════════════════════════════════════════');
}

main().catch(console.error);
