/**
 * BirdPlot Pyodide Runner Controller
 * Manages the Pyodide Web Worker singleton, handles postMessage RPC,
 * and maintains an in-thread fallback if Web Workers are restricted.
 */
(() => {
  "use strict";

  const PYODIDE_CDN_BASE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
  let worker = null;
  let fallbackPyodide = null;
  let isWorkerMode = true;
  let isReady = false;
  const pendingRequests = new Map();
  const executeQueue = [];

  function postToHost(message) {
    if (window.parent && window.parent !== window) {
      // The host (content.js) listens for the canonical source name. Accept the
      // BirdPlot-branded alias as well so older/newer hosts stay compatible.
      window.parent.postMessage({ source: "studentviz-pyodide", alias: "birdplot-pyodide", ...message }, "*");
    }
  }

  // ─── Initialize Worker ───────────────────────────────────────────────
  function initWorker() {
    try {
      const workerUrl = typeof chrome !== "undefined" && chrome.runtime?.getURL
        ? chrome.runtime.getURL("pyodide_worker.js")
        : "pyodide_worker.js";
      worker = new Worker(workerUrl);
      worker.addEventListener("message", handleWorkerMessage);
      worker.addEventListener("error", (err) => {
        console.warn("[StudentViz Runner] Worker error, switching to in-page mode:", err);
        isReady = false;
        fallbackToMainThread();
      });
      worker.postMessage({ action: "warm" });
    } catch (err) {
      console.warn("[StudentViz Runner] Could not instantiate Worker:", err);
      fallbackToMainThread();
    }
  }

  function handleWorkerMessage(e) {
    const data = e.data;
    if (!data) return;

    if (data.type === "status") {
      if (data.status === "ready") {
        isReady = true;
      } else if (data.status === "error") {
        isReady = false;
      }
      postToHost({ action: "status", ...data });
      if (data.status === "ready") drainQueue();
      else if (data.status === "error") failQueue(data.message || "Python engine failed to start.");
    } else if (data.type === "result") {
      const resolver = pendingRequests.get(data.id);
      if (resolver) {
        pendingRequests.delete(data.id);
      }
      postToHost({ action: "result", ...data });
    } else if (data.type === "stdout" || data.type === "stderr") {
      postToHost({ action: data.type, text: data.text });
    }
  }

  function drainQueue() {
    while (executeQueue.length > 0) {
      const req = executeQueue.shift();
      if (isWorkerMode && worker) {
        worker.postMessage({ action: "execute", id: req.id, code: req.code, theme: req.theme });
      } else if (fallbackPyodide) {
        executeInMainThread(req.id, req.code, req.theme);
      }
    }
  }

  function failQueue(message) {
    while (executeQueue.length > 0) {
      const req = executeQueue.shift();
      postToHost({
        action: "result",
        id: req.id,
        success: false,
        result: { type: "error", error: message, stdout: "", stderr: "" },
        executionTimeMs: 0
      });
    }
  }

  // ─── Main-thread fallback if Web Worker is disallowed ────────────────
  async function fallbackToMainThread() {
    isWorkerMode = false;
    isReady = false;
    if (worker) {
      try { worker.terminate(); } catch {}
      worker = null;
    }

    postToHost({ action: "status", status: "initializing", message: "Starting Pyodide in page..." });

    try {
      if (typeof _createPyodideModule === "undefined" || typeof loadPyodide === "undefined") {
        const assetUrl = (path) => (typeof chrome !== "undefined" && chrome.runtime?.getURL
          ? chrome.runtime.getURL(path)
          : path);
        for (const path of ["vendor/pyodide.asm.js", "vendor/pyodide.js"]) {
          if (path.endsWith("pyodide.js") && typeof loadPyodide !== "undefined") continue;
          if (path.endsWith("asm.js") && typeof _createPyodideModule !== "undefined") continue;
          await new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = assetUrl(path);
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load ${path}`));
            document.head.appendChild(script);
          });
        }
      }

      fallbackPyodide = await loadPyodide({
        indexURL: PYODIDE_CDN_BASE
      });

      await fallbackPyodide.loadPackage(["numpy", "matplotlib"]);
      fallbackPyodide.runPython(`
import sys, io, json, base64, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
`);
      isReady = true;
      postToHost({ action: "status", status: "ready", message: "Pyodide ready" });
      drainQueue();
    } catch (err) {
      const message = err?.message || String(err);
      postToHost({ action: "status", status: "error", message });
      failQueue(`Python engine failed to start: ${message}`);
    }
  }

  // ─── Execute Request ─────────────────────────────────────────────────
  function handleExecute(id, code, theme = "light") {
    if (isWorkerMode && worker) {
      if (!isReady) {
        executeQueue.push({ id, code, theme });
      } else {
        worker.postMessage({ action: "execute", id, code, theme });
      }
    } else if (fallbackPyodide && isReady) {
      executeInMainThread(id, code, theme);
    } else {
      executeQueue.push({ id, code, theme });
    }
  }

  async function executeInMainThread(id, code, theme) {
    const startTime = performance.now();
    try {
      const runnerCode = `
import sys, io, json, base64, traceback
__res__ = {"type": "none", "data": None, "stdout": "", "stderr": "", "error": None}
__out__, __err__ = io.StringIO(), io.StringIO()
__old_out__, __old_err__ = sys.stdout, sys.stderr
sys.stdout, sys.stderr = __out__, __err__
try:
    if 'matplotlib' in sys.modules:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        plt.close('all')
    __scope__ = {'__name__': '__main__'}
    exec('''${code.replace(/\\/g, "\\\\").replace(/'''/g, "\\'''")}''', __scope__)
    if 'matplotlib.pyplot' in sys.modules:
        import matplotlib.pyplot as plt
        if plt.get_fignums():
            buf = io.StringIO()
            plt.savefig(buf, format='svg', bbox_inches='tight')
            __res__["type"] = "svg"
            __res__["data"] = buf.getvalue()
            plt.close('all')
except Exception:
    __res__["error"] = traceback.format_exc()
finally:
    sys.stdout, sys.stderr = __old_out__, __old_err__
    __res__["stdout"], __res__["stderr"] = __out__.getvalue(), __err__.getvalue()
json.dumps(__res__)
`;
      const resJson = fallbackPyodide.runPython(runnerCode);
      const parsed = JSON.parse(resJson);
      const executionTimeMs = Math.round(performance.now() - startTime);

      postToHost({
        action: "result",
        id,
        success: !parsed.error,
        result: parsed,
        executionTimeMs
      });
    } catch (err) {
      const executionTimeMs = Math.round(performance.now() - startTime);
      postToHost({
        action: "result",
        id,
        success: false,
        result: {
          type: "error",
          error: err.message,
          stdout: "",
          stderr: ""
        },
        executionTimeMs
      });
    }
  }

  // ─── Host Message Listener ───────────────────────────────────────────
  window.addEventListener("message", (e) => {
    const data = e.data;
    if (!data || data.source !== "studentviz-host") return;

    switch (data.action) {
      case "warm":
      case "init":
        if (!worker && !fallbackPyodide) initWorker();
        break;

      case "execute":
        if (!worker && !fallbackPyodide) initWorker();
        handleExecute(data.id, data.code, data.theme);
        break;

      case "ping":
        postToHost({ action: "pong", ready: isReady });
        break;
    }
  });

  // Start worker pre-warming immediately when runner loads
  initWorker();
  postToHost({ action: "ready" });
})();
