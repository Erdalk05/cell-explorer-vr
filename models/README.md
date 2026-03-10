# Models

Place .glb / .gltf 3-D models here.

Suggested files:
- cell.glb            — full cell mesh (outer membrane)
- nucleus.glb         — cell nucleus
- mitochondria.glb    — mitochondrion organelle
- ribosome.glb        — ribosome cluster

Load them in index.html inside <a-assets>:
  <a-asset-item id="cell-model" src="models/cell.glb"></a-asset-item>

Then reference in the scene:
  <a-entity gltf-model="#cell-model" position="0 2 -10"></a-entity>
