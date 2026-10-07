import React, { useEffect, useState } from "react";

import { AttackRace } from "./AttackRace.jsx";

const DATA_URL = `${import.meta.env.BASE_URL}race-tape-data.json`;

function LoadingState() {
  return (
    <main className="app">
      <header className="header compact-header">
        <h1>GFNY <span>Attack Detector</span></h1>
        <p>Loading the race tape</p>
      </header>
      <div className="loading-card" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <strong>Reading 12,851 race seconds…</strong>
      </div>
    </main>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <main className="app">
      <header className="header compact-header">
        <h1>GFNY <span>Attack Detector</span></h1>
        <p>The race tape needs another try</p>
      </header>
      <div className="loading-card is-error" role="alert">
        <strong>Could not load the GFNY race.</strong>
        <span>{message}</span>
        <button type="button" className="action-btn primary" onClick={onRetry}>Try again</button>
      </div>
    </main>
  );
}

export function App() {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    fetch(DATA_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Data request returned ${response.status}.`);
        return response.json();
      })
      .then(setSnapshot)
      .catch((loadError) => {
        if (loadError.name !== "AbortError") setError(loadError.message || "Unknown loading error.");
      });
    return () => controller.abort();
  }, [retry]);

  if (error) return <ErrorState message={error} onRetry={() => setRetry((value) => value + 1)} />;
  if (!snapshot) return <LoadingState />;
  return <AttackRace snapshot={snapshot} />;
}
