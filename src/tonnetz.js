/** Tonnetz: triangular lattice with P5 (+7) and m3 (+3) as axial steps; diagonals are M3 (+4) and inverse. */

export const TORUS_MAJOR_RADIUS = 0.9;
export const TORUS_TUBE_RADIUS = 0.32;

export function pc(n) {
  return ((n % 12) + 12) % 12;
}

function edgeTypeFromDiff(diff) {
  const d = pc(diff);
  if (d === 7 || d === 5) return "p5";
  if (d === 4 || d === 8) return "M3";
  if (d === 3 || d === 9) return "m3";
  return null;
}

/** Six axis / diagonal steps; each (di, dj) gives PC delta +7*di + 3*dj */
const NEIGHBOR_STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
];

export function pitchClassAt(i, j, rootPc = 0) {
  return pc(rootPc + 7 * i + 3 * j);
}

export function keyOf(i, j) {
  return `${i},${j}`;
}

/**
 * @param {{ iSize: number, jSize: number, rootPc?: number }} opts
 * @returns {{ nodes: Map<string, {i:number,j:number,pc:number}>, edges: Array<{a:string,b:string, di:number,dj:number, pcDiff:number, type:string}> }}
 */
export function buildTonnetzGraph(opts) {
  const { iSize, jSize, rootPc = 0 } = opts;
  const nodes = new Map();

  for (let j = 0; j < jSize; j++) {
    for (let i = 0; i < iSize; i++) {
      const k = keyOf(i, j);
      nodes.set(k, { i, j, pc: pitchClassAt(i, j, rootPc) });
    }
  }

  const edges = [];
  const seen = new Set();

  for (const [ka, na] of nodes) {
    for (const [di, dj] of NEIGHBOR_STEPS) {
      const ib = na.i + di;
      const jb = na.j + dj;
      if (ib < 0 || ib >= iSize || jb < 0 || jb >= jSize) continue;
      const kb = keyOf(ib, jb);
      if (!nodes.has(kb)) continue;

      const pairKey = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      const pb = nodes.get(kb).pc;
      const pcDiff = pc(pb - na.pc);
      const inv = pcDiff > 6 ? 12 - pcDiff : pcDiff;
      const type = edgeTypeFromDiff(pb - na.pc);
      if (!type) continue;

      edges.push({
        a: ka,
        b: kb,
        di,
        dj,
        pcDiff: inv,
        type,
      });
    }
  }

  return { nodes, edges };
}

export function runTonnetzDevAssertions(graph) {
  if (typeof import.meta !== "undefined" && import.meta.env?.PROD) return;

  const allowed = new Set([3, 4, 5, 7]);

  for (const e of graph.edges) {
    console.assert(
      allowed.has(e.pcDiff),
      `edge interval class: ${e.pcDiff}`,
      e
    );
    const na = graph.nodes.get(e.a);
    const nb = graph.nodes.get(e.b);
    const d = pc(nb.pc - na.pc);
    console.assert(
      [3, 4, 5, 7, 8, 9].includes(d),
      `raw diff ${d}`,
      e
    );
  }

  const origin = graph.nodes.get("0,0");
  if (origin) {
    let p = origin.pc;
    for (let k = 0; k < 12; k++) {
      p = pc(p + 7);
    }
    console.assert(p === origin.pc, "12 fifth steps close mod 12 at origin");

    let q = origin.pc;
    for (let k = 0; k < 4; k++) {
      q = pc(q + 3);
    }
    console.assert(q === origin.pc, "4 minor-third steps close mod 12");
  }

  if (
    graph.nodes.has("1,1") &&
    graph.nodes.has("2,1") &&
    graph.nodes.has("2,0")
  ) {
    const p0 = graph.nodes.get("1,1").pc;
    const p1 = graph.nodes.get("2,1").pc;
    const p2 = graph.nodes.get("2,0").pc;
    console.assert(pc(p1 - p0) === 7, "edge along i is P5");
    console.assert(pc(p2 - p1) === 9, "step along -j is m3");
    console.assert(pc(p0 - p2) === 8, "diagonal closes triangle");
    console.assert(
      (p1 - p0) + (p2 - p1) + (p0 - p2) === 0,
      "directed triangle closes in Z"
    );
  }
}

/**
 * Three.js TorusGeometry matches: u = tubular (around big ring), v = radial (around tube).
 */
export function surfacePointOnTorus(i, j, iSize, jSize, out) {
  const u = (i / iSize) * Math.PI * 2;
  const v = (j / jSize) * Math.PI * 2;
  const R = TORUS_MAJOR_RADIUS;
  const r = TORUS_TUBE_RADIUS;
  const cx = Math.cos(u);
  const sx = Math.sin(u);
  const cv = Math.cos(v);
  const sv = Math.sin(v);
  out.set((R + r * cv) * cx, (R + r * cv) * sx, r * sv);
  return out;
}

export function surfaceNormalOnTorus(i, j, iSize, jSize, out) {
  const u = (i / iSize) * Math.PI * 2;
  const v = (j / jSize) * Math.PI * 2;
  const R = TORUS_MAJOR_RADIUS;
  const r = TORUS_TUBE_RADIUS;
  const cx = Math.cos(u);
  const sx = Math.sin(u);
  const cv = Math.cos(v);
  const sv = Math.sin(v);
  const wx = (R + r * cv) * cx;
  const wy = (R + r * cv) * sx;
  const wz = r * sv;
  const center = { x: R * cx, y: R * sx, z: 0 };
  out.set(wx - center.x, wy - center.y, wz - center.z).normalize();
  return out;
}

/**
 * Orthonormal tangent frame: local +Z is outward normal, +X/+Y span the tangent plane
 * (matches PlaneGeometry lying in XY with +Z = outward).
 */
export function surfaceFrameOnTorus(i, j, iSize, jSize, outX, outY, outZ) {
  const u = (i / iSize) * Math.PI * 2;
  const v = (j / jSize) * Math.PI * 2;
  const R = TORUS_MAJOR_RADIUS;
  const r = TORUS_TUBE_RADIUS;
  const cu = Math.cos(u);
  const su = Math.sin(u);
  const cv = Math.cos(v);
  const sv = Math.sin(v);
  const rcv = R + r * cv;

  const dux = -rcv * su;
  const duy = rcv * cu;
  const duz = 0;

  const dvx = -r * sv * cu;
  const dvy = -r * sv * su;
  const dvz = r * cv;

  outZ.set(
    duy * dvz - duz * dvy,
    duz * dvx - dux * dvz,
    dux * dvy - duy * dvx
  );
  outZ.normalize();

  outX.set(dux, duy, duz).normalize();
  outY.crossVectors(outZ, outX).normalize();
}

export const NOTE_NAMES_SHARP = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

export const NOTE_NAMES_FLAT = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];

/** @param {'sharp' | 'flat' | 'number'} style */
export function formatPitchClass(pcVal, style) {
  if (style === "number") return String(pcVal);
  const names = style === "flat" ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
  return names[pcVal];
}
