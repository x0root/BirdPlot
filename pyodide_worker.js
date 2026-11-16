/**
 * BirdPlot Pyodide Web Worker — Fast Local Python Execution
 * Runs in a sandboxed Web Worker context.
 *
 * Provides instant execution for the 35 most popular AI visualization libraries:
 * 1. matplotlib - 2D/3D plots, scientific charts, vector fields, curves, surfaces
 * 2. numpy - Vectorized calculations, matrix operations, meshgrids, geometries
 * 3. scipy - Advanced math, spatial Delaunay/Voronoi, convex hulls, ODE integration
 * 4. plotly - Interactive 2D & 3D charts, scatter3d, surface, mesh3d
 * 5. seaborn - Statistical data visualization, heatmaps, distribution plots
 * 6. pandas - DataFrames, time series, statistical calculations
 * 7. sympy - Symbolic math, parametric curves, algebraic geometry, calculus
 * 8. pillow (PIL) - Image synthesis, raster generation, pixel manipulation
 * 9. trimesh - 3D geometry, CAD shapes, polyhedra, ray-mesh intersections
 * 10. shapely - Planar geometry, polygon boolean operations, Voronoi polygons
 * 11. networkx - Graph theory, network visualizer, node-link diagrams, trees
 * 12. mpmath - High-precision math, special functions, complex analysis
 * 13. scikit-learn - Machine learning visualization, decision boundaries, PCA
 * 14. statsmodels - Statistical models, regressions, time-series forecasting
 * 15. bokeh - Interactive web graphics, dashboards, linked plots
 * 16. altair - Declarative statistical charts (Vega-Lite)
 * 17. svgwrite - Clean scalable vector graphics (SVG) generation
 * 18. wordcloud - Visual word clouds, text frequency shapes
 * 19. pywt (PyWavelets) - Wavelet transforms, spectrograms, signal visuals
 * 20. imageio - Image reading/writing, procedural image generation
 */

/* global loadPyodide, importScripts, self */
"use strict";

// ─── High-speed persistent caching for Pyodide WASM, stdlib and packages ──
const CACHE_NAME = "studentviz-pyodide-v1";

if (typeof self !== "undefined" && typeof self.fetch === "function") {
  const nativeFetch = self.fetch;
  self.fetch = async function(resource, init) {
    const url = typeof resource === "string" ? resource : (resource?.url || "");
    const isCacheable = url && (
      url.endsWith(".wasm") ||
      url.endsWith(".zip") ||
      url.endsWith(".whl") ||
      url.includes("pyodide-lock.json")
    );

    if (isCacheable && typeof caches !== "undefined") {
      try {
        const cache = await caches.open(CACHE_NAME);
        const match = await cache.match(url);
        if (match) return match;
        const res = await nativeFetch(resource, init);
        if (res && res.ok) {
          cache.put(url, res.clone()).catch(() => {});
        }
        return res;
      } catch (err) {
        return nativeFetch(resource, init);
      }
    }
    return nativeFetch(resource, init);
  };
}

const PYODIDE_CDN_BASE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
let pyodideInstance = null;
let isInitializing = false;
let initPromise = null;
let preloadPromise = null;
const loadedPackages = new Set();

/**
 * Mapping of common module import identifiers to Pyodide package names
 */
const PACKAGE_MAP = Object.freeze({
  matplotlib: "matplotlib",
  plt: "matplotlib",
  pylab: "matplotlib",
  mpl_toolkits: "matplotlib",
  mplot3d: "matplotlib",
  animation: "matplotlib",
  numpy: "numpy",
  np: "numpy",
  scipy: "scipy",
  plotly: "plotly",
  seaborn: "seaborn",
  sns: "seaborn",
  pandas: "pandas",
  pd: "pandas",
  sympy: "sympy",
  sp: "sympy",
  PIL: "pillow",
  pillow: "pillow",
  Image: "pillow",
  trimesh: "trimesh",
  shapely: "shapely",
  networkx: "networkx",
  nx: "networkx",
  mpmath: "mpmath",
  sklearn: "scikit-learn",
  "scikit-learn": "scikit-learn",
  statsmodels: "statsmodels",
  bokeh: "bokeh",
  altair: "altair",
  alt: "altair",
  svgwrite: "svgwrite",
  wordcloud: "wordcloud",
  pywt: "pywavelets",
  pywavelets: "pywavelets",
  imageio: "imageio",
  skimage: "scikit-image",
  "scikit-image": "scikit-image",
  astropy: "astropy",
  uncertainties: "uncertainties",
  lmfit: "lmfit",
  cmocean: "cmocean",
  pygal: "pygal"
});

/**
 * Fast regex scanning to detect which visualization packages are imported in user code
 */
function detectRequiredPackages(pythonCode) {
  const pkgs = new Set();
  if (!pythonCode || typeof pythonCode !== "string") return [];

  const lines = pythonCode.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue;

    const fromMatch = trimmed.match(/^from\s+([a-zA-Z0-9_.]+)/);
    if (fromMatch) {
      const topMod = fromMatch[1].split(".")[0];
      if (PACKAGE_MAP[topMod]) pkgs.add(PACKAGE_MAP[topMod]);
    }

    const importMatch = trimmed.match(/^import\s+([^#;]+)/);
    if (importMatch) {
      const parts = importMatch[1].split(",");
      for (const part of parts) {
        const mod = part.trim().split(/\s+as\s+/)[0].trim().split(".")[0].trim();
        if (PACKAGE_MAP[mod]) pkgs.add(PACKAGE_MAP[mod]);
      }
    }
  }

  const importRegex = /(?:from\s+([a-zA-Z0-9_]+)|import\s+([a-zA-Z0-9_]+))/g;
  let match;
  while ((match = importRegex.exec(pythonCode)) !== null) {
    const mod = match[1] || match[2];
    if (PACKAGE_MAP[mod]) {
      pkgs.add(PACKAGE_MAP[mod]);
    }
  }
  return Array.from(pkgs);
}

/**
 * Initialize Pyodide WASM runtime and pre-warm core libraries
 */
async function initPyodide() {
  if (pyodideInstance) return pyodideInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    isInitializing = true;
    self.postMessage({ type: "status", status: "initializing", message: "Starting Pyodide WASM engine..." });

    // Load local pyodide scripts (bundled in extension for MV3 CSP compliance)
    if (typeof _createPyodideModule === "undefined") {
      try {
        importScripts("vendor/pyodide.asm.js");
      } catch (err) {
        console.warn("[StudentViz Worker] Local asm.js import failed:", err);
      }
    }
    if (typeof loadPyodide === "undefined") {
      try {
        importScripts("vendor/pyodide.js");
      } catch (err) {
        console.warn("[StudentViz Worker] Local pyodide.js import failed:", err);
      }
    }

    pyodideInstance = await loadPyodide({
      indexURL: PYODIDE_CDN_BASE,
      stdout: (text) => self.postMessage({ type: "stdout", text }),
      stderr: (text) => self.postMessage({ type: "stderr", text }),
    });

    // Compile the execution harness immediately — it has no package deps and
    // costs almost nothing, so it is ready the moment the interpreter is.
    try {
      pyodideInstance.runPython(PYTHON_HARNESS);
    } catch (e) {
      console.warn("[StudentViz Worker] Harness init warning:", e);
    }

    isInitializing = false;
    self.postMessage({ type: "status", status: "ready", message: "Python engine ready" });

    // Warm the common scientific stack in the background. Executions await
    // this, so the engine is usable earlier and code with no imports (or
    // Plotly-only code) never waits for Matplotlib.
    preloadPromise = (async () => {
      await ensurePackages(["numpy", "matplotlib"]);
      try {
        pyodideInstance.runPython(`
import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['svg.fonttype'] = 'none'
import matplotlib.pyplot as plt

# Warm up matplotlib's font manager and SVG pipeline
_fig, _ax = plt.subplots(figsize=(1, 1))
_ax.plot([0, 1], [0, 1])
import io as _io
_buf = _io.StringIO()
_fig.savefig(_buf, format='svg')
plt.close(_fig)
`);
      } catch (e) {
        console.warn("[StudentViz Worker] Matplotlib warmup warning:", e);
      }
    })();

    return pyodideInstance;
  })();

  return initPromise;
}

/**
 * Ensure needed packages are loaded in Pyodide
 */
async function ensurePackages(packages) {
  const needed = packages.filter(pkg => !loadedPackages.has(pkg));
  if (!needed.length) return;

  self.postMessage({
    type: "status",
    status: "loading_packages",
    message: `Loading packages: ${needed.join(", ")}...`,
    packages: needed
  });

  // 1. Load every Pyodide-distribution package in parallel (fastest path),
  //    collecting the ones Pyodide does not ship for micropip.
  const outcomes = await Promise.allSettled(
    needed.map((pkg) => pyodideInstance.loadPackage(pkg))
  );
  const micropipPkgs = [];
  outcomes.forEach((outcome, i) => {
    if (outcome.status === "fulfilled") loadedPackages.add(needed[i]);
    else micropipPkgs.push(needed[i]);
  });

  // 2. Fall back to PyPI for pure-Python packages (plotly, pygal, ...)
  if (micropipPkgs.length > 0) {
    try {
      if (!loadedPackages.has("micropip")) {
        await pyodideInstance.loadPackage("micropip");
        loadedPackages.add("micropip");
      }

      self.postMessage({
        type: "status",
        status: "loading_packages",
        message: `Installing ${micropipPkgs.join(", ")} from PyPI...`,
        packages: micropipPkgs
      });

      const pkgListJson = JSON.stringify(micropipPkgs);
      await pyodideInstance.runPythonAsync(`
import micropip
await micropip.install(${pkgListJson})
`);
      for (const pkg of micropipPkgs) loadedPackages.add(pkg);
    } catch (micropipErr) {
      throw new Error(`Failed to load Python package(s) [${micropipPkgs.join(", ")}]: ${micropipErr.message || String(micropipErr)}`);
    }
  }
}

/**
 * Python execution harness that captures figures, images, 3D meshes, and stdout
 */
const PYTHON_HARNESS = `
def __studentviz_run__(user_code, theme_mode):
    import sys
    import io
    import json
    import base64
    import traceback

    result = {
        "type": "none",
        "data": None,
        "stdout": "",
        "stderr": "",
        "error": None
    }

    stdout_capture = io.StringIO()
    stderr_capture = io.StringIO()
    orig_stdout, orig_stderr = sys.stdout, sys.stderr
    sys.stdout = stdout_capture
    sys.stderr = stderr_capture

    try:
        if 'matplotlib' in sys.modules:
            import matplotlib
            matplotlib.use('Agg')
            matplotlib.rcParams['svg.fonttype'] = 'none'
            import matplotlib.pyplot as plt
            plt.close('all')

        scope = {
            '__name__': '__main__',
            '__file__': '<studentviz>'
        }
        if 'matplotlib.pyplot' in sys.modules:
            scope['plt'] = sys.modules['matplotlib.pyplot']
        if 'numpy' in sys.modules:
            scope['np'] = sys.modules['numpy']

        exec(user_code, scope)

        # 1. Matplotlib Animation (FuncAnimation / ArtistAnimation) -> GIF
        if result["type"] == "none":
            for k, v in list(scope.items()):
                vtype = type(v).__name__
                if vtype in ('FuncAnimation', 'ArtistAnimation') and hasattr(v, 'save'):
                    try:
                        gif_buf = io.BytesIO()
                        fps = max(1, int(1000 / v._interval)) if getattr(v, '_interval', None) else 10
                        v.save(gif_buf, writer='pillow', fps=fps)
                        b64 = base64.b64encode(gif_buf.getvalue()).decode('ascii')
                        result["type"] = "animation"
                        result["data"] = f"data:image/gif;base64,{b64}"
                        if 'matplotlib.pyplot' in sys.modules:
                            import matplotlib.pyplot as plt
                            plt.close('all')
                        break
                    except Exception:
                        pass

        # 2. Matplotlib static figures
        if result["type"] == "none" and 'matplotlib.pyplot' in sys.modules:
            import matplotlib.pyplot as plt
            if plt.get_fignums():
                svg_buf = io.StringIO()
                plt.savefig(svg_buf, format='svg', bbox_inches='tight')
                svg_content = svg_buf.getvalue()
                plt.close('all')
                if svg_content and '<svg' in svg_content:
                    result["type"] = "svg"
                    result["data"] = svg_content

        # 3. Plotly Figure (supports animation frames natively)
        if result["type"] == "none":
            for k, v in list(scope.items()):
                if v is not None and type(v).__name__ in ('Figure', 'FigureWidget') and hasattr(v, 'to_json'):
                    try:
                        result["type"] = "plotly"
                        p_dict = json.loads(v.to_json())
                        if isinstance(p_dict, dict) and "layout" in p_dict and isinstance(p_dict["layout"], dict):
                            p_dict["layout"].pop("width", None)
                            p_dict["layout"].pop("height", None)
                            p_dict["layout"]["autosize"] = True
                        result["data"] = p_dict
                        break
                    except Exception:
                        pass

        # 4. Trimesh 3D geometry
        if result["type"] == "none":
            for k, v in list(scope.items()):
                if v is not None and type(v).__name__ in ('Trimesh', 'Scene') and hasattr(v, 'vertices') and hasattr(v, 'faces'):
                    try:
                        result["type"] = "trimesh"
                        result["data"] = {
                            "vertices": v.vertices.tolist(),
                            "faces": v.faces.tolist()
                        }
                        break
                    except Exception:
                        pass

        # 5. Pillow Image (including animated multi-frame GIFs)
        if result["type"] == "none":
            for k, v in list(scope.items()):
                if v is not None and hasattr(v, 'save') and hasattr(v, 'size') and hasattr(v, 'mode'):
                    try:
                        img_buf = io.BytesIO()
                        if hasattr(v, 'n_frames') and v.n_frames > 1:
                            frames = []
                            for i in range(v.n_frames):
                                v.seek(i)
                                frames.append(v.copy())
                            frames[0].save(img_buf, format='GIF', save_all=True, append_images=frames[1:], loop=0)
                            b64 = base64.b64encode(img_buf.getvalue()).decode('ascii')
                            result["type"] = "animation"
                            result["data"] = f"data:image/gif;base64,{b64}"
                        else:
                            v.save(img_buf, format='PNG')
                            b64 = base64.b64encode(img_buf.getvalue()).decode('ascii')
                            result["type"] = "image"
                            result["data"] = f"data:image/png;base64,{b64}"
                        break
                    except Exception:
                        pass

        # 6. Pygal SVG chart
        if result["type"] == "none":
            for k, v in list(scope.items()):
                if v is not None and hasattr(v, 'render') and 'pygal' in str(type(v).__module__ or ''):
                    try:
                        svg_data = v.render().decode('utf-8') if isinstance(v.render(), bytes) else v.render()
                        if '<svg' in svg_data:
                            result["type"] = "svg"
                            result["data"] = svg_data
                            break
                    except Exception:
                        pass

        # 7. Raw SVG or interactive HTML string
        if result["type"] == "none":
            for k, v in list(scope.items()):
                if isinstance(v, str) and len(v) > 10:
                    if '<svg' in v and '</svg>' in v:
                        result["type"] = "svg"
                        result["data"] = v
                        break
                    elif '<html' in v.lower() or ('<div' in v and ('<script' in v or '<canvas' in v)):
                        result["type"] = "interactive_html"
                        result["data"] = v
                        break

        # 8. Bokeh figure -> standalone HTML
        if result["type"] == "none":
            for k, v in list(scope.items()):
                vmod = str(type(v).__module__) if hasattr(type(v), '__module__') else ''
                if 'bokeh' in vmod and hasattr(v, 'to_json_string'):
                    try:
                        from bokeh.embed import file_html
                        from bokeh.resources import CDN
                        html = file_html(v, CDN, title="StudentViz")
                        result["type"] = "interactive_html"
                        result["data"] = html
                        break
                    except Exception:
                        pass

    except Exception:
        result["error"] = traceback.format_exc()

    finally:
        sys.stdout = orig_stdout
        sys.stderr = orig_stderr
        result["stdout"] = stdout_capture.getvalue()
        result["stderr"] = stderr_capture.getvalue()

    return json.dumps(result)
__birdplot_run__ = __studentviz_run__
`;

/**
 * Execute Python code and return visual output
 */
async function executePython(id, code, theme = "light") {
  const startTime = performance.now();
  try {
    await initPyodide();

    // Check imports and dynamically load missing packages
    const requiredPkgs = detectRequiredPackages(code);

    // Only wait for the background scientific-stack preload when this code
    // actually uses it — plain-Python and Plotly-only snippets run right away.
    const usesPreloadedStack = requiredPkgs.some(pkg => pkg === "numpy" || pkg === "matplotlib");
    if (preloadPromise && usesPreloadedStack) {
      try {
        await preloadPromise;
      } catch (err) {
        console.warn("[StudentViz Worker] Preload failed, continuing:", err);
      }
    }

    await ensurePackages(requiredPkgs);

    self.postMessage({ type: "status", status: "executing", message: "Running Python visualization..." });

    // Set up harness if not defined
    if (!pyodideInstance.globals.has("__birdplot_run__") && !pyodideInstance.globals.has("__studentviz_run__")) {
      pyodideInstance.runPython(PYTHON_HARNESS);
    }

    const runner = pyodideInstance.globals.get("__birdplot_run__") || pyodideInstance.globals.get("__studentviz_run__");
    const jsonStr = runner(code, theme);
    const parsed = JSON.parse(jsonStr);
    const executionTimeMs = Math.round(performance.now() - startTime);

    self.postMessage({
      type: "result",
      id,
      success: !parsed.error,
      result: parsed,
      executionTimeMs,
      packages: requiredPkgs
    });
  } catch (err) {
    const executionTimeMs = Math.round(performance.now() - startTime);
    self.postMessage({
      type: "result",
      id,
      success: false,
      result: {
        type: "error",
        error: err.message || String(err),
        stdout: "",
        stderr: ""
      },
      executionTimeMs
    });
  }
}

// ─── Worker message listener ─────────────────────────────────────────
self.addEventListener("message", async (e) => {
  const msg = e.data;
  if (!msg) return;

  switch (msg.action) {
    case "warm":
    case "init":
      initPyodide().catch(err => {
        self.postMessage({ type: "status", status: "error", message: err.message });
      });
      break;

    case "execute":
      executePython(msg.id, msg.code, msg.theme || "light");
      break;

    case "ping":
      self.postMessage({ type: "pong", ready: !!pyodideInstance && !isInitializing });
      break;
  }
});
