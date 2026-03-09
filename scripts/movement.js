/**
 * cell-locomotion — A-Frame component
 *
 * Unified locomotion for Cell Explorer VR.
 *
 * Desktop  : WASD / Arrow keys + mouse look (pointer-lock)
 * Meta Quest: Left-controller thumbstick (axes 2, 3 in WebXR Gamepad API)
 *             Right-controller thumbstick can optionally snap-turn (future).
 *
 * The rig always moves horizontally (no pitch transfer), so the user
 * cannot accidentally float through the membrane floor.
 *
 * @param {number} speed    - metres per second  (default 3.5)
 * @param {number} boundary - max distance from origin before clamping (default 18.5)
 * @param {boolean} enabled - toggle locomotion without removing component
 */
AFRAME.registerComponent('cell-locomotion', {
  schema: {
    speed:    { type: 'number',  default: 3.5  },
    boundary: { type: 'number',  default: 18.5 },
    enabled:  { type: 'boolean', default: true },
  },

  init() {
    /* Keyboard state */
    this._keys = {};
    this._onKeyDown = (e) => { this._keys[e.code] = true;  };
    this._onKeyUp   = (e) => { this._keys[e.code] = false; };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup',   this._onKeyUp);

    /* Reusable THREE objects — allocated once to avoid per-frame GC pressure */
    this._move  = new THREE.Vector3();
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._wq    = new THREE.Quaternion();   // world quaternion of camera
    this._yawQ  = new THREE.Quaternion();   // yaw-only quaternion for rig
    this._pos   = new THREE.Vector3();      // scratch for boundary check
  },

  remove() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup',   this._onKeyUp);
  },

  // ─────────────────────────────────────────────────────────────
  tick(_, deltaMs) {
    if (!this.data.enabled) return;

    const dt = Math.min(deltaMs / 1000, 0.05); // seconds; cap at 50 ms

    /* ── 1. Gather input ── */
    let strafe  = 0;   // +right  / −left
    let forward = 0;   // +backward / −forward (Z grows toward viewer)

    /* Keyboard */
    const k = this._keys;
    if (k['KeyW'] || k['ArrowUp'])    forward  -= 1;
    if (k['KeyS'] || k['ArrowDown'])  forward  += 1;
    if (k['KeyA'] || k['ArrowLeft'])  strafe   -= 1;
    if (k['KeyD'] || k['ArrowRight']) strafe   += 1;

    /* WebXR Gamepad — Meta Quest Touch controllers
     *
     * WebXR Gamepad API axis layout (per W3C WebXR Gamepads Module):
     *   Each XRInputSource exposes a Gamepad with axes:
     *     index 0 → thumbstick X  (left controller)
     *     index 1 → thumbstick Y  (left controller)
     *   When iterating navigator.getGamepads() inside a WebXR session,
     *   the left controller is typically at index 1 (right at 0).
     *   We iterate all gamepads and accumulate any active axis to be
     *   agnostic about ordering.
     *
     * Dead-zone: 0.18 avoids drift from stick resting position.
     */
    const DEAD = 0.18;
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < gamepads.length; i++) {
      const gp = gamepads[i];
      if (!gp || !gp.connected) continue;

      /* axes[0], axes[1] = thumbstick X/Y on the first stick of each controller.
         We use them for locomotion on any controller (left preferred by convention). */
      const ax = gp.axes[0] ?? 0;
      const ay = gp.axes[1] ?? 0;

      if (Math.abs(ax) > DEAD) strafe  += ax;
      if (Math.abs(ay) > DEAD) forward += ay;   // +ay = stick down = move back
    }

    if (strafe === 0 && forward === 0) return;

    /* ── 2. Build yaw-only quaternion from camera heading ── */
    const camera = this.el.querySelector('[camera]');
    if (!camera) return;

    camera.object3D.getWorldQuaternion(this._wq);
    this._euler.setFromQuaternion(this._wq, 'YXZ');
    this._euler.x = 0;   // strip pitch
    this._euler.z = 0;   // strip roll
    this._yawQ.setFromEuler(this._euler);

    /* ── 3. Build movement vector in world-space ── */
    this._move
      .set(strafe, 0, forward)
      .normalize()
      .multiplyScalar(this.data.speed * dt)
      .applyQuaternion(this._yawQ);

    /* ── 4. Apply with boundary clamp (keep user inside the membrane) ── */
    const rig = this.el.object3D;
    this._pos.copy(rig.position).add(this._move);

    const dist = this._pos.length();
    if (dist > this.data.boundary) {
      /* Project back onto the boundary sphere */
      this._pos.multiplyScalar(this.data.boundary / dist);
    }

    rig.position.copy(this._pos);
  },
});

/**
 * visible-in-vr-mode — helper component
 *
 * Hides an entity when the scene enters immersive VR mode.
 * Useful for desktop-only UI elements (hints, flat panels, etc.).
 */
AFRAME.registerComponent('visible-in-vr-mode', {
  init() {
    const scene = this.el.sceneEl;
    scene.addEventListener('enter-vr',  () => { this.el.setAttribute('visible', false); });
    scene.addEventListener('exit-vr',   () => { this.el.setAttribute('visible', true);  });
  },
});
