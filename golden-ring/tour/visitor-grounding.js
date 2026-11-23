import * as THREE from 'three';

// Use the same weighted Foot/Toe vertices as NativeMotion. The only correction
// is a bounded translation of the whole person over the pavilion's thin tile.
// Joint rotations, clip timing and the original animation module are untouched.
export function createShoeGrounding(rig, bones, groundAtXZ, maxLift = .035) {
  const accepted = new Set();
  for (const name of ['LeftFoot', 'RightFoot']) bones[name]?.traverse(node => accepted.add(node));
  const getters = ['getX', 'getY', 'getZ', 'getW'];
  const rows = [];
  const skeletons = new Set();
  rig.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    skeletons.add(mesh.skeleton);
    const indices = mesh.geometry.getAttribute('skinIndex');
    const weights = mesh.geometry.getAttribute('skinWeight');
    if (!indices || !weights || indices.itemSize !== 4) return;
    const mask = mesh.skeleton.bones.map(bone => accepted.has(bone));
    const vertices = [];
    for (let vertex = 0; vertex < mesh.geometry.getAttribute('position').count; vertex++) {
      let influence = 0;
      for (let i = 0; i < 4; i++) {
        if (mask[indices[getters[i]](vertex)]) influence += weights[getters[i]](vertex);
      }
      if (influence >= .25) vertices.push(vertex);
    }
    if (vertices.length) rows.push({ mesh, vertices });
  });
  if (!rows.length) throw new Error('No weighted shoe geometry for pavilion floor contact');
  const point = new THREE.Vector3();
  const vertexCount = rows.reduce((sum, row) => sum + row.vertices.length, 0);
  return {
    correct(holder) {
      // The caller restores the route's baseline height before NativeMotion
      // evaluates the next pose. This lift never accumulates across frames.
      let minimumClearance = Infinity;
      for (const { mesh, vertices } of rows) {
        for (const vertex of vertices) {
          mesh.getVertexPosition(vertex, point).applyMatrix4(mesh.matrixWorld);
          minimumClearance = Math.min(minimumClearance, point.y - groundAtXZ(point.x, point.z));
        }
      }
      const requestedLift = Math.max(0, -minimumClearance);
      const appliedLift = Math.min(maxLift, requestedLift);
      if (appliedLift > 0) {
        holder.position.y += appliedLift;
        holder.updateWorldMatrix(true, false);
        // SkinnedMesh's override refreshes attached bindMatrixInverse.
        holder.updateMatrixWorld(true);
        for (const skeleton of skeletons) skeleton.update();
      }
      return {
        requestedLift, appliedLift, maxLift, vertexCount,
        capExceeded: requestedLift > maxLift + 1e-6,
        minimumClearance: minimumClearance + appliedLift,
      };
    },
  };
}
