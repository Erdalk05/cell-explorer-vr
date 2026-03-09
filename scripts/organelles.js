/**
 * organelles.js — procedural geometry components for Cell Explorer VR
 *
 * Components defined here:
 *  · mito-organelle   — single mitochondrion (pill-shaped capsule)
 *  · er-stack         — endoplasmic reticulum (layered flat discs)
 *  · ribosome-scatter — cloud of small ribosome spheres
 *  · cyto-particles   — drifting cytoplasmic protein / solute dots
 */

/* ──────────────────────────────────────────────────────────────────────────
 * UTILITY: simple seeded pseudo-random (LCG) so the layout is deterministic
 * between page loads.
 * ──────────────────────────────────────────────────────────────────────── */
function seededRng(seed) {
  let s = seed || 42;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * mito-organelle
 * Renders one mitochondrion as an elongated (scaled) sphere with an inner
 * cristae suggestion (wireframe inner ellipsoid).
 *
 * Schema:
 *   color  — outer membrane colour
 *   ox/oy/oz — position offset from parent entity
 *   index  — used for staggered float animation timing
 * ──────────────────────────────────────────────────────────────────────── */
AFRAME.registerComponent('mito-organelle', {
  schema: {
    color: { type: 'color',  default: '#c0392b' },
    ox:    { type: 'number', default: 0 },
    oy:    { type: 'number', default: 0 },
    oz:    { type: 'number', default: 0 },
    index: { type: 'number', default: 0 },
  },

  init() {
    const d = this.data;
    const delay = d.index * 800;   // stagger floats

    /* Outer membrane */
    const outer = document.createElement('a-sphere');
    outer.setAttribute('position', `${d.ox} ${d.oy} ${d.oz}`);
    outer.setAttribute('radius', '0.6');
    outer.setAttribute('scale', '1.9 1 1');   // elongate → oval
    outer.setAttribute('material', `color: ${d.color}; opacity: 0.82; roughness: 0.4; metalness: 0.2;`);
    outer.setAttribute('animation', `
      property: position;
      to: ${d.ox} ${d.oy + 0.25} ${d.oz};
      dir: alternate;
      dur: 4200;
      delay: ${delay};
      loop: true;
      easing: easeInOutSine;
    `);

    /* Inner cristae (wireframe ellipsoid) */
    const inner = document.createElement('a-sphere');
    inner.setAttribute('position', `${d.ox} ${d.oy} ${d.oz}`);
    inner.setAttribute('radius', '0.42');
    inner.setAttribute('scale', '1.7 0.8 0.8');
    inner.setAttribute('material', `
      color: #ff6b6b;
      opacity: 0.35;
      transparent: true;
      wireframe: true;
    `);
    inner.setAttribute('animation', `
      property: position;
      to: ${d.ox} ${d.oy + 0.25} ${d.oz};
      dir: alternate;
      dur: 4200;
      delay: ${delay};
      loop: true;
      easing: easeInOutSine;
    `);

    this.el.appendChild(outer);
    this.el.appendChild(inner);
  },
});

/* ──────────────────────────────────────────────────────────────────────────
 * er-stack
 * Endoplasmic reticulum: a stack of flat semi-transparent discs, slightly
 * offset and rotated to suggest the folded membrane network.
 *
 * Schema:
 *   layers  — number of disc layers
 *   color   — disc colour
 *   spacing — vertical gap between discs
 * ──────────────────────────────────────────────────────────────────────── */
AFRAME.registerComponent('er-stack', {
  schema: {
    layers:  { type: 'number', default: 5     },
    color:   { type: 'color',  default: '#5b84c4' },
    spacing: { type: 'number', default: 0.55  },
  },

  init() {
    const { layers, color, spacing } = this.data;
    const rng = seededRng(99);

    for (let i = 0; i < layers; i++) {
      const disc = document.createElement('a-cylinder');
      disc.setAttribute('radius',          (1.2 + rng() * 0.5).toFixed(2));
      disc.setAttribute('height',          '0.07');
      disc.setAttribute('position',        `${(rng() - 0.5) * 0.4} ${i * spacing} ${(rng() - 0.5) * 0.4}`);
      disc.setAttribute('rotation',        `${(rng() - 0.5) * 20} ${rng() * 360} ${(rng() - 0.5) * 20}`);
      disc.setAttribute('material', `
        color:       ${color};
        opacity:     0.35;
        transparent: true;
        side:        double;
        roughness:   0.6;
        metalness:   0.3;
        depthWrite:  false;
      `);
      disc.setAttribute('animation', `
        property: rotation;
        to: ${(rng() - 0.5) * 20} ${360 + rng() * 360} ${(rng() - 0.5) * 20};
        dur: ${30000 + rng() * 20000};
        loop: true;
        easing: linear;
      `);
      this.el.appendChild(disc);
    }
  },
});

/* ──────────────────────────────────────────────────────────────────────────
 * ribosome-scatter
 * Scatters many tiny spheres throughout the cytoplasm volume.
 * Each ribosome gets a subtle float animation.
 *
 * Schema:
 *   count  — number of ribosomes
 *   radius — max scatter radius from parent origin
 *   color  — ribosome colour
 * ──────────────────────────────────────────────────────────────────────── */
AFRAME.registerComponent('ribosome-scatter', {
  schema: {
    count:  { type: 'number', default: 40     },
    radius: { type: 'number', default: 14     },
    color:  { type: 'color',  default: '#8e44ad' },
  },

  init() {
    const { count, radius, color } = this.data;
    const rng = seededRng(7);

    for (let i = 0; i < count; i++) {
      /* Uniform-ish distribution inside a sphere via rejection-free method */
      const theta = rng() * Math.PI * 2;
      const phi   = Math.acos(2 * rng() - 1);
      const r     = radius * Math.cbrt(rng()); // cbrt for volume-uniform

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = (r * Math.cos(phi)) * 0.6 + 1.5; // slightly flatten vertically, raise
      const z = r * Math.sin(phi) * Math.sin(theta);

      /* Skip positions too close to the nucleus */
      if (Math.sqrt(x * x + (y - 2.5) * (y - 2.5) + (z + 6) * (z + 6)) < 3.5) continue;

      const sphere = document.createElement('a-sphere');
      sphere.setAttribute('radius', (0.06 + rng() * 0.06).toFixed(3));
      sphere.setAttribute('position', `${x.toFixed(2)} ${y.toFixed(2)} ${z.toFixed(2)}`);
      sphere.setAttribute('material', `color: ${color}; opacity: ${(0.6 + rng() * 0.4).toFixed(2)};`);
      sphere.setAttribute('animation', `
        property: position;
        to: ${x.toFixed(2)} ${(y + (rng() - 0.5) * 0.5).toFixed(2)} ${z.toFixed(2)};
        dir: alternate;
        dur: ${3000 + Math.floor(rng() * 4000)};
        loop: true;
        easing: easeInOutSine;
      `);

      this.el.appendChild(sphere);
    }
  },
});

/* ──────────────────────────────────────────────────────────────────────────
 * cyto-particles
 * Fine floating dots simulating dissolved proteins and metabolites.
 * Smaller and more numerous than ribosomes, semi-transparent white/green.
 *
 * Schema:
 *   count  — number of particles
 *   radius — distribution radius
 * ──────────────────────────────────────────────────────────────────────── */
AFRAME.registerComponent('cyto-particles', {
  schema: {
    count:  { type: 'number', default: 60 },
    radius: { type: 'number', default: 17 },
  },

  init() {
    const { count, radius } = this.data;
    const rng = seededRng(31);

    /* Palette: subtle greens and cyans */
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
      const opacity = (0.3 + rng() * 0.4).toFixed(2);
      const dur     = 4000 + Math.floor(rng() * 6000);
      const drift   = ((rng() - 0.5) * 0.6).toFixed(2);

      const dot = document.createElement('a-sphere');
      dot.setAttribute('radius',   size);
      dot.setAttribute('position', `${x.toFixed(2)} ${y.toFixed(2)} ${z.toFixed(2)}`);
      dot.setAttribute('material', `color: ${color}; opacity: ${opacity}; transparent: true;`);
      dot.setAttribute('animation', `
        property: position;
        to: ${(x + parseFloat(drift)).toFixed(2)} ${(y + parseFloat(drift)).toFixed(2)} ${(z + parseFloat(drift)).toFixed(2)};
        dir: alternate;
        dur: ${dur};
        loop: true;
        easing: easeInOutSine;
      `);

      this.el.appendChild(dot);
    }
  },
});
