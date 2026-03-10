/**
 * movement.js — Cell Explorer VR
 *
 * cell-locomotion component
 * ──────────────────────────
 * Smooth, head-locked walking navigation for desktop and Meta Quest VR.
 *
 * Desktop  : WASD / Arrow keys + pointer-lock mouse look
 * Meta Quest: Left thumbstick (WebXR Gamepad API, axes 0/1 per controller)
 *
 * Locomotion model
 * ─────────────────
 *  · Input  → desired velocity vector (max = speed m/s)
 *  · Velocity lerps toward desired (acceleration) when moving
 *  · Velocity lerps toward zero    (friction)     when idle
 *  → smooth ramp-up and ramp-down instead of snapping
 *
 * Player height
 * ──────────────
 *  · Camera userHeight is set to playerHeight (default 1.6 m) in desktop mode.
 *  · In VR mode A-Frame/WebXR uses real headset tracking — height is physical.
 *
 * Boundary
 * ─────────
 *  · XZ radial clamp keeps the rig inside the cell membrane (radius = boundary).
 *  · Y is locked to 0 (no flying) — camera offset provides standing height.
 *
 * Schema
 * ───────
 *  speed        m/s max walk speed          default 4.0
 *  acceleration lerp factor toward input    default 12
 *  friction     lerp factor toward stop     default 10
 *  boundary     XZ clamp radius in metres   default 18.5
 *  playerHeight eye height in metres        default 1.6
 *  enabled      pause/resume locomotion     default true
 */
AFRAME.registerComponent('cell-locomotion', {
  schema: {
    speed:        { type: 'number',  default: 4.0  },
    acceleration: { type: 'number',  default: 12   },
    friction:     { type: 'number',  default: 10   },
    boundary:     { type: 'number',  default: 18.5 },
    playerHeight: { type: 'number',  default: 1.6  },
    enabled:      { type: 'boolean', default: true },
  },

  init() {
    /* ── Keyboard state ── */
    this._keys = {};
    this._onKeyDown = (e) => { this._keys[e.code] = true;  };
    this._onKeyUp   = (e) => { this._keys[e.code] = false; };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup',   this._onKeyUp);

    /* ── Pre-allocated THREE objects (avoid GC churn per frame) ── */
    this._velocity   = new THREE.Vector3(); // current smooth velocity (m/s)
    this._targetVel  = new THREE.Vector3(); // desired velocity from input
    this._zero       = new THREE.Vector3(); // constant zero for friction lerp
    this._inputDir   = new THREE.Vector3(); // raw input direction (unit)
    this._euler      = new THREE.Euler(0, 0, 0, 'YXZ');
    this._wq         = new THREE.Quaternion();
    this._yawQ       = new THREE.Quaternion();
    this._newPos     = new THREE.Vector3();

    /* ── Set player height on the camera entity ── */
    this._applyPlayerHeight();

    /* Re-apply on VR enter/exit so desktop height is always correct */
    const scene = this.el.sceneEl;
    this._onExitVR = () => this._applyPlayerHeight();
    scene.addEventListener('exit-vr', this._onExitVR);
  },

  remove() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup',   this._onKeyUp);
    this.el.sceneEl.removeEventListener('exit-vr', this._onExitVR);
  },

  _applyPlayerHeight() {
    const cam = this.el.querySelector('[camera]');
    if (!cam) return;
    /* userHeight is the A-Frame camera attribute that sets the standing offset
       in non-VR (flat) mode. In VR mode the headset tracking overrides this. */
    cam.setAttribute('camera', 'userHeight', this.data.playerHeight);
  },

  /* ─────────────────────────────────────────────────────────── */
  tick(_, deltaMs) {
    if (!this.data.enabled) return;

    /* Cap delta to 50 ms so a tab-wake burst doesn't teleport the player */
    const dt = Math.min(deltaMs / 1000, 0.05);

    /* ── 1. Gather raw input ── */
    let ix = 0;  // strafe  (+right / −left)
    let iz = 0;  // forward (+back  / −forward)

    /* Keyboard */
    const k = this._keys;
    if (k['KeyW'] || k['ArrowUp'])    iz -= 1;
    if (k['KeyS'] || k['ArrowDown'])  iz += 1;
    if (k['KeyA'] || k['ArrowLeft'])  ix -= 1;
    if (k['KeyD'] || k['ArrowRight']) ix += 1;

    /* Meta Quest / WebXR Gamepad API
     *
     * WebXR maps each XRInputSource to a Gamepad entry.
     * On Meta Quest Touch controllers:
     *   axes[0] = thumbstick X  (− left  / + right)
     *   axes[1] = thumbstick Y  (− up    / + down → move back)
     *
     * We read all connected gamepads and accumulate, then normalise.
     * Dead-zone 0.15 eliminates resting drift.
     */
    const DEAD = 0.15;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < pads.length; i++) {
      const gp = pads[i];
      if (!gp || !gp.connected || !gp.axes) continue;
      const ax = gp.axes[0] ?? 0;
      const ay = gp.axes[1] ?? 0;
      if (Math.abs(ax) > DEAD) ix += ax;
      if (Math.abs(ay) > DEAD) iz += ay;
    }

    /* ── 2. Normalise input so diagonals aren't 41 % faster ── */
    const inputMag = Math.sqrt(ix * ix + iz * iz);
    if (inputMag > 1) { ix /= inputMag; iz /= inputMag; }
    const hasInput = inputMag > DEAD;

    /* ── 3. Get camera yaw (horizontal heading only) ── */
    const cam = this.el.querySelector('[camera]');
    if (!cam) return;

    cam.object3D.getWorldQuaternion(this._wq);
    this._euler.setFromQuaternion(this._wq, 'YXZ');
    this._euler.x = 0;  // strip pitch — movement stays on the floor plane
    this._euler.z = 0;  // strip roll
    this._yawQ.setFromEuler(this._euler);

    /* ── 4. Build world-space target velocity ── */
    this._targetVel
      .set(ix, 0, iz)
      .multiplyScalar(this.data.speed)
      .applyQuaternion(this._yawQ);

    /* ── 5. Smooth velocity ──
     *   Moving : lerp velocity → targetVel  (acceleration)
     *   Stopped: lerp velocity → zero       (friction / deceleration)
     */
    const { acceleration, friction } = this.data;
    if (hasInput) {
      this._velocity.lerp(this._targetVel, Math.min(acceleration * dt, 1));
    } else {
      this._velocity.lerp(this._zero, Math.min(friction * dt, 1));
    }

    /* Early-exit when essentially still to avoid floating-point drift */
    if (this._velocity.lengthSq() < 1e-6) return;

    /* ── 6. Apply to rig position ── */
    const rig = this.el.object3D;
    this._newPos
      .copy(rig.position)
      .addScaledVector(this._velocity, dt);

    /* Keep rig on the floor (camera userHeight handles standing offset) */
    this._newPos.y = 0;

    /* ── 7. Radial boundary clamp — stay inside the cell membrane ── */
    const xzDist = Math.sqrt(
      this._newPos.x * this._newPos.x +
      this._newPos.z * this._newPos.z
    );
    if (xzDist > this.data.boundary) {
      const scale = this.data.boundary / xzDist;
      this._newPos.x *= scale;
      this._newPos.z *= scale;
    }

    rig.position.copy(this._newPos);
  },
});

/* ─────────────────────────────────────────────────────────────────────────
 * visible-in-vr-mode
 * Hides an entity when the scene enters immersive VR and shows it on exit.
 * Use on desktop-only UI elements (hint panels, 2D overlays, etc.).
 * ─────────────────────────────────────────────────────────────────────── */
AFRAME.registerComponent('visible-in-vr-mode', {
  init() {
    const scene = this.el.sceneEl;
    this._enterVR = () => this.el.setAttribute('visible', false);
    this._exitVR  = () => this.el.setAttribute('visible', true);
    scene.addEventListener('enter-vr', this._enterVR);
    scene.addEventListener('exit-vr',  this._exitVR);
  },
  remove() {
    const scene = this.el.sceneEl;
    scene.removeEventListener('enter-vr', this._enterVR);
    scene.removeEventListener('exit-vr',  this._exitVR);
  },
});
