/**
 * The hard spend cap: enforced BEFORE every model call from a USD cap and a
 * per-model price table, and settled after each call from the usage the
 * endpoint reports. A run that would exceed the cap stops and says so; a
 * run cannot start without a cap or without a price for its model.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { here } from './task';
import type { Usage } from './model';

export interface Price { inputUsdPerMillion: number; outputUsdPerMillion: number }
export interface PriceTable { models: Record<string, Price> }

export function loadPrices(path = join(here, 'prices.json')): PriceTable {
  const t = JSON.parse(readFileSync(path, 'utf8')) as PriceTable;
  if (!t.models || typeof t.models !== 'object') throw new Error('prices.json: no models');
  return t;
}

export function priceFor(table: PriceTable, model: string): Price {
  const p = table.models[model];
  if (!p || !Number.isFinite(p.inputUsdPerMillion) || !Number.isFinite(p.outputUsdPerMillion)) throw new Error(`no price for model "${model}" in prices.json; add it before running`);
  return p;
}

export class SpendCap {
  spentUsd = 0;
  calls = 0;
  promptTokens = 0;
  completionTokens = 0;
  stopped: { reason: string; at: number } | null = null;

  constructor(readonly capUsd: number, readonly price: Price, readonly model: string) {
    if (!Number.isFinite(capUsd) || capUsd <= 0) throw new Error(`the spend cap must be a positive number of USD, got ${JSON.stringify(capUsd)}`);
  }

  costOf(usage: Usage): number {
    return (usage.promptTokens * this.price.inputUsdPerMillion + usage.completionTokens * this.price.outputUsdPerMillion) / 1e6;
  }

  /** Before a call: may it be made? The estimate is the prompt size plus the most the reply may cost. */
  before(estimatedPromptTokens: number, maxCompletionTokens: number): { ok: true } | { ok: false; reason: string } {
    if (this.stopped) return { ok: false, reason: this.stopped.reason };
    const worst = this.costOf({ promptTokens: estimatedPromptTokens, completionTokens: maxCompletionTokens });
    if (this.spentUsd + worst > this.capUsd) {
      this.stopped = { reason: `spend cap reached: ${this.spentUsd.toFixed(4)} USD spent of ${this.capUsd} USD; the next call could cost up to ${worst.toFixed(4)} USD`, at: this.calls };
      return { ok: false, reason: this.stopped.reason };
    }
    return { ok: true };
  }

  /** After a call: settle what it actually cost. */
  after(usage: Usage | undefined): void {
    this.calls++;
    if (!usage) return;
    this.promptTokens += usage.promptTokens;
    this.completionTokens += usage.completionTokens;
    this.spentUsd += this.costOf(usage);
    if (this.spentUsd >= this.capUsd && !this.stopped) this.stopped = { reason: `spend cap reached: ${this.spentUsd.toFixed(4)} USD spent of ${this.capUsd} USD`, at: this.calls };
  }
}
