import { EPS, xyz, clamp, distanceXZ, distance3, pointSegmentDistance, samplePolyline, makePolyline, seededRandom, SpatialHash, sweptAgentDistance } from './geometry.js';
import { ParkWorld } from './world.js';
import { StairController, ElevatorController } from './transitions.js';
import { setPopulation as resizePopulation, localItinerary } from './population.js';
import { updateObstacles as replaceObstacles, inTransitionCorridor as corridorContains } from './dynamic-world.js';
import { SocialController } from './social.js?v=social-20261124';

const copy = p => ({ x: p.x, y: p.y, z: p.z });
const verticalOverlap = (a, pa, b, pb) => pa.y < pb.y + b.height - EPS && pb.y < pa.y + a.height - EPS;

export class CrowdSimulation {
  constructor(world, options = {}) {
    this.world = world instanceof ParkWorld ? world : new ParkWorld(world, options.worldOptions);
    this.options = options; this.fixedStep = options.fixedStep || 1 / 30; this.maxSubSteps = options.maxSubSteps || 15;
    this.maxFrameDelta = options.maxFrameDelta || .5; this.time = 0; this.tick = 0; this.accumulator = 0; this.droppedTime = 0;
    this.agents = new Map(); this.order = []; this.events = []; this.reservations = new Map(); this.hash = new SpatialHash(options.hashCellSize || 1.2);
    this.occupancy = new SpatialHash(options.hashCellSize || 1.2);
    this.nextOrdinal = 0;
    this.populationSequence = 0; this.populationTarget = 0; this.goalCursor = 0;
    this.defaultRadius = options.defaultRadius ?? Math.max(.45, ...[...this.world.floors.values()].map(floor => floor.grid?.clearanceRadius || 0));
    this.defaultHeight = options.defaultHeight ?? Math.max(2.05, ...[...this.world.floors.values()].map(floor => floor.bodyHeight));
    this.maxRadius = .3; this.contactMargin = options.contactMargin ?? .01;
    this.stairs = new Map([...this.world.stairs].map(([id, def]) => [id, new StairController(def, this)]));
    this.elevators = new Map([...this.world.elevators].map(([id, def]) => [id, new ElevatorController(def, this)]));
    this.controllers = [...this.stairs.values(), ...this.elevators.values()];
    this.metrics = { steps: 0, neighbourChecks: 0, collisionStops: 0, routePlans: 0, maxElevatorOccupancy: 0 };
    if (options.social) this.enableSocial(options.social === true ? {} : options.social);
  }
  emit(type, data = {}) {
    const event = { tick: this.tick, time: this.time, type, ...data };
    if (this.options.eventLog !== false) { this.events.push(event); if (this.events.length > (this.options.maxEvents || 10000)) this.events.shift(); }
    this.options.onEvent?.(event);
  }
  addAgent(definition) {
    const id = String(definition.id); if (this.agents.has(id)) throw new Error(`Duplicate agent ${id}`);
    const floorId = String(definition.floorId), floor = this.world.floor(floorId), position = xyz(definition.position, floor.elevation);
    const radius = definition.radius ?? .26, height = definition.height ?? 1.7;
    if (!(definition.strideMeters > 0)) throw new Error(`Agent ${id}: supply measured strideMeters from its own Walk clip`);
    if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(height) || height <= 0) throw new Error(`Agent ${id}: invalid body envelope`);
    if (height > floor.bodyHeight + EPS || Math.abs(position.y - floor.elevation) > .03 || !this.world.pointAllowed(floorId, position, radius)) throw new Error(`Agent ${id}: spawn is outside the measured walkable area or body clearance`);
    for (const other of this.occupancy.query(position, radius + this.maxRadius + this.contactMargin)) if (verticalOverlap({ height }, position, other, other.position) && distanceXZ(position, other.position) < radius + other.radius + this.contactMargin - EPS) throw new Error(`Agent ${id}: spawn overlaps ${other.id}`);
    const random = seededRandom(definition.seed ?? id);
    const agent = {
      id, ordinal: this.nextOrdinal++, floorId, position, previousPosition: copy(position), radius, height,
      maxSpeed: definition.maxSpeed ?? .85 + random() * .45, acceleration: definition.acceleration ?? 1.6,
      strideMeters: definition.strideMeters, gaitCycles: definition.phaseOffset ?? random(), locomotionDistance: 0,
      velocity: { x: 0, z: 0 }, yaw: definition.yaw || 0, speed: 0, activity: 'idle', animationTime: random() * 5,
      accessibleOnly: !!definition.accessibleOnly, allowedTransitions: definition.allowedTransitions, random, route: null, routeIndex: 0, activePath: null, transit: null,
      itinerary: [...(definition.itinerary || [])], itineraryIndex: 0, repeat: definition.repeat !== false,
      autoWander: !!definition.autoWander, wanderAfter: 0,
      progressPosition: copy(position), progressTime: this.time, walkSince: this.time, escapeRetryAt: 0,
      dwellSeconds: definition.dwellSeconds, idleUntil: Infinity, goal: null, pendingDestination: null,
      social: null, socialHold: false, socialSpeedFactor: 1,
      reservation: null, queuePath: null, queueReady: false, blockedSeconds: 0, routeRevision: this.world.revision
    };
    this.agents.set(id, agent); this.order.push(agent); this.occupancy.insert(agent); this.maxRadius = Math.max(this.maxRadius, radius);
    this.social?.populationChanged(id);
    if (definition.destination || agent.itinerary.length) {
      const target = definition.destination || agent.itinerary[0];
      if (definition.deferDestination) { agent.goal = target; agent.pendingDestination = target; agent.activity = 'route_pending'; }
      else this.setDestination(id, target);
    }
    return agent;
  }
  removeAgent(id) {
    return this.removeAgents([id]).length > 0;
  }
  removeAgents(ids) {
    const remove = new Set(ids.map(String).filter(id => this.agents.has(id)));
    for (const controller of this.controllers) controller.cancelMany(remove);
    for (const id of remove) {
      const agent = this.agents.get(id); this.releaseDestination(agent); this.agents.delete(id);
      this.occupancy.remove(agent); this.hash.remove(agent);
      for (const crossing of this.world.crossings.values()) crossing.allowedExitIds?.delete(id);
    }
    this.order = this.order.filter(agent => !remove.has(agent.id));
    this.social?.removeAgents(remove);
    this.goalCursor %= Math.max(1, this.order.length); return [...remove];
  }
  spawnClear(floorId, position, radius, height) {
    const floor = this.world.floor(floorId);
    return height <= floor.bodyHeight + EPS && Math.abs(position.y - floor.elevation) <= .03
      && this.world.pointAllowed(floorId, position, radius)
      && this.occupancy.query(position, radius + this.maxRadius + this.contactMargin).every(other => !verticalOverlap({ height }, position, other, other.position) || distanceXZ(position, other.position) >= radius + other.radius + this.contactMargin - EPS);
  }
  setPopulation(target, options) { const result = resizePopulation(this, target, options); this.social?.syncPopulation(); return result; }
  enableSocial(options = {}) { if (!this.social) this.social = new SocialController(this, options); return this.social; }
  setSocialExhibits(records) { return this.enableSocial().setExhibits(records); }
  updateObstacles(proxies, options) { return replaceObstacles(this, proxies, options); }
  inTransitionCorridor(position, radius, height) { return corridorContains(this, position, radius, height); }
  addElevator(definition) { const elevator = this.world.addElevator(definition); const controller = new ElevatorController(elevator, this); this.elevators.set(elevator.id, controller); this.controllers.push(controller); this.transitionCorridors = null; return controller; }
  releaseDestination(agent) { if (agent.reservation) { this.reservations.delete(agent.reservation); agent.reservation = null; } }
  reserveDestination(agent, target) {
    if (!target.id) return { ...target, position: xyz(target.position, this.world.floor(target.floorId).elevation) };
    const slots = target.slots?.length ? target.slots.map(p => xyz(p, this.world.floor(target.floorId).elevation)) : [target.position];
    const available = slots.map((position, index) => ({ position, index, key: `${target.id}:${index}` }))
      .filter(s => !this.reservations.has(s.key)).sort((a, b) => distanceXZ(a.position, agent.position) - distanceXZ(b.position, agent.position));
    if (!available.length) return null;
    const slot = available[0]; this.reservations.set(slot.key, agent.id); agent.reservation = slot.key;
    return { ...target, position: slot.position, slotIndex: slot.index };
  }
  setDestination(id, destination) {
    const agent = this.agents.get(String(id)); if (!agent) throw new Error(`Unknown agent ${id}`);
    if (agent.transit || agent.activity === 'elevator_ride') { agent.pendingAfterTransition = destination; return { ok: false, reason: 'queued_until_transition_exit', queued: true }; }
    const target = typeof destination === 'string' ? this.world.destinations.get(destination) : destination;
    if (!target) return { ok: false, reason: 'unknown_destination' };
    for (const controller of this.controllers) controller.cancel(agent.id);
    agent.queuePath = null; agent.queueReady = false; agent.elevatorId = null;
    this.releaseDestination(agent);
    const reserved = this.reserveDestination(agent, target);
    agent.goal = destination; agent.pendingDestination = null;
    if (!reserved) { agent.pendingDestination = destination; agent.activity = 'destination_wait'; agent.activePath = null; return { ok: false, reason: 'destination_slots_busy', queued: true }; }
    this.metrics.routePlans++;
    const route = this.world.planRoute(agent, reserved, agent.radius, { accessibleOnly: agent.accessibleOnly, allowedTransitions: agent.allowedTransitions });
    agent.routeRevision = this.world.revision;
    if (!route.ok) { this.releaseDestination(agent); agent.activity = 'blocked'; agent.activePath = null; agent.pendingDestination = destination; agent.wanderAfter = this.time + 1 + agent.random() * 2; this.emit('route_unreachable', { agentId: agent.id, reason: route.reason }); return route; }
    agent.route = route; agent.routeIndex = 0; agent.blockedSeconds = 0; this.beginSegment(agent); return route;
  }
  beginSegment(agent) {
    const segment = agent.route?.segments[agent.routeIndex];
    if (!segment) {
      agent.activity = 'idle'; agent.activePath = null; agent.velocity = { x: 0, z: 0 };
      const target = agent.route?.target, dwell = agent.dwellSeconds ?? target?.dwellSeconds ?? [5, 12];
      agent.idleUntil = this.time + (Array.isArray(dwell) ? dwell[0] + agent.random() * (dwell[1] - dwell[0]) : dwell);
      this.emit('destination_arrive', { agentId: agent.id, destinationId: target?.id, floorId: agent.floorId }); return;
    }
    if (segment.kind === 'walk') { if (agent.activity !== 'walk') agent.walkSince = this.time; agent.activity = 'walk'; agent.activePath = { points: segment.points, waypoint: 1 }; }
    else if (segment.kind === 'stairs') { agent.activePath = null; this.stairs.get(segment.id).request(agent, segment); }
    else if (segment.kind === 'elevator') { agent.activePath = null; this.elevators.get(segment.id).request(agent, segment); }
  }
  finishSegment(agent) {
    agent.transit = null; agent.activePath = null; agent.routeIndex++;
    if (agent.pendingAfterTransition && agent.floorId !== null) { const target = agent.pendingAfterTransition; agent.pendingAfterTransition = null; this.setDestination(agent.id, target); }
    else this.beginSegment(agent);
  }
  startTransit(agent, points, options) {
    const vertices = points.map(p => xyz(p)); if (distance3(agent.position, vertices[0]) > EPS) vertices.unshift(copy(agent.position));
    agent.transit = { ...options, path: makePolyline(vertices), progress: 0, landingIndex: 0, pausedUntil: 0 };
    agent.activity = options.kind; agent.activePath = null; agent.velocity = { x: 0, z: 0 };
  }
  requestCrossingClosure(id) {
    const crossing = this.world.crossings.get(String(id)); if (!crossing) throw new Error(`Unknown crossing ${id}`);
    if (crossing.state === 'open') {
      crossing.state = 'closing'; crossing.clearSince = null;
      crossing.allowedExitIds = new Set(this.order.filter(a => a.floorId === crossing.floorId && this.world.crossingOccupancy(a.position, a.radius, crossing)).map(a => a.id));
      this.world.invalidate(); this.emit('crossing_closing', { crossingId: crossing.id, occupants: crossing.allowedExitIds.size });
    }
    return { state: crossing.state, readyForTram: crossing.state === 'closed' };
  }
  openCrossing(id) {
    const c = this.world.crossings.get(String(id)); if (!c) throw new Error(`Unknown crossing ${id}`);
    c.state = 'open'; c.clearSince = null; c.allowedExitIds = new Set(); this.world.invalidate(); this.emit('crossing_open', { crossingId: c.id });
  }
  ignoreCrossings(agent) { return [...this.world.crossings.values()].filter(c => c.allowedExitIds?.has(agent.id)).map(c => c.id); }
  updateCrossings() {
    for (const c of this.world.crossings.values()) if (c.state === 'closing') {
      const occupants = this.order.filter(a => a.floorId === c.floorId && this.world.crossingOccupancy(a.position, a.radius, c));
      for (const id of c.allowedExitIds || []) if (!occupants.some(a => a.id === id)) c.allowedExitIds.delete(id);
      if (occupants.length) c.clearSince = null;
      else if (c.clearSince === null) c.clearSince = this.time;
      else if (this.time - c.clearSince >= (c.clearanceSeconds ?? .8)) { c.state = 'closed'; this.emit('crossing_closed', { crossingId: c.id, readyForTram: true }); }
    }
  }
  serviceGoals() {
    let plans = 0;
    // Round-robin service prevents a blocked group at the start of the array
    // from consuming every planning slot in a 2200-person population.
    for (let visited = 0; visited < this.order.length; visited++) {
      if (plans >= (this.options.maxRoutePlansPerStep || 4)) break;
      const agent = this.order[this.goalCursor++ % this.order.length];
      if (agent.activity === 'route_pending' && agent.pendingDestination) { this.setDestination(agent.id, agent.pendingDestination); plans++; }
      else if (agent.activity === 'destination_wait' && agent.pendingDestination) {
        const target = typeof agent.pendingDestination === 'string' ? this.world.destinations.get(agent.pendingDestination) : agent.pendingDestination;
        const capacity = target.slots?.length || 1;
        if (Array.from({ length: capacity }, (_, i) => `${target.id}:${i}`).some(k => !this.reservations.has(k))) { this.setDestination(agent.id, agent.pendingDestination); plans++; }
      } else if (agent.activity === 'blocked' && agent.pendingDestination && agent.routeRevision !== this.world.revision) { this.setDestination(agent.id, agent.pendingDestination); plans++; }
      else if (agent.activity === 'blocked' && agent.autoWander && this.time >= agent.wanderAfter) {
        agent.wanderAfter = this.time + 2;
        const targets = localItinerary(this, agent.floorId, agent.position, agent.radius, `${agent.id}:${this.tick}`);
        if (targets.length) { this.setDestination(agent.id, targets[0]); this.emit('autonomous_detour', { agentId: agent.id }); }
        plans++;
      }
      else if (agent.activity === 'walk' && agent.autoWander && this.time - Math.max(agent.progressTime, agent.walkSince) > 5 && this.time >= agent.escapeRetryAt) {
        agent.escapeRetryAt = this.time + 3;
        const target = agent.activePath?.points[agent.activePath.waypoint];
        const heading = target ? Math.atan2(target.z - agent.position.z, target.x - agent.position.x) + Math.PI : agent.random() * Math.PI * 2;
        let alternative;
        for (const distance of [2, 3.5, 1.1]) {
          for (const offset of [0, .4, -.4, .8, -.8, 1.2, -1.2, 1.6, -1.6, 2.2, -2.2, Math.PI]) {
            const position = { x: agent.position.x + Math.cos(heading + offset) * distance, y: agent.position.y, z: agent.position.z + Math.sin(heading + offset) * distance };
            if (this.inTransitionCorridor(position, agent.radius, agent.height) || !this.world.segmentAllowed(agent.floorId, agent.position, position, agent.radius)) continue;
            if (this.clearApproach(agent, agent.floorId, position)) { alternative = { floorId: agent.floorId, position, dwellSeconds: .5 }; break; }
          }
          if (alternative) break;
        }
        if (alternative) {
          const stalledSeconds = this.time - agent.progressTime;
          this.setDestination(agent.id, alternative); this.emit('autonomous_yield', { agentId: agent.id, stalledSeconds });
        }
        plans++;
      }
      else if (agent.activity === 'idle' && !agent.socialHold && agent.itinerary.length && this.time >= agent.idleUntil) {
        const next = agent.itineraryIndex + 1;
        if (next < agent.itinerary.length || agent.repeat) { agent.itineraryIndex = next % agent.itinerary.length; this.setDestination(agent.id, agent.itinerary[agent.itineraryIndex]); plans++; }
        else agent.idleUntil = Infinity;
      } else if ((agent.activity === 'walk' || agent.activity === 'elevator_queue' || agent.activity === 'stair_queue')
        && agent.blockedSeconds > 1.2 && this.time >= (agent.nextRecoveryTime || 0) && !this.ignoreCrossings(agent).length) {
        // Local avoidance can leave a walker beside a corner even when the CAD
        // mask itself has not changed. Replan from the accepted current position;
        // keeping the stale waypoint would otherwise pin the walker indefinitely.
        agent.nextRecoveryTime = this.time + 1;
        const path = agent.activity === 'walk' ? agent.activePath : agent.queuePath;
        if (path && this.recoverLocalPath(agent, path)) {
          this.emit('local_detour', { agentId: agent.id, blockedSeconds: agent.blockedSeconds });
        } else if (agent.activity === 'walk') {
          this.emit('stalled_route_replan', { agentId: agent.id, blockedSeconds: agent.blockedSeconds });
          this.setDestination(agent.id, agent.goal);
        }
        plans++;
      }
    }
  }
  recoverLocalPath(agent, path) {
    const floor = this.world.floor(agent.floorId), target = path.points[path.waypoint];
    if (!floor.grid || !target) return false;
    const neighbours = this.occupancy.query(agent.position, 5).filter(other => other !== agent
      && verticalOverlap(agent, agent.position, other, other.position)
      && distanceXZ(agent.position, other.position) < 5);
    if (!neighbours.length) return false;
    // Route around the actual occupied body positions, rather than repeatedly
    // choosing the same static path through an immovable queue or lift transfer.
    // This changes only future waypoints; the agent still moves continuously.
    const pointOK = p => this.world.pointAllowed(agent.floorId, p, agent.radius)
      && neighbours.every(other => distanceXZ(p, other.position) >= agent.radius + other.radius + .00001);
    const segmentOK = (p, q) => this.world.segmentAllowed(agent.floorId, p, q, agent.radius)
      && neighbours.every(other => pointSegmentDistance(other.position, p, q) >= agent.radius + other.radius + .00001);
    const detour = floor.grid.findPath(agent.position, target, { radius: agent.radius, pointAllowed: pointOK, segmentAllowed: segmentOK, maskOnly: false });
    if (!detour) return false;
    path.points = [...detour, ...path.points.slice(path.waypoint + 1)]; path.waypoint = 1;
    return true;
  }
  clearApproach(agent, floorId, target, allowDetour = false) {
    const floor = this.world.floor(floorId), path = this.world.floorPath(floorId, agent.position, target, agent.radius);
    if (!path) return null;
    const reach = path.length + this.maxRadius + 1;
    const neighbours = this.occupancy.query(agent.position, reach).filter(other => other !== agent && verticalOverlap(agent, agent.position, other, other.position));
    const pointOK = point => this.world.pointAllowed(floorId, point, agent.radius)
      && neighbours.every(other => distanceXZ(point, other.position) >= agent.radius + other.radius + this.contactMargin - 1e-6);
    const segmentOK = (a, b) => this.world.segmentAllowed(floorId, a, b, agent.radius)
      && neighbours.every(other => pointSegmentDistance(other.position, a, b) >= agent.radius + other.radius + this.contactMargin - 1e-6);
    if (path.points.every((point, index) => !index || segmentOK(path.points[index - 1], point))) return path;
    if (!allowDetour || !floor.grid || !pointOK(target)) return null;
    const points = floor.grid.findPath(agent.position, target, { radius: agent.radius, pointAllowed: pointOK, segmentAllowed: segmentOK, maskOnly: false });
    return points ? { points, length: points.slice(1).reduce((sum, point, i) => sum + distance3(points[i], point), 0) } : null;
  }
  floorCandidate(agent, path, dt) {
    while (path.waypoint < path.points.length && distanceXZ(agent.position, path.points[path.waypoint]) < .015) path.waypoint++;
    if (path.waypoint >= path.points.length) {
      if (path.queueKind) { agent.queueReady = true; agent.activity = `${path.queueKind}_wait`; agent.queuePath = null; }
      else this.finishSegment(agent);
      return { position: copy(agent.position), movable: false, walking: false };
    }
    const target = path.points[path.waypoint], dx = target.x - agent.position.x, dz = target.z - agent.position.z, distance = Math.hypot(dx, dz);
    const nextSegment = agent.route?.segments[agent.routeIndex + 1];
    if (!path.queueKind && path.waypoint === path.points.length - 1 && distance < (this.options.transitionQueueDistance || 1.8)
      && (nextSegment?.kind === 'stairs' || nextSegment?.kind === 'elevator')) {
      // Reserve separate waiting positions before everyone converges on one
      // doorway. Actual boarding/ascending still traverses the complete path.
      this.finishSegment(agent); return { position: copy(agent.position), movable: false, walking: false };
    }
    let speed = Math.min(agent.maxSpeed * (path.queueKind ? 1 : agent.socialSpeedFactor || 1), Math.sqrt(2 * agent.acceleration * distance));
    let vx = dx / (distance || 1) * speed, vz = dz / (distance || 1) * speed;
    const desired = { x: vx, z: vz };
    const near = this.hash.query(agent.position, 1.7 + agent.radius);
    for (const other of near) {
      if (agent === other || !verticalOverlap(agent, agent.position, other, other.position)) continue;
      this.metrics.neighbourChecks++;
      const rx = agent.position.x - other.position.x, rz = agent.position.z - other.position.z, separation = Math.hypot(rx, rz);
      const rvx = vx - other.velocity.x, rvz = vz - other.velocity.z;
      const t = clamp(-(rx * rvx + rz * rvz) / (rvx * rvx + rvz * rvz || 1), 0, .9);
      const predicted = Math.hypot(rx + rvx * t, rz + rvz * t), safe = agent.radius + other.radius + .14;
      if (predicted < safe || separation < safe + .24) {
        const pressure = clamp((safe + .35 - separation) / (safe + .35), 0, 1);
        const avoidance = (predicted < safe ? .7 : 0) + pressure;
        // Each person keeps to their own right. Opposing streams choose opposite
        // physical sides; the final swept-disc solver remains authoritative.
        vx += (desired.z / (speed || 1) * .7 + rx / (separation || 1) * pressure) * avoidance * agent.maxSpeed;
        vz += (-desired.x / (speed || 1) * .7 + rz / (separation || 1) * pressure) * avoidance * agent.maxSpeed;
      }
    }
    const magnitude = Math.hypot(vx, vz); if (magnitude > agent.maxSpeed) { vx *= agent.maxSpeed / magnitude; vz *= agent.maxSpeed / magnitude; }
    const dvx = vx - agent.velocity.x, dvz = vz - agent.velocity.z, dv = Math.hypot(dvx, dvz), change = agent.acceleration * dt;
    if (dv > change) { vx = agent.velocity.x + dvx * change / dv; vz = agent.velocity.z + dvz * change / dv; }
    // Contact half-planes remove inward velocity before taking a step while
    // preserving tangential movement. This avoids freezing both participants
    // merely because a later position correction would exceed maxSpeed.
    for (let pass = 0; pass < 3; pass++) for (const other of near) {
      if (other === agent || !verticalOverlap(agent, agent.position, other, other.position)) continue;
      const rx = agent.position.x - other.position.x, rz = agent.position.z - other.position.z, separation = Math.hypot(rx, rz);
      const gap = separation - agent.radius - other.radius - this.contactMargin - .015;
      if (gap > .25 || separation < EPS) continue;
      const nx = rx / separation, nz = rz / separation;
      const bound = other.velocity.x * nx + other.velocity.z * nz - gap / (2 * dt);
      const dot = vx * nx + vz * nz;
      if (dot < bound) { vx += nx * (bound - dot); vz += nz * (bound - dot); }
    }
    const constrainedSpeed = Math.hypot(vx, vz);
    if (constrainedSpeed > agent.maxSpeed) { vx *= agent.maxSpeed / constrainedSpeed; vz *= agent.maxSpeed / constrainedSpeed; }
    let candidate = { x: agent.position.x + vx * dt, y: agent.position.y, z: agent.position.z + vz * dt };
    if (distance < Math.max(agent.maxSpeed * dt, .02)) candidate = copy(target);
    const allowed = p => this.world.segmentAllowed(agent.floorId, agent.position, p, agent.radius, this.ignoreCrossings(agent));
    if (!allowed(candidate)) {
      const xOnly = { x: candidate.x, y: candidate.y, z: agent.position.z }, zOnly = { x: agent.position.x, y: candidate.y, z: candidate.z };
      if (allowed(xOnly) && Math.abs(vx) > EPS) candidate = xOnly;
      else if (allowed(zOnly)) candidate = zOnly;
      else candidate = copy(agent.position);
    }
    return { position: candidate, movable: true, walking: true };
  }
  transitCandidate(agent, dt) {
    const transit = agent.transit;
    if (this.time < transit.pausedUntil) return { position: copy(agent.position), movable: false, walking: false, nextProgress: transit.progress };
    const landing = transit.landings?.[transit.landingIndex];
    const nextProgress = Math.min(transit.path.length, transit.progress + transit.speed * dt, landing ? landing.distance : Infinity);
    return { position: samplePolyline(transit.path, nextProgress), movable: false, walking: true, nextProgress };
  }
  solveContacts(proposals, oldPositions) {
    const pairs = [], adjacency = new Map();
    let maximumTravel = 0;
    for (const agent of this.order) maximumTravel = Math.max(maximumTravel, distance3(oldPositions.get(agent.id), proposals.get(agent.id).position), agent.maxSpeed * this.fixedStep);
    this.hash.clear(); for (const agent of this.order) this.hash.insert(agent, oldPositions.get(agent.id));
    for (let i = 0; i < this.order.length; i++) {
      const a = this.order[i], pa = proposals.get(a.id);
      for (const b of this.hash.query(oldPositions.get(a.id), a.radius + this.maxRadius + this.contactMargin + maximumTravel * 2)) {
        if (a.ordinal >= b.ordinal) continue;
        const pb = proposals.get(b.id), oa = oldPositions.get(a.id), ob = oldPositions.get(b.id);
        const reach = a.radius + b.radius + this.contactMargin + maximumTravel * 2;
        if ((oa.x - ob.x) ** 2 + (oa.z - ob.z) ** 2 > reach * reach) continue;
        if (Math.min(oa.y, pa.position.y) >= Math.max(ob.y, pb.position.y) + b.height - EPS
          || Math.min(ob.y, pb.position.y) >= Math.max(oa.y, pa.position.y) + a.height - EPS) continue;
        const index = pairs.length; pairs.push([a, b]);
        if (!adjacency.has(a.id)) adjacency.set(a.id, []); if (!adjacency.has(b.id)) adjacency.set(b.id, []);
        adjacency.get(a.id).push(index); adjacency.get(b.id).push(index);
      }
    }
    this.metrics.contactPairs = (this.metrics.contactPairs || 0) + pairs.length;
    const constrainedPlacement = (a, p) => {
      if (a.floorId === null) return null;
      const old = oldPositions.get(a.id), distance = distance3(old, p), maximum = a.maxSpeed * this.fixedStep;
      if (distance > maximum) p = { x: old.x + (p.x - old.x) * maximum / distance, y: old.y, z: old.z + (p.z - old.z) * maximum / distance };
      return this.world.segmentAllowed(a.floorId, old, p, a.radius, this.ignoreCrossings(a)) ? p : null;
    };
    for (let iteration = 0; iteration < 4; iteration++) {
      let changed = false;
      for (const [a, b] of pairs) {
        const pa = proposals.get(a.id), pb = proposals.get(b.id), required = a.radius + b.radius + this.contactMargin;
        const dx = pa.position.x - pb.position.x, dz = pa.position.z - pb.position.z, distance = Math.hypot(dx, dz);
        if (distance >= required - EPS) continue;
        const nx = distance > EPS ? dx / distance : (a.ordinal % 2 ? 1 : -1), nz = distance > EPS ? dz / distance : 0;
        const wa = pa.movable ? 1 : 0, wb = pb.movable ? 1 : 0, sum = wa + wb; if (!sum) continue;
        const gap = required - distance + 1e-6;
        const qa = { ...pa.position, x: pa.position.x + nx * gap * wa / sum, z: pa.position.z + nz * gap * wa / sum };
        const qb = { ...pb.position, x: pb.position.x - nx * gap * wb / sum, z: pb.position.z - nz * gap * wb / sum };
        const placedA = wa && constrainedPlacement(a, qa), placedB = wb && constrainedPlacement(b, qb);
        if (placedA) { pa.position = placedA; changed = true; }
        if (placedB) { pb.position = placedB; changed = true; }
      }
      if (!changed) break;
    }
    // Conservative rollback prevents both endpoint overlap and crossing through a
    // neighbour within a step. Transit actors are never pushed off their path.
    // A stopped proposal can only affect adjacent contact pairs. Each proposal
    // rolls back at most once, so a dense crowd does not trigger N whole scans.
    const work = pairs.map((_, i) => i), queued = new Set(work);
    const stop = agent => {
      const proposal = proposals.get(agent.id);
      if (distance3(oldPositions.get(agent.id), proposal.position) <= EPS) return;
      proposal.position = copy(oldPositions.get(agent.id)); proposal.cancelled = true;
      for (const pair of adjacency.get(agent.id) || []) if (!queued.has(pair)) { queued.add(pair); work.push(pair); }
    };
    for (let cursor = 0; cursor < work.length; cursor++) {
        const pairIndex = work[cursor]; queued.delete(pairIndex); const [a, b] = pairs[pairIndex];
        const pa = proposals.get(a.id), pb = proposals.get(b.id), required = a.radius + b.radius + this.contactMargin;
        const oa = oldPositions.get(a.id), ob = oldPositions.get(b.id);
        if (Math.min(oa.y, pa.position.y) >= Math.max(ob.y, pb.position.y) + b.height - EPS
          || Math.min(ob.y, pb.position.y) >= Math.max(oa.y, pa.position.y) + a.height - EPS) continue;
        if (sweptAgentDistance(oldPositions.get(a.id), pa.position, oldPositions.get(b.id), pb.position) >= required - 1e-6) continue;
        const movedA = distance3(oldPositions.get(a.id), pa.position) > EPS, movedB = distance3(oldPositions.get(b.id), pb.position) > EPS;
        if (!movedA && !movedB) continue;
        // If one proposal is unsafe only because both bodies move at once,
        // let the floor walker clear the corridor while the serialized transfer
        // pauses. Rolling back BOTH forever traps an alighting walker directly
        // in front of a boarding passenger even when a safe side-step exists.
        const stopFirst = a.transit && !b.transit ? [a, b] : b.transit && !a.transit ? [b, a] : a.ordinal > b.ordinal ? [a, b] : [b, a];
        let yielded = false;
        for (const stopped of stopFirst) {
          const moving = stopped === a ? b : a;
          const ps = proposals.get(stopped.id), pm = proposals.get(moving.id);
          if (distance3(oldPositions.get(moving.id), pm.position) <= EPS) continue;
          if (sweptAgentDistance(oldPositions.get(stopped.id), oldPositions.get(stopped.id), oldPositions.get(moving.id), pm.position) < required - 1e-6) continue;
          stop(stopped); yielded = true; this.metrics.collisionStops++; break;
        }
        if (yielded) continue;
        stop(a); stop(b); this.metrics.collisionStops++;
    }
  }
  step() {
    const dt = this.fixedStep; this.tick++; this.time = this.tick * dt; this.metrics.steps++;
    const oldPositions = new Map();
    for (const a of this.order) { a.previousPosition = copy(a.position); oldPositions.set(a.id, copy(a.position)); }
    this.social?.tick(dt);
    this.updateCrossings(); this.serviceGoals();
    for (const controller of this.stairs.values()) controller.update(dt);
    for (const controller of this.elevators.values()) { controller.update(dt); this.metrics.maxElevatorOccupancy = Math.max(this.metrics.maxElevatorOccupancy, controller.passengers.size); }
    this.hash.clear(); for (const a of this.order) this.hash.insert(a);
    const proposals = new Map();
    for (const a of this.order) {
      let proposal;
      if (a.transit) proposal = this.transitCandidate(a, dt);
      else if (a.activePath && a.activity === 'walk') proposal = this.floorCandidate(a, a.activePath, dt);
      else if (a.queuePath && (a.activity === 'elevator_queue' || a.activity === 'stair_queue')) proposal = this.floorCandidate(a, a.queuePath, dt);
      else proposal = { position: copy(a.position), movable: false, walking: false };
      proposals.set(a.id, proposal);
    }
    this.solveContacts(proposals, oldPositions);
    for (const a of this.order) {
      const proposal = proposals.get(a.id), old = oldPositions.get(a.id); a.position = proposal.position;
      const walked = proposal.walking ? distance3(old, a.position) : 0;
      if (distanceXZ(a.progressPosition, a.position) >= .25) { a.progressPosition = copy(a.position); a.progressTime = this.time; }
      a.speed = walked / dt; a.velocity = { x: (a.position.x - old.x) / dt, z: (a.position.z - old.z) / dt };
      a.animationTime += dt;
      if (walked > EPS) {
        a.locomotionDistance += walked; a.gaitCycles += walked / a.strideMeters;
        const target = Math.atan2(a.velocity.x, a.velocity.z), delta = Math.atan2(Math.sin(target - a.yaw), Math.cos(target - a.yaw));
        a.yaw += clamp(delta, -(this.options.turnRate || 3) * dt, (this.options.turnRate || 3) * dt); a.blockedSeconds = 0;
      } else if (proposal.walking) a.blockedSeconds += dt;
      if (a.transit && proposal.nextProgress !== undefined && !proposal.cancelled) {
        const transit = a.transit; transit.progress = proposal.nextProgress;
        const landing = transit.landings?.[transit.landingIndex];
        if (landing && Math.abs(transit.progress - landing.distance) < 1e-7 && this.time >= transit.pausedUntil) {
          transit.landingIndex++; transit.pausedUntil = this.time + landing.waitSeconds;
          this.emit('stair_landing', { agentId: a.id, transitionId: transit.transitionId, y: a.position.y, pauseSeconds: landing.waitSeconds });
        }
        if (transit.progress >= transit.path.length - EPS) { a.transit = null; transit.onFinish?.(); }
      }
      this.occupancy.insert(a);
    }
    return this;
  }
  update(elapsedSeconds) {
    if (!(elapsedSeconds >= 0) || !Number.isFinite(elapsedSeconds)) throw new Error('Elapsed time must be a finite nonnegative number');
    const accepted = Math.min(elapsedSeconds, this.maxFrameDelta); this.droppedTime += elapsedSeconds - accepted; this.accumulator += accepted;
    let steps = 0; while (this.accumulator + EPS >= this.fixedStep && steps < this.maxSubSteps) { this.step(); this.accumulator -= this.fixedStep; steps++; }
    if (steps === this.maxSubSteps && this.accumulator >= this.fixedStep) { const dropped = Math.floor(this.accumulator / this.fixedStep) * this.fixedStep; this.droppedTime += dropped; this.accumulator -= dropped; }
    return { steps, interpolationAlpha: clamp(this.accumulator / this.fixedStep, 0, 1), droppedTime: this.droppedTime };
  }
  agentSnapshot(agentOrId) {
    const a = typeof agentOrId === 'object' ? agentOrId : this.agents.get(String(agentOrId));
    return { id: a.id, position: copy(a.position), previousPosition: copy(a.previousPosition), floorId: a.floorId, yaw: a.yaw, speed: a.speed, activity: a.activity,
      gaitPhase: ((a.gaitCycles % 1) + 1) % 1, gaitCycles: a.gaitCycles, strideMeters: a.strideMeters, locomotionDistance: a.locomotionDistance,
      animationTime: a.animationTime, transitionId: a.transit?.transitionId || a.elevatorId || null, destinationId: a.route?.target?.id || null,
      social: a.social ? { ...a.social, lookAt: a.social.lookAt ? copy(a.social.lookAt) : null } : null };
  }
  snapshot() { return { time: this.time, tick: this.tick, agents: this.order.map(a => this.agentSnapshot(a)), stairs: [...this.stairs.values()].map(s => s.snapshot()), elevators: [...this.elevators.values()].map(e => e.snapshot()), crossings: [...this.world.crossings.values()].map(c => ({ id: c.id, state: c.state, readyForTram: c.state === 'closed' })), metrics: { ...this.metrics } }; }
}
