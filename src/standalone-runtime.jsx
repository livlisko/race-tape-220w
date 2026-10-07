import React, { createContext, useContext } from "react";

const StandaloneDataContext = createContext(null);

export function StandaloneDataProvider({ value, children }) {
  return <StandaloneDataContext.Provider value={value}>{children}</StandaloneDataContext.Provider>;
}

export function useDataApp() {
  const value = useContext(StandaloneDataContext);
  if (!value) throw new Error("Race Tape must render inside StandaloneDataProvider.");
  return value;
}

export function useDashboardTabs() {
  const { activeTabId } = useDataApp();
  return { activeTabId };
}

export function DataComponent({ id, title, description, className = "", children }) {
  return (
    <section className={["dashboard-component", className].filter(Boolean).join(" ")} data-component-id={id}>
      <header className="component-header">
        <h2 className="component-title">{title}</h2>
        {description ? <p className="component-description">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}
