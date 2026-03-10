/**
 * tasks.js — Cell Explorer VR
 *
 * Learning task system.
 *
 * Three guided tasks:
 *   1. Find the Nucleus
 *   2. Locate Mitochondria
 *   3. Identify Ribosomes
 *
 * Completion trigger: user walks within proximity of the organelle
 * (the 'organelle-approached' event is emitted by proximity.js on enter).
 *
 * UI:
 *   · Desktop: fixed bottom-left CSS overlay (hidden in VR mode)
 *   · VR:      small A-Frame HUD panel attached to the camera
 *
 * When all three tasks are done a brief "Mission Complete" message shows.
 */

/* ─── Task definitions ─────────────────────────────────────────────────── */
const TASKS = [
  { id: 'nucleus',           label: 'Find the Nucleus',    targetId: '#nucleus',            done: false, color: '#f5a623' },
  { id: 'mitochondria',      label: 'Locate Mitochondria', targetId: '#mitochondria-group', done: false, color: '#e74c3c' },
  { id: 'ribosomes',         label: 'Identify Ribosomes',  targetId: '#ribosomes-cluster',  done: false, color: '#9b59b6' },
];

/* ── Desktop overlay ─────────────────────────────────────────────────────
   Injected into the DOM after scene loads.
   Automatically hidden when the scene enters VR mode.
   ──────────────────────────────────────────────────────────────────────── */
let overlayEl  = null;
let itemEls    = {};

function buildOverlay() {
  const wrap = document.createElement('div');
  wrap.id = 'task-overlay';
  Object.assign(wrap.style, {
    position:      'fixed',
    bottom:        '32px',
    left:          '28px',
    zIndex:        '999',
    background:    'rgba(0,10,5,0.72)',
    border:        '1px solid rgba(82,212,164,0.35)',
    borderRadius:  '10px',
    padding:       '14px 18px',
    fontFamily:    'monospace, sans-serif',
    minWidth:      '210px',
    backdropFilter:'blur(6px)',
    transition:    'opacity 0.5s',
    pointerEvents: 'none',
  });

  /* Header */
  const hdr = document.createElement('div');
  Object.assign(hdr.style, {
    color:        '#52d4a4',
    fontSize:     '11px',
    letterSpacing:'0.12em',
    marginBottom: '10px',
    textTransform:'uppercase',
  });
  hdr.textContent = '🔬 Cell Explorer — Objectives';
  wrap.appendChild(hdr);

  /* Task rows */
  TASKS.forEach(t => {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display:      'flex',
      alignItems:   'center',
      gap:          '10px',
      marginBottom: '7px',
      transition:   'opacity 0.4s',
    });

    const icon = document.createElement('span');
    icon.style.cssText = `
      width: 18px; height: 18px;
      border-radius: 50%;
      border: 2px solid ${t.color};
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 11px;
      transition: background 0.3s;
      flex-shrink: 0;
    `;
    icon.textContent = '';

    const lbl = document.createElement('span');
    lbl.style.cssText = `color: #b0c8bc; font-size: 13px;`;
    lbl.textContent = t.label;

    row.appendChild(icon);
    row.appendChild(lbl);
    wrap.appendChild(row);

    itemEls[t.id] = { row, icon, lbl };
  });

  document.body.appendChild(wrap);
  overlayEl = wrap;

  /* Hide overlay when entering VR */
  const scene = document.querySelector('a-scene');
  scene.addEventListener('enter-vr', () => { wrap.style.opacity = '0'; });
  scene.addEventListener('exit-vr',  () => { wrap.style.opacity = '1'; });
}

function updateOverlay() {
  TASKS.forEach(t => {
    if (!itemEls[t.id]) return;
    const { icon, lbl } = itemEls[t.id];
    if (t.done) {
      icon.textContent  = '✓';
      icon.style.background = t.color;
      icon.style.borderColor = t.color;
      icon.style.color  = '#000';
      lbl.style.color   = '#fff';
      lbl.style.textDecoration = 'none';
    }
  });

  if (TASKS.every(t => t.done)) {
    showCompletionBanner();
  }
}

function showCompletionBanner() {
  const banner = document.createElement('div');
  Object.assign(banner.style, {
    marginTop:  '12px',
    padding:    '8px 12px',
    background: 'rgba(82,212,164,0.18)',
    border:     '1px solid #52d4a4',
    borderRadius:'6px',
    color:      '#52d4a4',
    fontSize:   '12px',
    textAlign:  'center',
    letterSpacing: '0.05em',
  });
  banner.textContent = '🎉 All organelles discovered!';
  overlayEl.appendChild(banner);
}

/* ── VR HUD (A-Frame panel attached to camera) ──────────────────────────
   Small floating checklist panel in the lower-left field of view.
   ──────────────────────────────────────────────────────────────────────── */
AFRAME.registerComponent('task-hud', {
  init() {
    /* Build the HUD in a-entity attached to the camera */
    const cam = document.querySelector('#camera');
    if (!cam) return;

    this._panel = this._buildPanel();
    cam.appendChild(this._panel);

    /* Listen for global task-complete events */
    document.addEventListener('task-complete', (e) => {
      this._markDone(e.detail.id);
    });
    document.addEventListener('all-tasks-complete', () => {
      this._showComplete();
    });
  },

  _buildPanel() {
    const panel = document.createElement('a-entity');
    /* Position: lower-left corner, close to camera plane */
    panel.setAttribute('position', '-0.52 -0.32 -1');
    /* Hidden in flat/desktop mode; shown only in immersive VR */
    panel.setAttribute('visible', 'false');
    const scene = document.querySelector('a-scene');
    scene.addEventListener('enter-vr', () => panel.setAttribute('visible', 'true'));
    scene.addEventListener('exit-vr',  () => panel.setAttribute('visible', 'false'));

    /* Background */
    const bg = document.createElement('a-plane');
    bg.setAttribute('width',  '0.52');
    bg.setAttribute('height', '0.22');
    bg.setAttribute('material', 'color: #000d08; opacity: 0.7; transparent: true; side: double; depthWrite: false;');
    panel.appendChild(bg);

    /* Header text */
    const hdr = document.createElement('a-text');
    hdr.setAttribute('value',    '🔬 OBJECTIVES');
    hdr.setAttribute('align',    'left');
    hdr.setAttribute('color',    '#52d4a4');
    hdr.setAttribute('width',    '0.9');
    hdr.setAttribute('position', '-0.22 0.08 0.001');
    panel.appendChild(hdr);

    /* Task rows */
    this._vrRows = {};
    TASKS.forEach((t, i) => {
      const row = document.createElement('a-text');
      row.setAttribute('value',    `○  ${t.label}`);
      row.setAttribute('align',    'left');
      row.setAttribute('color',    '#88a898');
      row.setAttribute('width',    '0.85');
      row.setAttribute('position', `-0.22 ${0.03 - i * 0.055} 0.001`);
      panel.appendChild(row);
      this._vrRows[t.id] = row;
    });

    this._completionRow = null;
    return panel;
  },

  _markDone(taskId) {
    const task = TASKS.find(t => t.id === taskId);
    if (!task) return;
    const row = this._vrRows[taskId];
    if (row) {
      row.setAttribute('value', `✓  ${task.label}`);
      row.setAttribute('color', task.color);
    }
  },

  _showComplete() {
    /* Enlarge panel and show completion message */
    const bg = this._panel.querySelector('a-plane');
    if (bg) bg.setAttribute('height', '0.29');

    const msg = document.createElement('a-text');
    msg.setAttribute('value',    '🎉 All organelles found!');
    msg.setAttribute('align',    'left');
    msg.setAttribute('color',    '#52d4a4');
    msg.setAttribute('width',    '0.9');
    msg.setAttribute('position', '-0.22 -0.115 0.001');
    this._panel.appendChild(msg);
  },
});

/* ── Wire-up: listen for organelle-approached events ─────────────────────
   proximity.js fires 'organelle-approached' on the organelle entity.
   We match entity IDs to tasks and trigger completion.
   ──────────────────────────────────────────────────────────────────────── */
function wireTaskListeners() {
  TASKS.forEach(t => {
    const el = document.querySelector(t.targetId);
    if (!el) return;

    el.addEventListener('organelle-approached', () => {
      if (t.done) return;
      t.done = true;
      updateOverlay();
      document.dispatchEvent(new CustomEvent('task-complete', { detail: { id: t.id } }));
      if (TASKS.every(task => task.done)) {
        document.dispatchEvent(new CustomEvent('all-tasks-complete'));
      }
    });
  });
}

/* ── Bootstrap after scene is loaded ────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  buildOverlay();

  const scene = document.querySelector('a-scene');
  const onLoaded = () => {
    wireTaskListeners();

    /* Attach the VR HUD to the scene root (it finds the camera internally) */
    const sceneEl = document.querySelector('a-scene');
    if (sceneEl && !sceneEl.components['task-hud']) {
      sceneEl.setAttribute('task-hud', '');
    }
  };

  if (scene.hasLoaded) { onLoaded(); }
  else                  { scene.addEventListener('loaded', onLoaded); }
});
