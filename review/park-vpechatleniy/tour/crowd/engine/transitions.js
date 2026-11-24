import { xyz, distance3, distanceXZ, pointSegmentDistance, makePolyline, clamp } from './geometry.js';
import { elevatorSlotFits } from './world.js';

export class StairController {
  constructor(definition, simulation) { this.definition = definition; this.sim = simulation; this.queue = []; this.occupants = new Map(); this.direction = 0; }
  request(agent, segment) {
    if (this.queue.some(q => q.id === agent.id) || this.occupants.has(agent.id)) return;
    const path = segment.direction > 0 ? this.definition.path.points : [...this.definition.path.points].reverse();
    const entry = path[0], next = path[1], length = distanceXZ(entry, next) || 1;
    const forward = { x: (next.x - entry.x) / length, z: (next.z - entry.z) / length };
    const side = { x: -forward.z, z: forward.x };
    const authored = this.definition.queueSlots?.[segment.direction > 0 ? 'from' : 'to'];
    const candidates = authored?.map(p => xyz(p, entry.y)) || [[.8, -.45], [-.8, -.45], [0, -.95], [1.1, -.8], [-1.1, -.8], [0, -1.4]].map(([s, f]) => ({ x: entry.x + side.x * s + forward.x * f, y: entry.y, z: entry.z + side.z * s + forward.z * f }));
    if (!authored) {
      if (distanceXZ(agent.position, entry) >= agent.radius * 2 + .2) candidates.unshift({ ...agent.position });
      for (const radius of [.8, 1.1, 1.5]) for (let i = 0; i < 16; i++) candidates.push({ x: entry.x + Math.cos(i * Math.PI / 8) * radius, y: entry.y, z: entry.z + Math.sin(i * Math.PI / 8) * radius });
    }
    let queuePoint, queuePath;
    for (const candidate of candidates) {
      if (this.queue.some(q => q.queuePoint && distance3(q.queuePoint, candidate) < agent.radius + (this.sim.agents.get(q.id)?.radius || agent.radius) + .15)) continue;
      const route = this.sim.world.floorPath(segment.fromFloor, agent.position, candidate, agent.radius);
      if (route && distanceXZ(candidate, entry) >= agent.radius * 2 + .2) { queuePoint = candidate; queuePath = route.points; break; }
    }
    if (!queuePath) {
      agent.activity = 'blocked'; agent.pendingDestination = agent.goal;
      this.sim.emit('stair_queue_geometry_missing', { agentId: agent.id, stairId: this.definition.id }); return;
    }
    this.queue.push({ id: agent.id, segment, queuePoint }); agent.activity = 'stair_queue';
    agent.queueReady = false; agent.queuePath = { points: queuePath, waypoint: 1, queueKind: 'stair' };
    this.sim.emit('stair_queue', { agentId: agent.id, stairId: this.definition.id });
  }
  update() {
    const def = this.definition, sim = this.sim;
    this.queue = this.queue.filter(q => sim.agents.has(q.id));
    this.queue = this.queue.filter(ticket => {
      const agent = sim.agents.get(ticket.id);
      if (!agent.queueReady || ticket.checkedRevision === sim.world.revision) return true;
      ticket.checkedRevision = sim.world.revision;
      const entry = ticket.segment.direction > 0 ? def.path.points[0] : def.path.points.at(-1);
      if (sim.world.floorPath(agent.floorId, agent.position, entry, agent.radius)) return true;
      agent.queueReady = false; agent.queuePath = null; agent.activePath = null; agent.route = null;
      agent.pendingDestination = agent.goal; agent.activity = 'route_pending'; sim.releaseDestination(agent);
      sim.emit('queue_geometry_invalidated', { agentId: agent.id, stairId: def.id, revision: sim.world.revision }); return false;
    });
    if (!this.queue.length) return;
    if (!this.occupants.size) this.direction = this.queue[0].segment.direction;
    // A narrow staircase is one reserved stream, not two intersecting centre lines.
    const oppositeWaiting = this.queue.some(q => q.segment.direction !== this.direction);
    if (oppositeWaiting && this.occupants.size) return;
    if (this.occupants.size >= (def.maxOccupants || 8)) return;
    // Queue-to-stair approaches can converge from different sides. Reserve the
    // entry until its previous walker is beyond the first body-length of stair;
    // admitting both on immutable transit polylines can deadlock at the merge.
    for (const id of this.occupants.keys()) {
      const entering = sim.agents.get(id), transit = entering?.transit;
      if (transit && transit.progress < (transit.entryLength || 0) + entering.radius + sim.maxRadius + .25) return;
    }
    const ready = this.queue.map((request, index) => ({ request, index, agent: sim.agents.get(request.id) }))
      .filter(item => item.request.segment.direction === this.direction && item.agent?.queueReady);
    if (!ready.length) return;
    const points = this.direction > 0 ? def.path.points : [...def.path.points].reverse();
    let selected;
    for (const item of ready) {
      const approach = sim.clearApproach(item.agent, item.request.segment.fromFloor, points[0]);
      if (approach) { selected = { ...item, approach }; break; }
    }
    if (!selected && sim.time >= (this.nextApproachRetry || 0)) {
      this.nextApproachRetry = sim.time + .5;
      for (const item of ready) {
        const approach = sim.clearApproach(item.agent, item.request.segment.fromFloor, points[0], true);
        if (approach) { selected = { ...item, approach }; break; }
      }
    }
    if (!selected) return;
    const { index, request, agent, approach } = selected;
    this.queue.splice(index, 1); this.occupants.set(agent.id, this.direction); agent.queuePath = null; agent.queueReady = false;
    const approachLength = approach.length;
    const landings = (def.landings || []).map(l => ({
      distance: approachLength + (this.direction > 0 ? def.path.cumulative[l.index] : def.path.length - def.path.cumulative[l.index]),
      waitSeconds: l.waitSeconds ?? .35
    })).filter(l => l.distance > approachLength && l.distance < def.path.length + approachLength).sort((a, b) => a.distance - b.distance);
    sim.startTransit(agent, [...approach.points.slice(0, -1), ...points], {
      kind: 'stairs', transitionId: def.id, speed: agent.maxSpeed * (def.speedFactor || .65), landings, entryLength: approachLength,
      onFinish: () => {
        this.occupants.delete(agent.id); agent.floorId = request.segment.toFloor;
        sim.emit('stair_exit', { agentId: agent.id, stairId: def.id, floorId: agent.floorId }); sim.finishSegment(agent);
      }
    });
    sim.emit('stair_enter', { agentId: agent.id, stairId: def.id, direction: this.direction });
  }
  cancel(id) { this.queue = this.queue.filter(q => q.id !== id); this.occupants.delete(id); }
  cancelMany(ids) { this.queue = this.queue.filter(q => !ids.has(q.id)); for (const id of ids) this.occupants.delete(id); }
  snapshot() { return { id: this.definition.id, direction: this.direction, queued: this.queue.length, occupants: this.occupants.size }; }
}

export class ElevatorController {
  constructor(definition, simulation) {
    this.definition = definition; this.sim = simulation;
    this.currentFloor = String(definition.initialFloor || definition.stops[0].floorId);
    this.carY = this.stop(this.currentFloor).elevation; this.state = 'closed'; this.doorFraction = 0;
    this.targetFloor = null; this.timer = 0; this.passengers = new Map(); this.queues = new Map(definition.stops.map(s => [s.floorId, []]));
    this.activeTransfer = null; this.sequence = 0; this.boardingSince = 0;
  }
  stop(floorId) { const s = this.definition.stops.find(s => s.floorId === String(floorId)); if (!s) throw new Error(`Elevator ${this.definition.id}: unknown stop ${floorId}`); return s; }
  slotPosition(index, y = this.carY) { const p = this.definition.slots[index]; return { x: this.definition.shaft.x + p.x, y, z: this.definition.shaft.z + p.z }; }
  request(agent, segment) {
    if (this.passengers.has(agent.id) || [...this.queues.values()].some(q => q.some(t => t.id === agent.id))) return;
    this.queues.get(segment.fromFloor).push({ id: agent.id, toFloor: segment.toFloor, sequence: this.sequence++, slot: null });
    agent.activity = 'elevator_wait'; agent.elevatorId = this.definition.id;
    this.assignQueueSlots(segment.fromFloor);
    if (this.queues.get(segment.fromFloor).some(ticket => ticket.id === agent.id)) this.sim.emit('elevator_queue', { agentId: agent.id, elevatorId: this.definition.id, fromFloor: segment.fromFloor, toFloor: segment.toFloor });
  }
  assignQueueSlots(floorId) {
    const queue = this.queues.get(floorId), stop = this.stop(floorId), used = new Set(queue.filter(t => t.slot !== null).map(t => t.slot)), overflow = new Set();
    queue.sort((a, b) => a.sequence - b.sequence);
    for (const ticket of queue) {
      const agent = this.sim.agents.get(ticket.id); if (!agent) continue;
      if (ticket.slot !== null && (!agent.queueReady || this.activeTransfer)) continue;
      const transfer = this.activeTransfer && this.sim.agents.get(this.activeTransfer);
      const transferPoints = transfer?.transit?.path.points;
      const all = stop.queueSlots.map((position, i) => ({ position, i, distance: distanceXZ(position, stop.lobby) }));
      // Leave a two-body circulation strip around the lobby when authored
      // places farther out exist. Front tickets then advance toward the nearest
      // free place in that safe zone; newcomers cannot repeatedly overtake them.
      const outsideCirculation = all.filter(candidate => candidate.distance >= agent.radius * 4);
      const eligible = outsideCirculation.length ? outsideCirculation : all;
      const available = eligible.filter(({ position, i }) => !used.has(i)
        && queue.every(other => other.id === ticket.id || other.slot === null || distanceXZ(position, stop.queueSlots[other.slot]) >= agent.radius + (this.sim.agents.get(other.id)?.radius || agent.radius) + .03)
        // A freed queue place can lie on the next passenger's entry path. Keep
        // that corridor reserved until the serialized transfer has finished.
        && !(transferPoints && transfer.floorId === floorId && transferPoints.some((p, j) => j && pointSegmentDistance(position, transferPoints[j - 1], p) < agent.radius + transfer.radius + .05)))
        .sort((a, b) => (a.i === agent.avoidQueueSlot) - (b.i === agent.avoidQueueSlot) || a.distance - b.distance);
      let slot = -1, path;
      for (const candidate of available) {
        if (ticket.slot !== null && candidate.distance >= distanceXZ(stop.queueSlots[ticket.slot], stop.lobby) - .05) continue;
        const route = this.sim.world.floorPath(floorId, agent.position, candidate.position, agent.radius);
        if (route) { slot = candidate.i; path = route; break; }
      }
      if (slot < 0) {
        if (ticket.slot === null && agent.autoWander) {
          overflow.add(ticket.id); agent.activity = 'blocked'; agent.pendingDestination = agent.goal; agent.wanderAfter = this.sim.time + 1;
          agent.elevatorId = null; agent.queuePath = null; agent.queueReady = false;
          this.sim.emit('elevator_queue_full', { elevatorId: this.definition.id, agentId: agent.id });
        }
        continue;
      }
      if (ticket.slot !== null) used.delete(ticket.slot);
      ticket.slot = slot; used.add(slot); agent.queuePath = { points: path.points, waypoint: 1, queueKind: 'elevator' };
      agent.avoidQueueSlot = null;
      agent.queueReady = false; agent.activity = 'elevator_queue';
    }
    if (overflow.size) this.queues.set(floorId, queue.filter(ticket => !overflow.has(ticket.id)));
  }
  changeState(state) {
    this.state = state; this.timer = 0;
    if (state === 'boarding') this.boardingSince = this.sim.time;
    this.sim.emit('elevator_state', { elevatorId: this.definition.id, state, floorId: this.currentFloor, carY: this.carY, occupants: this.passengers.size });
  }
  nextFloor() {
    const passengerFloors = [...new Set([...this.passengers.values()].map(p => p.toFloor))].filter(f => f !== this.currentFloor);
    if (passengerFloors.length) return passengerFloors.sort((a, b) => Math.abs(this.stop(a).elevation - this.carY) - Math.abs(this.stop(b).elevation - this.carY))[0];
    const pending = [...this.queues.entries()].flatMap(([floor, queue]) => queue.map(t => ({ floor, sequence: t.sequence }))).sort((a, b) => a.sequence - b.sequence);
    return pending[0]?.floor || null;
  }
  pathToSlot(agent, slotIndex) {
    const stop = this.stop(this.currentFloor), y = stop.elevation;
    const approach = this.sim.clearApproach(agent, agent.floorId, stop.lobby, true);
    if (!approach) return null;
    const entry = (stop.entryPath || [stop.lobby, stop.door]).map(p => xyz(p, y));
    const points = [...approach.points, ...entry.slice(distance3(approach.points.at(-1), entry[0]) < 1e-7 ? 1 : 0), this.slotPosition(slotIndex, y)];
    points.floorApproachLength = approach.length; return points;
  }
  pathFromSlot(agent) {
    const stop = this.stop(this.currentFloor), y = stop.elevation;
    return [agent.position, ...(stop.exitPath || [stop.door, stop.lobby]).map(p => xyz(p, y))];
  }
  boardingCorridorClear(agent, points, queue) {
    if (!points) return false;
    const stop = this.stop(this.currentFloor);
    for (const other of queue) {
      if (other.id === agent.id || other.slot === null) continue;
      const waiting = this.sim.agents.get(other.id), position = stop.queueSlots[other.slot];
      if (points.some((p, i) => i && pointSegmentDistance(position, points[i - 1], p) < agent.radius + (waiting?.radius || agent.radius) + .04)) return false;
    }
    return true;
  }
  update(dt) {
    const sim = this.sim, def = this.definition;
    this.timer += dt;
    for (const [floorId, tickets] of this.queues) this.queues.set(floorId, tickets.filter(ticket => {
      const agent = sim.agents.get(ticket.id); if (!agent) return false;
      if (!agent.queueReady || ticket.checkedRevision === sim.world.revision) return true;
      ticket.checkedRevision = sim.world.revision;
      if (sim.world.floorPath(floorId, agent.position, this.stop(floorId).lobby, agent.radius)) return true;
      agent.queueReady = false; agent.queuePath = null; agent.activePath = null; agent.route = null; agent.elevatorId = null;
      agent.pendingDestination = agent.goal; agent.activity = 'route_pending'; sim.releaseDestination(agent);
      sim.emit('queue_geometry_invalidated', { agentId: agent.id, elevatorId: def.id, revision: sim.world.revision }); return false;
    }));
    for (const floor of this.queues.keys()) this.assignQueueSlots(floor);
    if (this.state === 'moving') {
      const y = this.stop(this.targetFloor).elevation, delta = y - this.carY, step = (def.speed || 1.4) * dt;
      this.carY += clamp(delta, -step, step);
      for (const [id, passenger] of this.passengers) {
        const agent = sim.agents.get(id); if (agent && agent.activity === 'elevator_ride') agent.position = this.slotPosition(passenger.slot);
      }
      if (Math.abs(delta) <= step + 1e-9) { this.carY = y; this.currentFloor = this.targetFloor; this.targetFloor = null; this.changeState('opening'); }
      return;
    }
    if (this.state === 'closed') {
      if (this.passengers.size && [...this.passengers.values()].some(p => p.toFloor === this.currentFloor) || this.queues.get(this.currentFloor).length) this.changeState('opening');
      else { const next = this.nextFloor(); if (next && next !== this.currentFloor) { this.targetFloor = next; this.changeState('moving'); } }
      return;
    }
    if (this.state === 'opening') {
      this.doorFraction = clamp(this.timer / (def.doorSeconds || 1), 0, 1);
      if (this.doorFraction === 1) this.changeState('alighting');
      return;
    }
    if (this.state === 'closing') {
      this.doorFraction = 1 - clamp(this.timer / (def.doorSeconds || 1), 0, 1);
      if (!this.doorFraction) {
        this.changeState('closed');
        const next = this.nextFloor(); if (next && next !== this.currentFloor) { this.targetFloor = next; this.changeState('moving'); }
      }
      return;
    }
    if (this.activeTransfer) {
      const agent = sim.agents.get(this.activeTransfer), transit = agent?.transit;
      // A walking bystander may enter an initially clear approach after it was
      // reserved. Abort only the still-walkable approach, never a doorway/cabin
      // crossing, and send the passenger continuously to another queue place.
      if (agent?.activity === 'elevator_board' && agent.blockedSeconds > 3 && transit
        && transit.progress < (transit.floorApproachLength || 0) - 1e-5 && sim.world.pointAllowed(this.currentFloor, agent.position, agent.radius)) {
        const ticket = this.transferTicket, passenger = this.passengers.get(agent.id);
        this.passengers.delete(agent.id); this.activeTransfer = null; this.transferTicket = null;
        agent.transit = null; agent.queuePath = null; agent.queueReady = false; agent.activity = 'elevator_wait'; agent.velocity = { x: 0, z: 0 };
        agent.avoidQueueSlot = ticket?.slot;
        this.queues.get(this.currentFloor).unshift({ id: agent.id, toFloor: passenger.toFloor, sequence: ticket?.sequence ?? this.sequence++, slot: null });
        sim.emit('elevator_approach_retry', { elevatorId: def.id, agentId: agent.id, blockedSeconds: agent.blockedSeconds });
        this.assignQueueSlots(this.currentFloor);
      }
      return;
    }
    if (this.state === 'alighting') {
      const outgoing = [...this.passengers.entries()].filter(([, p]) => p.toFloor === this.currentFloor)
        .sort((a, b) => distanceXZ(this.slotPosition(a[1].slot), this.stop(this.currentFloor).door) - distanceXZ(this.slotPosition(b[1].slot), this.stop(this.currentFloor).door));
      if (!outgoing.length) { this.changeState('boarding'); return; }
      const [id] = outgoing[0], agent = sim.agents.get(id); this.activeTransfer = id; agent.floorId = this.currentFloor;
      sim.startTransit(agent, this.pathFromSlot(agent), { kind: 'elevator_exit', transitionId: def.id, speed: Math.min(agent.maxSpeed, def.boardingSpeed || .65), onFinish: () => {
        this.passengers.delete(id); this.activeTransfer = null; agent.elevatorId = null;
        sim.emit('elevator_exit', { elevatorId: def.id, agentId: id, floorId: this.currentFloor }); sim.finishSegment(agent);
      } });
      return;
    }
    if (this.state === 'boarding') {
      const queue = this.queues.get(this.currentFloor);
      let choice;
      if (this.passengers.size < def.capacity) for (const ticket of queue) {
        const agent = sim.agents.get(ticket.id); if (!agent?.queueReady) continue;
        const occupied = [...this.passengers.values()];
        const free = def.slots.map((_, i) => i).filter(i => elevatorSlotFits(def, def.slots[i], agent.radius, agent.height) && !occupied.some(p => p.slot === i)
          && occupied.every(p => distanceXZ(this.slotPosition(i), this.slotPosition(p.slot)) >= agent.radius + sim.agents.get(p.id).radius + .02));
        free.sort((a, b) => distanceXZ(this.slotPosition(b), this.stop(this.currentFloor).door) - distanceXZ(this.slotPosition(a), this.stop(this.currentFloor).door));
        let points;
        const slot = free.find(i => { const candidate = this.pathToSlot(agent, i); if (!this.boardingCorridorClear(agent, candidate, queue)) return false; points = candidate; return true; });
        if (slot !== undefined) { choice = { ticket, agent, slot, points }; break; }
      }
      if (choice) {
          const {ticket,agent,slot,points} = choice; queue.splice(queue.indexOf(ticket), 1); this.activeTransfer = agent.id;
          this.transferTicket = ticket;
          this.passengers.set(agent.id, { id: agent.id, slot, toFloor: ticket.toFloor }); agent.queuePath = null; agent.queueReady = false;
          sim.emit('elevator_board', { elevatorId: def.id, agentId: agent.id, occupants: this.passengers.size, capacity: def.capacity });
          sim.startTransit(agent, points, { kind: 'elevator_board', transitionId: def.id, floorApproachLength: points.floorApproachLength, speed: Math.min(agent.maxSpeed, def.boardingSpeed || .65), onFinish: () => {
            agent.activity = 'elevator_ride'; agent.floorId = null; agent.transit = null; agent.position = this.slotPosition(slot); this.activeTransfer = null; this.transferTicket = null;
          } });
          return;
      }
      const held = sim.time - this.boardingSince;
      if (held >= (def.minimumHoldSeconds ?? def.boardingHoldSeconds ?? .8) && (!queue.length || this.passengers.size >= def.capacity || held > (def.maximumBoardingSeconds || 8))) this.changeState('closing');
    }
  }
  cancel(id) {
    for (const [floor, queue] of this.queues) this.queues.set(floor, queue.filter(t => t.id !== id));
    this.passengers.delete(id); if (this.activeTransfer === id) { this.activeTransfer = null; this.transferTicket = null; }
  }
  cancelMany(ids) {
    for (const [floor, queue] of this.queues) this.queues.set(floor, queue.filter(ticket => !ids.has(ticket.id)));
    for (const id of ids) this.passengers.delete(id);
    if (ids.has(this.activeTransfer)) { this.activeTransfer = null; this.transferTicket = null; }
  }
  snapshot() { return { id: this.definition.id, state: this.state, floorId: this.currentFloor, targetFloor: this.targetFloor, carY: this.carY, doorFraction: this.doorFraction, capacity: this.definition.capacity, occupants: this.passengers.size, queued: [...this.queues.values()].reduce((n, q) => n + q.length, 0) }; }
}
