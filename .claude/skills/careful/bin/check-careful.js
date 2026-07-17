#!/usr/bin/env node
/**
 * /careful destructive-command check (PreToolUse hook for Bash).
 *
 * Reads the tool-call JSON from stdin, inspects `.tool_input.command`, and
 * BLOCKS (exit 2 + reason on stderr) when it matches a destructive pattern.
 * Claude then surfaces the reason and must get explicit human approval before
 * re-issuing. This enforces the corporate rule: destructive ops need approval.
 *
 * FAIL-OPEN: any error / unparseable input exits 0 (allow).
 */
'use strict';

// Each entry: [label, RegExp]. Kept intentionally conservative to limit
// false positives; add project-specific patterns as needed.
const PATTERNS = [
  ['recursive force delete (rm -rf)', /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r|-r\s+-f|-f\s+-r)\b/i],
  ['git force-push', /\bgit\s+push\b[^\n]*(--force\b|-f\b)(?![a-z-])/i],
  ['git push to main/master', /\bgit\s+push\b[^\n]*\b(origin\s+)?(main|master)\b/i],
  ['git hard reset', /\bgit\s+reset\s+--hard\b/i],
  ['git clean', /\bgit\s+clean\s+-[a-z]*f/i],
  ['git checkout -- (discard changes)', /\bgit\s+checkout\s+--\s/i],
  ['branch force delete', /\bgit\s+branch\s+-D\b/i],
  ['SQL DROP', /\bDROP\s+(TABLE|DATABASE|SCHEMA|VIEW)\b/i],
  ['SQL TRUNCATE', /\bTRUNCATE\b/i],
  ['SQL DELETE without WHERE', /\bDELETE\s+FROM\s+\w+\s*;?\s*$/i],
  ['package install (needs review)', /\b(pnpm|npm|yarn)\s+(add|install|i)\b/i],
  ['chmod 777', /\bchmod\s+(-R\s+)?777\b/i],
  ['pipe curl/wget to shell', /\b(curl|wget)\b[^\n]*\|\s*(sh|bash)\b/i],
  ['history rewrite (filter-branch)', /\bgit\s+filter-branch\b/i],
];

let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (data += c));
process.stdin.on('end', () => {
  try {
    const j = JSON.parse(data);
    const cmd = (j.tool_input && j.tool_input.command) || '';
    if (!cmd) process.exit(0);
    const hits = PATTERNS.filter(([, re]) => re.test(cmd)).map(([label]) => label);
    if (hits.length === 0) process.exit(0);
    // permissionDecision "ask" -> surface an approval prompt to the user.
    // Destructive but overridable: the human decides, per the corporate rule
    // that destructive/irreversible ops require explicit approval.
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason:
            `/careful: destructive pattern (${hits.join('; ')}). ` +
            `Confirm you intend to run this and understand the impact.`,
        },
      })
    );
    process.exit(0);
  } catch (_e) {
    process.exit(0); // fail open
  }
});
