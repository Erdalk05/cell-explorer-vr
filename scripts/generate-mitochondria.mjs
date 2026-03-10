/**
 * generate-mitochondria.mjs
 *
 * Procedurally builds a game-ready, educational mitochondria GLB.
 *
 * Anatomy modelled:
 *   1. Outer membrane  — semi-transparent orange ellipsoid shell
 *   2. Inner membrane  — slightly smaller, surface-deformed ellipsoid shell
 *   3. Cristae (×7)    — flat laminar sheets folded inward from inner membrane
 *   4. Matrix          — solid interior fill (inner volume)
 *
 * Run: node scripts/generate-mitochondria.mjs
 * Output: models/mitochondria.glb
 */

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { writeFileSync, mkdirSync } from 'fs';

/* Node.js polyfill — GLTFExporter triggers onloadend (not onload) */
if (typeof FileReader === 'undefined') {
  global.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer()
        .then(buf => {
          this.result = buf;
          this.onload?.({ target: this });
          this.onloadend?.({ target: this });
        })
        .catch(err => this.onerror?.(err));
    }
    readAsDataURL(blob) {
      blob.arrayBuffer()
        .then(buf => {
          const b64  = Buffer.from(buf).toString('base64');
          this.result = `data:${blob.type || 'application/octet-stream'};base64,${b64}`;
          this.onload?.({ target: this });
          this.onloadend?.({ target: this });
        })
        .catch(err => this.onerror?.(err));
    }
  };
}

/* ── Seeded pseudo-random (LCG) for deterministic noise ── */
function seededRng(seed = 1) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

/* ── Smooth-step noise on a sphere vertex by vertex ── */
function displaceSphere(geo, amplitude, freq, rng) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const len = Math.sqrt(x*x + y*y + z*z);
    // simple band-limited noise: sum of sin/cos with random phases
    const nx = x / len * freq, ny = y / len * freq, nz = z / len * freq;
    const n = Math.sin(nx * 3.7 + rng() * 6.28) * 0.33
            + Math.sin(ny * 4.1 + rng() * 6.28) * 0.33
            + Math.sin(nz * 3.9 + rng() * 6.28) * 0.33;
    const disp = 1 + n * amplitude;
    pos.setXYZ(i, x * disp, y * disp, z * disp);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

/* ────────────────────────────────────────────────────
   MATERIALS
   ──────────────────────────────────────────────────── */
const matOuter = new THREE.MeshPhysicalMaterial({
  color:        new THREE.Color(0xe85a2d),   // vivid orange-red
  roughness:    0.25,
  metalness:    0.05,
  transparent:  true,
  opacity:      0.38,
  side:         THREE.DoubleSide,
  depthWrite:   false,
});

const matInner = new THREE.MeshPhysicalMaterial({
  color:        new THREE.Color(0xd44a20),
  roughness:    0.4,
  metalness:    0.05,
  transparent:  true,
  opacity:      0.72,
  side:         THREE.DoubleSide,
  depthWrite:   false,
});

const matCristae = new THREE.MeshPhysicalMaterial({
  color:        new THREE.Color(0xc03818),   // deeper red-orange
  roughness:    0.35,
  metalness:    0.08,
  transparent:  true,
  opacity:      0.82,
  side:         THREE.DoubleSide,
  depthWrite:   false,
});

const matMatrix = new THREE.MeshPhysicalMaterial({
  color:        new THREE.Color(0xf0883a),   // warm amber — inner matrix
  roughness:    0.7,
  metalness:    0.0,
  transparent:  true,
  opacity:      0.28,
  side:         THREE.FrontSide,
  depthWrite:   false,
});

/* ────────────────────────────────────────────────────
   1. OUTER MEMBRANE
   Ellipsoid 2.0 × 1.0 × 1.0  (elongated bean shape)
   ──────────────────────────────────────────────────── */
const rng = seededRng(42);

const outerGeo = new THREE.SphereGeometry(1, 64, 40);
// Scale to bean shape
outerGeo.applyMatrix4(new THREE.Matrix4().makeScale(2.0, 1.0, 1.0));
// Subtle surface undulation — outer membrane has gentle ripples
displaceSphere(outerGeo, 0.028, 1.5, rng);

const outerMesh = new THREE.Mesh(outerGeo, matOuter);
outerMesh.name = 'OuterMembrane';

/* ────────────────────────────────────────────────────
   2. INNER MEMBRANE
   Slightly smaller, more deformed ellipsoid
   ──────────────────────────────────────────────────── */
const innerGeo = new THREE.SphereGeometry(0.82, 64, 40);
innerGeo.applyMatrix4(new THREE.Matrix4().makeScale(2.0, 1.0, 1.0));
// More pronounced surface deformation — inner membrane is highly folded
displaceSphere(innerGeo, 0.07, 2.5, rng);

const innerMesh = new THREE.Mesh(innerGeo, matInner);
innerMesh.name = 'InnerMembrane';

/* ────────────────────────────────────────────────────
   3. CRISTAE
   Laminar sheets folded inward along the long axis.
   Each crista is a subdivided PlaneGeometry bent into
   a shallow arch, positioned along X (long axis).
   ──────────────────────────────────────────────────── */
const cristaeMeshes = [];
const NUM_CRISTAE = 7;

for (let c = 0; c < NUM_CRISTAE; c++) {
  // Spread cristae evenly along the long axis, avoiding tips
  const t  = (c + 1) / (NUM_CRISTAE + 1);       // 0..1 exclusive
  const xPos = -1.35 + t * 2.70;                 // -1.35 .. +1.35

  // Width of the crista depends on how much room the ellipsoid gives at that X
  // For ellipsoid x²/a² + r²/b² = 1  → r = b * sqrt(1 - x²/a²)
  const a = 2.0 * 0.82, b = 0.82;
  const xNorm = xPos / a;
  const innerRadius = xNorm * xNorm < 1
    ? b * Math.sqrt(1 - xNorm * xNorm) * 0.80    // 80 % of available radius
    : 0.05;

  const cristaHeight = innerRadius * 1.9;          // sheet extends ~90 % of diameter
  const cristaWidth  = 0.11 + rng() * 0.05;        // thin lamina

  // Subdivided plane — will be bent into an arch
  const planeGeo = new THREE.PlaneGeometry(cristaWidth, cristaHeight, 2, 18);
  const planePos = planeGeo.attributes.position;

  // Bend the plane into a shallow arch (fold inward from the inner membrane wall)
  for (let i = 0; i < planePos.count; i++) {
    const v = planePos.getY(i);     // -0.5..+0.5 along height axis
    const vN = v / (cristaHeight / 2);
    // Arch: push z inward at the middle, keep edges at inner membrane wall
    const arch = Math.cos(vN * Math.PI * 0.5);   // 1 at tips, 0 at equator
    planePos.setZ(i, planePos.getZ(i) - arch * innerRadius * 0.45);
  }
  planePos.needsUpdate = true;
  planeGeo.computeVertexNormals();

  // Random slight tilt per crista (natural variation)
  const tiltAngle = (rng() - 0.5) * 0.35;        // ± ~10°

  const crista = new THREE.Mesh(planeGeo, matCristae);
  crista.name  = `Crista_${c}`;
  crista.position.set(xPos, 0, 0);
  crista.rotation.set(tiltAngle, 0, Math.PI / 2);  // orient along long axis

  cristaeMeshes.push(crista);
}

/* ────────────────────────────────────────────────────
   4. MATRIX (solid fill)
   Very slightly smaller than inner membrane — gives
   the dense gel appearance of the mitochondrial matrix
   ──────────────────────────────────────────────────── */
const rng2 = seededRng(42);    // reset same seed so shape matches inner
const matrixGeo = new THREE.SphereGeometry(0.76, 48, 32);
matrixGeo.applyMatrix4(new THREE.Matrix4().makeScale(2.0, 1.0, 1.0));
displaceSphere(matrixGeo, 0.07, 2.5, rng2);   // same deformation profile

const matrixMesh = new THREE.Mesh(matrixGeo, matMatrix);
matrixMesh.name = 'Matrix';

/* ────────────────────────────────────────────────────
   SCENE ASSEMBLY
   ──────────────────────────────────────────────────── */
const root = new THREE.Object3D();
root.name  = 'Mitochondria';

root.add(matrixMesh);
root.add(...cristaeMeshes);
root.add(innerMesh);
root.add(outerMesh);       // outer last so transparency sorts correctly

/* ────────────────────────────────────────────────────
   EXPORT  (async/await — avoids process-exit race)
   ──────────────────────────────────────────────────── */
const exporter = new GLTFExporter();

try {
  const gltf = await exporter.parseAsync(root, { binary: true });
  mkdirSync('models', { recursive: true });
  writeFileSync('models/mitochondria.glb', Buffer.from(gltf));
  console.log('✓  models/mitochondria.glb written');
  console.log(`   outer membrane : 1 mesh (transparent shell)`);
  console.log(`   inner membrane : 1 mesh (deformed shell)`);
  console.log(`   cristae        : ${NUM_CRISTAE} laminar sheets`);
  console.log(`   matrix         : 1 mesh (solid fill)`);
  console.log(`   total meshes   : ${NUM_CRISTAE + 3}`);
} catch (err) {
  console.error('Export failed:', err);
  process.exit(1);
}
