// Rendering bridge only. The caller owns the one simulation, avatar factory,
// scene, renderer and frame loop. No model loading or avatar creation happens here.
const finitePoint = p => p && [p.x, p.y, p.z].every(Number.isFinite);
const clamp01 = v => Math.min(1, Math.max(0, v));

export function createAvatarCrowdAdapter({
  simulation, factory, handles = new Map(),
  nearDistance = 10, midDistance = 24, midHz = 12, farHz = 6,
  faceDistance = 8, movementThreshold = .03, activityFor,
} = {}) {
  if (!simulation?.agentSnapshot || !Array.isArray(simulation.order)) throw new Error('Supply the existing CrowdSimulation');
  if (!(handles instanceof Map)) throw new Error('handles must be Map<agentId, avatarHandle>');
  if (!(midHz > 0 && farHz > 0 && nearDistance >= 0 && midDistance >= nearDistance)) throw new Error('Invalid avatar LOD settings');
  const states = new Map();
  let dead = false, lastStats = { positioned: 0, animated: 0, missing: 0 };

  function update(dt, { interpolationAlpha = 1, cameraPosition } = {}) {
    if (dead) return lastStats;
    if (!(dt >= 0) || !Number.isFinite(dt)) throw new Error('Avatar update dt must be finite nonnegative seconds');
    const alpha = clamp01(Number.isFinite(interpolationAlpha) ? interpolationAlpha : 1);
    const cameraValid = finitePoint(cameraPosition), live = new Set();
    const stats = { positioned: 0, animated: 0, missing: 0 };
    for (const agent of simulation.order) {
      const snapshot = simulation.agentSnapshot(agent), id = String(snapshot.id);
      const handle = handles.get(id) || handles.get(agent.id);
      live.add(id);
      if (!handle) { stats.missing++; continue; }
      if (!handle.root?.position?.set || typeof handle.update !== 'function') throw new Error(`Invalid avatar handle for ${id}`);
      const p = snapshot.position, previous = finitePoint(snapshot.previousPosition) ? snapshot.previousPosition : p;
      if (!finitePoint(p)) throw new Error(`Invalid avatar world position for ${id}`);
      let state = states.get(id);
      if (!state || state.handle !== handle) {
        // Different idle phases remain distributed even when all handles were
        // created in the same frame. Walk phase stays owned by the simulation.
        state = { handle, age: 0, first: true, activity: null };
        states.set(id, state);
        if (Number.isFinite(snapshot.animationTime)) handle.pose?.('Idle', snapshot.animationTime, { loop: true });
      }
      const x = previous.x + (p.x - previous.x) * alpha;
      const y = previous.y + (p.y - previous.y) * alpha;
      const z = previous.z + (p.z - previous.z) * alpha;
      handle.root.position.set(x, y, z);
      // The factory already aligns Walk to its own measured forward direction.
      // The simulation yaw is the world +Z heading; do not add info.forwardYaw.
      if (Number.isFinite(snapshot.yaw)) handle.root.rotation.y = snapshot.yaw;
      stats.positioned++;

      const distance = cameraValid ? Math.hypot(x - cameraPosition.x, y - cameraPosition.y, z - cameraPosition.z) : 0;
      const hz = distance <= nearDistance ? Infinity : distance <= midDistance ? midHz : farHz;
      const period = 1 / hz;
      const moving = snapshot.activity !== 'elevator_ride' && snapshot.speed > movementThreshold;
      const activity = activityFor?.(snapshot, agent) || (moving ? 'walk' : 'idle');
      state.age += dt;
      // Pose immediately on state changes; position is updated on every frame
      // irrespective of skeleton LOD. Caller visibility remains authoritative.
      const animate = handle.root.visible !== false && (state.first || state.activity !== activity || state.age + 1e-9 >= period);
      if (animate) { state.age = period > 0 ? state.age % period : 0; stats.animated++; }
      handle.update(dt, { gaitPhase: snapshot.gaitPhase, activity, animate, face: distance <= faceDistance });
      state.first = false; state.activity = activity;
    }
    for (const id of states.keys()) if (!live.has(id)) states.delete(id);
    lastStats = stats;
    return stats;
  }

  return {
    simulation, factory, handles, update,
    get stats() { return { ...lastStats, tracked: states.size }; },
    // Resources are caller-owned. Disposing this bridge never disposes a shared
    // factory, avatar handle, scene or simulation.
    dispose() { states.clear(); dead = true; },
  };
}
