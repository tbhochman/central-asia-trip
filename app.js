// Bootstrapped only after the gate decrypts the trip data.
// window.STOPS and window.LOGISTICS are set by the gate before this runs.
window.startApp = function startApp() {
  const STOPS = window.STOPS;
  const LOGISTICS = window.LOGISTICS;
  const WALLET = window.WALLET || [];

// ─────────────────────────────────────────────────────────────
// Map setup
// ─────────────────────────────────────────────────────────────

const map = L.map("map", { zoomControl: true, attributionControl: true }).setView(
  [39.5, 70.5],
  6,
);

L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
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
  const stops = prev ? [prev, ...seg.stops] : seg.stops;
  // Build coordinates list, inserting any per-stop `waypoints` BEFORE that stop's
  // own coords so the line bends through them (e.g. Bukhara → Samarkand → Dushanbe).
  const coords = [];
  stops.forEach((s, j) => {
    if (j > 0 && Array.isArray(s.waypoints)) {
      s.waypoints.forEach((w) => coords.push(w));
    }
    coords.push(s.coords);
  });
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

// Leaflet caches container dimensions on init. If the map was first laid out
// while hidden behind the gate (display:none on the parent), Leaflet read a
// 0×0 size. Re-measure now that the content is visible.
requestAnimationFrame(() => {
  map.invalidateSize();
  map.fitBounds(allBounds, { padding: [50, 50] });
});

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
// Wallet: day-by-day tickets, hotels, confirmation codes
// ─────────────────────────────────────────────────────────────

const TYPE_META = {
  flight: { icon: "✈️", label: "Flight" },
  train: { icon: "🚆", label: "Train" },
  hotel: { icon: "🏨", label: "Hotel" },
  tour: { icon: "🏔", label: "Tour" },
  gap: { icon: "⚠️", label: "To book" },
  info: { icon: "📍", label: "Plan" },
};

function todayISO() {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

const walletEl = document.getElementById("wallet");
const today = todayISO();

WALLET.forEach((day, di) => {
  // A multi-day block (e.g. "Aug 13–20") is "today" if today falls between
  // its date and the next block's date.
  const next = WALLET[di + 1];
  const isToday = today >= day.date && (!next || today < next.date);
  const isPast = next && today >= next.date;

  const dayEl = document.createElement("section");
  dayEl.className = "w-day" + (isToday ? " today" : "") + (isPast ? " past" : "");
  dayEl.innerHTML = `
    <header class="w-day-head">
      <span class="w-day-label">${escapeHtml(day.label)}</span>
      ${isToday ? '<span class="w-today-chip">TODAY</span>' : ""}
    </header>
  `;

  day.items.forEach((item) => {
    const meta = TYPE_META[item.type] || TYPE_META.info;
    const card = document.createElement("article");
    card.className = `w-card w-${item.type}`;
    card.innerHTML = `
      <div class="w-card-head">
        <span class="w-icon">${meta.icon}</span>
        <div class="w-card-title-wrap">
          <div class="w-card-title">${escapeHtml(item.title)}</div>
          ${item.sub ? `<div class="w-card-sub">${escapeHtml(item.sub)}</div>` : ""}
        </div>
        ${item.time ? `<div class="w-time">${escapeHtml(item.time)}</div>` : ""}
      </div>
      ${item.carrier ? `<div class="w-row"><span class="w-k">Carrier</span><span class="w-v">${escapeHtml(item.carrier)}</span></div>` : ""}
      ${item.conf ? `<div class="w-row w-conf-row"><span class="w-k">Conf</span><button class="w-conf" data-copy="${escapeHtml(item.conf)}">${escapeHtml(item.conf)}</button></div>` : ""}
      ${item.address ? `<div class="w-row"><span class="w-k">Address</span><span class="w-v">${escapeHtml(item.address)}</span></div>` : ""}
      ${item.notes ? `<div class="w-notes">${escapeHtml(item.notes)}</div>` : ""}
      ${(item.attachments || [])
        .map(
          (a) =>
            `<button class="w-att" data-file="${escapeHtml(a.file)}">📎 ${escapeHtml(a.label || a.file)}</button>`,
        )
        .join("")}
    `;
    dayEl.appendChild(card);
  });

  walletEl.appendChild(dayEl);
});

// Tap a confirmation code to copy it
walletEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".w-conf");
  if (!btn) return;
  const text = btn.dataset.copy;
  (navigator.clipboard?.writeText(text) || Promise.reject()).then(
    () => {
      const prev = btn.textContent;
      btn.textContent = "Copied ✓";
      setTimeout(() => (btn.textContent = prev), 1200);
    },
    () => {},
  );
});

// ─── Encrypted ticket attachments ───
// Files live in tickets-enc/<name>.enc — AES-256-GCM, layout
// salt(16) | iv(12) | tag(16) | ct, same password as the trip data.

async function decryptTicket(file) {
  const resp = await fetch("tickets-enc/" + file + ".enc");
  if (!resp.ok) throw new Error("ticket fetch failed");
  const bytes = new Uint8Array(await resp.arrayBuffer());
  const salt = bytes.slice(0, 16);
  const iv = bytes.slice(16, 28);
  const tag = bytes.slice(28, 44);
  const ct = bytes.slice(44);
  const ctWithTag = new Uint8Array(ct.length + tag.length);
  ctWithTag.set(ct);
  ctWithTag.set(tag, ct.length);
  const password = localStorage.getItem("trip-pw");
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 200000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ctWithTag);
  return new Blob([plain], { type: "application/pdf" });
}

const ticketUrlCache = {};

walletEl.addEventListener("click", async (e) => {
  const btn = e.target.closest(".w-att");
  if (!btn || btn.dataset.busy) return;
  const file = btn.dataset.file;
  const prev = btn.textContent;
  try {
    let url = ticketUrlCache[file];
    if (!url) {
      btn.dataset.busy = "1";
      btn.textContent = "🔓 Decrypting…";
      const blob = await decryptTicket(file);
      url = URL.createObjectURL(blob);
      ticketUrlCache[file] = url;
    }
    btn.textContent = prev;
    delete btn.dataset.busy;
    const win = window.open(url, "_blank");
    if (!win) {
      // Pop-up blocked (common in standalone PWAs): swap in a real link.
      const a = document.createElement("a");
      a.className = "w-att";
      a.href = url;
      a.target = "_blank";
      a.textContent = "📄 Tap to open " + (btn.textContent.replace(/^📎 /, "") || "ticket");
      btn.replaceWith(a);
    }
  } catch (err) {
    btn.textContent = "⚠️ Couldn't decrypt — reload & retry";
    delete btn.dataset.busy;
    setTimeout(() => (btn.textContent = prev), 2500);
  }
});

// Warm the service-worker cache so tickets open in airplane mode.
setTimeout(() => {
  WALLET.forEach((day) =>
    (day.items || []).forEach((item) =>
      (item.attachments || []).forEach((a) => {
        fetch("tickets-enc/" + a.file + ".enc").catch(() => {});
      }),
    ),
  );
}, 3000);

function openWalletToday() {
  const el = walletEl.querySelector(".w-day.today");
  if (el) el.scrollIntoView({ block: "start" });
}

// ─────────────────────────────────────────────────────────────
// Tab switching
// ─────────────────────────────────────────────────────────────

function switchTab(target) {
  document
    .querySelectorAll(".tab")
    .forEach((t) => t.classList.toggle("active", t.dataset.tab === target));
  document
    .querySelectorAll(".view")
    .forEach((v) => v.classList.toggle("active", v.dataset.view === target));
  if (target === "map") setTimeout(() => map.invalidateSize(), 50);
  if (target === "wallet") openWalletToday();
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

// Don't auto-open the detail panel — let the map be the dominant element on load.
// During the trip itself, open straight to today's Wallet — that's the daily view.
if (today >= "2026-08-03" && today <= "2026-08-24") {
  switchTab("wallet");
}

}; // end window.startApp
