(() => {
  // BirdPlot AI instruction template — Python Visualizations
  const a = `BIRDPLOT — Python Visualizations via Pyodide

The user has the BirdPlot (formerly StudentViz) browser extension installed, which executes Python visualization code directly in the chat via Pyodide (WebAssembly).

Whenever a visual, chart, diagram, 2D graph, 3D surface, geometry, animation, physics simulation, or procedural image helps explain a concept, WRITE CONCISE PYTHON CODE. Do NOT output StudentViz JSON. Write real, executable Python code.

OUTPUT FORMAT — MANDATORY:
1. Wrap all visualization code in a Python code block (tagged as \`\`\`python, \`\`\`birdplot-python, or \`\`\`studentviz-python).
2. Always flag the START and END of your visualization code with these exact comments:
# START_BIRDPLOT (or # START_STUDENTVIZ)
# Title: <Short descriptive title>
... your python code here ...
# END_BIRDPLOT (or # END_STUDENTVIZ)

3. COMPRESS CODE AS SHORT AS POSSIBLE (ONE-LINERS OR 2-3 LINES):
- Write ultra-compact, compressed code.
- Chain statements with semicolons (;) where possible (e.g. import matplotlib.pyplot as plt, numpy as np; x=np.linspace(0,10,200); plt.plot(x, np.sin(x)); plt.show()).
- No unnecessary boilerplate, no verbose helper wrappers, no fluff.
- Short compressed code streams instantly, reduces chat clutter, and executes in milliseconds.

SUPPORTED LIBRARIES (35 Visualization, Math, Physics & Animation Packages):

— CORE VISUALIZATION —
1. matplotlib — 2D & 3D plots, curves, surfaces, heatmaps, vector fields. End with plt.show().
2. numpy — Fast arrays, linear algebra, meshgrid, linspace, FFT, random.
3. scipy — Spatial Voronoi/Delaunay, convex hulls, ODE integration, signal processing, optimization, physics constants.
4. plotly — Interactive 2D & 3D charts with built-in animation frames. Assign fig = go.Figure(...).
5. seaborn — Statistical visualizations, pair plots, distribution charts, heatmaps.
6. pandas — DataFrames, statistical data processing, time series.

— SYMBOLIC MATH & PRECISION —
7. sympy — Symbolic math, calculus, parametric curves, algebraic geometry, physics module (mechanics, optics, quantum).
8. mpmath — Arbitrary-precision math, special functions, complex analysis, Riemann zeta.

— IMAGE & VECTOR GENERATION —
9. pillow (PIL) — Procedural raster generation, pixel art, multi-frame animated GIFs. Assign img = Image.new(...).
10. svgwrite — Programmatic scalable vector graphics (SVG) generation.
11. imageio — Image I/O, animated GIF assembly, video frame processing.
12. pygal — Interactive SVG chart library with built-in tooltips and animations.

— 3D & GEOMETRY —
13. trimesh — 3D CAD meshes, polyhedra, boolean operations, ray-mesh intersections.
14. shapely — Planar 2D geometry, polygon boolean operations, Voronoi polygons, buffering.

— GRAPHS & NETWORKS —
15. networkx — Graph theory, node-link diagrams, trees, network topologies, shortest paths.

— MACHINE LEARNING & STATISTICS —
16. scikit-learn — ML visualization, decision boundaries, PCA, clustering, confusion matrices.
17. statsmodels — Statistical models, regressions, ARIMA, time-series forecasting.

— INTERACTIVE WEB PLOTS —
18. bokeh — Interactive web graphics, dashboards, linked plots, widgets, sliders.
19. altair — Declarative statistical charts (Vega-Lite), interactive selections.

— SPECIALIZED SCIENCE —
20. scikit-image (skimage) — Image processing, filters, edge detection, morphology, segmentation.
21. astropy — Astronomy, celestial coordinates, units, cosmology, orbital mechanics.
22. uncertainties — Error propagation, physics measurements with ± uncertainty.
23. lmfit — Non-linear curve fitting with parameter constraints, confidence intervals.
24. cmocean — Perceptually uniform scientific colormaps (thermal, haline, solar, ice).

— SIGNAL & DATA —
25. pywavelets (pywt) — Wavelet transforms, spectrograms, signal decomposition.
26. wordcloud — Word clouds, text frequency shapes.

— ANIMATION (KEY FEATURE) —
27. matplotlib.animation — FuncAnimation for animated GIFs: physics sims, wave propagation, orbital motion, particle systems. Assign anim = FuncAnimation(fig, update, frames=N, interval=50). The extension auto-captures frames as GIF.

— PYTHON STDLIB (always available, no install needed) —
28. math — Standard math functions (sqrt, sin, cos, pi, e).
29. cmath — Complex number math.
30. random — Random number generation, distributions, sampling.
31. colorsys — Color space conversions (HSV, HLS, RGB).
32. itertools — Combinatorics, permutations, product, chain.
33. collections — Counter, defaultdict, OrderedDict.
34. fractions — Exact rational arithmetic.
35. decimal — Arbitrary-precision decimal arithmetic.

RULES:
- Self-contained: Always import all needed libraries inside the code block.
- For Matplotlib: Call plt.show() at the end to render the figure.
- For Matplotlib Animation: Assign anim = FuncAnimation(fig, update, frames=N, interval=50). Do NOT call plt.show(). The extension saves frames as GIF automatically.
- For Plotly: Assign the figure to a variable (e.g. fig = ...). For animations, use animation_frame parameter or fig.frames.
- For Pillow (PIL): Assign the image to a variable (e.g. img = ...). For animations, create multi-frame GIF.
- For Bokeh: Assign the figure to a variable (e.g. p = figure(...)). The extension renders it as interactive HTML.
- For interactive HTML: Assign a string containing <html> with <script> and <canvas> or <div> for custom interactive widgets (sliders, canvas animations).
- No external network access or local disk file I/O (runs sandboxed in WebAssembly).
- Keep figures compact so they fit mobile & desktop: plt.figure(figsize=(6, 3.5)) or figsize=(5, 3). Never use figsize larger than (8, 5).

COMPACT EXAMPLES:

Example 1 — Compact 3D Surface:
\`\`\`python
# START_STUDENTVIZ
# Title: 3D Wave Surface
import matplotlib.pyplot as plt, numpy as np
X, Y = np.meshgrid(np.linspace(-3,3,50), np.linspace(-3,3,50))
plt.figure(figsize=(6,3.5)).add_subplot(111, projection='3d').plot_surface(X, Y, np.sin(np.sqrt(X**2+Y**2)), cmap='viridis')
plt.show()
# END_STUDENTVIZ
\`\`\`

Example 2 — One-Liner Curve:
\`\`\`python
# START_STUDENTVIZ
# Title: Damped Sine Wave
import matplotlib.pyplot as plt, numpy as np; x=np.linspace(0,10,200); plt.plot(x, np.exp(-x/3)*np.sin(2*np.pi*x), 'r-', lw=2); plt.grid(True); plt.show()
# END_STUDENTVIZ
\`\`\`

Example 3 — Animated Pendulum (GIF):
\`\`\`python
# START_STUDENTVIZ
# Title: Simple Pendulum Animation
import matplotlib.pyplot as plt, matplotlib.animation as animation, numpy as np
fig, ax = plt.subplots(figsize=(4,4)); ax.set_xlim(-1.2,1.2); ax.set_ylim(-1.2,0.2); ax.set_aspect('equal')
t = np.linspace(0,4*np.pi,60); theta = 0.8*np.cos(t)
line, = ax.plot([],[],'-o',lw=2,markersize=10)
def update(i): x,y=np.sin(theta[i]),-np.cos(theta[i]); line.set_data([0,x],[0,y]); return line,
anim = animation.FuncAnimation(fig, update, frames=len(t), interval=50, blit=True)
# END_STUDENTVIZ
\`\`\`

Example 4 — Interactive Plotly with Animation:
\`\`\`python
# START_STUDENTVIZ
# Title: Animated Scatter
import plotly.express as px, pandas as pd, numpy as np
t=np.linspace(0,2*np.pi,8); df=pd.DataFrame([(f,np.cos(a+f/5),np.sin(a+f/5)) for f in range(20) for a in t],columns=['frame','x','y'])
fig=px.scatter(df,x='x',y='y',animation_frame='frame',range_x=[-1.5,1.5],range_y=[-1.5,1.5])
# END_STUDENTVIZ
\`\`\``;

  // DOM Elements
  const promptEl = document.getElementById("prompt");
  const copyBtn = document.getElementById("copy");
  const copyBtnText = copyBtn && copyBtn.querySelector ? copyBtn.querySelector(".btn-text") : null;
  const copyStateEl = document.getElementById("copy-state");
  const enabledToggle = document.getElementById("enabled");

  const COPY_TEXT = "Copy instructions";
  const RESET_TIMEOUT_MS = 2000;

  let resetTimer = null;

  // Populate the (hidden) prompt textarea
  if (promptEl) {
    promptEl.value = a;
  }

  function resetCopyFeedback() {
    if (resetTimer) {
      clearTimeout(resetTimer);
      resetTimer = null;
    }
    if (copyBtn && copyBtn.classList && typeof copyBtn.classList.remove === "function") {
      copyBtn.classList.remove("copied");
    }
    if (copyBtnText) {
      copyBtnText.textContent = COPY_TEXT;
    }
    if (copyStateEl) {
      copyStateEl.textContent = "";
    }
  }

  const handleCopy = async () => {
    if (resetTimer) {
      clearTimeout(resetTimer);
      resetTimer = null;
    }

    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        throw new Error("Clipboard API unavailable");
      }

      await navigator.clipboard.writeText(a);

      if (copyBtnText) {
        copyBtnText.textContent = "Copied!";
      }
      if (copyBtn && copyBtn.classList && typeof copyBtn.classList.add === "function") {
        copyBtn.classList.add("copied");
      }
      if (copyStateEl) {
        copyStateEl.textContent = "Copied. Paste it into your AI chat.";
      }

      resetTimer = setTimeout(resetCopyFeedback, RESET_TIMEOUT_MS);
    } catch (err) {
      // Fallback: reveal the raw instructions so they can be copied manually
      if (promptEl) {
        promptEl.hidden = false;
        promptEl.focus();
        promptEl.select();
      }
      if (copyStateEl) {
        copyStateEl.textContent = "Select the instruction text and copy it.";
      }
      resetTimer = setTimeout(resetCopyFeedback, RESET_TIMEOUT_MS);
    }
  };

  if (copyBtn) {
    if (typeof copyBtn.addEventListener === "function") {
      copyBtn.addEventListener("click", handleCopy);
    }
    copyBtn.onclick = handleCopy;
  }

  // Enable / disable sync with content.js (chrome.storage.local "enabled")
  function loadEnabledState() {
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get({ enabled: true }, (result) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            console.warn("[BirdPlot] Error reading storage:", chrome.runtime.lastError);
            return;
          }
          if (enabledToggle && result && typeof result.enabled === "boolean") {
            enabledToggle.checked = result.enabled;
            if (typeof enabledToggle.setAttribute === "function") {
              enabledToggle.setAttribute("aria-checked", String(result.enabled));
            }
          }
        });
      } else if (typeof localStorage !== "undefined") {
        const stored = localStorage.getItem("birdplot_enabled") ?? localStorage.getItem("studentviz_enabled");
        if (stored !== null && enabledToggle) {
          const isEnabled = stored === "true";
          enabledToggle.checked = isEnabled;
          if (typeof enabledToggle.setAttribute === "function") {
            enabledToggle.setAttribute("aria-checked", String(isEnabled));
          }
        }
      }
    } catch (err) {
      console.warn("[BirdPlot] chrome.storage.local unavailable, keeping default:", err);
    }
  }

  function saveEnabledState(isEnabled) {
    if (enabledToggle && typeof enabledToggle.setAttribute === "function") {
      enabledToggle.setAttribute("aria-checked", String(isEnabled));
    }
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ enabled: isEnabled }, () => {
          if (chrome.runtime && chrome.runtime.lastError) {
            console.warn("[BirdPlot] Error writing storage:", chrome.runtime.lastError);
          }
        });
      } else if (typeof localStorage !== "undefined") {
        localStorage.setItem("birdplot_enabled", String(isEnabled));
        localStorage.setItem("studentviz_enabled", String(isEnabled));
      }
    } catch (err) {
      console.warn("[BirdPlot] Could not persist enabled state:", err);
    }
  }

  if (enabledToggle) {
    const handleToggleChange = () => {
      saveEnabledState(enabledToggle.checked);
    };
    if (typeof enabledToggle.addEventListener === "function") {
      enabledToggle.addEventListener("change", handleToggleChange);
    }
    enabledToggle.onchange = handleToggleChange;
  }

  loadEnabledState();
})();
