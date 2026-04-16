import m from "mithril";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import {
  buildTonnetzGraph,
  formatPitchClass,
  pc as mod12,
  runTonnetzDevAssertions,
  surfaceFrameOnTorus,
  surfaceNormalOnTorus,
  surfacePointOnTorus,
} from "./tonnetz.js";

const GRID_I = 12;
const GRID_J = 8;
const ROOT_PC = 0;

const LABEL_PLANE_W = 0.19;
const LABEL_PLANE_H = 0.12;
const LINE_SURFACE_EPS = 0.002;
const LABEL_SURFACE_EPS = 0.002;
const EDGE_CURVE_STEPS = 12;

function disposeObject3D(root) {
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (mat.map) mat.map.dispose();
        mat.dispose();
      }
    }
  });
}

function makeCanvasLabelPlane(initialText) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  /** Default true can make canvas rows map to the quad so ink sits in the wrong strip. */
  tex.flipY = false;

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    color: 0xffffff,
    /** Without this, ACES tone mapping crushes canvas labels to near-uniform dark. */
    toneMapped: false,
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });

  const geom = new THREE.PlaneGeometry(LABEL_PLANE_W, LABEL_PLANE_H);
  const mesh = new THREE.Mesh(geom, mat);

  function draw(text) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "700 110px Arial, Helvetica, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const t = String(text ?? "");
    const tm = ctx.measureText(t);
    const asc = Number.isFinite(tm.actualBoundingBoxAscent)
      ? tm.actualBoundingBoxAscent
      : 42;
    const descRaw = Number.isFinite(tm.actualBoundingBoxDescent)
      ? tm.actualBoundingBoxDescent
      : 10;
    const desc = Math.max(descRaw, 6);
    const textH = asc + desc;
    const baselineY = canvas.height / 2 - textH / 2 + asc;
    ctx.fillStyle = "#111111";
    ctx.fillText(t, canvas.width / 2, baselineY);
    tex.needsUpdate = true;
  }

  draw(initialText);

  return {
    mesh,
    draw,
  };
}

function TorusScene() {
  let host;
  let raf;
  let renderer;
  let scene;
  let camera;
  let controls;
  let torus;
  let tonnetzRoot;
  let edgeLineGroups;
  let updateLabelTexts;
  let labelEntries = [];
  let audioCtx;
  let pointerHandler;

  const sceneState = {
    autoRotate: false,
    edges: { p5: true, m3: true, M3: true },
    notation: "sharp",
  };

  const vPos = new THREE.Vector3();
  const vx = new THREE.Vector3();
  const vy = new THREE.Vector3();
  const vz = new THREE.Vector3();
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const nA = new THREE.Vector3();
  const nB = new THREE.Vector3();
  const nLabel = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 0, 1);
  const cameraRight = new THREE.Vector3();
  const matFrame = new THREE.Matrix4();
  const viewToLabel = new THREE.Vector3();
  const labelWorldPos = new THREE.Vector3();
  const labelWorldNormal = new THREE.Vector3();
  const rayDir = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const LABEL_OCCLUSION_EPS = 0.01;

  function resize() {
    if (!host || !renderer || !camera) return;
    const w = host.clientWidth;
    const h = host.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    if (edgeLineGroups) {
      for (const key of ["p5", "m3", "M3"]) {
        edgeLineGroups[key].material.resolution.set(w, h);
      }
    }
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    if (sceneState.autoRotate && torus) {
      torus.rotation.x += 0.008;
      torus.rotation.y += 0.012;
    }

    controls.update();
    cameraRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();

    for (const entry of labelEntries) {
      surfacePointOnTorus(entry.i, entry.j, GRID_I, GRID_J, vPos);
      surfaceNormalOnTorus(entry.i, entry.j, GRID_I, GRID_J, nLabel);
      vPos.addScaledVector(nLabel, LABEL_SURFACE_EPS);

      // Keep labels readable in the current tilted view:
      // project camera-horizontal axis onto the local tangent plane.
      vx.copy(cameraRight);
      vx.addScaledVector(nLabel, -vx.dot(nLabel));
      if (vx.lengthSq() < 1e-9) {
        vx.copy(worldUp);
        vx.addScaledVector(nLabel, -vx.dot(nLabel));
      }
      vx.normalize();
      vz.copy(nLabel).normalize();
      vy.crossVectors(vz, vx).normalize();
      vy.negate();

      matFrame.makeBasis(vx, vy, vz);
      matFrame.setPosition(vPos);
      entry.mesh.matrix.copy(matFrame);
      entry.mesh.matrixWorldNeedsUpdate = true;

      entry.mesh.getWorldPosition(labelWorldPos);
      entry.mesh.getWorldDirection(labelWorldNormal);
      viewToLabel.subVectors(camera.position, labelWorldPos).normalize();
      const isFacingCamera = labelWorldNormal.dot(viewToLabel) > 0;
      if (!isFacingCamera) {
        entry.mesh.visible = false;
        continue;
      }

      rayDir.subVectors(labelWorldPos, camera.position);
      const labelDist = rayDir.length();
      rayDir.normalize();
      raycaster.set(camera.position, rayDir);

      const torusHits = raycaster.intersectObject(torus, false);
      const blockedByTorus =
        torusHits.length > 0 &&
        torusHits[0].distance + LABEL_OCCLUSION_EPS < labelDist;

      entry.mesh.visible = !blockedByTorus;
    }
    renderer.render(scene, camera);
  }

  function applyEdgeVisibility() {
    if (!edgeLineGroups) return;
    edgeLineGroups.p5.visible = sceneState.edges.p5;
    edgeLineGroups.m3.visible = sceneState.edges.m3;
    edgeLineGroups.M3.visible = sceneState.edges.M3;
  }

  function pitchFreqFromPc(pc) {
    // Map pitch classes to octave 4 with A4=440Hz.
    const midi = 60 + ((pc % 12) + 12) % 12;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function playPitch(pc) {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    const now = audioCtx.currentTime;
    const gain = audioCtx.createGain();
    const osc = audioCtx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(pitchFreqFromPc(pc), now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.46);
  }

  function playChord(pcs) {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    const now = audioCtx.currentTime;
    const uniquePcs = [...new Set(pcs.map((p) => mod12(p)))];
    for (const pc of uniquePcs) {
      const gain = audioCtx.createGain();
      const osc = audioCtx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(pitchFreqFromPc(pc), now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.14, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.66);
    }
  }

  return {
    oncreate(vnode) {
      host = vnode.dom.querySelector(".canvas-host");
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0f1115);

      camera = new THREE.PerspectiveCamera(
        50,
        host.clientWidth / host.clientHeight,
        0.1,
        100
      );
      camera.position.z = 4;

      const geom = new THREE.TorusGeometry(0.9, 0.32, 24, 64);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
      });
      torus = new THREE.Mesh(geom, mat);

      const graph = buildTonnetzGraph({
        iSize: GRID_I,
        jSize: GRID_J,
        rootPc: ROOT_PC,
      });
      runTonnetzDevAssertions(graph);

      tonnetzRoot = new THREE.Group();

      function segmentPositionsForEdges(typeFilter) {
        const pos = [];
        const p0 = new THREE.Vector3();
        const p1 = new THREE.Vector3();
        const n0 = new THREE.Vector3();
        const n1 = new THREE.Vector3();
        for (const e of graph.edges) {
          if (e.type !== typeFilter) continue;
          const na = graph.nodes.get(e.a);
          const nb = graph.nodes.get(e.b);
          for (let s = 0; s < EDGE_CURVE_STEPS; s++) {
            const t0 = s / EDGE_CURVE_STEPS;
            const t1 = (s + 1) / EDGE_CURVE_STEPS;

            const i0 = na.i + (nb.i - na.i) * t0;
            const j0 = na.j + (nb.j - na.j) * t0;
            const i1 = na.i + (nb.i - na.i) * t1;
            const j1 = na.j + (nb.j - na.j) * t1;

            surfacePointOnTorus(i0, j0, GRID_I, GRID_J, p0);
            surfaceNormalOnTorus(i0, j0, GRID_I, GRID_J, n0);
            p0.addScaledVector(n0, LINE_SURFACE_EPS);

            surfacePointOnTorus(i1, j1, GRID_I, GRID_J, p1);
            surfaceNormalOnTorus(i1, j1, GRID_I, GRID_J, n1);
            p1.addScaledVector(n1, LINE_SURFACE_EPS);

            pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
          }
        }
        return new Float32Array(pos);
      }

      const mkLines = (type, color) => {
        const arr = segmentPositionsForEdges(type);
        const g = new LineSegmentsGeometry();
        g.setPositions(arr);
        const lineMat = new LineMaterial({
          color,
          linewidth: 0.006,
          worldUnits: true,
          depthTest: true,
          depthWrite: false,
          transparent: true,
          opacity: 1,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -4,
        });
        lineMat.resolution.set(host.clientWidth, host.clientHeight);
        const lines = new LineSegments2(g, lineMat);
        lines.frustumCulled = false;
        lines.renderOrder = 3;
        return lines;
      };

      edgeLineGroups = {
        p5: mkLines("p5", 0x6b8afd),
        m3: mkLines("m3", 0x0b8f2a),
        M3: mkLines("M3", 0xf472b6),
      };
      tonnetzRoot.add(
        edgeLineGroups.p5,
        edgeLineGroups.m3,
        edgeLineGroups.M3
      );
      applyEdgeVisibility();

      labelEntries = [];
      for (const [, n] of graph.nodes) {
        const { mesh, draw } = makeCanvasLabelPlane(
          formatPitchClass(n.pc, sceneState.notation)
        );
        surfacePointOnTorus(n.i, n.j, GRID_I, GRID_J, vPos);
        surfaceNormalOnTorus(n.i, n.j, GRID_I, GRID_J, nLabel);
        vPos.addScaledVector(nLabel, LABEL_SURFACE_EPS);

        // Initial orientation only; updated dynamically each frame in loop().
        surfaceFrameOnTorus(n.i, n.j, GRID_I, GRID_J, vx, vy, vz);
        vy.negate();

        matFrame.makeBasis(vx, vy, vz);
        matFrame.setPosition(vPos);
        mesh.matrix.copy(matFrame);
        mesh.matrixWorldNeedsUpdate = true;
        mesh.matrixAutoUpdate = false;
        mesh.renderOrder = 5;
        tonnetzRoot.add(mesh);
        labelEntries.push({ draw, pc: n.pc, mesh, i: n.i, j: n.j });
      }

      updateLabelTexts = () => {
        for (const { draw, pc } of labelEntries) {
          draw(formatPitchClass(pc, sceneState.notation));
        }
      };

      document.fonts.ready.then(() => {
        updateLabelTexts?.();
      });

      tonnetzRoot.renderOrder = 1;
      torus.add(tonnetzRoot);

      const amb = new THREE.AmbientLight(0xffffff, 0.45);
      const dir = new THREE.DirectionalLight(0xffffff, 1);
      dir.position.set(3, 4, 5);
      scene.add(amb, dir, torus);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setSize(host.clientWidth, host.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      host.appendChild(renderer.domElement);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.target.set(0, 0, 0);
      controls.update();

      pointerHandler = (ev) => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointerNdc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNdc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointerNdc, camera);
        const labelMeshes = labelEntries.map((entry) => entry.mesh);
        const hits = raycaster.intersectObjects(labelMeshes, false);
        if (hits.length > 0) {
          const hit = labelEntries.find((entry) => entry.mesh === hits[0].object);
          if (hit) playPitch(hit.pc);
          return;
        }

        const torusHits = raycaster.intersectObject(torus, false);
        if (torusHits.length === 0 || !torusHits[0].uv) return;
        const uv = torusHits[0].uv;
        const iRaw = uv.x * GRID_I;
        const jRaw = uv.y * GRID_J;
        const i0 = Math.floor(iRaw);
        const j0 = Math.floor(jRaw);
        const fi = iRaw - i0;
        const fj = jRaw - j0;

        const wrapI = (x) => ((x % GRID_I) + GRID_I) % GRID_I;
        const wrapJ = (x) => ((x % GRID_J) + GRID_J) % GRID_J;
        const key = (i, j) => `${wrapI(i)},${wrapJ(j)}`;
        const getPc = (i, j) => graph.nodes.get(key(i, j)).pc;

        // Triangles split by the Tonnetz diagonal from (i+1,j) to (i,j+1).
        const chordPcs =
          fi + fj <= 1
            ? [getPc(i0, j0), getPc(i0 + 1, j0), getPc(i0, j0 + 1)]
            : [getPc(i0 + 1, j0 + 1), getPc(i0 + 1, j0), getPc(i0, j0 + 1)];
        playChord(chordPcs);
      };
      renderer.domElement.addEventListener("pointerdown", pointerHandler);

      window.addEventListener("resize", resize);
      resize();
      loop();
    },
    onremove() {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
      controls?.dispose();
      if (tonnetzRoot) {
        disposeObject3D(tonnetzRoot);
        tonnetzRoot.clear();
      }
      if (torus) {
        torus.geometry.dispose();
        torus.material.dispose();
      }
      if (renderer) {
        if (pointerHandler) {
          renderer.domElement.removeEventListener("pointerdown", pointerHandler);
        }
        renderer.dispose();
        if (renderer.domElement.parentNode === host) {
          host.removeChild(renderer.domElement);
        }
      }
      if (audioCtx) {
        audioCtx.close();
        audioCtx = undefined;
      }
    },
    view: () =>
      m(
        "div.scene-wrap",
        m(
          "header",
          m("h1", "Tonnetz on torus"),
          m("div.header-controls", [
            m(
              "label.header-toggle",
              m("input[type=checkbox]", {
                checked: sceneState.autoRotate,
                onchange: (e) => {
                  sceneState.autoRotate = e.currentTarget.checked;
                  m.redraw();
                },
              }),
              "Auto-rotate"
            ),
            m("span.edge-toggles", [
              m(
                "label.edge-toggle",
                m("input[type=checkbox]", {
                  checked: sceneState.edges.p5,
                  onchange: (e) => {
                    sceneState.edges.p5 = e.currentTarget.checked;
                    applyEdgeVisibility();
                    m.redraw();
                  },
                }),
                "5ths"
              ),
              m(
                "label.edge-toggle",
                m("input[type=checkbox]", {
                  checked: sceneState.edges.m3,
                  onchange: (e) => {
                    sceneState.edges.m3 = e.currentTarget.checked;
                    applyEdgeVisibility();
                    m.redraw();
                  },
                }),
                "min 3rds"
              ),
              m(
                "label.edge-toggle",
                m("input[type=checkbox]", {
                  checked: sceneState.edges.M3,
                  onchange: (e) => {
                    sceneState.edges.M3 = e.currentTarget.checked;
                    applyEdgeVisibility();
                    m.redraw();
                  },
                }),
                "maj 3rds"
              ),
            ]),
            m(
              "label.notation-select",
              "Labels ",
              m(
                "select",
                {
                  onchange: (e) => {
                    sceneState.notation = e.currentTarget.value;
                    updateLabelTexts?.();
                    m.redraw();
                  },
                },
                [
                  m(
                    "option",
                    {
                      value: "sharp",
                      selected: sceneState.notation === "sharp",
                    },
                    "sharps"
                  ),
                  m(
                    "option",
                    {
                      value: "flat",
                      selected: sceneState.notation === "flat",
                    },
                    "flats"
                  ),
                  m(
                    "option",
                    {
                      value: "number",
                      selected: sceneState.notation === "number",
                    },
                    "0–11"
                  ),
                ]
              )
            ),
          ])
        ),
        m("div.canvas-host")
      ),
  };
}

const App = {
  view: () => m(TorusScene),
};

m.mount(document.getElementById("app"), App);
