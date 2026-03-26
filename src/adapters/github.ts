/**
 * NeuroVerse Adapter — GitHub
 *
 * Governance middleware for GitHub-driven workflows. Evaluates GitHub events
 * (PRs, issues, comments, pushes, releases, workflow runs) against world rules
 * before allowing actions to proceed.
 *
 * Two modes:
 *   1. Webhook mode — receives GitHub webhook payloads, evaluates, returns verdict
 *   2. Action mode — wraps Octokit/GitHub API calls with governance checks
 *
 * Usage (Webhook):
 *   import { createGitHubWebhookHandler } from 'neuroverse-governance/adapters/github';
 *
 *   const handler = await createGitHubWebhookHandler('./world/');
 *   app.post('/webhook', async (req, res) => {
 *     const verdict = handler.evaluate(req.headers['x-github-event'], req.body);
 *     if (verdict.status === 'BLOCK') return res.status(403).json({ blocked: true });
 *     // proceed with webhook processing...
 *   });
 *
 * Usage (Action):
 *   import { createGitHubGovernor } from 'neuroverse-governance/adapters/github';
 *
 *   const gov = await createGitHubGovernor('./world/');
 *
 *   // Before merging a PR:
 *   const verdict = gov.evaluate({
 *     action: 'merge_pull_request',
 *     repository: 'myorg/myrepo',
 *     ref: 'refs/heads/main',
 *     actor: 'dependabot[bot]',
 *     metadata: { pr_number: 42, labels: ['auto-merge'] },
 *   });
 *
 *   if (verdict.status === 'ALLOW') await octokit.pulls.merge(...);
 */

import type { GuardEvent, GuardVerdict, GuardEngineOptions } from '../contracts/guard-contract';
import type { PlanDefinition, PlanProgress } from '../contracts/plan-contract';
import type { WorldDefinition } from '../types';
import { evaluateGuard } from '../engine/guard-engine';
import { loadWorld } from '../loader/world-loader';
import {
  GovernanceBlockedError as BaseGovernanceBlockedError,
  trackPlanProgress,
  buildEngineOptions,
  defaultBlockMessage,
} from './shared';

// ─── GitHub Event Types ──────────────────────────────────────────────────────

/** GitHub webhook event names the adapter understands. */
export type GitHubWebhookEvent =
  | 'push'
  | 'pull_request'
  | 'pull_request_review'
  | 'issues'
  | 'issue_comment'
  | 'release'
  | 'workflow_run'
  | 'workflow_dispatch'
  | 'check_run'
  | 'check_suite'
  | 'deployment'
  | 'deployment_status'
  | 'create'
  | 'delete'
  | 'fork'
  | 'member'
  | 'repository'
  | 'status'
  | string; // extensible for custom events

/** A structured GitHub action to evaluate against governance. */
export interface GitHubAction {
  /** What the actor wants to do (e.g., 'merge_pull_request', 'push_to_main', 'create_release'). */
  action: string;

  /** Full repository name (e.g., 'myorg/myrepo'). */
  repository: string;

  /** Git ref involved (e.g., 'refs/heads/main', 'refs/tags/v1.0.0'). */
  ref?: string;

  /** GitHub username or bot performing the action. */
  actor?: string;

  /** Branch being targeted (extracted from ref or PR base). */
  branch?: string;

  /** Additional context for guard evaluation. */
  metadata?: Record<string, unknown>;
}

/** Result of evaluating a GitHub action. */
export interface GitHubGovernanceResult {
  /** The guard verdict. */
  verdict: GuardVerdict;

  /** The GuardEvent that was evaluated (for audit/logging). */
  event: GuardEvent;

  /** The original action that triggered evaluation. */
  action: GitHubAction;
}

/** Result of evaluating a webhook payload. */
export interface WebhookGovernanceResult {
  /** The guard verdict. */
  verdict: GuardVerdict;

  /** The GuardEvent that was evaluated. */
  event: GuardEvent;

  /** The webhook event type. */
  webhookEvent: string;

  /** The webhook action (e.g., 'opened', 'closed', 'merged'). */
  webhookAction?: string;
}

// ─── Options ─────────────────────────────────────────────────────────────────

export interface GitHubGovernorOptions {
  /** Include full evaluation trace in verdicts. Default: false. */
  trace?: boolean;

  /** Enforcement level override. */
  level?: 'basic' | 'standard' | 'strict';

  /** Called for every evaluation (logging/audit hook). */
  onEvaluate?: (verdict: GuardVerdict, event: GuardEvent, action: GitHubAction) => void;

  /** Custom mapping from GitHubAction to GuardEvent. */
  mapAction?: (action: GitHubAction) => GuardEvent;

  /** Active plan overlay for task-scoped governance. */
  plan?: PlanDefinition;

  /** Called when plan progress changes. */
  onPlanProgress?: (progress: PlanProgress) => void;

  /** Called when all plan steps are completed. */
  onPlanComplete?: () => void;

  /** Protected branches that require strict governance. Default: ['main', 'master', 'production']. */
  protectedBranches?: string[];

  /** Actors (bots, users) with restricted permissions. */
  restrictedActors?: string[];
}

export interface WebhookHandlerOptions extends GitHubGovernorOptions {
  /** Webhook secret for signature verification (HMAC-SHA256). */
  webhookSecret?: string;

  /** Custom mapping from webhook payload to GitHubAction. */
  mapWebhook?: (eventType: string, payload: Record<string, unknown>) => GitHubAction;
}

// ─── Error ───────────────────────────────────────────────────────────────────

export class GitHubGovernanceBlockedError extends BaseGovernanceBlockedError {
  public readonly action: GitHubAction;

  constructor(verdict: GuardVerdict, action: GitHubAction) {
    super(verdict, `[NeuroVerse] GitHub action blocked: ${action.action} on ${action.repository}`);
    this.name = 'GitHubGovernanceBlockedError';
    this.action = action;
  }
}

// ─── Branch & Ref Helpers ────────────────────────────────────────────────────

function extractBranch(ref?: string): string | undefined {
  if (!ref) return undefined;
  if (ref.startsWith('refs/heads/')) return ref.slice('refs/heads/'.length);
  if (ref.startsWith('refs/tags/')) return ref.slice('refs/tags/'.length);
  return ref;
}

function isProtectedBranch(branch: string | undefined, protectedBranches: string[]): boolean {
  if (!branch) return false;
  return protectedBranches.some(
    (pb) => branch === pb || branch.startsWith(`${pb}/`),
  );
}

// ─── Default Mappings ────────────────────────────────────────────────────────

/**
 * Map a GitHubAction to a GuardEvent.
 * Encodes branch protection and actor context into the event.
 */
function defaultMapAction(
  action: GitHubAction,
  protectedBranches: string[],
  restrictedActors: string[],
): GuardEvent {
  const branch = action.branch ?? extractBranch(action.ref);
  const isProtected = isProtectedBranch(branch, protectedBranches);
  const isRestricted = action.actor
    ? restrictedActors.some((ra) => action.actor === ra || action.actor?.endsWith('[bot]'))
    : false;

  // Determine action category from the action name
  let actionCategory: GuardEvent['actionCategory'] = 'other';
  const act = action.action.toLowerCase();
  if (act.includes('read') || act.includes('get') || act.includes('list') || act.includes('view')) {
    actionCategory = 'read';
  } else if (act.includes('delete') || act.includes('remove') || act.includes('close')) {
    actionCategory = 'delete';
  } else if (act.includes('deploy') || act.includes('run') || act.includes('execute') || act.includes('merge')) {
    actionCategory = 'network';
  } else if (act.includes('create') || act.includes('push') || act.includes('write') || act.includes('update') || act.includes('edit')) {
    actionCategory = 'write';
  } else if (act.includes('comment') || act.includes('review') || act.includes('notify')) {
    actionCategory = 'other';
  }

  return {
    intent: action.action,
    tool: 'github',
    scope: `${action.repository}${branch ? `@${branch}` : ''}`,
    actionCategory,
    direction: 'input',
    args: {
      repository: action.repository,
      ref: action.ref,
      branch,
      actor: action.actor,
      protected_branch: isProtected,
      restricted_actor: isRestricted,
      ...action.metadata,
    },
  };
}

/**
 * Map a GitHub webhook payload to a GitHubAction.
 */
function defaultMapWebhook(eventType: string, payload: Record<string, unknown>): GitHubAction {
  const repo = payload.repository as Record<string, unknown> | undefined;
  const repoFullName = (repo?.full_name as string) ?? 'unknown/unknown';
  const sender = payload.sender as Record<string, unknown> | undefined;
  const actor = (sender?.login as string) ?? undefined;
  const webhookAction = payload.action as string | undefined;

  switch (eventType) {
    case 'push': {
      const ref = payload.ref as string | undefined;
      const branch = extractBranch(ref);
      const forced = payload.forced as boolean | undefined;
      return {
        action: forced ? 'force_push' : `push_to_${branch ?? 'branch'}`,
        repository: repoFullName,
        ref,
        branch,
        actor,
        metadata: {
          forced: forced ?? false,
          commits_count: (payload.commits as unknown[])?.length ?? 0,
          head_commit: (payload.head_commit as Record<string, unknown>)?.id,
        },
      };
    }

    case 'pull_request': {
      const pr = payload.pull_request as Record<string, unknown>;
      const base = pr?.base as Record<string, unknown> | undefined;
      const baseBranch = base?.ref as string | undefined;
      const prNumber = pr?.number as number | undefined;
      const merged = pr?.merged as boolean | undefined;
      const labels = (pr?.labels as Array<Record<string, unknown>>)?.map((l) => l.name as string) ?? [];

      let action = `pull_request_${webhookAction ?? 'unknown'}`;
      if (webhookAction === 'closed' && merged) {
        action = 'merge_pull_request';
      }

      return {
        action,
        repository: repoFullName,
        branch: baseBranch,
        actor,
        metadata: {
          pr_number: prNumber,
          labels,
          merged: merged ?? false,
          draft: pr?.draft ?? false,
          webhook_action: webhookAction,
        },
      };
    }

    case 'release': {
      const release = payload.release as Record<string, unknown> | undefined;
      return {
        action: `release_${webhookAction ?? 'published'}`,
        repository: repoFullName,
        ref: release?.tag_name ? `refs/tags/${release.tag_name}` : undefined,
        actor,
        metadata: {
          tag: release?.tag_name,
          prerelease: release?.prerelease ?? false,
          draft: release?.draft ?? false,
          webhook_action: webhookAction,
        },
      };
    }

    case 'deployment':
    case 'deployment_status': {
      const deployment = (payload.deployment ?? payload) as Record<string, unknown>;
      return {
        action: eventType === 'deployment' ? 'create_deployment' : 'deployment_status_update',
        repository: repoFullName,
        ref: deployment.ref as string | undefined,
        actor,
        metadata: {
          environment: deployment.environment,
          status: (payload.deployment_status as Record<string, unknown>)?.state,
          webhook_action: webhookAction,
        },
      };
    }

    case 'workflow_run': {
      const run = payload.workflow_run as Record<string, unknown> | undefined;
      return {
        action: `workflow_${webhookAction ?? 'completed'}`,
        repository: repoFullName,
        branch: run?.head_branch as string | undefined,
        actor,
        metadata: {
          workflow_name: run?.name,
          conclusion: run?.conclusion,
          status: run?.status,
          webhook_action: webhookAction,
        },
      };
    }

    case 'issues': {
      const issue = payload.issue as Record<string, unknown> | undefined;
      return {
        action: `issue_${webhookAction ?? 'opened'}`,
        repository: repoFullName,
        actor,
        metadata: {
          issue_number: issue?.number,
          labels: (issue?.labels as Array<Record<string, unknown>>)?.map((l) => l.name as string) ?? [],
          webhook_action: webhookAction,
        },
      };
    }

    case 'issue_comment': {
      return {
        action: `issue_comment_${webhookAction ?? 'created'}`,
        repository: repoFullName,
        actor,
        metadata: {
          issue_number: (payload.issue as Record<string, unknown>)?.number,
          webhook_action: webhookAction,
        },
      };
    }

    case 'delete': {
      return {
        action: `delete_${(payload.ref_type as string) ?? 'ref'}`,
        repository: repoFullName,
        ref: payload.ref as string | undefined,
        actor,
        metadata: {
          ref_type: payload.ref_type,
        },
      };
    }

    default: {
      return {
        action: webhookAction ? `${eventType}_${webhookAction}` : eventType,
        repository: repoFullName,
        actor,
        metadata: { webhook_action: webhookAction },
      };
    }
  }
}

// ─── GitHub Governor ─────────────────────────────────────────────────────────

/**
 * Evaluates GitHub actions against a NeuroVerse world.
 * Use this when you're making GitHub API calls and want governance
 * to approve/block them before execution.
 */
export class GitHubGovernor {
  private world: WorldDefinition;
  private options: GitHubGovernorOptions;
  engineOptions: GuardEngineOptions;
  activePlan?: PlanDefinition;
  private protectedBranches: string[];
  private restrictedActors: string[];
  private mapFn: (action: GitHubAction) => GuardEvent;

  constructor(world: WorldDefinition, options: GitHubGovernorOptions = {}) {
    this.world = world;
    this.options = options;
    this.activePlan = options.plan;
    this.engineOptions = buildEngineOptions(options, this.activePlan);
    this.protectedBranches = options.protectedBranches ?? ['main', 'master', 'production'];
    this.restrictedActors = options.restrictedActors ?? [];
    this.mapFn = options.mapAction
      ?? ((action: GitHubAction) =>
        defaultMapAction(action, this.protectedBranches, this.restrictedActors));
  }

  /**
   * Evaluate a GitHub action against governance rules.
   * Returns a full result with verdict, event, and the original action.
   */
  evaluate(action: GitHubAction): GitHubGovernanceResult {
    const event = this.mapFn(action);
    this.engineOptions.plan = this.activePlan;
    const verdict = evaluateGuard(event, this.world, this.engineOptions);

    this.options.onEvaluate?.(verdict, event, action);

    if (verdict.status === 'ALLOW') {
      trackPlanProgress(event, this, this.options);
    }

    return { verdict, event, action };
  }

  /**
   * Evaluate and enforce — throws GitHubGovernanceBlockedError on BLOCK/PAUSE.
   * Use this as a gate before executing GitHub API calls.
   */
  enforce(action: GitHubAction): GitHubGovernanceResult {
    const result = this.evaluate(action);

    if (result.verdict.status === 'BLOCK' || result.verdict.status === 'PAUSE') {
      throw new GitHubGovernanceBlockedError(result.verdict, action);
    }

    return result;
  }

  /**
   * Check if pushing to a branch is allowed.
   * Convenience method for the most common governance check.
   */
  canPush(repository: string, branch: string, actor?: string): GuardVerdict {
    return this.evaluate({
      action: `push_to_${branch}`,
      repository,
      ref: `refs/heads/${branch}`,
      branch,
      actor,
    }).verdict;
  }

  /**
   * Check if merging a PR is allowed.
   */
  canMerge(
    repository: string,
    targetBranch: string,
    prNumber: number,
    actor?: string,
    labels?: string[],
  ): GuardVerdict {
    return this.evaluate({
      action: 'merge_pull_request',
      repository,
      branch: targetBranch,
      actor,
      metadata: { pr_number: prNumber, labels: labels ?? [] },
    }).verdict;
  }

  /**
   * Check if creating a release is allowed.
   */
  canRelease(repository: string, tag: string, actor?: string, prerelease?: boolean): GuardVerdict {
    return this.evaluate({
      action: 'release_published',
      repository,
      ref: `refs/tags/${tag}`,
      actor,
      metadata: { tag, prerelease: prerelease ?? false },
    }).verdict;
  }

  /**
   * Check if deploying to an environment is allowed.
   */
  canDeploy(repository: string, environment: string, ref?: string, actor?: string): GuardVerdict {
    return this.evaluate({
      action: 'create_deployment',
      repository,
      ref,
      actor,
      metadata: { environment },
    }).verdict;
  }
}

// ─── Webhook Handler ─────────────────────────────────────────────────────────

/**
 * Evaluates incoming GitHub webhook payloads against a NeuroVerse world.
 * Use this in your webhook endpoint to govern repository events.
 */
export class GitHubWebhookHandler {
  private governor: GitHubGovernor;
  private mapWebhookFn: (eventType: string, payload: Record<string, unknown>) => GitHubAction;
  private webhookSecret?: string;

  constructor(world: WorldDefinition, options: WebhookHandlerOptions = {}) {
    this.governor = new GitHubGovernor(world, options);
    this.mapWebhookFn = options.mapWebhook ?? defaultMapWebhook;
    this.webhookSecret = options.webhookSecret;
  }

  /**
   * Evaluate a webhook payload.
   *
   * @param eventType - The X-GitHub-Event header value
   * @param payload - The parsed webhook body
   */
  evaluate(eventType: string, payload: Record<string, unknown>): WebhookGovernanceResult {
    const action = this.mapWebhookFn(eventType, payload);
    const result = this.governor.evaluate(action);
    return {
      verdict: result.verdict,
      event: result.event,
      webhookEvent: eventType,
      webhookAction: payload.action as string | undefined,
    };
  }

  /**
   * Evaluate and enforce — throws on BLOCK/PAUSE.
   */
  enforce(eventType: string, payload: Record<string, unknown>): WebhookGovernanceResult {
    const result = this.evaluate(eventType, payload);

    if (result.verdict.status === 'BLOCK' || result.verdict.status === 'PAUSE') {
      const action = this.mapWebhookFn(eventType, payload);
      throw new GitHubGovernanceBlockedError(result.verdict, action);
    }

    return result;
  }

  /** Access the underlying governor for direct action evaluation. */
  getGovernor(): GitHubGovernor {
    return this.governor;
  }

  /** Get the configured webhook secret (for signature verification in your server). */
  getWebhookSecret(): string | undefined {
    return this.webhookSecret;
  }
}

// ─── GitHub Actions Integration ──────────────────────────────────────────────

/**
 * Guard evaluation result formatted for GitHub Actions output.
 * Set step outputs and write to $GITHUB_OUTPUT.
 */
export interface ActionsOutput {
  /** 'allowed' or 'blocked' or 'paused' — for use in step conditions */
  governance_status: string;
  /** The full verdict status */
  verdict_status: string;
  /** Reason for block/pause (empty string if allowed) */
  reason: string;
  /** Matched rule ID (empty string if none) */
  rule_id: string;
  /** Formatted as GITHUB_OUTPUT lines */
  outputLines: string;
}

/**
 * Format a verdict for GitHub Actions step outputs.
 * Write the .outputLines to $GITHUB_OUTPUT in your action.
 *
 * Usage in a GitHub Action:
 *   const result = governor.evaluate(action);
 *   const output = formatForActions(result.verdict);
 *   fs.appendFileSync(process.env.GITHUB_OUTPUT!, output.outputLines);
 */
export function formatForActions(verdict: GuardVerdict): ActionsOutput {
  const status = verdict.status === 'ALLOW' ? 'allowed' : verdict.status === 'BLOCK' ? 'blocked' : 'paused';
  const reason = verdict.reason ?? '';
  const ruleId = verdict.ruleId ?? '';

  const lines = [
    `governance_status=${status}`,
    `verdict_status=${verdict.status}`,
    `reason=${reason}`,
    `rule_id=${ruleId}`,
  ].join('\n');

  return {
    governance_status: status,
    verdict_status: verdict.status,
    reason,
    rule_id: ruleId,
    outputLines: lines,
  };
}

/**
 * Create a PR comment body from a governance verdict.
 * Useful for posting governance status as a PR comment.
 */
export function formatPRComment(verdict: GuardVerdict, action: GitHubAction): string {
  const icon = verdict.status === 'ALLOW' ? '✅' : verdict.status === 'BLOCK' ? '🚫' : '⏸️';
  const status = verdict.status;

  let body = `## ${icon} Governance: ${status}\n\n`;
  body += `**Action:** \`${action.action}\`\n`;
  body += `**Repository:** \`${action.repository}\`\n`;

  if (action.branch) {
    body += `**Branch:** \`${action.branch}\`\n`;
  }
  if (action.actor) {
    body += `**Actor:** \`${action.actor}\`\n`;
  }

  body += '\n';

  if (verdict.reason) {
    body += `**Reason:** ${verdict.reason}\n`;
  }
  if (verdict.ruleId) {
    body += `**Rule:** \`${verdict.ruleId}\`\n`;
  }
  if (verdict.evidence?.invariantsSatisfied < verdict.evidence?.invariantsTotal) {
    body += `**Invariants:** ${verdict.evidence.invariantsSatisfied}/${verdict.evidence.invariantsTotal} satisfied\n`;
  }

  body += '\n---\n*Evaluated by [NeuroVerse Governance](https://github.com/NeuroverseOS/neuroverseos-governance)*';

  return body;
}

// ─── Factory Functions ───────────────────────────────────────────────────────

/**
 * Create a GitHub Governor from a world path.
 */
export async function createGitHubGovernor(
  worldPath: string,
  options?: GitHubGovernorOptions,
): Promise<GitHubGovernor> {
  const world = await loadWorld(worldPath);
  return new GitHubGovernor(world, options);
}

/**
 * Create a GitHub Governor from a pre-loaded world.
 */
export function createGitHubGovernorFromWorld(
  world: WorldDefinition,
  options?: GitHubGovernorOptions,
): GitHubGovernor {
  return new GitHubGovernor(world, options);
}

/**
 * Create a GitHub Webhook Handler from a world path.
 */
export async function createGitHubWebhookHandler(
  worldPath: string,
  options?: WebhookHandlerOptions,
): Promise<GitHubWebhookHandler> {
  const world = await loadWorld(worldPath);
  return new GitHubWebhookHandler(world, options);
}

/**
 * Create a GitHub Webhook Handler from a pre-loaded world.
 */
export function createGitHubWebhookHandlerFromWorld(
  world: WorldDefinition,
  options?: WebhookHandlerOptions,
): GitHubWebhookHandler {
  return new GitHubWebhookHandler(world, options);
}
