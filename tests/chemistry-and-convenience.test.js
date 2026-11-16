const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const repairSource = fs.readFileSync(path.join(root, 'repair.js'), 'utf8');
const repairContext = { console };
vm.createContext(repairContext);
vm.runInContext(repairSource, repairContext);
const repair = repairContext.StudentVizRepair;

// Also load the real viewer validator to verify all generated specs pass
const viewerSource = fs.readFileSync(path.join(root, 'viewer.js'), 'utf8');
const start = viewerSource.indexOf('var Bc=Object.freeze(');
const validationEnd = viewerSource.indexOf('function Cr(', start);
const validationContext = { Math, Object, Number, Set, Error, JSON };
vm.createContext(validationContext);
vm.runInContext(viewerSource.slice(start, validationEnd) + '\nglobalThis.__validateStudentViz=Gc;', validationContext);
const validate = validationContext.__validateStudentViz;

test('chemistry: expands H2O formula into a valid 3D ball-and-stick scene', () => {
  const raw = {
    $schema: 'studentviz/v1',
    type: 'chemical',
    formula: 'H2O'
  };
  const result = repair.repair(raw);
  assert.equal(result.spec.type, 'scene3d');
  assert.equal(result.spec.title, 'Water Molecule (H₂O)');
  assert.equal(result.spec.objects.length, 5); // 3 spheres (1 O, 2 H) + 2 cylinders (bonds)
  
  const spheres = result.spec.objects.filter(o => o.kind === 'sphere');
  const cylinders = result.spec.objects.filter(o => o.kind === 'cylinder');
  assert.equal(spheres.length, 3);
  assert.equal(cylinders.length, 2);

  // Oxygen is red
  const oxygen = spheres.find(s => s.color === '#dc2626');
  assert.ok(oxygen, 'Oxygen atom must have CPK red color');
  
  // Hydrogens are white
  const hydrogens = spheres.filter(s => s.color === '#ffffff');
  assert.equal(hydrogens.length, 2, 'Two hydrogen atoms with CPK white color');

  // Verify real viewer validator accepts it
  assert.doesNotThrow(() => validate(result.spec));
});

test('chemistry: expands custom molecule atoms and bonds', () => {
  const raw = {
    $schema: 'studentviz/v1',
    type: 'molecule',
    atoms: [
      { element: 'C', position: [0, 0, 0] },
      { element: 'O', position: [1.2, 0, 0] }
    ],
    bonds: [
      { from: 0, to: 1, order: 2 }
    ]
  };
  const result = repair.repair(raw);
  assert.equal(result.spec.type, 'scene3d');
  assert.equal(result.spec.objects.length, 3); // 2 spheres + 1 cylinder

  const carbon = result.spec.objects.find(o => o.color === '#333333');
  assert.ok(carbon, 'Carbon atom found');
  const bond = result.spec.objects.find(o => o.kind === 'cylinder');
  assert.ok(bond, 'Bond cylinder found');
  assert.equal(bond.position[0], 0.6); // midpoint

  assert.doesNotThrow(() => validate(result.spec));
});

test('chemistry: converts 2D chemical structure to geometry points and bonds', () => {
  const raw = {
    $schema: 'studentviz/v1',
    type: 'chemical',
    format: '2d',
    atoms: [
      { element: 'O', position: [0, 0] },
      { element: 'H', position: [1, 1] },
      { element: 'H', position: [-1, 1] }
    ],
    bonds: [[0, 1], [0, 2]]
  };
  const result = repair.repair(raw);
  assert.equal(result.spec.type, 'geometry');
  assert.equal(result.spec.points.length, 3);
  assert.equal(result.spec.segments.length, 2);
  assert.equal(result.spec.points[0].label, 'O');

  assert.doesNotThrow(() => validate(result.spec));
});

test('easy 3D: computes cylinder orientation and height from endpoints', () => {
  const raw = {
    $schema: 'studentviz/v1',
    type: 'scene3d',
    objects: [
      { from: [0, 0, 0], to: [0, 4, 0], color: 'blue' }
    ]
  };
  const result = repair.repair(raw);
  assert.equal(result.spec.objects[0].kind, 'cylinder');
  assert.deepEqual(Array.from(result.spec.objects[0].position), [0, 2, 0]);
  assert.equal(result.spec.objects[0].height, 4);
  assert.equal(result.spec.objects[0].color, '#1e88e5');

  assert.doesNotThrow(() => validate(result.spec));
});

test('easy 3D: normalizes camera preset strings and top-level expressions', () => {
  const raw = {
    $schema: 'studentviz/v1',
    type: 'scene3d',
    camera: 'isometric',
    expression: 'sin(x)*cos(y)'
  };
  const result = repair.repair(raw);
  assert.deepEqual({ ...result.spec.camera }, { azimuth: -45, elevation: 35 });
  assert.equal(result.spec.objects[0].kind, 'surface');
  assert.equal(result.spec.objects[0].expression, 'sin(x)*cos(y)');

  assert.doesNotThrow(() => validate(result.spec));
});

test('easy 2D: supports shorthand function plot and coordinate pair data', () => {
  const rawPlot = {
    $schema: 'studentviz/v1',
    type: 'plot',
    fn: 'cos(x)'
  };
  const plotResult = repair.repair(rawPlot);
  assert.equal(plotResult.spec.series[0].kind, 'function');
  assert.equal(plotResult.spec.series[0].expression, 'cos(x)');
  assert.doesNotThrow(() => validate(plotResult.spec));

  const rawData = {
    $schema: 'studentviz/v1',
    type: 'plot',
    data: [[0, 0], [1, 1], [2, 4], [3, 9]]
  };
  const dataResult = repair.repair(rawData);
  assert.equal(dataResult.spec.series[0].kind, 'line');
  assert.deepEqual(Array.from(dataResult.spec.series[0].x), [0, 1, 2, 3]);
  assert.deepEqual(Array.from(dataResult.spec.series[0].y), [0, 1, 4, 9]);
  assert.doesNotThrow(() => validate(dataResult.spec));
});

test('easy 2D: supports dictionary-style geometry points', () => {
  const raw = {
    $schema: 'studentviz/v1',
    type: 'geometry',
    points: {
      A: [0, 0],
      B: [4, 0],
      C: [4, 3]
    },
    lines: [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
      { from: 'C', to: 'A' }
    ]
  };
  const result = repair.repair(raw);
  assert.equal(result.spec.points.length, 3);
  assert.equal(result.spec.segments.length, 3);
  assert.doesNotThrow(() => validate(result.spec));
});
