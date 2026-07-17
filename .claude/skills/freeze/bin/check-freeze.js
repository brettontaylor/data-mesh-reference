#!/usr/bin/env node
/**
 * /freeze boundary check (PreToolUse hook for Edit/Write).
 *
 * argv[2] = path to freeze state file, argv[3] = repo root.
 * Reads the tool-call JSON from stdin, extracts the target file path, and
 * BLOCKS (exit 2 + reason on stderr) if that file is outside the frozen dir.
 *
 * FAIL-OPEN: any error, missing state, or unparseable input exits 0 (allow).
 * This is an accident-prevention convenience, not a security boundary.
 */
'use strict';

function norm(p) {
  // Normalize Windows/Git-Bash path variants so prefix compare is reliable.
  if (!p) return '';
  let s = String(p).replace(/\\/g, '/');
  // /c/foo  <->  C:/foo  -> unify to lowercase drive: c:/foo
  s = s.replace(/^([A-Za-z]):\//, (_, d) => d.toLowerCase() + ':/');
  s = s.replace(/^\/([a-zA-Z])\//, (_, d) => d.toLowerCase() + ':/');
  return s;
}

let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (data += c));
process.stdin.on('end', () => {
  try {
    const stateFile = process.argv[2];
    const root = norm(process.argv[3] || process.cwd());
    const fs = require('fs');
    const path = require('path');

    const freezeRaw = fs.readFileSync(stateFile, 'utf8').trim();
    if (!freezeRaw) process.exit(0);
    let freeze = norm(freezeRaw);
    if (!freeze.endsWith('/')) freeze += '/';

    const j = JSON.parse(data);
    const ti = j.tool_input || {};
    let file = ti.file_path || ti.path || '';
    if (!file) process.exit(0);
    file = norm(file);
    if (!file.includes(':/') && !file.startsWith('/')) {
      // relative path -> resolve against repo root
      file = norm(path.posix.join(root, file));
    }

    if (file.startsWith(freeze)) process.exit(0); // inside boundary -> allow
    // permissionDecision "deny" -> hard block; that's the point of /freeze.
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason:
            `/freeze: edits are restricted to ${freezeRaw}. ` +
            `${file} is outside the boundary. Run /unfreeze to lift it, or /freeze to move it.`,
        },
      })
    );
    process.exit(0);
  } catch (_e) {
    process.exit(0); // fail open
  }
});
