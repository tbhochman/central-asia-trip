// Bootstrapped only after the gate decrypts the trip data.
// window.STOPS and window.LOGISTICS are set by the gate before this runs.
window.startApp = function startApp() {
  const STOPS = window.STOPS;
  const LOGISTICS = window.LOGISTICS;

// ─────────────────────────────────────────────────────────────
// Map setup
// ─────────────────────────────────────────────────────────────

const map = L.map("map", { zoomControl: true, attributionControl: true }).setView(
  [39.5, 70.5],
  6,
);

L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 19,
  },
).addTo(map);

const markers = {};

STOPS.forEach((stop, i) => {
  const icon = L.divIcon({
    className: "",
    html: `<div class="pin pin-${stop.kind}"><div class="pin-num">${i + 1}</div></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
  });
  const m = L.marker(stop.coords, { icon, title: stop.name }).addTo(map);
  m.on("click", () => selectStop(stop.id));
  markers[stop.id] = m;
});

// Draw the route as contiguous segments — pamir vs non-pamir each get their
// own style. Each segment is bridged to the previous one's last stop so the
// line stays unbroken across boundaries (e.g. Dushanbe → Kalaikhumb is orange,
// Osh → Bishkek is blue).
const segments = [];
STOPS.forEach((s) => {
  const isPamir = s.kind === "pamir";
  const last = segments[segments.length - 1];
  if (last && last.isPamir === isPamir) last.stops.push(s);
  else segments.push({ isPamir, stops: [s] });
});

segments.forEach((seg, i) => {
  const prev = i > 0 ? segments[i - 1].stops.at(-1) : null;
  const coords = (prev ? [prev, ...seg.stops] : seg.stops).map((s) => s.coords);
  L.polyline(
    coords,
    seg.isPamir
      ? { color: "#ffb155", weight: 3, opacity: 0.85 }
      : { color: "#6aa9ff", weight: 2.5, opacity: 0.7, dashArray: "6 6" },
  ).addTo(map);
});

// Fit bounds across the whole route
const allBounds = L.latLngBounds(STOPS.map((s) => s.coords));
map.fitBounds(allBounds, { padding: [50, 50] });

// ─────────────────────────────────────────────────────────────
// Sidebar (day list)
// ─────────────────────────────────────────────────────────────

const dayList = document.getElementById("day-list");
STOPS.forEach((stop, i) => {
  const el = document.createElement("div");
  el.className = `day-item kind-${stop.kind}`;
  el.dataset.id = stop.id;
  el.innerHTML = `
    <div class="day-num">${i + 1}</div>
    <div>
      <div class="day-name">${stop.name}</div>
      <div class="day-meta">${stop.day}</div>
    </div>
    <div class="day-date">${formatDate(stop.date)}</div>
  `;
  el.addEventListener("click", () => selectStop(stop.id));
  dayList.appendChild(el);
});

function formatDate(iso) {
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// ─────────────────────────────────────────────────────────────
// Selection: highlight day, fly map, open detail
// ─────────────────────────────────────────────────────────────

let selectedId = null;
const detailEl = document.getElementById("detail");
const detailBody = document.getElementById("detail-body");

function selectStop(id) {
  selectedId = id;
  const stop = STOPS.find((s) => s.id === id);
  if (!stop) return;

  // Highlight sidebar
  document.querySelectorAll(".day-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.id === id);
  });
  const activeEl = document.querySelector(`.day-item[data-id="${id}"]`);
  if (activeEl) activeEl.scrollIntoView({ behavior: "smooth", block: "nearest" });

  // Fly map
  map.flyTo(stop.coords, Math.max(map.getZoom(), 8), { duration: 0.6 });

  // Open detail
  detailBody.innerHTML = `
    <div class="detail-eyebrow">${stop.day}</div>
    <div class="detail-title">${stop.name}</div>
    <div class="detail-country">${stop.country} · ${formatDate(stop.date)}</div>
    <div class="detail-summary">${escapeHtml(stop.summary)}</div>
    <div class="detail-body-text">${escapeHtml(stop.details)}</div>
  `;
  detailEl.classList.add("open");
}

document.getElementById("detail-close").addEventListener("click", () => {
  detailEl.classList.remove("open");
});

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

// ─────────────────────────────────────────────────────────────
// Itinerary view
// ─────────────────────────────────────────────────────────────

const tl = document.getElementById("timeline");
STOPS.forEach((stop) => {
  const el = document.createElement("div");
  el.className = "tl-item";
  el.innerHTML = `
    <div>
      <div class="tl-date">${formatDate(stop.date)}</div>
      <div class="tl-day">${stop.day}</div>
    </div>
    <div>
      <div class="tl-name">${stop.name}</div>
      <div class="tl-country">${stop.country}</div>
      <div class="tl-summary">${escapeHtml(stop.summary)}</div>
      <div class="tl-details">${escapeHtml(stop.details)}</div>
    </div>
  `;
  tl.appendChild(el);
});

// ─────────────────────────────────────────────────────────────
// Logistics with localStorage-backed checkboxes
// ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "central-asia-trip-2026:logistics";

function loadDone() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
  } catch {
    return new Set();
  }
}
function saveDone(set) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

const done = loadDone();
const lgEl = document.getElementById("logistics");

LOGISTICS.forEach((section) => {
  const secEl = document.createElement("div");
  secEl.className = "lg-section";
  secEl.dataset.section = section.section;

  const total = section.items.length;
  secEl.innerHTML = `
    <div class="lg-section-header">
      <div class="lg-section-title">${section.section}</div>
      <div class="lg-section-count" data-count></div>
    </div>
    <div data-items></div>
  `;

  const itemsWrap = secEl.querySelector("[data-items]");
  section.items.forEach((item) => {
    const itemEl = document.createElement("label");
    itemEl.className = "lg-item";
    itemEl.dataset.id = item.id;
    if (done.has(item.id)) itemEl.classList.add("done");
    itemEl.innerHTML = `
      <span class="lg-checkbox" aria-hidden="true"></span>
      <input class="lg-input" type="checkbox" ${done.has(item.id) ? "checked" : ""} />
      <span class="lg-text">${escapeHtml(item.text)}</span>
    `;
    const input = itemEl.querySelector("input");
    input.addEventListener("change", () => {
      if (input.checked) done.add(item.id);
      else done.delete(item.id);
      saveDone(done);
      itemEl.classList.toggle("done", input.checked);
      updateCounts();
    });
    itemsWrap.appendChild(itemEl);
  });

  lgEl.appendChild(secEl);
});

function updateCounts() {
  let totalAll = 0;
  let doneAll = 0;
  document.querySelectorAll(".lg-section").forEach((secEl) => {
    const items = secEl.querySelectorAll(".lg-item");
    const doneItems = secEl.querySelectorAll(".lg-item.done");
    totalAll += items.length;
    doneAll += doneItems.length;
    secEl.querySelector("[data-count]").textContent =
      `${doneItems.length} / ${items.length}`;
  });

  document.getElementById("logistics-count").textContent = totalAll - doneAll;
  document.getElementById("progress-label").textContent = `${doneAll} / ${totalAll}`;
  const pct = totalAll === 0 ? 0 : (doneAll / totalAll) * 100;
  document.getElementById("progress-fill").style.width = pct + "%";
}
updateCounts();

// ─────────────────────────────────────────────────────────────
// Tab switching
// ─────────────────────────────────────────────────────────────

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    document
      .querySelectorAll(".view")
      .forEach((v) => v.classList.toggle("active", v.dataset.view === target));
    if (target === "map") {
      setTimeout(() => map.invalidateSize(), 50);
    }
  });
});

// Open first stop by default
selectStop(STOPS[1].id); // Almaty

}; // end window.startApp
