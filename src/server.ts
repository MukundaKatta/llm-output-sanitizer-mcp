#!/usr/bin/env node
/**
 * llm-output-sanitizer MCP server.
 *
 * Three tools:
 *
 *   sanitize_output     strip dangerous HTML/SQL/shell snippets, return cleaned text
 *   assert_safe_output  same scan, but error out if anything was found
 *   list_findings       just enumerate the unsafe matches without rewriting
 *
 * Configure your client to spawn this binary over stdio. Example for Claude Desktop's
 * `claude_desktop_config.json`:
 *
 *   {
 *     "mcpServers": {
 *       "llm-output-sanitizer": {
 *         "command": "npx",
 *         "args": ["-y", "@mukundakatta/llm-output-sanitizer-mcp"]
 *       }
 *     }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  sanitizeOutput,
  assertSafeOutput,
} from '@mukundakatta/llm-output-sanitizer';

const VERSION = '0.1.0';

type Sink = 'markdown' | 'html' | 'sql' | 'shell';

const server = new Server(
  {
    name: 'llm-output-sanitizer',
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

const SINK_DESCRIPTION =
  'Where the output is going. `markdown` (default) strips dangerous tags and ' +
  "patterns without escaping. `html` additionally HTML-escapes <, >, & for safe " +
  'rendering. `sql` and `shell` apply the same strip pass and are reserved for ' +
  'future sink-specific extensions.';

const TOOLS = [
  {
    name: 'sanitize_output',
    description:
      'Run the LLM output through the sanitizer and return the cleaned text plus the list of patterns that were removed. Use this on every model response that flows into a render path, a query, or a shell command.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The LLM output to sanitize.',
        },
        sink: {
          type: 'string',
          enum: ['markdown', 'html', 'sql', 'shell'],
          description: SINK_DESCRIPTION,
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'assert_safe_output',
    description:
      'Sanitize the output but error out (returns `{ ok: false, findings }`) when anything dangerous was present. Use as a hard gate when you would rather fail than silently render a partially repaired string.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The LLM output to assert on.',
        },
        sink: {
          type: 'string',
          enum: ['markdown', 'html', 'sql', 'shell'],
          description: SINK_DESCRIPTION,
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'list_findings',
    description:
      'Run the scan but do not rewrite the text. Returns `{ findings, count }`. Useful for logging and review pipelines.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text to scan.',
        },
      },
      required: ['text'],
    },
  },
] as const;

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  try {
    switch (name) {
      case 'sanitize_output':
        return sanitizeTool(args as { text: string; sink?: Sink });
      case 'assert_safe_output':
        return assertTool(args as { text: string; sink?: Sink });
      case 'list_findings':
        return findingsTool(args as { text: string });
      default:
        return errorResult('unknown tool: ' + name);
    }
  } catch (err) {
    return errorResult('internal error: ' + (err as Error).message);
  }
});

function sanitizeTool(args: { text: string; sink?: Sink }) {
  const result = sanitizeOutput(args.text, optionsFor(args.sink));
  return jsonResult(result);
}

function assertTool(args: { text: string; sink?: Sink }) {
  try {
    const text = assertSafeOutput(args.text, optionsFor(args.sink));
    return jsonResult({ ok: true, text, findings: [] });
  } catch (err) {
    const findings = (err as { findings?: unknown }).findings ?? [];
    return jsonResult({ ok: false, error: (err as Error).message, findings });
  }
}

function findingsTool(args: { text: string }) {
  const result = sanitizeOutput(args.text);
  return jsonResult({ findings: result.findings, count: result.findings.length });
}

function optionsFor(sink: Sink | undefined) {
  return sink ? { sink } : undefined;
}

function jsonResult(value: unknown) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(message: string) {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  };
}

const transport = new StdioServerTransport();
await server.connect(transport);

process.stderr.write(`llm-output-sanitizer MCP server v${VERSION} ready on stdio\n`);
