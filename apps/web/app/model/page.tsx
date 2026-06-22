import { dct } from "../lib/client";
import { ErdExplorer } from "../../erd";

export const dynamic = "force-dynamic";

export default async function ModelPage() {
  // The ERD is data-driven: it renders whatever BDMs the control-plane API returns,
  // so it tracks the live model set with no spec to maintain. Switch to dct.registry()
  // to include PDM / semantic / source models (the "All" toggle covers this client-side).
  const { models } = await dct.models({ kind: "bdm" });

  return (
    <>
      <p className="eyebrow">Data model</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Interactive ERD</h1>
      <p className="mt-2 text-sm text-muted">
        {models.length} business models · click an entity to expand its fields · click a{" "}
        <span className="text-accent">FK→</span> to traverse · &ldquo;View as&rdquo; masks attributes by clearance.
      </p>
      <div className="mt-6">
        <ErdExplorer models={models} />
      </div>
    </>
  );
}
