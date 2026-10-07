import React, { useCallback, useEffect, useMemo, useState } from "react";

import { DashboardContent } from "./DashboardContent.jsx";
import { StandaloneDataProvider } from "./standalone-runtime.jsx";

const DATA_URL = `${import.meta.env.BASE_URL}race-tape-data.json`;
const TABS = [
  { id: "dashboard", label: "Race Tape" },
  { id: "effort-gallery", label: "Effort Gallery" },
  { id: "lap-log", label: "Lap Log" },
  { id: "route-map", label: "Route Map" },
];
const TAB_IDS = new Set(TABS.map((tab) => tab.id));

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  const requestedTab = params.get("tab");
  return {
    tabId: TAB_IDS.has(requestedTab) ? requestedTab : "dashboard",
    lapId: params.get("lap") || undefined,
  };
}

function LoadingState() {
  return (
    <div className="load-state" role="status" aria-live="polite">
      <div className="load-meter" aria-hidden="true"><i /></div>
      <strong>Loading Race Tape…</strong>
      <span>Preparing 12,851 one-second samples and 137 synthetic laps.</span>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="load-state is-error" role="alert">
      <strong>Race Tape could not load.</strong>
      <span>{message}</span>
      <button type="button" onClick={onRetry}>Try again</button>
    </div>
  );
}

export function App() {
  const initialUrlState = useMemo(readUrlState, []);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [activeTabId, setActiveTabId] = useState(initialUrlState.tabId);
  const [viewFocus, setViewFocus] = useState(initialUrlState.lapId ? { lapId: initialUrlState.lapId } : {});

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    fetch(DATA_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Data request returned ${response.status}.`);
        return response.json();
      })
      .then((nextSnapshot) => setSnapshot(nextSnapshot))
      .catch((loadError) => {
        if (loadError.name !== "AbortError") setError(loadError.message || "Unknown loading error.");
      });
    return () => controller.abort();
  }, [reloadToken]);

  useEffect(() => {
    const onPopState = () => {
      const next = readUrlState();
      setActiveTabId(next.tabId);
      setViewFocus(next.lapId ? { lapId: next.lapId } : {});
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", activeTabId);
    if (viewFocus.lapId) url.searchParams.set("lap", viewFocus.lapId);
    else url.searchParams.delete("lap");
    window.history.replaceState({}, "", url);
  }, [activeTabId, viewFocus.lapId]);

  const selectTab = useCallback((tabId) => {
    if (!TAB_IDS.has(tabId) || tabId === activeTabId) return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tabId);
    window.history.pushState({}, "", url);
    setActiveTabId(tabId);
  }, [activeTabId]);

  const handleTabKeyDown = useCallback((event, currentIndex) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    let nextIndex = currentIndex;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % TABS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = TABS.length - 1;
    const nextTabId = TABS[nextIndex].id;
    selectTab(nextTabId);
    window.requestAnimationFrame(() => document.getElementById(`tab-${nextTabId}`)?.focus());
  }, [selectTab]);

  const setDashboardFocus = useCallback((nextFocus) => {
    setViewFocus((current) => current.lapId === nextFocus?.lapId ? current : (nextFocus ?? {}));
  }, []);

  const contextValue = useMemo(() => ({
    activeTabId,
    viewFocus,
    setDashboardFocus,
    visible: () => true,
    reviewedRows: (queryId) => snapshot?.queries?.[queryId]?.rows ?? [],
    snapshot,
  }), [activeTabId, setDashboardFocus, snapshot, viewFocus]);

  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="site-header-inner">
          <div className="site-brand">
            <h1>Race Tape</h1>
            <p>220 W Effort Laps</p>
          </div>
          <nav className="site-tabs" role="tablist" aria-label="Race Tape views">
            {TABS.map((tab, index) => (
              <button key={tab.id} id={`tab-${tab.id}`} type="button" role="tab"
                aria-selected={activeTabId === tab.id} aria-controls="race-tape-view"
                tabIndex={activeTabId === tab.id ? 0 : -1}
                className={activeTabId === tab.id ? "is-active" : ""}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                onClick={() => selectTab(tab.id)}>{tab.label}</button>
            ))}
          </nav>
        </div>
      </header>
      <main id="race-tape-view" className="site-main" role="tabpanel"
        aria-labelledby={`tab-${activeTabId}`}>
        {!snapshot && !error ? <LoadingState /> : null}
        {error ? <ErrorState message={error} onRetry={() => setReloadToken((value) => value + 1)} /> : null}
        {snapshot ? (
          <StandaloneDataProvider value={contextValue}>
            <DashboardContent />
          </StandaloneDataProvider>
        ) : null}
      </main>
    </div>
  );
}
