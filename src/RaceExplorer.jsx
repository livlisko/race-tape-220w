import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const THRESHOLD_W = 220;
const WEIGHT_KG = 68.0388555;
const OVERVIEW_WIDTH = 1300;
const OVERVIEW_HEIGHT = 128;
const OVERVIEW_LEFT = 42;
const OVERVIEW_RIGHT = 16;
const OVERVIEW_TOP = 18;
const OVERVIEW_PLOT_HEIGHT = 68;
const FOCUS_WIDTH = 920;
const FOCUS_HEIGHT = 344;
const FOCUS_LEFT = 54;
const FOCUS_RIGHT = 54;
const FOCUS_TOP = 30;
const FOCUS_PLOT_HEIGHT = 238;
const DEFAULT_WINDOW_SECONDS = 240;
const MIN_WINDOW_SECONDS = 45;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

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

function centeredRange(segment, totalSeconds, duration = DEFAULT_WINDOW_SECONDS) {
  if (!segment) return { start: 0, end: Math.min(totalSeconds, duration) };
  const midpoint = (Number(segment.start_active_s) + Number(segment.end_active_s) + 1) / 2;
  const width = Math.min(totalSeconds, duration);
  let start = midpoint - width / 2;
  start = clamp(start, 0, Math.max(0, totalSeconds - width));
  return { start, end: start + width };
}

function scaleX(second, start, end, left, width) {
  return left + (Number(second) - start) / Math.max(1, end - start) * width;
}

function linePath(rows, field, start, end, minimum, maximum, left, top, width, height) {
  const range = Math.max(1, maximum - minimum);
  let path = "";
  let previous = null;
  let previousRecordingSegment = null;
  rows.forEach((row) => {
    const raw = row[field];
    const active = Number(row.active_s ?? ((Number(row.start_active_s) + Number(row.end_active_s)) / 2));
    if (!Number.isFinite(active) || raw === null || raw === undefined || !Number.isFinite(Number(raw))) {
      previous = null;
      previousRecordingSegment = null;
      return;
    }
    const x = scaleX(active, start, end, left, width);
    const y = top + height - clamp((Number(raw) - minimum) / range, 0, 1) * height;
    const recordingSegment = row.recording_segment ?? null;
    const command = previous === null || active - previous > 65
      || (previousRecordingSegment !== null && recordingSegment !== previousRecordingSegment) ? "M" : "L";
    path += `${path ? " " : ""}${command}${x.toFixed(2)},${y.toFixed(2)}`;
    previous = active;
    previousRecordingSegment = recordingSegment;
  });
  return path;
}

function areaPath(rows, field, start, end, maximum, left, top, width, height) {
  const points = rows.filter((row) => Number(row.end_active_s) >= start && Number(row.start_active_s) <= end);
  if (!points.length) return "";
  const coords = points.map((row) => {
    const active = (Number(row.start_active_s) + Number(row.end_active_s)) / 2;
    const x = scaleX(active, start, end, left, width);
    const y = top + height - clamp(Number(row[field]) / Math.max(1, maximum), 0, 1) * height;
    return [x, y];
  });
  return `M${coords[0][0].toFixed(2)},${(top + height).toFixed(2)} ${coords.map(([x, y]) => `L${x.toFixed(2)},${y.toFixed(2)}`).join(" ")} L${coords.at(-1)[0].toFixed(2)},${(top + height).toFixed(2)} Z`;
}

function segmentAt(segments, activeSecond) {
  let low = 0;
  let high = segments.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const segment = segments[middle];
    if (activeSecond < Number(segment.start_active_s)) high = middle - 1;
    else if (activeSecond > Number(segment.end_active_s) + 1) low = middle + 1;
    else return segment;
  }
  return segments[clamp(low, 0, segments.length - 1)];
}

function decimateMinMax(rows, field, maximumRows = 1500) {
  if (rows.length <= maximumRows) return rows;
  const bucketSize = Math.ceil(rows.length / (maximumRows / 2));
  const result = [];
  for (let index = 0; index < rows.length; index += bucketSize) {
    const bucket = rows.slice(index, index + bucketSize).filter((row) => Number.isFinite(Number(row[field])));
    if (!bucket.length) continue;
    let minimum = bucket[0];
    let maximum = bucket[0];
    bucket.forEach((row) => {
      if (Number(row[field]) < Number(minimum[field])) minimum = row;
      if (Number(row[field]) > Number(maximum[field])) maximum = row;
    });
    result.push(...[minimum, maximum].sort((a, b) => Number(a.active_s) - Number(b.active_s)));
  }
  return result;
}

export function projectedRoute(route, selectedLapId, width = 330, height = 185, padding = 16) {
  const points = route.filter((row) => Number.isFinite(Number(row.route_x_m)) && Number.isFinite(Number(row.route_y_m)));
  if (!points.length) return { full: "", selected: "", start: null, end: null };
  const xs = points.map((point) => Number(point.route_x_m));
  const ys = points.map((point) => Number(point.route_y_m));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = Math.min((width - padding * 2) / Math.max(1, maxX - minX), (height - padding * 2) / Math.max(1, maxY - minY));
  const drawnWidth = (maxX - minX) * scale;
  const drawnHeight = (maxY - minY) * scale;
  const offsetX = padding + (width - padding * 2 - drawnWidth) / 2;
  const offsetY = padding + (height - padding * 2 - drawnHeight) / 2;
  const project = (point) => [
    offsetX + (Number(point.route_x_m) - minX) * scale,
    offsetY + (maxY - Number(point.route_y_m)) * scale,
  ];
  const makePath = (pathPoints, limit) => {
    const step = Math.max(1, Math.ceil(pathPoints.length / limit));
    return pathPoints.filter((_, index) => index % step === 0 || index === pathPoints.length - 1)
      .map((point, index) => {
        const [x, y] = project(point);
        return `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
      }).join(" ");
  };
  const selectedPoints = points.filter((point) => point.lap_id === selectedLapId);
  return {
    full: makePath(points, 1300),
    selected: makePath(selectedPoints, 300),
    start: selectedPoints.length ? project(selectedPoints[0]) : null,
    end: selectedPoints.length ? project(selectedPoints.at(-1)) : null,
  };
}

function MiniRoute({ route, selectedLap }) {
  const geometry = useMemo(() => projectedRoute(route, selectedLap?.lap_id), [route, selectedLap?.lap_id]);
  return <div className="explorer-route">
    <div className="explorer-route-heading">
      <strong>Route</strong>
      <span>{selectedLap?.course_section ?? "—"}</span>
    </div>
    <svg viewBox="0 0 330 185" role="img"
      aria-label={`Projected full race route with ${selectedLap?.lap_id ?? "no lap"} highlighted`}>
      <rect x="0" y="0" width="330" height="185" className="mini-route-bg" />
      <path d={geometry.full} className="mini-route-full" />
      {geometry.selected ? <>
        <path d={geometry.selected} className="mini-route-halo" />
        <path d={geometry.selected} className="mini-route-selected" />
      </> : null}
      {geometry.start ? <circle cx={geometry.start[0]} cy={geometry.start[1]} r="4.5" className="mini-route-start" /> : null}
      {geometry.end ? <circle cx={geometry.end[0]} cy={geometry.end[1]} r="4.5" className="mini-route-end" /> : null}
    </svg>
  </div>;
}

function FullRaceNavigator({ overview, segments, ride, range, onRangeChange, onRangeCommit, onSelect }) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClickUntilRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const totalSeconds = Number(ride.at(-1)?.active_s ?? 0) + 1;
  const plotWidth = OVERVIEW_WIDTH - OVERVIEW_LEFT - OVERVIEW_RIGHT;
  const maxPower = Math.max(600, ...ride.map((row) => Number(row.power_w) || 0));
  const thresholdY = OVERVIEW_TOP + OVERVIEW_PLOT_HEIGHT - THRESHOLD_W / maxPower * OVERVIEW_PLOT_HEIGHT;
  const brushX = scaleX(range.start, 0, totalSeconds, OVERVIEW_LEFT, plotWidth);
  const brushEndX = scaleX(range.end, 0, totalSeconds, OVERVIEW_LEFT, plotWidth);
  const brushWidth = Math.max(3, brushEndX - brushX);
  const finalRegularTick = Math.max(0, totalSeconds - 600);
  const ticks = Array.from({ length: Math.floor(finalRegularTick / 900) + 1 }, (_, index) => index * 900)
    .concat(totalSeconds % 900 ? [totalSeconds] : []);
  const pauses = ride.filter((row) => row.auto_pause_marker === "pause_start");

  const pointerTime = useCallback((event) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const viewX = (event.clientX - rect.left) / Math.max(1, rect.width) * OVERVIEW_WIDTH;
    return clamp((viewX - OVERVIEW_LEFT) / plotWidth * totalSeconds, 0, totalSeconds);
  }, [plotWidth, totalSeconds]);

  const beginDrag = (event, mode) => {
    event.preventDefault();
    event.stopPropagation();
    svgRef.current?.setPointerCapture?.(event.pointerId);
    dragRef.current = { mode, origin: pointerTime(event), start: range.start, end: range.end, moved: false };
    setDragging(true);
  };

  const moveDrag = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const current = pointerTime(event);
    const delta = current - drag.origin;
    drag.moved = drag.moved || Math.abs(delta) > 2;
    let nextStart = drag.start;
    let nextEnd = drag.end;
    if (drag.mode === "move") {
      const width = drag.end - drag.start;
      nextStart = clamp(drag.start + delta, 0, Math.max(0, totalSeconds - width));
      nextEnd = nextStart + width;
    } else if (drag.mode === "start") {
      nextStart = clamp(current, 0, drag.end - MIN_WINDOW_SECONDS);
    } else {
      nextEnd = clamp(current, drag.start + MIN_WINDOW_SECONDS, totalSeconds);
    }
    onRangeChange({ start: nextStart, end: nextEnd });
  };

  const endDrag = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    svgRef.current?.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    if (drag.moved) suppressClickUntilRef.current = Date.now() + 300;
    setDragging(false);
    onRangeCommit?.();
  };

  const selectFromPosition = (event) => {
    if (dragRef.current || Date.now() < suppressClickUntilRef.current) return;
    const active = pointerTime(event);
    const segment = segmentAt(segments, active);
    const width = range.end - range.start;
    const start = clamp(active - width / 2, 0, Math.max(0, totalSeconds - width));
    onRangeChange({ start, end: start + width });
    if (segment?.lap_type === "Effort") onSelect(segment.lap_id);
  };

  const panFromKeyboard = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End", "+", "=", "-"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const width = range.end - range.start;
    let next;
    if (event.key === "Home") next = { start: 0, end: width };
    else if (event.key === "End") next = { start: totalSeconds - width, end: totalSeconds };
    else if (event.key === "+" || event.key === "=") {
      const nextWidth = Math.max(MIN_WINDOW_SECONDS, width * 0.72);
      const center = (range.start + range.end) / 2;
      const start = clamp(center - nextWidth / 2, 0, totalSeconds - nextWidth);
      next = { start, end: start + nextWidth };
    } else if (event.key === "-") {
      const nextWidth = Math.min(totalSeconds, width * 1.38);
      const center = (range.start + range.end) / 2;
      const start = clamp(center - nextWidth / 2, 0, totalSeconds - nextWidth);
      next = { start, end: start + nextWidth };
    } else {
      const delta = width * 0.15 * (event.key === "ArrowLeft" ? -1 : 1);
      const start = clamp(range.start + delta, 0, totalSeconds - width);
      next = { start, end: start + width };
    }
    onRangeChange(next);
    onRangeCommit?.();
  };

  return <div className="race-navigator">
    <div className="navigator-heading">
      <strong>Full race · {formatTime(totalSeconds)}</strong>
      <span>Drag the window · click an effort to select · use arrow keys to pan</span>
    </div>
    <svg ref={svgRef} className={`navigator-svg ${dragging ? "is-dragging" : ""}`}
      viewBox={`0 0 ${OVERVIEW_WIDTH} ${OVERVIEW_HEIGHT}`} preserveAspectRatio="none" role="group" tabIndex="0"
      aria-label={`Continuous full-race navigator from 0:00 to ${formatTime(totalSeconds)}. Selected window ${formatTime(range.start)} to ${formatTime(range.end)}.`}
      onKeyDown={panFromKeyboard} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
      onClick={selectFromPosition}>
      <rect x={OVERVIEW_LEFT} y={OVERVIEW_TOP} width={plotWidth} height={OVERVIEW_PLOT_HEIGHT} className="navigator-bg" />
      <path d={areaPath(overview, "peak_power_w", 0, totalSeconds, maxPower, OVERVIEW_LEFT, OVERVIEW_TOP, plotWidth, OVERVIEW_PLOT_HEIGHT)} className="navigator-peak-area" />
      <path d={linePath(overview, "avg_power_w", 0, totalSeconds, 0, maxPower, OVERVIEW_LEFT, OVERVIEW_TOP, plotWidth, OVERVIEW_PLOT_HEIGHT)} className="navigator-average-line" />
      <line x1={OVERVIEW_LEFT} x2={OVERVIEW_LEFT + plotWidth} y1={thresholdY} y2={thresholdY} className="threshold-line" />
      <text x="4" y={thresholdY + 3} className="threshold-label">220 W</text>
      {segments.map((segment) => {
        const x = scaleX(segment.start_active_s, 0, totalSeconds, OVERVIEW_LEFT, plotWidth);
        const end = scaleX(Number(segment.end_active_s) + 1, 0, totalSeconds, OVERVIEW_LEFT, plotWidth);
        return <rect key={segment.lap_id} x={x} y="89" width={Math.max(.7, end - x)} height="12"
          className={`navigator-segment ${segment.lap_type === "Effort" ? "is-effort" : "is-between"}`} />;
      })}
      {pauses.map((pause) => {
        const x = scaleX(pause.active_s, 0, totalSeconds, OVERVIEW_LEFT, plotWidth);
        return <line key={pause.auto_pause_id} x1={x} x2={x} y1={OVERVIEW_TOP} y2="103" className="pause-line" />;
      })}
      {ticks.map((tick, index) => {
        const x = scaleX(tick, 0, totalSeconds, OVERVIEW_LEFT, plotWidth);
        return <g key={`${tick}-${index}`} aria-hidden="true">
          <line x1={x} x2={x} y1="103" y2="108" className="navigator-tick" />
          <text x={x} y="122" textAnchor={tick === 0 ? "start" : tick >= totalSeconds ? "end" : "middle"} className="navigator-time">{formatTime(tick)}</text>
        </g>;
      })}
      <rect x={brushX} y="10" width={brushWidth} height="94" className="navigator-brush"
        onPointerDown={(event) => beginDrag(event, "move")} />
      <rect x={brushX - 10} y="5" width="20" height="104" className="navigator-handle-hit"
        onPointerDown={(event) => beginDrag(event, "start")} />
      <rect x={brushEndX - 10} y="5" width="20" height="104" className="navigator-handle-hit"
        onPointerDown={(event) => beginDrag(event, "end")} />
      <rect x={brushX - 3} y="8" width="6" height="98" rx="3" className="navigator-handle" />
      <rect x={brushEndX - 3} y="8" width="6" height="98" rx="3" className="navigator-handle" />
    </svg>
    <div className="navigator-mobile-scale" aria-hidden="true">
      <span>0:00</span><span>1:00</span><span>2:00</span><span>3:00</span><span>{formatTime(totalSeconds)}</span>
    </div>
  </div>;
}

function FocusChart({ ride, segments, range, selectedLapId, unitMode }) {
  const [cursor, setCursor] = useState(null);
  const svgRef = useRef(null);
  const plotWidth = FOCUS_WIDTH - FOCUS_LEFT - FOCUS_RIGHT;
  const unitField = unitMode === "wkg" ? "power_wkg" : "power_w";
  const threshold = unitMode === "wkg" ? THRESHOLD_W / WEIGHT_KG : THRESHOLD_W;
  const allMaximum = unitMode === "wkg"
    ? Math.max(8.5, ...ride.map((row) => Number(row.power_wkg) || 0))
    : Math.max(600, ...ride.map((row) => Number(row.power_w) || 0));
  const windowRows = useMemo(() => ride.filter((row) => Number(row.active_s) >= Math.floor(range.start) && Number(row.active_s) <= Math.ceil(range.end)), [ride, range.end, range.start]);
  const powerRows = useMemo(() => decimateMinMax(windowRows, unitField), [unitField, windowRows]);
  const heartRows = useMemo(() => decimateMinMax(windowRows, "heart_rate_bpm"), [windowRows]);
  const visibleSegments = segments.filter((segment) => Number(segment.end_active_s) + 1 >= range.start && Number(segment.start_active_s) <= range.end);
  const pauses = windowRows.filter((row) => row.auto_pause_marker === "pause_start");
  const thresholdY = FOCUS_TOP + FOCUS_PLOT_HEIGHT - threshold / allMaximum * FOCUS_PLOT_HEIGHT;
  const powerPath = linePath(powerRows, unitField, range.start, range.end, 0, allMaximum, FOCUS_LEFT, FOCUS_TOP, plotWidth, FOCUS_PLOT_HEIGHT);
  const heartPath = linePath(heartRows, "heart_rate_bpm", range.start, range.end, 75, 200, FOCUS_LEFT, FOCUS_TOP, plotWidth, FOCUS_PLOT_HEIGHT);
  const ticks = Array.from({ length: 5 }, (_, index) => range.start + (range.end - range.start) * index / 4);
  const powerTicks = unitMode === "wkg" ? [0, 2, 4, 6, 8] : [0, 200, 400, 600];

  const updateCursor = (event) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || !windowRows.length) return;
    const viewX = (event.clientX - rect.left) / Math.max(1, rect.width) * FOCUS_WIDTH;
    const active = clamp(range.start + (viewX - FOCUS_LEFT) / plotWidth * (range.end - range.start), range.start, range.end);
    const nearest = windowRows.reduce((best, row) => Math.abs(Number(row.active_s) - active) < Math.abs(Number(best.active_s) - active) ? row : best, windowRows[0]);
    setCursor(nearest);
  };

  const moveCursorByKey = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(event.key) || !windowRows.length) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") return setCursor(null);
    const currentIndex = cursor ? Math.max(0, windowRows.findIndex((row) => row.sample_index === cursor.sample_index)) : 0;
    if (event.key === "Home") return setCursor(windowRows[0]);
    if (event.key === "End") return setCursor(windowRows.at(-1));
    const nextIndex = clamp(currentIndex + (event.key === "ArrowLeft" ? -1 : 1), 0, windowRows.length - 1);
    setCursor(windowRows[nextIndex]);
  };

  const cursorX = cursor ? scaleX(cursor.active_s, range.start, range.end, FOCUS_LEFT, plotWidth) : null;
  const readout = cursor ?? windowRows[Math.floor(windowRows.length / 2)] ?? null;
  return <div className="focus-chart-wrap">
    <div className="focus-chart-heading">
      <strong>Selected window</strong>
      <span>{formatTime(range.start)}–{formatTime(range.end)} · {formatTime(range.end - range.start)}</span>
    </div>
    <div className="focus-legend" aria-label="Selected-window chart legend">
      <span><i className="focus-power-key" />Power</span>
      <span><i className="focus-heart-key" />Heart rate</span>
      <span><i className="focus-threshold-key" />220 W</span>
      <span><i className="focus-pause-key" />Pause</span>
    </div>
    <svg ref={svgRef} className="focus-chart" viewBox={`0 0 ${FOCUS_WIDTH} ${FOCUS_HEIGHT}`} role="img" tabIndex="0"
      aria-label={`Power and heart rate from ${formatTime(range.start)} to ${formatTime(range.end)}. Use left and right arrow keys to inspect recorded seconds.`}
      onPointerMove={updateCursor} onPointerLeave={() => setCursor(null)} onKeyDown={moveCursorByKey}>
      <rect x={FOCUS_LEFT} y={FOCUS_TOP} width={plotWidth} height={FOCUS_PLOT_HEIGHT} className="focus-bg" />
      {visibleSegments.map((segment) => {
        const x = scaleX(Math.max(range.start, Number(segment.start_active_s)), range.start, range.end, FOCUS_LEFT, plotWidth);
        const end = scaleX(Math.min(range.end, Number(segment.end_active_s) + 1), range.start, range.end, FOCUS_LEFT, plotWidth);
        return <rect key={`band-${segment.lap_id}`} x={x} y={FOCUS_TOP} width={Math.max(.8, end - x)} height={FOCUS_PLOT_HEIGHT}
          className={`focus-segment-band ${segment.lap_type === "Effort" ? "is-effort" : "is-between"} ${segment.lap_id === selectedLapId ? "is-selected" : ""}`} />;
      })}
      {powerTicks.filter((value) => value <= allMaximum).map((value) => {
        const y = FOCUS_TOP + FOCUS_PLOT_HEIGHT - value / allMaximum * FOCUS_PLOT_HEIGHT;
        const tickLabel = unitMode === "wkg"
          ? number(value, 0)
          : unitMode === "both"
            ? `${value}W/${number(value / WEIGHT_KG, 2)}`
            : `${value} W`;
        return <g key={value} aria-hidden="true">
          <line x1={FOCUS_LEFT} x2={FOCUS_LEFT + plotWidth} y1={y} y2={y} className="focus-grid" />
          <text x={FOCUS_LEFT - 8} y={y + 4} textAnchor="end" className="focus-axis">{tickLabel}</text>
        </g>;
      })}
      {[100, 150, 200].map((value) => {
        const y = FOCUS_TOP + FOCUS_PLOT_HEIGHT - (value - 75) / 125 * FOCUS_PLOT_HEIGHT;
        return <text key={value} x={FOCUS_LEFT + plotWidth + 8} y={y + 4} className="focus-axis heart-axis">{value}</text>;
      })}
      <line x1={FOCUS_LEFT} x2={FOCUS_LEFT + plotWidth} y1={thresholdY} y2={thresholdY} className="threshold-line" />
      <text x={FOCUS_LEFT + 6} y={thresholdY - 6} className="threshold-label">{
        unitMode === "wkg" ? `${number(threshold, 2)} W/kg`
          : unitMode === "both" ? `220 W · ${number(THRESHOLD_W / WEIGHT_KG, 2)} W/kg`
            : "220 W"
      }</text>
      <path d={powerPath} className="focus-power-line" />
      <path d={heartPath} className="focus-heart-line" />
      {pauses.map((pause) => {
        const x = scaleX(pause.active_s, range.start, range.end, FOCUS_LEFT, plotWidth);
        return <line key={pause.auto_pause_id} x1={x} x2={x} y1={FOCUS_TOP} y2={FOCUS_TOP + FOCUS_PLOT_HEIGHT + 30} className="pause-line" />;
      })}
      {visibleSegments.map((segment) => {
        const x = scaleX(Math.max(range.start, Number(segment.start_active_s)), range.start, range.end, FOCUS_LEFT, plotWidth);
        const end = scaleX(Math.min(range.end, Number(segment.end_active_s) + 1), range.start, range.end, FOCUS_LEFT, plotWidth);
        const width = Math.max(.8, end - x);
        return <g key={`ribbon-${segment.lap_id}`} aria-hidden="true">
          <rect x={x} y={FOCUS_TOP + FOCUS_PLOT_HEIGHT + 7} width={width} height="22"
            className={`focus-segment-ribbon ${segment.lap_type === "Effort" ? "is-effort" : "is-between"} ${segment.lap_id === selectedLapId ? "is-selected" : ""}`} />
          {width > 34 ? <text x={x + width / 2} y={FOCUS_TOP + FOCUS_PLOT_HEIGHT + 22} textAnchor="middle" className="focus-segment-label">{segment.lap_id}</text> : null}
        </g>;
      })}
      {ticks.map((tick, index) => {
        const x = scaleX(tick, range.start, range.end, FOCUS_LEFT, plotWidth);
        return <g key={tick} aria-hidden="true">
          <line x1={x} x2={x} y1={FOCUS_TOP + FOCUS_PLOT_HEIGHT + 30} y2={FOCUS_TOP + FOCUS_PLOT_HEIGHT + 35} className="navigator-tick" />
          <text x={x} y={FOCUS_HEIGHT - 6} textAnchor={index === 0 ? "start" : index === ticks.length - 1 ? "end" : "middle"} className="focus-axis">{formatTime(tick)}</text>
        </g>;
      })}
      {cursorX !== null ? <line x1={cursorX} x2={cursorX} y1={FOCUS_TOP} y2={FOCUS_TOP + FOCUS_PLOT_HEIGHT + 30} className="focus-cursor" /> : null}
    </svg>
    <div className="focus-readout" aria-live="polite">
      {readout ? <>
        <strong>{formatTime(readout.active_s)}</strong>
        <span>{number(readout.power_w)} W</span>
        <span>{number(readout.power_wkg, 2)} W/kg</span>
        <span>{number(readout.heart_rate_bpm)} bpm</span>
        <span>{readout.lap_id} · {readout.course_section}</span>
      </> : <span>No recorded sample in this window.</span>}
    </div>
  </div>;
}

function EffortRail({ efforts, selectedLapId, onSelect }) {
  const maximum = Math.max(...efforts.map((effort) => Number(effort.avg_power_w) || 0));
  return <div className="effort-rail-section">
    <div className="effort-rail-heading">
      <strong>All efforts ({efforts.length})</strong>
      <span>Tap any surge to center it in the explorer</span>
    </div>
    <div className="effort-rail" role="list" aria-label="Chronological effort jump list">
      {efforts.map((effort, index) => <button key={effort.lap_id} type="button"
        className={effort.lap_id === selectedLapId ? "is-selected" : ""}
        aria-pressed={effort.lap_id === selectedLapId}
        aria-label={`${effort.lap_id}, ${formatTime(effort.start_active_s)} into the race, ${number(effort.avg_power_w)} watts average`}
        onClick={() => onSelect(effort.lap_id)}>
        <i style={{ height: `${Math.max(18, Number(effort.avg_power_w) / maximum * 100)}%` }} />
        {(index === 0 || (index + 1) % 5 === 0 || index === efforts.length - 1) ? <span>{effort.lap_id}</span> : null}
      </button>)}
    </div>
  </div>;
}

function SelectedInspector({ lap, efforts, route, onSelect, onFullRace, onShowSurge }) {
  if (!lap) return null;
  const effortIndex = efforts.findIndex((effort) => effort.lap_id === lap.lap_id);
  const previousEffort = effortIndex >= 0
    ? efforts[effortIndex - 1]
    : efforts.filter((effort) => Number(effort.end_active_s) < Number(lap.start_active_s)).at(-1);
  const nextEffort = effortIndex >= 0
    ? efforts[effortIndex + 1]
    : efforts.find((effort) => Number(effort.start_active_s) > Number(lap.end_active_s));
  return <aside className="explorer-inspector" aria-label={`Selected ${lap.lap_id}`}>
    <div className="inspector-heading">
      <div>
        <span>{lap.lap_type === "Effort" ? "Selected surge" : "Selected Between lap"}</span>
        <h3>{lap.lap_id}</h3>
        <p>{formatTime(lap.start_active_s)} into race · {lap.course_section}</p>
      </div>
      <div className="inspector-stepper">
        <button type="button" onClick={() => previousEffort && onSelect(previousEffort.lap_id)} disabled={!previousEffort}>Previous</button>
        <button type="button" onClick={() => nextEffort && onSelect(nextEffort.lap_id)} disabled={!nextEffort}>Next</button>
      </div>
    </div>
    <dl className="inspector-metrics">
      <div><dt>Duration</dt><dd>{formatTime(lap.duration_s)}</dd></div>
      <div><dt>Average power</dt><dd>{number(lap.avg_power_w)} W <small>{number(lap.avg_power_wkg, 2)} W/kg</small></dd></div>
      <div><dt>Peak power</dt><dd>{number(lap.peak_power_w)} W</dd></div>
      <div><dt>Best 5 seconds</dt><dd>{number(lap.best_5s_w)} W</dd></div>
      <div><dt>Best 15 seconds</dt><dd>{number(lap.best_15s_w)} W</dd></div>
      <div><dt>Heart rate</dt><dd>{number(lap.avg_hr_bpm)} / {number(lap.max_hr_bpm)} bpm</dd></div>
    </dl>
    <div className="inspector-actions">
      <button type="button" onClick={onFullRace}>View full race</button>
      {lap.lap_type === "Effort" ? <button type="button" onClick={onShowSurge}>Open surge below</button> : null}
    </div>
    <MiniRoute route={route} selectedLap={lap} />
  </aside>;
}

export function RaceExplorer({ overview, segments, ride, route, selectedLapId, onSelect, onDownload, onOpenSurge }) {
  const totalSeconds = Number(ride.at(-1)?.active_s ?? 0) + 1;
  const efforts = useMemo(() => segments.filter((segment) => segment.lap_type === "Effort"), [segments]);
  const selectedLap = segments.find((segment) => segment.lap_id === selectedLapId) ?? efforts[0] ?? segments[0];
  const [range, setRange] = useState(() => centeredRange(selectedLap, totalSeconds));
  const [unitMode, setUnitMode] = useState("w");
  const [methodOpen, setMethodOpen] = useState(false);

  useEffect(() => {
    if (selectedLap) setRange(centeredRange(selectedLap, totalSeconds));
  }, [selectedLap?.lap_id, totalSeconds]);

  const selectEffort = useCallback((lapId) => {
    const effort = efforts.find((row) => row.lap_id === lapId);
    if (!effort) return;
    setRange(centeredRange(effort, totalSeconds));
    onSelect(lapId);
  }, [efforts, onSelect, totalSeconds]);

  const setPreset = (seconds) => {
    if (seconds >= totalSeconds) return setRange({ start: 0, end: totalSeconds });
    const center = (range.start + range.end) / 2;
    const start = clamp(center - seconds / 2, 0, totalSeconds - seconds);
    setRange({ start, end: start + seconds });
  };

  return <div className="race-explorer" data-reviewed-rows>
    <div className="explorer-toolbar">
      <div className="explorer-title-block">
        <h2>Race Tape · 220 W Effort Laps</h2>
        <p>{efforts.length} efforts · {segments.length - efforts.length} between · {ride.length.toLocaleString()} recorded seconds</p>
      </div>
      <div className="explorer-controls">
        <button type="button" onClick={onDownload}>Download CSV</button>
        <div className="unit-toggle" role="group" aria-label="Power units">
          {[{ id: "w", label: "W" }, { id: "wkg", label: "W/kg" }, { id: "both", label: "Both" }].map((option) => <button
            key={option.id} type="button" aria-pressed={unitMode === option.id}
            onClick={() => setUnitMode(option.id)}>{option.label}</button>)}
        </div>
        <button type="button" aria-expanded={methodOpen} aria-controls="race-method" onClick={() => setMethodOpen((open) => !open)}>Method</button>
      </div>
    </div>
    {methodOpen ? <div id="race-method" className="explorer-method">
      Efforts are raw recorded power strictly above 220 W for at least 16 consecutive recorded seconds. Exactly 220 W and shorter bursts stay Between; recording gaps are hard barriers.
    </div> : null}
    <FullRaceNavigator overview={overview} segments={segments} ride={ride} range={range}
      onRangeChange={setRange} onRangeCommit={() => {}} onSelect={selectEffort} />
    <div className="range-presets" aria-label="Selected-window duration">
      <span>Window</span>
      <button type="button" onClick={() => setPreset(240)}>4 min</button>
      <button type="button" onClick={() => setPreset(900)}>15 min</button>
      <button type="button" onClick={() => setPreset(totalSeconds)}>Full race</button>
      <button type="button" onClick={() => setRange(centeredRange(selectedLap, totalSeconds))}>Reset to {selectedLap?.lap_id}</button>
    </div>
    <div className="explorer-main">
      <FocusChart ride={ride} segments={segments} range={range} selectedLapId={selectedLap?.lap_id} unitMode={unitMode} />
      <SelectedInspector lap={selectedLap} efforts={efforts} route={route}
        onSelect={selectEffort} onFullRace={() => setPreset(totalSeconds)} onShowSurge={() => onOpenSurge?.(selectedLap?.lap_id)} />
    </div>
    <EffortRail efforts={efforts} selectedLapId={selectedLap?.lap_id} onSelect={selectEffort} />
    <p className="explorer-method-line">Strictly &gt;220 W for 16+ recorded seconds · W/kg at 150 lb · original FIT unchanged</p>
  </div>;
}
