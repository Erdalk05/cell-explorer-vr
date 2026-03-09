/**
 * organelles.js — procedural geometry components for Cell Explorer VR
 *
 * Components:
 *  · gltf-emissive    — post-load emissive boost for GLTF/GLB models
 *  · nucleus-pores    — nuclear pore complex rings on outer nuclear envelope
 *  · mito-organelle   — single mitochondrion (elongated pill + wireframe cristae)
 *  · er-stack         — endoplasmic reticulum (layered flat discs)
 *  · ribosome-scatter — cloud of small ribosome spheres
 *  · golgi-apparatus  — stack of curved tori (Golgi cisternae)
 *  · cyto-particles   — drifting cytoplasmic protein / solute dots
 */

/* ═══════════════════════════════════════════════════════════════════════════
 * gltf-emissive
 * After a GLTF/GLB model loads, traverses every mesh in the hierarchy and
 * sets an emissive colour + intensity so the model self-illuminates.
 *
 * Schema: color (hex), intensity (0–1+)
 * ═══════════════════════════════════════════════════════════════════════════ */
AFRAME.registerComponent('gltf-emissive', {
  schema: {
    color:     { type: 'color',  default: '#ff6600' },
    intensity: { type: 'number', default: 0.45      },
  },

  init() {
    this.el.addEventListener('model-loaded', () => {
      const mesh = this.el.getObject3D('mesh');
      if (!mesh) return;
      const emissive = new THREE.Color(this.data.color);
      mesh.traverse(node => {
        if (!node.isMesh) return;
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        mats.forEach(m => {
          m.emissive          = emissive.clone();
          m.emissiveIntensity = this.data.intensity;
          m.needsUpdate       = true;
        });
      });
    });
  },
});

/* ═══════════════════════════════════════════════════════════════════════════
 * nucleus-pores
 * Distributes nuclear-pore-complex rings uniformly over a sphere surface
 * using the Fibonacci (golden-angle) lattice.
 *
 * Each pore is a small torus tilted to face outward from the sphere centre.
 *
 * Schema: count, radius (sphere surface radius), color
 * ═══════════════════════════════════════════════════════════════════════════ */
AFRAME.registerComponent('nucleus-pores', {
  schema: {
    count:  { type: 'number', default: 28      },
    radius: { type: 'number', default: 2.82    },
    color:  { type: 'color',  default: '#e8aa40' },
  },

  init() {
    const { count, radius, color } = this.data;
    const PHI = (1 + Math.sqrt(5)) / 2;  // golden ratio

    for (let i = 0; i < count; i++) {
      const theta = 2 * Math.PI * i / PHI;               // longitude
      const phi   = Math.acos(1 - 2 * (i + 0.5) / count); // latitude

      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.cos(phi);
      const z = radius * Math.sin(phi) * Math.sin(theta);

      /* Outward-facing normal for torus orientation */
      const nx = x / radius, ny = y / radius, nz = z / radius;

      const pore = document.createElement('a-torus');
      pore.setAttribute('radius',          '0.13');
      pore.setAttribute('radius-tubular',  '0.025');
      pore.setAttribute('segments-radial', '12');
      pore.setAttribute('segments-tubular','8');
      pore.setAttribute('position',        `${x.toFixed(3)} ${y.toFixed(3)} ${z.toFixed(3)}`);
      pore.setAttribute('material', `
        color: ${color}; opacity: 0.82; transparent: true;
        roughness: 0.2; metalness: 0.6; depthWrite: false;
      `);

      /* Rotate the torus so its normal aligns with the radial direction */
      const up    = new THREE.Vector3(0, 1, 0);
      const outward = new THREE.Vector3(nx, ny, nz);
      const q     = new THREE.Quaternion().setFromUnitVectors(up, outward);
      const e     = new THREE.Euler().setFromQuaternion(q, 'XYZ');
      pore.setAttribute('rotation', `
        ${THREE.MathUtils.radToDeg(e.x).toFixed(2)}
        ${THREE.MathUtils.radToDeg(e.y).toFixed(2)}
        ${THREE.MathUtils.radToDeg(e.z).toFixed(2)}
      `);

      this.el.appendChild(pore);
    }
  },
});

/* ─── Seeded LCG pseudo-random — deterministic layouts between reloads ─── */
function seededRng(seed) {
  let s = seed || 42;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

/* ─── Shared label builder — floating text above each organelle ─────────── */
function makeLabel(text, color, yOffset = 0) {
  const wrapper = document.createElement('a-entity');
  wrapper.setAttribute('position', `0 ${yOffset} 0`);
  wrapper.setAttribute('look-at', '#camera');

  const bg = document.createElement('a-plane');
  bg.setAttribute('width',    text.includes('\n') ? 2.4 : text.length * 0.18 + 0.4);
  bg.setAttribute('height',   text.includes('\n') ? 0.72 : 0.36);
  bg.setAttribute('material', 'color: #000; opacity: 0.55; transparent: true; depthWrite: false;');
  bg.setAttribute('position', '0 0 -0.01');

  const label = document.createElement('a-text');
  label.setAttribute('value',   text);
  label.setAttribute('align',   'center');
  label.setAttribute('color',   color);
  label.setAttribute('width',   text.includes('\n') ? 2.2 : 3);
  label.setAttribute('opacity', '1');
  label.setAttribute('position', '0 0 0.01');

  wrapper.appendChild(bg);
  wrapper.appendChild(label);
  return wrapper;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * mito-organelle
 * One mitochondrion: elongated sphere (outer membrane) + wireframe ellipsoid
 * (cristae hint). Float-animated with index-based delay for organic feel.
 *
 * Schema: color, ox/oy/oz (offset from parent), index (stagger timing)
 * ═══════════════════════════════════════════════════════════════════════════ */
AFRAME.registerComponent('mito-organelle', {
  schema: {
    color: { type: 'color',  default: '#e74c3c' },
    ox:    { type: 'number', default: 0 },
    oy:    { type: 'number', default: 0 },
    oz:    { type: 'number', default: 0 },
    index: { type: 'number', default: 0 },
  },

  init() {
    const { color, ox, oy, oz, index } = this.data;
    const delay = index * 900;

    /* Outer membrane — elongated pill shape */
    const outer = document.createElement('a-sphere');
    outer.setAttribute('position', `${ox} ${oy} ${oz}`);
    outer.setAttribute('radius', '0.65');
    outer.setAttribute('scale',  '2.0 1 1');
    outer.setAttribute('material', `color: ${color}; opacity: 0.88; roughness: 0.35; metalness: 0.15;`);
    outer.setAttribute('animation', `property: position; to: ${ox} ${oy + 0.28} ${oz}; dir: alternate; dur: 4500; delay: ${delay}; loop: true; easing: easeInOutSine;`);

    /* Inner cristae — wireframe ellipsoid */
    const inner = document.createElement('a-sphere');
    inner.setAttribute('position', `${ox} ${oy} ${oz}`);
    inner.setAttribute('radius', '0.44');
    inner.setAttribute('scale',  '1.8 0.75 0.75');
    inner.setAttribute('material', `color: #ff8a8a; opacity: 0.4; transparent: true; wireframe: true;`);
    inner.setAttribute('animation', `property: position; to: ${ox} ${oy + 0.28} ${oz}; dir: alternate; dur: 4500; delay: ${delay}; loop: true; easing: easeInOutSine;`);

    this.el.appendChild(outer);
    this.el.appendChild(inner);
  },
});

/* ═══════════════════════════════════════════════════════════════════════════
 * er-stack
 * Endoplasmic reticulum: stacked flat cylinders representing the folded
 * membrane network. Each disc slightly tilted and rotated.
 *
 * Schema: layers, color, spacing
 * ═══════════════════════════════════════════════════════════════════════════ */
AFRAME.registerComponent('er-stack', {
  schema: {
    layers:  { type: 'number', default: 6     },
    color:   { type: 'color',  default: '#3498db' },
    spacing: { type: 'number', default: 0.52  },
  },

  init() {
    const { layers, color, spacing } = this.data;
    const rng = seededRng(99);

    for (let i = 0; i < layers; i++) {
      const disc = document.createElement('a-cylinder');
      disc.setAttribute('radius', (1.1 + rng() * 0.55).toFixed(2));
      disc.setAttribute('height', '0.08');
      disc.setAttribute('position', `${(rng() - 0.5) * 0.5} ${i * spacing} ${(rng() - 0.5) * 0.5}`);
      disc.setAttribute('rotation', `${(rng() - 0.5) * 22} ${rng() * 360} ${(rng() - 0.5) * 22}`);
      disc.setAttribute('material', `
        color: ${color}; opacity: 0.45; transparent: true;
        side: double; roughness: 0.5; metalness: 0.4; depthWrite: false;
      `);
      disc.setAttribute('animation', `
        property: rotation;
        to: ${(rng() - 0.5) * 22} ${360 + rng() * 360} ${(rng() - 0.5) * 22};
        dur: ${28000 + rng() * 18000};
        loop: true; easing: linear;
      `);
      this.el.appendChild(disc);
    }
  },
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ribosome-scatter
 * Tiny spheres scattered throughout the cytoplasm volume, avoiding the
 * nucleus region. Each floats gently with a random animation phase.
 *
 * Schema: count, radius, color
 * ═══════════════════════════════════════════════════════════════════════════ */
AFRAME.registerComponent('ribosome-scatter', {
  schema: {
    count:  { type: 'number', default: 50     },
    radius: { type: 'number', default: 14     },
    color:  { type: 'color',  default: '#9b59b6' },
  },

  init() {
    const { count, radius, color } = this.data;
    const rng = seededRng(7);

    for (let i = 0; i < count; i++) {
      const theta = rng() * Math.PI * 2;
      const phi   = Math.acos(2 * rng() - 1);
      const r     = radius * Math.cbrt(rng());

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = (r * Math.cos(phi)) * 0.6 + 1.8;
      const z = r * Math.sin(phi) * Math.sin(theta);

      /* Skip nucleus zone */
      if (Math.hypot(x - 0, y - 2.5, z + 6) < 3.8) continue;

      const dot = document.createElement('a-sphere');
      dot.setAttribute('radius',   (0.07 + rng() * 0.07).toFixed(3));
      dot.setAttribute('position', `${x.toFixed(2)} ${y.toFixed(2)} ${z.toFixed(2)}`);
      dot.setAttribute('material', `color: ${color}; opacity: ${(0.65 + rng() * 0.35).toFixed(2)};`);
      dot.setAttribute('animation', `
        property: position;
        to: ${x.toFixed(2)} ${(y + (rng() - 0.5) * 0.55).toFixed(2)} ${z.toFixed(2)};
        dir: alternate; dur: ${3200 + Math.floor(rng() * 4000)};
        loop: true; easing: easeInOutSine;
      `);
      this.el.appendChild(dot);
    }
  },
});

/* ═══════════════════════════════════════════════════════════════════════════
 * golgi-apparatus
 * Stack of tori (flat rings) representing the Golgi cisternae.
 * Rings get progressively smaller toward the top (trans face) and are
 * slightly curved by tilting each one, giving the classic banana-stack look.
 *
 * Schema: layers, color, spacing
 * ═══════════════════════════════════════════════════════════════════════════ */
AFRAME.registerComponent('golgi-apparatus', {
  schema: {
    layers:  { type: 'number', default: 6     },
    color:   { type: 'color',  default: '#f1c40f' },
    spacing: { type: 'number', default: 0.38  },
  },

  init() {
    const { layers, color, spacing } = this.data;

    for (let i = 0; i < layers; i++) {
      const t        = i / (layers - 1);           // 0 → 1 top to bottom
      const radius   = (1.8 - t * 0.8).toFixed(2); // 1.8 → 1.0
      const tubular  = 0.10;
      const tiltX    = -78 + t * 10;               // slight curve
      const tiltZ    = t * 12;
      const yPos     = i * spacing;
      const opacity  = (0.5 + t * 0.3).toFixed(2);  // thicker at cis face (bottom)

      const ring = document.createElement('a-torus');
      ring.setAttribute('radius',          radius);
      ring.setAttribute('radius-tubular',  tubular);
      ring.setAttribute('segments-tubular', '20');
      ring.setAttribute('position',        `0 ${yPos.toFixed(2)} 0`);
      ring.setAttribute('rotation',        `${tiltX.toFixed(1)} 0 ${tiltZ.toFixed(1)}`);
      ring.setAttribute('material', `
        color: ${color}; opacity: ${opacity}; transparent: true;
        side: double; roughness: 0.3; metalness: 0.5; depthWrite: false;
      `);
      /* Slow spin on each cisterna — trans face rotates faster */
      ring.setAttribute('animation', `
        property: rotation;
        to: ${tiltX.toFixed(1)} 360 ${tiltZ.toFixed(1)};
        dur: ${22000 + i * 3000};
        loop: true; easing: linear;
      `);
      this.el.appendChild(ring);
    }

    /* Vesicles budding off the trans face (top) */
    const rng = seededRng(55);
    for (let v = 0; v < 5; v++) {
      const angle = (v / 5) * Math.PI * 2;
      const vx = Math.cos(angle) * (1.2 + rng() * 0.5);
      const vz = Math.sin(angle) * (1.2 + rng() * 0.5);
      const vy = (layers - 1) * spacing + 0.3 + rng() * 0.4;

      const vesicle = document.createElement('a-sphere');
      vesicle.setAttribute('radius',   (0.12 + rng() * 0.1).toFixed(2));
      vesicle.setAttribute('position', `${vx.toFixed(2)} ${vy.toFixed(2)} ${vz.toFixed(2)}`);
      vesicle.setAttribute('material', `color: ${color}; opacity: 0.75; roughness: 0.2; metalness: 0.5;`);
      vesicle.setAttribute('animation', `
        property: position;
        to: ${(vx * 1.4).toFixed(2)} ${(vy + 0.35).toFixed(2)} ${(vz * 1.4).toFixed(2)};
        dir: alternate; dur: ${3500 + Math.floor(rng() * 2000)};
        loop: true; easing: easeInOutSine;
      `);
      this.el.appendChild(vesicle);
    }
  },
});

/* ═══════════════════════════════════════════════════════════════════════════
 * er-network
 * Endoplasmic reticulum rendered as a tube network — curved CatmullRom paths
 * representing the folded membrane tunnels, far more realistic than flat discs.
 *
 * Schema: tubes, color
 * ═══════════════════════════════════════════════════════════════════════════ */
AFRAME.registerComponent('er-network', {
  schema: {
    tubes: { type: 'number', default: 9     },
    color: { type: 'color',  default: '#3498db' },
  },

  init() {
    const { tubes, color } = this.data;
    const rng  = seededRng(77);
    const col  = new THREE.Color(color);

    for (let t = 0; t < tubes; t++) {
      /* 4 random control points within a ±2.5 m bounding box */
      const pts = Array.from({ length: 4 }, () =>
        new THREE.Vector3(
          (rng() - 0.5) * 5.0,
          (rng() - 0.5) * 3.5,
          (rng() - 0.5) * 4.0,
        )
      );
      const curve  = new THREE.CatmullRomCurve3(pts);
      const tubeR  = 0.065 + rng() * 0.05;
      const geo    = new THREE.TubeGeometry(curve, 28, tubeR, 8, false);

      const mat = new THREE.MeshPhysicalMaterial({
        color:            col,
        emissive:         col,
        emissiveIntensity: 0.55,
        opacity:          0.62,
        transparent:      true,
        roughness:        0.3,
        metalness:        0.25,
        side:             THREE.DoubleSide,
        depthWrite:       false,
      });

      this.el.object3D.add(new THREE.Mesh(geo, mat));
    }
  },
});

/* ═══════════════════════════════════════════════════════════════════════════
 * microtubules
 * Curved tubes connecting organelle positions — the cytoskeletal highway.
 * Placed at world root (position 0,0,0) using absolute organelle coords.
 *
 * Schema: count, color
 * ═══════════════════════════════════════════════════════════════════════════ */
AFRAME.registerComponent('microtubules', {
  schema: {
    count: { type: 'number', default: 14    },
    color: { type: 'color',  default: '#40d4a4' },
  },

  init() {
    const { count, color } = this.data;
    const rng = seededRng(88);
    const col = new THREE.Color(color);

    /* World-space anchor points (organelle centres) */
    const anchors = [
      new THREE.Vector3(  0,  2.5, -7  ),   // nucleus
      new THREE.Vector3(  6,  1.5, -3  ),   // mitochondria
      new THREE.Vector3( -7,  1.5, -1  ),   // ER
      new THREE.Vector3(  5,  1.5,  5  ),   // golgi
      new THREE.Vector3(  3,  3.0,  3  ),   // ribosomes
      new THREE.Vector3( -3,  2.0, -4  ),   // interior fill
      new THREE.Vector3(  1,  1.0,  0  ),   // interior fill
    ];

    const mat = new THREE.MeshPhysicalMaterial({
      color:            col,
      emissive:         col,
      emissiveIntensity: 0.7,
      opacity:          0.42,
      transparent:      true,
      roughness:        0.1,
      depthWrite:       false,
    });

    for (let i = 0; i < count; i++) {
      const a = anchors[Math.floor(rng() * anchors.length)];
      const b = anchors[Math.floor(rng() * anchors.length)];
      if (a === b) continue;

      /* Natural bow in the middle — tubes arc rather than go straight */
      const mid = a.clone().lerp(b, 0.5).add(
        new THREE.Vector3(
          (rng() - 0.5) * 3.5,
          (rng() - 0.5) * 2.5,
          (rng() - 0.5) * 3.5,
        )
      );

      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const geo   = new THREE.TubeGeometry(curve, 24, 0.022 + rng() * 0.018, 5, false);

      this.el.object3D.add(new THREE.Mesh(geo, mat.clone()));
    }
  },
});

/* ═══════════════════════════════════════════════════════════════════════════
 * cyto-particles
 * Fine drifting dots — dissolved proteins and metabolites in the cytoplasm.
 *
 * Schema: count, radius
 * ═══════════════════════════════════════════════════════════════════════════ */
AFRAME.registerComponent('cyto-particles', {
  schema: {
    count:  { type: 'number', default: 60 },
    radius: { type: 'number', default: 17 },
  },

  init() {
    const { count, radius } = this.data;
    const rng = seededRng(31);
    const palette = ['#7feba0', '#52d4a4', '#a0cfb0', '#d4f0e0', '#b0e8d4'];

    for (let i = 0; i < count; i++) {
      const theta = rng() * Math.PI * 2;
      const phi   = Math.acos(2 * rng() - 1);
      const r     = radius * Math.cbrt(rng());

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = (r * Math.cos(phi)) * 0.55 + 1.8;
      const z = r * Math.sin(phi) * Math.sin(theta);

      const color   = palette[Math.floor(rng() * palette.length)];
      const size    = (0.03 + rng() * 0.07).toFixed(3);
      const opacity = (0.25 + rng() * 0.35).toFixed(2);
      const dur     = 4000 + Math.floor(rng() * 6000);
      const drift   = ((rng() - 0.5) * 0.7).toFixed(2);

      const dot = document.createElement('a-sphere');
      dot.setAttribute('radius',   size);
      dot.setAttribute('position', `${x.toFixed(2)} ${y.toFixed(2)} ${z.toFixed(2)}`);
      dot.setAttribute('material', `color: ${color}; opacity: ${opacity}; transparent: true;`);
      dot.setAttribute('animation', `
        property: position;
        to: ${(x + parseFloat(drift)).toFixed(2)} ${(y + parseFloat(drift)).toFixed(2)} ${(z + parseFloat(drift)).toFixed(2)};
        dir: alternate; dur: ${dur}; loop: true; easing: easeInOutSine;
      `);
      this.el.appendChild(dot);
    }
  },
});
