import React, { useCallback, useEffect, useMemo, useState } from "react";

import { DataComponent, useDataApp, useDashboardTabs } from "./standalone-runtime.jsx";
import "./dashboard.css";

const THRESHOLD_W = 220;
const ROW_SECONDS = 3600;
const DASHBOARD_TABS = [
  { id: "dashboard", label: "Race Tape", focusFields: ["lapId"] },
  { id: "effort-gallery", label: "Effort Gallery", focusFields: ["lapId"] },
  { id: "lap-log", label: "Lap Log", focusFields: ["lapId"] },
  { id: "route-map", label: "Route Map", focusFields: ["lapId"] },
];

function formatDuration(seconds, compact = false) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return compact ? `${minutes}:${String(secs).padStart(2, "0")}` : `${minutes}m ${String(secs).padStart(2, "0")}s`;
}

function formatNumber(value, digits = 0) {
  if (value === null || value === undefined || value === "") return "—";
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "—";
}

function linePath(rows, rowStart, rowEnd, field, maxPower, width, top, height) {
  const points = rows.filter((row) => row.end_active_s >= rowStart && row.start_active_s <= rowEnd);
  return points.map((row, index) => {
    const second = Math.min(rowEnd, Math.max(rowStart, (row.start_active_s + row.end_active_s) / 2));
    const x = (second - rowStart) / Math.max(1, rowEnd - rowStart + 1) * width;
    const y = top + height - Math.min(1, Math.max(0, Number(row[field]) / maxPower)) * height;
    return `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

function segmentGeometry(segment, rowStart, rowEnd, width) {
  const start = Math.max(rowStart, segment.start_active_s);
  const end = Math.min(rowEnd, segment.end_active_s + 1);
  const divisor = Math.max(1, rowEnd - rowStart + 1);
  return {
    x: (start - rowStart) / divisor * width,
    width: Math.max(0.8, (end - start) / divisor * width),
  };
}

function TapeRow({ rowIndex, rowStart, rowEnd, overview, segments, pauses, selectedLapId, onSelect, maxPower }) {
  const [hovered, setHovered] = useState(null);
  const width = 1180;
  const height = 148;
  const plotTop = 36;
  const plotHeight = 78;
  const thresholdY = plotTop + plotHeight - THRESHOLD_W / maxPower * plotHeight;
  const rowSegments = segments.filter((segment) => segment.end_active_s >= rowStart && segment.start_active_s <= rowEnd);
  const rowPauses = pauses.filter((pause) => pause.active_s >= rowStart && pause.active_s <= rowEnd);
  const hoverSegment = rowSegments.find((segment) => segment.lap_id === hovered);
  return <div className="tape-row-wrap">
    <div className="tape-row-heading">
      <strong>{rowIndex < 3 ? `Hour ${rowIndex + 1}` : "Final 34 minutes"}</strong>
      <span>{formatDuration(rowStart, true)}–{formatDuration(rowEnd + 1, true)}</span>
    </div>
    <svg className="tape-row" viewBox={`0 0 ${width} ${height}`} role="group"
      aria-label={`Race tape from ${formatDuration(rowStart, true)} to ${formatDuration(rowEnd + 1, true)}`}>
      <defs>
        <pattern id={`between-hatch-${rowIndex}`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" className="between-hatch-line" />
        </pattern>
      </defs>
      <rect x="0" y={plotTop} width={width} height={plotHeight} className="tape-plot-bg" />
      {[0, 100, 300, 500].map((value) => {
        const y = plotTop + plotHeight - value / maxPower * plotHeight;
        return <g key={value} aria-hidden="true">
          <line x1="0" y1={y} x2={width} y2={y} className="tape-grid" />
          <text x="4" y={y - 3} className="tape-axis-label">{value} W</text>
        </g>;
      })}
      <line x1="0" y1={thresholdY} x2={width} y2={thresholdY} className="threshold-line" />
      <text x={width - 4} y={thresholdY - 4} textAnchor="end" className="threshold-label">220 W</text>
      <path d={linePath(overview, rowStart, rowEnd, "peak_power_w", maxPower, width, plotTop, plotHeight)} className="power-peak-line" />
      <path d={linePath(overview, rowStart, rowEnd, "avg_power_w", maxPower, width, plotTop, plotHeight)} className="power-average-line" />
      {rowSegments.map((segment) => {
        const geometry = segmentGeometry(segment, rowStart, rowEnd, width);
        const selected = segment.lap_id === selectedLapId;
        const effort = segment.lap_type === "Effort";
        const labelFits = geometry.width >= (effort ? 24 : 34);
        const primaryOccurrence = segment.start_active_s >= rowStart;
        return <g key={`${rowIndex}-${segment.lap_id}`} className={`tape-segment ${effort ? "is-effort" : "is-between"} ${selected ? "is-selected" : ""}`}
          role={primaryOccurrence ? "button" : undefined}
          tabIndex={primaryOccurrence && selected ? 0 : -1}
          aria-hidden={primaryOccurrence ? undefined : true}
          aria-pressed={primaryOccurrence ? selected : undefined}
          data-tape-lap={segment.lap_id} data-primary={primaryOccurrence}
          aria-label={`${segment.lap_id}, ${segment.lap_type}, ${formatDuration(segment.duration_s, true)}, average ${Math.round(segment.avg_power_w)} watts`}
          onClick={() => onSelect(segment.lap_id)}
          onFocus={() => setHovered(segment.lap_id)} onBlur={() => setHovered(null)}
          onMouseEnter={() => setHovered(segment.lap_id)} onMouseLeave={() => setHovered(null)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(segment.lap_id);
              return;
            }
            if (!primaryOccurrence || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const currentIndex = segments.findIndex((row) => row.lap_id === segment.lap_id);
            let nextIndex = currentIndex;
            if (event.key === "ArrowLeft") nextIndex = Math.max(0, currentIndex - 1);
            if (event.key === "ArrowRight") nextIndex = Math.min(segments.length - 1, currentIndex + 1);
            if (event.key === "Home") nextIndex = 0;
            if (event.key === "End") nextIndex = segments.length - 1;
            const nextLapId = segments[nextIndex]?.lap_id;
            if (!nextLapId || nextLapId === segment.lap_id) return;
            onSelect(nextLapId);
            window.requestAnimationFrame(() => document.querySelector(`[data-tape-lap="${nextLapId}"][data-primary="true"]`)?.focus());
          }}>
          <rect x={geometry.x} y={plotTop} width={geometry.width} height={plotHeight}
            fill={effort ? "var(--race-effort-fill)" : `url(#between-hatch-${rowIndex})`} />
          <rect x={geometry.x} y={plotTop + plotHeight + 5} width={geometry.width} height="17" rx="2"
            className="segment-ribbon" />
          {labelFits && <text x={geometry.x + geometry.width / 2} y={plotTop + plotHeight + 17}
            textAnchor="middle" className="segment-id">{segment.lap_id}</text>}
          {effort && !labelFits && <text x={geometry.x + geometry.width / 2} y={22 + (segment.effort_id % 2) * 10}
            textAnchor="middle" className="effort-flag">{segment.lap_id}</text>}
        </g>;
      })}
      {rowPauses.map((pause) => {
        const x = (pause.active_s - rowStart) / Math.max(1, rowEnd - rowStart + 1) * width;
        return <g key={`pause-${pause.auto_pause_id}`} aria-label={`Auto-pause ${pause.auto_pause_id}, ${pause.auto_pause_duration_s} seconds`}>
          <line x1={x} y1={plotTop - 3} x2={x} y2={plotTop + plotHeight + 23} className="pause-line" />
          <text x={Math.min(width - 3, x + 4)} y={plotTop + 10} className="pause-label">pause {pause.auto_pause_duration_s}s</text>
        </g>;
      })}
    </svg>
    <div className={`tape-hover ${hoverSegment ? "is-visible" : ""}`} aria-live="polite">
      {hoverSegment ? <><strong>{hoverSegment.lap_id}</strong><span>{hoverSegment.lap_type}</span><span>{formatDuration(hoverSegment.duration_s, true)}</span><span>{Math.round(hoverSegment.avg_power_w)} W avg</span><span>{Math.round(hoverSegment.peak_power_w)} W peak</span></> : <span>Hover or focus a lap for details.</span>}
    </div>
  </div>;
}

function SelectedLap({ lap, segments, onSelect }) {
  if (!lap) return null;
  const index = segments.findIndex((segment) => segment.lap_id === lap.lap_id);
  const move = (offset) => onSelect(segments[(index + offset + segments.length) % segments.length].lap_id);
  const effort = lap.lap_type === "Effort";
  return <aside className={`selected-lap ${effort ? "is-effort" : "is-between"}`} aria-label={`Selected lap ${lap.lap_id}`}>
    <div className="selected-lap-heading">
      <div>
        <span className="lap-type-mark">{effort ? "Effort" : "Between"}</span>
        <h3>{lap.lap_id} · {formatDuration(lap.duration_s, true)}</h3>
        <p>{formatDuration(lap.start_active_s, true)} into the race · {lap.course_section}</p>
      </div>
      <div className="lap-stepper" aria-label="Step through synthetic laps">
        <button type="button" onClick={() => move(-1)} aria-label="Previous lap">Previous</button>
        <span>{index + 1} / {segments.length}</span>
        <button type="button" onClick={() => move(1)} aria-label="Next lap">Next</button>
      </div>
    </div>
    <dl className="selected-metrics">
      <div><dt>Average</dt><dd>{formatNumber(lap.avg_power_w)} W</dd></div>
      <div><dt>At 150 lb</dt><dd>{formatNumber(lap.avg_power_wkg, 2)} W/kg</dd></div>
      <div><dt>Peak</dt><dd>{formatNumber(lap.peak_power_w)} W</dd></div>
      <div><dt>Best 5s</dt><dd>{formatNumber(lap.best_5s_w)} W</dd></div>
      <div><dt>Best 15s</dt><dd>{formatNumber(lap.best_15s_w)} W</dd></div>
      <div><dt>Heart rate</dt><dd>{formatNumber(lap.avg_hr_bpm)} / {formatNumber(lap.max_hr_bpm)} bpm</dd></div>
      <div><dt>Distance</dt><dd>{formatNumber(lap.distance_mi, 2)} mi</dd></div>
      <div><dt>Above 220</dt><dd>{formatDuration(lap.time_above_220_s, true)}</dd></div>
    </dl>
    {!effort && <p className="between-note">Between means this span did not contain 16 uninterrupted recorded seconds above 220 W. It can still include short, hard bursts.</p>}
  </aside>;
}

function RaceTape({ overview, segments, ride, selectedLapId, onSelect }) {
  const totalSamples = Math.max(...segments.map((segment) => segment.end_active_s)) + 1;
  const maxPower = Math.max(600, ...ride.map((row) => Number(row.power_w) || 0));
  const rows = Array.from({ length: 4 }, (_, rowIndex) => ({
    rowIndex,
    start: rowIndex * ROW_SECONDS,
    end: Math.min(totalSamples - 1, (rowIndex + 1) * ROW_SECONDS - 1),
  }));
  const pauses = ride.filter((row) => row.auto_pause_marker === "pause_start");
  const selected = segments.find((segment) => segment.lap_id === selectedLapId) ?? segments[0];
  return <div className="race-tape-layout" data-reviewed-rows>
    <div className="tape-legend" aria-label="Race Tape legend">
      <span><i className="legend-effort" />Effort · &gt;220 W for 16+ recorded seconds</span>
      <span><i className="legend-between" />Between · everything else</span>
      <span><i className="legend-threshold" />220 W reference</span>
      <span><i className="legend-pause" />Auto-pause</span>
    </div>
    <div className="tape-rows">
      {rows.map(({ rowIndex, start, end }) => <TapeRow key={rowIndex} rowIndex={rowIndex}
        rowStart={start} rowEnd={end} overview={overview} segments={segments} pauses={pauses}
        selectedLapId={selectedLapId} onSelect={onSelect} maxPower={maxPower} />)}
    </div>
    <SelectedLap lap={selected} segments={segments} onSelect={onSelect} />
  </div>;
}

function SummaryStrip({ overview }) {
  const summary = overview[0] ?? {};
  return <div className="race-summary" aria-label="Ride summary">
    <div><span>Effort laps</span><strong>{summary.ride_effort_count ?? 68}</strong></div>
    <div><span>Between laps</span><strong>69</strong></div>
    <div><span>Total synthetic laps</span><strong>{summary.ride_lap_count ?? 137}</strong></div>
    <div><span>Official timer</span><strong>{formatDuration(summary.ride_timer_s ?? 12847.858, true)}</strong></div>
    <div><span>Effort time</span><strong>{formatDuration(summary.ride_effort_samples ?? 1538, true)}</strong></div>
    <div><span>Distance</span><strong>{formatNumber(summary.ride_distance_mi ?? 92.13183, 1)} mi</strong></div>
  </div>;
}

function metricPath(rows, field, minX, maxX, minY, maxY, width, top, height) {
  const xRange = Math.max(1, maxX - minX);
  const yRange = Math.max(1, maxY - minY);
  let path = "";
  let previousActive = null;
  rows.forEach((row) => {
    const rawValue = row[field];
    const active = Number(row.active_s);
    if (rawValue === null || rawValue === undefined || rawValue === "" || !Number.isFinite(Number(rawValue)) || !Number.isFinite(active)) {
      previousActive = null;
      return;
    }
    const x = (active - minX) / xRange * width;
    const normalized = (Number(rawValue) - minY) / yRange;
    const y = top + height - Math.min(1, Math.max(0, normalized)) * height;
    const command = previousActive === null || active - previousActive > 1 ? "M" : "L";
    path += `${path ? " " : ""}${command}${x.toFixed(2)},${y.toFixed(2)}`;
    previousActive = active;
  });
  return path;
}

function EffortCard({ effort, samples, maxPower, selected, onSelect }) {
  const width = 300;
  const height = 92;
  const plotTop = 8;
  const plotHeight = 72;
  const start = Number(effort.start_active_s);
  const end = Math.max(start + 1, Number(effort.end_active_s));
  const thresholdY = plotTop + plotHeight - THRESHOLD_W / Math.max(1, maxPower) * plotHeight;
  const powerPath = metricPath(samples, "power_w", start, end, 0, maxPower, width, plotTop, plotHeight);
  return <article className={`effort-card ${selected ? "is-selected" : ""}`}>
    <button type="button" className="effort-card-hit" aria-pressed={selected}
      aria-label={`Select ${effort.lap_id}, ${formatDuration(effort.duration_s, true)}, average ${formatNumber(effort.avg_power_w)} watts`}
      onClick={() => onSelect(effort.lap_id)}>
      <span className="effort-card-heading">
        <strong>{effort.lap_id}</strong>
        <span>{formatDuration(effort.duration_s, true)} · {effort.course_section}</span>
      </span>
      <svg className="effort-sparkline" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <rect x="0" y={plotTop} width={width} height={plotHeight} className="effort-spark-bg" />
        <line x1="0" x2={width} y1={thresholdY} y2={thresholdY} className="threshold-line" />
        <path d={powerPath} className="effort-power-line" />
      </svg>
      <span className="effort-card-metrics">
        <span><small>Avg</small><b>{formatNumber(effort.avg_power_w)} W</b></span>
        <span><small>Avg W/kg</small><b>{formatNumber(effort.avg_power_wkg, 2)}</b></span>
        <span><small>Peak</small><b>{formatNumber(effort.peak_power_w)} W</b></span>
        <span><small>Best 5s</small><b>{formatNumber(effort.best_5s_w)} W</b></span>
        <span><small>Best 15s</small><b>{formatNumber(effort.best_15s_w)} W</b></span>
        <span><small>Avg / max HR</small><b>{formatNumber(effort.avg_hr_bpm)} / {formatNumber(effort.max_hr_bpm)}</b></span>
      </span>
    </button>
  </article>;
}

function EffortDetail({ effort, efforts, ride, maxPower, onSelect }) {
  if (!effort) {
    return <section className="effort-detail is-empty">
      <h3>Select an effort</h3>
      <p>Choose one of the 68 cards to open its one-second power and heart-rate trace.</p>
    </section>;
  }
  const effortIndex = efforts.findIndex((row) => row.lap_id === effort.lap_id);
  const rideEnd = Number(ride[ride.length - 1]?.active_s) || Number(effort.end_active_s);
  const contextStart = Math.max(0, Number(effort.start_active_s) - 60);
  const contextEnd = Math.min(rideEnd, Number(effort.end_active_s) + 60);
  const context = ride.filter((row) => Number(row.active_s) >= contextStart && Number(row.active_s) <= contextEnd);
  const width = 1180;
  const powerTop = 28;
  const powerHeight = 142;
  const heartTop = 218;
  const heartHeight = 48;
  const xRange = Math.max(1, contextEnd - contextStart);
  const selectedX = (Number(effort.start_active_s) - contextStart) / xRange * width;
  const selectedWidth = Math.max(1, (Number(effort.end_active_s) - Number(effort.start_active_s) + 1) / xRange * width);
  const thresholdY = powerTop + powerHeight - THRESHOLD_W / Math.max(1, maxPower) * powerHeight;
  const maxHeart = Math.max(200, ...context.map((row) => Number(row.heart_rate_bpm) || 0));
  const powerPath = metricPath(context, "power_w", contextStart, contextEnd, 0, maxPower, width, powerTop, powerHeight);
  const heartPath = metricPath(context, "heart_rate_bpm", contextStart, contextEnd, 80, maxHeart, width, heartTop, heartHeight);
  return <section className="effort-detail" aria-label={`One-second detail for ${effort.lap_id}`}>
    <div className="effort-detail-heading">
      <div>
        <span className="lap-type-mark">Selected effort</span>
        <h3>{effort.lap_id} · {formatDuration(effort.duration_s, true)}</h3>
        <p>One-second samples with 60 seconds of race context on either side.</p>
      </div>
      <div className="lap-stepper" aria-label="Step through efforts">
        <button type="button" disabled={effortIndex <= 0}
          onClick={() => onSelect(efforts[effortIndex - 1]?.lap_id)}>Previous effort</button>
        <span>{effortIndex + 1} / {efforts.length}</span>
        <button type="button" disabled={effortIndex >= efforts.length - 1}
          onClick={() => onSelect(efforts[effortIndex + 1]?.lap_id)}>Next effort</button>
      </div>
    </div>
    <svg className="effort-detail-chart" viewBox={`0 0 ${width} 290`} role="img"
      aria-label={`Power and heart rate from ${formatDuration(contextStart, true)} to ${formatDuration(contextEnd, true)}`}>
      <rect x="0" y={powerTop} width={width} height={powerHeight} className="detail-plot-bg" />
      <rect x="0" y={heartTop} width={width} height={heartHeight} className="detail-plot-bg" />
      <rect x={selectedX} y={powerTop} width={selectedWidth} height={heartTop + heartHeight - powerTop} className="detail-selected-window" />
      {[0, 100, 300, 500].filter((value) => value <= maxPower).map((value) => {
        const y = powerTop + powerHeight - value / Math.max(1, maxPower) * powerHeight;
        return <g key={value} aria-hidden="true">
          <line x1="0" x2={width} y1={y} y2={y} className="detail-grid" />
          <text x="5" y={y - 4} className="detail-axis-label">{value} W</text>
        </g>;
      })}
      <line x1="0" x2={width} y1={thresholdY} y2={thresholdY} className="threshold-line" />
      <text x={width - 5} y={thresholdY - 5} textAnchor="end" className="threshold-label">220 W</text>
      <path d={powerPath} className="detail-power-line" />
      <path d={heartPath} className="detail-heart-line" />
      <text x="5" y={heartTop - 7} className="detail-axis-label">Heart rate · bpm</text>
      <text x="5" y="285" className="detail-axis-label">{formatDuration(contextStart, true)}</text>
      <text x={width - 5} y="285" textAnchor="end" className="detail-axis-label">{formatDuration(contextEnd, true)}</text>
    </svg>
    <dl className="selected-metrics effort-detail-metrics">
      <div><dt>Average</dt><dd>{formatNumber(effort.avg_power_w)} W</dd></div>
      <div><dt>At 150 lb</dt><dd>{formatNumber(effort.avg_power_wkg, 2)} W/kg</dd></div>
      <div><dt>Peak</dt><dd>{formatNumber(effort.peak_power_w)} W</dd></div>
      <div><dt>Best 5s</dt><dd>{formatNumber(effort.best_5s_w)} W</dd></div>
      <div><dt>Best 15s</dt><dd>{formatNumber(effort.best_15s_w)} W</dd></div>
      <div><dt>Heart rate</dt><dd>{formatNumber(effort.avg_hr_bpm)} / {formatNumber(effort.max_hr_bpm)} bpm</dd></div>
    </dl>
  </section>;
}

function EffortGallery({ segments, ride, selectedLapId, onSelect }) {
  const efforts = useMemo(() => segments.filter((segment) => segment.lap_type === "Effort")
    .slice().sort((a, b) => Number(a.lap_seq) - Number(b.lap_seq)), [segments]);
  const samplesByLap = useMemo(() => {
    const grouped = new Map();
    ride.forEach((row) => {
      if (!row.lap_id) return;
      if (!grouped.has(row.lap_id)) grouped.set(row.lap_id, []);
      grouped.get(row.lap_id).push(row);
    });
    return grouped;
  }, [ride]);
  const maxPower = Math.max(1, ...ride.map((row) => Number(row.power_w) || 0));
  return <div className="effort-gallery-layout" data-reviewed-rows>
    <div className="effort-gallery-intro">
      <div><strong>{efforts.length} efforts, in race order</strong><span>Every sparkline uses the same 0–{maxPower} W scale.</span></div>
      <span className="gallery-threshold-key"><i />220 W</span>
    </div>
    <div className="effort-gallery-grid" aria-label="Chronological effort cards">
      {efforts.map((effort) => <EffortCard key={effort.lap_id} effort={effort}
        samples={samplesByLap.get(effort.lap_id) ?? []} maxPower={maxPower}
        selected={effort.lap_id === selectedLapId} onSelect={onSelect} />)}
    </div>
  </div>;
}

function EffortDetailPanel({ segments, ride, selectedLapId, onSelect }) {
  const efforts = useMemo(() => segments.filter((segment) => segment.lap_type === "Effort")
    .slice().sort((a, b) => Number(a.lap_seq) - Number(b.lap_seq)), [segments]);
  const maxPower = Math.max(1, ...ride.map((row) => Number(row.power_w) || 0));
  const selected = efforts.find((effort) => effort.lap_id === selectedLapId);
  return <EffortDetail effort={selected} efforts={efforts} ride={ride} maxPower={maxPower} onSelect={onSelect} />;
}

const LAP_LOG_COLUMNS = [
  { key: "lap_seq", label: "#" },
  { key: "lap_id", label: "Lap" },
  { key: "lap_type", label: "Type" },
  { key: "course_section", label: "Course" },
  { key: "start_active_s", label: "Race time" },
  { key: "duration_s", label: "Duration" },
  { key: "distance_mi", label: "Miles" },
  { key: "avg_power_w", label: "Avg W" },
  { key: "avg_power_wkg", label: "W/kg" },
  { key: "peak_power_w", label: "Peak" },
  { key: "best_5s_w", label: "Best 5s" },
  { key: "best_15s_w", label: "Best 15s" },
  { key: "avg_hr_bpm", label: "Avg HR" },
  { key: "max_hr_bpm", label: "Max HR" },
  { key: "avg_speed_mph", label: "Avg mph" },
  { key: "avg_cadence_rpm", label: "Avg rpm" },
  { key: "time_above_220_s", label: ">220 W" },
];

function formatLapCell(lap, key) {
  if (key === "start_active_s" || key === "duration_s" || key === "time_above_220_s") return formatDuration(lap[key], true);
  if (key === "avg_power_wkg") return formatNumber(lap[key], 2);
  if (key === "distance_mi") return formatNumber(lap[key], 2);
  if (key === "avg_speed_mph" || key === "avg_cadence_rpm") return formatNumber(lap[key], 1);
  if (["avg_power_w", "peak_power_w", "best_5s_w", "best_15s_w", "avg_hr_bpm", "max_hr_bpm"].includes(key)) {
    return formatNumber(lap[key]);
  }
  return lap[key] ?? "—";
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function downloadLapCsv(segments) {
  if (!segments.length || typeof document === "undefined") return;
  const ordered = segments.slice().sort((a, b) => Number(a.lap_seq) - Number(b.lap_seq));
  const columns = Object.keys(ordered[0]);
  const csv = [columns.join(","), ...ordered.map((row) => columns.map((key) => csvCell(row[key])).join(","))].join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "24604508579_strict_220W_synthetic_laps.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function LapLog({ segments, selectedLapId, onSelect }) {
  const [sort, setSort] = useState({ key: "lap_seq", direction: "ascending" });
  const [typeFilter, setTypeFilter] = useState("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [exportStatus, setExportStatus] = useState("");
  const courses = useMemo(() => [...new Set(segments.map((segment) => segment.course_section).filter(Boolean))], [segments]);
  const filtered = useMemo(() => segments.filter((segment) =>
    (typeFilter === "all" || segment.lap_type === typeFilter)
    && (courseFilter === "all" || segment.course_section === courseFilter)), [segments, typeFilter, courseFilter]);
  const sorted = useMemo(() => filtered.slice().sort((left, right) => {
    const leftValue = left[sort.key];
    const rightValue = right[sort.key];
    let comparison;
    if (Number.isFinite(Number(leftValue)) && Number.isFinite(Number(rightValue))) {
      comparison = Number(leftValue) - Number(rightValue);
    } else {
      comparison = String(leftValue ?? "").localeCompare(String(rightValue ?? ""), undefined, { numeric: true });
    }
    if (!comparison) comparison = Number(left.lap_seq) - Number(right.lap_seq);
    return sort.direction === "ascending" ? comparison : -comparison;
  }), [filtered, sort]);
  const setSortKey = (key) => setSort((current) => ({
    key,
    direction: current.key === key && current.direction === "ascending" ? "descending" : "ascending",
  }));
  const resetFilters = () => {
    setTypeFilter("all");
    setCourseFilter("all");
  };
  return <div className="lap-log-layout" data-reviewed-rows>
    <div className="lap-log-toolbar">
      <div className="lap-log-filters" aria-label="Lap Log filters">
        <label>Type
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">All types</option>
            <option value="Effort">Effort</option>
            <option value="Between">Between</option>
          </select>
        </label>
        <label>Course
          <select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>
            <option value="all">All course sections</option>
            {courses.map((course) => <option key={course} value={course}>{course}</option>)}
          </select>
        </label>
        <button type="button" onClick={resetFilters} disabled={typeFilter === "all" && courseFilter === "all"}>Reset filters</button>
      </div>
      <div className="lap-log-actions">
        <span aria-live="polite">{exportStatus || `Showing ${sorted.length} of ${segments.length} laps`}</span>
        <button type="button" className="lap-download" onClick={() => {
          downloadLapCsv(segments);
          setExportStatus("Complete 137-lap CSV exported.");
          window.setTimeout(() => setExportStatus(""), 4000);
        }}>Download all 137 laps · CSV</button>
      </div>
    </div>
    <div className="lap-log-table-wrap">
      <table className="lap-log-table">
        <caption>All synthetic laps from the strict 220-watt detector. Select a lap ID to synchronize every view.</caption>
        <thead><tr>{LAP_LOG_COLUMNS.map((column) => <th key={column.key} scope="col"
          aria-sort={sort.key === column.key ? sort.direction : "none"}>
          <button type="button" onClick={() => setSortKey(column.key)}>
            {column.label}<span aria-hidden="true">{sort.key === column.key ? (sort.direction === "ascending" ? " ↑" : " ↓") : ""}</span>
          </button>
        </th>)}</tr></thead>
        <tbody>{sorted.map((lap) => <tr key={lap.lap_id} className={lap.lap_id === selectedLapId ? "is-selected" : ""}
          aria-selected={lap.lap_id === selectedLapId}>
          {LAP_LOG_COLUMNS.map((column) => <td key={column.key}>
            {column.key === "lap_id" ? <button type="button" className="lap-id-button"
              aria-pressed={lap.lap_id === selectedLapId} onClick={() => onSelect(lap.lap_id)}>{lap.lap_id}</button>
              : formatLapCell(lap, column.key)}
          </td>)}
        </tr>)}</tbody>
      </table>
    </div>
    <div className="lap-log-mobile" aria-label="Lap Log mobile cards">
      {sorted.map((lap) => <article key={lap.lap_id} className={`lap-log-card ${lap.lap_id === selectedLapId ? "is-selected" : ""}`}>
        <button type="button" aria-pressed={lap.lap_id === selectedLapId} onClick={() => onSelect(lap.lap_id)}>
          <span><strong>{lap.lap_id}</strong><small>{lap.lap_type} · {lap.course_section}</small></span>
          <span><b>{formatDuration(lap.duration_s, true)}</b><small>{formatDuration(lap.start_active_s, true)} race time</small></span>
          <span><b>{formatNumber(lap.avg_power_w)} W</b><small>{formatNumber(lap.avg_power_wkg, 2)} W/kg</small></span>
          <span><b>{formatNumber(lap.peak_power_w)} W</b><small>{formatNumber(lap.avg_hr_bpm)} / {formatNumber(lap.max_hr_bpm)} bpm</small></span>
          <span><b>{formatNumber(lap.distance_mi, 2)} mi</b><small>{formatNumber(lap.avg_speed_mph, 1)} mph · {formatNumber(lap.avg_cadence_rpm, 0)} rpm</small></span>
          <span><b>{formatDuration(lap.time_above_220_s, true)}</b><small>above 220 W</small></span>
        </button>
      </article>)}
    </div>
  </div>;
}

function routePath(points, project, maximumPoints = 2600) {
  if (!points.length) return "";
  const step = Math.max(1, Math.ceil(points.length / maximumPoints));
  const sampled = points.filter((_, index) => index % step === 0 || index === points.length - 1);
  return sampled.map((point, index) => {
    const [x, y] = project(point);
    return `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

function RouteMap({ route, segments, selectedLapId, onSelect }) {
  const selectedLap = segments.find((segment) => segment.lap_id === selectedLapId) ?? segments[0];
  const geometry = useMemo(() => {
    const points = route.filter((row) => Number.isFinite(Number(row.route_x_m)) && Number.isFinite(Number(row.route_y_m)));
    if (!points.length) return { fullPath: "", selectedPath: "", selectedStart: null, selectedEnd: null, labels: [] };
    const xValues = points.map((point) => Number(point.route_x_m));
    const yValues = points.map((point) => Number(point.route_y_m));
    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);
    const innerWidth = 920;
    const innerHeight = 500;
    const scale = Math.min(innerWidth / Math.max(1, maxX - minX), innerHeight / Math.max(1, maxY - minY));
    const drawnWidth = (maxX - minX) * scale;
    const drawnHeight = (maxY - minY) * scale;
    const offsetX = 40 + (innerWidth - drawnWidth) / 2;
    const offsetY = 30 + (innerHeight - drawnHeight) / 2;
    const project = (point) => [
      offsetX + (Number(point.route_x_m) - minX) * scale,
      offsetY + (maxY - Number(point.route_y_m)) * scale,
    ];
    const selectedPoints = points.filter((point) => point.lap_id === selectedLapId);
    const firstByCourse = new Map();
    points.forEach((point) => {
      if (point.course_section && !firstByCourse.has(point.course_section)) firstByCourse.set(point.course_section, point);
    });
    const labelPlacements = {
      Rollout: { dx: 12, dy: -14, anchor: "start" },
      "Loop 1": { dx: -24, dy: 31, anchor: "end" },
      "Loop 2": { dx: 18, dy: -16, anchor: "start" },
      Finish: { dx: 22, dy: 53, anchor: "start" },
    };
    const labels = ["Rollout", "Loop 1", "Loop 2", "Finish"].map((name) => {
      const point = firstByCourse.get(name);
      if (!point) return null;
      const [x, y] = project(point);
      const placement = labelPlacements[name];
      return { name, x, y, labelX: x + placement.dx, labelY: y + placement.dy, anchor: placement.anchor };
    }).filter(Boolean);
    return {
      fullPath: routePath(points, project),
      selectedPath: routePath(selectedPoints, project, 900),
      selectedStart: selectedPoints.length ? project(selectedPoints[0]) : null,
      selectedEnd: selectedPoints.length ? project(selectedPoints[selectedPoints.length - 1]) : null,
      labels,
    };
  }, [route, selectedLapId]);
  return <div className="route-map-layout" data-reviewed-rows>
    <div className="route-map-intro">
      <div><strong>Projected race route</strong><span>Local x/y meters preserve the course shape without a street map or coordinate labels.</span></div>
      <div className="route-map-key"><span><i className="route-key-full" />Full route</span><span><i className="route-key-selected" />Selected lap</span></div>
    </div>
    <svg className="route-map-canvas" viewBox="0 0 1000 560" role="img"
      aria-label={`Projected full route with ${selectedLap?.lap_id ?? "no lap"} highlighted`}>
      <rect x="0" y="0" width="1000" height="560" className="route-map-bg" />
      <path d={geometry.fullPath} className="route-full-path" />
      {geometry.selectedPath && <>
        <path d={geometry.selectedPath} className="route-selected-halo" />
        <path d={geometry.selectedPath} className="route-selected-path" />
      </>}
      {geometry.selectedStart && <circle cx={geometry.selectedStart[0]} cy={geometry.selectedStart[1]} r="7" className="route-selected-start" />}
      {geometry.selectedEnd && <circle cx={geometry.selectedEnd[0]} cy={geometry.selectedEnd[1]} r="7" className="route-selected-end" />}
      {geometry.labels.map((label) => <g key={label.name} className="route-course-label" aria-hidden="true">
        <line x1={label.x} y1={label.y} x2={label.labelX} y2={label.labelY} />
        <circle cx={label.x} cy={label.y} r="5" />
        <text x={label.labelX} y={label.labelY} textAnchor={label.anchor}>{label.name}</text>
      </g>)}
    </svg>
    <SelectedLap lap={selectedLap} segments={segments} onSelect={onSelect} />
  </div>;
}

function isInteractiveTarget(target) {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  return Boolean(target.closest("a, button, input, select, textarea, summary, [contenteditable]:not([contenteditable='false']), [role='button'], [role='slider'], [role='textbox'], [role='combobox'], [role='listbox']"));
}

export function DashboardContent() {
  const shell = useDataApp();
  const { reviewedRows, visible, viewFocus, setDashboardFocus } = shell;
  const tabs = useDashboardTabs(DASHBOARD_TABS);
  const activeTabId = tabs?.activeTabId ?? "dashboard";
  const overview = reviewedRows("race_overview", ["start_active_s"]);
  const segments = reviewedRows("lap_segments", ["lap_seq"]);
  const ride = reviewedRows("ride_series", ["sample_index"]);
  const route = reviewedRows("route_points", ["sample_index"]);
  const initial = viewFocus?.lapId && segments.some((segment) => segment.lap_id === viewFocus.lapId)
    ? viewFocus.lapId : (segments.find((segment) => segment.lap_type === "Effort")?.lap_id ?? segments[0]?.lap_id);
  const [selectedLapId, setSelectedLapId] = useState(initial);
  useEffect(() => {
    const focused = segments.find((segment) => segment.lap_id === viewFocus?.lapId)?.lap_id;
    if (focused && focused !== selectedLapId) {
      setSelectedLapId(focused);
      return;
    }
    if (!segments.some((segment) => segment.lap_id === selectedLapId)) {
      setSelectedLapId(segments.find((segment) => segment.lap_type === "Effort")?.lap_id ?? segments[0]?.lap_id);
    }
  }, [segments, selectedLapId, viewFocus?.lapId]);
  const selectLap = useCallback((lapId) => {
    if (!segments.some((segment) => segment.lap_id === lapId)) return;
    setSelectedLapId(lapId);
    setDashboardFocus?.({ ...(viewFocus ?? {}), lapId });
  }, [segments, setDashboardFocus, viewFocus]);
  useEffect(() => {
    const focusedIsValid = segments.some((segment) => segment.lap_id === viewFocus?.lapId);
    if (selectedLapId && !focusedIsValid) {
      setDashboardFocus?.({ ...(viewFocus ?? {}), lapId: selectedLapId });
    }
  }, [activeTabId, segments, selectedLapId, setDashboardFocus, viewFocus]);
  const handlePageKeyDown = useCallback((event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isInteractiveTarget(event.target)) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || !segments.length) return;
    const currentIndex = Math.max(0, segments.findIndex((segment) => segment.lap_id === selectedLapId));
    let nextIndex = currentIndex;
    if (event.key === "ArrowLeft") nextIndex = Math.max(0, currentIndex - 1);
    if (event.key === "ArrowRight") nextIndex = Math.min(segments.length - 1, currentIndex + 1);
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = segments.length - 1;
    if (nextIndex === currentIndex && segments[currentIndex]?.lap_id === selectedLapId) return;
    event.preventDefault();
    selectLap(segments[nextIndex].lap_id);
  }, [segments, selectedLapId, selectLap]);
  const selectedLap = segments.find((segment) => segment.lap_id === selectedLapId);
  const raceTapeSources = useMemo(() => ({ race_overview: overview, lap_segments: segments, ride_series: ride }), [overview, segments, ride]);
  const gallerySources = useMemo(() => ({ lap_segments: segments, ride_series: ride }), [segments, ride]);
  const routeSources = useMemo(() => ({ route_points: route, lap_segments: segments }), [route, segments]);
  return <article className="race-tape-page" tabIndex="0" onKeyDown={handlePageKeyDown}
    aria-label="Race Tape dashboard. Use left and right arrow keys to step through synthetic laps.">
    <div className="selected-lap-live" role="status" aria-live="polite" aria-atomic="true">
      {selectedLap ? `Selected ${selectedLap.lap_id}, ${selectedLap.lap_type}, ${formatDuration(selectedLap.duration_s, true)}, average ${formatNumber(selectedLap.avg_power_w)} watts.` : "No lap selected."}
    </div>
    {activeTabId === "dashboard" && <>
      <SummaryStrip overview={overview} />
      {visible("race-tape") && <DataComponent id="race-tape" queryId="lap_segments"
      queryIds={["lap_segments", "race_overview", "ride_series"]}
      sourceRows={segments} sourceRowsByQuery={raceTapeSources} displayRows={segments}
      title="Race Tape" kind="custom" variant="card"
      description="Synthetic laps use raw recorded power: strictly above 220 W for at least 16 consecutive recorded seconds. Auto-pauses are markers, not laps.">
      <RaceTape overview={overview} segments={segments} ride={ride} selectedLapId={selectedLapId} onSelect={selectLap} />
      </DataComponent>}
    </>}
    {activeTabId === "effort-gallery" && <>
      {visible("effort-detail") && <DataComponent id="effort-detail"
        queryId="ride_series" queryIds={["ride_series", "lap_segments"]}
        sourceRows={ride} sourceRowsByQuery={gallerySources} displayRows={ride}
        title="Selected Effort Detail" kind="custom" variant="card"
        description="One-second power and heart-rate data, with 60 seconds of race context before and after the selected effort.">
        <EffortDetailPanel segments={segments} ride={ride} selectedLapId={selectedLapId} onSelect={selectLap} />
      </DataComponent>}
      {visible("effort-gallery") && <DataComponent id="effort-gallery"
        queryId="lap_segments" queryIds={["lap_segments", "ride_series"]}
        sourceRows={segments} sourceRowsByQuery={gallerySources} displayRows={segments.filter((segment) => segment.lap_type === "Effort")}
        title="Effort Gallery" kind="custom" variant="card"
        description="All 68 strict efforts in chronological order, compared on one power scale. Select an effort to synchronize every view.">
        <EffortGallery segments={segments} ride={ride} selectedLapId={selectedLapId} onSelect={selectLap} />
      </DataComponent>}
    </>}
    {activeTabId === "lap-log" && visible("lap-log") && <DataComponent id="lap-log"
      queryId="lap_segments" queryIds={["lap_segments"]}
      sourceRows={segments} sourceRowsByQuery={{ lap_segments: segments }} displayRows={segments}
      title="Lap Log" kind="custom" variant="card"
      description="The complete 137-lap synthetic sequence. Sort and filter the screen without changing the complete CSV export.">
      <LapLog segments={segments} selectedLapId={selectedLapId} onSelect={selectLap} />
    </DataComponent>}
    {activeTabId === "route-map" && visible("route-map") && <DataComponent id="route-map"
      queryId="route_points" queryIds={["route_points", "lap_segments"]}
      sourceRows={route} sourceRowsByQuery={routeSources} displayRows={route}
      title="Route Map" kind="custom" variant="card"
      description="A tile-free projection from local route x/y meters. Only the selected synthetic lap is emphasized.">
      <RouteMap route={route} segments={segments} selectedLapId={selectedLapId} onSelect={selectLap} />
    </DataComponent>}
    <p className="method-line">Original FIT unchanged · 12,851 one-second records · W/kg uses 150 lb</p>
  </article>;
}
