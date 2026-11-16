/* StudentViz local detector + conservative repair engine.
 * No eval, network calls, or generated-code execution. */
(() => {
  "use strict";

  const MAX_LENGTH = 400_000;
  const VISUAL_KEYS = new Set([
    "$schema", "schema", "type", "series", "points", "objects", "polygons",
    "segments", "circles", "rightAngles", "parameters", "xRange", "yRange",
    "expression", "vertices", "faces", "kind", "camera", "animate", "controls", "data", "datasets",
    "formula", "molecule", "chemical", "atoms", "bonds", "elements"
  ]);
  const OBJECT_KINDS = new Set([
    "surface", "parametric", "curve", "mesh", "sphere", "box", "cube", "cylinder",
    "cone", "torus", "lathe", "extrude", "points", "pointcloud", "point-cloud",
    "rectangular-prism", "triangular-mesh", "molecule", "chemical", "atom", "bond",
    "ball", "globe", "orb", "point3d", "pipe", "rod", "tube", "connector", "column",
    "block", "cuboid", "slab", "pyramid", "funnel", "arrowhead", "donut", "ring", "hoop",
    "plane", "plate", "sheet", "floor", "arrow", "vector"
  ]);
  const SERIES_KINDS = new Set([
    "function", "parametric", "line", "scatter", "bar", "area", "box",
    "violin", "histogram", "pie", "contour", "heatmap"
  ]);
  const COLOR_NAMES = {
    black: "#000000", white: "#ffffff", red: "#e53935", blue: "#1e88e5",
    green: "#2e7d32", purple: "#8e44ad", orange: "#ef6c00", yellow: "#f9a825",
    gray: "#808080", grey: "#808080", pink: "#e91e63", cyan: "#00acc1",
    teal: "#00897b", navy: "#1a237e", crimson: "#dc143c", magenta: "#c2185b",
    gold: "#d4a017", brown: "#795548", lime: "#7cb342", indigo: "#3f51b5",
    violet: "#8e24aa", amber: "#ffb300", silver: "#94a3b8", bronze: "#cd7f32",
    charcoal: "#333333", slate: "#64748b", sky: "#0ea5e9", emerald: "#10b981",
    rose: "#f43f5e", coral: "#ff6f61", turquoise: "#06b6d4"
  };

  const CPK_ELEMENTS = {
    H:  { color: "#ffffff", radius: 0.32, name: "Hydrogen" },
    C:  { color: "#333333", radius: 0.52, name: "Carbon" },
    N:  { color: "#2563eb", radius: 0.48, name: "Nitrogen" },
    O:  { color: "#dc2626", radius: 0.46, name: "Oxygen" },
    F:  { color: "#84cc16", radius: 0.44, name: "Fluorine" },
    Cl: { color: "#16a34a", radius: 0.62, name: "Chlorine" },
    Br: { color: "#991b1b", radius: 0.70, name: "Bromine" },
    I:  { color: "#6b21a8", radius: 0.78, name: "Iodine" },
    P:  { color: "#ea580c", radius: 0.58, name: "Phosphorus" },
    S:  { color: "#eab308", radius: 0.60, name: "Sulfur" },
    B:  { color: "#f97316", radius: 0.50, name: "Boron" },
    Na: { color: "#9333ea", radius: 0.68, name: "Sodium" },
    K:  { color: "#7e22ce", radius: 0.75, name: "Potassium" },
    Mg: { color: "#15803d", radius: 0.65, name: "Magnesium" },
    Ca: { color: "#166534", radius: 0.72, name: "Calcium" },
    Fe: { color: "#c2410c", radius: 0.64, name: "Iron" },
    Cu: { color: "#be185d", radius: 0.62, name: "Copper" },
    Zn: { color: "#475569", radius: 0.62, name: "Zinc" },
    Ag: { color: "#cbd5e1", radius: 0.68, name: "Silver" },
    Au: { color: "#eab308", radius: 0.70, name: "Gold" },
    He: { color: "#06b6d4", radius: 0.30, name: "Helium" },
    Ne: { color: "#0ea5e9", radius: 0.35, name: "Neon" },
    Ar: { color: "#0284c7", radius: 0.45, name: "Argon" },
    Si: { color: "#d97706", radius: 0.60, name: "Silicon" },
    Al: { color: "#94a3b8", radius: 0.62, name: "Aluminium" }
  };

  const MOLECULE_TEMPLATES = {
    h2o: {
      title: "Water Molecule (H₂O)",
      atoms: [
        { element: "O", position: [0, 0, 0] },
        { element: "H", position: [0.76, 0.59, 0] },
        { element: "H", position: [-0.76, 0.59, 0] }
      ],
      bonds: [[0, 1], [0, 2]]
    },
    co2: {
      title: "Carbon Dioxide (CO₂)",
      atoms: [
        { element: "C", position: [0, 0, 0] },
        { element: "O", position: [-1.2, 0, 0] },
        { element: "O", position: [1.2, 0, 0] }
      ],
      bonds: [{ from: 0, to: 1, order: 2 }, { from: 0, to: 2, order: 2 }]
    },
    ch4: {
      title: "Methane (CH₄)",
      atoms: [
        { element: "C", position: [0, 0, 0] },
        { element: "H", position: [0.63, 0.63, 0.63] },
        { element: "H", position: [-0.63, -0.63, 0.63] },
        { element: "H", position: [-0.63, 0.63, -0.63] },
        { element: "H", position: [0.63, -0.63, -0.63] }
      ],
      bonds: [[0, 1], [0, 2], [0, 3], [0, 4]]
    },
    nh3: {
      title: "Ammonia (NH₃)",
      atoms: [
        { element: "N", position: [0, 0, 0.38] },
        { element: "H", position: [0, 0.94, -0.13] },
        { element: "H", position: [0.81, -0.47, -0.13] },
        { element: "H", position: [-0.81, -0.47, -0.13] }
      ],
      bonds: [[0, 1], [0, 2], [0, 3]]
    },
    c2h5oh: {
      title: "Ethanol (C₂H₅OH)",
      atoms: [
        { element: "C", position: [-0.75, -0.25, 0] },
        { element: "C", position: [0.75, 0.25, 0] },
        { element: "O", position: [1.65, -0.75, 0] },
        { element: "H", position: [2.55, -0.45, 0] },
        { element: "H", position: [-1.25, -0.1, 0.9] },
        { element: "H", position: [-1.25, -0.1, -0.9] },
        { element: "H", position: [-0.75, -1.3, 0] },
        { element: "H", position: [0.75, 1.3, 0.5] },
        { element: "H", position: [0.75, 1.3, -0.5] }
      ],
      bonds: [[0, 1], [1, 2], [2, 3], [0, 4], [0, 5], [0, 6], [1, 7], [1, 8]]
    },
    c6h6: {
      title: "Benzene (C₆H₆)",
      atoms: [
        ...Array.from({ length: 6 }, (_, i) => ({ element: "C", position: [Math.round(1.4 * Math.cos(i * Math.PI / 3) * 100) / 100, Math.round(1.4 * Math.sin(i * Math.PI / 3) * 100) / 100, 0] })),
        ...Array.from({ length: 6 }, (_, i) => ({ element: "H", position: [Math.round(2.48 * Math.cos(i * Math.PI / 3) * 100) / 100, Math.round(2.48 * Math.sin(i * Math.PI / 3) * 100) / 100, 0] }))
      ],
      bonds: [
        [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],
        [0, 6], [1, 7], [2, 8], [3, 9], [4, 10], [5, 11]
      ]
    },
    c2h6: {
      title: "Ethane (C₂H₆)",
      atoms: [
        { element: "C", position: [-0.75, 0, 0] },
        { element: "C", position: [0.75, 0, 0] },
        { element: "H", position: [-1.15, 1.0, 0] },
        { element: "H", position: [-1.15, -0.5, 0.87] },
        { element: "H", position: [-1.15, -0.5, -0.87] },
        { element: "H", position: [1.15, -1.0, 0] },
        { element: "H", position: [1.15, 0.5, 0.87] },
        { element: "H", position: [1.15, 0.5, -0.87] }
      ],
      bonds: [[0, 1], [0, 2], [0, 3], [0, 4], [1, 5], [1, 6], [1, 7]]
    },
    c2h4: {
      title: "Ethene (C₂H₄)",
      atoms: [
        { element: "C", position: [-0.67, 0, 0] },
        { element: "C", position: [0.67, 0, 0] },
        { element: "H", position: [-1.23, 0.93, 0] },
        { element: "H", position: [-1.23, -0.93, 0] },
        { element: "H", position: [1.23, 0.93, 0] },
        { element: "H", position: [1.23, -0.93, 0] }
      ],
      bonds: [{ from: 0, to: 1, order: 2 }, [0, 2], [0, 3], [1, 4], [1, 5]]
    },
    c2h2: {
      title: "Ethyne (C₂H₂)",
      atoms: [
        { element: "H", position: [-1.8, 0, 0] },
        { element: "C", position: [-0.6, 0, 0] },
        { element: "C", position: [0.6, 0, 0] },
        { element: "H", position: [1.8, 0, 0] }
      ],
      bonds: [[0, 1], { from: 1, to: 2, order: 3 }, [2, 3]]
    },
    ch3oh: {
      title: "Methanol (CH₃OH)",
      atoms: [
        { element: "C", position: [-0.6, 0, 0] },
        { element: "O", position: [0.75, 0, 0] },
        { element: "H", position: [1.25, 0.8, 0] },
        { element: "H", position: [-1.0, 1.0, 0] },
        { element: "H", position: [-1.0, -0.5, 0.87] },
        { element: "H", position: [-1.0, -0.5, -0.87] }
      ],
      bonds: [[0, 1], [1, 2], [0, 3], [0, 4], [0, 5]]
    },
    nacl: {
      title: "Sodium Chloride (NaCl)",
      atoms: [
        { element: "Na", position: [-0.9, -0.9, -0.9] },
        { element: "Cl", position: [0.9, -0.9, -0.9] },
        { element: "Cl", position: [-0.9, 0.9, -0.9] },
        { element: "Na", position: [0.9, 0.9, -0.9] },
        { element: "Cl", position: [-0.9, -0.9, 0.9] },
        { element: "Na", position: [0.9, -0.9, 0.9] },
        { element: "Na", position: [-0.9, 0.9, 0.9] },
        { element: "Cl", position: [0.9, 0.9, 0.9] }
      ],
      bonds: [
        [0, 1], [0, 2], [1, 3], [2, 3],
        [4, 5], [4, 6], [5, 7], [6, 7],
        [0, 4], [1, 5], [2, 6], [3, 7]
      ]
    },
    o2: {
      title: "Oxygen (O₂)",
      atoms: [{ element: "O", position: [-0.6, 0, 0] }, { element: "O", position: [0.6, 0, 0] }],
      bonds: [{ from: 0, to: 1, order: 2 }]
    },
    n2: {
      title: "Nitrogen (N₂)",
      atoms: [{ element: "N", position: [-0.55, 0, 0] }, { element: "N", position: [0.55, 0, 0] }],
      bonds: [{ from: 0, to: 1, order: 3 }]
    },
    h2: {
      title: "Hydrogen (H₂)",
      atoms: [{ element: "H", position: [-0.37, 0, 0] }, { element: "H", position: [0.37, 0, 0] }],
      bonds: [[0, 1]]
    },
    hcl: {
      title: "Hydrogen Chloride (HCl)",
      atoms: [{ element: "H", position: [-0.65, 0, 0] }, { element: "Cl", position: [0.65, 0, 0] }],
      bonds: [[0, 1]]
    }
  };

  const MOLECULE_ALIASES = {
    water: "h2o", ethanol: "c2h5oh", alcohol: "c2h5oh", methane: "ch4",
    ammonia: "nh3", carbondioxide: "co2", benzene: "c6h6", salt: "nacl",
    table_salt: "nacl", tablesalt: "nacl", methanol: "ch3oh", ethane: "c2h6",
    ethene: "c2h4", ethylene: "c2h4", ethyne: "c2h2", acetylene: "c2h2",
    oxygen: "o2", nitrogen: "n2", hydrogen: "h2", hydrochloricacid: "hcl"
  };

  function createCylinderFromPoints(from, to, radius = 0.12, color = "#94a3b8") {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const dz = to[2] - from[2];
    const height = Math.hypot(dx, dy, dz);
    if (height < 1e-6) return null;
    const position = [
      (from[0] + to[0]) / 2,
      (from[1] + to[1]) / 2,
      (from[2] + to[2]) / 2
    ];
    const nx = dx / height;
    const ny = dy / height;
    const nz = dz / height;
    const rx = -Math.asin(Math.max(-1, Math.min(1, ny)));
    const cos_rx = Math.cos(rx);
    const ry = Math.abs(cos_rx) > 1e-6 ? Math.atan2(nx, nz) : 0;
    return {
      kind: "cylinder",
      position: position.map(v => Math.round(v * 1000) / 1000),
      height: Math.round(height * 1000) / 1000,
      radius: Math.round(radius * 1000) / 1000,
      rotation: [
        Math.round((rx * 180 / Math.PI) * 1000) / 1000,
        Math.round((ry * 180 / Math.PI) * 1000) / 1000,
        0
      ],
      color
    };
  }

  function expandMolecule(moleculeSpec, fixes = []) {
    let atoms = moleculeSpec.atoms;
    let bonds = moleculeSpec.bonds;
    const formulaRaw = String(moleculeSpec.formula ?? moleculeSpec.chemical ?? moleculeSpec.molecule ?? moleculeSpec.name ?? "").toLowerCase();
    const formulaKey = formulaRaw.replace(/[^a-z0-9]/g, "");
    const templateKey = MOLECULE_TEMPLATES[formulaKey] ? formulaKey : MOLECULE_ALIASES[formulaKey];
    const template = templateKey ? MOLECULE_TEMPLATES[templateKey] : null;

    if (template) {
      if (!atoms || !atoms.length) atoms = template.atoms;
      if (!bonds || !bonds.length) bonds = template.bonds;
      if (!moleculeSpec.title && template.title) moleculeSpec.title = template.title;
      fixes.push(`loaded template for molecule ${templateKey}`);
    }
    if (!Array.isArray(atoms) || !atoms.length) return [];

    const objects = [];
    const atomPositions = [];

    for (let i = 0; i < atoms.length; i++) {
      const rawAtom = atoms[i];
      let elem = "C";
      let pos = [0, 0, 0];
      let radius = null;
      let color = null;
      if (Array.isArray(rawAtom)) {
        elem = String(rawAtom[0] ?? "C");
        pos = [Number(rawAtom[1]) || 0, Number(rawAtom[2]) || 0, Number(rawAtom[3]) || 0];
      } else if (rawAtom && typeof rawAtom === "object") {
        elem = String(rawAtom.element ?? rawAtom.type ?? rawAtom.symbol ?? rawAtom.name ?? "C");
        elem = elem.charAt(0).toUpperCase() + elem.slice(1).toLowerCase();
        if (Array.isArray(rawAtom.position)) pos = rawAtom.position.slice(0, 3).map(Number);
        else if (Array.isArray(rawAtom.coords)) pos = rawAtom.coords.slice(0, 3).map(Number);
        else if (rawAtom.x !== undefined || rawAtom.y !== undefined || rawAtom.z !== undefined) {
          pos = [Number(rawAtom.x) || 0, Number(rawAtom.y) || 0, Number(rawAtom.z) || 0];
        }
        if (rawAtom.radius) radius = Number(rawAtom.radius);
        if (rawAtom.color) color = rawAtom.color;
      }
      elem = elem.charAt(0).toUpperCase() + elem.slice(1).toLowerCase();
      const cpk = CPK_ELEMENTS[elem] ?? CPK_ELEMENTS[elem.toUpperCase()] ?? { color: "#808080", radius: 0.5 };
      radius ??= cpk.radius;
      color = cleanColor(color ?? cpk.color);
      atomPositions.push(pos);
      objects.push({
        kind: "sphere",
        position: pos.map(v => Math.round(v * 1000) / 1000),
        radius: Math.round(radius * 1000) / 1000,
        color
      });
    }

    if (Array.isArray(bonds)) {
      for (const rawBond of bonds) {
        let fromIdx = null, toIdx = null;
        let fromPos = null, toPos = null;
        let order = 1;
        let bondRadius = 0.12;
        let bondColor = "#94a3b8";
        if (Array.isArray(rawBond)) {
          if (typeof rawBond[0] === "number" && typeof rawBond[1] === "number") {
            fromIdx = rawBond[0];
            toIdx = rawBond[1];
          } else if (Array.isArray(rawBond[0]) && Array.isArray(rawBond[1])) {
            fromPos = rawBond[0];
            toPos = rawBond[1];
          }
          if (typeof rawBond[2] === "number") order = rawBond[2];
        } else if (rawBond && typeof rawBond === "object") {
          if (typeof rawBond.from === "number" && typeof rawBond.to === "number") {
            fromIdx = rawBond.from;
            toIdx = rawBond.to;
          } else if (Array.isArray(rawBond.from) && Array.isArray(rawBond.to)) {
            fromPos = rawBond.from;
            toPos = rawBond.to;
          }
          if (rawBond.order) order = Number(rawBond.order) || 1;
          if (rawBond.radius) bondRadius = Number(rawBond.radius);
          if (rawBond.color) bondColor = rawBond.color;
        }
        if (fromIdx !== null && toIdx !== null && atomPositions[fromIdx] && atomPositions[toIdx]) {
          fromPos = atomPositions[fromIdx];
          toPos = atomPositions[toIdx];
        }
        if (fromPos && toPos) {
          if (order >= 3) bondRadius = 0.18;
          else if (order >= 2) bondRadius = 0.15;
          const cyl = createCylinderFromPoints(fromPos, toPos, bondRadius, cleanColor(bondColor));
          if (cyl) objects.push(cyl);
        }
      }
    }
    return objects;
  }

  function safeParse(text) {
    return JSON.parse(text, (key, value) => {
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        throw new Error(`Unsafe JSON key: ${key}`);
      }
      return value;
    });
  }

  function stripWrappers(text) {
    let value = String(text ?? "").replace(/^\uFEFF/, "").trim();
    value = value.replace(/^```[\w-]*\s*/i, "").replace(/\s*```\s*$/, "").trim();
    value = value.replace(/^(?:json|javascript|studentviz)\s*\n/i, "").trim();
    return value;
  }

  function findBalancedObjects(text) {
    const source = String(text ?? "");
    const objects = [];
    let start = -1;
    let depth = 0;
    let quote = null;
    let escaped = false;

    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      if (quote) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        continue;
      }
      if (ch === "{") {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === "}" && depth > 0) {
        depth--;
        if (depth === 0 && start >= 0) {
          objects.push(source.slice(start, i + 1));
          start = -1;
        }
      }
    }

    // A common model truncation is a missing final brace/bracket. Only close
    // delimiters when the candidate starts like a StudentViz object.
    if (depth > 0 && start >= 0) {
      const partial = source.slice(start).trim();
      if (/^\{[\s\S]{0,400000}(?:"\$schema"|\bschema\b|\btype\b|\bseries\b|\bpoints\b|\bobjects\b)/i.test(partial)) {
        let close = "";
        const stack = [];
        let q = null;
        let esc = false;
        for (const ch of partial) {
          if (q) {
            if (esc) esc = false;
            else if (ch === "\\") esc = true;
            else if (ch === q) q = null;
            continue;
          }
          if (ch === '"' || ch === "'") q = ch;
          else if (ch === "{") stack.push("}");
          else if (ch === "[") stack.push("]");
          else if ((ch === "}" || ch === "]") && stack.at(-1) === ch) stack.pop();
        }
        if (q === null && stack.length <= 8) {
          close = stack.reverse().join("");
          objects.push(partial + close);
        }
      }
    }
    return objects;
  }


  function insertMissingObjectPropertyCommas(source) {
    let out = "";
    const stack = [];
    const isNextProperty = start => {
      let index = start;
      while (/\s/.test(source[index] || "")) index++;
      if (source[index] !== '"') return false;
      index++;
      let escaped = false;
      for (; index < source.length; index++) {
        const ch = source[index];
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') break;
      }
      if (index >= source.length) return false;
      index++;
      while (/\s/.test(source[index] || "")) index++;
      return source[index] === ":";
    };
    const addIfMissing = index => {
      if (stack.at(-1) === "}" && isNextProperty(index)) out += ",";
    };

    for (let index = 0; index < source.length;) {
      const ch = source[index];
      if (ch === '"') {
        const start = index++;
        let escaped = false;
        for (; index < source.length; index++) {
          const current = source[index];
          if (escaped) escaped = false;
          else if (current === "\\") escaped = true;
          else if (current === '"') { index++; break; }
        }
        out += source.slice(start, index);
        let look = index;
        while (/\s/.test(source[look] || "")) look++;
        // A string followed by ':' is an object key, not a completed value.
        if (source[look] !== ":") addIfMissing(index);
        continue;
      }
      if (ch === "{" || ch === "[") {
        stack.push(ch === "{" ? "}" : "]");
        out += ch;
        index++;
        continue;
      }
      if (ch === "}" || ch === "]") {
        if (stack.at(-1) === ch) stack.pop();
        out += ch;
        index++;
        addIfMissing(index);
        continue;
      }
      if (/[tfn0-9-]/.test(ch)) {
        const match = /^(?:true|false|null|-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/.exec(source.slice(index));
        if (match) {
          out += match[0];
          index += match[0].length;
          addIfMissing(index);
          continue;
        }
      }
      out += ch;
      index++;
    }
    return out;
  }

  function normalizeLooseJson(text) {
    let source = String(text ?? "")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[：]/g, ":");
    let out = "";
    let quote = null;
    let escaped = false;

    // Strip comments and convert single-quoted strings without touching text
    // inside ordinary JSON strings.
    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      const next = source[i + 1];
      if (quote === '"') {
        out += ch;
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') quote = null;
        continue;
      }
      if (quote === "'") {
        if (escaped) {
          if (ch === "'") out += "'";
          else if (ch === '"') out += '\\"';
          else out += "\\" + ch;
          escaped = false;
        } else if (ch === "\\") escaped = true;
        else if (ch === "'") {
          out += '"';
          quote = null;
        } else if (ch === '"') out += '\\"';
        else if (ch === "\n") out += "\\n";
        else if (ch === "\r") out += "\\r";
        else out += ch;
        continue;
      }
      if (ch === '"') {
        quote = '"';
        out += ch;
      } else if (ch === "'") {
        quote = "'";
        out += '"';
      } else if (ch === "/" && next === "/") {
        while (i < source.length && source[i] !== "\n") i++;
        out += "\n";
      } else if (ch === "/" && next === "*") {
        i += 2;
        while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i++;
        i++;
      } else {
        out += ch;
      }
    }

    // JSON5-style bare keys and trailing commas, without rewriting strings.
    let structural = "";
    quote = null;
    escaped = false;
    for (let i = 0; i < out.length; i++) {
      const ch = out[i];
      if (quote) {
        structural += ch;
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') quote = null;
        continue;
      }
      if (ch === '"') {
        quote = ch;
        structural += ch;
        continue;
      }
      if (ch === ",") {
        let look = i + 1;
        while (/\s/.test(out[look] || "")) look++;
        if (out[look] === "}" || out[look] === "]") continue;
      }
      structural += ch;
      if (ch === "{" || ch === ",") {
        let look = i + 1;
        while (/\s/.test(out[look] || "")) look++;
        const key = /^[A-Za-z_$][A-Za-z0-9_$-]*(?=\s*:)/.exec(out.slice(look));
        if (key) {
          structural += out.slice(i + 1, look) + `"${key[0]}"`;
          i = look + key[0].length - 1;
        }
      }
    }
    out = structural;

    // Python/JS literal spellings, outside quoted strings only.
    let fixed = "";
    quote = null;
    escaped = false;
    for (let i = 0; i < out.length; i++) {
      const ch = out[i];
      if (quote) {
        fixed += ch;
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"') {
        quote = ch;
        fixed += ch;
        continue;
      }
      const rest = out.slice(i);
      const match = /^(True|False|None|undefined|NaN|Infinity)\b/.exec(rest);
      if (match) {
        const replacement = match[1] === "True" ? "true" :
          match[1] === "False" ? "false" :
          match[1] === "None" || match[1] === "undefined" ? "null" : "null";
        fixed += replacement;
        i += match[1].length - 1;
      } else fixed += ch;
    }
    // Some models omit the comma between two adjacent object properties.
    // Insert one only when a complete value is immediately followed by a
    // quoted property name and colon at object depth.
    return insertMissingObjectPropertyCommas(fixed);
  }

  function parseCandidate(raw) {
    const candidates = [stripWrappers(raw)];
    const loose = normalizeLooseJson(candidates[0]);
    if (loose !== candidates[0]) candidates.push(loose);
    let lastError;
    for (const candidate of candidates) {
      try {
        const value = safeParse(candidate);
        if (Array.isArray(value) && value.length === 1 && value[0] && typeof value[0] === "object") {
          return { value: value[0], syntaxFixes: ["unwrapped a one-item JSON array"] };
        }
        return { value, syntaxFixes: candidate === candidates[0] ? [] : ["repaired JSON formatting"] };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("Could not parse the JSON block.");
  }

  function scoreObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
    const keys = Object.keys(value);
    let score = 0;
    for (const key of keys) if (VISUAL_KEYS.has(key)) score += key === "$schema" ? 8 : 2;
    const schema = String(value.$schema ?? value.schema ?? "").toLowerCase();
    if (schema.includes("studentviz")) score += 10;
    const type = String(value.type ?? "").toLowerCase();
    if (["plot", "graph", "chart", "geometry", "geometry2d", "2d", "2d-geometry", "diagram", "scene3d", "3d", "3d-scene", "chemical", "chemistry", "molecule"].includes(type) || OBJECT_KINDS.has(type)) score += 5;
    if (Array.isArray(value.series) || (value.series && typeof value.series === "object") || Array.isArray(value.points) || Array.isArray(value.objects) || (value.objects && typeof value.objects === "object") || Array.isArray(value.datasets) || Array.isArray(value.data) || Array.isArray(value.atoms) || Array.isArray(value.bonds)) score += 5;
    if (value.formula || value.molecule || value.chemical || Array.isArray(value.atoms)) score += 6;
    if (value.series && !Array.isArray(value.series) && typeof value.series === "object" && (value.series.expression || value.series.formula || value.series.kind || value.series.type)) score += 6;
    if (value.objects && !Array.isArray(value.objects) && typeof value.objects === "object" && OBJECT_KINDS.has(String(value.objects.kind ?? value.objects.type ?? "").toLowerCase())) score += 3;
    if (value.data && !Array.isArray(value.data) && Array.isArray(value.data.x) && Array.isArray(value.data.y)) score += 3;
    if (Array.isArray(value.points) && value.points.some(point => Array.isArray(point) || (point && typeof point === "object" && ("x" in point || "position" in point)))) score += 3;
    if (Array.isArray(value.objects) && value.objects.some(object => object && OBJECT_KINDS.has(String(object.kind ?? object.type ?? "").toLowerCase()))) score += 3;
    if (Array.isArray(value.vertices) && value.vertices.length && value.vertices[0]?.length >= 2) score += Array.isArray(value.faces) ? (value.vertices[0].length >= 3 ? 8 : 5) : 3;
    if (OBJECT_KINDS.has(type) && ["expression", "radius", "size", "vertices", "profile", "shape"].some(key => key in value)) score += 4;
    if (SERIES_KINDS.has(String(value.kind ?? "").toLowerCase()) || OBJECT_KINDS.has(String(value.kind ?? "").toLowerCase())) score += 6;
    if ((type === "plot" || type === "graph" || type === "chart") && typeof value.expression === "string") score += 3;
    if (Array.isArray(value.vertices) && value.vertices[0]?.length === 2) score += 3;
    if (Array.isArray(value.series) && value.series.some(series => series && typeof series === "object" && (typeof series.expression === "string" || SERIES_KINDS.has(String(series.kind ?? series.type ?? "").toLowerCase()) || (Array.isArray(series.x) && Array.isArray(series.y))))) score += 3;
    return score;
  }

  function extractBlocks(text) {
    const source = String(text ?? "");
    // Assistant messages can contain several paragraphs of prose around a
    // compact visual. Scan the whole message, but keep each JSON candidate
    // within the protocol's 400 KB safety limit.
    if (!source.trim() || source.length > MAX_LENGTH * 5) return [];
    const candidates = findBalancedObjects(source);
    const unique = [...new Set(candidates)].filter(candidate => candidate.length <= MAX_LENGTH);
    return unique.filter(candidate => {
      try {
        return scoreObject(parseCandidate(candidate).value) >= 8;
      } catch {
        // A malformed candidate is still detected when it carries a clear
        // StudentViz marker, so the user gets a repair attempt/error card.
        return /studentviz\/v1|\b(series|points|objects|rightAngles|polygons|segments)\b/i.test(candidate);
      }
    });
  }

  function fixExpression(value, parameterNames = new Set()) {
    if (typeof value !== "string") return value;
    let s = value.trim();
    s = s.replace(/Math\s*\.\s*/g, "")
      .replace(/\b(sine|sinn)\b/gi, "sin")
      .replace(/\bcosine\b/gi, "cos")
      .replace(/\btangent\b/gi, "tan")
      .replace(/\barcsin\b/gi, "asin")
      .replace(/\barccos\b/gi, "acos")
      .replace(/\barctan\b/gi, "atan")
      .replace(/√/g, "sqrt")
      .replace(/\bPI\b/g, "pi")
      .replace(/\bE\b/g, "e")
      .replace(/π/g, "pi")
      .replace(/[−–—]/g, "-")
      .replace(/[×·⋅]/g, "*")
      .replace(/÷/g, "/")
      .replace(/\\cdot\b/g, "*")
      .replace(/\\times\b/g, "*")
      .replace(/\\pi\b/g, "pi")
      .replace(/\\sqrt\s*\{/g, "sqrt(")
      .replace(/\}/g, ")");
    // Some models split the Greek constant π into the two tokens `p*i`.
    // StudentViz's parser correctly treats p and i as variable names, so that
    // spelling fails unless both are declared sliders. Normalize it to the
    // built-in `pi` constant when the spec does not intentionally declare
    // both variables. Apply this before generic implicit-multiplication rules.
    s = s.replace(/\b([pP])\s*(?:\*\s*|\s+)([iI])\b/g, (match, pName, iName) => {
      return parameterNames.has(pName) && parameterNames.has(iName) ? match : "pi";
    });
    // A frequent model typo is to place the coordinate immediately after pi
    // (`pix^3`, `pir^2`, or `πx^3`). The expression parser intentionally does
    // not support implicit multiplication, so split only known coordinate
    // tokens. Respect an explicitly declared slider with the same name.
    s = s.replace(/\bpi([xyzrtuv])(?=\s*(?:\^|[²³⁴]|[*/+\-),]|$))/gi, (match, variable) => {
      return parameterNames.has(match) ? match : `pi*${variable}`;
    });
    s = s.replace(/([A-Za-z_)\d])([²³⁴])/g, (_, left, power) => `${left}^${power === "²" ? 2 : power === "³" ? 3 : 4}`);
    s = s.replace(/\b(sin|cos|tan|asin|acos|atan|sqrt|abs|log|ln|exp)\s+((?:\d+(?:\.\d+)?|\.\d+)?[A-Za-z_]\w*|(?:\d+(?:\.\d+)?|\.\d+))\b/g, "$1($2)");
    // Insert multiplication in unambiguous implicit-product cases such as
    // 2x, 3sin(x), (x+1)(x-1), pi x, and x(x+1). Preserve function calls.
    // Numeric coefficients may touch a variable/function, but the digit in
    // an identifier (for example the `2` in atan2) must never be split off.
    // Convert word boolean operators (and, or, not) to symbols before identifier multiplication
    s = s.replace(/\band\b/gi, "&&").replace(/\bor\b/gi, "||").replace(/\bnot\b/gi, "!");
    const functions = new Set(["sin", "cos", "tan", "asin", "acos", "atan", "atan2", "sqrt", "abs", "exp", "log", "ln", "log10", "floor", "ceil", "min", "max", "pow", "sinh", "cosh", "tanh", "sign", "round", "mod", "clamp", "if"]);
    // Only insert multiplication between separate identifiers when whitespace
    // proves they are separate tokens (for example `pi x`). Do not split a
    // single identifier such as `pi`, `theta`, or a named slider into letters.
    s = s.replace(/([A-Za-z_]\w*)\s+(?=[A-Za-z_]\w*)/g, "$1*");
    // Insert multiplication after closing parenthesis before identifiers or numbers: (4/3)pi, (x+1)x, (x+1)2
    s = s.replace(/\)\s*(?=[A-Za-z_0-9])/g, ")*");
    // Support x(x+1) and (x+1)(x-1), while preserving function calls like sin(x).
    s = s.replace(/([A-Za-z_]\w*|\))\s*(?=\()/g, (match, left) => {
      if (functions.has(left.toLowerCase())) return match;
      return `${left}*`;
    });
    return s;
  }

  function normalizeType(value) {
    const type = String(value ?? "").trim().toLowerCase().replace(/[ _]+/g, "-");
    if (["plot", "graph", "chart", "2d-plot", "plot2d", "function-plot", "function"].includes(type)) return "plot";
    if (["geometry", "geometry2d", "2d-geometry", "diagram", "2d", "plane-geometry"].includes(type)) return "geometry";
    if (["scene3d", "3d", "3d-scene", "scene-3d", "model3d", "3d-model", "model"].includes(type)) return "scene3d";
    if (["chemical", "chemistry", "molecule", "compound", "reaction"].includes(type)) return "chemical";
    if (["python", "py", "pyodide", "python3", "studentviz-python", "pyviz"].includes(type)) return "python";
    return value;
  }

  function cleanColor(value) {
    if (typeof value !== "string") return value;
    const color = value.trim().toLowerCase();
    if (COLOR_NAMES[color]) return COLOR_NAMES[color];
    if (/^#[0-9a-f]{3}$/i.test(color)) return "#" + [...color.slice(1)].map(ch => ch + ch).join("");
    return value;
  }

  function normalizeParameters(spec, fixes) {
    if (spec.parameters === undefined) {
      spec.parameters = [];
      return;
    }
    if (!Array.isArray(spec.parameters)) {
      spec.parameters = [];
      fixes.push("removed an invalid sliders list");
      return;
    }
    if (spec.parameters.length > 8) {
      spec.parameters = spec.parameters.slice(0, 8);
      fixes.push("kept the first 8 sliders");
    }
    const used = new Set();
    spec.parameters = spec.parameters.filter((parameter, index) => {
      if (!parameter || typeof parameter !== "object" || Array.isArray(parameter)) return false;
      if (typeof parameter.name !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,19}$/.test(parameter.name)) {
        const label = String(parameter.name ?? parameter.label ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12);
        parameter.name = /^[a-z]/.test(label) ? label : `p${index + 1}`;
        fixes.push(`assigned a valid slider name (${parameter.name})`);
      }
      if (used.has(parameter.name)) {
        fixes.push(`removed duplicate slider ${parameter.name}`);
        return false;
      }
      used.add(parameter.name);
      for (const key of ["min", "max", "value", "step"]) if (typeof parameter[key] === "string" && parameter[key].trim() !== "" && Number.isFinite(Number(parameter[key]))) parameter[key] = Number(parameter[key]);
      if (!Number.isFinite(parameter.min)) parameter.min = 0;
      if (!Number.isFinite(parameter.max)) parameter.max = Math.max(1, Number.isFinite(parameter.value) ? parameter.value : 1);
      if (parameter.min >= parameter.max) {
        parameter.min = Math.min(0, parameter.value ?? 0);
        parameter.max = Math.max(1, parameter.value ?? 1);
        if (parameter.min >= parameter.max) parameter.max = parameter.min + 1;
        fixes.push(`corrected the range for slider ${parameter.name}`);
      }
      if (!Number.isFinite(parameter.value)) parameter.value = (parameter.min + parameter.max) / 2;
      if (parameter.value < parameter.min || parameter.value > parameter.max) {
        parameter.value = Math.max(parameter.min, Math.min(parameter.max, parameter.value));
        fixes.push(`kept slider ${parameter.name} inside its declared range`);
      }
      if (parameter.max - parameter.min > 1e9) {
        parameter.max = parameter.min + 1e9;
        parameter.value = Math.min(parameter.max, parameter.value);
        fixes.push(`reduced the range of slider ${parameter.name}`);
      }
      if (parameter.step !== undefined && (!Number.isFinite(parameter.step) || parameter.step <= 0)) {
        delete parameter.step;
        fixes.push(`removed an invalid step from slider ${parameter.name}`);
      }
      return true;
    });
  }

  function normalizeSpec(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("The visual must be a JSON object.");
    }
    // JSON round-trip also ensures we only work with plain JSON data.
    const spec = safeParse(JSON.stringify(input));
    const fixes = [];

    if (typeof spec.title === "string" && spec.title.length > 160) {
      spec.title = spec.title.slice(0, 160);
      fixes.push("shortened the title to the supported length");
    }
    if (typeof spec.description === "string" && spec.description.length > 1000) {
      spec.description = spec.description.slice(0, 1000);
      fixes.push("shortened the description to the supported length");
    }

    if (!spec.$schema && typeof spec.schema === "string" && /studentviz/i.test(spec.schema)) {
      spec.$schema = spec.schema;
      delete spec.schema;
      fixes.push("renamed schema to $schema");
    }
    if (spec.$schema !== "studentviz/v1") {
      if (!spec.$schema || /studentviz/i.test(String(spec.$schema))) {
        spec.$schema = "studentviz/v1";
        fixes.push("added the StudentViz v1 schema marker");
      }
    }

    const originalType = spec.type;
    spec.type = normalizeType(spec.type ?? spec.kind);
    if (spec.type !== originalType && spec.type !== undefined) fixes.push(`normalized visual type to ${spec.type}`);

    // Handle python visual specifications
    if (spec.type === "python") {
      if (typeof spec.code !== "string" && typeof spec.script === "string") {
        spec.code = spec.script;
        delete spec.script;
        fixes.push("renamed script to code");
      }
      if (typeof spec.code !== "string") {
        spec.code = "";
      }
      return { spec, fixes: [...new Set(fixes)] };
    }

    // Handle chemical and molecular structures
    if (spec.type === "chemical" || spec.formula || (Array.isArray(spec.atoms) && !spec.type)) {
      if (spec.format === "2d" || spec.dimension === "2d" || (Array.isArray(spec.atoms) && spec.atoms.length && spec.atoms.every(a => Array.isArray(a.position) && a.position.length === 2))) {
        spec.type = "geometry";
        spec.points = (spec.atoms || []).map((a, idx) => {
          const id = a.id || a.label || `${a.element || "A"}${idx + 1}`;
          const pos = Array.isArray(a.position) ? a.position : [a.x ?? 0, a.y ?? 0];
          return { id, x: pos[0], y: pos[1], label: a.element || a.label || id };
        });
        spec.segments = (spec.bonds || []).map(b => {
          if (Array.isArray(b)) {
            const from = typeof b[0] === "number" ? spec.points[b[0]]?.id : b[0];
            const to = typeof b[1] === "number" ? spec.points[b[1]]?.id : b[1];
            return { from, to };
          }
          return {
            from: typeof b.from === "number" ? spec.points[b.from]?.id : b.from,
            to: typeof b.to === "number" ? spec.points[b.to]?.id : b.to
          };
        }).filter(s => s.from && s.to);
        delete spec.atoms;
        delete spec.bonds;
        delete spec.formula;
        delete spec.chemical;
        delete spec.molecule;
        delete spec.format;
        delete spec.dimension;
        fixes.push("converted 2D chemical structure to geometry points and bonds");
      } else {
        spec.type = "scene3d";
        const molObjects = expandMolecule(spec, fixes);
        if (molObjects.length) {
          spec.objects = molObjects;
          delete spec.atoms;
          delete spec.bonds;
          delete spec.formula;
          delete spec.chemical;
          delete spec.molecule;
          fixes.push("expanded chemical structure into 3D molecular ball-and-stick scene");
        }
      }
    }

    // Infer a type only from unambiguous StudentViz structures.
    if (!spec.type || !["plot", "geometry", "scene3d"].includes(spec.type)) {
      if (spec.type && OBJECT_KINDS.has(String(spec.type).toLowerCase())) {
        spec.kind = spec.type;
        spec.type = "scene3d";
        fixes.push("recognized a top-level 3D primitive");
      } else if (Array.isArray(spec.objects) || (spec.objects && typeof spec.objects === "object") || (spec.kind && OBJECT_KINDS.has(String(spec.kind).toLowerCase()))) spec.type = "scene3d";
      else if (Array.isArray(spec.vertices) && Array.isArray(spec.faces) && spec.vertices[0]?.length >= 3) spec.type = "scene3d";
      else if (Array.isArray(spec.series) || (spec.series && typeof spec.series === "object") || Array.isArray(spec.datasets) || Array.isArray(spec.data) || (spec.data && Array.isArray(spec.data.x) && Array.isArray(spec.data.y))) spec.type = "plot";
      else if (Array.isArray(spec.points) || Array.isArray(spec.vertices)) spec.type = "geometry";
      if (spec.type) fixes.push(`inferred visual type as ${spec.type}`);
    }

    if (spec.type === "plot") {
      if (!Array.isArray(spec.series) && (typeof spec.fn === "string" || typeof spec.formula === "string" || typeof spec.y === "string")) {
        spec.series = [{ kind: "function", expression: spec.fn ?? spec.formula ?? spec.y, range: spec.range ?? spec.xRange ?? [-6, 6] }];
        delete spec.fn;
        delete spec.formula;
        delete spec.y;
        fixes.push("wrapped function shorthand as a plot series");
      }
      if (!Array.isArray(spec.series) && Array.isArray(spec.data) && spec.data.length && spec.data.every(p => Array.isArray(p) && p.length >= 2)) {
        spec.series = [{
          kind: "line",
          x: spec.data.map(p => p[0]),
          y: spec.data.map(p => p[1])
        }];
        delete spec.data;
        fixes.push("converted coordinate pairs to plot series");
      }
      if (!Array.isArray(spec.series) && spec.data && typeof spec.data === "object" && !Array.isArray(spec.data) && !spec.data.x && !spec.data.y) {
        spec.series = [{
          kind: "bar",
          x: Object.keys(spec.data),
          y: Object.values(spec.data).map(Number)
        }];
        delete spec.data;
        fixes.push("converted key-value map to a bar chart");
      }
      if (!Array.isArray(spec.series) && (Array.isArray(spec.datasets) || Array.isArray(spec.plots))) {
        spec.series = spec.datasets ?? spec.plots;
        delete spec.datasets;
        delete spec.plots;
        fixes.push("renamed chart data to series");
      }
      if (spec.series && !Array.isArray(spec.series) && typeof spec.series === "object") {
        spec.series = [spec.series];
        fixes.push("wrapped the single plot series in an array");
      }
      if (!Array.isArray(spec.series) && spec.data && typeof spec.data === "object") {
        if (Array.isArray(spec.data)) spec.series = spec.data;
        else if (Array.isArray(spec.data.x) && Array.isArray(spec.data.y)) spec.series = [{ kind: "line", ...spec.data }];
        if (spec.series) {
          delete spec.data;
          fixes.push("converted data to plot series");
        }
      }
      if (!Array.isArray(spec.series) && typeof spec.expression === "string") {
        spec.series = [{ kind: "function", expression: spec.expression, range: spec.range ?? spec.xRange ?? [-6, 6] }];
        fixes.push("wrapped the top-level expression as a plot series");
      }
      if (Array.isArray(spec.series)) {
        if (spec.series.length > 20) {
          spec.series = spec.series.slice(0, 20);
          fixes.push("kept the first 20 plot series");
        }
        spec.series = spec.series.map(series => {
          if (!series || typeof series !== "object" || Array.isArray(series)) return series;
          const aliases = {
            functionplot: "function", "function-plot": "function", linechart: "line",
            "line-chart": "line", scatterplot: "scatter", "scatter-plot": "scatter",
            barchart: "bar", "bar-chart": "bar", histogram: "histogram", hist: "histogram",
            boxplot: "box", violinplot: "violin", "heat-map": "heatmap", "parametric-curve": "parametric"
          };
          const kind = String(series.kind ?? series.type ?? "").toLowerCase().replace(/[ _]+/g, "-");
          if (series.kind === undefined && series.type !== undefined) {
            series.kind = series.type;
            delete series.type;
          }
          if (series.expression === undefined) {
            if (typeof series.formula === "string") {
              series.expression = series.formula;
              delete series.formula;
              fixes.push("renamed plot formula to expression");
            } else if (typeof series.fn === "string") {
              series.expression = series.fn;
              delete series.fn;
              fixes.push("renamed plot fn to expression");
            } else if (typeof series.y === "string" && ["function", "functionplot", "function-plot"].includes(kind)) {
              series.expression = series.y;
              delete series.y;
              fixes.push("used the function series y formula as expression");
            }
          }
          if (aliases[kind]) {
            series.kind = aliases[kind];
            fixes.push(`normalized plot series type to ${series.kind}`);
          } else if (kind && series.kind !== kind) {
            series.kind = kind;
            fixes.push(`normalized plot series type casing to ${series.kind}`);
          }
          if (!series.kind) {
            if (typeof series.expression === "string") series.kind = "function";
            else if (Array.isArray(series.x) && Array.isArray(series.y)) series.kind = "line";
            else if (Array.isArray(series.z)) series.kind = "heatmap";
            else if (Array.isArray(series.labels) && Array.isArray(series.values)) series.kind = "pie";
            else if (Array.isArray(series.y)) series.kind = "histogram";
            if (series.kind) fixes.push(`inferred plot series type as ${series.kind}`);
          }
          return series;
        });
        const beforeFiltering = spec.series.length;
        spec.series = spec.series.filter(series => series && typeof series === "object" && !Array.isArray(series));
        if (spec.series.length !== beforeFiltering) fixes.push("removed empty or non-object plot series");
        const numericArray = values => Array.isArray(values) ? values.map(value => typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN) : null;
        spec.series = spec.series.filter((series, index) => {
          for (const key of ["width", "opacity", "markerSize", "samples", "bins", "lineWidth"]) {
            if (typeof series[key] === "string" && series[key].trim() !== "" && Number.isFinite(Number(series[key]))) {
              series[key] = Number(series[key]);
              fixes.push(`converted series[${index}].${key} to a number`);
            }
          }
          if (Number.isFinite(series.width)) series.width = Math.max(0.5, Math.min(12, series.width));
          if (Number.isFinite(series.opacity)) series.opacity = Math.max(0, Math.min(1, series.opacity));
          if (Number.isFinite(series.markerSize)) series.markerSize = Math.max(2, Math.min(24, series.markerSize));
          if (Number.isFinite(series.samples)) series.samples = Math.max(2, Math.min(10000, Math.round(series.samples)));
          if (Number.isFinite(series.bins)) series.bins = Math.max(1, Math.min(500, Math.round(series.bins)));

          if (["line", "scatter", "bar", "area"].includes(series.kind)) {
            const xs = numericArray(series.x), ys = numericArray(series.y);
            if (!xs || !ys || !xs.length || !ys.length) { fixes.push(`removed plot series ${index} with missing x/y arrays`); return false; }
            const count = Math.min(xs.length, ys.length);
            if (xs.length !== ys.length) fixes.push(`matched x/y lengths in plot series ${index}`);
            const pairs = Array.from({ length: count }, (_, i) => [xs[i], ys[i]]).filter(pair => pair.every(Number.isFinite));
            if (!pairs.length) { fixes.push(`removed plot series ${index} with no finite data points`); return false; }
            series.x = pairs.map(pair => pair[0]); series.y = pairs.map(pair => pair[1]);
          } else if (["histogram", "box", "violin"].includes(series.kind)) {
            const values = numericArray(series.y ?? series.values);
            if (!values || !values.some(Number.isFinite)) { fixes.push(`removed plot series ${index} with no numeric values`); return false; }
            series.y = values.filter(Number.isFinite); delete series.values;
          } else if (series.kind === "pie") {
            const values = numericArray(series.values ?? series.y);
            if (!Array.isArray(series.labels) || !values) { fixes.push(`removed plot series ${index} with invalid pie labels or values`); return false; }
            const count = Math.min(series.labels.length, values.length);
            const pairs = Array.from({ length: count }, (_, i) => [series.labels[i], values[i]]).filter(pair => typeof pair[0] === "string" && pair[0].trim() && Number.isFinite(pair[1]) && pair[1] >= 0);
            if (!pairs.length) { fixes.push(`removed plot series ${index} with no valid pie slices`); return false; }
            series.labels = pairs.map(pair => pair[0]); series.values = pairs.map(pair => pair[1]); delete series.y;
            if (series.labels.length !== values.length) fixes.push(`matched pie labels and values in plot series ${index}`);
          } else if (["heatmap", "contour"].includes(series.kind)) {
            const xs = numericArray(series.x), ys = numericArray(series.y);
            if (!xs?.length || !ys?.length || !Array.isArray(series.z)) { fixes.push(`removed plot series ${index} with an invalid grid`); return false; }
            const rows = series.z.slice(0, ys.length).map(row => numericArray(row)?.slice(0, xs.length) ?? []);
            const cols = Math.min(xs.length, ...rows.map(row => row.length));
            const rowCount = Math.min(ys.length, rows.length);
            const z = rows.slice(0, rowCount).map(row => row.slice(0, cols));
            if (!cols || !rowCount || z.some(row => row.length !== cols || !row.every(Number.isFinite))) { fixes.push(`removed plot series ${index} with inconsistent grid dimensions`); return false; }
            if (xs.length !== cols || ys.length !== rowCount) fixes.push(`trimmed mismatched grid dimensions in plot series ${index}`);
            series.x = xs.slice(0, cols); series.y = ys.slice(0, rowCount); series.z = z;
          } else if (!["function", "parametric"].includes(series.kind)) {
            fixes.push(`removed unsupported plot series ${index}`); return false;
          }
          return true;
        });
        const hasPie = spec.series.some(s => s.kind === "pie");
        const hasOther = spec.series.some(s => s.kind !== "pie");
        if (hasPie && hasOther) {
          spec.series = spec.series.filter(s => s.kind !== "pie");
          fixes.push("separated mixed pie and Cartesian series");
        }
      }
    }

    if (spec.type === "geometry") {
      if (spec.points && !Array.isArray(spec.points) && typeof spec.points === "object") {
        spec.points = Object.entries(spec.points).map(([id, p]) => ({
          id,
          x: Array.isArray(p) ? p[0] : (p?.x ?? 0),
          y: Array.isArray(p) ? p[1] : (p?.y ?? 0),
          label: p?.label ?? p?.name ?? id
        }));
        fixes.push("converted point dictionary into geometry points array");
      }
      if (!Array.isArray(spec.segments) && Array.isArray(spec.lines)) {
        spec.segments = spec.lines;
        delete spec.lines;
        fixes.push("renamed lines to segments");
      }
      if (!Array.isArray(spec.points) && Array.isArray(spec.vertices) && spec.vertices.every(point => Array.isArray(point) && point.length === 2)) {
        spec.points = spec.vertices.map((point, index) => ({ id: `P${index + 1}`, x: point[0], y: point[1] }));
        if (Array.isArray(spec.faces) && spec.faces.every(face => Array.isArray(face) && face.every(index => Number.isInteger(index) && index >= 0 && index < spec.points.length))) {
          spec.polygons ??= spec.faces.map(face => ({ points: face.map(index => `P${index + 1}`) }));
          fixes.push("converted indexed faces into geometry polygons");
        }
        delete spec.vertices;
        delete spec.faces;
        fixes.push("converted coordinate pairs into geometry points");
      }
      if (Array.isArray(spec.points)) {
        if (spec.points.length > 100) {
          spec.points = spec.points.slice(0, 100);
          fixes.push("kept the first 100 geometry points");
        }
        spec.points = spec.points.map((point, index) => {
          if (Array.isArray(point) && point.length >= 2) {
            fixes.push("converted coordinate arrays into named geometry points");
            return { id: `P${index + 1}`, x: point[0], y: point[1] };
          }
          if (point && typeof point === "object" && !Array.isArray(point)) {
            if (point.id === undefined) point.id = point.name ?? point.label ?? `P${index + 1}`;
            if (typeof point.id !== "string" || !point.id.trim()) point.id = `P${index + 1}`;
            if (point.id.length > 32) point.id = point.id.slice(0, 32);
            if ((point.x === undefined || point.y === undefined) && Array.isArray(point.position)) {
              point.x ??= point.position[0];
              point.y ??= point.position[1];
              fixes.push(`converted point ${point.id} position to x/y coordinates`);
            }
            if (point.x === undefined) point.x = 0;
            if (point.y === undefined) point.y = 0;
            for (const key of ["x", "y"]) if (typeof point[key] === "string" && point[key].trim() !== "" && Number.isFinite(Number(point[key]))) {
              point[key] = Number(point[key]);
              fixes.push(`converted point ${point.id} ${key} to a number`);
            }
          }
          return point && typeof point === "object" && !Array.isArray(point) ? point : null;
        }).filter(Boolean);
      }
      const pointIds = new Set();
      if (Array.isArray(spec.points)) for (let index = 0; index < spec.points.length; index++) {
        const point = spec.points[index];
        if (!point || typeof point !== "object" || Array.isArray(point)) continue;
        const originalId = point.id;
        let candidate = originalId;
        let suffix = 2;
        while (pointIds.has(candidate)) candidate = `${String(originalId).slice(0, 28)}_${suffix++}`;
        if (candidate !== originalId) {
          point.id = candidate;
          fixes.push("renamed duplicate geometry point IDs");
        }
        pointIds.add(point.id);
      }
      for (const key of ["polygons", "segments", "circles", "rightAngles"]) if (Array.isArray(spec[key]) && spec[key].length > 200) {
        spec[key] = spec[key].slice(0, 200);
        fixes.push(`kept the first 200 ${key} items`);
      }
      if (Array.isArray(spec.segments)) spec.segments = spec.segments.map(segment => {
        if (Array.isArray(segment) && segment.length >= 2) return { from: segment[0], to: segment[1] };
        if (segment && typeof segment === "object" && !Array.isArray(segment)) {
          if (segment.from === undefined && segment.start !== undefined) segment.from = segment.start;
          if (segment.to === undefined && segment.end !== undefined) segment.to = segment.end;
          delete segment.start;
          delete segment.end;
        }
        return segment;
      });
      if (Array.isArray(spec.polygons)) spec.polygons = spec.polygons.map(polygon => Array.isArray(polygon) ? { points: polygon } : polygon);
      const validPoint = id => typeof id === "string" && pointIds.has(id);
      if (Array.isArray(spec.segments)) {
        const before = spec.segments.length;
        spec.segments = spec.segments.filter(segment => segment && typeof segment === "object" && !Array.isArray(segment) && validPoint(segment.from) && validPoint(segment.to));
        if (spec.segments.length !== before) fixes.push("removed segments that referenced missing points");
      }
      if (Array.isArray(spec.polygons)) {
        const before = spec.polygons.length;
        spec.polygons = spec.polygons.filter(polygon => polygon && Array.isArray(polygon.points) && polygon.points.length >= 3 && polygon.points.every(validPoint));
        if (spec.polygons.length !== before) fixes.push("removed polygons with missing or invalid point references");
      }
      if (Array.isArray(spec.circles)) {
        const before = spec.circles.length;
        spec.circles = spec.circles.filter(circle => circle && typeof circle === "object" && !Array.isArray(circle) && validPoint(circle.center) && circle.radius !== undefined);
        if (spec.circles.length !== before) fixes.push("removed circles with missing centres or radii");
      }
      if (Array.isArray(spec.rightAngles)) {
        const before = spec.rightAngles.length;
        spec.rightAngles = spec.rightAngles.filter(angle => Array.isArray(angle) && angle.length === 3 && angle.every(validPoint));
        if (spec.rightAngles.length !== before) fixes.push("removed right-angle markers with missing point references");
      }
    }

    if (spec.type === "scene3d") {
      if (typeof spec.camera === "string" && spec.camera !== "auto") {
        const cam = spec.camera.toLowerCase();
        if (cam === "top") spec.camera = { azimuth: 0, elevation: 90 };
        else if (cam === "front") spec.camera = { azimuth: 0, elevation: 0 };
        else if (cam === "side") spec.camera = { azimuth: 90, elevation: 0 };
        else if (cam === "isometric" || cam === "iso") spec.camera = { azimuth: -45, elevation: 35 };
        else spec.camera = "auto";
        fixes.push(`normalized camera preset to ${cam}`);
      }
      if (!Array.isArray(spec.objects) || !spec.objects.length) {
        if (typeof spec.expression === "string" || typeof spec.z === "string" || typeof spec.fn === "string" || typeof spec.formula === "string") {
          const expr = spec.expression ?? spec.z ?? spec.fn ?? spec.formula;
          spec.objects = [{
            kind: "surface",
            expression: expr,
            xRange: spec.xRange ?? [-5, 5],
            yRange: spec.yRange ?? [-5, 5]
          }];
          delete spec.expression;
          delete spec.z;
          delete spec.fn;
          delete spec.formula;
          fixes.push("wrapped top-level 3D equation as a surface object");
        }
      }
      if (spec.objects && !Array.isArray(spec.objects) && typeof spec.objects === "object") {
        spec.objects = [spec.objects];
        fixes.push("wrapped the 3D object in objects[]");
      }
      if (Array.isArray(spec.objects)) {
        const expandedObjects = [];
        for (const obj of spec.objects) {
          if (obj && typeof obj === "object" && (obj.kind === "molecule" || obj.kind === "chemical" || obj.atoms || obj.formula)) {
            const molObjs = expandMolecule(obj, fixes);
            if (molObjs.length) {
              expandedObjects.push(...molObjs);
              fixes.push("expanded molecule object into 3D atoms and bonds");
              continue;
            }
          }
          expandedObjects.push(obj);
        }
        spec.objects = expandedObjects;
      }
      if (!Array.isArray(spec.objects) && Array.isArray(spec.vertices) && Array.isArray(spec.faces)) {
        spec.objects = [{ kind: "mesh", vertices: spec.vertices, faces: spec.faces }];
        delete spec.vertices;
        delete spec.faces;
        fixes.push("wrapped vertices and faces in a 3D mesh object");
      }
      if (!Array.isArray(spec.objects) && spec.kind && OBJECT_KINDS.has(String(spec.kind).toLowerCase())) {
        const object = { ...spec };
        delete object.$schema;
        delete object.type;
        delete object.title;
        delete object.description;
        delete object.parameters;
        delete object.colors;
        delete object.grid;
        delete object.camera;
        delete object.axes;
        delete object.controls;
        delete object.animate;
        delete object.kind;
        spec.objects = [{ kind: String(spec.kind).toLowerCase(), ...object }];
        fixes.push("wrapped the top-level 3D object in objects[]");
      }
      if (Array.isArray(spec.objects)) {
        if (spec.objects.length > 20) {
          spec.objects = spec.objects.slice(0, 20);
          fixes.push("kept the first 20 3D objects");
        }
        const before = spec.objects.length;
        spec.objects = spec.objects.map(object => {
          if (!object || typeof object !== "object" || Array.isArray(object)) return null;
          if (object.kind === undefined && object.type !== undefined) {
            object.kind = object.type;
            delete object.type;
            fixes.push("renamed a 3D object type to kind");
          }
          const aliases = {
            cube: "box", "rectangular-prism": "box", "triangular-mesh": "mesh",
            pointcloud: "points", pointclouds: "points",
            ball: "sphere", globe: "sphere", orb: "sphere", point3d: "sphere",
            pipe: "cylinder", rod: "cylinder", tube: "cylinder", connector: "cylinder", column: "cylinder",
            block: "box", cuboid: "box", slab: "box",
            pyramid: "cone", funnel: "cone", arrowhead: "cone",
            donut: "torus", ring: "torus", hoop: "torus"
          };
          const kind = String(object.kind ?? "").toLowerCase().replace(/[ _]+/g, "-");
          if (kind && object.kind !== kind) {
            object.kind = kind;
            fixes.push(`normalized 3D object type casing to ${kind}`);
          }
          if (aliases[kind]) {
            object.kind = aliases[kind];
            if (kind === "cube" && object.size === undefined) object.size = [1, 1, 1];
            fixes.push(`normalized 3D object type to ${object.kind}`);
          }
          if (object.kind === "atom") {
            const elem = String(object.element ?? object.symbol ?? object.name ?? "C");
            const cpk = CPK_ELEMENTS[elem] ?? CPK_ELEMENTS[elem.toUpperCase()] ?? { color: "#808080", radius: 0.5 };
            object.kind = "sphere";
            object.radius ??= cpk.radius;
            object.color = cleanColor(object.color ?? cpk.color);
            fixes.push(`styled atom ${elem} as a 3D sphere with CPK color`);
          }
          if (object.from !== undefined && object.to !== undefined) {
            const from = Array.isArray(object.from) ? object.from : [object.from.x ?? 0, object.from.y ?? 0, object.from.z ?? 0];
            const to = Array.isArray(object.to) ? object.to : [object.to.x ?? 0, object.to.y ?? 0, object.to.z ?? 0];
            const cyl = createCylinderFromPoints(from, to, object.radius ?? (object.kind === "bond" ? 0.12 : 0.1), cleanColor(object.color ?? "#94a3b8"));
            if (cyl) {
              Object.assign(object, cyl);
              delete object.from;
              delete object.to;
              fixes.push("converted endpoints into a 3D cylinder");
            }
          }
          if (object.kind === "bond") {
            object.kind = "cylinder";
            object.radius ??= 0.12;
            object.color = cleanColor(object.color ?? "#94a3b8");
            fixes.push("normalized bond to a 3D cylinder");
          }
          if (["plane", "plate", "sheet", "floor"].includes(object.kind)) {
            object.kind = "box";
            const w = object.width ?? object.size?.[0] ?? 6;
            const d = object.depth ?? object.length ?? object.size?.[1] ?? 6;
            object.size = [w, 0.04, d];
            fixes.push("converted plane to a thin 3D box");
          }
          if (object.position === undefined) {
            const pos = object.center ?? object.origin ?? object.loc ?? object.pos ?? object.at;
            if (Array.isArray(pos) && pos.length >= 3) {
              object.position = pos.slice(0, 3);
              fixes.push("normalized 3D object center/origin to position");
            } else if (object.x !== undefined && object.y !== undefined && object.z !== undefined) {
              object.position = [object.x, object.y, object.z];
              delete object.x;
              delete object.y;
              delete object.z;
              fixes.push("grouped x, y, z into position vector");
            }
          }
          if (object.kind === "box") {
            if (typeof object.size === "number" || typeof object.size === "string") {
              object.size = [object.size, object.size, object.size];
              fixes.push("expanded box scalar size to 3D dimensions");
            } else if (!Array.isArray(object.size) && ["width", "height", "depth"].every(key => Number.isFinite(object[key]))) {
              object.size = [object.width, object.height, object.depth];
              delete object.width;
              delete object.height;
              delete object.depth;
              fixes.push("converted box dimensions to a size vector");
            } else if (!Array.isArray(object.size)) {
              object.size = [1, 1, 1];
            }
          }
          if (["sphere", "cylinder", "cone", "torus"].includes(object.kind) && object.radius === undefined && object.r !== undefined) object.radius = object.r;
          if (["cylinder", "cone"].includes(object.kind) && object.height === undefined && object.h !== undefined) object.height = object.h;
          if (object.kind === "surface" && object.expression === undefined && typeof object.z === "string") {
            object.expression = object.z;
            delete object.z;
            fixes.push("used the surface z formula as expression");
          }
          if (object.kind === "mesh") {
            if (Array.isArray(object.vertices) && object.vertices.length > 20000) object.vertices = object.vertices.slice(0, 20000);
            if (Array.isArray(object.faces)) object.faces = object.faces.slice(0, 40000).map(face => Array.isArray(face) && face.length > 3 ? face.slice(0, 3) : face).filter(face => Array.isArray(face) && face.length === 3 && face.every(index => Number.isInteger(index) && index >= 0 && index < (object.vertices?.length ?? 0)));
          }
          if (["sphere", "cylinder", "cone", "torus"].includes(object.kind)) {
            for (const key of ["radius", "height", "tube"]) if (typeof object[key] === "number") object[key] = Math.abs(object[key]) || 0.1;
            if (object.kind === "torus" && Number.isFinite(object.radius) && Number.isFinite(object.tube) && object.tube >= object.radius) object.tube = object.radius * 0.3;
          }
          if (object.kind === "box" && Array.isArray(object.size)) object.size = object.size.map(value => typeof value === "number" ? Math.abs(value) || 0.1 : value);
          if (object.kind === "extrude" && typeof object.depth === "number") object.depth = Math.abs(object.depth) || 0.1;
          for (const key of ["opacity", "segments", "samples", "width"]) if (typeof object[key] === "string" && object[key].trim() !== "" && Number.isFinite(Number(object[key]))) {
            object[key] = Number(object[key]);
            fixes.push(`converted 3D object ${key} to a number`);
          }
          if (Number.isFinite(object.opacity)) object.opacity = Math.max(0, Math.min(1, object.opacity));
          if (Number.isFinite(object.segments)) object.segments = Math.max(3, Math.min(256, Math.round(object.segments)));
          if (Number.isFinite(object.samples)) object.samples = Math.max(2, Math.min(10000, Math.round(object.samples)));
          if (Array.isArray(object.resolution)) object.resolution = object.resolution.slice(0, 2).map(value => Math.max(2, Math.min(256, Math.round(Number(value) || 48))));
          if (object.kind === "mesh" && Array.isArray(object.vertices)) {
            object.vertices = object.vertices.map(vertex => Array.isArray(vertex) ? vertex.slice(0, 3).map(value => {
              if (typeof value === "string" && value.trim() !== "") {
                const num = Number(value);
                return Number.isFinite(num) ? num : value;
              }
              return value;
            }) : null);
            if (object.vertices.some(vertex => !vertex || vertex.length !== 3 || !vertex.every(v => Number.isFinite(v) || (typeof v === "string" && v.trim() !== "")))) return null;
          }
          return OBJECT_KINDS.has(String(object.kind ?? "").toLowerCase()) ? object : null;
        }).filter(Boolean);
        if (spec.objects.length !== before) fixes.push("removed invalid or unsupported 3D objects");
        // The viewer deliberately caps a 3D scene at 150,000 sampled vertices.
        // Allocate that budget before rendering so a valid but over-dense scene
        // degrades gracefully instead of failing as a whole.
        const surfaceDefault = spec.detail === "full" ? 96 : spec.detail === "minimal" ? 48 : 64;
        const sceneCost = object => {
          if (object.kind === "surface" || object.kind === "parametric") {
            const resolution = Array.isArray(object.resolution) ? object.resolution : [surfaceDefault, surfaceDefault];
            return resolution[0] * resolution[1];
          }
          if (object.kind === "curve") return (object.samples ?? 600) * (object.width === undefined ? 1 : 16);
          if (object.kind === "mesh" || object.kind === "points") return object.vertices?.length ?? 0;
          if (object.kind === "sphere") return 2145;
          if (object.kind === "box") return 24;
          if (object.kind === "cylinder" || object.kind === "cone") return 260;
          if (object.kind === "torus") return 4096;
          if (object.kind === "lathe") return (object.profile?.length ?? 0) * (object.segments ?? 64);
          if (object.kind === "extrude") return (object.shape?.length ?? 0) * 8 + 64;
          return 0;
        };
        let remainingVertices = 150000;
        const budgetedObjects = [];
        for (const object of spec.objects) {
          let cost = sceneCost(object);
          if (cost > remainingVertices) {
            if (object.kind === "surface" || object.kind === "parametric") {
              const resolution = Array.isArray(object.resolution) ? object.resolution : [surfaceDefault, surfaceDefault];
              let [u, v] = resolution;
              if (remainingVertices >= 4) {
                const scale = Math.sqrt(remainingVertices / (u * v));
                u = Math.max(2, Math.floor(u * scale));
                v = Math.max(2, Math.floor(v * scale));
                while (u * v > remainingVertices && (u > 2 || v > 2)) {
                  if (u >= v && u > 2) u--;
                  else if (v > 2) v--;
                }
                object.resolution = [u, v];
                cost = u * v;
                fixes.push("reduced 3D surface resolution to fit the scene vertex budget");
              }
            } else if (object.kind === "curve") {
              const factor = object.width === undefined ? 1 : 16;
              const samples = Math.floor(remainingVertices / factor);
              if (samples >= 2) {
                object.samples = samples;
                cost = samples * factor;
                fixes.push("reduced 3D curve samples to fit the scene vertex budget");
              }
            } else if (object.kind === "mesh" || object.kind === "points") {
              const maximum = Math.floor(remainingVertices);
              if (object.kind === "mesh" && maximum >= 3) {
                object.vertices = object.vertices.slice(0, maximum);
                object.faces = object.faces.filter(face => face.every(index => index < maximum));
                cost = object.vertices.length;
              } else if (object.kind === "points" && maximum >= 1) {
                object.vertices = object.vertices.slice(0, maximum);
                cost = object.vertices.length;
              }
              fixes.push(`trimmed ${object.kind} vertices to fit the scene vertex budget`);
            } else if (object.kind === "lathe") {
              const maximumSegments = Math.floor(remainingVertices / Math.max(1, object.profile?.length ?? 0));
              if (maximumSegments >= 3) {
                object.segments = Math.min(object.segments ?? 64, maximumSegments);
                cost = object.profile.length * object.segments;
                fixes.push("reduced lathe segments to fit the scene vertex budget");
              }
            }
          }
          if (cost > remainingVertices || (object.kind === "mesh" && !object.faces?.length)) {
            fixes.push(`skipped a ${object.kind} object that exceeded the remaining scene vertex budget`);
            continue;
          }
          budgetedObjects.push(object);
          remainingVertices -= cost;
        }
        if (budgetedObjects.length !== spec.objects.length) spec.objects = budgetedObjects;
      }
    }

    normalizeParameters(spec, fixes);

    if (spec.controls !== undefined) {
      if (!Array.isArray(spec.controls)) {
        delete spec.controls;
        fixes.push("removed an invalid controls list");
      } else {
        const originalCount = spec.controls.length;
        spec.controls = spec.controls.slice(0, 6).filter(control => {
          if (!control || typeof control !== "object" || Array.isArray(control) || typeof control.label !== "string" || !control.label.trim() || control.label.length > 40 || !control.values || typeof control.values !== "object" || Array.isArray(control.values)) return false;
          for (const [name, value] of Object.entries(control.values)) {
            const parameter = spec.parameters.find(item => item.name === name);
            const numericValue = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
            if (!parameter || !Number.isFinite(numericValue)) return false;
            control.values[name] = Math.max(parameter.min, Math.min(parameter.max, numericValue));
          }
          return Object.keys(control.values).length > 0;
        });
        if (spec.controls.length !== originalCount) fixes.push("removed invalid or excess preset controls");
      }
    }
    if (spec.animate !== undefined) {
      const animation = spec.animate;
      const parameter = animation && typeof animation === "object" && spec.parameters.find(item => item.name === animation.param);
      if (!parameter) {
        delete spec.animate;
        fixes.push("removed animation that referenced a missing slider");
      } else {
        for (const key of ["from", "to", "seconds"]) if (typeof animation[key] === "string" && animation[key].trim() !== "" && Number.isFinite(Number(animation[key]))) animation[key] = Number(animation[key]);
        animation.from = Number.isFinite(animation.from) ? Math.max(parameter.min, Math.min(parameter.max, animation.from)) : parameter.min;
        animation.to = Number.isFinite(animation.to) ? Math.max(parameter.min, Math.min(parameter.max, animation.to)) : parameter.max;
        if (animation.from >= animation.to) {
          delete spec.animate;
          fixes.push("removed an invalid animation range");
        } else {
          if (!Number.isFinite(animation.seconds) || animation.seconds < 0.2 || animation.seconds > 120) animation.seconds = 6;
          for (const key of ["loop", "autoplay"]) if (typeof animation[key] !== "boolean") animation[key] = false;
        }
      }
    }
    if (spec.camera && typeof spec.camera === "object" && !Array.isArray(spec.camera)) {
      for (const key of Object.keys(spec.camera)) if (!["azimuth", "elevation"].includes(key)) delete spec.camera[key];
      for (const key of ["azimuth", "elevation"]) {
        if (typeof spec.camera[key] === "string" && Number.isFinite(Number(spec.camera[key]))) spec.camera[key] = Number(spec.camera[key]);
        if (spec.camera[key] !== undefined && !Number.isFinite(spec.camera[key])) delete spec.camera[key];
      }
      if (Number.isFinite(spec.camera.azimuth)) spec.camera.azimuth = Math.max(-360, Math.min(360, spec.camera.azimuth));
      if (Number.isFinite(spec.camera.elevation)) spec.camera.elevation = Math.max(-89, Math.min(89, spec.camera.elevation));
    }
    if (typeof spec.lineWidth === "number" && Number.isFinite(spec.lineWidth)) spec.lineWidth = Math.max(0.5, Math.min(12, spec.lineWidth));
    if (Array.isArray(spec.annotations) && spec.annotations.length > 20) {
      spec.annotations = spec.annotations.slice(0, 20);
      fixes.push("kept the first 20 plot annotations");
    }

    // Fix expression strings only in fields where StudentViz evaluates maths.
    const expressionKeys = new Set([
      "expression", "x", "y", "z", "radius", "radiusTop", "radiusBottom",
      "height", "tube", "depth", "bevel", "size", "position", "rotation",
      "scale", "range", "xRange", "yRange", "t", "u", "v", "profile", "shape"
    ]);
    const parameterNames = new Set((spec.parameters || []).map(parameter => parameter?.name).filter(name => typeof name === "string"));
    function walk(value, key = "") {
      if (Array.isArray(value)) return value.map(item => walk(item, key));
      if (!value || typeof value !== "object") {
        if (typeof value === "string" && expressionKeys.has(key)) {
          const updated = fixExpression(value, parameterNames);
          if (updated !== value) {
            const correction = /\bp\s*\*\s*i\b|\bp\s+i\b/i.test(value) && !parameterNames.has("p") && !parameterNames.has("i")
              ? `normalized π constant in ${key}`
              : `normalized mathematical expression in ${key}`;
            fixes.push(correction);
          }
          return updated;
        }
        if (typeof value === "string" && key.toLowerCase().includes("color")) {
          const updated = cleanColor(value);
          if (updated !== value) fixes.push(`normalized ${key} colour`);
          return updated;
        }
        return value;
      }
      for (const childKey of Object.keys(value)) value[childKey] = walk(value[childKey], childKey);
      return value;
    }
    walk(spec);

    if (spec.detail !== undefined) {
      const detail = typeof spec.detail === "string" ? spec.detail.toLowerCase() : "";
      if (["minimal", "standard", "full"].includes(detail)) {
        if (detail !== spec.detail) fixes.push("normalized detail setting");
        spec.detail = detail;
      } else {
        delete spec.detail;
        fixes.push("removed an unsupported detail setting");
      }
    }
    if (typeof spec.grid === "string" && ["true", "false"].includes(spec.grid.toLowerCase())) {
      spec.grid = spec.grid.toLowerCase() === "true";
      fixes.push("converted grid setting to a boolean");
    }
    if (spec.lineWidth !== undefined) {
      if (typeof spec.lineWidth === "string" && Number.isFinite(Number(spec.lineWidth))) spec.lineWidth = Number(spec.lineWidth);
      if (!Number.isFinite(spec.lineWidth)) delete spec.lineWidth;
      else spec.lineWidth = Math.max(0.5, Math.min(12, spec.lineWidth));
    }
    if (spec.legend !== undefined) {
      if (typeof spec.legend === "string" && ["true", "false"].includes(spec.legend.toLowerCase())) spec.legend = spec.legend.toLowerCase() === "true";
      if (typeof spec.legend !== "boolean") delete spec.legend;
    }
    if (spec.aspect !== undefined && !["equal", "auto"].includes(spec.aspect)) delete spec.aspect;
    for (const key of ["xLabel", "yLabel"]) if (spec[key] !== undefined && typeof spec[key] !== "string") delete spec[key];
    if (spec.annotations !== undefined) {
      if (!Array.isArray(spec.annotations)) delete spec.annotations;
      else {
        const originalCount = spec.annotations.length;
        spec.annotations = spec.annotations.slice(0, 20).filter(annotation => annotation && typeof annotation === "object" && !Array.isArray(annotation) && Number.isFinite(annotation.x) && Number.isFinite(annotation.y) && typeof annotation.text === "string" && annotation.text.trim() && annotation.text.length <= 60);
        for (const annotation of spec.annotations) if (annotation.color !== undefined) {
          annotation.color = cleanColor(annotation.color);
          if (typeof annotation.color !== "string" || !/^#[0-9a-f]{6}$/i.test(annotation.color)) delete annotation.color;
        }
        if (spec.annotations.length !== originalCount) fixes.push("removed invalid or excess plot annotations");
      }
    }

    const supportedColorKeys = new Set(["background", "grid", "axis", "text", "muted", "accent", "points", "pointsFixed", "palette"]);
    if (spec.colors !== undefined) {
      if (!spec.colors || typeof spec.colors !== "object" || Array.isArray(spec.colors)) {
        delete spec.colors;
        fixes.push("removed an invalid colours object");
      } else {
        for (const key of Object.keys(spec.colors)) if (!supportedColorKeys.has(key)) delete spec.colors[key];
        for (const key of Object.keys(spec.colors)) {
          if (key === "palette") {
            if (!Array.isArray(spec.colors.palette)) delete spec.colors.palette;
            else {
              spec.colors.palette = spec.colors.palette.map(cleanColor).filter(color => typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)).slice(0, 8);
              if (!spec.colors.palette.length) delete spec.colors.palette;
            }
          } else {
            spec.colors[key] = cleanColor(spec.colors[key]);
            if (typeof spec.colors[key] !== "string" || !/^#[0-9a-f]{6}$/i.test(spec.colors[key])) delete spec.colors[key];
          }
        }
      }
    }
    return { spec, fixes: [...new Set(fixes)] };
  }

  function repair(raw, options = {}) {
    const parsed = typeof raw === "string" ? parseCandidate(raw) : { value: raw, syntaxFixes: [] };
    const normalized = normalizeSpec(parsed.value);
    return {
      spec: normalized.spec,
      fixes: [...parsed.syntaxFixes, ...normalized.fixes],
      changed: parsed.syntaxFixes.length > 0 || normalized.fixes.length > 0
    };
  }

  function describe(fixes) {
    if (!fixes?.length) return "";
    const unique = [...new Set(fixes)];
    return unique.slice(0, 5).join("; ") + (unique.length > 5 ? `; and ${unique.length - 5} more` : "");
  }

  // ─── Python & Pyodide visual support ──────────────────────────────
  const PYTHON_START_FLAG = /#\s*(?:START|BEGIN)[_\s-]*(?:BIRDPLOT|STUDENTVIZ)[^\n]*/i;
  const PYTHON_END_FLAG = /#\s*END[_\s-]*(?:BIRDPLOT|STUDENTVIZ)[^\n]*/i;

  const PYTHON_PACKAGE_MAP = Object.freeze({
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

  function detectPythonPackages(code) {
    const pkgs = new Set();
    if (!code || typeof code !== "string") return [];

    const lines = code.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) continue;

      const fromMatch = trimmed.match(/^from\s+([a-zA-Z0-9_.]+)/);
      if (fromMatch) {
        const topMod = fromMatch[1].split(".")[0];
        if (PYTHON_PACKAGE_MAP[topMod]) pkgs.add(PYTHON_PACKAGE_MAP[topMod]);
      }

      const importMatch = trimmed.match(/^import\s+([^#;]+)/);
      if (importMatch) {
        const parts = importMatch[1].split(",");
        for (const part of parts) {
          const mod = part.trim().split(/\s+as\s+/)[0].trim().split(".")[0].trim();
          if (PYTHON_PACKAGE_MAP[mod]) pkgs.add(PYTHON_PACKAGE_MAP[mod]);
        }
      }
    }

    const re = /(?:from\s+([a-zA-Z0-9_]+)|import\s+([a-zA-Z0-9_]+))/g;
    let m;
    while ((m = re.exec(code)) !== null) {
      const name = m[1] || m[2];
      if (PYTHON_PACKAGE_MAP[name]) pkgs.add(PYTHON_PACKAGE_MAP[name]);
    }
    return Array.from(pkgs);
  }

  function isPythonBlock(raw, node) {
    if (!raw || typeof raw !== "string") return false;
    const pre = node?.closest?.("pre") || node;
    const context =
      String(pre?.getAttribute?.("class") || "") + " " +
      String(pre?.className || "") + " " +
      String(pre?.getAttribute?.("data-language") || "") + " " +
      String(pre?.getAttribute?.("data-lang") || "");

    // Explicit tag or start flag is authoritative
    if (/birdplot-python|birdplot|studentviz-python|pyviz|studentviz:python/i.test(context)) return true;
    if (/^```\s*(?:birdplot-python|birdplot|studentviz-python|pyviz|python:studentviz)/i.test(raw.trim())) return true;
    if (PYTHON_START_FLAG.test(raw)) return true;

    // Standard python code block
    const isPythonContext = /python|py\b/i.test(context) || /^```\s*(?:python|py)\b/i.test(raw.trim());
    if (isPythonContext) {
      if (PYTHON_START_FLAG.test(raw) || /#\s*(?:birdplot|studentviz)/i.test(raw)) return true;
      if (/(?:matplotlib|plt\b|plt\.show|go\.Figure|px\.|trimesh|from PIL import|seaborn|sns\b|plotly|scipy|sympy|wordcloud|altair|bokeh|svgwrite|skimage|scikit.image|astropy|uncertainties|lmfit|cmocean|pygal|FuncAnimation|animation\.FuncAnimation)/i.test(raw)) return true;
    }

    return false;
  }

  function extractPythonCode(raw) {
    if (!raw || typeof raw !== "string") return "";
    let code = raw.trim();

    code = code.replace(/^```[a-zA-Z0-9_:-]*\s*\n?/, "").replace(/\n?```\s*$/, "");

    const startMatch = code.match(PYTHON_START_FLAG);
    if (startMatch) {
      const startIndex = startMatch.index + startMatch[0].length;
      const afterStart = code.slice(startIndex);
      const endMatch = afterStart.match(PYTHON_END_FLAG);
      if (endMatch) {
        code = afterStart.slice(0, endMatch.index);
      } else {
        code = afterStart;
      }
    }

    return code.trim();
  }

  function extractPythonBlocks(text) {
    const source = String(text ?? "");
    if (!source.trim() || source.length > MAX_LENGTH * 5) return [];

    const blocks = [];

    const fenceRegex = /```(?:birdplot-python|birdplot|studentviz-python|pyviz|python:studentviz|python|py)\s*\n([\s\S]*?)```/gi;
    let match;
    while ((match = fenceRegex.exec(source)) !== null) {
      const fullBlock = match[0];
      const content = match[1];
      if (isPythonBlock(fullBlock) || isPythonBlock(content)) {
        blocks.push(fullBlock);
      }
    }

    const unfencedRegex = /(?:^|\n)(#[ \t]*(?:START|BEGIN)[_\s-]*(?:BIRDPLOT|STUDENTVIZ)[\s\S]*?#[ \t]*END[_\s-]*(?:BIRDPLOT|STUDENTVIZ))/gi;
    while ((match = unfencedRegex.exec(source)) !== null) {
      const flagged = match[1].trim();
      if (flagged && !blocks.some(b => b.includes(flagged))) {
        blocks.push(flagged);
      }
    }

    return blocks;
  }

  const repairApi = Object.freeze({
    extractBlocks,
    extractPythonBlocks,
    extractPythonCode,
    isPythonBlock,
    detectPythonPackages,
    PYTHON_PACKAGE_MAP,
    PYTHON_START_FLAG,
    PYTHON_END_FLAG,
    normalizeType,
    parseCandidate,
    repair,
    normalizeSpec,
    describe,
    scoreObject
  });

  globalThis.BirdPlotRepair = repairApi;
  globalThis.StudentVizRepair = repairApi;
})();
