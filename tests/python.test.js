const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
require(path.join(root, 'repair.js'));
const repair = globalThis.StudentVizRepair;

test('repair exports Python detection and extraction helpers', () => {
  assert.ok(repair, 'StudentVizRepair is defined');
  assert.equal(typeof repair.isPythonBlock, 'function');
  assert.equal(typeof repair.extractPythonBlocks, 'function');
  assert.equal(typeof repair.extractPythonCode, 'function');
  assert.equal(typeof repair.detectPythonPackages, 'function');
  assert.ok(repair.PYTHON_START_FLAG.test('# START_STUDENTVIZ'));
  assert.ok(repair.PYTHON_END_FLAG.test('# END_STUDENTVIZ'));
});

test('detects python blocks by START/END flags', () => {
  const codeWithFlags = `
# START_STUDENTVIZ
import matplotlib.pyplot as plt
import numpy as np
x = np.linspace(0, 10, 100)
plt.plot(x, np.sin(x))
plt.show()
# END_STUDENTVIZ
`;
  assert.ok(repair.isPythonBlock(codeWithFlags));
  const extracted = repair.extractPythonCode(codeWithFlags);
  assert.ok(extracted.includes('plt.plot(x, np.sin(x))'));
  assert.ok(!extracted.includes('# START_STUDENTVIZ'));
  assert.ok(!extracted.includes('# END_STUDENTVIZ'));
});

test('detects python blocks by studentviz-python markdown fence', () => {
  const fenceBlock = `\`\`\`studentviz-python
import numpy as np
import matplotlib.pyplot as plt
fig = plt.figure()
plt.show()
\`\`\``;
  assert.ok(repair.isPythonBlock(fenceBlock));
  const blocks = repair.extractPythonBlocks(fenceBlock);
  assert.equal(blocks.length, 1);
  const code = repair.extractPythonCode(blocks[0]);
  assert.ok(code.includes('import numpy as np'));
});

test('detects python blocks by DOM language attributes or class', () => {
  const mockNode = {
    className: 'language-python',
    getAttribute(name) {
      if (name === 'data-language') return 'python';
      return null;
    },
    closest() { return null; }
  };
  const pyCode = `import matplotlib.pyplot as plt\nplt.plot([1, 2, 3])\nplt.show()`;
  assert.ok(repair.isPythonBlock(pyCode, mockNode));
});

test('does not falsely detect standard JSON studentviz as python', () => {
  const jsonBlock = `{"$schema":"studentviz/v1","type":"plot","series":[{"kind":"function","expression":"sin(x)"}]}`;
  assert.equal(repair.isPythonBlock(jsonBlock), false);
});

test('detectPythonPackages accurately identifies 20 top visualization libraries', () => {
  const pythonScript = `
import numpy as np
import matplotlib.pyplot as plt
import scipy.spatial as spatial
import plotly.graph_objects as go
import seaborn as sns
import pandas as pd
import sympy as sp
from PIL import Image
import trimesh
import shapely.geometry
import networkx as nx
import mpmath
from sklearn.decomposition import PCA
import statsmodels.api as sm
import bokeh.plotting
import altair as alt
import svgwrite
from wordcloud import WordCloud
import pywt
import imageio
import skimage
import astropy
import uncertainties
import lmfit
import cmocean
import pygal
from matplotlib import animation
`;
  const pkgs = repair.detectPythonPackages(pythonScript);
  const expected = [
    'numpy', 'matplotlib', 'scipy', 'plotly', 'seaborn',
    'pandas', 'sympy', 'pillow', 'trimesh', 'shapely',
    'networkx', 'mpmath', 'scikit-learn', 'statsmodels',
    'bokeh', 'altair', 'svgwrite', 'wordcloud', 'pywavelets', 'imageio',
    'scikit-image', 'astropy', 'uncertainties', 'lmfit', 'cmocean', 'pygal'
  ];

  for (const exp of expected) {
    assert.ok(pkgs.includes(exp), `Expected package ${exp} to be detected`);
  }
  assert.ok(pkgs.length >= 26, `Expected at least 26 packages, got ${pkgs.length}`);
});

test('normalizeType normalizes python type aliases', () => {
  assert.equal(repair.normalizeType('python'), 'python');
  assert.equal(repair.normalizeType('Python'), 'python');
  assert.equal(repair.normalizeType('py'), 'python');
  assert.equal(repair.normalizeType('pyodide'), 'python');
  assert.equal(repair.normalizeType('PYODIDE'), 'python');
});

test('repair engine repairs python spec object', () => {
  const rawPythonSpec = {
    $schema: 'studentviz/v1',
    type: 'pyodide',
    code: 'import numpy as np\nprint(np.pi)',
    title: 'Numpy Demo'
  };

  const repaired = repair.repair(rawPythonSpec);
  assert.ok(repaired.spec);
  assert.equal(repaired.spec.$schema, 'studentviz/v1');
  assert.equal(repaired.spec.type, 'python');
  assert.equal(repaired.spec.code, 'import numpy as np\nprint(np.pi)');
  assert.equal(repaired.spec.title, 'Numpy Demo');
});

test('extractPythonBlocks extracts multiple flagged or fenced code segments', () => {
  const text = `
Here is a 3D sphere:
\`\`\`studentviz-python
# START_STUDENTVIZ
import numpy as np
import matplotlib.pyplot as plt
# Sphere code
plt.show()
# END_STUDENTVIZ
\`\`\`

And here is a 2D curve:
# START_STUDENTVIZ
import matplotlib.pyplot as plt
plt.plot([1, 4, 9])
plt.show()
# END_STUDENTVIZ
`;

  const blocks = repair.extractPythonBlocks(text);
  assert.equal(blocks.length, 2);
});

test('detects animation code with FuncAnimation and specialized math/physics imports', () => {
  const animCode = `\`\`\`python
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
import numpy as np
fig, ax = plt.subplots()
anim = FuncAnimation(fig, lambda i: None, frames=10)
\`\`\``;
  assert.ok(repair.isPythonBlock(animCode));
  const blocks = repair.extractPythonBlocks(animCode);
  assert.equal(blocks.length, 1);
  const code = repair.extractPythonCode(blocks[0]);
  assert.ok(code.includes('FuncAnimation'));

  const physicsCode = `\`\`\`python
import astropy.units as u
from uncertainties import ufloat
import lmfit
import cmocean
\`\`\``;
  assert.ok(repair.isPythonBlock(physicsCode));
  const pkgs = repair.detectPythonPackages(physicsCode);
  assert.ok(pkgs.includes('astropy'));
  assert.ok(pkgs.includes('uncertainties'));
  assert.ok(pkgs.includes('lmfit'));
  assert.ok(pkgs.includes('cmocean'));
});

test('viewer.html and plotly.html include willReadFrequently optimization patch', () => {
  const viewerHtml = fs.readFileSync(path.join(root, 'viewer.html'), 'utf8');
  assert.ok(viewerHtml.includes('willReadFrequently: true'), 'viewer.html has willReadFrequently patch');

  const plotlyHtml = fs.readFileSync(path.join(root, 'plotly.html'), 'utf8');
  assert.ok(plotlyHtml.includes('willReadFrequently: true'), 'plotly.html has willReadFrequently patch');
});

test('plotly.html strips hardcoded width/height and handles resizing; content.js uses postMessage delivery', () => {
  const plotlyHtml = fs.readFileSync(path.join(root, 'plotly.html'), 'utf8');
  assert.ok(plotlyHtml.includes('delete cachedLayout.width'), 'plotly.html strips layout width');
  assert.ok(plotlyHtml.includes('delete cachedLayout.height'), 'plotly.html strips layout height');
  assert.ok(plotlyHtml.includes('Plotly.Plots.resize'), 'plotly.html has resize call');
  assert.ok(plotlyHtml.includes('autosize: true'), 'plotly.html sets autosize');

  const contentJs = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
  assert.ok(contentJs.includes('getExtensionURL("plotly.html")'), 'content.js loads plotly.html via src');
  assert.ok(contentJs.includes('action: "render"'), 'content.js sends render action via postMessage');
  assert.ok(!contentJs.includes('sandbox="allow-scripts"') || !contentJs.includes('plotlyFrame.setAttribute("sandbox"'),
    'no DOM sandbox attribute on plotly iframe (manifest handles it)');
});

test('both native visual card and Python card include rescale button with scale modes', () => {
  const contentJs = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
  const insertVisualMatches = contentJs.includes('scaleBtn.title = "Rescale visual (Fit, 75%, 50%, 100%)"');
  assert.ok(insertVisualMatches, 'scale button is defined with Fit, 75%, 50%, 100%');
  assert.ok(contentJs.includes('card.dataset.scale = mode'), 'updates card.dataset.scale');
});

test('handles complex 3D Plotly code with comma imports and animation frames', () => {
  const userPlotlyCode = `# START_STUDENTVIZ
# Title: Interactive 3D Fourier Series — Square Wave
import plotly.graph_objects as go, numpy as np
x=np.linspace(-np.pi,np.pi,300); frames=[]; Ns=list(range(1,24,2))
for n in Ns:
    hs=[(k,4/(np.pi*k)*np.sin(k*x)) for k in range(1,n+1,2)]
    traces=[go.Scatter3d(x=x,y=np.full_like(x,k),z=y,mode='lines',line=dict(width=2,color='rgba(100,150,255,0.35)'),name=f'harmonic {k}',showlegend=False) for k,y in hs]
    s=sum(y for k,y in hs); traces.append(go.Scatter3d(x=x,y=np.zeros_like(x),z=s,mode='lines',line=dict(width=6,color='red'),name='partial sum'))
    frames.append(go.Frame(data=traces,name=str(n)))
first=Ns[0]; init=[(k,4/(np.pi*k)*np.sin(k*x)) for k in range(1,first+1,2)]
traces=[go.Scatter3d(x=x,y=np.full_like(x,k),z=y,mode='lines',line=dict(width=2,color='rgba(100,150,255,0.35)'),showlegend=False) for k,y in init]
traces.append(go.Scatter3d(x=x,y=np.zeros_like(x),z=sum(y for k,y in init),mode='lines',line=dict(width=6,color='red'),name='partial sum'))
fig=go.Figure(data=traces,frames=frames)
fig.update_layout(title='Square wave = Σ 4/(πk)·sin(kx)  (scrub slider)',scene=dict(xaxis_title='x',yaxis_title='harmonic k',zaxis_title='amplitude',camera=dict(eye=dict(x=1.6,y=1.4,z=0.9))),updatemenus=[dict(type='buttons',buttons=[dict(label='▶ Play',method='animate',args=[None,{'frame':{'duration':500},'fromcurrent':True}])],x=0.05,y=1.1)],sliders=[dict(steps=[dict(method='animate',args=[[str(n)],{'frame':{'duration':0},'mode':'immediate'}],label=str(n)) for n in Ns],currentvalue=dict(prefix='harmonics: '))])
# END_STUDENTVIZ`;

  assert.ok(repair.isPythonBlock(userPlotlyCode), 'identifies 3D Fourier series block as python');
  const pkgs = repair.detectPythonPackages(userPlotlyCode);
  assert.ok(pkgs.includes('plotly'), 'detects plotly package');
  assert.ok(pkgs.includes('numpy'), 'detects comma-separated numpy package');

  const contentJs = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
  assert.ok(contentJs.includes('frames: pFrames'), 'content.js forwards animation frames');
  assert.ok(contentJs.includes('channel: channel') || contentJs.includes('?channel='), 'content.js passes channel to plotly iframe');

  const plotlyHtml = fs.readFileSync(path.join(root, 'plotly.html'), 'utf8');
  assert.ok(plotlyHtml.includes('Plotly.newPlot'), 'plotly.html uses newPlot for animation frames');
  assert.ok(plotlyHtml.includes('cachedFrames'), 'plotly.html supports cachedFrames');
  assert.ok(plotlyHtml.includes('showError'), 'plotly.html includes visible error fallback');

  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const sandboxCsp = manifest.content_security_policy.sandbox;
  assert.ok(sandboxCsp.includes('worker-src'), 'sandbox CSP permits web workers for 3D Scatter3d');
  assert.ok(sandboxCsp.includes("'unsafe-eval'"), 'sandbox CSP permits unsafe-eval for plotly');
});

