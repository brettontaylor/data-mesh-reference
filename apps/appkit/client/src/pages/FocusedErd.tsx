import { Suspense, lazy, useEffect, useState } from "react";
import { getErdModels } from "../lib/api";
import type { SourceModel } from "../vendor/erd/erd";

/** Focused, embedded ERD for an entity's detail page. The vendored ErdExplorer
 *  (~1.6 MB) is pulled in behind a dynamic import() so it lands in its own chunk
 *  — AssetDetail's own bundle stays light and only pays for the diagram when a
 *  model page is actually viewed. `SourceModel` is a type-only import (erased at
 *  build), so it adds no runtime weight here. */
const ErdInner = lazy(async () => {
  const { ErdExplorer } = await import("../vendor/erd/erd");

  function Inner({ focusId }: { focusId: string }) {
    const [models, setModels] = useState<SourceModel[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      let alive = true;
      getErdModels()
        .then((r) => {
          if (alive) setModels(r.models);
        })
        .catch((e: unknown) => {
          if (alive) setError(e instanceof Error ? e.message : String(e));
        });
      return () => {
        alive = false;
      };
    }, []);

    if (error) {
      return <div className="erd-host ad-erd-msg">Could not load diagram: {error}</div>;
    }
    if (!models) {
      return <div className="erd-host ad-erd-msg">Loading diagram…</div>;
    }
    return (
      <div className="erd-host ad-erd">
        <ErdExplorer
          models={models}
          compact
          initialFocus={focusId}
          height="340px"
          openHref="/explorer"
        />
      </div>
    );
  }

  return { default: Inner };
});

/** Small lazy wrapper so AssetDetailPage can render an entity-focused ERD
 *  without statically bundling the vendored explorer. */
export default function FocusedErd({ focusId }: { focusId: string }) {
  return (
    <Suspense
      fallback={<div className="erd-host ad-erd-msg">Loading diagram…</div>}
    >
      <ErdInner focusId={focusId} />
    </Suspense>
  );
}
