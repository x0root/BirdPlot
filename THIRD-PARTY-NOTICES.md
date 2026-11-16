# Third-Party Notices

BirdPlot bundles or depends on the following open-source projects. Each
keeps its own license. Fill in the versions you actually ship, and remove
any line you don't use.

| Component | Version | License | Source |
|-----------|---------|---------|--------|
| Pyodide | _fill in_ | MPL-2.0 | https://github.com/pyodide/pyodide |
| NumPy | _fill in_ | BSD-3-Clause | https://github.com/numpy/numpy |
| Matplotlib | _fill in_ | Matplotlib License (PSF-style) | https://github.com/matplotlib/matplotlib |
| Pandas | _fill in_ | BSD-3-Clause | https://github.com/pandas-dev/pandas |
| SymPy | _fill in_ | BSD-3-Clause | https://github.com/sympy/sympy |
| 3D library (Plotly / three.js / other) | _fill in_ | _check_ | _fill in_ |

## Notes for reviewers (Firefox AMO / Chrome Web Store)

- Pyodide files are the **unmodified official release**. Record the exact
  version and download URL here so reviewers can verify them.
- No remote code is loaded at runtime. Everything is bundled in the
  extension package.

Pyodide Version: _fill in_
Downloaded from: _fill in_
