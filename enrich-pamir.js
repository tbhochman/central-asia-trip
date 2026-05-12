// One-time enrichment: fetch the actual driving route for each Pamir leg
// from OSRM and write the geometry to pamir-routes.json. data.js merges
// that file in at build time so the polyline traces the real road.
//
// Skips the two trek days (Jeyzev, Engels Peak meadow) — those are hikes,
// not road segments, so straight lines are accurate enough.
//
// Run:  node enrich-pamir.js

const fs = require("fs");
const path = require("path");
const data = require("./data.js");

// Ordered Pamir legs. Each entry: { fromId, toId }.
const LEGS = [
  { from: "dushanbe", to: "kalaikhumb" },
  { from: "kalaikhumb", to: "baghu" },
  // baghu → jeyzev is a trek, skip
  // jeyzev → khorog: starts with the same trek back, then drive — fetch from baghu's road point
  { from: "baghu", to: "khorog" },
  { from: "khorog", to: "langar" },
  // langar → engels is a trek, skip
  // engels → bulunkul technically starts from langar after camping; we route langar → bulunkul
  { from: "langar", to: "bulunkul" },
  { from: "bulunkul", to: "karakul" },
  { from: "karakul", to: "tulparkul" },
  { from: "tulparkul", to: "osh" },
];

async function fetchRoute(fromCoords, toCoords) {
  const [fromLat, fromLon] = fromCoords;
  const [toLat, toLon] = toCoords;
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${fromLon},${fromLat};${toLon},${toLat}` +
    `?geometries=geojson&overview=simplified`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();
  if (json.code !== "Ok") throw new Error(`OSRM ${json.code}`);
  return json.routes[0];
}

(async () => {
  const out = {};
  for (const leg of LEGS) {
    const from = data.STOPS.find((s) => s.id === leg.from);
    const to = data.STOPS.find((s) => s.id === leg.to);
    if (!from || !to) {
      console.warn(`skip ${leg.from}→${leg.to}: missing stop`);
      continue;
    }
    try {
      const route = await fetchRoute(from.coords, to.coords);
      // OSRM geometry comes back as [lon, lat]; we use [lat, lon] in Leaflet.
      // Drop the first and last points — those are the stop coords themselves;
      // we only want the in-between road shape.
      const points = route.geometry.coordinates
        .slice(1, -1)
        .map(([lon, lat]) => [lat, lon]);
      out[leg.to] = points;
      const km = (route.distance / 1000).toFixed(0);
      const hr = (route.duration / 3600).toFixed(1);
      console.log(`${leg.from} → ${leg.to}: ${points.length} pts · ${km} km · ${hr} hr`);
      // Be polite to the public OSRM demo server
      await new Promise((r) => setTimeout(r, 300));
    } catch (e) {
      console.warn(`${leg.from} → ${leg.to}: FAILED (${e.message})`);
    }
  }
  const outPath = path.join(__dirname, "pamir-routes.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Wrote ${outPath}`);
})();
