import { Suspense, lazy, useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router";
import type { Meta } from "./lib/api";
import { PERSONAS, getMeta, getPersonaKey, setPersonaKey } from "./lib/api";
import { ToastProvider } from "./lib/toast";
import AccessPage from "./pages/AccessPage";
import AssetDetailPage from "./pages/AssetDetailPage";
import AssetEditPage from "./pages/AssetEditPage";
import AssetsPage from "./pages/AssetsPage";
import ChangesetsPage from "./pages/ChangesetsPage";
import DashboardPage from "./pages/DashboardPage";
import DqLibraryPage from "./pages/DqLibraryPage";
import MappingsPage from "./pages/MappingsPage";
import MappingDetailPage from "./pages/MappingDetailPage";
import MigrationPage from "./pages/MigrationPage";
import PipelinesPage from "./pages/PipelinesPage";
import ProductsPage from "./pages/ProductsPage";
import RegistryPage from "./pages/RegistryPage";

// Lazy: the explorer carries the pre-built ERD bundle (~1.6 MB) — load on visit.
const ExplorerPage = lazy(() => import("./pages/ExplorerPage"));

type Theme = "dark" | "light";

const THEME_KEY = "mmp-theme";

function initialTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY);
  return saved === "dark" ? "dark" : "light"; // light is the default
}

export default function App() {
  const [personaKey, setKey] = useState<string>(() => getPersonaKey());
  const [meta, setMeta] = useState<Meta | null>(null);
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    let alive = true;
    getMeta()
      .then((m) => {
        if (alive) setMeta(m);
      })
      .catch(() => {
        if (alive) setMeta(null);
      });
    return () => {
      alive = false;
    };
  }, [personaKey]);

  const onPersonaChange = (key: string) => {
    setPersonaKey(key);
    setKey(key);
  };

  return (
    <ToastProvider>
      <div className="shell">
        <header className="topbar">
          <span className="brand">Mapping and Metadata Platform</span>
          <nav>
            <NavLink to="/" end>
              Dashboard
            </NavLink>
            <NavLink to="/registry">Registry</NavLink>
            <NavLink to="/mappings">Mappings</NavLink>
            <NavLink to="/explorer">Data Model</NavLink>
            <NavLink to="/dq">DQ Library</NavLink>
            <NavLink to="/pipelines">Pipelines</NavLink>
            <NavLink to="/access">Access</NavLink>
          </nav>
          {meta && (
            <span className="who">
              {meta.mode} · {meta.store}
            </span>
          )}
          <label className="persona-label">
            <span className="muted">Persona</span>
            <select
              className="persona-select"
              value={personaKey}
              onChange={(e) => onPersonaChange(e.target.value)}
            >
              {PERSONAS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="persona-label">
            <span className="muted">Theme</span>
            <button
              type="button"
              className="theme-toggle"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              ✳
            </button>
          </label>
        </header>
        <main key={personaKey}>
          <Routes>
            {/* Dashboard = catalog (domains → products + medallion flow) */}
            <Route path="/" element={<DashboardPage />} />
            {/* Registry absorbs the flat asset list + changesets */}
            <Route path="/registry" element={<RegistryPage />} />
            <Route path="/assets" element={<AssetsPage />} />
            <Route path="/assets/new" element={<AssetEditPage />} />
            <Route path="/assets/:kind/:id" element={<AssetDetailPage />} />
            <Route path="/assets/:kind/:id/edit" element={<AssetEditPage />} />
            <Route path="/mappings" element={<MappingsPage />} />
            <Route path="/mappings/:kind/:id" element={<MappingDetailPage />} />
            {/* Data Model (explorer) */}
            <Route
              path="/explorer"
              element={
                <Suspense fallback={<p className="muted">Loading model explorer…</p>}>
                  <ExplorerPage />
                </Suspense>
              }
            />
            <Route path="/dq" element={<DqLibraryPage />} />
            <Route path="/pipelines" element={<PipelinesPage />} />
            {/* Absorbed into other sections but still deep-linkable */}
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/changesets" element={<ChangesetsPage />} />
            <Route path="/migration" element={<MigrationPage />} />
            <Route path="/access" element={<AccessPage />} />
          </Routes>
        </main>
      </div>
    </ToastProvider>
  );
}
