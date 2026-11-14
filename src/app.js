"use strict";
/* PhotoView - Galeria · https://github.com/LuccaBueno/photoview */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const TS = [0, 64, 92, 124, 164, 220];
const state = {
  photos: [], byId: new Map(), V: [], moments: [], trips: [], sample: true, view: "linha", nextId: 1,
  filter: { type: "", place: "", cam: "", from: "", to: "", noGps: false, est: false, noExif: false, dups: false },
  selecting: false, sel: new Set(),
  group: LS.get("pv-grupo", "dia"), size: LS.get("pv-tamanho", 3), order: LS.get("pv-ordem", "desc")
};

/* ---------- formatos ---------- */
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const fMonth = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const fMonthOnly = new Intl.DateTimeFormat("pt-BR", { month: "long" });
const fLong = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fDayHead = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "short" });
const fTime = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const fDay = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" });
const fFull = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fNum = new Intl.NumberFormat("pt-BR");
const dShort = d => `${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}`;
function dRange(a, b) {
  if (a.toDateString() === b.toDateString()) return dShort(a);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ${MES[a.getMonth()]} ${a.getFullYear()}`;
  if (a.getFullYear() === b.getFullYear()) return `${a.getDate()} ${MES[a.getMonth()]} – ${b.getDate()} ${MES[b.getMonth()]} ${a.getFullYear()}`;
  return `${dShort(a)} – ${dShort(b)}`;
}
const PER = h => h < 6 ? "madrugada" : h < 12 ? "manhã" : h < 18 ? "tarde" : "noite";
const stamp = d => d ? `'${String(d.getFullYear()).slice(2)} ${String(d.getMonth() + 1).padStart(2, " ")} ${String(d.getDate()).padStart(2, " ")}` : "";
const fmtSize = b => b >= 1073741824 ? (b / 1073741824).toFixed(2).replace(".", ",") + " GB" : b > 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.round(b / 1024) + " KB";
const fmtDur = s => s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "";
const fmtK = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".", ",") + " mil" : String(n);
const fmtETA = ms => { const s = ms / 1000; if (s < 60) return "menos de 1 min"; if (s < 3600) return `${Math.round(s / 60)} min`; const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return `${h} h${m ? " " + m + " min" : ""}`; };
const toLocalInput = d => new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const plural = (n, a, b) => `${fNum.format(n)} ${n === 1 ? a : b}`;
const joinPt = a => a.length <= 1 ? (a[0] || "") : a.slice(0, -1).join(", ") + " e " + a[a.length - 1];
const dayKey = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const dayNum = d => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
const norm = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function pickEven(arr, k) {
  if (arr.length <= k) return arr.slice();
  const out = []; for (let i = 0; i < k; i++) out.push(arr[Math.floor((i + .5) * arr.length / k)]); return out;
}
const hav = (a, b, c, d) => { const r = Math.PI / 180, dLa = (c - a) * r, dLo = (d - b) * r;
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLo / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };

/* ---------- geografia: países e cidades ---------- */
const DN = (() => { try { return new Intl.DisplayNames(["pt-BR"], { type: "region" }); } catch (e) { return null; } })();
const ccName = cc => { if (!cc) return null; try { return DN ? DN.of(cc) : cc; } catch (e) { return cc; } };
const UF = { "01": "AC", "02": "AL", "03": "AP", "04": "AM", "05": "BA", "06": "CE", "07": "DF", "08": "ES", "11": "MS", "13": "MA", "14": "MT", "15": "MG", "16": "PA", "17": "PB", "18": "PR", "20": "PI", "21": "RJ", "22": "RN", "23": "RS", "24": "RO", "25": "RR", "26": "SC", "27": "SP", "28": "SE", "29": "GO", "30": "PE", "31": "TO" };
let countries = [], landFC = null, CLBL = [];
const readJSON = id => { try { return JSON.parse(document.getElementById(id).textContent); } catch (e) { return null; } };
const NUM2A2 = readJSON("num-data") || {};
const CDB = readJSON("cities-data") || [];   // [nome, país, uf, população, lat, lon, nomeOriginal?] em ordem de população
const CGRID = new Map();
CDB.forEach((c, i) => { const k = Math.floor(c[4]) * 1000 + Math.floor(c[5]); let a = CGRID.get(k); if (!a) CGRID.set(k, a = []); a.push(i); });
try {
  const world = readJSON("world-data");
  countries = topojson.feature(world, world.objects.countries).features.filter(f => f.id !== "010");
  for (const f of countries) { f.a2 = NUM2A2[f.id] || null; f.pt = ccName(f.a2) || f.properties.name; }
  landFC = { type: "FeatureCollection", features: countries };
  CLBL = countries.map(f => {
    const polys = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates.map(c => ({ type: "Polygon", coordinates: c })) : [f.geometry];
    let big = polys[0], ba = 0; for (const p of polys) { const a = d3.geoArea(p); if (a > ba) { ba = a; big = p; } }
    const [lon, lat] = d3.geoCentroid(big), b = d3.geoBounds(big);
    return { name: f.pt, lat, lon, b };
  }).filter(c => c.name && isFinite(c.lat));
} catch (e) { console.warn("Mapa simples indisponível", e); }

function nearestCity(lat, lon) {
  const la = Math.floor(lat), lo = Math.floor(lon); let best = null, bs = -1, bd = 0, near = null, nd = 1e9;
  for (let a = la - 1; a <= la + 1; a++) for (let b = lo - 1; b <= lo + 1; b++) {
    const arr = CGRID.get(a * 1000 + b); if (!arr) continue;
    for (const i of arr) { const c = CDB[i], d = hav(lat, lon, c[4], c[5]); if (d < nd) { nd = d; near = c; }
      if (d < 25) { const s = c[3] / ((d + 2) * (d + 2)); if (s > bs) { bs = s; best = c; bd = d; } } }
  }
  if (best) return { c: best, d: bd };
  return near ? { c: near, d: nd } : null;
}
const placeCache = new Map();
function placeOf(lat, lon) {
  const key = lat.toFixed(3) + "," + lon.toFixed(3);
  if (placeCache.has(key)) return placeCache.get(key);
  const n = nearestCity(lat, lon);
  let cc = n && n.d < 150 ? n.c[1] : null;
  if (!cc && typeof d3 !== "undefined") for (const f of countries) if (d3.geoContains(f, [lon, lat])) { cc = f.a2; break; }
  const country = ccName(cc), uf = cc === "BR" && n ? UF[n.c[2]] : null;
  const tail = uf ? ", " + uf : country ? ", " + country : "";
  let city = null, label;
  if (n && n.d < 25) { city = n.c[0]; label = city + tail; }
  else if (n && n.d < 70) label = "perto de " + n.c[0] + tail;
  else label = country || `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
  const r = { label, city, country, cc, uf, clat: n ? n.c[4] : lat, clon: n ? n.c[5] : lon };
  placeCache.set(key, r); return r;
}
function loc(p) {
  if (p.lat != null) return { lat: p.lat, lon: p.lon, place: p.place, est: false };
  if (p.est) return { lat: p.est.lat, lon: p.est.lon, place: p.est.place, est: true };
  return null;
}
const placeName = l => l ? (l.place.city || l.place.label) : null;
const camName = p => p.video && !p.model ? "Vídeo (sem modelo)" : p.model ? (p.make && !p.model.toLowerCase().startsWith(p.make.toLowerCase().split(" ")[0]) ? `${p.make} ${p.model}` : p.model) : "Desconhecida";

/* ---------- ajustes de data salvos ---------- */
const ADJ_KEY = "photoview-ajustes";
let adj = LS.get(ADJ_KEY, {}) || {};
const saveAdj = () => LS.set(ADJ_KEY, adj);
const adjKey = p => p.path + "|" + p.size;

/* ---------- fotos de exemplo ---------- */
const SAMPLE_CITIES = { "Pindamonhangaba": [-22.9246, -45.4613, "cidade"], "Taubaté": [-23.0264, -45.5553, "cidade"], "Campos do Jordão": [-22.7396, -45.5912, "serra"],
  "Ubatuba": [-23.4336, -45.0838, "mar"], "Paraty": [-23.2178, -44.7131, "mar"], "São Luiz do Paraitinga": [-23.2219, -45.3103, "campo"], "Rio de Janeiro": [-22.9068, -43.1729, "mar"],
  "Foz do Iguaçu": [-25.5163, -54.5854, "campo"], "Buenos Aires": [-34.6037, -58.3816, "cidade"], "Florianópolis": [-27.5954, -48.548, "mar"], "São Paulo": [-23.5505, -46.6333, "cidade"],
  "Lisboa": [38.7223, -9.1393, "cidade"], "Porto": [41.1579, -8.6291, "cidade"], "Ilhabela": [-23.7781, -45.3581, "mar"], "Roma": [41.8902, 12.4922, "cidade"], "Florença": [43.7696, 11.2558, "cidade"], "Veneza": [45.4371, 12.3326, "mar"] };
function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
function drawScene(type, hour, seed, W, H) {
  const R = rng(seed), cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  const night = hour < 6 || hour >= 19, gold = (hour >= 17 && hour < 19) || (hour >= 6 && hour < 8);
  const sky = g.createLinearGradient(0, 0, 0, H * .7);
  if (night) { sky.addColorStop(0, "#0b1430"); sky.addColorStop(1, "#2a2f5a"); }
  else if (gold) { sky.addColorStop(0, "#5b7cc4"); sky.addColorStop(.6, "#f2a46b"); sky.addColorStop(1, "#f7d29a"); }
  else { sky.addColorStop(0, "#3f86d6"); sky.addColorStop(1, "#bfe0f6"); }
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  if (type === "tela") {
    g.fillStyle = "#f4f6fa"; g.fillRect(W * .3, 0, W * .4, H);
    for (let i = 0; i < 9; i++) { g.fillStyle = i % 3 ? "#dfe5ee" : "#4f86d9"; g.fillRect(W * .33, 20 + i * 50, W * (.18 + R() * .16), 30); }
    return new Promise(res => cv.toBlob(b => res(URL.createObjectURL(b)), "image/jpeg", .82));
  }
  g.fillStyle = night ? "#f3f1e2" : gold ? "#ffd27a" : "#fff7d6";
  g.beginPath(); g.arc(W * (.2 + R() * .6), H * (gold ? .5 : .18 + R() * .1), night ? 22 : 34, 0, 7); g.fill();
  if (night) for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,255,${.3 + R() * .6})`; g.fillRect(R() * W, R() * H * .6, 2, 2); }
  else for (let i = 0; i < 4; i++) { g.fillStyle = "rgba(255,255,255,.75)"; const cx = R() * W, cy = H * (.1 + R() * .25);
    for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(cx + k * 26, cy + (k % 2) * 6, 34, 16, 0, 0, 7); g.fill(); } }
  if (type === "mar") {
    const hz = H * .58, sea = g.createLinearGradient(0, hz, 0, H);
    sea.addColorStop(0, night ? "#1a2550" : gold ? "#c98a6e" : "#2a78b8"); sea.addColorStop(1, night ? "#0d1430" : "#1d5d94");
    g.fillStyle = sea; g.fillRect(0, hz, W, H - hz);
    g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 2;
    for (let i = 0; i < 18; i++) { const y = hz + 8 + R() * (H * .25), x = R() * W; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 30 + R() * 50, y); g.stroke(); }
    g.fillStyle = night ? "rgba(10,14,30,.9)" : "#3d6b3a"; g.beginPath(); g.moveTo(0, hz); g.quadraticCurveTo(W * .15, hz - 70 - R() * 50, W * .35, hz); g.fill();
    g.fillStyle = night ? "#2b2a3a" : "#e9d3a3"; g.beginPath(); g.moveTo(0, H); g.lineTo(0, H * .86); g.quadraticCurveTo(W * .5, H * .78, W, H * .9); g.lineTo(W, H); g.fill();
  } else if (type === "serra") {
    (night ? ["#1c2440", "#151b33", "#0e1326"] : ["#7e9cb8", "#4f7a5a", "#2f5a3c"]).forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.moveTo(0, H);
      g.lineTo(0, H * (.45 + i * .1)); for (let x = 0; x <= W; x += W / 8) g.lineTo(x, H * (.38 + i * .12) + (R() - .5) * 70); g.lineTo(W, H); g.fill(); });
    for (let i = 0; i < 9; i++) { const x = R() * W, base = H * (.8 + R() * .15), h = 70 + R() * 70;
      g.fillStyle = night ? "#05070f" : "#1f3a28"; g.fillRect(x - 2, base - h, 4, h);
      for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(x, base - h + k * 9, 30 - k * 6, 8, 0, 0, 7); g.fill(); } }
  } else if (type === "cidade") {
    let x = 0; while (x < W) { const bw = 40 + R() * 70, bh = H * (.25 + R() * .45);
      g.fillStyle = night ? "#141a30" : ["#8e9bb0", "#a7b2c2", "#6f7d96", "#c4b8a6"][Math.floor(R() * 4)];
      g.fillRect(x, H - bh, bw - 4, bh);
      for (let wy = H - bh + 10; wy < H - 14; wy += 16) for (let wx = x + 6; wx < x + bw - 12; wx += 12)
        if (R() > (night ? .55 : .3)) { g.fillStyle = night ? "#ffd773" : "rgba(30,50,80,.45)"; g.fillRect(wx, wy, 6, 8); }
      x += bw; }
  } else {
    (night ? ["#1a2a24", "#0f1a16"] : ["#8fbf5a", "#5d9a3f"]).forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += 20) g.lineTo(x, H * (.6 + i * .12) + Math.sin(x / 90 + seed + i) * 26); g.lineTo(W, H); g.fill(); });
  }
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (R() - .5) * 18; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
  return new Promise(res => cv.toBlob(b => res(URL.createObjectURL(b)), "image/jpeg", .82));
}
async function loadSamples() {
  const EV = [["2019-02-16", "Ubatuba", 6], ["2019-07-13", "Campos do Jordão", 7], ["2019-11-07", "Pindamonhangaba", 3], ["2020-01-04", "Paraty", 6], ["2020-01-05", "Paraty", 4],
    ["2020-08-22", "São Luiz do Paraitinga", 4], ["2021-04-03", "Taubaté", 3], ["2021-11-10", "Pindamonhangaba", 4], ["2022-01-15", "Rio de Janeiro", 7], ["2022-01-15", null, 2],
    ["2022-07-09", "Foz do Iguaçu", 6], ["2022-07-11", "Buenos Aires", 5], ["2022-07-12", "Buenos Aires", 4], ["2023-02-18", "Florianópolis", 6], ["2023-02-18", null, 2],
    ["2023-05-20", "Pindamonhangaba", 3], ["2023-11-07", "São Paulo", 4], ["2024-03-02", "Taubaté", 4], ["2024-08-10", "Pindamonhangaba", 3], ["2024-12-21", "Ubatuba", 5],
    ["2025-06-14", "Campos do Jordão", 5], ["2025-09-20", "Lisboa", 6], ["2025-09-21", "Lisboa", 4], ["2025-09-23", "Porto", 5], ["2025-10-18", "Pindamonhangaba", 3],
    ["2026-01-04", "Roma", 8], ["2026-01-05", "Roma", 6], ["2026-01-07", "Florença", 6], ["2026-01-09", "Veneza", 7], ["2026-01-09", null, 2],
    ["2026-04-05", "Pindamonhangaba", 4], ["2026-10-10", "Ilhabela", 4], ["2020-05-09", null, 2], ["2021-09-18", null, 2], ["2025-01-25", null, 1]];
  const R = rng(42), list = [];
  for (const [ds, place, n] of EV) {
    const city = place && SAMPLE_CITIES[place], [y, m, d] = ds.split("-").map(Number);
    let hour = 9 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) {
      hour = Math.min(21, hour + Math.floor(R() * 2)); const min = Math.floor(R() * 60);
      const date = new Date(y, m - 1, d, hour, min, Math.floor(R() * 60));
      const cam = y < 2022 ? ["Motorola", "moto g(8)"] : y < 2025 ? ["Samsung", "Galaxy A52"] : ["Samsung", "Galaxy M54 5G"];
      const stampN = `${ds.replace(/-/g, "")}_${String(hour).padStart(2, "0")}${String(min).padStart(2, "0")}${String(i).padStart(2, "0")}`;
      const name = city ? `${stampN}.jpg` : `Screenshot_${stampN}.jpg`;
      const p = { id: state.nextId++, name, path: (city ? "Celular/DCIM/Camera/" : "Celular/Pictures/Screenshots/") + name,
        size: 2100000 + Math.floor(R() * 2600000), date, origDate: date, exifDate: !!city,
        dateSource: city ? "EXIF da câmera" : "nome do arquivo", make: city ? cam[0] : null, model: city ? cam[1] : null, w: city ? 4000 : 1080, h: city ? 3000 : 2400,
        exp: city ? { t: 1 / (60 + Math.floor(R() * 900)), f: [1.8, 2.2, 2.8][Math.floor(R() * 3)], iso: [50, 100, 200, 400][Math.floor(R() * 4)], fl: 4.7 } : {},
        sample: true, type: city ? city[2] : "tela", hour, seed: Math.floor(R() * 1e6), viewable: true };
      if (city) { p.lat = city[0] + (R() - .5) * .03; p.lon = city[1] + (R() - .5) * .03; p.place = placeOf(p.lat, p.lon); }
      list.push(p);
    }
  }
  for (const k of [2, 9, 30, 31, 55]) { const o = list[k]; if (o) list.push({ ...o, id: state.nextId++, path: `HD Backup/${o.date.getFullYear()}/${o.name}`, copyOf: o }); }
  for (const p of list) { state.photos.push(p); state.byId.set(p.id, p); }
  derive(); renderAll();
  for (const p of list) {
    if (p.copyOf || !state.sample) continue;
    p.thumb = await drawScene(p.type, p.hour, p.seed, p.type === "tela" ? 360 : 640, p.type === "tela" ? 640 : 480); p.full = p.thumb; updateThumb(p);
  }
  for (const p of list) if (p.copyOf) { p.thumb = p.copyOf.thumb; p.full = p.copyOf.full; }
  if (state.view === "viagem") Trip.show(Trip.i, true);
}

/* ---------- leitura de arquivos ---------- */
const IMG_EXT = /\.(jpe?g|png|heic|heif|webp|tiff?|gif|avif|dng)$/i;
const VID_EXT = /\.(mp4|mov|m4v|3gp|webm|mkv|avi)$/i;
const isVideo = f => (f.type && f.type.startsWith("video/")) || VID_EXT.test(f.name);
const isMedia = f => (f.type && (f.type.startsWith("image/") || f.type.startsWith("video/"))) || IMG_EXT.test(f.name) || VID_EXT.test(f.name);
const pathOf = new WeakMap();
const fpath = f => pathOf.get(f) || f.webkitRelativePath || f.name;

function dateFromName(n) {
  const m = n.match(/(19\d{2}|20\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])(?:[-_ T]?([01]\d|2[0-3])[-_.:h]?([0-5]\d)[-_.:m]?([0-5]\d)?)?/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0), +(m[6] || 0));
  return isNaN(d) ? null : d;
}
async function readMp4(file) {
  let off = 0, guard = 0;
  while (off + 8 <= file.size && guard++ < 64) {
    const h = new DataView(await file.slice(off, off + 16).arrayBuffer());
    let size = h.getUint32(0); const type = String.fromCharCode(h.getUint8(4), h.getUint8(5), h.getUint8(6), h.getUint8(7));
    if (size === 1) size = Number(h.getBigUint64(8)); else if (size === 0) size = file.size - off;
    if (size < 8) break;
    if (type === "moov") {
      const buf = new Uint8Array(await file.slice(off, off + Math.min(size, 32 * 1048576)).arrayBuffer());
      const dv = new DataView(buf.buffer), out = {};
      let mv = -1; for (let i = 0; i < buf.length - 4; i++) if (buf[i] === 0x6d && buf[i + 1] === 0x76 && buf[i + 2] === 0x68 && buf[i + 3] === 0x64) { mv = i; break; }
      if (mv > 0) {
        const v = buf[mv + 4]; let ct, ts, du;
        if (v === 1) { ct = Number(dv.getBigUint64(mv + 8)); ts = dv.getUint32(mv + 24); du = Number(dv.getBigUint64(mv + 28)); }
        else { ct = dv.getUint32(mv + 8); ts = dv.getUint32(mv + 16); du = dv.getUint32(mv + 20); }
        if (ct > 2082844800) { const d = new Date((ct - 2082844800) * 1000); if (d.getFullYear() > 1995 && d < new Date(Date.now() + 864e5)) out.date = d; }
        if (ts) out.dur = du / ts;
      }
      const text = new TextDecoder("latin1").decode(buf);
      const g = text.match(/([+-]\d{1,2}\.\d{3,})([+-]\d{1,3}\.\d{3,})/);
      if (g) { const la = parseFloat(g[1]), lo = parseFloat(g[2]); if (Math.abs(la) <= 90 && Math.abs(lo) <= 180 && !(la === 0 && lo === 0)) { out.lat = la; out.lon = lo; } }
      const mk = text.match(/com\.apple\.quicktime\.model[\s\S]{0,400}?data[\s\S]{8}([ -~]{3,40})/);
      if (mk) out.model = mk[1].trim();
      return out;
    }
    off += size;
  }
  return {};
}
async function rotateBlob(blob, rot) {
  const bmp = await createImageBitmap(blob), sw = rot === 6 || rot === 8;
  const cv = document.createElement("canvas"); cv.width = sw ? bmp.height : bmp.width; cv.height = sw ? bmp.width : bmp.height;
  const g = cv.getContext("2d"); g.translate(cv.width / 2, cv.height / 2);
  g.rotate(rot === 3 ? Math.PI : rot === 6 ? Math.PI / 2 : -Math.PI / 2);
  g.drawImage(bmp, -bmp.width / 2, -bmp.height / 2); bmp.close && bmp.close();
  return new Promise(r => cv.toBlob(r, "image/jpeg", .82));
}
async function readMedia(file) {
  const p = { id: state.nextId++, name: file.name, path: fpath(file), size: file.size, file, exp: {} };
  let date = null, src = null;
  if (isVideo(file)) {
    p.video = true; p.viewable = true; p.needThumb = true;
    let mv = {}; try { mv = await readMp4(file); } catch (e) {}
    if (mv.date) { date = mv.date; src = "metadados do vídeo"; }
    if (mv.dur) p.dur = mv.dur;
    if (mv.model) p.model = mv.model;
    if (mv.lat != null) { p.lat = mv.lat; p.lon = mv.lon; }
  } else {
    let m = {};
    try { m = await exifr.parse(file, { tiff: true, exif: true, gps: true, xmp: false, iptc: false, icc: false, jfif: false, ihdr: false, interop: false, translateValues: false }) || {}; } catch (e) {}
    const ed = m.DateTimeOriginal || m.CreateDate || m.DateTimeDigitized;
    if (ed instanceof Date && !isNaN(ed) && ed.getFullYear() >= 1980) { date = ed; src = "EXIF da câmera"; }
    p.make = m.Make; p.model = m.Model; p.lens = m.LensModel;
    p.exp = { t: m.ExposureTime, f: m.FNumber, iso: m.ISO, fl: m.FocalLength };
    p.w = m.ExifImageWidth; p.h = m.ExifImageHeight;
    const lat = m.latitude, lon = m.longitude;
    if (Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0) && Math.abs(lat) <= 90) { p.lat = lat; p.lon = lon; p.alt = m.GPSAltitude; }
    p.viewable = !/\.(heic|heif|dng|tiff?)$/i.test(file.name);
    const rot = [3, 6, 8].includes(+m.Orientation) ? +m.Orientation : 0;
    try {
      const tb = await exifr.thumbnail(file);
      if (tb && tb.byteLength > 1500) {
        let blob = new Blob([tb], { type: "image/jpeg" });
        if (rot) { try { blob = await rotateBlob(blob, rot) || blob; } catch (e) {} }
        p.thumb = URL.createObjectURL(blob);
      }
    } catch (e) {}
    if (!p.thumb) p.needThumb = true;
  }
  if (!date) { date = dateFromName(file.name); if (date) src = "nome do arquivo"; }
  if (!date) { date = new Date(file.lastModified); src = "data de modificação do arquivo"; }
  p.date = date; p.origDate = date; p.dateSource = src; p.exifDate = src === "EXIF da câmera" || src === "metadados do vídeo";
  if (p.lat != null) p.place = placeOf(p.lat, p.lon);
  const a = adj[adjKey(p)]; if (a != null) { p.date = new Date(a); p.edited = true; }
  return p;
}
async function makeThumb(file) {
  if (isVideo(file)) return makeVideoThumb(file);
  try {
    const bmp = await createImageBitmap(file, { resizeWidth: 320, resizeQuality: "low", imageOrientation: "from-image" });
    const cv = document.createElement("canvas"); cv.width = bmp.width; cv.height = bmp.height;
    cv.getContext("2d").drawImage(bmp, 0, 0); bmp.close && bmp.close();
    const blob = await new Promise(r => cv.toBlob(r, "image/jpeg", .78));
    return { thumb: URL.createObjectURL(blob), viewable: true };
  } catch (e) {}
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const s = Math.min(1, 420 / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement("canvas"); cv.width = Math.round(img.naturalWidth * s); cv.height = Math.round(img.naturalHeight * s);
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    const blob = await new Promise(r => cv.toBlob(r, "image/jpeg", .8));
    return { thumb: URL.createObjectURL(blob), viewable: true };
  } catch (e) {
    try { const t = await exifr.thumbnailUrl(file); if (t) return { thumb: t, viewable: false }; } catch (_) {}
    return { thumb: null, viewable: false };
  } finally { URL.revokeObjectURL(url); }
}
async function makeVideoThumb(file) {
  const url = URL.createObjectURL(file), v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
  try {
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = rej; setTimeout(() => rej(new Error("tempo")), 10000); });
    await new Promise((res, rej) => { v.onseeked = res; v.onerror = rej; v.currentTime = Math.min(1, (v.duration || 2) / 3); setTimeout(res, 3000); });
    const s = Math.min(1, 320 / Math.max(v.videoWidth, v.videoHeight));
    const cv = document.createElement("canvas"); cv.width = Math.round(v.videoWidth * s); cv.height = Math.round(v.videoHeight * s);
    cv.getContext("2d").drawImage(v, 0, 0, cv.width, cv.height);
    const blob = await new Promise(r => cv.toBlob(r, "image/jpeg", .78));
    return { thumb: blob ? URL.createObjectURL(blob) : null, viewable: true, dur: v.duration };
  } catch (e) { return { thumb: null, viewable: false }; }
  finally { v.removeAttribute("src"); v.load(); URL.revokeObjectURL(url); }
}
const ThumbQ = {
  stack: [], busy: 0,
  push(id) { this.stack.push(id); this.run(); },
  run() {
    while (this.busy < 3 && this.stack.length) {
      const p = state.byId.get(this.stack.pop());
      if (!p || p.thumb || p.loading || !p.file) continue;
      p.loading = true; this.busy++;
      makeThumb(p.file).then(t => {
        p.loading = false; p.needThumb = false;
        if (t.dur && !p.dur) p.dur = t.dur;
        if (t.thumb) { p.thumb = t.thumb; if (t.viewable === false && !p.video) p.viewable = false; updateThumb(p); }
        else { if (!p.video) p.viewable = false; document.querySelectorAll(`[data-ph="${p.id}"]`).forEach(s => { s.classList.add("fail"); s.textContent = p.video ? "vídeo" : "sem prévia"; }); }
      }).finally(() => { this.busy--; this.run(); });
    }
  }
};
const thumbIO = "IntersectionObserver" in window ? new IntersectionObserver(es => {
  for (const e of es) if (e.isIntersecting) { thumbIO.unobserve(e.target); ThumbQ.push(+e.target.dataset.ph); }
}, { rootMargin: "800px 0px" }) : null;
function observeThumbs() {
  document.querySelectorAll("[data-ph]").forEach(el => {
    const p = state.byId.get(+el.dataset.ph); if (!p || !p.needThumb) return;
    if (thumbIO) thumbIO.observe(el); else ThumbQ.push(p.id);
  });
}
function clearAll() {
  ThumbQ.stack = [];
  const seen = new Set();
  for (const p of state.photos) if (p.thumb && !seen.has(p.thumb)) { seen.add(p.thumb); URL.revokeObjectURL(p.thumb); }
  state.photos = []; state.byId.clear(); placeCache.clear(); state.sel.clear();
}
async function importFiles(files) {
  files = files.filter(isMedia);
  if (!files.length) { toast("Nenhuma foto ou vídeo encontrado nos arquivos escolhidos."); return; }
  if (state.sample) { Trip.stop(); clearAll(); state.sample = false; $("#notice").hidden = true; $("#btnClear").hidden = false; }
  const seen = new Set(state.photos.map(p => p.path + "|" + p.size));
  let done = 0, skip = 0; const total = files.length, queue = files.slice();
  $("#progress").hidden = false;
  const upd = () => { $("#progressText").textContent = `Lendo ${fNum.format(done + skip)} de ${fNum.format(total)} arquivos…`; $("#progressBar").style.width = ((done + skip) / total * 100) + "%"; };
  upd(); let lastRender = performance.now(), firstShown = false;
  async function worker() {
    while (queue.length) {
      const f = queue.shift(), key = fpath(f) + "|" + f.size;
      if (seen.has(key)) { skip++; upd(); continue; } seen.add(key);
      try { const p = await readMedia(f); state.photos.push(p); state.byId.set(p.id, p); } catch (e) { console.warn(e); }
      done++; upd();
      if ((!firstShown && done >= 40) || performance.now() - lastRender > 5000) { firstShown = true; lastRender = performance.now(); derive(); renderAll(); }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  $("#progress").hidden = true; derive(); renderAll();
  const dups = state.photos.filter(p => p.dupOf).length;
  toast(`${plural(done, "arquivo lido", "arquivos lidos")}${skip ? `, ${skip} já estavam na lista` : ""}${dups ? `, ${plural(dups, "cópia encontrada", "cópias encontradas")}` : ""}.`);
}
async function walkEntry(entry, out) {
  if (entry.isFile) { await new Promise(r => entry.file(f => { pathOf.set(f, entry.fullPath.replace(/^\//, "")); out.push(f); r(); }, r)); }
  else if (entry.isDirectory) {
    const rd = entry.createReader();
    let batch; do { batch = await new Promise(r => rd.readEntries(r, () => r([]))); for (const e of batch) await walkEntry(e, out); } while (batch.length);
  }
}

/* ---------- pastas lembradas (Chrome, Edge, Opera) ---------- */
const FS = {
  ok: "showDirectoryPicker" in window && (() => { try { return window.self === window.top; } catch (e) { return false; } })(),
  db() { return new Promise((res, rej) => { const r = indexedDB.open("photoview", 1); r.onupgradeneeded = () => r.result.createObjectStore("dirs"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async list() {
    try { const db = await this.db(); return await new Promise(res => { const out = [], c = db.transaction("dirs").objectStore("dirs").openCursor();
      c.onsuccess = () => { const cur = c.result; if (cur) { out.push({ key: cur.key, h: cur.value }); cur.continue(); } else res(out); }; c.onerror = () => res([]); }); }
    catch (e) { return []; }
  },
  async put(h) { const db = await this.db(); await new Promise(r => { const t = db.transaction("dirs", "readwrite"); t.objectStore("dirs").put(h, h.name + "·" + Date.now()); t.oncomplete = r; t.onerror = r; }); },
  async add(h) { for (const x of await this.list()) { try { if (await x.h.isSameEntry(h)) return; } catch (e) {} } try { await this.put(h); } catch (e) {} },
  async remove(key) { try { const db = await this.db(); await new Promise(r => { const t = db.transaction("dirs", "readwrite"); t.objectStore("dirs").delete(key); t.oncomplete = r; t.onerror = r; }); } catch (e) {} },
  async walk(dir, prefix, out) {
    for await (const [name, e] of dir.entries()) {
      if (e.kind === "file") { if (IMG_EXT.test(name) || VID_EXT.test(name)) { const f = await e.getFile(); pathOf.set(f, prefix + name); out.push(f); } }
      else if (!name.startsWith(".")) await this.walk(e, prefix + name + "/", out);
    }
  },
  async openHandles(hs) {
    const out = [];
    for (const h of hs) {
      try {
        let perm = await h.queryPermission({ mode: "read" });
        if (perm !== "granted") perm = await h.requestPermission({ mode: "read" });
        if (perm !== "granted") { toast(`Sem permissão para ler “${h.name}”.`); continue; }
        $("#progress").hidden = false; $("#progressText").textContent = `Procurando arquivos em ${h.name}…`;
        await this.walk(h, h.name + "/", out);
      } catch (e) { toast(`Não foi possível abrir “${h.name}”. Ela pode ter sido movida ou o disco está desconectado.`); }
    }
    $("#progress").hidden = true;
    if (out.length) importFiles(out);
  },
  async pick() {
    let h;
    try { h = await window.showDirectoryPicker({ mode: "read", id: "photoview" }); }
    catch (e) { if (e.name !== "AbortError") { this.ok = false; $("#dirInput").click(); } return; }
    await this.add(h); renderRemember();
    await this.openHandles([h]);
  }
};
async function renderRemember() {
  const el = $("#remember");
  if (!FS.ok) { el.hidden = true; return; }
  const list = await FS.list();
  if (!list.length) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<span><b>Pastas lembradas:</b></span>` + list.map(x => `<span class="fchip">${esc(x.h.name)}<button type="button" class="open" data-dir="${esc(x.key)}">abrir</button><button type="button" data-forget="${esc(x.key)}" aria-label="Esquecer ${esc(x.h.name)}">×</button></span>`).join("") +
    (list.length > 1 ? `<button class="btn mini primary" type="button" id="openAll">Abrir todas</button>` : "") +
    `<span class="muted" style="font-size:12px">O navegador pede um clique de permissão. Só leitura.</span>`;
  el.querySelectorAll("[data-dir]").forEach(b => b.onclick = () => { const x = list.find(y => y.key === b.dataset.dir); x && FS.openHandles([x.h]); });
  el.querySelectorAll("[data-forget]").forEach(b => b.onclick = async () => { await FS.remove(b.dataset.forget); renderRemember(); });
  const all = $("#openAll"); if (all) all.onclick = () => FS.openHandles(list.map(x => x.h));
}

/* ---------- derivados: cópias, local estimado, filtros ---------- */
function derive() {
  state.photos.sort((a, b) => a.date - b.date || a.id - b.id);
  const seen = new Map();
  for (const p of state.photos) { p.copies = []; p.dupOf = null; }
  for (const p of state.photos) {
    const k = (+p.origDate) + "|" + p.size + "|" + (p.video ? "v" : "f"), q = seen.get(k);
    if (q) { p.dupOf = q.id; q.copies.push(p); } else seen.set(k, p);
  }
  const prim = state.photos.filter(p => !p.dupOf), gi = [];
  prim.forEach((p, i) => { p.est = null; if (p.lat != null) gi.push(i); });
  for (let i = 0; i < prim.length; i++) {
    const p = prim[i]; if (p.lat != null) continue;
    let lo = 0, hi = gi.length; while (lo < hi) { const m = (lo + hi) >> 1; if (gi[m] < i) lo = m + 1; else hi = m; }
    let best = null, bd = 6 * 3600e3;
    for (const j of [gi[lo - 1], gi[lo]]) { if (j == null) continue; const q = prim[j], d = Math.abs(q.date - p.date); if (d < bd) { bd = d; best = q; } }
    if (best) p.est = { lat: best.lat, lon: best.lon, place: best.place, from: best.id, gap: bd };
  }
  buildFilterOptions(prim);
}
function buildFilterOptions(prim) {
  const f = state.filter;
  const places = d3.rollups(prim, v => v.length, p => placeName(loc(p)) || "__none").sort((a, b) => b[1] - a[1]);
  $("#fPlace").innerHTML = `<option value="">Todos os lugares</option>` + places.map(([n, c]) => `<option value="${esc(n)}">${n === "__none" ? "Sem localização" : esc(n)} (${c})</option>`).join("");
  $("#fPlace").value = places.some(x => x[0] === f.place) ? f.place : (f.place = "");
  const cams = d3.rollups(prim, v => v.length, camName).sort((a, b) => b[1] - a[1]);
  $("#fCam").innerHTML = `<option value="">Todas as câmeras</option>` + cams.map(([n, c]) => `<option value="${esc(n)}">${esc(n)} (${c})</option>`).join("");
  $("#fCam").value = cams.some(x => x[0] === f.cam) ? f.cam : (f.cam = "");
}
function visible() {
  const f = state.filter, from = f.from ? new Date(f.from + "T00:00") : null, to = f.to ? new Date(f.to + "T23:59:59") : null;
  return state.photos.filter(p => {
    if (p.dupOf) return false;
    if (f.type === "foto" && p.video) return false;
    if (f.type === "video" && !p.video) return false;
    if (f.place && (placeName(loc(p)) || "__none") !== f.place) return false;
    if (f.cam && camName(p) !== f.cam) return false;
    if (from && p.date < from) return false;
    if (to && p.date > to) return false;
    if (f.noGps && p.lat != null) return false;
    if (f.est && !p.est) return false;
    if (f.noExif && p.exifDate) return false;
    if (f.dups && !p.copies.length) return false;
    return true;
  });
}
const filterCount = () => { const f = state.filter; return [f.type, f.place, f.cam, f.from || f.to, f.noGps, f.est, f.noExif, f.dups].filter(Boolean).length; };
const geoV = () => state.V.filter(p => loc(p));

/* ---------- momentos e viagens ---------- */
function topPlaces(list, n = 3) {
  return d3.rollups(list.map(loc).filter(Boolean), v => v.length, placeName).sort((a, b) => b[1] - a[1]).slice(0, n).map(d => d[0]);
}
function computeMoments(list) {
  const out = []; let cur = null, last = null;
  for (const p of list) {
    const l = loc(p);
    let brk = !cur || p.date - last.date > 3 * 3600e3;
    if (!brk && l && cur.lastLoc && hav(l.lat, l.lon, cur.lastLoc.lat, cur.lastLoc.lon) > 25) brk = true;
    if (brk) { cur = { ps: [], idx: out.length }; out.push(cur); }
    cur.ps.push(p); if (l) cur.lastLoc = l; last = p; p.mom = cur;
  }
  for (const m of out) {
    const a = m.ps[0].date, b = m.ps[m.ps.length - 1].date, pl = topPlaces(m.ps, 1)[0];
    m.place = pl || "Sem local"; m.allEst = m.ps.every(p => p.lat == null) && !!pl;
    const same = a.toDateString() === b.toDateString();
    m.when = same ? `${PER(a.getHours())} de ${dShort(a)}` : dRange(a, b);
    m.range = same ? (m.ps.length > 1 ? `${fTime.format(a)}–${fTime.format(b)}` : fTime.format(a)) : `${dayNum(b) - dayNum(a) + 1} dias`;
    m.title = `${m.place} · ${m.when}`;
  }
  return out;
}
function detectTrips(list) {
  const withLoc = list.filter(p => { const l = loc(p); return l && l.place.city; });
  if (withLoc.length < 3) return [];
  const months = new Map(), days = new Map(), coord = new Map();
  for (const p of withLoc) {
    const l = loc(p), c = placeName(l), mk = p.date.getFullYear() * 12 + p.date.getMonth();
    if (!months.has(c)) { months.set(c, new Set()); days.set(c, new Set()); coord.set(c, l); }
    months.get(c).add(mk); days.get(c).add(dayKey(p.date));
  }
  let home = null, bm = -1, bd = -1;
  for (const [c, s] of months) { const d = days.get(c).size; if (s.size > bm || (s.size === bm && d > bd)) { home = c; bm = s.size; bd = d; } }
  const H = coord.get(home), trips = []; let cur = null;
  for (const [, ps] of d3.groups(list, p => dayKey(p.date))) {
    const ls = ps.map(loc).filter(Boolean), dn = dayNum(ps[0].date);
    let st = "unk";
    if (ls.length) st = ls.filter(l => hav(l.lat, l.lon, H.lat, H.lon) > 60).length / ls.length > .5 ? "away" : "home";
    if (st === "away") { if (cur && dn - cur.last <= 3) { cur.ps.push(...ps); cur.last = dn; } else { cur = { ps: [...ps], last: dn }; trips.push(cur); } }
    else if (st === "home") cur = null;
    else if (cur && dn - cur.last <= 1) { cur.ps.push(...ps); cur.last = dn; }
  }
  return trips.filter(t => t.ps.length >= 3).map((t, i) => {
    const ls = t.ps.map(loc).filter(Boolean);
    const ccs = d3.rollups(ls, v => v.length, l => l.place.country).filter(x => x[0]).sort((a, b) => b[1] - a[1]);
    const foreign = ccs.filter(x => x[0] !== H.place.country);
    const name = foreign.length ? joinPt(foreign.slice(0, 3).map(x => x[0])) + (foreign.length > 3 ? " e mais" : "") : joinPt(topPlaces(t.ps, 2));
    const a = t.ps[0].date, b = t.ps[t.ps.length - 1].date;
    return { i, name: name || "Viagem", ps: t.ps, a, b, when: dRange(a, b), ids: new Set(t.ps.map(p => p.id)) };
  });
}

/* ---------- miniaturas ---------- */
function thumbEl(p) {
  return p.thumb ? `<img src="${p.thumb}" data-id="${p.id}" alt="" loading="lazy" decoding="async">`
    : `<span class="ph${p.needThumb || p.sample ? "" : " fail"}" data-ph="${p.id}">${p.needThumb || p.sample ? "" : (p.video ? "vídeo" : "sem prévia")}</span>`;
}
function tileHTML(p, small) {
  const l = loc(p);
  const g = small ? "" : p.lat != null ? '<i class="g" title="GPS"></i>' : p.est ? '<i class="g est" title="Local estimado"></i>' : "";
  const vb = p.video ? `<span class="vb">▶ ${fmtDur(p.dur)}</span>` : "";
  const cp = p.copies && p.copies.length ? `<span class="cp" title="${p.copies.length + 1} arquivos iguais">×${p.copies.length + 1}</span>` : "";
  return `<button class="tile${state.sel.has(p.id) ? " sel" : ""}" type="button" data-open="${p.id}" title="${esc(fLong.format(p.date))} ${fTime.format(p.date)}${l ? " · " + esc(l.place.label) + (l.est ? " (estimado)" : "") : ""}">${thumbEl(p)}<span class="d${p.edited ? " ed" : ""}">${p.date.getDate()}</span>${g}${vb}${cp}</button>`;
}
function updateThumb(p) {
  document.querySelectorAll(`img[data-id="${p.id}"]`).forEach(i => { i.src = p.thumb; });
  document.querySelectorAll(`[data-ph="${p.id}"]`).forEach(s => { const i = document.createElement("img"); i.src = p.thumb; i.dataset.id = p.id; i.alt = ""; s.replaceWith(i); });
}
function collage(ps, k) {
  const photos = ps.filter(p => !p.video), pool = photos.length >= Math.min(k, ps.length) ? photos : ps;
  const items = pickEven(pool, k), cls = items.length >= 5 ? "k5" : items.length >= 3 ? "k3" : items.length === 2 ? "k2" : "k1";
  return `<div class="collage ${cls}">${items.slice(0, cls === "k5" ? 5 : cls === "k3" ? 3 : items.length).map(thumbEl).join("")}</div>`;
}

/* ---------- linha do tempo ---------- */
const ord = a => state.order === "desc" ? a.slice().reverse() : a;
const selBtn = () => state.selecting ? `<button class="btn mini" type="button" data-selgroup>Selecionar</button>` : "";
function monthEstimate(n, nGroups) {
  const w = Math.max(300, ($("#timeline").clientWidth || 900)), ts = TS[state.size] + 3, cols = Math.max(1, Math.floor(w / ts));
  return Math.ceil(n / cols) * ts + nGroups * 40 + 70;
}
function renderTimeline() {
  const list = state.V, host = $("#timeline"), g = state.group;
  host.style.setProperty("--ts", TS[state.size] + "px");
  document.querySelectorAll("#grpSeg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.g === g));
  $("#sizer").hidden = !(g === "dia" || g === "momento");
  $("#tsRange").value = state.size;
  $("#ordBtn").textContent = state.order === "desc" ? "↓ Mais recentes primeiro" : "↑ Mais antigas primeiro";
  if (!list.length) {
    host.innerHTML = `<div class="empty">${state.photos.length ? "Nada com esses filtros." : "Nenhuma foto ainda. Use “Adicionar arquivos”."}</div>`;
    $("#histSvg").innerHTML = ""; $("#histRange").textContent = ""; Scrub.build(); return;
  }
  const years = ord(d3.groups(list, p => p.date.getFullYear()));
  if (g === "ano") host.innerHTML = renderYears(years);
  else if (g === "mes") host.innerHTML = years.map(([y, ps]) => yearHead(y, ps) + `<div class="mcards">${ord(d3.groups(ps, p => p.date.getMonth())).map(([m, mp]) => monthCard(y, m, mp)).join("")}</div></div>`).join("");
  else host.innerHTML = years.map(([y, ps]) => yearHead(y, ps) + ord(d3.groups(ps, p => p.date.getMonth())).map(([m, mp]) => g === "dia" ? monthDays(y, m, mp) : monthMoments(y, m, mp)).join("") + "</div>").join("");
  renderHist();
  requestAnimationFrame(() => Scrub.build());
}
function yearHead(y, ps) {
  const trips = state.trips.filter(t => t.a.getFullYear() === y || t.b.getFullYear() === y);
  return `<div class="yblock" id="y${y}"><div class="ybig">${y}<small>${plural(ps.length, "item", "itens")}${trips.length ? " · " + plural(trips.length, "viagem", "viagens") : ""}</small></div>`;
}
function monthDays(y, m, ps) {
  const days = ord(d3.groups(ps, p => p.date.getDate()));
  const pl = topPlaces(ps, 3);
  return `<section class="mblock" id="m${y}-${m}" data-mark="${y}-${m}" data-label="${MES[m]} ${y}" style="contain-intrinsic-size:auto ${monthEstimate(ps.length, days.length)}px">
    <div class="mtitle"><h3>${esc(cap(fMonth.format(new Date(y, m, 1))))}</h3><span>${plural(ps.length, "item", "itens")}${pl.length ? " · " + esc(pl.join(", ")) : ""}</span></div>
    <div class="days">${days.map(([, dp]) => { const d = ord(dp), top = topPlaces(dp, 2);
      return `<div class="day" data-group><div class="dayhead"><b>${esc(cap(fDayHead.format(dp[0].date)))}</b><span>${top.length ? esc(top.join(", ")) + " · " : ""}${dp.length}</span>${selBtn()}</div>
        <div class="dgrid" data-list="${d.map(p => p.id).join(",")}">${d.map(p => tileHTML(p)).join("")}</div></div>`; }).join("")}</div></section>`;
}
function monthMoments(y, m, ps) {
  const moms = ord([...new Set(ps.map(p => p.mom))]);
  return `<section class="mblock" id="m${y}-${m}" data-mark="${y}-${m}" data-label="${MES[m]} ${y}" style="contain-intrinsic-size:auto ${monthEstimate(ps.length, moms.length)}px">
    <div class="mtitle"><h3>${esc(cap(fMonth.format(new Date(y, m, 1))))}</h3><span>${plural(ps.length, "item", "itens")} · ${plural(moms.length, "momento", "momentos")}</span></div>
    ${moms.map(mo => { const its = ord(mo.ps.filter(p => p.date.getFullYear() === y && p.date.getMonth() === m));
      return `<div class="moment" data-group><div class="dayhead"><b>${esc(mo.place)}</b><span>${esc(mo.when)} · ${mo.range} · ${its.length}</span>${mo.allEst ? '<span class="est">local estimado</span>' : ""}${selBtn()}</div>
        <div class="dgrid" data-list="${its.map(p => p.id).join(",")}">${its.map(p => tileHTML(p)).join("")}</div></div>`; }).join("")}</section>`;
}
function monthCard(y, m, ps) {
  const pl = topPlaces(ps, 2);
  return `<button class="mcard" type="button" id="m${y}-${m}" data-mark="${y}-${m}" data-label="${MES[m]} ${y}" data-goto="${y}-${m}">${collage(ps, 3)}
    <span class="cmeta"><b>${esc(cap(fMonthOnly.format(new Date(y, m, 1))))}</b><span>${plural(ps.length, "item", "itens")}${pl.length ? " · " + esc(pl.join(", ")) : ""}</span></span></button>`;
}
function renderYears(years) {
  return `<div class="ycards">${years.map(([y, ps]) => {
    const trips = state.trips.filter(t => t.a.getFullYear() === y), pl = topPlaces(ps, 3), nm = new Set(ps.map(p => p.date.getMonth())).size;
    return `<article class="ycard" id="y${y}" data-mark="${y}-0" data-label="${y}">
      <button class="open" type="button" data-goto-year="${y}">${collage(ps, 5)}
        <span class="cmeta"><h3>${y}</h3><span>${plural(ps.length, "item", "itens")} · ${plural(nm, "mês", "meses")}${pl.length ? " · " + esc(pl.join(", ")) : ""}</span></span></button>
      ${trips.length ? `<div class="trips"><span class="eyebrow">Viagens</span>${trips.map(t => `<button class="trip-chip" type="button" data-trip="${t.i}" title="Reproduzir na viagem no tempo"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>${esc(t.name)} · ${esc(t.when.replace(" " + y, ""))}</button>`).join("")}</div>` : ""}
    </article>`;
  }).join("")}</div>`;
}
function renderHist() {
  const svg = d3.select("#histSvg"), list = state.V; svg.selectAll("*").remove();
  if (!list.length) return;
  const W = $("#histSvg").clientWidth || 800, H = 96, pad = { t: 8, b: 22 };
  const first = d3.timeMonth.floor(list[0].date), last = d3.timeMonth.offset(d3.timeMonth.floor(list[list.length - 1].date), 1);
  const months = d3.timeMonth.range(first, last);
  const counts = d3.rollup(list, v => v.length, p => +d3.timeMonth.floor(p.date));
  const x = d3.scaleBand().domain(months.map(Number)).range([0, W]).paddingInner(months.length > 120 ? 0 : .15);
  const max = d3.max(counts.values()), y = d3.scaleLinear().domain([0, max]).range([H - pad.b, pad.t]);
  svg.attr("viewBox", `0 0 ${W} ${H}`);
  svg.append("line").attr("x1", 0).attr("x2", W).attr("y1", H - pad.b).attr("y2", H - pad.b);
  svg.append("g").attr("class", "bars").selectAll("rect").data(months.filter(m => counts.has(+m))).join("rect")
    .attr("x", m => x(+m)).attr("width", Math.max(2, x.bandwidth())).attr("y", m => y(counts.get(+m))).attr("height", m => H - pad.b - y(counts.get(+m)))
    .on("click", (e, m) => goMonth(m.getFullYear(), m.getMonth()))
    .append("title").text(m => `${fMonth.format(m)}: ${counts.get(+m)} itens`);
  const yrs = d3.timeYear.range(d3.timeYear.ceil(first), last), step = Math.ceil(yrs.length / Math.max(1, Math.floor(W / 56))), g = svg.append("g");
  yrs.forEach((yd, i) => { if (i % step) return; const xx = x(+yd); if (xx == null) return;
    g.append("line").attr("x1", xx).attr("x2", xx).attr("y1", H - pad.b).attr("y2", H - pad.b + 5);
    g.append("text").attr("x", xx + 3).attr("y", H - 6).text(yd.getFullYear()); });
  svg.append("text").attr("x", W).attr("y", pad.t + 4).attr("text-anchor", "end").text(`máx. ${fNum.format(max)}/mês`);
  $("#histRange").textContent = `${dShort(list[0].date)} → ${dShort(list[list.length - 1].date)}`;
}
function setGroup(g) {
  if (g === state.group) return;
  state.group = g; LS.set("pv-grupo", g);
  if (state.selecting && !(g === "dia" || g === "momento")) setSelecting(false);
  renderTimeline(); observeThumbs();
}
function scrollToEl(id) {
  const go = () => { const el = document.getElementById(id); if (el) el.scrollIntoView({ block: "start" }); };
  requestAnimationFrame(() => { go(); setTimeout(go, 120); });
}
function goMonth(y, m) { if (state.group === "ano") setGroup("mes"); scrollToEl(`m${y}-${m}`); }

/* barra de rolagem por data, como no Google Fotos */
const hdrH = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hdr")) || 0;
const Scrub = {
  el: null, marks: [],
  init() {
    const el = this.el = $("#scrub");
    el.addEventListener("pointerdown", e => { this.drag = true; el.setPointerCapture(e.pointerId); this.move(e); });
    el.addEventListener("pointermove", e => { if (this.drag) this.move(e); else this.hover(e); });
    const up = () => { this.drag = false; setTimeout(() => this.hideBub(), 700); };
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", () => { if (!this.drag) this.hideBub(); });
    window.addEventListener("scroll", () => { this.onScroll(); clearTimeout(this.rt); this.rt = setTimeout(() => this.measure(), 400); }, { passive: true });
  },
  total() { return Math.max(1, document.documentElement.scrollHeight - innerHeight); },
  build() {
    const els = [...document.querySelectorAll("#timeline [data-mark]")];
    if (!els.length || state.view !== "linha") { this.el.hidden = true; return; }
    this.el.hidden = false; this.els = els; this.measure(true);
  },
  measure(force) {
    if (this.el.hidden || !this.els) return;
    const T = this.total(), H = this.el.clientHeight, off = hdrH() + 70;
    this.marks = this.els.map(el => ({ top: Math.max(0, el.getBoundingClientRect().top + scrollY - off), label: el.dataset.label, yr: el.dataset.mark.slice(0, 4) })).sort((a, b) => a.top - b.top);
    let html = "", lastY = -99, lastYear = null;
    for (const m of this.marks) {
      if (m.yr === lastYear) continue; lastYear = m.yr;
      const y = Math.min(1, m.top / T) * H; if (y - lastY < 16 || y > H - 6) continue; lastY = y;
      html += `<span class="yl" style="top:${y}px">${m.yr}</span>`;
    }
    if (force || html !== this.last) { this.last = html; this.el.innerHTML = html + '<i class="knob"></i><span class="bub"></span>'; this.knob = $(".knob", this.el); this.bub = $(".bub", this.el); }
    this.onScroll(true);
  },
  labelAt(sy) { let lo = 0, hi = this.marks.length - 1, r = 0; while (lo <= hi) { const m = (lo + hi) >> 1; if (this.marks[m].top <= sy + 2) { r = m; lo = m + 1; } else hi = m - 1; } return this.marks[r] && this.marks[r].label; },
  move(e) { const r = this.el.getBoundingClientRect(), f = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)), T = this.total(); scrollTo(0, f * T); this.showBub(f * r.height, this.labelAt(f * T)); },
  hover(e) { const r = this.el.getBoundingClientRect(), f = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)); this.showBub(f * r.height, this.labelAt(f * this.total())); },
  onScroll(silent) {
    if (this.el.hidden || !this.knob) return;
    const y = scrollY / this.total() * this.el.clientHeight; this.knob.style.top = y + "px";
    if (!silent && !this.drag) { this.showBub(y, this.labelAt(scrollY)); clearTimeout(this.ht); this.ht = setTimeout(() => this.hideBub(), 900); }
  },
  showBub(y, t) { if (!t || !this.bub) return; this.bub.textContent = t; this.bub.style.top = y + "px"; this.bub.classList.add("vis"); },
  hideBub() { this.bub && this.bub.classList.remove("vis"); }
};

/* ---------- seleção e ajuste de datas ---------- */
function setSelecting(on) {
  if (on && !(state.group === "dia" || state.group === "momento")) { state.group = "dia"; LS.set("pv-grupo", "dia"); }
  state.selecting = on; document.body.classList.toggle("selecting", on);
  $("#btnSelect").setAttribute("aria-pressed", on); $("#btnSelect").textContent = on ? "Ajustando datas" : "Ajustar datas";
  $("#selbar").hidden = !on; if (!on) state.sel.clear();
  renderTimeline(); observeThumbs(); updSel();
}
function updSel() {
  const n = state.sel.size; $("#selN").textContent = plural(n, "selecionada", "selecionadas");
  const first = [...state.sel].map(id => state.byId.get(id)).filter(Boolean).sort((a, b) => a.date - b.date)[0];
  if (first) $("#adjAt").value = toLocalInput(first.date);
  ["adjApply", "adjSet", "adjReset", "selNone"].forEach(id => $("#" + id).disabled = !n);
}
function markEdited(p) {
  for (const x of [p, ...(p.copies || [])]) {
    x.date = new Date(+p.date); x.edited = +x.date !== +x.origDate;
    if (!x.sample) { if (x.edited) adj[adjKey(x)] = +x.date; else delete adj[adjKey(x)]; }
  }
  saveAdj();
}
function shiftSel(ms) {
  if (!ms) return;
  for (const id of state.sel) { const p = state.byId.get(id); if (p) { p.date = new Date(+p.date + ms); markEdited(p); } }
  afterEdit(`Datas de ${plural(state.sel.size, "item ajustadas", "itens ajustadas")}.`);
}
function afterEdit(msg) { derive(); renderAll(); updSel(); toast(msg); }

/* ---------- mapas (Leaflet) ---------- */
const CFG_KEY = "pv-mapa";
const CFG_DEF = { style: "ruas", mode: "agrupar", color: "ano", est: true, trail: false, labels: true };
const MapCfg = Object.assign({}, CFG_DEF, LS.get(CFG_KEY, {}));
const OSM = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const TILE = {
  ruas: { name: "Ruas", url: l => `https://{s}.basemaps.cartocdn.com/rastertiles/voyager${l ? "" : "_nolabels"}/{z}/{x}/{y}{r}.png`, attr: OSM + ' · © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>' },
  claro: { name: "Claro", url: l => `https://{s}.basemaps.cartocdn.com/${l ? "light_all" : "light_nolabels"}/{z}/{x}/{y}{r}.png`, attr: OSM + " · © CARTO" },
  escuro: { name: "Escuro", url: l => `https://{s}.basemaps.cartocdn.com/${l ? "dark_all" : "dark_nolabels"}/{z}/{x}/{y}{r}.png`, attr: OSM + " · © CARTO" },
  satelite: { name: "Satélite", url: () => "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", ref: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", attr: "Imagens © Esri, Maxar, Earthstar Geographics", max: 19 },
  simples: { name: "Simples", offline: true }
};
let TILES_BLOCKED = false;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const POPTHR = [8e6, 8e6, 8e6, 3e6, 1e6, 4e5, 1.5e5, 6e4, 2.5e4, 1e4, 3000, 0];
class GeoMap {
  constructor(el, mini) {
    this.mini = mini;
    this.map = L.map(el, { zoomControl: !mini, worldCopyJump: true, minZoom: 2, maxZoom: 19, zoomSnap: .5, attributionControl: true,
      dragging: !mini, scrollWheelZoom: !mini, doubleClickZoom: !mini, boxZoom: !mini, keyboard: !mini, touchZoom: !mini });
    this.map.attributionControl.setPrefix(false);
    this.map.setView([10, 0], 2);
    this.map.createPane("base").style.zIndex = 250;
    const lp = this.map.createPane("lbl"); lp.style.zIndex = 390; lp.style.pointerEvents = "none";
    this.canvas = L.canvas({ padding: .3 });
    this.baseCanvas = L.canvas({ pane: "base", padding: .3 });
    this.labels = L.layerGroup().addTo(this.map);
    this.photoCities = [];
    this.map.on("moveend", () => this.updLabels());
  }
  cstyle() { return { fillColor: css("--land"), fillOpacity: 1, color: css("--line"), weight: .8 }; }
  setStyle() {
    for (const k of ["tile", "ref", "countries"]) if (this[k]) { this.map.removeLayer(this[k]); this[k] = null; }
    const key = TILES_BLOCKED ? "simples" : MapCfg.style; this.key = key;
    if (key === "simples") {
      if (landFC) this.countries = L.geoJSON(landFC, { pane: "base", renderer: this.baseCanvas, interactive: false, style: () => this.cstyle() }).addTo(this.map);
    } else {
      const t = TILE[key]; let ok = false, errs = 0;
      this.tile = L.tileLayer(t.url(MapCfg.labels), { subdomains: "abcd", maxZoom: t.max || 20, attribution: t.attr }).addTo(this.map);
      this.tile.on("tileload", () => { ok = true; }).on("tileerror", () => { if (!ok && ++errs >= 3) tilesBlocked(); });
      if (t.ref && MapCfg.labels) this.ref = L.tileLayer(t.ref, { maxZoom: 19 }).addTo(this.map);
    }
    this.updLabels();
  }
  recolor() { if (this.countries) this.countries.setStyle(this.cstyle()); }
  updLabels() {
    this.labels.clearLayers();
    if (this.key !== "simples" || !MapCfg.labels) return;
    const map = this.map, z = Math.round(map.getZoom()), b = map.getBounds().pad(.05), sz = map.getSize(), occ = new Set(), cell = 12;
    const place = (lat, lon, text, cls) => {
      const pt = map.latLngToContainerPoint([lat, lon]); if (cls.includes("has")) pt.y += 24; if (pt.x < 0 || pt.y < 0 || pt.x > sz.x || pt.y > sz.y) return false;
      const w = text.length * (cls === "ct" ? 8.5 : 7) + 14, x0 = Math.floor((pt.x - w / 2) / cell), x1 = Math.floor((pt.x + w / 2) / cell), y0 = Math.floor((pt.y - 10) / cell), y1 = Math.floor((pt.y + 10) / cell);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (occ.has(x + "," + y)) return false;
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) occ.add(x + "," + y);
      L.marker([lat, lon], { pane: "lbl", interactive: false, keyboard: false, icon: L.divIcon({ className: "", iconSize: [0, 0], html: `<span class="pv-lbl ${cls}">${esc(text)}</span>` }) }).addTo(this.labels);
      return true;
    };
    const named = new Set();
    for (const c of this.photoCities) if (b.contains([c.lat, c.lon]) && place(c.lat, c.lon, c.name, "city has")) named.add(c.name);
    if (z < 8) for (const c of CLBL) {
      if (!b.contains([c.lat, c.lon])) continue;
      const p1 = map.latLngToContainerPoint([c.b[0][1], c.b[0][0]]), p2 = map.latLngToContainerPoint([c.b[1][1], c.b[1][0]]);
      if (Math.abs(p2.x - p1.x) < 60 || Math.abs(p2.x - p1.x) > sz.x * 6) continue;
      place(c.lat, c.lon, c.name, "ct");
    }
    const thr = POPTHR[Math.min(POPTHR.length - 1, Math.max(0, z))] || 0; let n = 0;
    for (const c of CDB) { if (c[3] < thr || n > (this.mini ? 30 : 110)) break; if (named.has(c[0]) || !b.contains([c[4], c[5]])) continue; if (place(c[4], c[5], c[0], "city")) n++; }
  }
  fit(locs, opt = {}) {
    const lls = locs.map(l => [l.lat, l.lon]);
    if (!lls.length) { this.map.setView([10, 0], 2, { animate: false }); return; }
    if (lls.length === 1) { this.map.setView(lls[0], opt.maxZoom || 13, { animate: !!opt.animate }); return; }
    this.map.fitBounds(L.latLngBounds(lls), { padding: [40, 40], maxZoom: opt.maxZoom || 13, animate: !!opt.animate });
  }
}
function tilesBlocked() {
  if (TILES_BLOCKED) return; TILES_BLOCKED = true;
  toast("Os mapas online não carregaram (sem internet ou bloqueados aqui). Usando o mapa simples, que funciona offline.");
  MapView.gm && MapView.gm.setStyle(); Trip.gm && Trip.gm.setStyle(); MapView.renderCfg();
}
function yearColor() {
  const a = css("--cyan") || "#1f4f9d", b = css("--stamp") || "#e0561d";
  const ys = state.V.length ? state.V.map(p => p.date.getFullYear()) : [2020];
  const lo = d3.min(ys), hi = d3.max(ys), s = d3.scaleLinear().domain([lo, hi === lo ? lo + 1 : hi]).range([0, 1]).clamp(true), i = d3.interpolateHcl(a, b);
  return { fn: y => i(s(y)), lo, hi, a, b, mid: i(.5) };
}

const MapView = {
  gm: null, layer: null, trail: null, sel: null, dirty: true,
  ensure() {
    if (typeof L === "undefined") { $("#mapEl").innerHTML = '<div class="mapnote">O mapa não carregou. Verifique a internet e recarregue a página.</div>'; return false; }
    if (!this.gm) {
      this.gm = new GeoMap($("#mapEl"), false); this.gm.setStyle();
      this.gm.map.on("click", e => { if (MapCfg.mode === "calor") this.pickNear(e.latlng); });
    }
    this.gm.map.invalidateSize(); return true;
  },
  items() { return geoV().filter(p => MapCfg.est || p.lat != null); },
  render(refit) {
    if (refit) this.dirty = true;
    if (state.view !== "mapa" || !this.ensure()) return;
    this.drawData();
    if (this.dirty) { this.gm.fit(this.items().map(loc), { maxZoom: 12 }); this.dirty = false; }
    this.legend(); this.side(this.sel);
  },
  colorFn() {
    const yc = yearColor(), c1 = css("--cyan"), c2 = css("--stamp");
    if (MapCfg.color === "tipo") return p => p.video ? c2 : c1;
    if (MapCfg.color === "unica") return () => c2;
    return p => yc.fn(p.date.getFullYear());
  },
  drawData() {
    const map = this.gm.map;
    for (const k of ["layer", "trail"]) if (this[k]) { map.removeLayer(this[k]); this[k] = null; }
    const ps = this.items(), col = this.colorFn();
    const cities = new Map(); for (const p of ps) { const l = loc(p); if (l.place.city && !cities.has(l.place.city)) cities.set(l.place.city, { name: l.place.city, lat: l.place.clat, lon: l.place.clon }); }
    this.gm.photoCities = [...cities.values()];
    if (MapCfg.mode === "calor" && L.heatLayer) {
      this.layer = L.heatLayer(ps.map(p => { const l = loc(p); return [l.lat, l.lon, .7]; }), { radius: 24, blur: 18, minOpacity: .35, maxZoom: 13 }).addTo(map);
    } else if (MapCfg.mode === "pontos") {
      const g = L.layerGroup();
      for (const p of ps) { const l = loc(p);
        L.circleMarker([l.lat, l.lon], { renderer: this.gm.canvas, radius: 6, color: "#fff", weight: 1.5, fillColor: col(p), fillOpacity: l.est ? .5 : .95, dashArray: l.est ? "3 2" : null })
          .on("click", () => this.showPs([p])).addTo(g); }
      this.layer = g.addTo(map);
    } else {
      const g = L.markerClusterGroup({ showCoverageOnHover: false, chunkedLoading: true, spiderfyOnMaxZoom: true, maxClusterRadius: 50,
        iconCreateFunction: cl => { const ch = cl.getAllChildMarkers(), n = ch.length, s = n < 10 ? 30 : n < 100 ? 38 : n < 1000 ? 46 : 54;
          const mid = ch[Math.floor(n / 2)].p, est = ch.every(m => m.est);
          return L.divIcon({ className: "", iconSize: [s, s], html: `<div class="pv-cl${est ? " est" : ""}" style="width:${s}px;height:${s}px;background:${col(mid)}">${fmtK(n)}</div>` }); } });
      const ms = ps.map(p => { const l = loc(p);
        const m = L.marker([l.lat, l.lon], { keyboard: false, icon: L.divIcon({ className: "", iconSize: [12, 12], html: `<i class="pv-dot${l.est ? " est" : ""}" style="background:${col(p)}"></i>` }) });
        m.p = p; m.est = l.est; m.on("click", () => this.showPs([p])); return m; });
      g.addLayers(ms);
      g.on("clusterclick", e => this.showPs(e.layer.getAllChildMarkers().map(m => m.p)));
      this.layer = g.addTo(map);
    }
    if (MapCfg.trail && ps.length > 1) this.trail = L.polyline(ps.map(p => { const l = loc(p); return [l.lat, l.lon]; }), { color: css("--stamp"), weight: 2, dashArray: "4 6", opacity: .85, interactive: false }).addTo(map);
    this.gm.updLabels();
  },
  pickNear(ll) {
    const map = this.gm.map, c = map.latLngToContainerPoint(ll);
    const ps = this.items().filter(p => { const l = loc(p); return map.latLngToContainerPoint([l.lat, l.lon]).distanceTo(c) < 30; });
    if (ps.length) this.showPs(ps);
  },
  showPs(ps) { this.sel = ps.slice().sort((a, b) => a.date - b.date); this.side(this.sel); },
  legend() {
    const el = $("#legend"), n = this.items().length; el.hidden = !n || MapCfg.mode === "calor"; if (el.hidden) return;
    const yc = yearColor(), est = MapCfg.est ? `<span><i class="k dash"></i>local estimado</span>` : "";
    if (MapCfg.color === "ano") el.innerHTML = `<span>Cor = ano da foto</span><div class="ramp" style="background:linear-gradient(90deg,${yc.a},${yc.mid},${yc.b})"></div><div class="ends"><span>${yc.lo}</span><span>${yc.hi}</span></div>${est}`;
    else if (MapCfg.color === "tipo") el.innerHTML = `<span><i class="k" style="background:var(--cyan)"></i>foto</span><span><i class="k" style="background:var(--stamp)"></i>vídeo</span>${est}`;
    else el.innerHTML = est || "<span>Fotos</span>";
  },
  side(ps) {
    const el = $("#mapSide"), geo = this.items(), real = geo.filter(p => p.lat != null).length, no = state.V.length - geoV().length;
    if (!ps || !ps.length) {
      const pl = d3.rollups(geo, v => v.length, p => placeName(loc(p))).sort((a, b) => b[1] - a[1]).slice(0, 10);
      el.innerHTML = `<span class="eyebrow">Lugares</span><h3>${plural(geo.length, "item no mapa", "itens no mapa")}</h3>
        <p class="note">${fNum.format(real)} com GPS${geo.length - real ? ` e ${fNum.format(geo.length - real)} com local estimado pela foto mais próxima no tempo` : ""}. Clique num círculo ou num lugar abaixo.</p>
        <div class="hbars">${pl.map(([n, c]) => `<button class="prow" type="button" data-place="${esc(n)}"><span class="lab">${esc(n)}</span><span class="val">${fNum.format(c)}</span><span class="track"><i style="width:${c / pl[0][1] * 100}%"></i></span></button>`).join("")}</div>
        ${no ? `<p class="note">${plural(no, "item não tem", "itens não têm")} local e aparecem só na linha do tempo.</p>` : ""}`;
      el.querySelectorAll("[data-place]").forEach(b => b.onclick = () => this.focusPlace(b.dataset.place));
      return;
    }
    const pl = topPlaces(ps, 2), a = ps[0].date, b = ps[ps.length - 1].date;
    el.innerHTML = `<span class="eyebrow">${plural(ps.length, "item", "itens")} · ${esc(dRange(a, b))}</span>
      <h3>${esc(joinPt(pl) || "Neste ponto")}</h3>
      <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn mini" type="button" id="selZoom">Aproximar</button><button class="btn mini" type="button" id="selTrip">Reproduzir</button><button class="btn mini ghost" type="button" id="selBack">Todos os lugares</button></div>
      <div class="list" data-list="${ps.map(p => p.id).join(",")}">${ps.map(p => tileHTML(p, true)).join("")}</div>`;
    $("#selZoom").onclick = () => this.gm.fit(ps.map(loc), { maxZoom: 16, animate: true });
    $("#selBack").onclick = () => { this.sel = null; this.side(null); };
    $("#selTrip").onclick = () => { Trip.customFrom(ps); };
    observeThumbs();
  },
  focusPlace(name) {
    const ps = this.items().filter(p => placeName(loc(p)) === name);
    if (!ps.length) return;
    this.gm.fit(ps.map(loc), { maxZoom: 14, animate: true }); this.showPs(ps);
  },
  focus(p) {
    this.sel = [p]; this.dirty = false; go("mapa");
    requestAnimationFrame(() => { if (!this.ensure()) return; const l = loc(p); this.gm.map.setView([l.lat, l.lon], 15); this.side(this.sel); });
  },
  applyCfg(styleChanged) {
    LS.set(CFG_KEY, MapCfg);
    if (styleChanged) { this.gm && this.gm.setStyle(); Trip.gm && Trip.gm.setStyle(); }
    if (this.gm) { this.drawData(); this.legend(); this.side(this.sel); }
    this.renderCfg();
  },
  renderCfg() {
    const el = $("#mapCfg"); if (el.hidden) return;
    const segB = (k, v, t, dis) => `<button type="button" data-k="${k}" data-v="${v}" aria-pressed="${MapCfg[k] === v}"${dis ? " disabled" : ""}>${t}</button>`;
    const chk = (k, t, s) => `<label class="check"><input type="checkbox" data-c="${k}"${MapCfg[k] ? " checked" : ""}><span>${t}${s ? `<small>${s}</small>` : ""}</span></label>`;
    el.innerHTML = `<div class="hd"><b>Configurar mapa</b><button class="btn mini ghost" type="button" id="cfgClose">Fechar</button></div>
      <div class="grpc"><span class="eyebrow">Estilo</span><div class="stylepick">${Object.entries(TILE).map(([k, t]) => `<button type="button" data-style="${k}" aria-pressed="${(TILES_BLOCKED ? "simples" : MapCfg.style) === k}"${TILES_BLOCKED && !t.offline ? " disabled" : ""}><span class="sw ${k}"></span>${t.name}</button>`).join("")}</div>
        <p class="note">${TILES_BLOCKED ? "Os estilos online não carregaram aqui. Eles precisam de internet e funcionam no arquivo baixado ou no site do GitHub." : "Ruas, Claro, Escuro e Satélite precisam de internet. O Simples funciona offline."}</p></div>
      <div class="grpc"><span class="eyebrow">Como mostrar as fotos</span><div class="seg">${segB("mode", "agrupar", "Agrupadas")}${segB("mode", "pontos", "Pontos")}${segB("mode", "calor", "Mapa de calor", !L.heatLayer)}</div></div>
      <div class="grpc"><span class="eyebrow">Cor dos pontos</span><div class="seg">${segB("color", "ano", "Por ano", MapCfg.mode === "calor")}${segB("color", "tipo", "Foto / vídeo", MapCfg.mode === "calor")}${segB("color", "unica", "Uma cor", MapCfg.mode === "calor")}</div></div>
      <div class="grpc"><span class="eyebrow">Mostrar</span>
        ${chk("labels", "Nomes de países e cidades")}
        ${chk("est", "Fotos com local estimado", "Fotos sem GPS ganham o local da foto mais próxima no tempo")}
        ${chk("trail", "Trajeto entre as fotos", "Linha tracejada ligando as fotos em ordem de data")}</div>
      <button class="btn mini ghost" type="button" id="cfgReset">Restaurar padrão</button>`;
    el.querySelectorAll("[data-style]").forEach(b => b.onclick = () => { MapCfg.style = b.dataset.style; this.applyCfg(true); });
    el.querySelectorAll("[data-k]").forEach(b => b.onclick = () => { MapCfg[b.dataset.k] = b.dataset.v; this.applyCfg(false); });
    el.querySelectorAll("[data-c]").forEach(c => c.onchange = () => { MapCfg[c.dataset.c] = c.checked; this.applyCfg(c.dataset.c === "labels"); });
    $("#cfgClose").onclick = () => toggleCfg(false);
    $("#cfgReset").onclick = () => { Object.assign(MapCfg, CFG_DEF); this.applyCfg(true); };
  }
};
function toggleCfg(on) { const el = $("#mapCfg"); el.hidden = !on; $("#btnCfg").setAttribute("aria-expanded", on); if (on) MapView.renderCfg(); }

/* busca de lugares */
let CDB_N = null;
const Search = {
  act: -1, res: [],
  run(q) {
    const box = $("#sres"); q = norm(q.trim());
    if (q.length < 2) { box.hidden = true; return; }
    if (!CDB_N) CDB_N = CDB.map(c => norm(c[0]) + (c[6] ? "|" + norm(c[6]) : ""));
    const mine = d3.rollups(MapView.items(), v => v, p => placeName(loc(p))).filter(([n]) => norm(n).includes(q)).sort((a, b) => b[1].length - a[1].length).slice(0, 4)
      .map(([n, ps]) => ({ name: n, sub: plural(ps.length, "foto", "fotos"), ps }));
    const seen = new Set(mine.map(m => norm(m.name))), others = [];
    for (let i = 0; i < CDB.length && others.length < 7; i++) {
      const s = CDB_N[i]; if (!(s.startsWith(q) || s.includes("|" + q) || (q.length >= 4 && s.includes(q)))) continue;
      const c = CDB[i]; if (seen.has(norm(c[0]))) continue; seen.add(norm(c[0]));
      others.push({ name: c[0], sub: c[1] === "BR" ? (UF[c[2]] || "Brasil") : ccName(c[1]), lat: c[4], lon: c[5] });
    }
    this.res = [...mine, ...others]; this.act = -1;
    if (!this.res.length) { box.innerHTML = '<div class="h note">Nenhum lugar encontrado.</div>'; box.hidden = false; return; }
    box.innerHTML = (mine.length ? '<div class="h eyebrow">Com suas fotos</div>' : "") + mine.map((r, i) => `<button type="button" data-i="${i}">${esc(r.name)}<small>${esc(r.sub)}</small></button>`).join("") +
      (others.length ? '<div class="h eyebrow">Cidades</div>' : "") + others.map((r, i) => `<button type="button" data-i="${i + mine.length}">${esc(r.name)}<small>${esc(r.sub || "")}</small></button>`).join("");
    box.querySelectorAll("[data-i]").forEach(b => b.onmousedown = e => { e.preventDefault(); this.pick(+b.dataset.i); });
    box.hidden = false;
  },
  pick(i) {
    const r = this.res[i]; if (!r || !MapView.gm) return;
    $("#sres").hidden = true; $("#mapSearch").value = r.name;
    if (r.ps) { MapView.gm.fit(r.ps.map(loc), { maxZoom: 14, animate: true }); MapView.showPs(r.ps); }
    else MapView.gm.map.flyTo([r.lat, r.lon], 11, { duration: .8 });
  },
  key(e) {
    const bs = [...$("#sres").querySelectorAll("[data-i]")]; if (!bs.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); this.act = (this.act + (e.key === "ArrowDown" ? 1 : -1) + bs.length) % bs.length; bs.forEach((b, i) => b.classList.toggle("act", i === this.act)); }
    else if (e.key === "Enter") { e.preventDefault(); this.pick(this.act >= 0 ? +bs[this.act].dataset.i : +bs[0].dataset.i); }
    else if (e.key === "Escape") $("#sres").hidden = true;
  }
};

/* ---------- viagem no tempo ---------- */
const Trip = {
  i: 0, timer: null, gm: null, front: "stA", urls: [], L: [], scope: null, startAt: null, customIds: null,
  delay() { return +$("#pSpeed").value; },
  buildScope() {
    const V = state.V, sel = $("#scSel");
    const years = d3.groups(V, p => p.date.getFullYear()).reverse(), months = d3.groups(V, p => p.date.getFullYear() * 12 + p.date.getMonth()).reverse();
    const valid = new Set(["all", "custom"]); let html = `<option value="all">Tudo (${fNum.format(V.length)} itens)</option>`;
    if (this.customIds) { html += `<option value="pick">Lugar escolhido no mapa (${this.customIds.size})</option>`; valid.add("pick"); }
    if (state.trips.length) html += `<optgroup label="Viagens">${state.trips.slice().reverse().map(t => { valid.add("trip:" + t.i); return `<option value="trip:${t.i}">${esc(t.name)} · ${esc(t.when)} (${t.ps.length})</option>`; }).join("")}</optgroup>`;
    html += `<optgroup label="Anos">${years.map(([y, ps]) => { valid.add("year:" + y); return `<option value="year:${y}">${y} (${ps.length})</option>`; }).join("")}</optgroup>`;
    html += `<optgroup label="Meses">${months.map(([k, ps]) => { valid.add("month:" + k); return `<option value="month:${k}">${esc(cap(fMonth.format(new Date(Math.floor(k / 12), k % 12, 1))))} (${ps.length})</option>`; }).join("")}</optgroup>`;
    html += `<option value="custom">Escolher período…</option>`;
    sel.innerHTML = html;
    if (!this.scope || !valid.has(this.scope)) {
      const multi = state.trips.filter(t => dayNum(t.b) > dayNum(t.a)), t = multi[multi.length - 1] || state.trips[state.trips.length - 1];
      this.scope = t ? "trip:" + t.i : months.length ? "month:" + months[0][0] : "all";
    }
    sel.value = this.scope; $("#scCustom").hidden = this.scope !== "custom";
    $("#scPace").value = LS.get("pv-ritmo", "h3");
  },
  compute() {
    const [kind, val] = this.scope.split(":"); let base = state.V;
    if (kind === "trip") { const t = state.trips.find(t => t.i === +val); base = t ? t.ps : []; }
    else if (kind === "year") base = base.filter(p => p.date.getFullYear() === +val);
    else if (kind === "month") base = base.filter(p => p.date.getFullYear() * 12 + p.date.getMonth() === +val);
    else if (kind === "pick" && this.customIds) base = base.filter(p => this.customIds.has(p.id));
    else if (kind === "custom") { const a = $("#scFrom").value, b = $("#scTo").value;
      base = base.filter(p => (!a || p.date >= new Date(a + "T00:00")) && (!b || p.date <= new Date(b + "T23:59:59"))); }
    if (!$("#scVid").checked) base = base.filter(p => !p.video);
    const pace = $("#scPace").value; let out = base;
    if (pace === "h1" || pace === "h3") {
      const k = pace === "h1" ? 1 : 3; out = [];
      for (const [, ps] of d3.groups(base, p => p.mom)) { const ph = ps.filter(p => !p.video); out.push(...pickEven(ph.length >= Math.min(k, ps.length) ? ph : ps, k)); }
      out.sort((a, b) => a.date - b.date);
    } else if (pace === "d10") { out = []; for (const [, ps] of d3.groups(base, p => dayKey(p.date))) out.push(...pickEven(ps, 10)); }
    this.L = out;
    $("#scEst").innerHTML = out.length ? `<b>${plural(out.length, "foto", "fotos")}</b>${out.length < base.length ? ` de ${fNum.format(base.length)}` : ""}<br>${out.length * this.delay() < 60000 ? "menos de 1 min" : "cerca de " + fmtETA(out.length * this.delay())}` : "Nada neste período";
  },
  render() {
    this.buildScope(); this.compute();
    const L = this.L, r = $("#pRange");
    r.max = Math.max(0, L.length - 1);
    if (this.startAt) { const t = +this.startAt.date; let bi = 0, bd = Infinity; L.forEach((p, i) => { const d = Math.abs(p.date - t); if (d < bd) { bd = d; bi = i; } }); this.i = bi; this.startAt = null; }
    if (this.i > L.length - 1) this.i = 0;
    const tk = $("#pTicks"); tk.innerHTML = "";
    if (L.length > 1) {
      const span = L[L.length - 1].date - L[0].date, byYear = span > 400 * 864e5;
      const gs = d3.groups(L.map((p, i) => [byYear ? p.date.getFullYear() : dShort(p.date).replace(/ \d{4}$/, ""), i]), d => d[0]);
      const step = Math.ceil(gs.length / 7);
      gs.forEach(([lab, a], k) => { if (k % step) return; const s = document.createElement("span"); s.style.left = (a[0][1] / (L.length - 1) * 100) + "%"; s.textContent = lab; tk.appendChild(s); });
    }
    if (state.view === "viagem") { this.ensureMap(); this.drawRoute(); this.show(this.i, true); }
  },
  ensureMap() {
    if (typeof L === "undefined") return;
    if (!this.gm) { this.gm = new GeoMap($("#miniEl"), true); this.gm.setStyle(); }
    this.gm.map.invalidateSize();
  },
  drawRoute() {
    if (!this.gm) return; const map = this.gm.map;
    for (const k of ["route", "passed", "cur"]) if (this[k]) { map.removeLayer(this[k]); this[k] = null; }
    const lls = this.L.map(loc).filter(Boolean).map(l => [l.lat, l.lon]);
    this.route = L.layerGroup(lls.map(ll => L.circleMarker(ll, { renderer: this.gm.canvas, radius: 3, stroke: false, fillColor: css("--ink-2"), fillOpacity: .45, interactive: false }))).addTo(map);
    this.passed = L.polyline([], { color: css("--stamp"), weight: 2.5, dashArray: "5 5", interactive: false }).addTo(map);
    this.cur = L.marker([0, 0], { interactive: false, keyboard: false, icon: L.divIcon({ className: "", iconSize: [18, 18], html: '<i class="pv-cur"></i>' }) });
    this.gm.photoCities = []; this.gm.fit(this.L.map(loc).filter(Boolean), { maxZoom: 11 });
  },
  async show(i, instant) {
    const L0 = this.L;
    if (!L0.length) { $("#tWhen").textContent = "Nada para reproduzir"; $("#tWhere").textContent = "Escolha outro período acima."; $("#tMom").textContent = ""; $("#pCount").textContent = ""; return; }
    this.i = Math.max(0, Math.min(L0.length - 1, i)); const p = L0[this.i], l = loc(p);
    $("#pRange").value = this.i; $("#pCount").textContent = `${this.i + 1} / ${L0.length}`;
    $("#stStamp").textContent = stamp(p.date);
    $("#tMom").textContent = p.mom ? p.mom.title : "";
    $("#tWhen").textContent = cap(fLong.format(p.date)) + " · " + fTime.format(p.date);
    $("#tWhere").textContent = (l ? l.place.label + (l.est ? " (estimado)" : "") : "sem localização") + (p.model ? " · " + p.model : "");
    $("#stCap").textContent = (p.video ? "▶ vídeo " + fmtDur(p.dur) + " · " : "") + p.name;
    if (!p.thumb && p.needThumb) ThumbQ.push(p.id);
    const src = p.video ? p.thumb : fullSrc(p);
    const back = this.front === "stA" ? "stB" : "stA", bi = $("#" + back), fi = $("#" + this.front);
    if (src) { bi.src = src; try { await bi.decode(); } catch (e) {} } else bi.removeAttribute("src");
    if (this.L !== L0 || L0[this.i] !== p) return;
    bi.classList.add("on"); fi.classList.remove("on"); this.front = back;
    this.urls.push(src); while (this.urls.length > 3) { const u = this.urls.shift(); if (u && u.startsWith("blob:") && !isKept(u)) URL.revokeObjectURL(u); }
    if (!this.gm || !this.passed) return;
    const upto = L0.slice(0, this.i + 1).map(loc).filter(Boolean);
    this.passed.setLatLngs(upto.map(x => [x.lat, x.lon]));
    const cur = upto[upto.length - 1];
    if (!cur) { this.gm.map.removeLayer(this.cur); return; }
    this.cur.setLatLng([cur.lat, cur.lon]).addTo(this.gm.map);
    const recent = upto.slice(-5), map = this.gm.map, bb = L.latLngBounds(recent.map(x => [x.lat, x.lon]));
    if (!map.getBounds().pad(-.2).contains(bb) || map.getZoom() < 4) {
      if (instant) this.gm.fit(recent, { maxZoom: 12 });
      else if (recent.length === 1) map.flyTo([cur.lat, cur.lon], Math.max(map.getZoom(), 9), { duration: Math.min(1.2, this.delay() / 1600) });
      else map.flyToBounds(bb, { padding: [40, 40], maxZoom: 12, duration: Math.min(1.2, this.delay() / 1600) });
    }
  },
  play() {
    if (this.timer) return this.stop();
    if (this.i >= this.L.length - 1) this.i = -1;
    $("#playTxt").textContent = "Pausar"; $("#playIco").innerHTML = '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>';
    const tick = () => { if (this.i >= this.L.length - 1) return this.stop(); this.show(this.i + 1); this.timer = setTimeout(tick, this.delay()); };
    tick();
  },
  stop() { clearTimeout(this.timer); this.timer = null; $("#playTxt").textContent = "Reproduzir"; $("#playIco").innerHTML = '<path d="M7 5v14l12-7z"/>'; },
  rescope() { this.stop(); this.i = 0; this.compute(); this.render(); },
  startFrom(p) {
    const t = state.trips.find(t => t.ids.has(p.id));
    this.scope = t ? "trip:" + t.i : "month:" + (p.date.getFullYear() * 12 + p.date.getMonth());
    this.startAt = p; go("viagem");
  },
  customFrom(ps) { this.customIds = new Set(ps.map(p => p.id)); this.scope = "pick"; this.i = 0; go("viagem"); },
  playTrip(i) { this.scope = "trip:" + i; this.i = 0; go("viagem"); }
};
function isKept(u) { return state.photos.some(p => p.thumb === u || p.full === u); }
function fullSrc(p) { if (p.sample) return p.full; if (p.file && p.viewable && !p.video) return URL.createObjectURL(p.file); return p.thumb; }

/* ---------- neste dia ---------- */
function renderOnDay() {
  const inp = $("#odDate"); if (!inp.value) { const t = new Date(); inp.value = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; }
  const [Y, M, D] = inp.value.split("-").map(Number), today = new Date();
  const isToday = Y === today.getFullYear() && M === today.getMonth() + 1 && D === today.getDate();
  $("#odTitle").textContent = isToday ? "Neste dia" : "Em " + fDay.format(new Date(2000, M - 1, D));
  const L0 = state.V;
  let hits = L0.filter(p => p.date.getMonth() === M - 1 && p.date.getDate() === D), note = "";
  if (!hits.length && L0.length) {
    const doy = d => Math.round((new Date(2001, d.getMonth(), d.getDate()) - new Date(2001, 0, 1)) / 864e5), target = doy(new Date(2001, M - 1, D));
    let best = 400; for (const p of L0) { const dd = Math.abs(doy(p.date) - target), c = Math.min(dd, 365 - dd); if (c < best) best = c; }
    if (best <= 10) { hits = L0.filter(p => { const dd = Math.abs(doy(p.date) - target); return Math.min(dd, 365 - dd) === best; });
      note = `<p class="muted">Nada exatamente em ${fDay.format(new Date(2000, M - 1, D))}. Estes são os mais próximos, a ${plural(best, "dia", "dias")} de distância.</p>`; }
    else { hits = L0.filter(p => p.date.getMonth() === M - 1);
      if (hits.length) note = `<p class="muted">Nada perto desse dia. Veja o mês de ${fMonthOnly.format(new Date(2000, M - 1, 1))} em outros anos.</p>`; }
  }
  if (!hits.length) { $("#odList").innerHTML = '<div class="empty">Nada perto dessa data. Escolha outro dia no calendário.</div>'; return; }
  $("#odList").innerHTML = note + d3.groups(hits, p => p.date.getFullYear()).sort((a, b) => b[0] - a[0]).map(([y, v]) => {
    const diff = Y - y, pl = topPlaces(v, 2), shown = v.slice(0, 40);
    const rel = diff > 0 ? `há ${plural(diff, "ano", "anos")}` : diff === 0 ? "neste ano" : `daqui a ${plural(-diff, "ano", "anos")}`;
    return `<div class="ago"><div><div class="yr">${y}</div><div class="rel">${rel}</div><div class="pl">${esc(dRange(v[0].date, v[v.length - 1].date))}${pl.length ? "<br>" + esc(pl.join(", ")) : ""}${v.length > 40 ? `<br>${v.length} itens` : ""}</div></div>
      <div class="grid" data-list="${v.map(p => p.id).join(",")}">${shown.map(p => tileHTML(p)).join("")}</div></div>`;
  }).join("");
}

/* ---------- números ---------- */
function renderStats() {
  const L0 = state.V, el = $("#stats");
  if (!L0.length) { el.innerHTML = '<div class="empty">Nada para mostrar com esses filtros.</div>'; return; }
  const geo = L0.filter(p => p.lat != null), est = L0.filter(p => p.est), vids = L0.filter(p => p.video), days = Math.round((L0[L0.length - 1].date - L0[0].date) / 864e5);
  let km = 0; for (let i = 1; i < geo.length; i++) km += hav(geo[i - 1].lat, geo[i - 1].lon, geo[i].lat, geo[i].lon);
  const all = L0.map(loc).filter(Boolean), cities = new Set(all.map(placeName));
  const ctr = d3.rollups(all, v => v.length, l => l.place.country).filter(x => x[0]).sort((a, b) => b[1] - a[1]);
  const byHour = d3.range(24).map(h => L0.filter(p => p.date.getHours() === h).length), mh = d3.max(byHour) || 1, hh = byHour.indexOf(mh);
  const wd = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"], byWd = d3.range(7).map(d => L0.filter(p => p.date.getDay() === d).length), mw = d3.max(byWd) || 1;
  const cams = d3.rollups(L0, v => v.length, camName).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const places = d3.rollups(all, v => v.length, placeName).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const busy = d3.rollups(L0, v => v.length, p => dayKey(p.date)).sort((a, b) => b[1] - a[1])[0];
  const busyL = busy ? L0.filter(p => dayKey(p.date) === busy[0]) : [];
  const srcs = d3.rollups(L0, v => v.length, p => p.edited ? "ajustada por você" : p.dateSource).sort((a, b) => b[1] - a[1]);
  const withCopies = L0.filter(p => p.copies.length), nCopies = d3.sum(withCopies, p => p.copies.length), copyBytes = d3.sum(withCopies, p => d3.sum(p.copies, c => c.size));
  const span = days > 730 ? (days / 365.25).toFixed(1).replace(".", ",") + " anos" : plural(days, "dia", "dias");
  const bars = (arr, max) => arr.map(([n, c]) => `<div class="hrow"><span class="lab">${esc(n)}</span><span class="val">${fNum.format(c)}</span><div class="track"><i style="width:${c / max * 100}%"></i></div></div>`).join("");
  el.innerHTML = `<div class="kpis">
      <div class="kpi"><b>${fNum.format(L0.length)}</b><span>${vids.length ? `itens (${fNum.format(vids.length)} vídeos)` : "fotos"}</span></div>
      <div class="kpi"><b>${fNum.format(state.trips.length)}</b><span>viagens · ${plural(state.moments.length, "momento", "momentos")}</span></div>
      <div class="kpi"><b>${span}</b><span>da primeira à última</span></div>
      <div class="kpi"><b>${Math.round(geo.length / L0.length * 100)}%</b><span>com GPS · +${fNum.format(est.length)} estimados</span></div>
      <div class="kpi"><b>${cities.size}</b><span>lugares em ${plural(ctr.length, "país", "países")}</span></div>
      <div class="kpi"><b>${fNum.format(Math.round(km))}</b><span>km entre fotos, em ordem</span></div>
      <div class="kpi"><b>${fNum.format(nCopies)}</b><span>cópias repetidas${copyBytes ? " · " + fmtSize(copyBytes) : ""}</span></div>
    </div>
    <div class="charts">
      <div class="panel"><h3>Viagens</h3>${state.trips.length ? `<div class="triplist">${state.trips.slice().reverse().slice(0, 8).map(t => `<button type="button" data-trip="${t.i}"><b>${esc(t.name)}</b><span>${esc(t.when)} · ${plural(t.ps.length, "item", "itens")} · toque para reproduzir</span></button>`).join("")}</div>` : '<p class="muted" style="margin:0">Nenhuma viagem encontrada. Viagens são dias seguidos com fotos longe do lugar onde você mais fotografa.</p>'}</div>
      <div class="panel"><h3>Lugares mais fotografados</h3><div class="hbars">${places.length ? bars(places, places[0][1]) : '<p class="muted">Nenhum item com local.</p>'}</div></div>
      <div class="panel"><h3>Países</h3><div class="hbars">${ctr.length ? bars(ctr.slice(0, 8), ctr[0][1]) : '<p class="muted">Nenhum item com local.</p>'}</div></div>
      <div class="panel"><h3>Hora do dia</h3><div class="cols">${byHour.map((c, h) => `<div class="${h === hh ? "hi" : ""}" style="height:${c / mh * 100}%" title="${h}h: ${c}"></div>`).join("")}</div>
        <div class="colx"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>
        <p class="fact muted" style="margin:10px 0 0">Horário mais fotografado: <b>${hh}h às ${hh + 1}h</b>.</p></div>
      <div class="panel"><h3>Dia da semana</h3><div class="cols">${byWd.map((c, d) => `<div class="${c === mw ? "hi" : ""}" style="height:${c / mw * 100}%" title="${wd[d]}: ${c}"></div>`).join("")}</div>
        <div class="colx">${wd.map(d => `<span>${d}</span>`).join("")}</div></div>
      <div class="panel"><h3>Câmeras</h3><div class="hbars">${bars(cams, cams[0][1])}</div></div>
      <div class="panel"><h3>Dia mais movimentado</h3>${busyL.length ? `<p class="fact" style="margin:0 0 10px"><b>${cap(fLong.format(busyL[0].date))}</b><br><span class="muted">${plural(busy[1], "item", "itens")}${loc(busyL[0]) ? " em " + esc(loc(busyL[0]).place.label) : ""}</span></p>
        <div class="grid" data-list="${busyL.map(p => p.id).join(",")}">${busyL.slice(0, 8).map(p => tileHTML(p, true)).join("")}</div>` : ""}</div>
      <div class="panel"><h3>Cópias repetidas</h3>${withCopies.length ? `<p class="muted" style="margin:0 0 10px;font-size:13px">${plural(withCopies.length, "item aparece", "itens aparecem")} em mais de um lugar e as cópias ocupam ${fmtSize(copyBytes)}. Nada é apagado.</p>
        <div class="duplist" data-list="${withCopies.map(p => p.id).join(",")}">${withCopies.slice(0, 5).map(p => `<div data-open="${p.id}" role="button" tabindex="0"><b>${esc(p.name)} · ×${p.copies.length + 1}</b>${[p, ...p.copies].map(c => `<code>${esc(c.path)}</code>`).join("")}</div>`).join("")}</div>
        ${withCopies.length > 5 ? `<p class="muted" style="font-size:13px;margin:8px 0 0">Use o filtro “Com cópias” para ver todos.</p>` : ""}` : '<p class="muted" style="margin:0">Nenhum arquivo repetido.</p>'}</div>
      <div class="panel"><h3>De onde veio a data</h3><div class="hbars">${bars(srcs, L0.length)}</div>
        <p class="muted" style="margin:10px 0 0;font-size:13px">Sem EXIF (prints, fotos do WhatsApp), a data sai do nome do arquivo ou da data de modificação. Para corrigir, use “Ajustar datas” na linha do tempo.</p></div>
    </div>`;
}

/* ---------- visualizador ---------- */
const LB = {
  list: [], i: 0, url: null, vurl: null,
  open(id, list) { this.list = list && list.length ? list : state.V; this.i = Math.max(0, this.list.findIndex(p => p.id === id)); $("#lb").hidden = false; document.body.style.overflow = "hidden"; this.show(); $("#lbClose").focus(); },
  close() { $("#lb").hidden = true; document.body.style.overflow = ""; this.rel(); },
  rel() {
    if (this.url && this.url.startsWith("blob:") && !isKept(this.url)) URL.revokeObjectURL(this.url); this.url = null;
    const v = $("#lbVid"); v.pause(); v.removeAttribute("src"); v.load(); if (this.vurl) URL.revokeObjectURL(this.vurl); this.vurl = null;
  },
  show() {
    const p = this.list[this.i]; if (!p) return; this.rel();
    const img = $("#lbImg"), vid = $("#lbVid");
    if (p.video && p.file) { img.hidden = true; vid.hidden = false; this.vurl = URL.createObjectURL(p.file); vid.src = this.vurl; vid.poster = p.thumb || ""; }
    else { vid.hidden = true; img.hidden = false; this.url = fullSrc(p); img.src = this.url || ""; img.alt = p.name; }
    $("#lbStamp").textContent = stamp(p.date);
    $("#lbPos").textContent = `${this.i + 1} de ${this.list.length}`;
    $("#lbTitle").textContent = cap(fLong.format(p.date));
    const e = p.exp || {}, l = loc(p);
    const expo = [e.t ? (e.t >= 1 ? e.t + "s" : "1/" + Math.round(1 / e.t) + "s") : null, e.f ? "f/" + String(e.f).replace(".", ",") : null, e.iso ? "ISO " + e.iso : null, e.fl ? Math.round(e.fl * 10) / 10 + " mm" : null].filter(Boolean).join(" · ");
    let locTxt = "sem GPS";
    if (l && !l.est) locTxt = esc(l.place.label);
    else if (l && l.est) { const s = state.byId.get(p.est.from); locTxt = `${esc(l.place.label)} <span class="warn">(estimado)</span><br><span style="color:#8fa3c3;font-size:12px">pela foto das ${s ? fTime.format(s.date) : "?"}, ${Math.round(p.est.gap / 60000)} min de diferença</span>`; }
    const trip = state.trips.find(t => t.ids.has(p.id));
    const rows = [
      ["Hora", esc(fTime.format(p.date))],
      ["Data vinda de", p.edited ? `<span class="warn">ajustada por você</span><br><span style="color:#8fa3c3;font-size:12px">original: ${fFull.format(p.origDate)} (${esc(p.dateSource)})</span>` : esc(p.dateSource)],
      ["Local", locTxt],
      l ? ["Coordenadas", `${l.lat.toFixed(5)}, ${l.lon.toFixed(5)}${p.alt ? " · " + Math.round(p.alt) + " m" : ""}`] : null,
      trip ? ["Viagem", `${esc(trip.name)} · ${esc(trip.when)}`] : null,
      p.video ? ["Vídeo", fmtDur(p.dur) || "duração desconhecida"] : null,
      ["Câmera", esc([p.make, p.model].filter(Boolean).join(" ") || "—")], p.lens ? ["Lente", esc(p.lens)] : null, expo ? ["Exposição", esc(expo)] : null,
      ["Arquivo", `<code>${esc(p.path)}</code>`], ["Tamanho", (p.size ? fmtSize(p.size) : "") + (p.w ? ` · ${p.w}×${p.h}` : "")],
      p.copies && p.copies.length ? [`Cópias (${p.copies.length})`, p.copies.map(c => `<code>${esc(c.path)}</code>`).join("")] : null,
      !p.video && p.viewable === false ? ["Aviso", "Seu navegador não abre este formato (ex.: HEIC); mostrando a miniatura embutida."] : null
    ].filter(Boolean);
    $("#lbMeta").innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("");
    $("#lbMap").hidden = !l;
  },
  step(d) { if (!this.list.length) return; this.i = (this.i + d + this.list.length) % this.list.length; this.show(); }
};

/* ---------- navegação ---------- */
const VIEWS = ["linha", "mapa", "viagem", "neste-dia", "numeros"];
function go(v, push = true) {
  if (!VIEWS.includes(v)) v = "linha";
  if (state.view === "viagem" && v !== "viagem") Trip.stop();
  if (v !== "linha" && state.selecting) setSelecting(false);
  state.view = v;
  VIEWS.forEach(x => { $("#view-" + x).hidden = x !== v; $("#tab-" + x).setAttribute("aria-selected", x === v); });
  if (push && location.hash !== "#" + v) history.replaceState(null, "", "#" + v);
  if (push) scrollTo(0, 0);
  Scrub.build();
  if (v === "mapa") requestAnimationFrame(() => MapView.render());
  if (v === "viagem") requestAnimationFrame(() => Trip.render());
  if (v === "linha") requestAnimationFrame(() => { renderHist(); Scrub.build(); });
}
function renderAll() {
  state.V = visible(); state.moments = computeMoments(state.V); state.trips = detectTrips(state.V);
  const prim = state.photos.filter(p => !p.dupOf).length, fc = filterCount();
  $("#n-linha").textContent = state.V.length ? fNum.format(state.V.length) : "";
  $("#n-mapa").textContent = geoV().length ? fNum.format(geoV().length) : "";
  if (state.sample) $("#sampleCount").textContent = `${prim} fotos de exemplo`;
  $("#fCount").textContent = fc ? `Mostrando ${fNum.format(state.V.length)} de ${fNum.format(prim)}` : plural(prim, "item", "itens");
  $("#fBadge").hidden = !fc; $("#fBadge").textContent = fc; $("#fClear").hidden = !fc;
  renderTimeline(); renderOnDay(); renderStats();
  MapView.sel = null; MapView.render(true);
  if (state.view === "viagem") Trip.render(); else { Trip.buildScope(); Trip.compute(); }
  observeThumbs();
}
let toastT;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 5000); }

/* ---------- eventos ---------- */
document.querySelectorAll(".tab").forEach(b => b.onclick = () => go(b.dataset.view));
window.addEventListener("hashchange", () => go(location.hash.slice(1), false));
$("#btnFiles").onclick = () => $("#fileInput").click();
$("#btnDir").onclick = () => FS.ok ? FS.pick() : $("#dirInput").click();
$("#fileInput").onchange = e => { importFiles([...e.target.files]); e.target.value = ""; };
$("#dirInput").onchange = e => { importFiles([...e.target.files]); e.target.value = ""; };
let clearArm = null;
$("#btnClear").onclick = () => {
  const b = $("#btnClear");
  if (!clearArm) { b.textContent = "Confirmar: limpar tudo"; b.classList.add("danger"); clearArm = setTimeout(() => { clearArm = null; b.textContent = "Limpar tudo"; b.classList.remove("danger"); }, 3500); return; }
  clearTimeout(clearArm); clearArm = null; b.textContent = "Limpar tudo"; b.classList.remove("danger");
  Trip.stop(); clearAll(); state.sample = true; $("#notice").hidden = false; b.hidden = true; loadSamples();
  toast("Lista limpa (seus arquivos continuam no lugar). Voltando ao exemplo.");
};
$("#btnFilters").onclick = () => { const f = $("#filters"); f.hidden = !f.hidden; $("#btnFilters").setAttribute("aria-expanded", !f.hidden); };
const FMAP = { fType: "type", fPlace: "place", fCam: "cam", fFrom: "from", fTo: "to", fNoGps: "noGps", fEst: "est", fNoExif: "noExif", fDups: "dups" };
for (const [id, k] of Object.entries(FMAP)) $("#" + id).addEventListener("change", e => {
  state.filter[k] = e.target.type === "checkbox" ? e.target.checked : e.target.value; Trip.stop(); Trip.i = 0; renderAll();
});
$("#fClear").onclick = () => {
  state.filter = { type: "", place: "", cam: "", from: "", to: "", noGps: false, est: false, noExif: false, dups: false };
  for (const id of Object.keys(FMAP)) { const el = $("#" + id); if (el.type === "checkbox") el.checked = false; else el.value = ""; }
  renderAll();
};
/* linha do tempo */
$("#grpSeg").addEventListener("click", e => { const b = e.target.closest("[data-g]"); if (b) setGroup(b.dataset.g); });
$("#tsRange").oninput = e => { state.size = +e.target.value; LS.set("pv-tamanho", state.size); $("#timeline").style.setProperty("--ts", TS[state.size] + "px"); clearTimeout(Scrub.rt); Scrub.rt = setTimeout(() => Scrub.measure(), 300); };
$("#ordBtn").onclick = () => { state.order = state.order === "desc" ? "asc" : "desc"; LS.set("pv-ordem", state.order); renderTimeline(); observeThumbs(); scrollTo(0, 0); };
$("#btnSelect").onclick = () => setSelecting(!state.selecting);
$("#selDone").onclick = () => setSelecting(false);
$("#selNone").onclick = () => { state.sel.clear(); document.querySelectorAll("#timeline .tile.sel").forEach(t => t.classList.remove("sel")); updSel(); };
$("#adjApply").onclick = () => {
  const ms = ((+$("#adjD").value || 0) * 1440 + (+$("#adjH").value || 0) * 60 + (+$("#adjM").value || 0)) * 60000;
  if (!ms) { toast("Informe quantos dias, horas ou minutos mover (use números negativos para voltar)."); return; }
  shiftSel(ms);
};
$("#adjSet").onclick = () => {
  const v = $("#adjAt").value; if (!v) return;
  const first = [...state.sel].map(id => state.byId.get(id)).filter(Boolean).sort((a, b) => a.date - b.date)[0];
  if (first) shiftSel(new Date(v) - first.date);
};
$("#adjReset").onclick = () => {
  for (const id of state.sel) { const p = state.byId.get(id); if (p) { p.date = p.origDate; markEdited(p); } }
  afterEdit("Datas originais restauradas.");
};
document.addEventListener("click", e => {
  const tr = e.target.closest("[data-trip]"); if (tr) { Trip.playTrip(+tr.dataset.trip); return; }
  const gy = e.target.closest("[data-goto-year]"); if (gy) { setGroup("mes"); scrollToEl("y" + gy.dataset.gotoYear); return; }
  const gm = e.target.closest("[data-goto]"); if (gm) { const [y, m] = gm.dataset.goto.split("-"); setGroup("dia"); scrollToEl(`m${y}-${m}`); return; }
  const sg = e.target.closest("[data-selgroup]");
  if (sg) { const grp = sg.closest("[data-group]"), ids = grp.querySelector("[data-list]").dataset.list.split(",").map(Number);
    const all = ids.every(id => state.sel.has(id)); ids.forEach(id => all ? state.sel.delete(id) : state.sel.add(id));
    grp.querySelectorAll(".tile").forEach(t => t.classList.toggle("sel", state.sel.has(+t.dataset.open))); updSel(); return; }
  const t = e.target.closest("[data-open]"); if (!t) return;
  const id = +t.dataset.open;
  if (state.selecting && t.closest("#timeline")) { state.sel.has(id) ? state.sel.delete(id) : state.sel.add(id); t.classList.toggle("sel", state.sel.has(id)); updSel(); return; }
  const holder = t.closest("[data-list]");
  LB.open(id, holder ? holder.dataset.list.split(",").map(Number).map(i => state.byId.get(i)).filter(Boolean) : null);
});
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.matches(".duplist [data-open]")) { e.target.click(); return; }
  if (!$("#lb").hidden) { if (e.key === "Escape") LB.close(); else if (e.key === "ArrowLeft") LB.step(-1); else if (e.key === "ArrowRight") LB.step(1); return; }
  if (e.key === "Escape" && !$("#mapCfg").hidden) { toggleCfg(false); return; }
  if (state.view === "viagem" && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) {
    if (e.key === " ") { e.preventDefault(); Trip.play(); } else if (e.key === "ArrowLeft") { Trip.stop(); Trip.show(Trip.i - 1); } else if (e.key === "ArrowRight") { Trip.stop(); Trip.show(Trip.i + 1); }
  }
});
$("#lbClose").onclick = () => LB.close();
$("#lbPrev").onclick = () => LB.step(-1);
$("#lbNext").onclick = () => LB.step(1);
$("#lbMap").onclick = () => { const p = LB.list[LB.i]; LB.close(); MapView.focus(p); };
$("#lbTrip").onclick = () => { const p = LB.list[LB.i]; LB.close(); Trip.startFrom(p); };
$("#lb").addEventListener("click", e => { if (e.target.classList.contains("pic")) LB.close(); });
/* mapa */
$("#btnCfg").onclick = () => toggleCfg($("#mapCfg").hidden);
$("#zFit").onclick = () => { if (MapView.gm) { MapView.gm.fit(MapView.items().map(loc), { maxZoom: 12, animate: true }); MapView.sel = null; MapView.side(null); } };
$("#mapSearch").addEventListener("input", e => Search.run(e.target.value));
$("#mapSearch").addEventListener("keydown", e => Search.key(e));
$("#mapSearch").addEventListener("blur", () => setTimeout(() => $("#sres").hidden = true, 150));
$("#mapSearch").addEventListener("focus", e => { if (e.target.value) Search.run(e.target.value); });
/* viagem */
$("#scSel").onchange = e => { Trip.scope = e.target.value; $("#scCustom").hidden = Trip.scope !== "custom"; Trip.rescope(); };
$("#scPace").onchange = e => { LS.set("pv-ritmo", e.target.value); Trip.rescope(); };
$("#scVid").onchange = () => Trip.rescope();
$("#scFrom").onchange = $("#scTo").onchange = () => Trip.rescope();
$("#pSpeed").onchange = () => Trip.compute();
$("#pPlay").onclick = () => Trip.play();
$("#pPrev").onclick = () => { Trip.stop(); Trip.show(Trip.i - 1); };
$("#pNext").onclick = () => { Trip.stop(); Trip.show(Trip.i + 1); };
$("#pRange").oninput = e => { Trip.stop(); Trip.show(+e.target.value, true); };
$("#odDate").onchange = () => { renderOnDay(); observeThumbs(); };
/* arrastar e soltar */
let dragN = 0;
window.addEventListener("dragenter", e => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { dragN++; $("#drop").hidden = false; } });
window.addEventListener("dragleave", () => { if (--dragN <= 0) { dragN = 0; $("#drop").hidden = true; } });
window.addEventListener("dragover", e => e.preventDefault());
window.addEventListener("drop", async e => {
  e.preventDefault(); dragN = 0; $("#drop").hidden = true;
  const items = [...(e.dataTransfer.items || [])], out = [];
  const entries = items.map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  if (entries.length) { $("#progress").hidden = false; $("#progressText").textContent = "Procurando arquivos nas pastas…"; for (const en of entries) await walkEntry(en, out); $("#progress").hidden = true; }
  else out.push(...e.dataTransfer.files);
  importFiles(out);
});
let rT; window.addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(() => {
  if (state.view === "linha") { renderHist(); Scrub.measure(); }
  if (state.view === "mapa" && MapView.gm) MapView.gm.map.invalidateSize();
  if (state.view === "viagem" && Trip.gm) Trip.gm.map.invalidateSize();
}, 200); });
const hdr = $(".top");
const setHdr = () => document.documentElement.style.setProperty("--hdr", (getComputedStyle(hdr).position === "sticky" ? hdr.offsetHeight : 0) + "px");
if ("ResizeObserver" in window) new ResizeObserver(setHdr).observe(hdr); setHdr();
const recolor = () => { if (MapView.gm) { MapView.gm.recolor(); MapView.drawData(); MapView.legend(); } if (Trip.gm) { Trip.gm.recolor(); Trip.drawRoute(); Trip.show(Trip.i, true); } };
const mq = matchMedia("(prefers-color-scheme: dark)");
mq.addEventListener ? mq.addEventListener("change", recolor) : mq.addListener(recolor);
new MutationObserver(recolor).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

/* ---------- início ---------- */
if (typeof d3 === "undefined" || typeof exifr === "undefined") {
  document.querySelector("main").insertAdjacentHTML("afterbegin", '<div class="empty" style="margin-top:16px">As bibliotecas da página não carregaram. Verifique a internet e recarregue.</div>');
} else {
  Scrub.init();
  if (/github\.io$/.test(location.hostname)) $("#btnDownload").hidden = false;
  go(location.hash.slice(1) || "linha", false);
  loadSamples();
  renderRemember();
}
