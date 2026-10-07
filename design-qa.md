# Design QA — Race Tape surge explorer

## Accepted direction

- Source reference: the user-provided Race Tape screenshot from October 7, 2026.
- Approval evidence: the user explicitly asked to keep that continuous full-race view at the top and add an Attack Detector-style view of every separate surge with its data and route.
- Semantic contract: the full-race explorer remains the orientation layer; the chronological surge list is the investigation layer. Selection is shared across both layers, the Lap Log, and the Route Map.

## Reference comparison

1. Continuous race overview: preserved as one 3:34:11 timeline with the 220 W rule, effort/between ribbon, pause markers, and a draggable selected window.
2. Selected-window analysis: preserved as a one-second power and heart-rate trace with the selected synthetic lap, threshold, pauses, time scale, and synchronized readout.
3. Inspector: preserved at right on desktop with previous/next navigation, duration, average power, W/kg at 150 lb, peak, best 5/15 seconds, HR, and route.
4. Effort rail: preserved as all 68 chronological efforts and made horizontally scrollable with 44 px mobile targets.
5. Visual system: preserved the open white layout, charcoal power trace, coral effort/HR, blue-gray Between, gold threshold, purple pauses, restrained borders, and compact data typography.
6. Responsive behavior: the same information hierarchy continues through 1440×900 desktop, 844×390 landscape, 390×844 portrait, and 320×568 narrow mobile without page-level horizontal overflow.
7. Requested extension: added 68 chronological surge rows with a common 0–600 W sparkline scale; one row can expand at a time into a one-second context chart, complete metrics, HR response, exact route highlight, and previous/next controls.

## Data and copy reconciliation

- The reference screenshot was an approved layout concept, not a source of record. Its illustrative E65 peak/best-power/HR values were replaced with the FIT-backed values: 19 s, 411 W average, 6.04 W/kg, 554 W peak, 523 W best 5 s, 431 W best 15 s, and 171/172 bpm average/max HR.
- Above-fold concepts retained: Race Tape title, 68 efforts, 69 Between laps, 12,851 recorded seconds, full-race duration, selected window, 220 W threshold, unit controls, selected-surge metrics, route, and effort navigation.
- Copy was clarified to say “up to 60 recorded seconds before and after” for edge efforts.

## Intentional deviations

- A slim site navigation remains above the explorer so Lap Log and Route Map stay reachable.
- The route is rendered from bundled projected geometry without external map tiles or coordinate labels.
- The new chronological accordion appears below the approved explorer, as requested, rather than replacing it.
- Exact source-backed values replace every illustrative number that differed from the reviewed FIT snapshot.

## Verification

- `npm run check`: passed data validation and production build.
- Snapshot invariants: 12,851 ride rows, 137 contiguous laps, 68 Effort, 69 Between, and 12,851 route points.
- Browser interaction: passed selection sync, E65 expansion, previous/next surge focus, W/Wkg/Both modes, Method disclosure, Lap Log filters/sort, Route Map selection, and return-to-explorer focus.
- Recording gaps: E68 context produces three path sections and two visible pause markers; no line bridges a recording segment.
- Responsive visual inspection: passed at 1440×900, 844×390, 390×844, and 320×568, with no page-level horizontal overflow.
- Accessibility checks: keyboard-operable explorer and charts, visible focus treatment, synchronized live selection text, ARIA expansion state, reduced-motion-aware scrolling, and 44 px mobile effort targets.
- Console: no warnings or errors.
- Reference and final implementation were inspected side-by-side at original resolution.

final result: passed
