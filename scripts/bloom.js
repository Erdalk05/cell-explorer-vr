/**
 * bloom.js — Cell Explorer VR
 *
 * Injects THREE.js UnrealBloom post-processing into A-Frame's render loop.
 * Post-processing passes are loaded from CDN at runtime so the main HTML
 * stays dependency-free.
 *
 * Usage: add  bloom="strength: 1.5; radius: 0.7; threshold: 0.08"
 *        to the <a-scene> element.
 *
 * VR-safe: compositor is bypassed when WebXR is presenting, allowing
 * the headset's native reprojection to work uninterrupted.
 */

const THREE_VER = '0.168.0';
const CDN       = `https://cdn.jsdelivr.net/npm/three@${THREE_VER}/examples/jsm`;

AFRAME.registerSystem('bloom', {
  schema: {
    strength:  { type: 'number', default: 1.5  },
    radius:    { type: 'number', default: 0.7  },
    threshold: { type: 'number', default: 0.08 },
  },

  async init() {
    const sceneEl = this.el;

    /* Wait until A-Frame's renderer is initialised */
    await new Promise(resolve => {
      if (sceneEl.renderer) { resolve(); return; }
      sceneEl.addEventListener('renderstart', resolve, { once: true });
    });

    const renderer   = sceneEl.renderer;
    const threeScene = sceneEl.object3D;

    /* Dynamically import post-processing passes from CDN */
    let EffectComposer, RenderPass, UnrealBloomPass, OutputPass;
    try {
      [
        { EffectComposer },
        { RenderPass     },
        { UnrealBloomPass },
        { OutputPass     },
      ] = await Promise.all([
        import(`${CDN}/postprocessing/EffectComposer.js`),
        import(`${CDN}/postprocessing/RenderPass.js`),
        import(`${CDN}/postprocessing/UnrealBloomPass.js`),
        import(`${CDN}/postprocessing/OutputPass.js`),
      ]);
    } catch (e) {
      console.warn('[bloom] Failed to load post-processing from CDN:', e);
      return;
    }

    /* Build the composer */
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(threeScene, sceneEl.camera));

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      this.data.strength,
      this.data.radius,
      this.data.threshold,
    );
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());

    this._composer = composer;

    /* Resize handling */
    window.addEventListener('resize', () => {
      composer.setSize(window.innerWidth, window.innerHeight);
      bloomPass.resolution.set(window.innerWidth, window.innerHeight);
    });

    /* Override renderer.render — skip when WebXR is presenting */
    const origRender = renderer.render.bind(renderer);
    renderer.render = (s, c) => {
      if (s === threeScene && !renderer.xr.isPresenting) {
        this._composer.render();
      } else {
        origRender(s, c);
      }
    };

    console.log(
      `[bloom] UnrealBloom active  strength=${this.data.strength}`,
      `radius=${this.data.radius}  threshold=${this.data.threshold}`
    );
  },
});
