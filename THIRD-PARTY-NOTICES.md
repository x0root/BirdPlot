# Third-Party Notices

BirdPlot bundles or loads the following open-source projects. Each keeps its
own license.

| Component | Version | License | Source |
|-----------|---------|---------|--------|
| Pyodide | 0.26.4 | MPL-2.0 | https://github.com/pyodide/pyodide |
| Plotly.js | 4.3.0 | MIT | https://github.com/plotly/plotly.js |
| three.js | bundled in Plotly's gl3d bundle | MIT | https://github.com/mrdoob/three.js |
| NumPy | as shipped in Pyodide 0.26.4 | BSD-3-Clause | https://github.com/numpy/numpy |
| Matplotlib | as shipped in Pyodide 0.26.4 | Matplotlib License (PSF-style) | https://github.com/matplotlib/matplotlib |
| pandas | as shipped in Pyodide 0.26.4 | BSD-3-Clause | https://github.com/pandas-dev/pandas |
| SymPy | as shipped in Pyodide 0.26.4 | BSD-3-Clause | https://github.com/sympy/sympy |

License texts for the bundled files are kept in `vendor/`:

- `vendor/pyodide-LICENSE.txt`
- `vendor/plotly-LICENSE.txt`
- `vendor/three-LICENSE.txt`

## Notes for reviewers (Firefox AMO / Chrome Web Store)

- The Pyodide loader files (`vendor/pyodide.js`, `vendor/pyodide.asm.js`) are
  the unmodified official release, bundled so the extension does not need
  remote code for its own logic.
- Scientific packages (NumPy, Matplotlib, pandas, SymPy, and the rest of the
  supported list) are installed by Pyodide from the official Pyodide
  distribution at runtime, over HTTPS, and cached by the browser. Pure-Python
  packages come from PyPI through micropip. Both are declared in
  `host_permissions` and in the extension CSP `connect-src`.
- No code is fetched from a BirdPlot server. There is no BirdPlot backend.

Pyodide version: 0.26.4
Downloaded from: https://cdn.jsdelivr.net/pyodide/v0.26.4/full/
