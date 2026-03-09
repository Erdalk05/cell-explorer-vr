/**
 * proximity.js — Cell Explorer VR
 *
 * organelle-info component
 * ─────────────────────────
 * Attach to any organelle entity. When the camera rig comes within
 * `distance` metres the info panel fades in; when it moves away it fades out.
 *
 * Usage in HTML:
 *   <a-entity organelle-info="title: Nucleus; body: The control centre...; distance: 4; color: #f5a623">
 *   </a-entity>
 *
 * Schema:
 *   title    — organelle name (shown large)
 *   body     — educational description (shown small, wraps)
 *   distance — trigger radius in metres  (default 4)
 *   color    — accent colour for the title text
 */
AFRAME.registerComponent('organelle-info', {
  schema: {
    title:    { type: 'string', default: 'Organelle'  },
    body:     { type: 'string', default: ''           },
    distance: { type: 'number', default: 4            },
    color:    { type: 'color',  default: '#ffffff'    },
  },

  init() {
    /* ── Build info panel ── */
    this._panel  = this._buildPanel();
    this._visible = false;
    this._opacity = 0;

    /* Cache rig reference — resolved lazily on first tick */
    this._rig = null;

    /* Scratch vectors — allocated once */
    this._myPos  = new THREE.Vector3();
    this._rigPos = new THREE.Vector3();
  },

  /* Build the floating info panel as child entities */
  _buildPanel() {
    const { title, body, color } = this.data;

    const panel = document.createElement('a-entity');
    panel.setAttribute('class', 'info-panel');

    /* Always face the camera */
    panel.setAttribute('look-at', '#camera');

    /* Position the panel above the organelle's local origin */
    panel.setAttribute('position', '0 3.2 0');

    /* Dark semi-transparent background card */
    const bg = document.createElement('a-plane');
    bg.setAttribute('id',     `panel-bg-${Math.random().toString(36).slice(2)}`);
    bg.setAttribute('width',  '3.2');
    bg.setAttribute('height', '1.6');
    bg.setAttribute('material', `
      color: #000d08; opacity: 0; transparent: true;
      side: double; depthWrite: false;
    `);
    bg.setAttribute('position', '0 0 -0.02');
    this._bg = bg;

    /* Thin colour accent line along top */
    const accent = document.createElement('a-plane');
    accent.setAttribute('width',  '3.2');
    accent.setAttribute('height', '0.04');
    accent.setAttribute('position', '0 0.78 -0.01');
    accent.setAttribute('material', `color: ${color}; opacity: 0; transparent: true; depthWrite: false;`);
    this._accent = accent;

    /* Title text */
    const titleEl = document.createElement('a-text');
    titleEl.setAttribute('value',    title.toUpperCase());
    titleEl.setAttribute('align',    'center');
    titleEl.setAttribute('color',    color);
    titleEl.setAttribute('width',    '3');
    titleEl.setAttribute('opacity',  '0');
    titleEl.setAttribute('position', '0 0.42 0');
    titleEl.setAttribute('font',     'exo2bold');
    this._title = titleEl;

    /* Body text */
    const bodyEl = document.createElement('a-text');
    bodyEl.setAttribute('value',     body);
    bodyEl.setAttribute('align',     'center');
    bodyEl.setAttribute('color',     '#d0ead8');
    bodyEl.setAttribute('width',     '2.8');
    bodyEl.setAttribute('opacity',   '0');
    bodyEl.setAttribute('position',  '0 -0.05 0');
    bodyEl.setAttribute('wrap-count', '38');
    this._body = bodyEl;

    /* Small "approach" hint — shown when far away, hides when panel opens */
    const hint = document.createElement('a-text');
    hint.setAttribute('value',    `▶  ${title}`);
    hint.setAttribute('align',    'center');
    hint.setAttribute('color',    color);
    hint.setAttribute('width',    '2.5');
    hint.setAttribute('opacity',  '0.55');
    hint.setAttribute('position', '0 0 0');
    this._hint = hint;

    panel.appendChild(bg);
    panel.appendChild(accent);
    panel.appendChild(titleEl);
    panel.appendChild(bodyEl);
    panel.appendChild(hint);

    this.el.appendChild(panel);
    return panel;
  },

  tick() {
    /* Lazy-resolve rig */
    if (!this._rig) {
      this._rig = document.querySelector('#rig');
      if (!this._rig) return;
    }

    /* Get world positions */
    this.el.object3D.getWorldPosition(this._myPos);
    this._rig.object3D.getWorldPosition(this._rigPos);

    const dist    = this._myPos.distanceTo(this._rigPos);
    const trigger = this.data.distance;
    const near    = dist < trigger;

    /* Smoothly interpolate opacity */
    const target   = near ? 1 : 0;
    this._opacity  = THREE.MathUtils.lerp(this._opacity, target, 0.06);
    const op       = parseFloat(this._opacity.toFixed(3));

    if (Math.abs(op - (this._visible ? 1 : 0)) < 0.002 && near === this._visible) return;

    this._visible = near;

    /* Apply opacity to all sub-elements */
    this._bg.setAttribute('material',     `color: #000d08; opacity: ${(op * 0.72).toFixed(2)}; transparent: true; side: double; depthWrite: false;`);
    this._accent.setAttribute('material', `color: ${this.data.color}; opacity: ${op.toFixed(2)}; transparent: true; depthWrite: false;`);
    this._title.setAttribute('opacity',   op.toFixed(2));
    this._body.setAttribute('opacity',    op.toFixed(2));

    /* Hint fades out as panel fades in */
    this._hint.setAttribute('opacity',    (0.55 * (1 - op)).toFixed(2));
  },
});
