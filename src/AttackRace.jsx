import React, { useCallback, useEffect, useMemo, useState } from "react";

const THRESHOLD_W = 220;
const WEIGHT_KG = 68.0388555;
const CHART_WIDTH = 1120;
const CHART_HEIGHT = 304;
const PLOT = { left: 54, right: 48, top: 24, bottom: 48 };
const TP_CONTEXT = Object.freeze({ normalizedPower: 223, intensityFactor: 0.89, tss: 280 });

function number(value, digits = 0) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "—";
}

function duration(value, compact = true) {
  const seconds = Math.max(0, Math.round(Number(value) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  if (compact && minutes) return `${minutes}:${String(secs).padStart(2, "0")}`;
  if (compact) return `${secs}s`;
  return `${minutes}m ${String(secs).padStart(2, "0")}s`;
}

function average(rows, field, predicate = () => true) {
  const values = rows.map((row) => Number(row[field])).filter((value) => Number.isFinite(value) && predicate(value));
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function pathFromPoints(points, xOf, yOf, field) {
  let path = "";
  let penDown = false;
  points.forEach((point) => {
    if (point[field] === null || point[field] === undefined) {
      penDown = false;
      return;
    }
    const value = Number(point[field]);
    if (!Number.isFinite(value)) {
      penDown = false;
      return;
    }
    path += `${penDown ? " L" : "M"}${xOf(point).toFixed(2)},${yOf(value).toFixed(2)}`;
    penDown = true;
  });
  return path;
}

function buildChartBins(ride, bins = 840) {
  const size = Math.max(1, Math.ceil(ride.length / bins));
  const output = [];
  for (let start = 0; start < ride.length; start += size) {
    const rows = ride.slice(start, Math.min(ride.length, start + size));
    const powers = rows.map((row) => Number(row.power_w)).filter(Number.isFinite);
    const hrs = rows.map((row) => Number(row.heart_rate_bpm)).filter(Number.isFinite);
    output.push({
      active_s: rows[Math.floor(rows.length / 2)].active_s,
      power_w: powers.length ? powers.reduce((sum, value) => sum + value, 0) / powers.length : null,
      heart_rate_bpm: hrs.length ? hrs.reduce((sum, value) => sum + value, 0) / hrs.length : null,
    });
  }
  return output;
}

function useUrlEffort(efforts) {
  const first = efforts[0]?.lap_id;
  const initial = useMemo(() => {
    const requested = new URLSearchParams(window.location.search).get("effort");
    return efforts.some((row) => row.lap_id === requested) ? requested : first;
  }, [efforts, first]);
  const [selected, setSelected] = useState(initial);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selected) url.searchParams.set("effort", selected);
    else url.searchParams.delete("effort");
    window.history.replaceState({}, "", url);
  }, [selected]);
  return [selected, setSelected];
}

function StatCard({ label, value, unit, source }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}{source ? <sup title={source}>†</sup> : null}</div>
      <div className="stat-value">{value} {unit ? <span className="stat-unit">{unit}</span> : null}</div>
    </div>
  );
}

function RaceSummary({ ride, overview }) {
  const summary = overview[0];
  const nonzeroAverage = average(ride, "power_w", (value) => value > 0);
  const avgHeart = average(ride, "heart_rate_bpm", (value) => value > 0);
  const maxPower = Math.max(...ride.map((row) => Number(row.power_w) || 0));
  return (
    <section className="ride-summary" aria-label="GFNY ride summary">
      <StatCard label="Duration" value={duration(summary.ride_timer_s)} />
      <StatCard label="Distance" value={number(summary.ride_distance_mi, 1)} unit="mi" />
      <StatCard label="Avg Power" value={number(nonzeroAverage)} unit="W" />
      <StatCard label="NP" value={TP_CONTEXT.normalizedPower} unit="W" source="TrainingPeaks export" />
      <StatCard label="Avg W/kg" value={number(nonzeroAverage / WEIGHT_KG, 2)} />
      <StatCard label="Max Power" value={maxPower} unit="W" />
      <StatCard label="Avg HR" value={number(avgHeart)} unit="bpm" />
      <StatCard label="IF" value={TP_CONTEXT.intensityFactor.toFixed(2)} source="TrainingPeaks export" />
      <StatCard label="TSS" value={TP_CONTEXT.tss} source="TrainingPeaks export" />
    </section>
  );
}

function RidePowerProfile({ ride, efforts, selected, onChoose }) {
  const [hover, setHover] = useState(null);
  const bins = useMemo(() => buildChartBins(ride), [ride]);
  const total = Number(ride.at(-1)?.active_s) || 1;
  const maxPower = Math.max(600, ...ride.map((row) => Number(row.power_w) || 0));
  const innerWidth = CHART_WIDTH - PLOT.left - PLOT.right;
  const innerHeight = CHART_HEIGHT - PLOT.top - PLOT.bottom;
  const xOf = useCallback((row) => PLOT.left + (Number(row.active_s) / total) * innerWidth, [innerWidth, total]);
  const yPower = useCallback((value) => PLOT.top + innerHeight - (Math.max(0, Math.min(maxPower, value)) / maxPower) * innerHeight, [innerHeight, maxPower]);
  const yHeart = useCallback((value) => PLOT.top + innerHeight - ((Math.max(110, Math.min(190, value)) - 110) / 80) * innerHeight, [innerHeight]);
  const powerPath = useMemo(() => pathFromPoints(bins, xOf, yPower, "power_w"), [bins, xOf, yPower]);
  const heartPath = useMemo(() => pathFromPoints(bins, xOf, yHeart, "heart_rate_bpm"), [bins, xOf, yHeart]);
  const effortPaths = useMemo(() => efforts.map((effort) => {
    const points = ride.slice(effort.start_sample_index, effort.end_sample_index + 1);
    return pathFromPoints(points, xOf, yPower, "power_w");
  }), [efforts, ride, xOf, yPower]);
  const ticks = [0, 45 * 60, 90 * 60, 135 * 60, 180 * 60, total];
  const powerTicks = [0, 200, 400, 600].filter((value) => value <= maxPower);

  const locate = useCallback((event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const active = Math.round(fraction * total);
    const row = ride[Math.min(ride.length - 1, Math.max(0, active))];
    setHover({ ...row, fraction });
  }, [ride, total]);

  const chooseNearest = useCallback((event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const active = ((event.clientX - rect.left) / rect.width) * total;
    const containing = efforts.find((effort) => active >= effort.start_active_s && active <= effort.end_active_s);
    const nearest = containing || efforts.reduce((best, effort) => (
      Math.abs(effort.start_active_s - active) < Math.abs(best.start_active_s - active) ? effort : best
    ), efforts[0]);
    if (nearest) onChoose(nearest.lap_id, true);
  }, [efforts, onChoose, total]);

  return (
    <section className="chart-container" aria-labelledby="ride-profile-title">
      <h2 className="chart-title" id="ride-profile-title">Ride Power Profile</h2>
      <p className="chart-subtitle">The whole race at once. Orange marks the 68 strict surges; click anywhere to open the nearest one.</p>
      <div className="chart-legend" aria-label="Chart legend">
        <span><i className="key-power" />Power</span>
        <span><i className="key-effort" />Detected surge</span>
        <span><i className="key-heart" />Heart rate</span>
        <span><i className="key-threshold" />220 W</span>
      </div>
      <div className="chart-wrapper">
        <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label="Full race power, heart rate, and 68 detected surges">
          <defs>
            <linearGradient id="power-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5cc8b0" stopOpacity=".2" /><stop offset="1" stopColor="#5cc8b0" stopOpacity="0" /></linearGradient>
          </defs>
          <rect x={PLOT.left} y={PLOT.top} width={innerWidth} height={innerHeight} className="chart-plot" />
          {powerTicks.map((value) => { const y = yPower(value); return <g key={value} aria-hidden="true"><line x1={PLOT.left} x2={CHART_WIDTH - PLOT.right} y1={y} y2={y} className="chart-grid" /><text x={PLOT.left - 10} y={y + 4} textAnchor="end" className="chart-axis">{value}</text></g>; })}
          {ticks.map((value, index) => { const x = PLOT.left + (value / total) * innerWidth; return <g key={`${value}-${index}`} aria-hidden="true"><line x1={x} x2={x} y1={PLOT.top} y2={PLOT.top + innerHeight} className="chart-grid vertical" /><text x={x} y={CHART_HEIGHT - 18} textAnchor={index === 0 ? "start" : index === ticks.length - 1 ? "end" : "middle"} className="chart-axis">{duration(value)}</text></g>; })}
          <line x1={PLOT.left} x2={CHART_WIDTH - PLOT.right} y1={yPower(THRESHOLD_W)} y2={yPower(THRESHOLD_W)} className="chart-threshold" />
          <text x={PLOT.left + 6} y={yPower(THRESHOLD_W) - 6} className="chart-threshold-label">220 W</text>
          <path d={`${powerPath} L${CHART_WIDTH - PLOT.right},${PLOT.top + innerHeight} L${PLOT.left},${PLOT.top + innerHeight} Z`} className="power-area" />
          <path d={powerPath} className="power-line" />
          {effortPaths.map((path, index) => <path key={efforts[index].lap_id} d={path} className={`effort-line ${efforts[index].lap_id === selected ? "selected" : ""}`} />)}
          <path d={heartPath} className="heart-line" />
          {hover ? <line x1={PLOT.left + hover.fraction * innerWidth} x2={PLOT.left + hover.fraction * innerWidth} y1={PLOT.top} y2={PLOT.top + innerHeight} className="hover-line" /> : null}
          <rect x={PLOT.left} y={PLOT.top} width={innerWidth} height={innerHeight} className="chart-hit" tabIndex="0" aria-label="Interactive full-race chart" onPointerMove={locate} onPointerLeave={() => setHover(null)} onClick={chooseNearest} />
        </svg>
        {hover ? <div className="chart-tooltip" style={{ left: `${Math.max(7, Math.min(93, hover.fraction * 100))}%` }}><strong>{duration(hover.active_s)}</strong><span>{number(hover.power_w)} W</span><span>{number(hover.heart_rate_bpm)} bpm</span><small>{hover.lap_id}</small></div> : null}
      </div>
      <p className="chart-note">Summary power matches Attack Detector by omitting zero-power seconds; surge boundaries always use every raw recorded second.</p>
    </section>
  );
}

function Metric({ label, children, wide = false }) {
  return <div className={`metric ${wide ? "metric-wide" : ""}`}><span className="metric-label">{label}</span><span className="metric-value">{children}</span></div>;
}

function hrContextFor(effort, ride) {
  const recordingSegment = ride[effort.start_sample_index]?.recording_segment;
  const sameRecording = (row) => row.recording_segment === recordingSegment;
  const before = ride.filter((row) => sameRecording(row) && row.active_s >= effort.start_active_s - 15 && row.active_s < effort.start_active_s);
  const during = ride.slice(effort.start_sample_index, effort.end_sample_index + 1);
  const after = ride.filter((row) => sameRecording(row) && row.active_s > effort.end_active_s && row.active_s <= effort.end_active_s + 15);
  return {
    before: average(before, "heart_rate_bpm", (value) => value > 0), during: average(during, "heart_rate_bpm", (value) => value > 0),
    after: average(after, "heart_rate_bpm", (value) => value > 0), peak: Math.max(...after.map((row) => Number(row.heart_rate_bpm) || 0), 0),
  };
}

function RouteMiniMap({ effort, route }) {
  const width = 1040; const height = 220; const padding = 18;
  const context = route.slice(Math.max(0, effort.start_sample_index - 90), Math.min(route.length, effort.end_sample_index + 91));
  const selected = route.slice(effort.start_sample_index, effort.end_sample_index + 1);
  const xs = context.map((row) => Number(row.route_x_m)); const ys = context.map((row) => Number(row.route_y_m));
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const scale = Math.min((width - padding * 2) / Math.max(1, maxX - minX), (height - padding * 2) / Math.max(1, maxY - minY));
  const offsetX = (width - (maxX - minX) * scale) / 2; const offsetY = (height - (maxY - minY) * scale) / 2;
  const coords = (row) => [offsetX + (row.route_x_m - minX) * scale, height - offsetY - (row.route_y_m - minY) * scale];
  const point = (row) => coords(row).map((value) => value.toFixed(1)).join(",");
  const sampled = context.filter((_, index) => index % 2 === 0 || index === context.length - 1);
  const start = selected[0]; const end = selected.at(-1); const startPoint = start ? coords(start) : null; const endPoint = end ? coords(end) : null;
  return (
    <div className="effort-map" aria-label={`${effort.lap_id} location on the GFNY course`}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        <rect width={width} height={height} className="map-bg" />
        <g className="map-streets" aria-hidden="true"><path d="M-20 45 L360 30 L760 75 L1080 52" /><path d="M90 -20 L180 250" /><path d="M420 -20 L500 250" /><path d="M760 -20 L840 250" /><path d="M0 180 L380 145 L730 165 L1050 125" /></g>
        <polyline points={sampled.map(point).join(" ")} className="route-base" />
        <polyline points={selected.map(point).join(" ")} className="route-selected" />
        {startPoint ? <circle cx={startPoint[0]} cy={startPoint[1]} r="5" className="route-start" /> : null}
        {endPoint ? <circle cx={endPoint[0]} cy={endPoint[1]} r="6" className="route-end" /> : null}
      </svg>
      <span className="map-caption"><strong>{effort.lap_id}</strong> · {effort.course_section} · mi {number(effort.start_distance_mi, 1)}–{number(effort.end_distance_mi, 1)}</span>
    </div>
  );
}

function EffortDetails({ effort, ride, route }) {
  const hr = useMemo(() => hrContextFor(effort, ride), [effort, ride]);
  const startAltitude = Number(ride[effort.start_sample_index]?.altitude_ft); const endAltitude = Number(ride[effort.end_sample_index]?.altitude_ft);
  const elevationChange = Number.isFinite(startAltitude) && Number.isFinite(endAltitude) ? endAltitude - startAltitude : null;
  return (
    <div className="effort-details">
      <div className="effort-metrics">
        <Metric label="Avg Power">{number(effort.avg_power_w)} W</Metric><Metric label="Max Power">{number(effort.peak_power_w)} W</Metric>
        <Metric label="Avg W/kg">{number(effort.avg_power_wkg, 2)}</Metric><Metric label="Max W/kg">{number(effort.peak_power_wkg, 2)}</Metric>
        <Metric label="Best 5 sec">{number(effort.best_5s_w)} W</Metric><Metric label="Best 15 sec">{number(effort.best_15s_w)} W</Metric>
        <Metric label="Duration">{duration(effort.duration_s)}</Metric><Metric label="Work">{number(effort.work_kj, 1)} kJ</Metric>
        <Metric label="Avg HR">{number(effort.avg_hr_bpm)} bpm</Metric><Metric label="Max HR">{number(effort.max_hr_bpm)} bpm</Metric>
        <Metric label="Avg Speed">{number(effort.avg_speed_mph, 1)} mph</Metric><Metric label="Avg Cadence">{number(effort.avg_cadence_rpm)} rpm</Metric>
        <Metric label="Mile Marker">{number(effort.start_distance_mi, 1)} → {number(effort.end_distance_mi, 1)}</Metric><Metric label="Time in Ride">{duration(effort.start_active_s)} → {duration(effort.end_active_s)}</Metric>
        <Metric label="Elev Change">{elevationChange === null ? "—" : `${elevationChange >= 0 ? "+" : ""}${number(elevationChange)} ft`}</Metric><Metric label="Course Section">{effort.course_section}</Metric>
        <Metric label="Heart-rate response" wide><span className="hr-context-bar"><span className="hr-ctx-segment"><small>15s before</small><b>{number(hr.before)} bpm</b></span><i>→</i><span className="hr-ctx-segment during"><small>during</small><b>{number(hr.during)} bpm</b></span><i>→</i><span className="hr-ctx-segment"><small>15s after</small><b>{number(hr.after)} bpm</b></span><i>→</i><span className="hr-ctx-segment peak"><small>post peak</small><b>{number(hr.peak)} bpm</b></span></span></Metric>
      </div>
      <RouteMiniMap effort={effort} route={route} />
    </div>
  );
}

function EffortCard({ effort, expanded, selected, onToggle, ride, route }) {
  const panelId = `details-${effort.lap_id}`;
  return (
    <article className={`effort-card ${selected ? "is-selected" : ""}`} id={`effort-${effort.lap_id}`}>
      <button type="button" className="effort-card-header" aria-expanded={expanded} aria-controls={panelId} onClick={() => onToggle(effort.lap_id)}>
        <span className="effort-number"><span className="effort-badge">{String(effort.effort_id).padStart(2, "0")}</span><span className="effort-title-group"><strong className="effort-title">{effort.course_section} <span className="zone-tag">{effort.lap_id}</span></strong><span className="effort-subtitle">mi {number(effort.start_distance_mi, 1)} · {duration(effort.start_active_s)} into ride</span></span></span>
        <span className="effort-headline-stats"><span className="headline-stat"><b>{number(effort.avg_power_w)} W</b><small>Avg power</small></span><span className="headline-stat"><b>{duration(effort.duration_s)}</b><small>Duration</small></span><span className="disclosure" aria-hidden="true">{expanded ? "−" : "+"}</span></span>
      </button>
      {expanded ? <div id={panelId}><EffortDetails effort={effort} ride={ride} route={route} /></div> : null}
    </article>
  );
}

function exportLaps(laps) {
  const columns = ["lap_seq", "lap_id", "lap_type", "course_section", "start_active_s", "end_active_s", "duration_s", "distance_mi", "avg_power_w", "peak_power_w", "avg_power_wkg", "peak_power_wkg", "best_5s_w", "best_15s_w", "avg_hr_bpm", "max_hr_bpm", "avg_speed_mph", "max_speed_mph", "avg_cadence_rpm", "time_above_220_s", "work_kj"];
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [columns.join(","), ...laps.map((lap) => columns.map((column) => escape(lap[column])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = "gfny-68-surges-and-between-laps.csv"; link.click(); URL.revokeObjectURL(url);
}

export function AttackRace({ snapshot }) {
  const ride = snapshot.queries.ride_series.rows; const overview = snapshot.queries.race_overview.rows; const laps = snapshot.queries.lap_segments.rows; const route = snapshot.queries.route_points.rows;
  const efforts = useMemo(() => laps.filter((lap) => lap.lap_type === "Effort"), [laps]);
  const [selected, setSelected] = useUrlEffort(efforts);
  const [expanded, setExpanded] = useState(() => new Set(selected ? [selected] : []));
  const choose = useCallback((lapId, scroll = false) => {
    setSelected(lapId); setExpanded((current) => new Set(current).add(lapId));
    if (scroll) window.requestAnimationFrame(() => document.getElementById(`effort-${lapId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [setSelected]);
  const toggle = useCallback((lapId) => {
    setSelected(lapId); setExpanded((current) => { const next = new Set(current); if (next.has(lapId)) next.delete(lapId); else next.add(lapId); return next; });
  }, [setSelected]);
  const printAll = useCallback(() => { setExpanded(new Set(efforts.map((effort) => effort.lap_id))); window.setTimeout(() => window.print(), 120); }, [efforts]);

  return (
    <main className="app">
      <header className="header"><p className="eyebrow">One race · one very long day</p><h1>GFNY <span>Attack Detector</span></h1><p>Maryland · 92.1 miles · analyzed once, always ready</p></header>
      <RaceSummary ride={ride} overview={overview} />
      <RidePowerProfile ride={ride} efforts={efforts} selected={selected} onChoose={choose} />
      <section aria-labelledby="detected-attacks-title">
        <div className="results-header"><div><h2 id="detected-attacks-title">Detected Attacks</h2><p>Every raw-power surge above 220 W that lasted at least 16 uninterrupted recorded seconds.</p></div><div className="result-actions"><span className="count">{efforts.length} efforts</span><button type="button" className="action-btn" onClick={() => exportLaps(laps)}>Export CSV</button><button type="button" className="action-btn" onClick={printAll}>Print All</button></div></div>
        <div className="effort-list">{efforts.map((effort) => <EffortCard key={effort.lap_id} effort={effort} expanded={expanded.has(effort.lap_id)} selected={selected === effort.lap_id} onToggle={toggle} ride={ride} route={route} />)}</div>
      </section>
      <footer className="method-footer"><strong>How this race is cut:</strong> strictly &gt;220 W for 16+ consecutive recorded seconds. Exactly 220 W stays between efforts; auto-pauses are barriers; no smoothing, merging, or FTP assumption. W/kg uses 150 lb. † NP, IF, and TSS come from the attached TrainingPeaks export.</footer>
    </main>
  );
}
