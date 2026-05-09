/**
 * End-to-end smoke test: spawn the MCP server, ask for the tool catalog, and
 * call each tool with a representative input.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '..', 'src', 'server.ts');

function rpc(child: ReturnType<typeof spawn>, request: object): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if ('id' in msg && (msg as { id: number }).id === (request as { id: number }).id) {
            child.stdout?.off('data', onData);
            resolve(msg);
            return;
          }
        } catch {
          // partial line, keep buffering
        }
      }
    };
    child.stdout?.on('data', onData);
    child.on('error', reject);
    child.stdin?.write(JSON.stringify(request) + '\n');
  });
}

async function withServer(fn: (child: ReturnType<typeof spawn>) => Promise<void>) {
  const child = spawn('npx', ['tsx', SERVER], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  await rpc(child, {
    jsonrpc: '2.0',
    id: 0,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'smoke-test', version: '1.0.0' },
    },
  });
  child.stdin?.write(
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n',
  );
  try {
    await fn(child);
  } finally {
    child.kill();
  }
}

test('server lists three tools', async () => {
  await withServer(async (child) => {
    const res = (await rpc(child, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    })) as { result: { tools: Array<{ name: string }> } };
    const names = res.result.tools.map((t) => t.name).sort();
    assert.deepEqual(names, [
      'assert_safe_output',
      'list_findings',
      'sanitize_output',
    ]);
  });
});

test('sanitize_output strips a script tag', async () => {
  await withServer(async (child) => {
    const res = (await rpc(child, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'sanitize_output',
        arguments: {
          text: 'Hello <script>steal()</script> world',
        },
      },
    })) as { result: { content: Array<{ text: string }> } };
    const payload = JSON.parse(res.result.content[0]!.text) as {
      safe: boolean;
      text: string;
      findings: Array<{ kind: string }>;
    };
    assert.equal(payload.safe, false);
    assert.ok(!payload.text.includes('<script'));
    assert.ok(payload.findings.some((f) => f.kind === 'html'));
  });
});

test('sanitize_output strips a dangerous SQL snippet', async () => {
  await withServer(async (child) => {
    const res = (await rpc(child, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'sanitize_output',
        arguments: { text: 'Sure: DROP TABLE users; --' },
      },
    })) as { result: { content: Array<{ text: string }> } };
    const payload = JSON.parse(res.result.content[0]!.text) as {
      safe: boolean;
      text: string;
      findings: Array<{ kind: string }>;
    };
    assert.equal(payload.safe, false);
    assert.ok(payload.findings.some((f) => f.kind === 'sql'));
  });
});

test('assert_safe_output returns ok=true on clean input', async () => {
  await withServer(async (child) => {
    const res = (await rpc(child, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'assert_safe_output',
        arguments: { text: 'Just a normal sentence.' },
      },
    })) as { result: { content: Array<{ text: string }> } };
    const payload = JSON.parse(res.result.content[0]!.text) as {
      ok: boolean;
      text?: string;
    };
    assert.equal(payload.ok, true);
    assert.equal(payload.text, 'Just a normal sentence.');
  });
});

test('assert_safe_output returns ok=false with findings on dirty input', async () => {
  await withServer(async (child) => {
    const res = (await rpc(child, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'assert_safe_output',
        arguments: { text: 'run rm -rf / now' },
      },
    })) as { result: { content: Array<{ text: string }> } };
    const payload = JSON.parse(res.result.content[0]!.text) as {
      ok: boolean;
      findings: Array<{ kind: string }>;
    };
    assert.equal(payload.ok, false);
    assert.ok(payload.findings.some((f) => f.kind === 'shell'));
  });
});

test('list_findings reports counts without rewriting', async () => {
  await withServer(async (child) => {
    const res = (await rpc(child, {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'list_findings',
        arguments: { text: '<iframe src=x></iframe> DROP TABLE foo' },
      },
    })) as { result: { content: Array<{ text: string }> } };
    const payload = JSON.parse(res.result.content[0]!.text) as {
      findings: Array<{ kind: string }>;
      count: number;
    };
    assert.ok(payload.count >= 2);
    const kinds = payload.findings.map((f) => f.kind).sort();
    assert.ok(kinds.includes('html'));
    assert.ok(kinds.includes('sql'));
  });
});
