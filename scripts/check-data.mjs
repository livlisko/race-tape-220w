import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const EXPECTED = Object.freeze({
  snapshotSha256: "6e17eabf9090da7ba720a77b613ee6d812713ace2277a13f5c4a9208180094ad",
  sourceSha256: "8ee32224f29f7ef38845491ed589aa71dfd96bbb53b9a6a9fe2acd54157c794a",
  datasetNames: ["lap_segments", "race_overview", "ride_series", "route_points"],
  rideRows: 12_851,
  overviewRows: 215,
  routeRows: 12_851,
  lapCount: 137,
  effortCount: 68,
  betweenCount: 69,
  effortSamples: 1_538,
  shortestEffort: 16,
  longestEffort: 50,
  weightLb: 150,
  weightKg: 68.0388555,
  thresholdW: 220,
  minimumEffortSeconds: 16,
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function near(actual, expected, tolerance = 0.0006) {
  return Math.abs(Number(actual) - Number(expected)) <= tolerance;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function expectedEffortMask(rows, thresholdW = EXPECTED.thresholdW, minimumSeconds = EXPECTED.minimumEffortSeconds) {
  const mask = new Array(rows.length).fill(false);
  let start = 0;

  while (start < rows.length) {
    const first = rows[start];
    const qualifies = !first.power_missing && first.power_w !== null && first.power_w > thresholdW;
    if (!qualifies) {
      start += 1;
      continue;
    }

    let end = start + 1;
    while (
      end < rows.length
      && rows[end].recording_segment === first.recording_segment
      && !rows[end].power_missing
      && rows[end].power_w !== null
      && rows[end].power_w > thresholdW
    ) end += 1;

    if (end - start >= minimumSeconds) {
      for (let index = start; index < end; index += 1) mask[index] = true;
    }
    start = end;
  }
  return mask;
}

function boundaryFixtures() {
  const rows = (powers, splitAt = null) => powers.map((power_w, index) => ({
    power_w,
    power_missing: false,
    recording_segment: splitAt !== null && index >= splitAt ? 2 : 1,
  }));
  assert(expectedEffortMask(rows(Array(15).fill(221))).every((value) => !value), "15 seconds above 220 W must remain Between");
  assert(expectedEffortMask(rows(Array(16).fill(221))).every(Boolean), "16 seconds above 220 W must qualify as Effort");
  assert(expectedEffortMask(rows(Array(20).fill(220))).every((value) => !value), "exactly 220 W must remain Between");
  assert(expectedEffortMask(rows(Array(16).fill(221), 8)).every((value) => !value), "an effort must not cross a recording gap");
}

const projectDir = path.resolve(import.meta.dirname, "..");
const dataPath = path.join(projectDir, "public", "race-tape-data.json");
const bytes = fs.readFileSync(dataPath);
const snapshotHash = sha256(bytes);
assert(snapshotHash === EXPECTED.snapshotSha256, `reviewed snapshot checksum changed: ${snapshotHash}`);

const snapshot = JSON.parse(bytes.toString("utf8"));
assert(snapshot && typeof snapshot === "object" && snapshot.metadata && snapshot.queries, "snapshot metadata and queries are required");
assert(JSON.stringify(Object.keys(snapshot.queries).sort()) === JSON.stringify(EXPECTED.datasetNames), "snapshot must contain exactly the four reviewed datasets");

const metadata = snapshot.metadata;
assert(metadata.sourceSha256 === EXPECTED.sourceSha256, "FIT source checksum changed");
assert(metadata.recordCount === EXPECTED.rideRows, "metadata record count mismatch");
assert(metadata.effortCount === EXPECTED.effortCount, "metadata effort count mismatch");
assert(metadata.betweenCount === EXPECTED.betweenCount, "metadata Between count mismatch");
assert(metadata.lapCount === EXPECTED.lapCount, "metadata lap count mismatch");
assert(metadata.riderWeightLb === EXPECTED.weightLb && near(metadata.riderWeightKg, EXPECTED.weightKg, 1e-9), "rider weight must remain 150 lb");
assert(metadata.powerThresholdW === EXPECTED.thresholdW, "power threshold must remain 220 W");
assert(metadata.minimumEffortSeconds === EXPECTED.minimumEffortSeconds, "minimum effort must remain 16 seconds");

const ride = snapshot.queries.ride_series.rows;
const overview = snapshot.queries.race_overview.rows;
const laps = snapshot.queries.lap_segments.rows;
const route = snapshot.queries.route_points.rows;
assert(ride.length === EXPECTED.rideRows, `ride_series expected ${EXPECTED.rideRows} rows, found ${ride.length}`);
assert(overview.length === EXPECTED.overviewRows, `race_overview expected ${EXPECTED.overviewRows} rows, found ${overview.length}`);
assert(laps.length === EXPECTED.lapCount, `lap_segments expected ${EXPECTED.lapCount} rows, found ${laps.length}`);
assert(route.length === EXPECTED.routeRows, `route_points expected ${EXPECTED.routeRows} rows, found ${route.length}`);

const efforts = laps.filter((lap) => lap.lap_type === "Effort");
const between = laps.filter((lap) => lap.lap_type === "Between");
assert(efforts.length === EXPECTED.effortCount, `expected ${EXPECTED.effortCount} Effort laps, found ${efforts.length}`);
assert(between.length === EXPECTED.betweenCount, `expected ${EXPECTED.betweenCount} Between laps, found ${between.length}`);
assert(Math.min(...efforts.map((lap) => lap.sample_count)) === EXPECTED.shortestEffort, "shortest effort must be 16 seconds");
assert(Math.max(...efforts.map((lap) => lap.sample_count)) === EXPECTED.longestEffort, "longest effort must be 50 seconds");
assert(efforts.reduce((sum, lap) => sum + lap.sample_count, 0) === EXPECTED.effortSamples, "effort sample total must be 1,538");

let nextSample = 0;
for (let index = 0; index < laps.length; index += 1) {
  const lap = laps[index];
  const expectedType = index % 2 === 0 ? "Between" : "Effort";
  assert(lap.lap_seq === index + 1, `lap sequence is not chronological at ${lap.lap_id}`);
  assert(lap.lap_type === expectedType, `lap types do not alternate at ${lap.lap_id}`);
  assert(lap.start_sample_index === nextSample, `gap or overlap before ${lap.lap_id}`);
  assert(lap.sample_count === lap.end_sample_index - lap.start_sample_index + 1, `sample count mismatch for ${lap.lap_id}`);
  assert(lap.duration_s === lap.sample_count, `active duration mismatch for ${lap.lap_id}`);
  assert(near(lap.avg_power_wkg, lap.avg_power_w / EXPECTED.weightKg), `average W/kg mismatch for ${lap.lap_id}`);
  assert(near(lap.peak_power_wkg, lap.peak_power_w / EXPECTED.weightKg), `peak W/kg mismatch for ${lap.lap_id}`);
  if (lap.lap_type === "Effort") {
    assert(lap.sample_count >= EXPECTED.minimumEffortSeconds, `short effort ${lap.lap_id}`);
    assert(lap.time_above_220_s === lap.sample_count, `${lap.lap_id} is not wholly above 220 W`);
    assert(!lap.crosses_recording_gap, `${lap.lap_id} crosses a recording gap`);
  }
  nextSample = lap.end_sample_index + 1;
}
assert(nextSample === ride.length, "laps do not cover the final ride sample");
assert(laps.reduce((sum, lap) => sum + lap.sample_count, 0) === ride.length, "lap durations do not cover every ride sample exactly once");

const recomputedMask = expectedEffortMask(ride);
let recomputedEffortSamples = 0;
for (let index = 0; index < ride.length; index += 1) {
  const row = ride[index];
  const routePoint = route[index];
  assert(row.sample_index === index && row.active_s === index, `ride index mismatch at ${index}`);
  assert(row.raw_above_220 === (!row.power_missing && row.power_w !== null && row.power_w > EXPECTED.thresholdW), `strict threshold flag mismatch at ${index}`);
  assert(row.is_effort === recomputedMask[index], `effort classification mismatch at ${index}`);
  if (row.is_effort) recomputedEffortSamples += 1;
  if (row.power_missing) assert(row.power_w === null && row.power_wkg === null && !row.is_effort, `missing power row is invalid at ${index}`);
  else assert(near(row.power_wkg, row.power_w / EXPECTED.weightKg), `sample W/kg mismatch at ${index}`);

  assert(routePoint.sample_index === index && routePoint.active_s === index, `route index mismatch at ${index}`);
  assert([routePoint.latitude_deg, routePoint.longitude_deg, routePoint.route_x_m, routePoint.route_y_m].every(Number.isFinite), `route coordinates missing at ${index}`);
  assert(routePoint.lap_seq === row.lap_seq && routePoint.lap_id === row.lap_id && routePoint.lap_type === row.lap_type, `route/ride lap membership mismatch at ${index}`);
  const lap = laps[row.lap_seq - 1];
  assert(index >= lap.start_sample_index && index <= lap.end_sample_index && row.lap_id === lap.lap_id, `ride/lap range mismatch at ${index}`);
}
assert(recomputedEffortSamples === EXPECTED.effortSamples, "recomputed effort sample total mismatch");
assert(ride.filter((row) => row.power_w === 220).every((row) => !row.raw_above_220 && !row.is_effort), "exactly 220 W was incorrectly classified");
const missingPower = ride.filter((row) => row.power_missing);
assert(missingPower.length === 2 && missingPower.every((row) => !row.is_effort && row.lap_type === "Between"), "the two missing power samples must remain outside efforts");

const rideSummary = overview[0];
const lapTimer = laps.reduce((sum, lap) => sum + lap.timer_duration_s, 0);
const lapDistance = laps.reduce((sum, lap) => sum + lap.distance_mi, 0);
const lapWork = laps.reduce((sum, lap) => sum + lap.work_kj, 0);
assert(near(lapTimer, rideSummary.ride_timer_s, 0.001), "lap timer total does not reconcile to the FIT session");
assert(near(lapDistance, rideSummary.ride_distance_mi, 0.0001), "lap distance total does not reconcile to the FIT session");
assert(near(lapWork, rideSummary.ride_work_kj, 0.001), "lap work total does not reconcile to the FIT session");

boundaryFixtures();
console.log(`Validated reviewed snapshot ${snapshotHash.slice(0, 12)}…: ${ride.length.toLocaleString()} ride rows, ${laps.length} contiguous laps (${efforts.length} Effort + ${between.length} Between), ${route.length.toLocaleString()} route points.`);
