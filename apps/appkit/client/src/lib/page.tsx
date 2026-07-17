import { Fragment, type ReactNode } from "react";
import { Link } from "react-router";

/** Standard page header: blue uppercase kicker → big title → muted subtitle.
 *  The house pattern from the design system — every top-level page uses it. */
export function PageHeader({
  kicker,
  title,
  sub,
  actions,
}: {
  kicker?: string;
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div className="page-head">
        <div>
          {kicker && <p className="page-kicker">{kicker}</p>}
          <h2 className="page-title">{title}</h2>
          {sub && <p className="page-sub">{sub}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
    </div>
  );
}

export interface Crumb {
  label: string;
  to?: string;
}

/** Consistent breadcrumb trail. Last item renders as the current (non-link). */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {items.map((c, i) => {
        const last = i === items.length - 1;
        return (
          <Fragment key={`${c.label}-${i}`}>
            {i > 0 && <span className="sep">/</span>}
            {c.to && !last ? (
              <Link to={c.to}>{c.label}</Link>
            ) : (
              <span className={last ? "current" : undefined}>{c.label}</span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

/** A section with a blue kicker label, matching the catalog/registry pattern. */
export function Section({
  kicker,
  children,
  actions,
}: {
  kicker: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section>
      <div className="section-head">
        <p className="section-kicker">{kicker}</p>
        {actions}
      </div>
      {children}
    </section>
  );
}
