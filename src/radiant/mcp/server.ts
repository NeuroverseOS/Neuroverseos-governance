/**
 * @neuroverseos/governance/radiant — MCP Server
 *
 * Exposes Radiant's think + emergent commands as MCP tools over stdio.
 * Any MCP-compatible client (Claude Code, Cursor, etc.) can connect and
 * call these tools in natural conversation.
 *
 * Tools exposed:
 *   radiant_think     — query through worldmodel + lens → framed response
 *   radiant_emergent  — behavioral read on a GitHub repo
 *
 * Protocol: JSON-RPC 2.0 over stdio (MCP standard)
 *
 * Usage:
 *   neuroverse radiant mcp --worlds ./worlds/ --lens auki-builder
 *
 * Or in Claude Code's mcp config:
 *   {
 *     "mcpServers": {
 *       "radiant": {
 *         "command": "npx",
 *         "args": ["@neuroverseos/governance", "radiant", "mcp",
 *                  "--worlds", "./worlds/", "--lens", "auki-builder"],
 *         "env": {
 *           "ANTHROPIC_API_KEY": "...",
 *           "GITHUB_TOKEN": "..."
 *         }
 *       }
 *     }
 *   }
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { resolve, join, extname } from 'path';
import { think } from '../commands/think';
import { emergent } from '../commands/emergent';
import { createAnthropicAI } from '../core/ai';
import { parseRepoScope } from '../core/scopes';

// ─── MCP Protocol Types ────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// ─── Tool definitions ──────────────────────────────────────────────────────

const TOOLS: McpToolDefinition[] = [
  {
    name: 'radiant_think',
    description:
      'Send a query through the loaded worldmodel + rendering lens and get an Auki-framed response. ' +
      'Use this for strategic questions, decision evaluation, or any question that should be interpreted ' +
      'through the organization\'s behavioral model.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The question or prompt to interpret through the worldmodel + lens.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'radiant_emergent',
    description:
      'Run a behavioral read on a GitHub repository. Fetches recent activity, classifies events, ' +
      'extracts signals, identifies patterns, computes alignment scores, and produces the ' +
      'EMERGENT / MEANING / MOVE / ALIGNMENT output. Use this when asked about team activity, ' +
      'coordination patterns, or alignment with the worldmodel.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          description: 'GitHub repository in "owner/repo" format (e.g. "aukiverse/posemesh").',
        },
        exocortex_dir: {
          type: 'string',
          description: 'Optional path to an exocortex directory for stated-intent-vs-observed-behavior comparison.',
        },
      },
      required: ['scope'],
    },
  },
];

// ─── Server ────────────────────────────────────────────────────────────────

export interface RadiantMcpConfig {
  worldsPath: string;
  lensId: string;
  model?: string;
}

export class RadiantMcpServer {
  private config: RadiantMcpConfig;
  private worldmodelContent: string;
  private buffer = '';

  constructor(config: RadiantMcpConfig) {
    this.config = config;
    this.worldmodelContent = loadWorldmodelContent(config.worldsPath);
  }

  async start(): Promise<void> {
    process.stderr.write(
      `Radiant MCP server starting\n` +
        `  Worlds: ${this.config.worldsPath}\n` +
        `  Lens:   ${this.config.lensId}\n` +
        `  Tools:  radiant_think, radiant_emergent\n`,
    );

    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk: string) => {
      this.buffer += chunk;
      this.processBuffer();
    });

    process.stdin.on('end', () => {
      process.exit(0);
    });
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const request = JSON.parse(trimmed) as JsonRpcRequest;
        this.handleRequest(request).catch((err) => {
          this.sendError(request.id, -32603, String(err));
        });
      } catch {
        // Skip malformed JSON
      }
    }
  }

  private async handleRequest(req: JsonRpcRequest): Promise<void> {
    switch (req.method) {
      case 'initialize':
        this.sendResult(req.id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: {
            name: 'radiant',
            version: '0.6.1',
          },
        });
        break;

      case 'notifications/initialized':
        // Client confirmed init — no response needed
        break;

      case 'tools/list':
        this.sendResult(req.id, { tools: TOOLS });
        break;

      case 'tools/call':
        await this.handleToolCall(req);
        break;

      default:
        this.sendError(req.id, -32601, `Unknown method: ${req.method}`);
    }
  }

  private async handleToolCall(req: JsonRpcRequest): Promise<void> {
    const params = req.params as { name: string; arguments?: Record<string, unknown> } | undefined;
    if (!params?.name) {
      this.sendError(req.id, -32602, 'Missing tool name');
      return;
    }

    const args = params.arguments ?? {};

    try {
      switch (params.name) {
        case 'radiant_think':
          await this.handleThink(req.id, args);
          break;
        case 'radiant_emergent':
          await this.handleEmergent(req.id, args);
          break;
        default:
          this.sendError(req.id, -32602, `Unknown tool: ${params.name}`);
      }
    } catch (err) {
      this.sendResult(req.id, {
        content: [{ type: 'text', text: `Error: ${err}` }],
        isError: true,
      });
    }
  }

  private async handleThink(
    id: number | string,
    args: Record<string, unknown>,
  ): Promise<void> {
    const query = String(args.query ?? '');
    if (!query) {
      this.sendResult(id, {
        content: [{ type: 'text', text: 'Error: query is required' }],
        isError: true,
      });
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      this.sendResult(id, {
        content: [{ type: 'text', text: 'Error: ANTHROPIC_API_KEY not set' }],
        isError: true,
      });
      return;
    }

    const ai = createAnthropicAI(apiKey, this.config.model || undefined);
    const result = await think({
      worldmodelContent: this.worldmodelContent,
      lensId: this.config.lensId,
      query,
      ai,
    });

    let text = result.response;
    if (!result.voiceClean) {
      text += `\n\n⚠ Voice violations detected: ${result.voiceViolations.map((v) => v.phrase).join(', ')}`;
    }

    this.sendResult(id, {
      content: [{ type: 'text', text }],
    });
  }

  private async handleEmergent(
    id: number | string,
    args: Record<string, unknown>,
  ): Promise<void> {
    const scopeStr = String(args.scope ?? '');
    if (!scopeStr) {
      this.sendResult(id, {
        content: [{ type: 'text', text: 'Error: scope is required (e.g. "aukiverse/posemesh")' }],
        isError: true,
      });
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const githubToken = process.env.GITHUB_TOKEN;
    if (!apiKey) {
      this.sendResult(id, {
        content: [{ type: 'text', text: 'Error: ANTHROPIC_API_KEY not set' }],
        isError: true,
      });
      return;
    }
    if (!githubToken) {
      this.sendResult(id, {
        content: [{ type: 'text', text: 'Error: GITHUB_TOKEN not set' }],
        isError: true,
      });
      return;
    }

    const scope = parseRepoScope(scopeStr);
    const ai = createAnthropicAI(apiKey, this.config.model || undefined);
    const exocortexPath = args.exocortex_dir ? String(args.exocortex_dir) : undefined;

    const result = await emergent({
      scope,
      githubToken,
      worldmodelContent: this.worldmodelContent,
      lensId: this.config.lensId,
      ai,
      windowDays: 14,
      exocortexPath,
    });

    let text = result.text;
    if (!result.voiceClean) {
      text += `\n\n⚠ Voice violations: ${result.voiceViolations.map((v) => v.phrase).join(', ')}`;
    }

    this.sendResult(id, {
      content: [{ type: 'text', text }],
    });
  }

  private sendResult(id: number | string, result: unknown): void {
    const response: JsonRpcResponse = { jsonrpc: '2.0', id, result };
    process.stdout.write(JSON.stringify(response) + '\n');
  }

  private sendError(
    id: number | string | null,
    code: number,
    message: string,
  ): void {
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: id ?? null,
      error: { code, message },
    };
    process.stdout.write(JSON.stringify(response) + '\n');
  }
}

// ─── World loading ─────────────────────────────────────────────────────────

function loadWorldmodelContent(worldsPath: string): string {
  const resolved = resolve(worldsPath);
  if (!existsSync(resolved)) {
    throw new Error(`Worlds path not found: ${resolved}`);
  }

  const stat = statSync(resolved);
  if (stat.isFile()) {
    return readFileSync(resolved, 'utf-8');
  }

  if (stat.isDirectory()) {
    const files = readdirSync(resolved)
      .filter(
        (f) =>
          extname(f) === '.md' &&
          (f.endsWith('.worldmodel.md') || f.endsWith('.nv-world.md')),
      )
      .sort();

    if (files.length === 0) {
      throw new Error(`No worldmodel files found in ${resolved}`);
    }

    return files
      .map((f) => readFileSync(join(resolved, f), 'utf-8'))
      .join('\n\n---\n\n');
  }

  throw new Error(`Worlds path is neither a file nor directory: ${resolved}`);
}

// ─── Entrypoint ────────────────────────────────────────────────────────────

export async function startRadiantMcp(args: string[]): Promise<void> {
  function parseArg(flag: string): string | undefined {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
  }

  const worldsPath = parseArg('--worlds') ?? process.env.RADIANT_WORLDS;
  const lensId = parseArg('--lens') ?? process.env.RADIANT_LENS ?? 'auki-builder';
  const model = parseArg('--model') ?? process.env.RADIANT_MODEL;

  if (!worldsPath) {
    process.stderr.write('Error: --worlds <dir> or RADIANT_WORLDS required.\n');
    process.exit(1);
  }

  const server = new RadiantMcpServer({ worldsPath, lensId, model });
  await server.start();
}
