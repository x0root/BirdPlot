/**
 * StudentViz Content Script — v0.3.0 (optimized)
 *
 * PURPOSE:
 *   Injected into supported AI-chat pages (ChatGPT, Gemini, Claude, DeepSeek,
 *   Perplexity). Watches for AI-generated ```studentviz code blocks, validates
 *   and auto-repairs the JSON, and renders interactive visuals in sandboxed
 *   iframes.
 *
 * HOW IT WORKS:
 *   1. A MutationObserver watches for new/changed DOM nodes.
 *   2. When a candidate <code> or text block is found, its text is extracted.
 *   3. The repair engine (repair.js) extracts JSON objects and fixes common
 *      AI mistakes (trailing commas, unquoted keys, etc.).
 *   4. Valid specs are validated against the studentviz/v1 schema.
 *   5. Each valid spec gets a sandboxed iframe card injected after the code
 *      block, which communicates via postMessage.
 *
 * PERFORMANCE NOTES:
 *   - Scanning is debounced (200ms) to avoid processing mid-stream.
 *   - Rendering is delayed (1400ms) until the AI stops typing.
 *   - The MutationObserver skips mutations inside already-rendered cards.
 *   - At most MAX_CARDS cards exist at once; oldest are evicted.
 *   - WeakRef is NOT used because we need to track DOM nodes that may detach.
 */
(() => {
  "use strict";

  // ─── Math builtins available in studentviz expressions ───────────────
  const MATH_BUILTINS = Object.freeze({
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan,
    atan2: Math.atan2, sqrt: Math.sqrt, abs: Math.abs,
    exp: Math.exp, log: Math.log, ln: Math.log,
    log10: Math.log10, floor: Math.floor, ceil: Math.ceil,
    min: Math.min, max: Math.max, pow: Math.pow,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  });

  // ─── Constants ───────────────────────────────────────────────────────
  const MAX_BLOCK_SIZE = 4e5;      // 400 KB per block
  const MAX_CARDS = 8;             // Limit concurrent rendered cards
  const SCAN_DEBOUNCE_MS = 60;     // Fast debounce for MutationObserver triggers
  const RENDER_DELAY_MS = 800;     // General delay for typing
  const STREAMING_RETRY_MS = 400;  // Retry delay while AI is still streaming
  const COPY_FEEDBACK_MS = 1600;   // How long "Copied" text stays visible
  const SCHEMA_ID = "studentviz/v1";

  // ─── Validation (same logic as viewer.js, kept in sync) ──────────────
  /**
   * Validate a parsed StudentViz spec object.
   * Throws descriptive Error if invalid.
   * Returns the validated (possibly mutated) spec.
   */
  function validateSpec(input) {
    const raw = typeof input === "string" ? input : JSON.stringify(input);
    if (raw.length > MAX_BLOCK_SIZE) {
      throw Error("Visual exceeds the 400 KB limit. Split it into smaller scenes.");
    }

    const spec = JSON.parse(raw, (key, value) => {
      if (["__proto__", "constructor", "prototype"].includes(key)) {
        throw Error("Unsafe key.");
      }
      return value;
    });

    if (!spec || Array.isArray(spec) || spec.$schema !== SCHEMA_ID) {
      throw Error('Expected "$schema": "studentviz/v1".');
    }
    if (!["plot", "geometry", "scene3d", "python"].includes(spec.type)) {
      throw Error("type must be plot, geometry, scene3d, or python.");
    }
    if (spec.type === "python") {
      if (typeof spec.code !== "string" || !spec.code.trim()) {
        throw Error("Python visual requires executable code.");
      }
      return spec;
    }
    if (spec.title !== undefined && (typeof spec.title !== "string" || spec.title.length > 160)) {
      throw Error("Title must be short text.");
    }
    if (spec.description !== undefined && (typeof spec.description !== "string" || spec.description.length > 1e3)) {
      throw Error("Description must be text under 1000 characters.");
    }

    // ── Parameters (sliders) ──
    spec.parameters ??= [];
    if (!Array.isArray(spec.parameters) || spec.parameters.length > 8) {
      throw Error("Use at most 8 sliders.");
    }

    const paramNames = new Set();
    for (const [idx, param] of spec.parameters.entries()) {
      if (!param || typeof param !== "object") {
        throw Error(`parameters[${idx}] must be an object like {"name":"r","min":0,"max":5,"value":1}.`);
      }
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,19}$/.test(param.name || "")) {
        throw Error(`parameters[${idx}].name must be a letter followed by letters, digits or underscore.`);
      }
      if (paramNames.has(param.name)) {
        throw Error(`parameters[${idx}].name "${param.name}" is used twice; slider names must be unique.`);
      }
      paramNames.add(param.name);

      if (![param.min, param.max, param.value].every(Number.isFinite)) {
        throw Error(`parameters[${idx}] (${param.name}) needs finite min, max and value.`);
      }
      if (param.min >= param.max) {
        throw Error(`parameters[${idx}] (${param.name}) has min ${param.min} >= max ${param.max}.`);
      }
      if (param.value < param.min || param.value > param.max) {
        throw Error(`parameters[${idx}] (${param.name}) value ${param.value} is outside ${param.min}–${param.max}.`);
      }
      if (param.max - param.min > 1e9) {
        throw Error(`parameters[${idx}] (${param.name}) range is too large.`);
      }
      if (param.step !== undefined && (!Number.isFinite(param.step) || param.step <= 0)) {
        throw Error(`parameters[${idx}] (${param.name}) step must be a positive number.`);
      }
    }

    // ── Scene3d objects ──
    if (spec.type === "scene3d" && (!Array.isArray(spec.objects) || !spec.objects.length || spec.objects.length > 20)) {
      throw Error("A scene needs 1–20 objects.");
    }

    // ── Camera ──
    if (spec.camera !== undefined && !(typeof spec.camera === "string" && spec.camera === "auto")) {
      if (!spec.camera || typeof spec.camera !== "object" || Array.isArray(spec.camera)) {
        throw Error('camera must be "auto" or an object like {"azimuth": -55, "elevation": 30}.');
      }
      for (const key of Object.keys(spec.camera)) {
        if (!["azimuth", "elevation"].includes(key)) {
          throw Error("camera accepts only azimuth and elevation.");
        }
      }
      if (spec.camera.azimuth !== undefined && (!Number.isFinite(spec.camera.azimuth) || Math.abs(spec.camera.azimuth) > 360)) {
        throw Error("Camera azimuth must be within ±360 degrees.");
      }
      if (spec.camera.elevation !== undefined && (!Number.isFinite(spec.camera.elevation) || Math.abs(spec.camera.elevation) > 89)) {
        throw Error("Camera elevation must be within ±89 degrees.");
      }
    }

    // ── Colors ──
    validateColors(spec.colors);

    // ── Grid ──
    if (spec.grid !== undefined && typeof spec.grid !== "boolean") {
      throw Error("grid must be true or false.");
    }

    // ── Controls (preset buttons) ──
    if (spec.controls !== undefined) {
      if (!Array.isArray(spec.controls) || spec.controls.length > 6) {
        throw Error("controls must be an array of at most 6 buttons.");
      }
      spec.controls.forEach((ctrl, idx) => {
        if (!ctrl || typeof ctrl !== "object" || Array.isArray(ctrl)) {
          throw Error(`controls[${idx}] must be an object like {"label":"3-4-5","values":{"a":3,"b":4}}.`);
        }
        if (typeof ctrl.label !== "string" || !ctrl.label.trim() || ctrl.label.length > 40) {
          throw Error(`controls[${idx}].label needs short text.`);
        }
        if (!ctrl.values || typeof ctrl.values !== "object" || Array.isArray(ctrl.values) || !Object.keys(ctrl.values).length) {
          throw Error(`controls[${idx}].values must map slider names to numbers.`);
        }
        for (const [name, val] of Object.entries(ctrl.values)) {
          const slider = spec.parameters.find(p => p.name === name);
          if (!slider) {
            throw Error(`controls[${idx}].values.${name} is not a slider name. Sliders: ${[...paramNames].join(", ") || "(none)"}.`);
          }
          if (!Number.isFinite(val)) {
            throw Error(`controls[${idx}].values.${name} must be a number.`);
          }
          if (val < slider.min || val > slider.max) {
            throw Error(`controls[${idx}].values.${name} = ${val} is outside the slider range ${slider.min}–${slider.max}.`);
          }
        }
      });
    }

    // ── Animation ──
    if (spec.animate !== undefined) {
      const anim = spec.animate;
      if (!anim || typeof anim !== "object" || Array.isArray(anim)) {
        throw Error('animate must be an object like {"param":"t","from":0,"to":6.28,"seconds":6,"loop":true}.');
      }
      if (typeof anim.param !== "string" || !paramNames.has(anim.param)) {
        throw Error(`animate.param must be one of the slider names (${[...paramNames].join(", ") || "none declared"}).`);
      }
      const slider = spec.parameters.find(p => p.name === anim.param);
      for (const key of ["from", "to"]) {
        if (anim[key] !== undefined && !Number.isFinite(anim[key])) {
          throw Error(`animate.${key} must be a number.`);
        }
      }
      const from = anim.from ?? slider.min;
      const to = anim.to ?? slider.max;
      if (!(from < to)) {
        throw Error("animate.from must be smaller than animate.to.");
      }
      if (from < slider.min || to > slider.max) {
        throw Error(`animate range ${from}–${to} must stay inside the ${anim.param} slider range ${slider.min}–${slider.max}.`);
      }
      if (anim.seconds !== undefined && (!Number.isFinite(anim.seconds) || anim.seconds < 0.2 || anim.seconds > 120)) {
        throw Error("animate.seconds must be between 0.2 and 120.");
      }
      for (const key of ["loop", "autoplay"]) {
        if (anim[key] !== undefined && typeof anim[key] !== "boolean") {
          throw Error(`animate.${key} must be true or false.`);
        }
      }
    }

    // ── Type-specific ──
    if (spec.type === "plot" && (!Array.isArray(spec.series) || !spec.series.length || spec.series.length > 20)) {
      throw Error("A plot needs 1–20 series.");
    }
    if (spec.type === "geometry" && (!Array.isArray(spec.points) || spec.points.length < 1 || spec.points.length > 100)) {
      throw Error("Geometry needs 1–100 points.");
    }

    return spec;
  }

  // ── Color validation ──
  const VALID_COLOR_KEYS = ["background", "grid", "axis", "text", "muted", "accent", "points", "pointsFixed", "palette"];
  const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

  function validateColors(colors) {
    if (colors === undefined) return;
    if (!colors || typeof colors !== "object" || Array.isArray(colors)) {
      throw Error('colors must be an object like {"background":"#ffffff","accent":"#111111"}.');
    }
    for (const key of Object.keys(colors)) {
      if (!VALID_COLOR_KEYS.includes(key)) {
        throw Error(`colors.${key} is not a supported colour key. Use: ${VALID_COLOR_KEYS.join(", ")}.`);
      }
      if (key === "palette") {
        if (!Array.isArray(colors.palette) || colors.palette.length < 1 || colors.palette.length > 8) {
          throw Error("colors.palette must be an array of 1–8 hex colours.");
        }
        colors.palette.forEach((c, i) => {
          if (typeof c !== "string" || !HEX_COLOR_RE.test(c)) {
            throw Error(`colors.palette[${i}] must be a hex colour like "#1f6feb" (got ${JSON.stringify(c)}).`);
          }
        });
        continue;
      }
      if (typeof colors[key] !== "string" || !HEX_COLOR_RE.test(colors[key])) {
        throw Error(`colors.${key} must be a hex colour like "#1f6feb" (got ${JSON.stringify(colors[key])}).`);
      }
    }
  }

  // ─── JSON extraction from raw text ──────────────────────────────────
  /**
   * Extract top-level balanced JSON objects from a string.
   * Returns an array of JSON-like substrings, or null if brackets are unbalanced.
   */
  function extractJsonObjects(text) {
    const source = String(text ?? "");
    const objects = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "{") {
        if (depth === 0) start = i;
        depth++;
        continue;
      }
      if (ch === "}") {
        if (depth > 0) {
          depth--;
          if (depth === 0 && start >= 0) {
            objects.push(source.slice(start, i + 1));
            start = -1;
          }
        } else {
          return null; // Unbalanced
        }
        continue;
      }
    }

    return (depth !== 0 || inString) ? null : objects;
  }

  // ─── Detection: is this text a StudentViz visual? ───────────────────
  /**
   * Determine if a raw text block looks like a StudentViz visual.
   * Checks the code fence language tag and the JSON schema marker.
   */
  function isStudentVizBlock(raw, node) {
    // Check code fence class/attributes for "studentviz" tag
    const cls = String(node?.className || "") + " " +
      String(node?.getAttribute?.("data-language") || "") + " " +
      String(node?.getAttribute?.("data-lang") || "");
    const pre = node?.closest?.("pre");
    const context = cls + " " +
      String(pre?.className || "") + " " +
      String(pre?.getAttribute?.("data-language") || "") + " " +
      String(pre?.getAttribute?.("data-lang") || "");

    // A code fence explicitly tagged as studentviz is authoritative
    if (/studentviz/i.test(context)) return true;

    // Check for Python visualization block or flags
    if (globalThis.StudentVizRepair?.isPythonBlock?.(raw, node)) return true;

    // Otherwise require the exact v1 schema marker in the text
    if (/["']?(?:\$schema|schema)["']\s*:\s*["']studentviz\/v1["']/i.test(raw)) return true;

    // Try parsing with the repair engine as a final fallback
    try {
      const value = globalThis.StudentVizRepair.parseCandidate(raw).value;
      const schema = value?.$schema ?? value?.schema;
      return String(schema ?? "").toLowerCase() === SCHEMA_ID;
    } catch {
      return false;
    }
  }

  // ─── Text extraction from DOM nodes ─────────────────────────────────
  /**
   * Extract candidate text from a DOM element.
   * Returns null if the text is too short/long or doesn't look like StudentViz.
   */
  function extractCandidateText(element) {
    const text = element.textContent?.trim() || "";
    if (text.length < 20 || text.length > MAX_BLOCK_SIZE) return null;

    if (globalThis.StudentVizRepair?.isPythonBlock?.(text, element)) return text;

    const blocks = globalThis.StudentVizRepair?.extractBlocks(text) || [];
    return blocks.some(block => isStudentVizBlock(block, element)) ? text : null;
  }

  // ─── Parsing and repair ─────────────────────────────────────────────
  /**
   * Parse raw text into StudentViz specs, applying auto-repair as needed.
   * Returns { complete: boolean, specs: [], error?: string }.
   */
  function parseAndRepair(text, node) {
    // ── Check for Python visualization blocks ──
    const isPy = globalThis.StudentVizRepair?.isPythonBlock?.(text, node);
    const pyBlocks = globalThis.StudentVizRepair?.extractPythonBlocks?.(text) || [];

    if (isPy || pyBlocks.length > 0) {
      const targetBlocks = pyBlocks.length > 0 ? pyBlocks : [text];
      const specs = [];
      for (const block of targetBlocks) {
        const code = globalThis.StudentVizRepair?.extractPythonCode?.(block) || block;
        if (code && code.trim()) {
          const titleMatch = code.match(/^#\s*(?:Title:\s*)?([^\n]+)/i);
          const title = titleMatch && !/^(?:START|BEGIN|END|IMPORT|FROM|STUDENTVIZ)/i.test(titleMatch[1].trim())
            ? titleMatch[1].trim()
            : "Python Visualization";

          specs.push({
            spec: {
              $schema: SCHEMA_ID,
              type: "python",
              code: code,
              title: title
            },
            fixes: ["detected Python Pyodide visual"],
            raw: block
          });
        }
      }
      if (specs.length > 0) {
        return { complete: true, specs };
      }
    }

    const blocks = (globalThis.StudentVizRepair?.extractBlocks(text) || [])
      .filter(block => isStudentVizBlock(block, node));

    if (!blocks.length) return { complete: false, specs: [] };

    const specs = [];
    for (const block of blocks) {
      try {
        const repaired = globalThis.StudentVizRepair.repair(block);
        if (!repaired.spec || typeof repaired.spec !== "object" || Array.isArray(repaired.spec)) {
          throw Error("This block must contain a JSON object.");
        }
        specs.push({ spec: repaired.spec, fixes: repaired.fixes, raw: block });
      } catch (err) {
        return {
          complete: true,
          specs: [],
          error: `This block could not be repaired as JSON — ${err.message}`,
        };
      }
    }

    return { complete: true, specs };
  }

  // ─── Streaming detection ────────────────────────────────────────────
  /**
   * Check if the AI is currently streaming (stop button visible).
   * Each chat platform has a different stop button selector.
   */
  const STOP_BUTTON_SELECTORS = {
    "chatgpt.com": 'button[data-testid="stop-button"],button[aria-label="Stop streaming"]',
    "chat.openai.com": 'button[data-testid="stop-button"],button[aria-label="Stop streaming"]',
    "gemini.google.com": 'button[aria-label="Stop response"],button[aria-label="Stop generating response"],.stop-icon',
    "claude.ai": 'button[aria-label="Stop response"],button[aria-label="Stop generating"]',
    "chat.deepseek.com": 'button[aria-label="Stop generating"]',
    "deepseek.com": 'button[aria-label="Stop generating"],button[aria-label*="Stop"]',
    "www.deepseek.com": 'button[aria-label="Stop generating"],button[aria-label*="Stop"]',
    "www.perplexity.ai": 'button[aria-label="Stop generating"]',
  };

  function isStreaming(doc, hostname) {
    const selector = STOP_BUTTON_SELECTORS[hostname];
    return selector ? !!doc.querySelector(selector) : false;
  }

  // ─── Theme detection ────────────────────────────────────────────────
  /**
   * Detect whether the page is in light or dark mode.
   * Uses background luminance, CSS classes, and media queries as fallbacks.
   */
  function detectTheme(doc) {
    const luminanceFromRgba = (str) => {
      const m = String(str).match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?/);
      if (!m || (m[4] === undefined ? 1 : Number(m[4])) < 0.35) return null;
      const [r, g, b] = [+m[1], +m[2], +m[3]].map(c => {
        c /= 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    // Walk up from <body> to find first opaque background
    const bodyLuminance = ((el) => {
      for (let node = el; node; node = node.parentElement) {
        const lum = luminanceFromRgba(getComputedStyle(node).backgroundColor);
        if (lum !== null) return lum;
      }
      return null;
    })(doc.body) ?? luminanceFromRgba(getComputedStyle(doc.documentElement).backgroundColor);

    if (bodyLuminance !== null) {
      return bodyLuminance < 0.35 ? "dark" : "light";
    }

    // Fallback: check CSS classes and media queries
    if (
      doc.documentElement.classList.contains("dark") ||
      doc.body?.classList.contains("dark") ||
      /dark/.test(doc.documentElement.getAttribute("data-theme") || "") ||
      doc.defaultView?.matchMedia?.("(prefers-color-scheme: dark)").matches
    ) {
      return "dark";
    }

    return "light";
  }

  // ─── State management ───────────────────────────────────────────────
  /**
   * Per-element state stored in the `elementStates` Map.
   * Each entry tracks:
   *   - text: last raw text seen
   *   - settled: last text that was fully processed
   *   - timer: pending setTimeout ID
   *   - cards: array of rendered card objects
   *   - source: the original code block element (hidden when card shows)
   *   - sourceDisplay: original display value of the source element
   *   - collapsed: whether the code block is currently hidden
   *   - evicted: whether this state was evicted due to card limit
   */
  const elementStates = new Map();
  let extensionEnabled = true;
  let scanPending = false;
  let observer = null;
  let currentTheme = "light";

  /** Helper to get the viewer URL */
  const getExtensionURL = (path) => chrome.runtime.getURL(path);

  // ─── Pyodide Singleton Runner ───────────────────────────────────────
  let pyodideRunnerFrame = null;
  let pyodideReady = false;
  const pyodidePendingCallbacks = new Map();
  const pyodideExecutionQueue = [];
  const pyodideStatusSubscribers = new Set();

  // A run is abandoned only if the engine makes no progress for this long,
  // and never runs longer than the hard cap (protects against `while True:`).
  const PYODIDE_IDLE_TIMEOUT_MS = 120000;
  const PYODIDE_MAX_RUN_MS = 300000;

  function ensurePyodideRunner() {
    // Chat SPAs can replace the page body, detaching our frame. If that
    // happened, the old frame is dead (no messages reach it) — rebuild it.
    if (pyodideRunnerFrame && !pyodideRunnerFrame.isConnected) {
      pyodideRunnerFrame = null;
      pyodideReady = false;
    }
    if (!pyodideRunnerFrame) {
      const host = document.body || document.documentElement;
      if (!host) return null;
      pyodideRunnerFrame = document.createElement("iframe");
      pyodideRunnerFrame.className = "studentviz-pyodide-runner";
      pyodideRunnerFrame.title = "BirdPlot Python engine";
      pyodideRunnerFrame.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;border:none;";
      pyodideRunnerFrame.src = getExtensionURL("pyodide_runner.html");
      host.appendChild(pyodideRunnerFrame);
    }
    return pyodideRunnerFrame;
  }

  function resetPyodideRunner() {
    pyodideReady = false;
    pyodideExecutionQueue.length = 0;
    if (pyodideRunnerFrame) {
      try { pyodideRunnerFrame.remove(); } catch {}
      pyodideRunnerFrame = null;
    }
  }

  function sendToPyodideRunner(payload) {
    const frame = ensurePyodideRunner();
    if (pyodideReady && frame?.contentWindow) {
      frame.contentWindow.postMessage({
        source: "studentviz-host",
        ...payload
      }, "*");
    } else {
      pyodideExecutionQueue.push(payload);
    }
  }

  /** Human-readable engine progress for the card's loading line */
  function describePyodideStatus(msg) {
    switch (msg.status) {
      case "initializing": return "Starting Python engine…";
      case "warming": return "Warming up NumPy & Matplotlib…";
      case "loading_packages": {
        const names = Array.isArray(msg.packages) ? msg.packages.slice(0, 3).join(", ") : "";
        return names ? `Loading ${names}…` : "Loading Python packages…";
      }
      case "executing": return "Running Python…";
      case "error": return "Python engine error";
      default: return msg.message || "Running Python…";
    }
  }

  /** Fail every queued/running execution so no card is left spinning forever */
  function failPendingPyodideRuns(message) {
    const pending = [...pyodidePendingCallbacks.entries()];
    pyodidePendingCallbacks.clear();
    pyodideExecutionQueue.length = 0;
    for (const [id, cb] of pending) {
      cb({
        action: "result",
        id,
        success: false,
        result: { type: "error", error: message, stdout: "", stderr: "" }
      });
    }
  }

  // ─── Pyodide result & ready message handler ──────────────────────────
  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (!msg || (msg.source !== "studentviz-pyodide" && msg.source !== "birdplot-pyodide")) return;

    if (msg.action === "ready" || (msg.action === "status" && msg.status === "ready")) {
      pyodideReady = true;
      while (pyodideExecutionQueue.length > 0) {
        const item = pyodideExecutionQueue.shift();
        pyodideRunnerFrame?.contentWindow?.postMessage({
          source: "studentviz-host",
          ...item
        }, "*");
      }
      return;
    }

    if (msg.action === "status") {
      for (const notify of pyodideStatusSubscribers) {
        try { notify(msg); } catch {}
      }
      if (msg.status === "error") {
        failPendingPyodideRuns(msg.message || "The Python engine could not start. Check your connection and click Retry.");
        resetPyodideRunner();
      }
      return;
    }

    if (msg.action === "result" && msg.id) {
      const cb = pyodidePendingCallbacks.get(msg.id);
      if (cb) {
        pyodidePendingCallbacks.delete(msg.id);
        cb(msg);
      }
    }
  });

  // ─── Card cleanup ───────────────────────────────────────────────────
  /** Remove all cards and restore the original code block */
  function cleanupState(state) {
    clearTimeout(state.timer);
    state.timer = null;

    // Restore hidden source element
    if (state.source) {
      state.source.style.display = state.sourceDisplay ?? "";
      state.source = null;
    }

    // Remove all card DOM elements and clear iframes to prevent WebGL/Plotly memory leaks
    for (const card of state.cards || []) {
      if (typeof card.cleanup === "function") {
        try { card.cleanup(); } catch {}
      }
      if (card.frame) {
        try { card.frame.src = "about:blank"; } catch {}
      }
      card.card.remove();
    }
    state.cards = [];
  }

  /** Just restore the source element visibility without removing cards */
  function restoreSource(state) {
    if (state.source) {
      state.source.style.display = state.sourceDisplay ?? "";
      state.source = null;
    }
  }

  // ─── Clipboard helpers ──────────────────────────────────────────────
  /** Download a spec as a JSON file */
  function downloadJson(filename, jsonString) {
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Copy text to clipboard with fallback */
  function copyToClipboard(text, feedbackElement, successText = "Copied") {
    const originalText = feedbackElement.textContent;
    const showSuccess = () => {
      feedbackElement.textContent = successText;
      setTimeout(() => {
        feedbackElement.textContent = originalText || "Copy error";
      }, COPY_FEEDBACK_MS);
    };

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(showSuccess, () => fallbackCopy(text, showSuccess));
    } else {
      fallbackCopy(text, showSuccess);
    }

    function fallbackCopy(str, callback) {
      const textarea = document.createElement("textarea");
      textarea.value = str;
      textarea.setAttribute("readonly", "");
      textarea.style.cssText = "position:fixed;top:-9999px;opacity:0";
      document.body.append(textarea);
      textarea.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      textarea.remove();
      callback();
    }
  }

  // ─── Error feedback message for AI ──────────────────────────────────
  /**
   * Generate a message the user can paste back to the AI to fix a broken visual.
   * This is the "smart autocorrect" feedback loop.
   */
  function buildErrorFeedback(error, rawBlock) {
    return `The StudentViz extension could not render this visual.

Error: ${error}

Block it rejected:
\`\`\`studentviz
${rawBlock}
\`\`\`

Reply with the complete corrected studentviz JSON block only (same protocol), fixing that error.`;
  }

  // ─── Card UI construction ───────────────────────────────────────────
  /** Create the branded toolbar for a card */
  function createToolbar(spec) {
    const toolbar = document.createElement("div");
    toolbar.className = "studentviz-toolbar birdplot-toolbar";

    const brand = document.createElement("span");
    brand.className = "studentviz-brand birdplot-brand";

    const logoSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    logoSvg.setAttribute("class", "birdplot-logo-mark");
    logoSvg.setAttribute("viewBox", "0 0 24 24");
    logoSvg.setAttribute("width", "14");
    logoSvg.setAttribute("height", "14");
    logoSvg.setAttribute("fill", "none");
    logoSvg.setAttribute("stroke", "currentColor");
    logoSvg.setAttribute("stroke-width", "2.2");
    logoSvg.setAttribute("stroke-linecap", "round");
    logoSvg.setAttribute("stroke-linejoin", "round");
    logoSvg.innerHTML = '<path d="M16 3l5 5-5 5"></path><path d="M21 8H10a6 6 0 0 0-6 6v3"></path><circle cx="8" cy="18" r="3"></circle>';

    const brandName = document.createElement("span");
    brandName.className = "birdplot-brand-text";
    brandName.textContent = "BirdPlot";

    brand.append(logoSvg, brandName);

    if (spec) {
      const typeStr = String(spec.type || "").toLowerCase();
      const titleStr = String(spec.title || "").toLowerCase();
      const descStr = String(spec.description || "").toLowerCase();
      let badgeLabel = "VISUAL";
      if (typeStr === "python") {
        badgeLabel = "PYTHON";
      } else if (typeStr === "chemical" || titleStr.includes("molecule") || descStr.includes("molecule") || titleStr.includes("chemical") || spec.formula) {
        badgeLabel = "CHEMISTRY";
      } else if (typeStr === "scene3d") {
        badgeLabel = "3D SCENE";
      } else if (typeStr === "geometry") {
        badgeLabel = "GEOMETRY";
      } else if (typeStr === "plot") {
        badgeLabel = "GRAPH";
      }
      const badge = document.createElement("span");
      badge.className = "studentviz-badge birdplot-badge";
      badge.textContent = badgeLabel;
      brand.append(badge);
    }

    const info = document.createElement("span");
    info.className = "studentviz-info birdplot-info";
    info.textContent = spec?.type === "python" ? "Pyodide · local execution" : "Interactive";

    toolbar.append(brand, info);
    return toolbar;
  }

  /** Hide the original code block and track it for restoration */
  function hideSourceCode(state, codeBlock, sourceElement, codeButton) {
    const isCodeElement = !!codeBlock &&
      (/^(PRE|CODE)$/.test(codeBlock.tagName || "") || !!codeBlock.closest?.("pre,code"));

    if (isCodeElement && sourceElement.textContent.trim().length > 240) {
      state.source = codeBlock;
      state.sourceDisplay = codeBlock.style.display;
      codeBlock.style.display = "none";
      state.collapsed = true;
      codeButton.textContent = "Code";
    } else {
      codeButton.hidden = true;
    }
  }

  /**
   * Create and insert a rendered visual card.
   * Each card contains:
   *   - A branded toolbar with Code/Retry/Hide buttons
   *   - A sandboxed iframe running viewer.html
   */
  function insertVisualCard(t, state, spec, rawBlock, fixes = []) {
    const sourceElement = t;
    // ── Enforce card limit: evict oldest if at capacity ──
    const allCards = [...elementStates.values()].flatMap(s => s.cards || []);
    if (allCards.length >= MAX_CARDS) {
      const oldest = allCards[0];
      cleanupState(oldest.st);
      oldest.st.evicted = true;
    }

    // ── Build card DOM ──
    const card = document.createElement("section");
    card.className = "studentviz-card";
    card.setAttribute("data-studentviz", "true");
    card.dataset.theme = currentTheme;

    const toolbar = createToolbar(spec);

    const codeBtn = document.createElement("button");
    codeBtn.type = "button";
    codeBtn.textContent = "Code";

    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.textContent = "Retry";

    const hideBtn = document.createElement("button");
    hideBtn.type = "button";
    hideBtn.textContent = "Hide";

    // ── Create sandboxed iframe ──
    const iframe = document.createElement("iframe");
    iframe.className = "studentviz-frame";
    iframe.title = spec.title || "StudentViz interactive visual";
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.src = getExtensionURL(`viewer.html?theme=${currentTheme}`);

    const channel = crypto.randomUUID();

    const cardState = {
      card,
      frame: iframe,
      channel,
      spec,
      raw: rawBlock,
      st: state,
      fixes: [...fixes],
      autoRetried: false,
    };

    // Show auto-fix info if repairs were applied
    if (fixes.length) {
      const infoSpan = toolbar.querySelector(".studentviz-info");
      infoSpan.textContent = `Auto-fixed · ${fixes.length} correction${fixes.length === 1 ? "" : "s"}`;
      infoSpan.title = globalThis.StudentVizRepair.describe(fixes);
    }

    // ── Wire up toolbar buttons ──
    const scaleBtn = document.createElement("button");
    scaleBtn.type = "button";
    scaleBtn.className = "studentviz-scale-btn";
    scaleBtn.textContent = "Fit";
    scaleBtn.title = "Rescale visual (Fit, 75%, 50%, 100%)";

    const SCALE_MODES = ["fit", "75", "50", "100"];
    const SCALE_LABELS = { fit: "Fit", "75": "75%", "50": "50%", "100": "100%" };
    let currentScaleIdx = 0;

    card.dataset.scale = "fit";

    scaleBtn.addEventListener("click", () => {
      currentScaleIdx = (currentScaleIdx + 1) % SCALE_MODES.length;
      const mode = SCALE_MODES[currentScaleIdx];
      card.dataset.scale = mode;
      scaleBtn.textContent = SCALE_LABELS[mode];

      const triggerResize = () => {
        try {
          iframe.contentWindow?.postMessage({ action: "resize", scale: mode }, "*");
          iframe.contentWindow?.dispatchEvent(new Event("resize"));
        } catch {}
      };
      requestAnimationFrame(triggerResize);
      setTimeout(triggerResize, 60);
      setTimeout(triggerResize, 150);
      setTimeout(triggerResize, 260);
    });

    toolbar.append(codeBtn, retryBtn, scaleBtn, hideBtn);

    codeBtn.addEventListener("click", () => {
      if (state.source) {
        state.collapsed = !state.collapsed;
        state.source.style.display = state.collapsed ? "none" : (state.sourceDisplay ?? "");
        codeBtn.textContent = state.collapsed ? "Code" : "Hide code";
      }
    });

    retryBtn.addEventListener("click", () => {
      cardState.ready = false;
      cardState.autoRetried = false;
      iframe.src = getExtensionURL(`viewer.html?theme=${currentTheme}`);
    });

    hideBtn.addEventListener("click", () => {
      iframe.hidden = !iframe.hidden;
      hideBtn.textContent = iframe.hidden ? "Show" : "Hide";
    });

    // ── Send spec to viewer when iframe is ready ──
    iframe.addEventListener("load", () => {
      iframe.contentWindow.postMessage({
        source: "studentviz-host",
        type: "init",
        channel,
        theme: currentTheme,
      }, "*");
    });

    // ── Insert card into DOM ──
    card.append(toolbar, iframe);

    let b = t.closest("pre")||t;
    const previous = state.cards.at(-1)?.card;
    if (previous?.parentElement === b.parentElement) {
      previous.insertAdjacentElement("afterend", card);
    } else {
      b.insertAdjacentElement("afterend", card);
    }

    state.cards.push(cardState);
    hideSourceCode(state, b, t, codeBtn);
  }

  /**
   * Show an error card when a visual can't be rendered.
   * Includes a "Copy error" button and "Code" toggle so users can see/copy raw code.
   */
  function insertErrorCard(t, state, errorMessage, rawBlock, detail, appendOnly = false) {
    if (!appendOnly) {
      restoreSource(state);
      for (const c of state.cards) {
        if (c.frame) {
          try { c.frame.src = "about:blank"; } catch {}
        }
        c.card.remove();
      }
      state.cards = [];
    }

    const card = document.createElement("section");
    card.className = "studentviz-card studentviz-card-error";
    card.setAttribute("data-studentviz", "true");
    card.dataset.theme = currentTheme;

    const toolbar = createToolbar();
    toolbar.querySelector(".studentviz-info").textContent = "Needs a fix";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.textContent = "Copy error";

    const hideBtn = document.createElement("button");
    hideBtn.type = "button";
    hideBtn.textContent = "Hide";

    const codeBtn = document.createElement("button");
    codeBtn.type = "button";
    codeBtn.textContent = state.collapsed ? "Code" : "Hide code";

    toolbar.querySelector(".studentviz-info").after(copyBtn, hideBtn, codeBtn);

    // Error body
    const errorBody = document.createElement("div");
    errorBody.className = "studentviz-error";

    const heading = document.createElement("p");
    heading.className = "studentviz-error-head";
    heading.textContent = "This visual could not be drawn";

    const msg = document.createElement("p");
    msg.className = "studentviz-error-msg";
    msg.textContent = errorMessage;

    errorBody.append(heading, msg);

    if (detail) {
      const detailEl = document.createElement("pre");
      detailEl.className = "studentviz-error-detail";
      detailEl.textContent = detail;
      errorBody.append(detailEl);
    }

    const hint = document.createElement("p");
    hint.className = "studentviz-error-hint";
    hint.textContent = "Copy error, paste it back to the AI, and it can rewrite the block.";
    errorBody.append(hint);

    // Button handlers
    copyBtn.addEventListener("click", () => {
      copyToClipboard(buildErrorFeedback(errorMessage, rawBlock), copyBtn);
    });
    hideBtn.addEventListener("click", () => {
      errorBody.hidden = !errorBody.hidden;
      hideBtn.textContent = errorBody.hidden ? "Show" : "Hide";
    });
    codeBtn.addEventListener("click", () => {
      if (state.source) {
        state.collapsed = !state.collapsed;
        state.source.style.display = state.collapsed ? "none" : (state.sourceDisplay ?? "");
        codeBtn.textContent = state.collapsed ? "Code" : "Hide code";
      }
    });

    card.append(toolbar, errorBody);

    let b = t.closest("pre")||t;
    b.insertAdjacentElement("afterend", card);
    state.cards.push({ card, frame: null, channel: null, raw: rawBlock, st: state });

    // Hide source code block if it's long
    const isCodeElement = /^(PRE|CODE)$/.test(b.tagName || "") || !!b.closest?.("pre,code");
    if (isCodeElement && t.textContent.trim().length > 240) {
      state.source = b;
      state.sourceDisplay = b.style.display;
      b.style.display = "none";
      state.collapsed = true;
    }
  }

  // ─── Python card insertion ───────────────────────────────────────────
  /**
   * Create and insert a Python (Pyodide) execution card.
   * Sends code to the hidden Pyodide runner iframe and renders output.
   */
  function insertPythonCard(t, state, spec, rawBlock, fixes = []) {
    // ── Enforce card limit ──
    const allCards = [...elementStates.values()].flatMap(s => s.cards || []);
    if (allCards.length >= MAX_CARDS) {
      const oldest = allCards[0];
      cleanupState(oldest.st);
      oldest.st.evicted = true;
    }

    const card = document.createElement("section");
    card.className = "studentviz-card";
    card.setAttribute("data-studentviz", "true");
    card.dataset.theme = currentTheme;

    const toolbar = createToolbar(spec);

    const codeBtn = document.createElement("button");
    codeBtn.type = "button";
    codeBtn.textContent = "Code";

    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.textContent = "Retry";

    const hideBtn = document.createElement("button");
    hideBtn.type = "button";
    hideBtn.textContent = "Hide";

    const scaleBtn = document.createElement("button");
    scaleBtn.type = "button";
    scaleBtn.className = "studentviz-scale-btn";
    scaleBtn.textContent = "Fit";
    scaleBtn.title = "Rescale visual (Fit, 75%, 50%, 100%)";

    const SCALE_MODES = ["fit", "75", "50", "100"];
    const SCALE_LABELS = { fit: "Fit", "75": "75%", "50": "50%", "100": "100%" };
    let currentScaleIdx = 0;

    toolbar.append(codeBtn, retryBtn, scaleBtn, hideBtn);

    // Output container
    const output = document.createElement("div");
    output.className = "studentviz-python-output";
    output.dataset.scale = "fit";

    scaleBtn.addEventListener("click", () => {
      currentScaleIdx = (currentScaleIdx + 1) % SCALE_MODES.length;
      const mode = SCALE_MODES[currentScaleIdx];
      output.dataset.scale = mode;
      card.dataset.scale = mode;
      scaleBtn.textContent = SCALE_LABELS[mode];

      const triggerResize = () => {
        output.querySelectorAll("iframe").forEach(frame => {
          try {
            frame.contentWindow?.postMessage({ action: "resize", scale: mode }, "*");
            frame.contentWindow?.dispatchEvent(new Event("resize"));
          } catch {}
        });
      };
      requestAnimationFrame(triggerResize);
      setTimeout(triggerResize, 60);
      setTimeout(triggerResize, 150);
      setTimeout(triggerResize, 260);
    });

    const loading = document.createElement("div");
    loading.className = "studentviz-python-loading";
    loading.textContent = "Starting Python engine…";
    output.appendChild(loading);

    card.append(toolbar, output);

    const channel = crypto.randomUUID();
    const cardState = { card, frame: null, channel, spec, raw: rawBlock, st: state, fixes: [...fixes] };

    if (fixes.length) {
      const infoSpan = toolbar.querySelector(".studentviz-info");
      infoSpan.textContent = `Auto-fixed · ${fixes.length} correction${fixes.length === 1 ? "" : "s"}`;
      infoSpan.title = globalThis.StudentVizRepair.describe(fixes);
    }

    // Button handlers
    codeBtn.addEventListener("click", () => {
      if (state.source) {
        state.collapsed = !state.collapsed;
        state.source.style.display = state.collapsed ? "none" : (state.sourceDisplay ?? "");
        codeBtn.textContent = state.collapsed ? "Code" : "Hide code";
      }
    });

    hideBtn.addEventListener("click", () => {
      output.hidden = !output.hidden;
      hideBtn.textContent = output.hidden ? "Show" : "Hide";
    });

    let runWatchdog = null;
    let runStartedAt = 0;

    const clearRunWatchdog = () => {
      if (runWatchdog) {
        clearTimeout(runWatchdog);
        runWatchdog = null;
      }
    };

    const armRunWatchdog = (delay) => {
      clearRunWatchdog();
      runWatchdog = setTimeout(() => {
        runWatchdog = null;
        pyodidePendingCallbacks.delete(channel);
        pyodideStatusSubscribers.delete(onStatus);
        // Kill the engine: it may be stuck in an infinite loop inside user code.
        resetPyodideRunner();
        showPythonError("Python engine timed out. Click Retry to run it again.");
      }, Math.max(1000, delay));
    };

    const onStatus = (msg) => {
      if (msg.status && msg.status !== "ready") {
        loading.textContent = describePyodideStatus(msg);
      }
      const elapsed = Date.now() - runStartedAt;
      if (elapsed < PYODIDE_MAX_RUN_MS) {
        armRunWatchdog(Math.min(PYODIDE_IDLE_TIMEOUT_MS, PYODIDE_MAX_RUN_MS - elapsed));
      }
    };

    const showPythonError = (message) => {
      clearRunWatchdog();
      loading.remove();
      loading.hidden = true;
      loading.classList.add("is-hidden");
      loading.style.setProperty("display", "none", "important");
      output.querySelectorAll(".studentviz-python-error").forEach(el => el.remove());
      output.querySelectorAll(".studentviz-python-result").forEach(el => el.remove());

      const errEl = document.createElement("div");
      errEl.className = "studentviz-python-error";
      const errHead = document.createElement("p");
      errHead.className = "studentviz-error-head";
      errHead.textContent = "Python execution error";
      const errMsg = document.createElement("pre");
      errMsg.className = "studentviz-error-msg";
      errMsg.textContent = message;
      errEl.append(errHead, errMsg);
      output.appendChild(errEl);

      const infoSpan = toolbar.querySelector(".studentviz-info");
      if (infoSpan) infoSpan.textContent = "Error";
    };

    const showPythonLoading = () => {
      loading.textContent = "Starting Python engine…";
      loading.hidden = false;
      loading.classList.remove("is-hidden");
      loading.style.removeProperty("display");
      if (!output.contains(loading)) {
        output.prepend(loading);
      }
    };

    const runPython = () => {
      runStartedAt = Date.now();
      armRunWatchdog(PYODIDE_IDLE_TIMEOUT_MS);
      showPythonLoading();
      output.querySelectorAll(".studentviz-python-result").forEach(el => el.remove());
      output.querySelectorAll(".studentviz-python-error").forEach(el => el.remove());

      pyodideStatusSubscribers.add(onStatus);
      ensurePyodideRunner();

      pyodidePendingCallbacks.set(channel, (msg) => {
        clearRunWatchdog();
        pyodideStatusSubscribers.delete(onStatus);
        loading.remove();
        loading.hidden = true;
        loading.classList.add("is-hidden");
        loading.style.setProperty("display", "none", "important");
        const infoSpan = toolbar.querySelector(".studentviz-info");

        if (msg.success && msg.result) {
          const res = msg.result;
          const resultEl = document.createElement("div");
          resultEl.className = "studentviz-python-result";

          if (res.type === "svg" && res.data) {
            resultEl.innerHTML = res.data;
            const svg = resultEl.querySelector("svg");
            if (svg) {
              svg.removeAttribute("width");
              svg.removeAttribute("height");
              svg.style.cssText = "max-width:100%;height:auto;display:block;margin:0 auto;";
            }
          } else if (res.type === "animation" && res.data) {
            const img = document.createElement("img");
            img.src = res.data;
            img.style.cssText = "max-width:100%;height:auto;display:block;margin:0 auto;";
            img.alt = spec.title || "Python animation";
            resultEl.appendChild(img);
          } else if (res.type === "image" && res.data) {
            const img = document.createElement("img");
            img.src = res.data;
            img.style.cssText = "max-width:100%;height:auto;display:block;margin:0 auto;";
            img.alt = spec.title || "Python visualization";
            resultEl.appendChild(img);
          } else if (res.type === "plotly" && res.data) {
            const plotlyFrame = document.createElement("iframe");
            plotlyFrame.className = "studentviz-frame studentviz-plotly-frame";
            plotlyFrame.title = spec.title || "Plotly visualization";
            // No DOM sandbox attribute — plotly.html is already manifest-sandboxed
            // via "sandbox.pages". Adding sandbox="allow-scripts" here would create
            // an opaque origin that blocks loading vendor/plotly.min.js via <script src>.
            cardState.frame = plotlyFrame;
            plotlyFrame.src = getExtensionURL("plotly.html") + "?channel=" + encodeURIComponent(channel);

            const pData = res.data.data || [];
            const pLayout = res.data.layout || {};
            const pFrames = res.data.frames || [];

            let rendered = false;
            let retryTimer = null;
            let attempts = 0;

            const sendPlotlyData = () => {
              if (rendered) return;
              try {
                if (plotlyFrame.contentWindow) {
                  plotlyFrame.contentWindow.postMessage({
                    source: "studentviz-host",
                    action: "render",
                    channel,
                    data: pData,
                    layout: pLayout,
                    frames: pFrames
                  }, "*");
                }
              } catch {}
            };

            const onPlotlyMessage = (e) => {
              const msg = e.data;
              if (!msg || msg.source !== "studentviz-plotly" || msg.channel !== channel) return;
              if (msg.action === "ready") {
                sendPlotlyData();
              } else if (msg.action === "rendered") {
                rendered = true;
                if (retryTimer) {
                  clearInterval(retryTimer);
                  retryTimer = null;
                }
              } else if (msg.action === "error") {
                rendered = true;
                if (retryTimer) {
                  clearInterval(retryTimer);
                  retryTimer = null;
                }
                const errSpan = toolbar.querySelector(".studentviz-info");
                if (errSpan) errSpan.textContent = "Plotly error";
              }
            };
            window.addEventListener("message", onPlotlyMessage);

            plotlyFrame.addEventListener("load", () => {
              sendPlotlyData();
            });

            // Resilient heartbeat: retry every 150ms until rendered or 15 attempts (2.25s)
            retryTimer = setInterval(() => {
              attempts++;
              if (rendered || attempts > 15) {
                if (retryTimer) {
                  clearInterval(retryTimer);
                  retryTimer = null;
                }
                return;
              }
              sendPlotlyData();
            }, 150);

            resultEl.appendChild(plotlyFrame);
          } else if (res.type === "interactive_html" && res.data) {
            const htmlFrame = document.createElement("iframe");
            htmlFrame.className = "studentviz-frame studentviz-html-frame";
            htmlFrame.setAttribute("sandbox", "allow-scripts allow-same-origin");
            htmlFrame.srcdoc = res.data;
            resultEl.appendChild(htmlFrame);
          } else if (res.type === "html" && res.data) {
            resultEl.innerHTML = res.data;
          } else if (res.type === "trimesh" && res.data) {
            const meshInfo = document.createElement("div");
            meshInfo.style.cssText = "padding:16px;font:13px/1.5 system-ui;color:var(--sv-ink);";
            meshInfo.textContent = `3D Mesh: ${res.data.vertices?.length || 0} vertices, ${res.data.faces?.length || 0} faces`;
            resultEl.appendChild(meshInfo);
          } else if (res.stdout) {
            const pre = document.createElement("pre");
            pre.style.cssText = "padding:16px;margin:0;font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap;color:var(--sv-ink);";
            pre.textContent = res.stdout;
            resultEl.appendChild(pre);
          }

          output.appendChild(resultEl);

          if (infoSpan && msg.executionTimeMs != null) {
            infoSpan.textContent = `Pyodide · ${msg.executionTimeMs}ms`;
          }
        } else {
          const errEl = document.createElement("div");
          errEl.className = "studentviz-python-error";
          const errHead = document.createElement("p");
          errHead.className = "studentviz-error-head";
          errHead.textContent = "Python execution error";
          const errMsg = document.createElement("pre");
          errMsg.className = "studentviz-error-msg";
          errMsg.textContent = msg.result?.error || "Unknown error";
          errEl.append(errHead, errMsg);
          output.appendChild(errEl);

          if (infoSpan) infoSpan.textContent = "Error";
        }
      });

      // Dispatch execution immediately (or flush as soon as runner is warm)
      sendToPyodideRunner({
        action: "execute",
        id: channel,
        code: spec.code,
        theme: currentTheme
      });
    };

    retryBtn.addEventListener("click", runPython);

    // Tear down timers/subscriptions if the card is removed from the page
    cardState.cleanup = () => {
      clearRunWatchdog();
      pyodideStatusSubscribers.delete(onStatus);
      pyodidePendingCallbacks.delete(channel);
    };

    // Insert card into DOM
    let b = t.closest("pre") || t;
    const previous = state.cards.at(-1)?.card;
    if (previous?.parentElement === b.parentElement) {
      previous.insertAdjacentElement("afterend", card);
    } else {
      b.insertAdjacentElement("afterend", card);
    }

    state.cards.push(cardState);
    hideSourceCode(state, b, t, codeBtn);

    // Auto-execute
    runPython();
  }

  // ─── Message handler: communication with viewer iframes ─────────────
  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (!msg || msg.source !== "studentviz-viewer") return;

    for (const state of elementStates.values()) {
      for (const cardState of state.cards || []) {
        if (!cardState.frame || event.source !== cardState.frame.contentWindow || msg.channel !== cardState.channel) {
          continue;
        }

        switch (msg.type) {
          case "ready":
            cardState.frame.contentWindow.postMessage({
              source: "studentviz-host",
              channel: cardState.channel,
              type: "render",
              spec: cardState.spec,
              theme: currentTheme,
            }, "*");
            break;

          case "export":
            downloadJson("studentviz.json", JSON.stringify(cardState.spec, null, 2));
            break;

          case "size":
            if (Number.isFinite(msg.height)) {
              const clampedHeight = Math.min(Math.max(Math.round(msg.height), 260), 900);
              cardState.frame.style.setProperty("height", clampedHeight + "px", "important");
            }
            break;

          case "error":
            if (!cardState.autoRetried) {
              try {
                const repaired = globalThis.StudentVizRepair.repair(cardState.spec, { error: msg.message });
                const validated = validateSpec(repaired.spec);
                const newJson = JSON.stringify(validated);
                const oldJson = JSON.stringify(cardState.spec);

                if (newJson !== oldJson) {
                  cardState.autoRetried = true;
                  cardState.spec = validated;
                  cardState.fixes.push(...repaired.fixes, "repaired the visual after a renderer error");

                  const infoSpan = cardState.card.querySelector(".studentviz-info");
                  if (infoSpan) {
                    infoSpan.textContent = "Auto-fixed · renderer retry";
                    infoSpan.title = globalThis.StudentVizRepair.describe(cardState.fixes);
                  }

                  cardState.frame.contentWindow.postMessage({
                    source: "studentviz-host",
                    channel: cardState.channel,
                    type: "render",
                    spec: cardState.spec,
                    theme: currentTheme,
                  }, "*");
                }
              } catch { /* Repair failed, show error as-is */ }
            }
            break;

          case "copy-error":
            copyToClipboard(
              buildErrorFeedback(msg.message || "Render failed", JSON.stringify(cardState.spec, null, 2)),
              { textContent: "" }
            );
            break;
        }
      }
    }
  });

  // ─── Tree walker for assistant text extraction ──────────────────────
  /**
   * Create a TreeWalker that skips already-rendered StudentViz cards,
   * code blocks, and DeepSeek think blocks.
   */
  const SKIP_SELECTORS = "[data-studentviz],pre,code,.ds-think-content,._5255ff8._4d41763,._4d41763";

  function assistantTextWalker(root) {
    return document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        return parent?.closest(SKIP_SELECTORS)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      },
    });
  }

  /** Extract all visible text from an assistant message, skipping cards/code */
  function getAssistantText(root) {
    const walker = assistantTextWalker(root);
    let node;
    let text = "";
    while ((node = walker.nextNode())) {
      text += node.nodeValue || "";
    }
    return text;
  }

  // ─── Main processing pipeline ───────────────────────────────────────
  /**
   * Process a single DOM element that might contain a StudentViz visual.
   *
   * @param {Element} element - The DOM element to check
   * @param {string|null} suppliedText - Pre-extracted text (for unfenced blocks)
   * @param {Element|null} sourceRoot - The parent assistant message root
   */
  function k(element, suppliedText = null, sourceRoot = null) {
    const raw = suppliedText ?? extractCandidateText(element);
    if (!raw || raw.length < 20 || raw.length > 2_000_000) return;

    let state = elementStates.get(element);
    if (!state) {
      state = { text: null, timer: null, cards: [] };
      elementStates.set(element, state);
    }

    // Skip if already processed this exact text
    if (state.text === raw && (state.settled === raw || state.timer || state.evicted)) return;

    clearTimeout(state.timer);
    state.text = raw;
    state.evicted = false;

    // Capture expected text for change detection
    const expectedRootText = sourceRoot ? getAssistantText(sourceRoot).trim() : null;

    // Check if this is a completed Python visual block
    const isCompletePy = !!(globalThis.StudentVizRepair?.isPythonBlock?.(raw, element) &&
      (/#\s*END[_\s-]*STUDENTVIZ/i.test(raw) || /```[\s\S]*```/.test(raw.trim())));

    // Fast-path: 40ms debounce for complete Python blocks instead of waiting RENDER_DELAY_MS!
    const delay = isCompletePy ? 40 : RENDER_DELAY_MS;

    // ── Process candidate block ──
    state.timer = setTimeout(() => {
      state.timer = null;

      if (!extensionEnabled || !element.isConnected) return;

      // Verify the text hasn't changed since we scheduled this
      if (sourceRoot) {
        if (!sourceRoot.isConnected) return;
        if (getAssistantText(sourceRoot).trim() !== expectedRootText) {
          triggerScan(); // Text changed, re-scan
          return;
        }
      } else if (element.textContent.trim() !== raw) {
        k(element); // Content changed, reprocess
        return;
      }

      // If AI is still streaming, retry later UNLESS the block is already complete
      if (!isCompletePy && isStreaming(document, location.hostname)) {
        state.timer = setTimeout(() => {
          state.timer = null;
          k(element, suppliedText, sourceRoot);
        }, STREAMING_RETRY_MS);
        return;
      }

      // ── Parse and validate ──
      const parsed = parseAndRepair(raw, element);
      if (!parsed.complete) return;

      if (parsed.error) {
        state.settled = raw;
        insertErrorCard(element, state, parsed.error, raw);
        return;
      }

      // ── Detect page theme ──
      currentTheme = detectTheme(document);

      // ── Validate each spec, attempting repair on failure ──
      let validationError = null;
      const readySpecs = [];

      for (const item of parsed.specs) {
        try {
          readySpecs.push({
            spec: item.spec,
            validated: validateSpec(item.spec),
            fixes: item.fixes,
            raw: item.raw,
          });
        } catch (error) {
          try {
            const repaired = globalThis.StudentVizRepair.repair(item.spec);
            readySpecs.push({
              spec: item.spec,
              validated: validateSpec(repaired.spec),
              fixes: [...item.fixes, ...repaired.fixes],
              raw: item.raw,
            });
          } catch (secondError) {
            validationError ??= secondError.message;
          }
        }
      }

      state.settled = raw;

      if (!readySpecs.length) {
        insertErrorCard(element, state, validationError || "The JSON is not a valid StudentViz visual.", raw);
        return;
      }

      // ── Render all valid specs ──
      cleanupState(state);
      for (const item of readySpecs) {
        if (item.validated.type === "python") {
          insertPythonCard(element, state, item.validated, item.raw, item.fixes);
        } else {
          insertVisualCard(element, state, item.validated, item.raw, item.fixes);
        }
      }

      // Show error for any specs that couldn't be validated (non-destructively)
      if (validationError) {
        insertErrorCard(element, state, validationError, raw, "One visual in this reply was skipped.", true);
      }
    }, delay);
  }

  // ─── Unfenced block scanning (DeepSeek compatibility) ───────────────
  /**
   * Find the nearest block-level element at a text offset within a root.
   * Used to anchor cards near the unfenced JSON in the DOM.
   */
  function findTextBlockAtOffset(root, offset) {
    const walker = assistantTextWalker(root);
    let node;
    let total = 0;

    while ((node = walker.nextNode())) {
      const length = node.nodeValue?.length ?? 0;
      if (offset <= total + length) {
        const nearest = node.parentElement?.closest("p,li,blockquote,pre,code");
        if (nearest && root.contains(nearest)) return nearest;
        let el = node.parentElement;
        while (el?.parentElement && el.parentElement !== root) el = el.parentElement;
        return el || root;
      }
      total += length;
    }
    return root;
  }

  /**
   * Scan an assistant message root for unfenced (raw text) StudentViz JSON.
   * DeepSeek sometimes emits JSON as ordinary paragraph text with no markdown fence.
   */
  function scanUnfencedAssistant(root) {
    if (!root || !root.isConnected) return;
    if (root.closest("[data-studentviz],.ds-think-content,._5255ff8._4d41763,._4d41763")) return;

    const fullText = getAssistantText(root);
    if (fullText.trim().length < 20 || fullText.length > 2_000_000) return;

    const blocks = globalThis.StudentVizRepair?.extractBlocks(fullText) || [];

    // Build a set of already-known blocks to avoid re-rendering
    const knownBlocks = new Set(
      [...elementStates.values()].flatMap(state => [
        ...(state.cards || []).map(c => c.raw).filter(Boolean),
        ...(globalThis.StudentVizRepair?.extractBlocks(state.text || "") || []),
      ])
    );

    const newVisualBlocks = blocks.filter(block => isStudentVizBlock(block, root) && !knownBlocks.has(block));
    if (!newVisualBlocks.length) return;

    // Find the position of the last new visual block
    const lastOffset = newVisualBlocks.reduce(
      (end, block) => Math.max(end, fullText.lastIndexOf(block) + block.length),
      0
    );
    if (lastOffset <= 0) return;

    const anchor = findTextBlockAtOffset(root, lastOffset);

    // Build pending text: remove already-consumed blocks, append new ones
    let pending = fullText;
    const consumed = new Set([...knownBlocks, ...newVisualBlocks]);
    for (const block of blocks) {
      if (consumed.has(block)) pending = pending.replace(block, "");
    }
    pending += newVisualBlocks.join("\n");

    k(anchor,pending,root);
  }

  // ─── Full page scan ─────────────────────────────────────────────────
  /**
   * Scan the entire page for StudentViz visuals.
   * Called on mutation events (debounced) and on enable/disable toggle.
   */
  function fullScan() {
    scanPending = false;
    if (!extensionEnabled) return;

    // ── Garbage-collect detached elements ──
    for (const [node, state] of elementStates) {
      if (!node.isConnected) {
        cleanupState(state);
        elementStates.delete(node);
      }
    }

    // ── Update theme ──
    currentTheme = detectTheme(document);

    const visited = new Set();

    const processTarget = (target) => {
      if (!target || visited.has(target) || !target.isConnected) return;
      if (target.closest("[data-studentviz],.ds-think-content,._5255ff8._4d41763,._4d41763")) return;
      visited.add(target);
      k(target);
    };

    // 1. Scan explicit code blocks (most reliable — standard markdown fences)
    document.querySelectorAll('pre code,code[class*="language-"],pre:not(:has(code))').forEach(processTarget);

    // 2. Scan DeepSeek markdown containers (unfenced JSON in paragraph text)
    document.querySelectorAll(".ds-markdown").forEach(scanUnfencedAssistant);

    // 3. Scan generic assistant message containers (fallback for other platforms)
    document.querySelectorAll('[data-message-author-role="assistant"]').forEach(root => {
      if (root.querySelector(".ds-markdown")) return; // Already scanned above
      scanUnfencedAssistant(root);

      const leaves = [...root.querySelectorAll("p,li,blockquote,div")];
      for (const leaf of leaves) {
        if (leaf.closest("pre,code,[data-studentviz],.ds-think-content,._5255ff8._4d41763,._4d41763")) continue;
        if (leaf.querySelector("p,li,blockquote,pre,code,div")) continue;
        processTarget(leaf);
      }
    });
  }

  /** Debounced scan trigger */
  function triggerScan() {
    if (!scanPending) {
      scanPending = true;
      setTimeout(fullScan, SCAN_DEBOUNCE_MS);
    }
  }

  // ─── MutationObserver setup ─────────────────────────────────────────
  /**
   * Start observing the page for DOM changes.
   * Only triggers a scan if the mutation is NOT inside an already-rendered card.
   */
  function startObserver() {
    observer = new MutationObserver((mutations) => {
      // Skip mutations that only affect our own injected cards
      const hasRelevantMutation = mutations.some(mutation => {
        const target = mutation.target.nodeType === 1
          ? mutation.target
          : mutation.target.parentElement;
        return !target?.closest("[data-studentviz]");
      });

      if (hasRelevantMutation) {
        triggerScan();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    // Run initial scan
    fullScan();
  }

  // ─── Extension lifecycle ────────────────────────────────────────────

  // Load enabled state and start
  chrome.storage.local.get({ enabled: true }, (result) => {
    extensionEnabled = result.enabled;
    // Warm the Python engine up front so the first plot renders without a wait
    if (extensionEnabled) ensurePyodideRunner();
    startObserver();
  });

  // Listen for enable/disable toggle from popup
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.enabled) return;

    extensionEnabled = changes.enabled.newValue;

    if (extensionEnabled) {
      ensurePyodideRunner();
      fullScan();
    } else {
      // Disable: remove all cards and clear state
      for (const state of elementStates.values()) {
        cleanupState(state);
      }
      elementStates.clear();
    }
  });

  // Clean up when page is unloaded
  window.addEventListener("pagehide", () => {
    observer?.disconnect();
    for (const state of elementStates.values()) {
      cleanupState(state);
    }
  });
})();
