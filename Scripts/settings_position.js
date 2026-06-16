document.addEventListener("DOMContentLoaded", function () {

  const BUILTIN_META = {
    "greeting-display":    { label: "Greeting",   color: "#00b894", key: "pos_greeting-display" },
    "clock":               { label: "Clock",       color: "#0984e3", key: "pos_clock"            },
    "search-box":          { label: "Search Bar",  color: "#6c5ce7", key: "pos_search-box"       },
    "quick-links-section": { label: "Quick Links", color: "#e17055", key: "pos_quick-links"      },
    "weather-widget":      { label: "Weather",     color: "#00cec9", key: "pos_weather"          },
  };

  const DEFAULTS = {
    "greeting-display":    { x: 50, y: 38 },
    "clock":               { x: 50, y: 46 },
    "search-box":          { x: 50, y: 58 },
    "quick-links-section": { x: 50, y: 70 },
    "weather-widget":      { x: 88, y:  8 },
  };

  const STYLE_OVERRIDES = {
    "weather-widget": { position: "relative", top: "auto", left: "auto" },
  };

  function buildRegistry() {
    const reg = {};
    Object.entries(BUILTIN_META).forEach(([id, meta]) => {
      if (document.getElementById(id)) reg[id] = meta;
    });
    document.querySelectorAll("[data-widget]").forEach(el => {
      const id = el.dataset.widget;
      if (!reg[id]) {
        reg[id] = {
          label: el.dataset.widgetLabel || id,
          color: el.dataset.widgetColor || "#a29bfe",
          key:   `pos_${id}`,
        };
        if (!DEFAULTS[id]) DEFAULTS[id] = { x: 50, y: 50 };
      }
    });
    return reg;
  }

  const canvas = document.getElementById("layout-canvas");

  function getWrapper(id) {
    let el = document.getElementById(`lw-${id}`);
    if (!el) {
      el = document.createElement("div");
      el.className = "layout-widget";
      el.id = `lw-${id}`;
      canvas.appendChild(el);
    }
    return el;
  }

  function applyPosition(id, x, y) {
    const wrapper = getWrapper(id);
    wrapper.style.left = `${x}%`;
    wrapper.style.top  = `${y}%`;
    const native = document.getElementById(id);
    if (native && native.parentNode !== wrapper) {
      if (STYLE_OVERRIDES[id]) Object.assign(native.style, STYLE_OVERRIDES[id]);
      wrapper.appendChild(native);
    }
  }

  function getSavedPos(meta, id) {
    try {
      const p = JSON.parse(localStorage.getItem(meta.key));
      if (p && typeof p.x === "number") return p;
    } catch {}
    return { ...(DEFAULTS[id] || { x: 50, y: 50 }) };
  }

  function loadPositions() {
    const reg = buildRegistry();
    Object.entries(reg).forEach(([id, meta]) => {
      const pos = getSavedPos(meta, id);
      applyPosition(id, pos.x, pos.y);
    });
  }

  loadPositions();

  function injectStyles() {
    if (document.getElementById("lge-styles")) return;
    const s = document.createElement("style");
    s.id = "lge-styles";
    s.textContent = `
      .lge-input-shield {
        position: fixed;
        z-index: 9001;
        cursor: grab;
        outline: 2px dashed rgba(255,255,255,0.4);
        outline-offset: 5px;
        border-radius: 6px;
        pointer-events: auto;
        transition: outline-color 0.15s;
      }
      .lge-input-shield:hover { outline-color: rgba(255,255,255,0.85); }
      .lge-input-shield.lge-shield-dragging {
        cursor: grabbing;
        outline-color: #00b894;
        outline-style: solid;
      }
      .layout-widget.lge-draggable:hover { z-index: 10; }
      .layout-widget.lge-dragging        { z-index: 100; }
      .lge-drag-label {
        position: fixed;
        font-size: 10px; font-weight: 700; white-space: nowrap;
        pointer-events: none; letter-spacing: 0.06em; text-transform: uppercase;
        opacity: 0; transition: opacity 0.15s;
        text-shadow: 0 1px 4px rgba(0,0,0,0.9);
        z-index: 9002;
      }
      .lge-drag-label.lge-label-visible { opacity: 1; }
      #lge-pill {
        position: fixed; bottom: 28px; left: 50%;
        transform: translateX(-50%) translateY(80px);
        display: flex; align-items: center; gap: 6px;
        background: rgba(14,18,24,0.92);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 40px; padding: 8px 8px 8px 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        backdrop-filter: blur(16px); z-index: 9000;
        transition: transform 0.35s cubic-bezier(.22,.68,0,1.2);
        font-family: inherit;
      }
      #lge-pill.lge-pill-visible { transform: translateX(-50%) translateY(0); }
      #lge-pill-label { font-size: 12px; color: rgba(255,255,255,0.5); font-weight: 600; padding-right: 4px; }
      .lge-pill-btn {
        padding: 6px 16px; border-radius: 30px; border: none;
        font-size: 12px; font-weight: 700; cursor: pointer;
        transition: all 0.18s; font-family: inherit;
      }
      #lge-pill-cancel { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.7); }
      #lge-pill-cancel:hover { background: rgba(255,255,255,0.18); color: #fff; }
      #lge-pill-save { background: #00b894; color: #fff; }
      #lge-pill-save:hover { background: #00cba6; }
    `;
    document.head.appendChild(s);
  }

  let dragActive = false;
  let snapshot   = {};
  const cleanups  = [];
  const shieldMap = new Map();

  function coverRect(el, rect) {
    el.style.left   = `${rect.left}px`;
    el.style.top    = `${rect.top}px`;
    el.style.width  = `${rect.width}px`;
    el.style.height = `${rect.height}px`;
  }

  function syncAllShields() {
    shieldMap.forEach(({ shield, label, native }) => {
      const r = native.getBoundingClientRect();
      coverRect(shield, r);
      label.style.left = `${r.left + r.width / 2}px`;
      label.style.top  = `${r.top - 22}px`;
    });
  }

  function isHidden(el) {
    const r  = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return (
      (r.width === 0 && r.height === 0) ||
      cs.display     === "none"   ||
      cs.visibility  === "hidden" ||
      cs.opacity     === "0"
    );
  }

  function buildShields(reg) {
    Object.entries(reg).forEach(([id, meta]) => {
      const native = document.getElementById(id);
      if (!native || isHidden(native)) return;

      const rect    = native.getBoundingClientRect();
      const wrapper = getWrapper(id);
      wrapper.classList.add("lge-draggable");

      const shield = document.createElement("div");
      shield.className = "lge-input-shield";
      coverRect(shield, rect);
      document.body.appendChild(shield);

      const label = document.createElement("div");
      label.className = "lge-drag-label";
      label.textContent = meta.label;
      label.style.color     = meta.color;
      label.style.left      = `${rect.left + rect.width / 2}px`;
      label.style.top       = `${rect.top - 22}px`;
      label.style.transform = "translateX(-50%)";
      document.body.appendChild(label);

      wrapper.querySelectorAll("input, button, a, select, textarea").forEach(el => {
        if ("lgeTabIndex" in el.dataset) return;
        el.dataset.lgeTabIndex = el.tabIndex;
        el.tabIndex = -1;
      });

      let startMx, startMy, startPx, startPy;

      function syncShield() {
        const r = native.getBoundingClientRect();
        coverRect(shield, r);
        label.style.left = `${r.left + r.width / 2}px`;
        label.style.top  = `${r.top - 22}px`;
      }

      function onMove(e) {
        const client = e.touches ? e.touches[0] : e;
        const nx = Math.max(1, Math.min(99, startPx + ((client.clientX - startMx) / window.innerWidth)  * 100));
        const ny = Math.max(1, Math.min(99, startPy + ((client.clientY - startMy) / window.innerHeight) * 100));
        wrapper.style.left = `${nx}%`;
        wrapper.style.top  = `${ny}%`;
        syncShield();
      }

      function onUp() {
        wrapper.classList.remove("lge-dragging");
        shield.classList.remove("lge-shield-dragging");
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup",   onUp);
        window.removeEventListener("touchmove", onMove);
        window.removeEventListener("touchend",  onUp);
      }

      function onDown(e) {
        e.preventDefault();
        const client = e.touches ? e.touches[0] : e;
        startMx = client.clientX;
        startMy = client.clientY;
        startPx = parseFloat(wrapper.style.left);
        startPy = parseFloat(wrapper.style.top);
        wrapper.classList.add("lge-dragging");
        shield.classList.add("lge-shield-dragging");
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup",   onUp);
        window.addEventListener("touchmove", onMove, { passive: false });
        window.addEventListener("touchend",  onUp);
      }

      shieldMap.set(id, { shield, label, native, wrapper });

      shield.addEventListener("mouseenter", () => label.classList.add("lge-label-visible"));
      shield.addEventListener("mouseleave", () => {
        if (!shield.classList.contains("lge-shield-dragging"))
          label.classList.remove("lge-label-visible");
      });
      shield.addEventListener("mousedown",  onDown);
      shield.addEventListener("touchstart", onDown, { passive: false });

      cleanups.push(() => {
        shield.removeEventListener("mousedown",  onDown);
        shield.removeEventListener("touchstart", onDown);
        wrapper.querySelectorAll("input, button, a, select, textarea").forEach(el => {
          if (!("lgeTabIndex" in el.dataset)) return;
          el.tabIndex = Number(el.dataset.lgeTabIndex);
          delete el.dataset.lgeTabIndex;
        });
        wrapper.classList.remove("lge-draggable", "lge-dragging");
        shield.remove();
        label.remove();
      });
    });

    const resizeObs = new ResizeObserver(syncAllShields);
    shieldMap.forEach(({ native }) => resizeObs.observe(native));
    window.addEventListener("resize", syncAllShields);

    cleanups.push(() => {
      resizeObs.disconnect();
      window.removeEventListener("resize", syncAllShields);
      shieldMap.clear();
    });
  }

  function enterDragMode() {
    if (dragActive) return;
    dragActive = true;
    injectStyles();

    const reg = buildRegistry();

    snapshot = {};
    Object.entries(reg).forEach(([id, meta]) => {
      snapshot[id] = { ...getSavedPos(meta, id) };
    });

    if (typeof closeSidebar === "function") {
      closeSidebar();
      const overlay = document.getElementById("modal-overlay");
      if (overlay) overlay.style.pointerEvents = "none";
      setTimeout(() => {
        if (overlay) overlay.style.pointerEvents = "";
        buildShields(reg);
      }, 420);
    } else {
      buildShields(reg);
    }

    showPill();
  }

  function exitDragMode(save) {
    if (!dragActive) return;
    dragActive = false;

    if (save) {
      const reg = buildRegistry();
      Object.entries(reg).forEach(([id, meta]) => {
        const wrapper = getWrapper(id);
        const x = parseFloat(wrapper.style.left);
        const y = parseFloat(wrapper.style.top);
        if (!isNaN(x) && !isNaN(y)) localStorage.setItem(meta.key, JSON.stringify({ x, y }));
      });
    } else {
      Object.entries(snapshot).forEach(([id, pos]) => applyPosition(id, pos.x, pos.y));
    }

    cleanups.forEach(fn => fn());
    cleanups.length = 0;
    hidePill();
  }

  let pillEl = null;

  function showPill() {
    if (pillEl) return;
    pillEl = document.createElement("div");
    pillEl.id = "lge-pill";
    pillEl.innerHTML = `
      <span id="lge-pill-label">Layout Edit Mode</span>
      <button class="lge-pill-btn" id="lge-pill-cancel">Cancel</button>
      <button class="lge-pill-btn" id="lge-pill-save">Save</button>`;
    document.body.appendChild(pillEl);
    requestAnimationFrame(() => requestAnimationFrame(() => pillEl.classList.add("lge-pill-visible")));
    pillEl.querySelector("#lge-pill-cancel").addEventListener("click", () => exitDragMode(false));
    pillEl.querySelector("#lge-pill-save").addEventListener("click",   () => exitDragMode(true));
  }

  function hidePill() {
    if (!pillEl) return;
    const el = pillEl;
    pillEl = null;
    el.classList.remove("lge-pill-visible");
    const cleanup = () => el.remove();
    el.addEventListener("transitionend", cleanup, { once: true });
    setTimeout(cleanup, 600);
  }

  const openBtn = document.getElementById("open-layout-editor");
  if (openBtn) openBtn.addEventListener("click", enterDragMode);

  const saveBtn = document.getElementById("save-settings");
  if (saveBtn) saveBtn.addEventListener("click", () => {
    if (typeof closeSidebar === "function") closeSidebar();
  });
});