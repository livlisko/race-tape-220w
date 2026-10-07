import React, { useMemo } from "react";

import { projectedRoute } from "./RaceExplorer.jsx";

const THRESHOLD_W = 220;
const CHART_MAX_W = 600;

function formatTime(seconds) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${minutes}:${String(secs).padStart(2, "0")}`;
}

function number(value, digits = 0) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "—";
}

function average(rows, field) {
  const values = rows.map((row) => Number(row[field])).filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function metricPath(rows, field, start, end, minimum, maximum, width, top, height) {
  const range = Math.max(1, maximum - minimum);
  let path = "";
  let previous = null;
  let previousRecordingSegment = null;
  rows.forEach((row) => {
    const active = Number(row.active_s);
    const raw = row[field];
    if (!Number.isFinite(active) || raw === null || raw === undefined || !Number.isFinite(Number(raw))) {
      previous = null;
      previousRecordingSegment = null;
      return;
    }
    const x = (active - start) / Math.max(1, end - start) * width;
    const y = top + height - Math.min(1, Math.max(0, (Number(raw) - minimum) / range)) * height;
    const recordingSegment = row.recording_segment ?? null;
    const command = previous === null || active - previous > 1
      || (previousRecordingSegment !== null && recordingSegment !== previousRecordingSegment) ? "M" : "L";
    path += `${path ? " " : ""}${command}${x.toFixed(2)},${y.toFixed(2)}`;
    previous = active;
    previousRecordingSegment = recordingSegment;
  });
  return path;
}

function SurgeSparkline({ effort, samples, maximum }) {
  const width = 250;
  const height = 58;
  const line = metricPath(samples, "power_w", effort.start_active_s, Math.max(effort.start_active_s + 1, effort.end_active_s), 0, maximum, width, 4, 48);
  const thresholdY = 4 + 48 - THRESHOLD_W / maximum * 48;
  return <svg className="surge-sparkline" viewBox={`0 0 ${width} ${height}`} role="img"
    aria-label={`${effort.lap_id} one-second power profile from ${number(Math.min(...samples.map((row) => Number(row.power_w))))} to ${number(effort.peak_power_w)} watts`}>
    <rect x="0" y="4" width={width} height="48" className="surge-spark-bg" />
    <line x1="0" x2={width} y1={thresholdY} y2={thresholdY} className="threshold-line" />
    <path d={line} className="surge-spark-line" />
  </svg>;
}

function SurgeRoute({ route, effort }) {
  const geometry = useMemo(() => projectedRoute(route, effort.lap_id, 360, 225, 18), [effort.lap_id, route]);
  return <div className="surge-route-block">
    <div><strong>Where it happened</strong><span>{effort.course_section} · {number(effort.start_distance_mi, 1)} mi into the race</span></div>
    <svg className="surge-route" viewBox="0 0 360 225" role="img"
      aria-label={`Full projected race route with ${effort.lap_id} highlighted`}>
      <rect x="0" y="0" width="360" height="225" className="mini-route-bg" />
      <path d={geometry.full} className="mini-route-full" />
      <path d={geometry.selected} className="mini-route-halo" />
      <path d={geometry.selected} className="mini-route-selected" />
      {geometry.start ? <circle cx={geometry.start[0]} cy={geometry.start[1]} r="5" className="mini-route-start" /> : null}
      {geometry.end ? <circle cx={geometry.end[0]} cy={geometry.end[1]} r="5" className="mini-route-end" /> : null}
    </svg>
  </div>;
}

function SurgeDetailChart({ effort, ride }) {
  const rideEnd = Number(ride.at(-1)?.active_s) || Number(effort.end_active_s);
  const contextStart = Math.max(0, Number(effort.start_active_s) - 60);
  const contextEnd = Math.min(rideEnd, Number(effort.end_active_s) + 60);
  const rows = ride.filter((row) => Number(row.active_s) >= contextStart && Number(row.active_s) <= contextEnd);
  const width = 850;
  const height = 300;
  const plotTop = 24;
  const powerHeight = 188;
  const heartTop = 236;
  const heartHeight = 34;
  const selectedX = (Number(effort.start_active_s) - contextStart) / Math.max(1, contextEnd - contextStart) * width;
  const selectedWidth = (Number(effort.end_active_s) + 1 - Number(effort.start_active_s)) / Math.max(1, contextEnd - contextStart) * width;
  const thresholdY = plotTop + powerHeight - THRESHOLD_W / CHART_MAX_W * powerHeight;
  const powerPath = metricPath(rows, "power_w", contextStart, contextEnd, 0, CHART_MAX_W, width, plotTop, powerHeight);
  const heartPath = metricPath(rows, "heart_rate_bpm", contextStart, contextEnd, 80, 200, width, heartTop, heartHeight);
  const pauses = rows.filter((row) => row.auto_pause_marker === "pause_start");
  const ticks = Array.from({ length: 5 }, (_, index) => contextStart + (contextEnd - contextStart) * index / 4);
  return <div className="surge-detail-chart-wrap">
    <div className="surge-chart-heading">
      <strong>One-second race context</strong>
      <span>Up to 60 recorded seconds before and after</span>
    </div>
    <div className="surge-chart-scroll">
      <svg className="surge-detail-chart" viewBox={`0 0 ${width} ${height}`} role="img"
        aria-label={`${effort.lap_id} power and heart rate with up to 60 recorded seconds before and after`}>
        <rect x="0" y={plotTop} width={width} height={powerHeight} className="surge-detail-bg" />
        <rect x="0" y={heartTop} width={width} height={heartHeight} className="surge-detail-bg" />
        <rect x={selectedX} y={plotTop} width={Math.max(2, selectedWidth)} height={heartTop + heartHeight - plotTop} className="surge-selected-band" />
        {[0, 200, 400, 600].map((value) => {
          const y = plotTop + powerHeight - value / CHART_MAX_W * powerHeight;
          return <g key={value} aria-hidden="true">
            <line x1="0" x2={width} y1={y} y2={y} className="surge-chart-grid" />
            <text x="5" y={y - 4} className="surge-chart-label">{value} W</text>
          </g>;
        })}
        <line x1="0" x2={width} y1={thresholdY} y2={thresholdY} className="threshold-line" />
        <text x={width - 5} y={thresholdY - 5} textAnchor="end" className="threshold-label">220 W</text>
        <path d={powerPath} className="surge-detail-power" />
        <path d={heartPath} className="surge-detail-heart" />
        {pauses.map((pause, index) => {
          const x = (Number(pause.active_s) - contextStart) / Math.max(1, contextEnd - contextStart) * width;
          return <line key={`${pause.auto_pause_id ?? "pause"}-${index}`} x1={x} x2={x}
            y1={plotTop} y2={heartTop + heartHeight} className="pause-line" />;
        })}
        <text x="5" y={heartTop - 6} className="surge-chart-label">Heart rate · bpm</text>
        {ticks.map((tick, index) => <text key={tick} x={width * index / 4} y="294"
          textAnchor={index === 0 ? "start" : index === 4 ? "end" : "middle"} className="surge-chart-label">{formatTime(tick)}</text>)}
      </svg>
    </div>
  </div>;
}

function SurgeDetail({ effort, efforts, ride, route, onSelect, onExpand, onShowExplorer }) {
  const effortIndex = efforts.findIndex((row) => row.lap_id === effort.lap_id);
  const effortRows = ride.filter((row) => row.lap_id === effort.lap_id);
  const recordingSegment = effortRows[0]?.recording_segment;
  const beforeRows = ride.filter((row) => row.recording_segment === recordingSegment
    && Number(row.active_s) >= Number(effort.start_active_s) - 15
    && Number(row.active_s) < Number(effort.start_active_s));
  const afterRows = ride.filter((row) => row.recording_segment === recordingSegment
    && Number(row.active_s) > Number(effort.end_active_s)
    && Number(row.active_s) <= Number(effort.end_active_s) + 15);
  const beforeHr = average(beforeRows, "heart_rate_bpm");
  const afterHr = average(afterRows, "heart_rate_bpm");
  const afterPeak = afterRows.length ? Math.max(...afterRows.map((row) => Number(row.heart_rate_bpm)).filter(Number.isFinite)) : null;
  const move = (offset) => {
    const next = efforts[effortIndex + offset];
    if (!next) return;
    onSelect(next.lap_id);
    onExpand(next.lap_id);
    window.requestAnimationFrame(() => {
      const trigger = document.getElementById(`surge-trigger-${next.lap_id}`);
      const row = document.getElementById(`surge-${next.lap_id}`);
      const behavior = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth";
      trigger?.focus({ preventScroll: true });
      row?.scrollIntoView({ behavior, block: "start" });
    });
  };
  return <div className="surge-expanded-content">
    <div className="surge-expanded-primary">
      <SurgeDetailChart effort={effort} ride={ride} />
      <dl className="surge-full-metrics">
        <div><dt>Duration</dt><dd>{formatTime(effort.duration_s)}</dd></div>
        <div><dt>Average</dt><dd>{number(effort.avg_power_w)} W</dd></div>
        <div><dt>At 150 lb</dt><dd>{number(effort.avg_power_wkg, 2)} W/kg</dd></div>
        <div><dt>Peak</dt><dd>{number(effort.peak_power_w)} W</dd></div>
        <div><dt>Best 5s</dt><dd>{number(effort.best_5s_w)} W</dd></div>
        <div><dt>Best 15s</dt><dd>{number(effort.best_15s_w)} W</dd></div>
        <div><dt>Average / max HR</dt><dd>{number(effort.avg_hr_bpm)} / {number(effort.max_hr_bpm)} bpm</dd></div>
        <div><dt>Average / max speed</dt><dd>{number(effort.avg_speed_mph, 1)} / {number(effort.max_speed_mph, 1)} mph</dd></div>
        <div><dt>Cadence</dt><dd>{number(effort.avg_cadence_rpm)} rpm</dd></div>
        <div><dt>Distance</dt><dd>{number(effort.distance_mi, 2)} mi</dd></div>
        <div><dt>Work</dt><dd>{number(effort.work_kj, 1)} kJ</dd></div>
        <div><dt>Time &gt;220 W</dt><dd>{formatTime(effort.time_above_220_s)}</dd></div>
      </dl>
      <div className="hr-context" aria-label="Heart-rate context">
        <strong>Heart-rate response</strong>
        <span><small>15s before</small><b>{number(beforeHr)} bpm</b></span>
        <span><small>During</small><b>{number(effort.avg_hr_bpm)} bpm avg</b></span>
        <span><small>15s after</small><b>{number(afterHr)} bpm avg · {number(afterPeak)} peak</b></span>
      </div>
    </div>
    <aside className="surge-expanded-aside">
      <SurgeRoute route={route} effort={effort} />
      <div className="surge-detail-actions">
        <button type="button" onClick={() => move(-1)} disabled={effortIndex <= 0}>Previous surge</button>
        <button type="button" onClick={() => move(1)} disabled={effortIndex >= efforts.length - 1}>Next surge</button>
        <button type="button" className="show-explorer-button" onClick={() => onShowExplorer(effort.lap_id)}>Show in Race Explorer</button>
      </div>
    </aside>
  </div>;
}

export function SurgeGallery({ segments, ride, route, selectedLapId, expandedEffortId, onSelect, onExpand, onShowExplorer }) {
  const efforts = useMemo(() => segments.filter((segment) => segment.lap_type === "Effort")
    .slice().sort((left, right) => Number(left.lap_seq) - Number(right.lap_seq)), [segments]);
  const samplesByLap = useMemo(() => {
    const grouped = new Map();
    ride.forEach((row) => {
      if (!row.lap_id?.startsWith("E")) return;
      if (!grouped.has(row.lap_id)) grouped.set(row.lap_id, []);
      grouped.get(row.lap_id).push(row);
    });
    return grouped;
  }, [ride]);
  return <section id="surges" className="surge-gallery" aria-labelledby="surges-title" data-reviewed-rows>
    <div className="surge-gallery-heading">
      <div>
        <h2 id="surges-title">Every surge, separately</h2>
        <p>All 68 qualifying efforts in race order. Open any row for its one-second trace, complete data, heart-rate response, and exact place on the course.</p>
      </div>
      <span>Common sparkline scale · 0–600 W</span>
    </div>
    <div className="surge-list">
      {efforts.map((effort, index) => {
        const expanded = expandedEffortId === effort.lap_id;
        const selected = selectedLapId === effort.lap_id;
        const panelId = `surge-panel-${effort.lap_id}`;
        return <article key={effort.lap_id} id={`surge-${effort.lap_id}`}
          className={`surge-row ${expanded ? "is-expanded" : ""} ${selected ? "is-selected" : ""}`}>
          <h3>
            <button id={`surge-trigger-${effort.lap_id}`} type="button" className="surge-trigger" aria-expanded={expanded} aria-controls={panelId}
              onClick={() => {
                onSelect(effort.lap_id);
                onExpand(expanded ? null : effort.lap_id);
              }}>
              <span className="surge-identity">
                <b>{effort.lap_id}</b>
                <small>{formatTime(effort.start_active_s)} into race · {effort.course_section}</small>
              </span>
              <SurgeSparkline effort={effort} samples={samplesByLap.get(effort.lap_id) ?? []} maximum={CHART_MAX_W} />
              <span className="surge-summary-metrics">
                <span><small>Duration</small><b>{formatTime(effort.duration_s)}</b></span>
                <span><small>Average</small><b>{number(effort.avg_power_w)} W</b></span>
                <span><small>At 150 lb</small><b>{number(effort.avg_power_wkg, 2)} W/kg</b></span>
                <span><small>Peak</small><b>{number(effort.peak_power_w)} W</b></span>
                <span><small>Avg / max HR</small><b>{number(effort.avg_hr_bpm)} / {number(effort.max_hr_bpm)}</b></span>
              </span>
              <span className="surge-disclosure" aria-hidden="true">{expanded ? "Close" : "Open"}</span>
            </button>
          </h3>
          {expanded ? <div id={panelId} className="surge-panel" role="region" aria-label={`${effort.lap_id} details`}>
            <SurgeDetail effort={effort} efforts={efforts} ride={ride} route={route}
              onSelect={onSelect} onExpand={onExpand} onShowExplorer={onShowExplorer} />
          </div> : null}
          {index < efforts.length - 1 ? <div className="surge-between-note" aria-hidden="true">
            <span>{formatTime(Number(efforts[index + 1].start_active_s) - Number(effort.end_active_s) - 1)} between qualifying surges</span>
          </div> : null}
        </article>;
      })}
    </div>
  </section>;
}
