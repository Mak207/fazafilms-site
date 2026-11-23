import * as THREE from '../interactives/vendor/three-0.180/three.module.min.js';
import {Solver, Joint, Link, Goal, DOF} from './vendor/closed-chain-ik-0.0.7.js';

// Concept 21.10.2026, pp.15–18: native FR20 arms develop a drawing on sand;
// six touch-panel shows continue that drawing with projection mapping.
// This controller drives six CAD joints, never the robot's fixed mount.
const Z = new THREE.Vector3(0, 0, 1);
const STEP = 1 / 30;
const CONTACT_OFFSET = .0015;
const HOVER_CLEARANCE = .105;
const MAX_JOINT_SPEED = .65; // rad/s; exhibition pace, not robot control
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function makeSolver(descriptor) {
  const root = new Link(), joints = [];
  let parent = root;
  for (const d of descriptor.joints) {
    const joint = new Joint(), link = new Link();
    joint.setDoF(DOF.EZ);
    joint.setPosition(...d.translation);
    joint.setQuaternion(...d.restQuaternion);
    joint.setMinLimits(d.min);
    joint.setMaxLimits(d.max);
    link.setQuaternion(...d.linkQuaternion);
    parent.addChild(joint); joint.addChild(link);
    parent = link; joints.push(joint);
  }
  const fixed = new Joint(), tip = new Link(), last = descriptor.pivotsLocal.at(-1);
  fixed.setPosition(...descriptor.tipRestLocal.map((v, i) => v - last[i]));
  parent.addChild(fixed); fixed.addChild(tip);
  const goal = new Goal();
  goal.setPosition(...descriptor.tipRestLocal);
  goal.setQuaternion(0, 0, 0, 1); // Preserve upright source stylus, including wrist orientation.
  goal.makeClosure(tip);
  const solver = new Solver(root);
  solver.maxIterations = 35;
  solver.translationConvergeThreshold = .0002;
  solver.rotationConvergeThreshold = .0004;
  solver.stallThreshold = 1e-7;
  solver.dampingFactor = .002;
  solver.restPoseFactor = 0;
  solver.useSVD = false;
  return {root, joints, tip, goal, solver};
}

/**
 * @param {THREE.Object3D} model Loaded pavilion with source07 robot skins.
 * @param {Object} options sampleSurface/getDrawingPaths from createMap3D.
 * @returns {Object} update(dt,mapState), start(), pause(bool), reset(), snapshot().
 */
export function createMapRobotMotion(model, options = {}) {
  const roots = [];
  model.traverse(o => { if (o.userData?.robotRig?.revision === '20261123-source-07') roots.push(o); });
  roots.sort((a, b) => a.userData.robotRig.robotId.localeCompare(b.userData.robotRig.robotId));
  if (roots.length !== 7) throw new Error('Map robot motion requires seven source07 articulated FR20 assemblies.');
  if (typeof options.sampleSurface !== 'function') throw new Error('Map robot motion needs the actual sand sampleSurface.');
  const sampleSurface = options.sampleSurface;
  let active = options.autoStart !== false, disposed = false, accumulator = 0, elapsed = 0;
  let state = {running: false, layer: 'cities', city: 'all', showProgress: 0, showCount: 0};
  let stateKey = '', steps = 0, solveTime = 0, maxStepTime = 0;
  const temp = new THREE.Vector3(), rotation = new THREE.Quaternion();

  const robots = roots.map((root, index) => {
    const descriptor = root.userData.robotRig;
    root.updateWorldMatrix(true, true);
    const nodes = descriptor.joints.map(d => root.getObjectByName(d.node));
    const tipNode = root.getObjectByName(descriptor.tipNode);
    if (nodes.some(o => !o) || !tipNode) throw new Error('Incomplete source07 joints: ' + descriptor.robotId);
    root.traverse(mesh => {
      if (!mesh.isSkinnedMesh) return;
      // Skinning changes extents without rewriting the CAD vertex buffers.
      // A bounded working envelope avoids stale-pose frustum clipping and the
      // cost of scanning 44k triangles per arm on every animation frame.
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, .85, 0), 2.25);
    });
    const base = root.getWorldPosition(new THREE.Vector3());
    const restTip = new THREE.Vector3().fromArray(descriptor.tipRestLocal).applyMatrix4(root.matrixWorld);
    const kin = makeSolver(descriptor);
    const r = {
      id: descriptor.robotId, index, root, descriptor, nodes, tipNode, kin,
      base, inverse: root.matrixWorld.clone().invert(), mount: root.matrixWorld.toArray(),
      heading: Math.atan2(restTip.z - base.z, restTip.x - base.x),
      angles: descriptor.joints.map(() => 0), jointMin: descriptor.joints.map(() => Infinity),
      jointMax: descriptor.joints.map(() => -Infinity), target: restTip.toArray(), tip: restTip.toArray(),
      orientation: new Float32Array(4), kinPosition: new Float32Array(3),
      paths: [], pathIndex: index % 2, cycle: 0, phase: 'hold', phaseTime: 0, duration: .25 + index * .22,
      from: restTip.toArray(), to: restTip.toArray(), hoverY: restTip.y + .15,
      error: 0, maxError: 0, orientationError: 0, gap: 0, contact: false, blocked: false,
      solverStatus: [], previousContact: null, strokeCount: 0, rejectedStrokes: 0,
      maxJointSpeed: 0, limitedSteps: 0, nonconvergedSteps: 0, maxTipAgreement: 0,
    };
    return r;
  });

  function solve(r, target, dt, warm = false) {
    temp.fromArray(target).applyMatrix4(r.inverse);
    r.kin.goal.setPosition(temp.x, temp.y, temp.z);
    r.solverStatus = r.kin.solver.solve();
    let limited = false;
    r.kin.joints.forEach((joint, i) => {
      let value = joint.dofValues[DOF.EZ];
      if (!Number.isFinite(value)) value = r.angles[i];
      if (!warm) {
        const change = clamp(value - r.angles[i], -MAX_JOINT_SPEED * dt, MAX_JOINT_SPEED * dt);
        if (Math.abs(change - (value - r.angles[i])) > 1e-7) limited = true;
        value = r.angles[i] + change;
        r.maxJointSpeed = Math.max(r.maxJointSpeed, Math.abs(change) / dt);
      }
      value = clamp(value, r.descriptor.joints[i].min, r.descriptor.joints[i].max);
      joint.setDoFValues(value);
      r.angles[i] = value;
      r.jointMin[i] = Math.min(r.jointMin[i], value);
      r.jointMax[i] = Math.max(r.jointMax[i], value);
      rotation.setFromAxisAngle(Z, value);
      r.nodes[i].quaternion.fromArray(r.descriptor.joints[i].restQuaternion).multiply(rotation);
    });
    if (limited) r.limitedSteps++;
    if (r.solverStatus.some(s => s !== 0)) r.nonconvergedSteps++;
    r.root.updateWorldMatrix(true, true);
    r.tipNode.getWorldPosition(temp); r.tip = temp.toArray(); r.target = [...target];
    r.kin.tip.getWorldQuaternion(r.orientation);
    r.orientationError = 2 * Math.acos(clamp(Math.abs(r.orientation[3]), 0, 1));
    r.error = distance(r.tip, target);
    if (r.error > r.maxError) r.worstError = {phase:r.phase,phaseTime:r.phaseTime,target:[...target],tip:[...r.tip],limited,angles:[...r.angles],warm};
    r.maxError = Math.max(r.maxError, r.error);
    r.kin.tip.getWorldPosition(r.kinPosition);
    temp.fromArray(r.kinPosition).applyMatrix4(r.root.matrixWorld);
    r.maxTipAgreement = Math.max(r.maxTipAgreement, temp.distanceTo(new THREE.Vector3().fromArray(r.tip)));
    const surface = sampleSurface(r.tip[0], r.tip[2]);
    r.gap = r.tip[1] - surface.height; r.blocked = Boolean(surface.blocked);
    r.contact = r.phase === 'draw' && !r.blocked && Math.abs(r.gap) <= .005 && r.error <= .003 && r.orientationError <= .003;
  }

  function validPoint(r, p) {
    if (!Array.isArray(p) || p.length < 3 || !p.every(Number.isFinite)) return false;
    const radius = Math.hypot(p[0] - r.base.x, p[2] - r.base.z);
    const angle = Math.atan2(p[2] - r.base.z, p[0] - r.base.x);
    return radius >= .34 && radius <= .49 && Math.abs(angleDelta(angle, r.heading)) <= .34 && !sampleSurface(p[0], p[2]).blocked;
  }
  function refreshPaths(r) {
    const layer = state.running ? state.layer : 'idle';
    const supplied = options.getDrawingPaths?.(layer) || [];
    let paths = supplied.filter(p => p.robotId === r.id && p.physical !== false && p.points?.length >= 3)
      .map(p => ({...p, points: p.points.filter(point => validPoint(r, point))})).filter(p => p.points.length >= 3);
    if (!paths.length) {
      paths = [0, 1].map(ring => ({id: r.id + '-reachable-' + ring, robotId: r.id, layer, physical: true,
        points: Array.from({length: 41}, (_, i) => {
          const a = r.heading + (i / 40 - .5) * .56, radius = .398 + ring * .035 + .009 * Math.sin(i / 40 * Math.PI);
          const x = r.base.x + Math.cos(a) * radius, z = r.base.z + Math.sin(a) * radius;
          return [x, sampleSurface(x, z).height, z];
        }).filter(p => validPoint(r, p))})).filter(p => p.points.length >= 3);
    }
    r.paths = paths.map(p => {
      const lengths = [0];
      for (let i = 1; i < p.points.length; i++) lengths.push(lengths.at(-1) + distance(p.points[i - 1], p.points[i]));
      return {...p, lengths, length: lengths.at(-1)};
    });
    r.pathIndex %= Math.max(1, r.paths.length);
    // Above all reachable sand, not merely the current tip's terrain sample.
    r.hoverY = Math.max(sampleSurface(r.tip[0], r.tip[2]).height,
      ...r.paths.flatMap(p => p.points.map(v => v[1]))) + HOVER_CLEARANCE;
  }
  function pathPoint(r, fraction) {
    const path = r.paths[r.pathIndex];
    if (!path) return [...r.tip];
    const reverse = r.cycle % 2 === 1, distanceAlong = (reverse ? 1 - clamp(fraction) : clamp(fraction)) * path.length;
    let i = 1; while (i < path.lengths.length - 1 && path.lengths[i] < distanceAlong) i++;
    const a = path.points[i - 1], b = path.points[i], t = clamp((distanceAlong - path.lengths[i - 1]) / Math.max(1e-8, path.lengths[i] - path.lengths[i - 1]));
    const x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t;
    return [x, sampleSurface(x, z).height + CONTACT_OFFSET, z];
  }
  function begin(r, phase) {
    r.phase = phase; r.phaseTime = 0; r.previousContact = null; r.contact = false; r.from = [...r.tip];
    if (phase === 'lift') { r.to = [r.tip[0], r.hoverY, r.tip[2]]; r.duration = 1.7; }
    if (phase === 'transfer') { r.to = pathPoint(r, 0); r.to[1] = r.hoverY; r.duration = Math.max(1.9, distance(r.from, r.to) / .075); }
    if (phase === 'lower') { r.to = pathPoint(r, 0); r.duration = 1.9; }
    if (phase === 'draw') { r.to = pathPoint(r, 1); r.duration = Math.max(8.2, (r.paths[r.pathIndex]?.length || .2) / (state.running ? .025 : .021)); }
    if (phase === 'hold') { r.to = [...r.tip]; r.duration = 1; }
  }
  function nextPhase(r) {
    if (!r.paths.length) { begin(r, 'hold'); return; }
    if (r.phase === 'hold' || r.phase === 'lift') begin(r, 'transfer');
    else if (r.phase === 'transfer') begin(r, 'lower');
    else if (r.phase === 'lower') begin(r, 'draw');
    else { r.cycle++; r.pathIndex = (r.pathIndex + 1) % r.paths.length; begin(r, 'lift'); }
  }
  function move(r, dt) {
    r.phaseTime += dt;
    const p = clamp(r.phaseTime / r.duration), e = smooth(p);
    const target = r.phase === 'draw' ? pathPoint(r, e) : r.from.map((v, i) => v + (r.to[i] - v) * e);
    solve(r, target, dt);
    if (r.contact) {
      if (r.previousContact && distance(r.previousContact, r.tip) >= .0015) {
        const stroke = {robotId: r.id, from: r.previousContact, to: [...r.tip], width: .011,
          layer: state.running ? state.layer : 'idle', mode: state.running ? 'show' : 'idle'};
        if (distance(stroke.from, stroke.to) <= .035 && options.onStroke?.(stroke) !== false) r.strokeCount++;
        else r.rejectedStrokes++;
        r.previousContact = [...r.tip];
      } else if (!r.previousContact) r.previousContact = [...r.tip];
    } else r.previousContact = null;
    if (p === 1) nextPhase(r);
  }

  // Initialization is part of asset staging: show assembled arms already clear
  // of the raised sand, then visibly transfer/lower before drawing any trace.
  for (const r of robots) {
    refreshPaths(r);
    // Stage over the first reachable arc. The source's neutral tip is close to
    // the base and has a straight wrist; a lateral departure there crosses a
    // wrist singularity. This off-axis working pose is solved before first render.
    const hover = pathPoint(r, 0); hover[1] = r.hoverY;
    solve(r, hover, STEP, true);
    r.from = [...r.tip]; r.to = [...r.tip]; r.previousContact = null;
  }

  function update(dt, nextState = state) {
    if (disposed) return;
    state = {...state, ...nextState};
    const key = [Boolean(state.running), state.running ? state.layer : 'idle', state.running ? state.city : 'all', state.showCount].join('|');
    if (stateKey && key !== stateKey) for (const r of robots) { refreshPaths(r); begin(r, 'lift'); }
    stateKey = key;
    if (!active) return;
    accumulator += clamp(Number(dt) || 0, 0, .1);
    while (accumulator + 1e-9 >= STEP) {
      const started = performance.now();
      for (const r of robots) move(r, STEP);
      const milliseconds = performance.now() - started;
      solveTime += milliseconds; maxStepTime = Math.max(maxStepTime, milliseconds);
      elapsed += STEP; steps++; accumulator -= STEP;
    }
  }
  function pause(value = true) {
    const next = !Boolean(value); if (next === active) return;
    active = next; accumulator = 0; for (const r of robots) r.previousContact = null;
  }
  function start() { pause(false); }
  function reset() {
    accumulator = 0;
    for (const r of robots) { r.pathIndex = r.index % Math.max(1, r.paths.length); r.cycle = 0; r.strokeCount = 0; r.rejectedStrokes = 0; refreshPaths(r); begin(r, 'lift'); }
    options.onReset?.();
  }
  function snapshot() {
    return {version: 1, revision: '20261123-map-robot-motion-01', source: 'Customer FR20 CAD, concept pp.15–18',
      solver: 'closed-chain-ik-js 0.0.7 (Apache-2.0), six-DoF pose constraints', paused: !active,
      robotCount: robots.length, jointCount: robots.length * 6, rigidNativeParts: robots.length * 57,
      drawCalls: robots.length * 3, updateHz: 30, elapsedSeconds: elapsed, state: {...state},
      meanStepMilliseconds: steps ? solveTime / steps : 0, maxStepMilliseconds: maxStepTime,
      contactStrokeCount: robots.reduce((sum, r) => sum + r.strokeCount, 0),
      robots: robots.map(r => ({id: r.id, phase: r.phase, phaseProgress: clamp(r.phaseTime / r.duration),
        path: r.paths[r.pathIndex]?.id || null, pathCount: r.paths.length, sourceParts: r.descriptor.sourceParts,
        anglesRadians: [...r.angles], jointTravelRadians: r.jointMin.map((v, i) => r.jointMax[i] - v),
        tip: [...r.tip], target: [...r.target], positionErrorMetres: r.error, maxPositionErrorMetres: r.maxError,
        orientationErrorRadians: r.orientationError, skinTipAgreementMetres: r.maxTipAgreement, worstError:r.worstError,
        contact: r.contact, surfaceGapMetres: r.gap, blocked: r.blocked, strokes: r.strokeCount,
        rejectedStrokes: r.rejectedStrokes, solverStatus: [...r.solverStatus], nonconvergedSteps: r.nonconvergedSteps,
        maxJointSpeedRadiansPerSecond: r.maxJointSpeed, speedLimitedSteps: r.limitedSteps,
        mountMatrixError: Math.max(...r.root.matrixWorld.toArray().map((v, i) => Math.abs(v - r.mount[i])))}))};
  }
  function dispose() {
    if (disposed) return; disposed = true;
    for (const r of robots) r.nodes.forEach((node, i) => node.quaternion.fromArray(r.descriptor.joints[i].restQuaternion));
    model.updateMatrixWorld(true);
  }
  return {update, start, pause, setPaused: pause, reset, snapshot, dispose, isAnimating: () => active && !disposed};
}
