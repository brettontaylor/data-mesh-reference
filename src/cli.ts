// dmref CLI — drive the reference data mesh.
//   generate  contracts -> generated/ (databricks, snowflake, cube, catalog)
//   check     run governance gates (classification, registry, fk, propagation)
//   run       execute the medallion locally on synthetic data
//   demo      check -> generate -> run -> verify propagation
import { loadContract } from "./framework/load";
import { checkContract, checkPropagation, type Issue } from "./governance/checks";
import { generateAll, writeGenerated } from "./generators";
import { runMedallion } from "./medallion/run";

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
  if (includePropagation) {
    console.log("\nPropagation:");
    errors += printIssues(checkPropagation(c));
  }
  return errors;
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
      console.log("usage: dmref <generate|check|run|demo>");
      process.exit(2);
  }
}

main();
