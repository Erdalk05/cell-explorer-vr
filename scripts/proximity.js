/**
 * proximity.js — Cell Explorer VR
 *
 * organelle-info component
 * ─────────────────────────
 * Attach to any organelle entity.
 *
 * Visual: When the camera rig enters `distance` metres, a dark info panel
 *   fades in showing the organelle name and educational description.
 *   A small "▶ Name" hint is shown when far away and fades as the panel appears.
 *
 * Audio: When the user first enters proximity a spatial narration clip plays
 *   from the organelle's world position. Audio stops when the user walks away.
 *   Re-entering restarts from the beginning.
 *   Missing audio files are silently ignored — no console errors.
 *
 * Schema
 * ───────
 *   title    — organelle name
 *   body     — educational description sentence
 *   distance — proximity trigger radius in metres  (default 4)
 *   color    — accent colour for title text
 *   audio    — filename inside /audio/ folder, e.g. "nucleus.mp3"
 *              Leave empty ("") to disable audio for that organelle.
 */
AFRAME.registerComponent('organelle-info', {
  schema: {
    title:    { type: 'string', default: 'Organelle' },
    body:     { type: 'string', default: ''          },
    distance: { type: 'number', default: 4           },
    color:    { type: 'color',  default: '#ffffff'   },
    audio:    { type: 'string', default: ''          },
  },

  init() {
    this._panel   = this._buildPanel();
    this._opacity = 0;
    this._wasNear = false;   // previous-tick proximity state — drives audio transitions
    this._rig     = null;    // lazy-resolved on first tick

    /* Scratch THREE objects */
    this._myPos  = new THREE.Vector3();
    this._rigPos = new THREE.Vector3();

    /* Set up spatial audio if a file is provided */
    this._soundReady = false;
    if (this.data.audio) {
      this._initAudio();
    }
  },

  remove() {
    this._stopAudio();
  },

  /* ── Spatial audio setup ──────────────────────────────────────────────── */

  _initAudio() {
    const src = `audio/${this.data.audio}`;

    /* Use the Web Audio API directly so we can make it spatial and handle
       missing files without crashing A-Frame's asset system.               */
    const ctx = THREE.AudioContext.getContext();

    this._audioBuffer  = null;
    this._audioSource  = null;   // current BufferSourceNode (one at a time)
    this._panner       = null;   // PannerNode for spatialization
    this._soundReady   = false;

    fetch(src)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then(buf => ctx.decodeAudioData(buf))
      .then(decoded => {
        this._audioBuffer = decoded;
        this._soundReady  = true;

        /* Build a persistent PannerNode — reused across plays */
        this._panner = ctx.createPanner();
        this._panner.panningModel    = 'HRTF';
        this._panner.distanceModel   = 'inverse';
        this._panner.refDistance     = 2;
        this._panner.maxDistance     = 20;
        this._panner.rolloffFactor   = 1.2;
        this._panner.coneInnerAngle  = 360;
        this._panner.coneOuterAngle  = 360;
        this._panner.coneOuterGain   = 0;
        this._panner.connect(ctx.destination);

        /* Sync initial position */
        this._updatePannerPosition();
      })
      .catch(() => {
        /* Silently degrade — audio file not present yet */
        this._soundReady = false;
      });
  },

  _updatePannerPosition() {
    if (!this._panner) return;
    this.el.object3D.getWorldPosition(this._myPos);
    const p = this._panner.positionX
      ? { x: this._panner.positionX, y: this._panner.positionY, z: this._panner.positionZ }
      : null;
    if (p) {
      p.x.setValueAtTime(this._myPos.x, 0);
      p.y.setValueAtTime(this._myPos.y, 0);
      p.z.setValueAtTime(this._myPos.z, 0);
    } else {
      /* Fallback for browsers without AudioParam on PannerNode */
      this._panner.setPosition(this._myPos.x, this._myPos.y, this._myPos.z);
    }
  },

  _playAudio() {
    if (!this._soundReady || !this._audioBuffer) return;

    /* Stop any clip already playing */
    this._stopAudio();

    const ctx = THREE.AudioContext.getContext();

    /* Resume context if browser suspended it (autoplay policy) */
    if (ctx.state === 'suspended') ctx.resume();

    /* Update panner world position before playing */
    this._updatePannerPosition();

    /* Also update the Web Audio listener to match the camera */
    this._syncListener();

    const src = ctx.createBufferSource();
    src.buffer = this._audioBuffer;
    src.loop   = false;
    src.connect(this._panner);
    src.start(0);

    this._audioSource = src;
  },

  _stopAudio() {
    if (!this._audioSource) return;
    try {
      this._audioSource.stop();
    } catch (_) { /* already ended naturally */ }
    this._audioSource = null;
  },

  /* Sync Web Audio listener position + orientation to match A-Frame camera */
  _syncListener() {
    const ctx      = THREE.AudioContext.getContext();
    const listener = ctx.listener;
    const cam      = document.querySelector('#camera');
    if (!cam) return;

    const pos = new THREE.Vector3();
    const fwd = new THREE.Vector3(0, 0, -1);
    const up  = new THREE.Vector3(0, 1,  0);
    const wq  = new THREE.Quaternion();

    cam.object3D.getWorldPosition(pos);
    cam.object3D.getWorldQuaternion(wq);
    fwd.applyQuaternion(wq);
    up.applyQuaternion(wq);

    if (listener.positionX) {
      /* Modern API */
      listener.positionX.setValueAtTime(pos.x, 0);
      listener.positionY.setValueAtTime(pos.y, 0);
      listener.positionZ.setValueAtTime(pos.z, 0);
      listener.forwardX.setValueAtTime(fwd.x, 0);
      listener.forwardY.setValueAtTime(fwd.y, 0);
      listener.forwardZ.setValueAtTime(fwd.z, 0);
      listener.upX.setValueAtTime(up.x, 0);
      listener.upY.setValueAtTime(up.y, 0);
      listener.upZ.setValueAtTime(up.z, 0);
    } else {
      /* Legacy Firefox / Safari */
      listener.setPosition(pos.x, pos.y, pos.z);
      listener.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
  },

  /* ── Visual panel builder ─────────────────────────────────────────────── */

  _buildPanel() {
    const { title, body, color } = this.data;

    const panel = document.createElement('a-entity');
    panel.setAttribute('look-at', '#camera');
    panel.setAttribute('position', '0 3.2 0');

    /* Background card */
    const bg = document.createElement('a-plane');
    bg.setAttribute('width',    '3.2');
    bg.setAttribute('height',   '1.6');
    bg.setAttribute('position', '0 0 -0.02');
    bg.setAttribute('material', `color: #000d08; opacity: 0; transparent: true; side: double; depthWrite: false;`);
    this._bg = bg;

    /* Accent bar */
    const accent = document.createElement('a-plane');
    accent.setAttribute('width',    '3.2');
    accent.setAttribute('height',   '0.04');
    accent.setAttribute('position', '0 0.78 -0.01');
    accent.setAttribute('material', `color: ${color}; opacity: 0; transparent: true; depthWrite: false;`);
    this._accent = accent;

    /* Title */
    const titleEl = document.createElement('a-text');
    titleEl.setAttribute('value',     title.toUpperCase());
    titleEl.setAttribute('align',     'center');
    titleEl.setAttribute('color',     color);
    titleEl.setAttribute('width',     '3');
    titleEl.setAttribute('opacity',   '0');
    titleEl.setAttribute('position',  '0 0.42 0');
    titleEl.setAttribute('font',      'exo2bold');
    this._title = titleEl;

    /* Body */
    const bodyEl = document.createElement('a-text');
    bodyEl.setAttribute('value',      body);
    bodyEl.setAttribute('align',      'center');
    bodyEl.setAttribute('color',      '#d0ead8');
    bodyEl.setAttribute('width',      '2.8');
    bodyEl.setAttribute('opacity',    '0');
    bodyEl.setAttribute('position',   '0 -0.05 0');
    bodyEl.setAttribute('wrap-count', '38');
    this._body = bodyEl;

    /* Audio indicator — small speaker icon shown when audio is active */
    const audioHint = document.createElement('a-text');
    audioHint.setAttribute('value',    this.data.audio ? '🔊' : '');
    audioHint.setAttribute('align',    'center');
    audioHint.setAttribute('color',    color);
    audioHint.setAttribute('width',    '1');
    audioHint.setAttribute('opacity',  '0');
    audioHint.setAttribute('position', '1.3 0.42 0');
    this._audioHint = audioHint;

    /* Far-away hint */
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
    panel.appendChild(audioHint);
    panel.appendChild(hint);

    this.el.appendChild(panel);
    return panel;
  },

  /* ── Tick: proximity check + opacity lerp + audio transitions ─────────── */

  tick() {
    /* Lazy-resolve rig */
    if (!this._rig) {
      this._rig = document.querySelector('#rig');
      if (!this._rig) return;
    }

    this.el.object3D.getWorldPosition(this._myPos);
    this._rig.object3D.getWorldPosition(this._rigPos);

    const near = this._myPos.distanceTo(this._rigPos) < this.data.distance;

    /* ── Audio + task event: only act on state transitions ── */
    if (near && !this._wasNear) {
      this._playAudio();
      /* Notify the task system that the user discovered this organelle */
      this.el.emit('organelle-approached', { title: this.data.title }, false);
    } else if (!near && this._wasNear) {
      this._stopAudio();
    }
    this._wasNear = near;

    /* ── Visual: smooth opacity lerp ── */
    const target  = near ? 1 : 0;
    this._opacity = THREE.MathUtils.lerp(this._opacity, target, 0.06);
    const op      = parseFloat(this._opacity.toFixed(3));

    this._bg.setAttribute('material',     `color: #000d08; opacity: ${(op * 0.72).toFixed(2)}; transparent: true; side: double; depthWrite: false;`);
    this._accent.setAttribute('material', `color: ${this.data.color}; opacity: ${op.toFixed(2)}; transparent: true; depthWrite: false;`);
    this._title.setAttribute('opacity',    op.toFixed(2));
    this._body.setAttribute('opacity',     op.toFixed(2));
    this._audioHint.setAttribute('opacity', (this._soundReady ? op : 0).toFixed(2));
    this._hint.setAttribute('opacity',     (0.55 * (1 - op)).toFixed(2));
  },
});
