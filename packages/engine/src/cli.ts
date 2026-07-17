// dmref CLI — drive the reference data mesh.
//   generate  contracts -> generated/ (databricks, snowflake, postgres, cube, catalog)
//   check     run governance gates (classification, registry, fk, propagation)
//   run       execute the medallion locally on synthetic data
//   demo      check -> generate -> run -> verify propagation
import { loadContract } from "./framework/load";
import { checkContract, checkPropagation, type Issue } from "./governance/checks";
import { generateAll, writeGenerated } from "./generators";
import { runMedallion } from "./medallion/run";
import {
  buildModels,
  checkVersions,
  statusVsLock,
  writeLock,
} from "./registry/registry";

function printIssues(issues: Issue[]): number {
  const errors = issues.filter((i) => i.level === "error");
  const warns = issues.filter((i) => i.level === "warn");
  for (const i of issues) {
    const tag = i.level === "error" ? "✗ ERROR" : "• warn ";
    console.log(`  ${tag} [${i.code}] ${i.message}`);
  }
  if (!issues.length) console.log("  ✓ no issues");
  else console.log(`  ${errors.length} error(s), ${warns.length} warning(s)`);
  return errors.length;
}

function cmdCheck(includePropagation = true): number {
  const c = loadContract();
  console.log(`\nGovernance — ${c.spec.name} v${c.spec.version}`);
  let errors = printIssues(checkContract(c));
  console.log("\nModel versioning:");
  errors += printIssues(checkVersions(c));
  if (includePropagation) {
    console.log("\nPropagation:");
    errors += printIssues(checkPropagation(c));
  }
  return errors;
}

function cmdModels(): number {
  const c = loadContract();
  const rows = statusVsLock(c);
  console.log(`\nModel registry — ${c.spec.name}`);
  console.log("  kind      model                    version  locked   change");
  for (const r of rows) {
    console.log(
      `  ${r.kind.padEnd(9)} ${r.id.padEnd(24)} ${r.version.padEnd(8)} ${(r.locked ?? "—").padEnd(8)} ${r.change}`,
    );
  }
  return 0;
}

function cmdModel(id: string | undefined): number {
  if (!id) {
    console.log("usage: dmref model <id>");
    return 2;
  }
  const c = loadContract();
  const m = buildModels(c).find((x) => x.id === id);
  if (!m) {
    console.log(`unknown model "${id}". Run \`dmref models\`.`);
    return 1;
  }
  console.log(`\n${m.kind.toUpperCase()} ${m.id}  v${m.version}  [${m.status}]`);
  console.log(`  depends on: ${m.dependsOn.join(", ") || "—"}`);
  console.log("  surface:");
  console.log(
    JSON.stringify(m.surface, null, 2)
      .split("\n")
      .map((l) => "    " + l)
      .join("\n"),
  );
  return 0;
}

function cmdRegister(): number {
  const c = loadContract();
  // Refuse to register if versioning is inconsistent.
  const vissues = checkVersions(c).filter((i) => i.level === "error");
  if (vissues.length) {
    console.log("\nRefusing to register — fix versioning first:");
    printIssues(vissues);
    return 1;
  }
  const n = writeLock(c);
  console.log(`\n✓ registered ${n} models → contracts/registry.lock.json`);
  return 0;
}

function cmdGenerate(): number {
  const c = loadContract();
  const staticErrors = checkContract(c).filter((i) => i.level === "error");
  if (staticErrors.length) {
    console.log("\nRefusing to generate — contract has governance errors:");
    printIssues(staticErrors);
    return 1;
  }
  const files = generateAll(c);
  const out = writeGenerated(files);
  console.log(`\nGenerated ${files.length} files into ${out.replace(process.cwd(), ".")}`);
  const groups = files.reduce<Record<string, number>>((acc, f) => {
    const top = f.path.split("/")[0]!;
    acc[top] = (acc[top] ?? 0) + 1;
    return acc;
  }, {});
  for (const [g, n] of Object.entries(groups)) console.log(`  ${g.padEnd(12)} ${n}`);
  return 0;
}

function cmdRun(): number {
  const c = loadContract();
  console.log(`\nMedallion run — ${c.spec.name}`);
  console.log("  entity         bronze  silver  gold   dropped(no-pk/dup)");
  for (const s of runMedallion(c)) {
    console.log(
      `  ${s.entity.padEnd(14)} ${String(s.bronze).padStart(6)}  ${String(s.silver).padStart(6)}  ${String(s.gold).padStart(5)}   ${s.droppedNoPk}/${s.droppedDup}`,
    );
  }
  return 0;
}

function main() {
  const cmd = process.argv[2] ?? "demo";
  switch (cmd) {
    case "check":
      process.exit(cmdCheck() > 0 ? 1 : 0);
      break;
    case "generate":
      process.exit(cmdGenerate());
      break;
    case "run":
      process.exit(cmdRun());
      break;
    case "models":
      process.exit(cmdModels());
      break;
    case "model":
      process.exit(cmdModel(process.argv[3]));
      break;
    case "register":
      process.exit(cmdRegister());
      break;
    case "demo": {
      const e1 = cmdCheck(false);
      if (e1 > 0) process.exit(1);
      cmdGenerate();
      cmdRun();
      console.log("\nVerify propagation:");
      const e2 = printIssues(checkPropagation(loadContract()));
      console.log("\n✓ demo complete");
      process.exit(e2 > 0 ? 1 : 0);
      break;
    }
    default:
      console.log("usage: dmref <generate|check|run|demo|models|model|register>");
      process.exit(2);
  }
}

main();
