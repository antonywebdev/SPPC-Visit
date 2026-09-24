
const canvas = document.getElementById("map");
const ctx = canvas.getContext("2d", { alpha: false });
const statusEl = document.getElementById("status");
const countEl = document.getElementById("featureCount");
const messageEl = document.getElementById("message");

let view = { x: 0, y: 0, w: 1, h: 1 };
let base = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
let paths = [];
let dragging = false;
let lastX = 0, lastY = 0;

let gpsWatchId = null;
let gpsActive = false;
let gpsFix = null;
let firstGpsFix = true;
let lastDrawTime = 0;

function showMessage(text) {
  messageEl.textContent = text;
  messageEl.classList.remove("hidden");
  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => messageEl.classList.add("hidden"), 6000);
}

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  draw();
}

function buildPathsAndBounds() {
  paths = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const f of EMBEDDED_KML) {
    if (!f || !f.d) continue;

    let path;
    try {
      path = new Path2D(f.d);
    } catch {
      continue;
    }

    // KML geometry is stored as longitude, -latitude.
    const nums = f.d.match(/-?\d+(?:\.\d+)?/g) || [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = Number(nums[i]);
      const y = Number(nums[i + 1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    paths.push({ path, type: f.t });
  }

  if (!paths.length || !Number.isFinite(minX)) {
    statusEl.textContent = "No KML geometry found";
    return false;
  }

  const sx = Math.max(maxX - minX, 0.000001);
  const sy = Math.max(maxY - minY, 0.000001);
  const pad = Math.max(sx, sy) * 0.04;

  base = {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad
  };

  return true;
}

function fitAll() {
  view = {
    x: base.minX,
    y: base.minY,
    w: base.maxX - base.minX,
    h: base.maxY - base.minY
  };
  draw();
}

function setViewAround(x, y, fraction = 0.12) {
  const w = Math.max((base.maxX - base.minX) * fraction, 0.00015);
  const aspect = canvas.clientHeight / Math.max(canvas.clientWidth, 1);
  const h = w * aspect;

  view = {
    x: x - w / 2,
    y: y - h / 2,
    w,
    h
  };
  draw();
}

function zoom(factor, cx = view.x + view.w / 2, cy = view.y + view.h / 2) {
  const nw = view.w * factor;
  const nh = view.h * factor;
  const rx = (cx - view.x) / view.w;
  const ry = (cy - view.y) / view.h;

  view.x = cx - nw * rx;
  view.y = cy - nh * ry;
  view.w = nw;
  view.h = nh;
  draw();
}

function pan(dx, dy) {
  view.x += dx;
  view.y += dy;
  draw();
}


// Fixed main project locations. Coordinates are stored in decimal degrees.
// KML uses longitude, -latitude as its drawing coordinate system.
const MAIN_LOCATIONS = [
  { name: "Project Office", lat: 22.295941666666668, lon: 39.24953611111111 },
  { name: "Substation-1", lat: 22.285730555555556, lon: 39.283975 },
  { name: "Substation-2", lat: 22.288611111111113, lon: 39.33075555555556 },
  { name: "CCR", lat: 22.28386666666667, lon: 39.24185 },
  { name: "PV", lat: 22.299433333333337, lon: 39.26668611111111 }
];

function openPvVideo() {
  let modal = document.getElementById("pvVideoModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "pvVideoModal";
    modal.style.cssText = [
      "position:fixed", "inset:0", "z-index:9999", "display:flex",
      "align-items:center", "justify-content:center", "padding:24px",
      "box-sizing:border-box", "background:rgba(0,0,0,0.88)"
    ].join(";");

    const panel = document.createElement("div");
    panel.style.cssText = [
      "position:relative", "width:min(96vw,1600px)", "height:min(92vh,900px)",
      "display:flex", "align-items:center", "justify-content:center",
      "background:#000", "border-radius:12px", "overflow:hidden",
      "box-shadow:0 20px 60px rgba(0,0,0,.5)"
    ].join(";");

    const video = document.createElement("video");
    video.id = "pvVideoPlayer";
    video.src = "Videos/PV.mp4";
    video.autoplay = true;
    video.loop = true;
    video.controls = true;
    video.playsInline = true;
    video.preload = "auto";
    video.style.cssText = "width:100%;height:100%;object-fit:contain;display:block;background:#000;";

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", "Close PV video");
    close.style.cssText = [
      "position:absolute", "top:12px", "right:12px", "z-index:2",
      "width:44px", "height:44px", "border:0", "border-radius:50%",
      "background:rgba(0,0,0,.7)", "color:#fff", "font-size:30px",
      "line-height:44px", "cursor:pointer"
    ].join(";");

    close.onclick = closePvVideo;
    panel.append(video, close);
    modal.appendChild(panel);
    modal.addEventListener("click", e => { if (e.target === modal) closePvVideo(); });
    document.body.appendChild(modal);
  }

  modal.style.display = "flex";
  const video = document.getElementById("pvVideoPlayer");
  video.currentTime = 0;
  video.play().catch(() => {});
}

function closePvVideo() {
  const modal = document.getElementById("pvVideoModal");
  const video = document.getElementById("pvVideoPlayer");
  if (video) {
    video.pause();
    video.currentTime = 0;
  }
  if (modal) modal.style.display = "none";
}

function getMainLocationScreenPoint(location) {
  const sx = canvas.width / Math.max(view.w, 1e-12);
  const sy = canvas.height / Math.max(view.h, 1e-12);
  return {
    x: (location.lon - view.x) * sx,
    y: (-location.lat - view.y) * sy
  };
}

function drawMainLocations() {
  if (!MAIN_LOCATIONS.length) return;

  // Match the exact pixel transform used by draw().
  // canvas.width/height include devicePixelRatio, while clientWidth/height do not.
  const sx = canvas.width / Math.max(view.w, 1e-12);
  const sy = canvas.height / Math.max(view.h, 1e-12);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  for (const location of MAIN_LOCATIONS) {
    const x = (location.lon - view.x) * sx;
    const y = (-location.lat - view.y) * sy;

    // Keep markers visible at every zoom level.
    const radius = 7;
    const labelX = x + 11;
    const labelY = y - 11;

    // Marker shadow.
    ctx.beginPath();
    ctx.arc(x + 1, y + 2, radius + 1, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fill();

    // Main location marker.
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#0b6e99";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();

    // Centre dot.
    ctx.beginPath();
    ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    // PV video icon. This is the only main location with an action for now.
    if (location.name === "PV") {
      const r2 = 11;
      ctx.beginPath();
      ctx.arc(x, y, r2, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#0b6e99";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x - 4, y - 6);
      ctx.lineTo(x + 6, y);
      ctx.lineTo(x - 4, y + 6);
      ctx.closePath();
      ctx.fillStyle = "#0b6e99";
      ctx.fill();
    }

    // Location label.
    ctx.font = "600 12px Arial, sans-serif";
    const textWidth = ctx.measureText(location.name).width;
    const boxW = textWidth + 14;
    const boxH = 22;
    const boxX = labelX;
    const boxY = labelY - boxH / 2;

    ctx.beginPath();
    const r = 7;
    ctx.roundRect(boxX, boxY, boxW, boxH, r);
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    ctx.fill();
    ctx.strokeStyle = "rgba(20,55,70,0.20)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#17323d";
    ctx.textBaseline = "middle";
    ctx.fillText(location.name, boxX + 7, labelY);
  }

  ctx.restore();
}

function drawGps() {
  if (!gpsFix) return;

  const lon = gpsFix.longitude;
  const y = -gpsFix.latitude;

  // Draw the GPS marker in the SAME coordinate system as the KML.
  // Therefore it automatically follows zoom, pan and fit operations.
  const scaleX = canvas.clientWidth / view.w;
  const scaleY = canvas.clientHeight / view.h;

  const accuracyM = Math.max(3, gpsFix.accuracy || 10);
  const metersPerDegLat = 111320;
  const cosLat = Math.max(0.25, Math.cos(gpsFix.latitude * Math.PI / 180));
  const rx = (accuracyM / (metersPerDegLat * cosLat));
  const ry = accuracyM / metersPerDegLat;

  ctx.save();

  // Accuracy circle
  ctx.beginPath();
  ctx.ellipse(lon, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(34,197,94,0.16)";
  ctx.fill();
  ctx.strokeStyle = "rgba(34,197,94,0.45)";
  ctx.lineWidth = 1 / Math.max(scaleX, 1);
  ctx.stroke();

  // Outer pulse ring (kept map-locked)
  const markerDataRadius = 10 / Math.max(scaleX, 1);
  ctx.beginPath();
  ctx.arc(lon, y, markerDataRadius, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(23,108,255,0.18)";
  ctx.fill();

  // Core
  const coreRadius = 5 / Math.max(scaleX, 1);
  ctx.beginPath();
  ctx.arc(lon, y, coreRadius, 0, Math.PI * 2);
  ctx.fillStyle = "#22c55e";
  ctx.fill();
  ctx.lineWidth = 2 / Math.max(scaleX, 1);
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();

  ctx.restore();
}

function draw() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#e8ede9";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const sx = (width * dpr) / view.w;
  const sy = (height * dpr) / view.h;

  // One transform for the complete KML geometry.
  ctx.setTransform(
    sx, 0, 0, sy,
    -view.x * sx,
    -view.y * sy
  );

  for (const item of paths) {
    if (item.type === "poly") {
      ctx.fillStyle = "rgba(22,119,165,0.075)";
      ctx.strokeStyle = "#1677a5";
      ctx.lineWidth = 1.1 / Math.max(sx, 1);
      ctx.fill(item.path);
      ctx.stroke(item.path);
    } else {
      ctx.fillStyle = "transparent";
      ctx.strokeStyle = "#1677a5";
      ctx.globalAlpha = 0.82;
      ctx.lineWidth = 1.4 / Math.max(sx, 1);
      ctx.stroke(item.path);
      ctx.globalAlpha = 1;
    }
  }

  drawMainLocations();
  drawGps();

  countEl.textContent = `${EMBEDDED_KML.length.toLocaleString()} features`;
  lastDrawTime = performance.now();
}

function initialize() {
  if (!Array.isArray(EMBEDDED_KML) || !EMBEDDED_KML.length) {
    statusEl.textContent = "No KML geometry found";
    return;
  }

  if (!buildPathsAndBounds()) return;

  fitAll();
  statusEl.textContent = "Full project layout loaded";
  requestAnimationFrame(resizeCanvas);
}

function handleGpsPosition(position) {
  const c = position.coords;
  const accuracy = Number.isFinite(c.accuracy) ? c.accuracy : 9999;

  // Ignore very poor fixes rather than moving the marker to an obviously
  // unreliable network/IP location.
  if (accuracy > 150) {
    statusEl.textContent = `Waiting for accurate GPS fix • ±${Math.round(accuracy)} m`;
    return;
  }

  gpsFix = {
    latitude: c.latitude,
    longitude: c.longitude,
    accuracy,
    timestamp: position.timestamp || Date.now()
  };

  // First acceptable fix: center once. Later fixes never force the map to move.
  if (firstGpsFix) {
    firstGpsFix = false;
    setViewAround(gpsFix.longitude, -gpsFix.latitude);
  } else {
    draw();
  }

  const inside =
    gpsFix.longitude >= base.minX &&
    gpsFix.longitude <= base.maxX &&
    (-gpsFix.latitude) >= base.minY &&
    (-gpsFix.latitude) <= base.maxY;

  statusEl.textContent =
    `GPS active • ${gpsFix.latitude.toFixed(6)}, ${gpsFix.longitude.toFixed(6)} • ±${Math.round(gpsFix.accuracy)} m`;

  if (!inside) {
    showMessage("GPS position is outside the project layout.");
  }
}

function handleGpsError(error) {
  if (error.code === 1) {
    statusEl.textContent = "Location permission denied";
    showMessage("Allow location access for this page, then press Current Location again.");
  } else if (error.code === 2) {
    statusEl.textContent = "Waiting for GPS position…";
  } else if (error.code === 3) {
    statusEl.textContent = "Waiting for GPS fix…";
  } else {
    statusEl.textContent = "GPS unavailable";
  }
}

function startGps() {
  if (!navigator.geolocation) {
    showMessage("GPS is not supported by this browser.");
    return;
  }

  if (gpsActive) {
    statusEl.textContent = gpsFix
      ? `GPS active • ±${Math.round(gpsFix.accuracy)} m`
      : "Waiting for GPS fix…";
    return;
  }

  gpsActive = true;
  firstGpsFix = true;
  statusEl.textContent = "Requesting GPS permission…";

  // One permission request, then continuous device GPS updates.
  gpsWatchId = navigator.geolocation.watchPosition(
    handleGpsPosition,
    handleGpsError,
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 30000
    }
  );
}

document.getElementById("zoomIn").onclick = () => zoom(0.75);
document.getElementById("zoomOut").onclick = () => zoom(1.333333);
document.getElementById("fitAll").onclick = () => {
  fitAll();
};

document.getElementById("locate").onclick = startGps;

canvas.addEventListener("pointerdown", e => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.classList.add("dragging");
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", e => {
  if (!dragging) return;
  const dx = (e.clientX - lastX) * view.w / Math.max(canvas.clientWidth, 1);
  const dy = (e.clientY - lastY) * view.h / Math.max(canvas.clientHeight, 1);
  pan(-dx, -dy);
  lastX = e.clientX;
  lastY = e.clientY;
});

canvas.addEventListener("pointerup", e => {
  dragging = false;
  canvas.classList.remove("dragging");
  try { canvas.releasePointerCapture(e.pointerId); } catch {}
});

canvas.addEventListener("pointercancel", () => {
  dragging = false;
  canvas.classList.remove("dragging");
});

canvas.addEventListener("click", e => {
  // Convert the click to the same device-pixel coordinate system used by the markers.
  const rect = canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) * canvas.width / Math.max(rect.width, 1);
  const py = (e.clientY - rect.top) * canvas.height / Math.max(rect.height, 1);
  const pv = MAIN_LOCATIONS.find(location => location.name === "PV");
  if (!pv) return;

  const point = getMainLocationScreenPoint(pv);
  const hitRadius = 20 * Math.min(canvas.width / Math.max(rect.width, 1), canvas.height / Math.max(rect.height, 1));
  if (Math.hypot(px - point.x, py - point.y) <= hitRadius) {
    openPvVideo();
  }
});

canvas.addEventListener("wheel", e => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const cx = view.x + (e.clientX - rect.left) / rect.width * view.w;
  const cy = view.y + (e.clientY - rect.top) / rect.height * view.h;
  zoom(e.deltaY < 0 ? 0.85 : 1.17647, cx, cy);
}, { passive: false });

window.addEventListener("resize", resizeCanvas);

// Redraw the current GPS fix every second without requesting GPS again.
// Actual GPS updates are delivered by watchPosition() whenever the device
// obtains a new fix.
setInterval(() => {
  if (gpsFix) draw();
}, 1000);
function offlineView() {
  const sppc = 'my-site-v1';

const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/layout.html',
  '/kml-data.js',
  '/layout.html',
  '/layout.js',
  '/styles.css',
  '/Videos/PV.mp4',
  '/Videos/0.1.mp4',
  'videos/VIDEO-001.mp4'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(sppc)
      .then(cache => cache.addAll(FILES_TO_CACHE))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
}
initialize();
offlineView();
