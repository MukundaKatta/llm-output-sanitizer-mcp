# Publishing checklist

Steps to publish llm-output-sanitizer-mcp end-to-end. Commands assume you
are at `/Users/ubl/llm-output-sanitizer-mcp` with credentials available
via 1Password.

## Prereqs

- npm account with write to `@mukundakatta/llm-output-sanitizer-mcp`.
- `@mukundakatta/llm-output-sanitizer@^0.1.0` already published to npm.
- `mcp-publisher` CLI installed: `brew install mcp-publisher`.

## 1. Build, test, publish to npm

```bash
tmux new -d -s release-llm-output-sanitizer-mcp
eval "$(op signin --account my.1password.com)"

npm install
npm run build
npm test
npm publish --access public --otp="$(op read 'op://Private/Npmjs/one-time password?attribute=otp')"

npm view @mukundakatta/llm-output-sanitizer-mcp version --userconfig "$(mktemp)"
# Expected: 0.1.0
```

## 2. Publish to the MCP registry

```bash
mcp-publisher publish
# Verify: name in server.json matches mcpName in package.json
# (io.github.MukundaKatta/llm-output-sanitizer) and the npm package
# version matches packages[0].version.
```

If the verify step fails, the most common causes are:

- `mcpName` missing from `package.json`.
- npm package version mismatch with `server.json` `packages[0].version`.
- npm package has not propagated yet (wait ~30s after publish).

## 3. Smoke-test the published server

```bash
npx -y @mukundakatta/llm-output-sanitizer-mcp
# Should print "llm-output-sanitizer MCP server v0.1.0 ready on stdio"
# to stderr, then wait on stdin. Ctrl-C to exit.
```

## 4. Release tag

```bash
git tag v0.1.0
git push --tags
gh release create v0.1.0 --title "llm-output-sanitizer-mcp v0.1.0" --notes-from-tag
```

## Rollback

```bash
npm deprecate @mukundakatta/llm-output-sanitizer-mcp@0.1.0 "use 0.1.1 instead"
# Then publish 0.1.1 with the fix. Never unpublish; npm only allows that for 72h.
```
