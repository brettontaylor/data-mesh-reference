// Models write-back — persists merged changes to the models repo (git SoR).
//
// Env contract:
//   MODELS_WRITEBACK = off | fs | git   (default: off)
//     off — demo mode: merges update the in-memory contract only.
//     fs  — merged asset YAML + bumped product YAML written to MODELS_DIR.
//     git — fs + `git add` + `git commit` on the CURRENT branch of MODELS_DIR.
//           Never pushes. Never commits on main/master (corporate guardrail):
//           refuses with a clear error instead.
//   MODELS_DIR — models repo root (defaults to the engine's contracts dir).
//
// This is the "checked into git and executed" leg of the product-increment
// loop: merge → bump product version → write YAML → git commit → re-run.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stringify as yamlStringify } from "yaml";
import { ROOT as ENGINE_ROOT, type Product } from "@dct/engine";
import type { ModelEdit } from "./repo";

export type WritebackMode = "off" | "fs" | "git";

export function writebackMode(): WritebackMode {
  const m = (process.env.MODELS_WRITEBACK ?? "off").toLowerCase();
  return m === "fs" || m === "git" ? m : "off";
}

export function modelsDir(): string {
  return process.env.MODELS_DIR ?? join(ENGINE_ROOT, "contracts");
}

const KIND_DIR: Record<ModelEdit["kind"], string> = {
  bdm: "bdm",
  pdm: "pdm",
  semantic: "semantic",
  mapping: "mappings",
  dq: "dq",
  dqrule: "dq-rules",
  extract: "extracts",
  transformation: "transformations",
  refmap: "refmaps",
  domain: "domains",
  product: "products",
};

export interface WritebackResult {
  mode: WritebackMode;
  files: string[]; // repo-relative paths written
  commit?: string; // short sha when mode=git
}

/** Write merged edits + bumped products to the models repo; optionally commit. */
export function writeBack(
  edits: ModelEdit[],
  bumpedProducts: Product[],
  message: string,
): WritebackResult {
  const mode = writebackMode();
  if (mode === "off") return { mode, files: [] };

  const root = modelsDir();
  const files: string[] = [];

  for (const e of edits) {
    const rel = join(KIND_DIR[e.kind], `${e.id}.yaml`);
    const abs = join(root, rel);
    if (e.action === "delete") {
      // Retirement keeps the file with status: retired — an auditable tombstone
      // (hard deletion of governed specs is a manual, reviewed act).
      writeFileSync(abs, yamlStringify({ ...e.spec, status: "retired" }), "utf8");
    } else {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, yamlStringify(e.spec), "utf8");
    }
    files.push(rel.replace(/\\/g, "/"));
  }

  for (const p of bumpedProducts) {
    const rel = join("products", `${p.product}.yaml`);
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, yamlStringify(p), "utf8");
    files.push(rel.replace(/\\/g, "/"));
  }

  if (mode === "fs" || files.length === 0) return { mode, files };

  // mode === "git": commit on the current feature branch; refuse main/master.
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  if (branch === "main" || branch === "master") {
    throw new Error(
      `MODELS_WRITEBACK=git refused: models repo is on '${branch}'. ` +
        `Check out a feature branch — direct commits to main are forbidden.`,
    );
  }
  git("add", "--", ...files);
  git("commit", "-m", message);
  const commit = git("rev-parse", "--short", "HEAD");
  return { mode, files, commit };
}
