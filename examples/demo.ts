#!/usr/bin/env npx tsx
/**
 * Demo — prints each example rulebook in plain words, what the conflict check
 * found, and a day of decisions.
 *
 * Run:
 *   npm run demo
 *   npm run demo -- --json   # also write <site>.rules.json for each
 */

import { writeFileSync } from 'fs';
import { evaluateDomainAction, glassesZoneRules, renderDomainRules } from '../src/index';
import type { DomainRequest, RuleDraft, Rulebook } from '../src/index';
import * as grocery from './grocery-store';
import * as warehouse from './warehouse';
import * as clinic from './clinic';

const json = process.argv.includes('--json');

function show(title: string, rulebook: Rulebook, day: Array<[string, DomainRequest]>, drafts: RuleDraft[] = []) {
  console.log(`\n${'='.repeat(78)}\n${title}\n${'='.repeat(78)}\n`);
  console.log(renderDomainRules(rulebook));
  if (drafts.length) {
    console.log('## What the manager wrote, and what the drafter made of it\n');
    for (const d of drafts) {
      console.log(`"${d.draft?.text ?? '(no draft)'}" → confidence ${d.confidence.toFixed(2)}${d.unmatched.length ? `, unmatched: ${d.unmatched.join(' ')}` : ''}`);
      for (const n of d.notes) console.log(`   note: ${n}`);
    }
    console.log('');
  }
  console.log('## Rules at odds (findings)\n');
  if (!rulebook.findings.length) console.log('None.\n');
  for (const f of rulebook.findings) console.log(`[${f.severity}] ${f.kind} (${f.certainty}) ${f.ruleIds.join(' vs ')}\n   ${f.message}\n`);
  console.log('## A day of decisions\n');
  for (const [what, request] of day) {
    const d = evaluateDomainAction(rulebook, request);
    const extra = [
      d.limits ? Object.entries(d.limits).map(([k, v]) => `${k} ${v}`).join(', ') : '',
      d.then ? `then ${d.then}` : '',
    ].filter(Boolean).join('; ');
    console.log(`${d.status.padEnd(5)}  ${what}${extra ? `  (${extra})` : ''}`);
    for (const r of d.reasons) console.log(`       ${r.ruleId} [${r.setBy}]: ${r.reason}`);
  }
  if (json) {
    const file = `${rulebook.site.id}.rules.json`;
    writeFileSync(file, JSON.stringify(rulebook, null, 2));
    console.log(`\nWrote ${file}`);
  }
}

show('GROCERY STORE (template + answers + the manager\'s plain-language rules)', grocery.rulebook, grocery.day, grocery.drafts);
console.log('\n## What a shopper\'s glasses enforce in Aisle 3\n');
const g = glassesZoneRules(grocery.rulebook, 'aisle-3', 'shopper');
console.log(`camera: ${g.camera}, microphone: ${g.microphone}, overlay: ${g.aiOverlay}, location: ${g.locationSharing}`);

show('WAREHOUSE (template + answers + two drafted rules)', warehouse.rulebook, warehouse.day, warehouse.drafts);
show('CLINIC (no template — everything declared by hand)', clinic.rulebook, clinic.day);
