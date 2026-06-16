document.addEventListener("DOMContentLoaded", function () {

  const BUILTIN_META = {
    "greeting-display":    { label: "Greeting",   color: "#00b894", key: "pos_greeting-display" },
    "clock":               { label: "Clock",       color: "#0984e3", key: "pos_clock"            },
    "search-box":          { label: "Search Bar",  color: "#6c5ce7", key: "pos_search-box"       },
    "quick-links-section": { label: "Quick Links", color: "#e17055", key: "pos_quick-links"      },
    "weather-widget":      { label: "Weather",     color: "#00cec9", key: "pos_weather"          },
  };

  const DEFAULTS = {
    "greeting-display":    { x: 50, y: 33 },
    "clock":               { x: 50, y: 44 },
    "search-box":          { x: 50, y: 56 },
    "quick-links-section": { x: 50, y: 67 },
    "weather-widget":      { x: 3.5, y:  5 },
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


  let dragActive = false;
  let snapshot   = {};
  const cleanups  = [];
  const shieldMap = new Map();

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const SNAP_THRESHOLD = 6;
  let snapEnabled = localStorage.getItem("lge_snap") !== "false";
  let guideV = null, guideH = null;

  function setGuide(axis, pos, start, end) {
    const g = axis === "v" ? guideV : guideH;
    if (!g) return;
    if (pos == null) { g.classList.remove("lge-guide-visible"); return; }
    if (axis === "v") {
      g.style.left   = `${pos}px`;
      g.style.top    = `${start}px`;
      g.style.height = `${end - start}px`;
    } else {
      g.style.top   = `${pos}px`;
      g.style.left  = `${start}px`;
      g.style.width = `${end - start}px`;
    }
    g.classList.add("lge-guide-visible");
  }

  function bestSnap(points, targets) {
    let best = null;
    for (const p of points) {
      for (const t of targets) {
        const d = t.pos - p;
        if (Math.abs(d) <= SNAP_THRESHOLD && (!best || Math.abs(d) < Math.abs(best.delta)))
          best = { delta: d, pos: t.pos, min: t.min, max: t.max };
      }
    }
    return best;
  }

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
    guideV = document.createElement("div");
    guideV.className = "lge-guide lge-guide-v";
    guideH = document.createElement("div");
    guideH.className = "lge-guide lge-guide-h";
    document.body.append(guideV, guideH);

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

      let startMx, startMy, startPx, startPy, targets;

      function syncShield() {
        const r = native.getBoundingClientRect();
        coverRect(shield, r);
        label.style.left = `${r.left + r.width / 2}px`;
        label.style.top  = `${r.top - 22}px`;
      }

      function collectTargets() {
        const W = window.innerWidth, H = window.innerHeight;
        const xs = [0, W / 2, W].map(pos => ({ pos, min: 0, max: H }));
        const ys = [0, H / 2, H].map(pos => ({ pos, min: 0, max: W }));
        shieldMap.forEach((entry, otherId) => {
          if (otherId === id) return;
          const r = entry.native.getBoundingClientRect();
          [r.left, r.left + r.width / 2, r.right].forEach(pos =>
            xs.push({ pos, min: r.top, max: r.bottom }));
          [r.top, r.top + r.height / 2, r.bottom].forEach(pos =>
            ys.push({ pos, min: r.left, max: r.right }));
        });
        return { xs, ys };
      }

      function onMove(e) {
        const client = e.touches ? e.touches[0] : e;
        let cx = (startPx / 100) * window.innerWidth  + (client.clientX - startMx);
        let cy = (startPy / 100) * window.innerHeight + (client.clientY - startMy);

        if (snapEnabled) {
          const r = native.getBoundingClientRect();
          const hw = r.width / 2, hh = r.height / 2;
          const sx = bestSnap([cx - hw, cx, cx + hw], targets.xs);
          const sy = bestSnap([cy - hh, cy, cy + hh], targets.ys);
          if (sx) cx += sx.delta;
          if (sy) cy += sy.delta;

          if (sx) setGuide("v", sx.pos, Math.min(sx.min, cy - hh), Math.max(sx.max, cy + hh));
          else    setGuide("v", null);
          if (sy) setGuide("h", sy.pos, Math.min(sy.min, cx - hw), Math.max(sy.max, cx + hw));
          else    setGuide("h", null);
        }

        wrapper.style.left = `${clamp((cx / window.innerWidth)  * 100, 1, 99)}%`;
        wrapper.style.top  = `${clamp((cy / window.innerHeight) * 100, 1, 99)}%`;
        syncShield();
      }

      function onUp() {
        wrapper.classList.remove("lge-dragging");
        shield.classList.remove("lge-shield-dragging");
        setGuide("v", null);
        setGuide("h", null);
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
        targets = collectTargets();
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
      guideV.remove();
      guideH.remove();
      guideV = guideH = null;
    });
  }

  function enterDragMode() {
    if (dragActive) return;
    dragActive = true;

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
      <button class="lge-pill-btn lge-pill-toggle" id="lge-pill-snap"></button>
      <button class="lge-pill-btn" id="lge-pill-reset">Reset</button>
      <button class="lge-pill-btn" id="lge-pill-cancel">Cancel</button>
      <button class="lge-pill-btn" id="lge-pill-save">Save</button>`;
    document.body.appendChild(pillEl);
    requestAnimationFrame(() => requestAnimationFrame(() => pillEl.classList.add("lge-pill-visible")));

    const snapBtn = pillEl.querySelector("#lge-pill-snap");
    const renderSnap = () => {
      snapBtn.textContent = `Snap: ${snapEnabled ? "On" : "Off"}`;
      snapBtn.classList.toggle("lge-toggle-on", snapEnabled);
    };
    renderSnap();
    snapBtn.addEventListener("click", () => {
      snapEnabled = !snapEnabled;
      localStorage.setItem("lge_snap", snapEnabled);
      renderSnap();
      if (!snapEnabled) { setGuide("v", null); setGuide("h", null); }
    });

    pillEl.querySelector("#lge-pill-reset").addEventListener("click", () => {
      Object.keys(buildRegistry()).forEach(id => {
        const d = DEFAULTS[id] || { x: 50, y: 50 };
        applyPosition(id, d.x, d.y);
      });
      setGuide("v", null);
      setGuide("h", null);
      syncAllShields();
    });

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