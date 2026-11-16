const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = { console };
vm.createContext(context);
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '..', 'repair.js'), 'utf8'), context);
const repair = context.StudentVizRepair;

const deepSeekScreenshotLike = {
  $schema: 'studentviz/v1',
  type: 'plot',
  title: 'V = (4/3)πr³ untuk r = 0 sampai 4',
  description: 'Kurva melengkung naik = pertumbuhan pangkat tiga, bukan linear.',
  detail: 'full',
  xLabel: 'Jari-jari r',
  yLabel: 'Volume V',
  xRange: [0, 4.3],
  yRange: [0, 300],
  colors: { palette: ['#1f5fbf', '#b3261e'] },
  series: [
    { kind: 'function', expression: '(4/3)pix^3', range: [0, 4], samples: 300, name: 'V = (4/3)πr³', width: '3.5' },
    { kind: 'scatter', x: [1, 2, 3, 4], y: [4.18879, 33.5103, 113.097, 268.083], name: 'Contoh titik', markerSize: '9' }
  ],
  annotations: [{ x: 3, y: 113.1, text: 'r=3 → 36π ≈ 113', arrow: true }]
};

test('DeepSeek screenshot-like plot is detected in raw assistant prose', () => {
  const source = `Berikut grafik volume bola.\n\n${JSON.stringify(deepSeekScreenshotLike)}\n\nKurva kubik bertambah semakin cepat.`;
  const blocks = repair.extractBlocks(source);
  assert.equal(blocks.length, 1);
  assert.equal(JSON.parse(blocks[0]).$schema, 'studentviz/v1');
});

test('large assistant message can contain a compact visual beyond the old 400 KB scan cap', () => {
  const source = `${'Penjelasan biasa. '.repeat(26000)}\n${JSON.stringify(deepSeekScreenshotLike)}`;
  assert.ok(source.length > 400_000);
  const blocks = repair.extractBlocks(source);
  assert.equal(blocks.length, 1);
});

test('repairs pi-coordinate concatenation and numeric style strings', () => {
  const result = repair.repair(deepSeekScreenshotLike);
  assert.equal(result.spec.series[0].expression, '(4/3)*pi*x^3');
  assert.equal(result.spec.series[0].width, 3.5);
  assert.equal(result.spec.series[1].markerSize, 9);
  assert.ok(result.fixes.some(fix => /mathematical expression/.test(fix)));
});

test('normalizes Greek pi attached to common coordinates', () => {
  const cases = [
    ['πx^2', 'pi*x^2'],
    ['πr²', 'pi*r^2'],
    ['(2/3)pir^3', '(2/3)*pi*r^3'],
    ['2×πx³', '2*pi*x^3']
  ];
  for (const [expression, expected] of cases) {
    const result = repair.repair({ $schema: 'studentviz/v1', type: 'plot', series: [{ kind: 'function', expression, range: [-2, 2] }] });
    assert.equal(result.spec.series[0].expression, expected, expression);
  }
});

test('keeps a declared pix slider rather than rewriting its name', () => {
  const result = repair.repair({
    $schema: 'studentviz/v1', type: 'plot',
    parameters: [{ name: 'pix', min: 0, max: 10, value: 2 }],
    series: [{ kind: 'function', expression: 'pix', range: [-2, 2] }]
  });
  assert.equal(result.spec.series[0].expression, 'pix');
});

test('repairs loose JSON with single quotes, bare keys, comments and trailing commas', () => {
  const loose = `{
    $schema: 'studentviz/v1',
    type: 'plot', // chart kind
    series: [{kind:'function', expression:'sin(x)', range:[-6,6],}],
  }`;
  const result = repair.repair(loose);
  assert.equal(result.spec.$schema, 'studentviz/v1');
  assert.equal(result.spec.type, 'plot');
  assert.equal(result.spec.series[0].expression, 'sin(x)');
  assert.ok(result.fixes.includes('repaired JSON formatting'));
});

test('repairs a response cut off only by missing closing delimiters', () => {
  const truncated = `{"$schema":"studentviz/v1","type":"plot","series":[{"kind":"function","expression":"sin(x)","range":[-6,6]}`;
  const blocks = repair.extractBlocks(truncated);
  assert.equal(blocks.length, 1);
  assert.equal(repair.repair(blocks[0]).spec.series[0].kind, 'function');
});

test('migrates schema alias and chart type aliases', () => {
  const result = repair.repair({ schema: 'studentviz/v1', type: 'chart', expression: 'cos(x)', range: [-4, 4] });
  assert.equal(result.spec.$schema, 'studentviz/v1');
  assert.equal(result.spec.type, 'plot');
  assert.equal(result.spec.series[0].kind, 'function');
});

test('normalizes duplicate geometry IDs, color names and detail safely', () => {
  const result = repair.repair({
    $schema: 'studentviz/v1', type: 'geometry', detail: 'ULTRA',
    points: [{ id: 'A', x: 0, y: 0 }, { id: 'A', x: 2, y: 2 }],
    colors: { accent: 'blue', palette: ['red', '#12abef', 'not-a-color'] }
  });
  assert.notEqual(result.spec.points[0].id, result.spec.points[1].id);
  assert.equal(result.spec.colors.accent, '#1e88e5');
  assert.deepEqual(Array.from(result.spec.colors.palette), ['#e53935', '#12abef']);
  assert.equal(result.spec.detail, undefined);
});

test('rejects executable text and unsafe JSON keys; never evaluates code', () => {
  assert.throws(() => repair.parseCandidate('{"$schema":"studentviz/v1","type":"plot","series":[],"x":(()=>alert(1))()}'));
  assert.throws(() => repair.parseCandidate('{"__proto__":{"polluted":true}}'), /Unsafe JSON key/);
  assert.equal({}.polluted, undefined);
});

test('bounds candidate and payload sizes', () => {
  const hugeCandidate = `{"$schema":"studentviz/v1","type":"plot","title":"${'x'.repeat(410_000)}","series":[{"kind":"function","expression":"x"}]}`;
  assert.equal(repair.extractBlocks(hugeCandidate).length, 0);
  assert.deepEqual(Array.from(repair.extractBlocks('   ')), []);
});

test('repairs malformed plot data without discarding valid series', () => {
  const result = repair.repair({
    $schema: 'studentviz/v1', type: 'plot',
    series: [
      { kind: 'Line', x: [0, '1', 2, 'bad'], y: [0, '2', 4], width: '2.5' },
      { kind: 'scatter', x: [], y: [] },
      { kind: 'function', expression: 'sin(x)', range: [-3, 3] }
    ]
  });
  assert.equal(result.spec.series.length, 2);
  assert.equal(result.spec.series[0].kind, 'line');
  assert.deepEqual(Array.from(result.spec.series[0].x), [0, 1, 2]);
  assert.deepEqual(Array.from(result.spec.series[0].y), [0, 2, 4]);
  assert.equal(result.spec.series[0].width, 2.5);
  assert.ok(result.fixes.some(fix => /removed plot series 1/.test(fix)));
});

test('repairs mismatched pie and heatmap dimensions', () => {
  const pie = repair.repair({
    $schema: 'studentviz/v1', type: 'plot',
    series: [{ kind: 'pie', labels: ['A', 'B', 'C'], values: [2, 3] }]
  });
  assert.deepEqual(Array.from(pie.spec.series[0].labels), ['A', 'B']);
  assert.deepEqual(Array.from(pie.spec.series[0].values), [2, 3]);
  const heatmap = repair.repair({
    $schema: 'studentviz/v1', type: 'plot',
    series: [{ kind: 'heatmap', x: [0, 1, 2], y: [0, 1], z: [[1, 2], [3, 4]] }]
  });
  assert.deepEqual(Array.from(heatmap.spec.series[0].x), [0, 1]);
  assert.deepEqual(Array.from(heatmap.spec.series[0].z[1]), [3, 4]);
});

test('removes geometry primitives with dangling point references', () => {
  const result = repair.repair({
    $schema: 'studentviz/v1', type: 'geometry',
    points: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 1, y: 0 }, { id: 'C', x: 0, y: 1 }],
    segments: [{ from: 'A', to: 'B' }, { from: 'A', to: 'MISSING' }],
    polygons: [{ points: ['A', 'B', 'C'] }, { points: ['A', 'B', 'MISSING'] }],
    circles: [{ center: 'A', radius: 1 }, { center: 'MISSING', radius: 1 }]
  });
  assert.equal(result.spec.segments.length, 1);
  assert.equal(result.spec.polygons.length, 1);
  assert.equal(result.spec.circles.length, 1);
});

test('normalizes 3D primitive aliases, casing and invalid objects independently', () => {
  const result = repair.repair({
    $schema: 'studentviz/v1', type: 'scene3d',
    objects: [
      { kind: 'SPHERE', r: 2 },
      { kind: 'cube' },
      { kind: 'surface', expression: 'x^2-y^2', xRange: [-2, 2], yRange: [-2, 2], resolution: [999, '48'] },
      { kind: 'not-a-shape' }
    ]
  });
  assert.deepEqual(Array.from(result.spec.objects, object => object.kind), ['sphere', 'box', 'surface']);
  assert.equal(result.spec.objects[0].radius, 2);
  assert.deepEqual(Array.from(result.spec.objects[2].resolution), [256, 48]);
  assert.ok(result.fixes.some(fix => /removed invalid or unsupported 3D objects/.test(fix)));
});

test('reduces oversized 3D surface sampling under the hard vertex ceiling', () => {
  const result = repair.repair({
    $schema: 'studentviz/v1', type: 'scene3d',
    objects: [
      { kind: 'surface', expression: 'x+y', xRange: [-1, 1], yRange: [-1, 1], resolution: [256, 256] },
      { kind: 'surface', expression: 'x-y', xRange: [-1, 1], yRange: [-1, 1], resolution: [256, 256] },
      { kind: 'parametric', x: 'cos(u)', y: 'sin(u)', z: 'v', u: [0, 6.28], v: [0, 6.28], resolution: [256, 256] }
    ]
  });
  const total = result.spec.objects.reduce((sum, object) => sum + object.resolution[0] * object.resolution[1], 0);
  assert.ok(total <= 150_000, `scene estimates ${total} sampled vertices`);
  assert.equal(result.spec.objects.length, 3);
  assert.ok(result.fixes.some(fix => /reduced 3D surface resolution/.test(fix)));
});

test('trims oversized 3D curves, meshes and point clouds without exceeding budget', () => {
  const result = repair.repair({
    $schema: 'studentviz/v1', type: 'scene3d',
    objects: [
      { kind: 'surface', expression: 'x+y', xRange: [-1, 1], yRange: [-1, 1], resolution: [256, 256] },
      { kind: 'curve', x: 't', y: 'sin(t)', z: '0', t: [0, 6.28], samples: 10000, width: 3 },
      { kind: 'points', vertices: Array.from({ length: 20000 }, (_, i) => [i, 0, 0]) }
    ]
  });
  const surfaceCost = result.spec.objects[0].resolution[0] * result.spec.objects[0].resolution[1];
  const curveCost = result.spec.objects.find(object => object.kind === 'curve')?.samples * 16 || 0;
  const pointCost = result.spec.objects.find(object => object.kind === 'points')?.vertices.length || 0;
  assert.ok(surfaceCost + curveCost + pointCost <= 150_000);
  assert.ok(result.fixes.some(fix => /reduced 3D curve samples/.test(fix)) || result.fixes.some(fix => /trimmed points vertices/.test(fix)));
});

test('inserts missing commas between adjacent object properties without altering strings', () => {
  const malformed = `{
    "$schema":"studentviz/v1"
    "type":"plot"
    "title":"A value saying \\"red\\" is still text"
    "series":[{"kind":"function" "expression":"sin(x)" "range":[-3,3]}]
  }`;
  const result = repair.repair(malformed);
  assert.equal(result.spec.type, 'plot');
  assert.equal(result.spec.title, 'A value saying "red" is still text');
  assert.equal(result.spec.series[0].expression, 'sin(x)');
  assert.ok(result.fixes.includes('repaired JSON formatting'));
});
