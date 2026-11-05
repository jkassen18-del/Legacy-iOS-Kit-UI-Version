/* Legacy iOS Kit — desktop UI logic */
"use strict";

const $ = (s, r = document) => r.querySelector(s);

const state = {
  env: null,
  device: null,
  selectedFlags: new Set(),
  section: null,       // current nav section id
  session: null,
  running: false,
  decoder: null,
  evtSource: null,
  // console incremental render
  rawText: "",
  curEl: null,
  curText: "",
  carry: "",
};

const NAV = [
  ...MENU.map((g) => ({ id: g.id, label: g.group, icon: g.icon })),
  { id: "flags", label: "Launch options", icon: "advanced" },
  { id: "console", label: "Console", icon: "console" },
];

let consoleEl, interactEl;

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", () => {
  consoleEl = $("#console");
  interactEl = $("#interact");
  initTheme();
  buildNav();
  wire();
  selectSection(MENU[0].id);
  loadEnv();
  loadDevice();
});

/* ------------------------------------------------------------------ */
/* theme                                                               */
/* ------------------------------------------------------------------ */
function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem("lik-theme"); } catch {}
  if (saved) document.documentElement.setAttribute("data-theme", saved);
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme");
  const isDark = cur === "dark" ||
    (cur !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  const next = isDark ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("lik-theme", next); } catch {}
}

/* ------------------------------------------------------------------ */
/* api                                                                 */
/* ------------------------------------------------------------------ */
async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); if (j.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  return res.json();
}
function toast(msg, ms = 2600) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), ms);
}
function icon(name, cls) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"${cls ? ` class="${cls}"` : ""}>${ICONS[name] || ""}</svg>`;
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ------------------------------------------------------------------ */
/* navigation                                                          */
/* ------------------------------------------------------------------ */
function buildNav() {
  const nav = $("#nav");
  nav.innerHTML = "";
  NAV.forEach((item) => {
    const b = document.createElement("button");
    b.className = "nav-item";
    b.dataset.id = item.id;
    b.innerHTML = `<span class="glyph">${icon(item.icon)}</span><span class="label">${esc(item.label)}</span>` +
      (item.id === "console" ? `<span class="run-dot" hidden></span>` : "");
    b.addEventListener("click", () => selectSection(item.id));
    nav.appendChild(b);
  });
}

function setActiveNav(id) {
  document.querySelectorAll(".nav-item").forEach((n) =>
    n.classList.toggle("active", n.dataset.id === id));
}

function selectSection(id) {
  state.section = id;
  setActiveNav(id);
  $("#source").classList.remove("open");
  const navItem = NAV.find((n) => n.id === id);
  $("#titleSub").textContent = navItem ? navItem.label : "";

  if (id === "console") {
    $("#pane").hidden = true;
    $("#consolePane").hidden = false;
    return;
  }
  $("#consolePane").hidden = true;
  const pane = $("#pane");
  pane.hidden = false;
  if (id === "flags") renderFlagsPane(pane);
  else renderGroupPane(pane, id);

  pane.classList.remove("swap");
  void pane.offsetWidth; // reflow so the animation restarts
  pane.classList.add("swap");
}

/* ------------------------------------------------------------------ */
/* panes                                                               */
/* ------------------------------------------------------------------ */
function restoreMissing() { return !state.env || !state.env.restore_sh; }

function actionEnabled(action) {
  if (restoreMissing()) return false;
  if (!action.modes) return true;
  const mode = state.device && state.device.mode;
  if (!mode || mode === "none") return true; // permissive when unknown
  return action.modes.includes(mode);
}

function renderGroupPane(pane, id) {
  const grp = MENU.find((g) => g.id === id);
  if (!grp) { pane.innerHTML = ""; return; }
  let html = `<h2>${esc(grp.group)}</h2><p class="blurb">${esc(grp.blurb)}</p>`;
  if (restoreMissing()) {
    html += `<div class="note alert">${icon("device")}<div><b>restore.sh wasn't found.</b> Put the <code>gui</code> folder inside a Legacy iOS Kit checkout, or set <code>LIK_RESTORE</code>, then press Refresh.</div></div>`;
  }
  html += `<div class="group">`;
  grp.actions.forEach((a) => {
    const enabled = actionEnabled(a);
    const kind = a.launch ? "Starts now" : "Opens menu";
    html += `<button class="row${enabled ? "" : " disabled"}" data-action="${a.id}">
      <span class="glyph">${icon(a.icon)}</span>
      <span class="body"><span class="title">${esc(a.title)}</span><span class="desc">${esc(a.desc)}</span></span>
      <span class="trail"><span class="kind">${enabled ? kind : modeHint(a)}</span><span class="chev">${icon("chevron")}</span></span>
    </button>`;
  });
  html += `</div>`;
  pane.innerHTML = html;
  pane.querySelectorAll(".row").forEach((row) => {
    const a = grp.actions.find((x) => x.id === row.dataset.action);
    if (a && actionEnabled(a)) row.addEventListener("click", () => launchAction(a));
  });
}

function modeHint(a) {
  if (restoreMissing()) return "unavailable";
  return a.modes ? a.modes.join(" or ") + " only" : "unavailable";
}

function renderFlagsPane(pane) {
  let html = `<h2>Launch options</h2><p class="blurb">Extra flags applied to whatever you start next.</p><div class="flags"><div class="group">`;
  FLAGS.forEach((f, i) => {
    const on = state.selectedFlags.has(f.flag);
    html += `<label class="flag">
      <span class="body"><span class="title">${esc(f.name)}</span><span class="desc">${esc(f.desc)} <code>${esc(f.flag)}</code></span></span>
      <span class="switch"><input type="checkbox" data-flag="${esc(f.flag)}"${on ? " checked" : ""}><span class="track"></span></span>
    </label>`;
  });
  html += `</div></div>`;
  pane.innerHTML = html;
  pane.querySelectorAll("input[data-flag]").forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) state.selectedFlags.add(cb.dataset.flag);
      else state.selectedFlags.delete(cb.dataset.flag);
    });
  });
}

/* ------------------------------------------------------------------ */
/* environment + device                                                */
/* ------------------------------------------------------------------ */
async function loadEnv() {
  try {
    state.env = await api("/api/env");
    renderEnv(state.env);
  } catch (e) {
    $("#envState").className = "state bad";
    $("#envTxt").textContent = "backend unreachable";
  }
  if (state.section && state.section !== "console" && state.section !== "flags")
    renderGroupPane($("#pane"), state.section);
}

function renderEnv(env) {
  const ok = !!env.restore_sh;
  $("#envState").className = "state " + (ok ? "ok" : "bad");
  $("#envTxt").textContent = ok ? "restore.sh ready" : "restore.sh not found";
  $("#envTxt").title = env.restore_sh || "";
  const tools = env.tools || {};
  const host = $("#tools");
  host.innerHTML = "";
  ["bash", "sudo", "irecovery", "ideviceinfo"].forEach((name) => {
    if (!(name in tools)) return;
    const s = document.createElement("span");
    s.className = "t" + (tools[name] ? " has" : "");
    s.textContent = name;
    s.title = tools[name] ? `${name} found` : `${name} not in PATH`;
    host.appendChild(s);
  });
}

async function loadDevice() {
  $("#refreshLabel").innerHTML = `<span class="spin"></span>`;
  try {
    state.device = await api("/api/device");
  } catch { state.device = { mode: "none" }; }
  renderDevice(state.device);
  $("#refreshLabel").textContent = "Refresh";
  if (state.section && state.section !== "console" && state.section !== "flags")
    renderGroupPane($("#pane"), state.section);
}

function renderDevice(dev) {
  const mode = dev.mode || "none";
  const connected = mode !== "none";
  $("#devName").textContent = dev.name || (connected ? "Apple device" : "No device");
  const bits = [];
  if (dev.product_type) bits.push(dev.product_type);
  else if (dev.model) bits.push(dev.model);
  if (dev.version) bits.push("iOS " + dev.version);
  $("#devLine").textContent = bits.length ? bits.join(", ")
    : (connected ? (dev.source ? "via " + dev.source : "connected") : "nothing connected");
  const pill = $("#devPill");
  pill.textContent = mode;
  pill.className = "pill" + (connected ? " live" : "");
}

/* ------------------------------------------------------------------ */
/* launch + console                                                    */
/* ------------------------------------------------------------------ */
function collectFlags(action) {
  const flags = [];
  const push = (f) => { if (f && !flags.includes(f)) flags.push(f); };
  if (action.launch && action.launch.flags) action.launch.flags.forEach(push);
  if (action.flags) action.flags.forEach(push);
  state.selectedFlags.forEach(push);
  return flags;
}

async function launchAction(action) {
  if (state.running) {
    if (!confirm("A session is already running. Stop it and start a new one?")) return;
    await stopSession();
  }
  const flags = collectFlags(action);
  resetConsole();
  selectSection("console");
  appendMeta(`Starting ${action.title}`, "meta");
  try {
    const r = await api("/api/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flags }),
    });
    state.session = r.session;
    $("#runCmd").textContent = "restore.sh " + (r.flags || flags).join(" ");
    setRunning(true);
    connectStream(r.session);
  } catch (e) {
    appendMeta("Could not start: " + e.message, "error");
    setRunning(false);
    toast("Launch failed");
  }
}

function connectStream(session) {
  if (state.evtSource) { try { state.evtSource.close(); } catch {} }
  state.decoder = new TextDecoder("utf-8");
  const es = new EventSource(`/api/stream?session=${encodeURIComponent(session)}`);
  state.evtSource = es;
  es.addEventListener("out", (ev) => {
    feedConsole(state.decoder.decode(base64ToBytes(ev.data), { stream: true }));
  });
  es.addEventListener("closed", (ev) => {
    const tail = state.decoder ? state.decoder.decode() : "";
    if (tail) feedConsole(tail);
    let code = null; try { code = JSON.parse(ev.data).exit_code; } catch {}
    appendMeta(`Session ended${code != null ? ` (exit ${code})` : ""}`, "meta");
    setRunning(false);
    es.close();
  });
}

async function stopSession() {
  if (!state.session) return;
  try {
    await api("/api/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session: state.session }),
    });
  } catch {}
  setRunning(false);
  if (state.evtSource) { try { state.evtSource.close(); } catch {} }
}

function setRunning(running) {
  state.running = running;
  const rs = $("#runStatus");
  rs.classList.toggle("on", running);
  $("#runText").textContent = running ? "running" : "stopped";
  $("#stopBtn").disabled = !running;
  const dot = document.querySelector('.nav-item[data-id="console"] .run-dot');
  if (dot) dot.hidden = !running;
  if (!running) hideInteract();
}

async function sendRaw(data) {
  if (!state.session || !state.running) return;
  appendMeta(data.replace(/\n$/, "") || "⏎", "echo");
  hideInteract();
  try {
    await api("/api/input", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session: state.session, data }),
    });
  } catch (e) { toast("Input failed"); }
}

/* ------------------------------------------------------------------ */
/* console rendering (incremental, line-oriented)                      */
/* ------------------------------------------------------------------ */
function resetConsole() {
  state.rawText = ""; state.curEl = null; state.curText = ""; state.carry = "";
  consoleEl.innerHTML = "";
  hideInteract();
}

function stripAnsi(text) {
  return text
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "")   // OSC
    .replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, "")        // CSI
    .replace(/\x1b[=>()][0-9A-Za-z]?/g, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");     // other control chars
}

function ensureCurEl() {
  if (!state.curEl) {
    state.curEl = document.createElement("span");
    state.curEl.className = "ln";
    consoleEl.appendChild(state.curEl);
  }
}
function paintCurEl() {
  ensureCurEl();
  state.curEl.textContent = state.curText;
  state.curEl.className = "ln " + classify(state.curText);
}
function commitLine() {
  paintCurEl();
  consoleEl.appendChild(document.createTextNode("\n"));
  state.curEl = null; state.curText = "";
}

function feedConsole(text) {
  // PTYs emit CRLF; collapse \r\n to \n (carry a split \r across chunks) so the
  // CR before each LF is not mistaken for a carriage-return overwrite.
  let t = state.carry + text;
  state.carry = "";
  if (t.endsWith("\r")) { state.carry = "\r"; t = t.slice(0, -1); }
  const clean = stripAnsi(t).replace(/\r\n/g, "\n");
  state.rawText += clean;
  if (state.rawText.length > 400000) state.rawText = state.rawText.slice(-380000);

  const atBottom = consoleEl.scrollTop + consoleEl.clientHeight >= consoleEl.scrollHeight - 40;
  const parts = clean.split("\n");
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (seg.indexOf("\r") >= 0) {
      const sp = seg.split("\r");
      state.curText = sp[sp.length - 1];       // carriage return overwrites the line
    } else {
      state.curText += seg;
    }
    if (i < parts.length - 1) commitLine();
    else paintCurEl();
  }
  trimConsole();
  if (atBottom) consoleEl.scrollTop = consoleEl.scrollHeight;
  parsePrompt();
}

function trimConsole() {
  // keep the DOM bounded; drop oldest nodes in pairs (span + newline)
  const max = 7000;
  while (consoleEl.childNodes.length > max) {
    consoleEl.removeChild(consoleEl.firstChild);
  }
}

function appendMeta(text, cls) {
  // finish the current line first so meta sits on its own line
  if (state.curText) commitLine();
  else if (state.curEl) { consoleEl.appendChild(document.createTextNode("\n")); state.curEl = null; }
  const atBottom = consoleEl.scrollTop + consoleEl.clientHeight >= consoleEl.scrollHeight - 40;
  const span = document.createElement("span");
  span.className = "ln " + (cls || "meta");
  span.textContent = text;
  consoleEl.appendChild(span);
  consoleEl.appendChild(document.createTextNode("\n"));
  if (atBottom) consoleEl.scrollTop = consoleEl.scrollHeight;
}

function classify(line) {
  const l = line.trimStart();
  if (l.startsWith("[Input]")) return "input";
  if (l.startsWith("[Log]")) return "log";
  if (l.startsWith("[WARNING]")) return "warn";
  if (l.startsWith("[Error]")) return "error";
  if (/^\d+\)\s/.test(l)) return "prompt";
  if (l.startsWith("#?")) return "prompt";
  if (l.includes("*** Legacy iOS Kit") || l.startsWith("***")) return "title";
  if (l.startsWith(">")) return "title";
  if (l.startsWith("*") || l.startsWith("-")) return "info";
  return "";
}

/* ------------------------------------------------------------------ */
/* prompt parsing                                                      */
/* ------------------------------------------------------------------ */
function parsePrompt() {
  if (!state.running) { hideInteract(); return; }
  const clean = state.rawText;
  const tail = clean.slice(-6000);
  const lines = clean.split("\n").filter((l) => l.trim().length);
  const last = lines[lines.length - 1] || "";

  const yn = tail.match(/\((y\/N|Y\/n)\)\s*:?\s*$/i) || last.match(/\((y\/N|Y\/n)\)/i);
  if (yn) { showYesNo(cleanPrompt(last), /Y\/n/.test(yn[0])); return; }

  if (/press enter\/return to continue/i.test(last) ||
      /press enter\/return to continue/i.test(tail.slice(-120))) {
    showContinue(cleanPrompt(last)); return;
  }

  const options = parseOptions(clean);
  if (options && options.length) {
    let q = "Select an option";
    const idx = clean.lastIndexOf("[Input]");
    if (idx !== -1) q = cleanPrompt(clean.slice(idx).split("\n")[0]);
    showOptions(q, options); return;
  }
  showText(cleanPrompt(last));
}

function parseOptions(clean) {
  let region = clean;
  const idx = clean.lastIndexOf("[Input]");
  if (idx !== -1) region = clean.slice(idx);
  if (region.indexOf("#?") === -1 && !/\n\s*\d+\)\s/.test(region)) return null;
  const map = new Map();
  const re = /(\d+)\)\s+(.+?)(?=\s{2,}\d+\)\s|\n|$)/g;
  let m;
  while ((m = re.exec(region)) !== null) {
    const n = parseInt(m[1], 10);
    const label = m[2].trim();
    if (label && !map.has(n)) map.set(n, label);
  }
  if (!map.size) return null;
  return Array.from(map.keys()).sort((a, b) => a - b).map((n) => ({ num: n, label: map.get(n) }));
}

function cleanPrompt(line) {
  return line.replace(/^\s*\[Input\]\s*/, "").replace(/\s*#\?\s*$/, "").trim() || "Enter a response";
}

/* ---- interact UI ---- */
function hideInteract() {
  interactEl.hidden = true;
  $("#opts").innerHTML = "";
}
function showInteract(q) {
  interactEl.hidden = false;
  $("#interactQ").textContent = q;
  $("#opts").innerHTML = "";
}
function showOptions(q, options) {
  showInteract(q);
  const host = $("#opts");
  options.forEach((o) => {
    const b = document.createElement("button");
    b.className = "opt";
    b.innerHTML = `<span class="num">${o.num}</span><span class="lbl">${esc(o.label)}</span>`;
    b.addEventListener("click", () => sendRaw(o.num + "\n"));
    host.appendChild(b);
  });
}
function showYesNo(q, defYes) {
  showInteract(q);
  const host = $("#opts");
  const mk = (label, cls, val) => {
    const b = document.createElement("button");
    b.className = "opt " + cls;
    b.innerHTML = `<span class="num">${cls === "yes" ? "Y" : "N"}</span><span class="lbl">${label}</span>`;
    b.addEventListener("click", () => sendRaw(val + "\n"));
    return b;
  };
  host.appendChild(mk("Yes" + (defYes ? " — default" : ""), "yes", "y"));
  host.appendChild(mk("No" + (!defYes ? " — default" : ""), "no", "n"));
}
function showContinue(q) {
  showInteract(q || "Press Return to continue");
  const b = document.createElement("button");
  b.className = "opt";
  b.innerHTML = `<span class="num">⏎</span><span class="lbl">Continue</span>`;
  b.addEventListener("click", () => sendRaw("\n"));
  $("#opts").appendChild(b);
}
function showText(q) { showInteract(q || "Enter a response"); }

/* ------------------------------------------------------------------ */
/* utils + wiring                                                      */
/* ------------------------------------------------------------------ */
function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function wire() {
  $("#themeToggle").addEventListener("click", toggleTheme);
  $("#refreshBtn").addEventListener("click", () => { loadEnv(); loadDevice(); });
  $("#stopBtn").addEventListener("click", stopSession);
  $("#clearBtn").addEventListener("click", () => {
    state.rawText = ""; state.curEl = null; state.curText = ""; consoleEl.innerHTML = "";
  });

  const input = $("#freeInput");
  const send = () => {
    if (!state.running && input.value === "") return;
    sendRaw(input.value + "\n"); input.value = "";
  };
  $("#sendBtn").addEventListener("click", send);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); send(); } });

  const mt = $("#menuToggle");
  if (matchMedia("(max-width: 720px)").matches) mt.style.display = "inline-flex";
  mt.addEventListener("click", () => $("#source").classList.toggle("open"));

  window.addEventListener("beforeunload", () => {
    if (state.session && state.running && navigator.sendBeacon) {
      navigator.sendBeacon("/api/stop",
        new Blob([JSON.stringify({ session: state.session })], { type: "application/json" }));
    }
  });
}
