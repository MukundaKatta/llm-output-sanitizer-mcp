# llm-output-sanitizer-mcp

[![npm](https://img.shields.io/npm/v/@mukundakatta/llm-output-sanitizer-mcp.svg)](https://www.npmjs.com/package/@mukundakatta/llm-output-sanitizer-mcp)
[![mcp registry](https://img.shields.io/badge/mcp-registry-blue.svg)](https://registry.modelcontextprotocol.io/v0/servers?search=llm-output-sanitizer)

MCP server that exposes [`@mukundakatta/llm-output-sanitizer`](https://www.npmjs.com/package/@mukundakatta/llm-output-sanitizer)
to any MCP-aware client (Claude Desktop, Cursor, Cline, Windsurf, Zed).

Strip dangerous HTML, SQL, and shell snippets from LLM output **before**
they reach a render path, a query engine, or a shell.

## Tools

| Name | What it does |
| --- | --- |
| `sanitize_output` | Return cleaned text plus the list of removed patterns. |
| `assert_safe_output` | Same scan, but `ok: false` when anything dangerous was found. |
| `list_findings` | Enumerate matches without rewriting the text. |

Detectors target the high-leverage sinks: `<script>`, `<iframe>`, `<form>`,
`<meta>`, `DROP/TRUNCATE/ALTER`, `rm -rf`, `curl ... |`, `sudo`, etc.

## Install

```jsonc
// claude_desktop_config.json (Claude Desktop)
// or the equivalent in Cursor / Cline / Windsurf / Zed
{
  "mcpServers": {
    "llm-output-sanitizer": {
      "command": "npx",
      "args": ["-y", "@mukundakatta/llm-output-sanitizer-mcp"]
    }
  }
}
```

Restart your client. The three tools appear in the tool drawer.

## Example

```text
> sanitize_output on "Hello <script>steal()</script> world"

{
  "safe": false,
  "text": "Hello [removed:html] world",
  "findings": [
    { "kind": "html", "match": "<script>" },
    { "kind": "html", "match": "</script>" }
  ]
}
```

Pass `sink: "html"` to additionally HTML-escape `< > &` after stripping, so
the cleaned text is safe to drop straight into a DOM.

## Why this exists

Even a well-aligned model will repeat dangerous strings it found in retrieved
context. A small, deterministic post-filter on the way out is cheap insurance,
and it pairs naturally with `prompt-injection-shield-mcp` on the way in.

This server is a thin wrapper. The detection logic lives in the underlying
library and is zero-dependency, sub-millisecond, and entirely local.

## License

MIT &copy; Mukunda Katta
