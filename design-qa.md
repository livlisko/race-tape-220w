# Design QA — GFNY Attack Detector

## Accepted direction and source truth

- Accepted concept: faithfully rebuild the user-owned [Attack Detector](https://livlisko.github.io/attack-detector/) result experience, but make it a permanent single-race analysis with no upload or configuration flow.
- Source capture: live Attack Detector repository/page at commit `d718403fd7e3d1a350a0615b2b546d9ff0a4bf7a`, captured after analyzing the same FIT file.
- Data truth: reviewed `race-tape-data.json` snapshot from `24604508579_ACTIVITY.fit`; 12,851 one-second rows, 68 strict Effort laps, 69 Between laps, and 12,851 route points.
- Detection contract: raw power strictly above 220 W for at least 16 consecutive recorded seconds; exactly 220 W is Between; recording gaps are hard barriers; no smoothing, merging, or FTP assumption.
- TrainingPeaks use: NP 223 W, IF 0.89, and TSS 280 are labeled with a dagger and attributed in the methodology footer. TrainingPeaks' separate 39-interval overlay does not replace the 68 strict surges.

## Visual comparison

Desktop viewport and pixels:

- Browser viewport: 1280×720 CSS px.
- Source screenshots: 1274×717 raster px — `artifacts/qa/source-results.png` and `artifacts/qa/source-card.png`.
- Implementation screenshots: 1273×716 raster px — `artifacts/qa/local-results.png` and `artifacts/qa/local-card.png`.
- Source and implementation pairs were inspected together at original resolution with `view_image`.

Mobile viewport and pixels:

- Browser viewport: 390×844 CSS px.
- Source capture: `artifacts/qa/source-mobile.png`.
- Implementation capture: `artifacts/qa/local-mobile.png`.
- Implementation width check: 383 px document client width and 383 px scroll width; no horizontal overflow.

## Five fidelity surfaces

1. **Visual system:** matched the cream paper ground, teal 80 px masthead stripe, faint fixed noise, orange/teal split wordmark, hard title shadow, orange underline, muted tan surfaces, hairline borders, and 3–6 px corner radii.
2. **Typography and density:** matched Barlow Condensed for uppercase display/labels, Barlow for prose, and JetBrains Mono for metrics; the summary grid, chart panel, results header, and terse collapsed rows use the source's spacing and hierarchy.
3. **Ride profile:** matched a single full-width teal power trace with orange effort overlay and red HR trace, while adding a visible 220 W reference and click-to-surge synchronization requested for this analysis.
4. **Effort cards:** matched chronological stacked cards, circular orange number badges, course/location title, mile/time subtitle, right-side average power and duration, multiple-open disclosure behavior, compact metric grid, HR-response strip, and a full-width 200–220 px map.
5. **Responsive behavior:** matched the source breakpoint behavior—two-column controls/stats, hidden collapsed headline metrics, 240 px chart, wrapped HR-context strip, and 16 px mobile page gutters—while preserving 44 px-or-larger interactive targets.

## Full-view and focused comparison

- Full result hierarchy: source summary → Ride Power Profile → Detected Attacks was retained exactly; the fixed-race version starts there immediately instead of placing upload/settings ahead of it.
- Focused expanded card: source and implementation both show one compact row header, metric grid, four-part HR response, and route panel. The implementation uses the real E01 interval and fits its route plus 90 seconds of nearby course context.
- Selected-state treatment: implementation adds a thin orange card border and darker selected chart stroke so chart, URL, and expanded card read as one synchronized state.

## Copy diff and intentional deviations

- `ATTACK DETECTOR` became `GFNY ATTACK DETECTOR`; the subtitle names Maryland and explains that the race is already analyzed.
- Upload, FTP, threshold, smoothing, power-zone editor, help modal, geocoding status, and Detect button were removed because this page only analyzes the fixed GFNY race.
- `119 efforts` from the source's default smoothed/FTP algorithm became `68 efforts` from the approved strict raw-power rule.
- Street names and zone labels were replaced with the source-backed course sections Rollout, Loop 1, Loop 2, and Finish; no reverse-geocoding dependency is needed.
- External Leaflet/CARTO tiles were replaced with bundled projected route geometry on a quiet map-like field. This keeps the exact race line available offline and avoids external tile requests.
- FTP-derived interval NP, percent FTP, and power/HR zones were replaced by best 5/15-second power, work, cadence, speed, elevation change, and source-backed HR response.
- Export CSV intentionally contains all 137 contiguous synthetic laps, not only the 68 efforts, so every recorded second remains represented.

## Iteration history

1. Removed the prior white tabbed Race Tape/Lap Log/Route Map shell and rebuilt the page around the live source's editorial flow.
2. Replaced hour rows and card sparklines with one full-race profile and terse expandable effort rows.
3. Corrected the mini-map from a whole-course highlight (too small to see) to an interval-focused view with ±90 seconds of course context.
4. Constrained 15-second HR context to the effort's recording segment so an auto-pause cannot create a false response bridge.
5. Verified the TrainingPeaks CSV separately and kept its 39 interval boundaries out of the primary 68-surge detector.

## Functional verification

- `npm run check`: passed snapshot validation and production build.
- Snapshot invariants: 12,851 ride rows, 137 contiguous laps, 68 Effort, 69 Between, 1,538 effort seconds, and 12,851 route points.
- Boundary fixtures: 15 seconds above 220 W rejected; 16 accepted; exactly 220 rejected; recording-gap crossing rejected.
- Card disclosure: E02 click produced two simultaneously open cards; URL updated to `?effort=E02`.
- Keyboard: Enter on E03 opened its card and updated the URL.
- Chart synchronization: clicking the chart midpoint selected, opened, and scrolled to E40.
- CSV: browser export produced 137 rows (68 Effort + 69 Between), beginning B00 and ending B68.
- Mobile: 390×844 summary, chart, actions, expanded metrics, HR response, and route inspected with no horizontal overflow.
- Console: no warnings or errors.
- Print All is implemented with print-specific styles; the native print dialog itself was not invoked during automated QA.

final result: passed
