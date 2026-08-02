// Fetches the Garmin inReach MapShare KML feed, parses track points, and
// encrypts them into track.enc.json (same AES-256-GCM layout as build.js).
// Published to the `track` branch by .github/workflows/track.yml; the app
// fetches it from raw.githubusercontent.com and decrypts client-side.
//
// Usage:
//   PASSWORD='trip-pw' MAPSHARE_NAME='YourMapShareName' node track-fetch.js
//
// Env:
//   PASSWORD           trip password (encryption key source) — required
//   MAPSHARE_NAME      the name in share.garmin.com/<name> — required
//   MAPSHARE_PASSWORD  MapShare page password, if you set one — optional
//   KML_FILE           read KML from a local file instead of Garmin (testing)
//   SINCE              feed start date (default: trip start)

const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

const password = process.env.PASSWORD;
const name = process.env.MAPSHARE_NAME;
const SINCE = process.env.SINCE || "2026-08-01T00:00Z";
const OUT = path.join(__dirname, "track.enc.json");

if (!password || (!name && !process.env.KML_FILE)) {
  console.error("Need PASSWORD and MAPSHARE_NAME (or KML_FILE) env vars.");
  process.exit(1);
}

async function fetchKml() {
  if (process.env.KML_FILE) return fs.readFileSync(process.env.KML_FILE, "utf8");
  const url = `https://share.garmin.com/Feed/Share/${encodeURIComponent(name)}?d1=${encodeURIComponent(SINCE)}`;
  const headers = { "User-Agent": "central-asia-trip-tracker" };
  if (process.env.MAPSHARE_PASSWORD) {
    // MapShare feed auth is HTTP Basic with an empty username.
    headers.Authorization =
      "Basic " + Buffer.from(":" + process.env.MAPSHARE_PASSWORD).toString("base64");
  }
  const resp = await fetch(url, { headers });
  if (!resp.ok) throw new Error(`Garmin feed HTTP ${resp.status}`);
  return resp.text();
}

// Minimal KML parsing — Garmin's feed is regular enough that regex is safe.
// Track points are Placemarks with a TimeStamp and a Point; the trailing
// LineString Placemark (the pre-drawn track line) has neither and is skipped.
function xmlValue(block, tag) {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : "";
}
function extData(block, dataName) {
  const m = block.match(
    new RegExp(`<Data name="${dataName}">\\s*<value>([\\s\\S]*?)</value>`, "i"),
  );
  return m ? m[1].trim() : "";
}
function decodeEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parsePoints(kml) {
  const points = [];
  const placemarks = kml.match(/<Placemark>[\s\S]*?<\/Placemark>/g) || [];
  for (const pm of placemarks) {
    const when = xmlValue(pm, "when");
    const coordsRaw = xmlValue(pm, "coordinates");
    if (!when || !coordsRaw || pm.includes("<LineString>")) continue;
    const [lon, lat, ele] = coordsRaw.split(",").map(Number);
    if (!isFinite(lat) || !isFinite(lon)) continue;

    const p = {
      t: new Date(when).toISOString(),
      lat: +lat.toFixed(5),
      lon: +lon.toFixed(5),
    };
    if (isFinite(ele)) p.ele = Math.round(ele);
    const vel = parseFloat(extData(pm, "Velocity"));
    if (isFinite(vel) && vel > 0) p.spd = +vel.toFixed(1);
    const text = decodeEntities(extData(pm, "Text"));
    if (text) p.msg = text;
    if (/^true$/i.test(extData(pm, "In Emergency"))) p.sos = true;
    points.push(p);
  }
  // Sort ascending, dedup by timestamp+position, cap to the freshest 4000.
  points.sort((a, b) => a.t.localeCompare(b.t));
  const seen = new Set();
  const out = [];
  for (const p of points) {
    const k = `${p.t}|${p.lat}|${p.lon}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out.slice(-4000);
}

function encrypt(json) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const ITER = 200_000;
  const key = crypto.pbkdf2Sync(password, salt, ITER, 32, "sha256");
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob = Buffer.concat([salt, iv, tag, ct]).toString("base64");
  return JSON.stringify({ blob, iter: ITER, alg: "AES-256-GCM", kdf: "PBKDF2-SHA256" });
}

(async () => {
  const kml = await fetchKml();
  const points = parsePoints(kml);
  if (points.length === 0) {
    // Tracking hasn't produced points yet (or feed hiccup) — leave any
    // previously published file alone rather than wiping the trail.
    console.log("No track points in feed; nothing written.");
    return;
  }
  const payload = {
    updated: new Date().toISOString(),
    mapshare: name ? `https://share.garmin.com/${name}` : "",
    points,
  };
  fs.writeFileSync(OUT, encrypt(JSON.stringify(payload)));
  const last = points[points.length - 1];
  console.log(
    `Wrote ${OUT}: ${points.length} points, latest ${last.t} @ ${last.lat},${last.lon}`,
  );
})().catch((err) => {
  console.error("track-fetch failed:", err.message);
  process.exit(1);
});
