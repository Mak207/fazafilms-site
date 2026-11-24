import { xyz, distanceXZ, seededRandom, SpatialHash } from './geometry.js';
import { localItinerary } from './population.js';

const copy = point => ({ x: point.x, y: point.y, z: point.z });
const finitePoint = point => point && [point.x, point.y, point.z].every(Number.isFinite);
const busy = agent => agent.transit || agent.activity === 'elevator_ride' || /^(elevator|stair)_/.test(agent.activity) || agent.activity === 'stairs';
const overlapsHeight = (a, b) => a.position.y < b.position.y + b.height - 1e-8 && b.position.y < a.position.y + a.height - 1e-8;

/** Behaviour planning only. Positions, body dimensions and the contact solver
 * remain owned by CrowdSimulation. No social phase moves a body directly. */
export class SocialController {
  constructor(simulation, options = {}) {
    this.sim = simulation;
    this.options = { seed: 20261124, neighbourRadius: 12, preservedFraction: .2, soloFraction: .13,
      maxGroupSize: 5, maxPlansPerTick: 2, gatherSeconds: 9, maxVisitSeconds: 85,
      lookSeconds: [4, 7], photoSeconds: [3, 5], phoneSeconds: [2, 3], slotGap: .1, ...options };
    this.enabled = options.enabled !== false;
    this.groups = new Map(); this.membership = new Map(); this.pending = new Set(simulation.order.map(agent => agent.id));
    this.exhibits = new Map(); this.slotReservations = new Map(); this.slotHash = new SpatialHash(1.5);
    this.sequence = 0; this.planSequence = 0; this.cursor = 0;
    this.nextCohesionAt = 0;
    this.worldRevision = simulation.world.revision; this.catalogWorldRevision = simulation.world.revision; this.catalogSignature = '';
    this.metrics = { groupsCreated: 0, visitsStarted: 0, completedVisits: 0, photos: 0, cancelledVisits: 0,
      completedRoams: 0, plansAttempted: 0, slotChecks: 0, neighbourChecks: 0, phaseCompletions: { gather: 0, look: 0, photo: 0, phone: 0 }, cancellationReasons: {} };
    this.syncPopulation();
  }
  emit(type, data) { this.sim.emit(type, data); }
  populationChanged(id) { this.pending.add(String(id)); }
  kind(group) { return group.members.length === 1 ? 'solo' : group.members.length === 2 ? 'pair' : 'group'; }
  agents(group) { return group.members.map(id => this.sim.agents.get(id)).filter(Boolean); }
  duration(range, random) { return Array.isArray(range) ? range[0] + random() * (range[1] - range[0]) : range; }
  sameComponent(a, b) {
    if (a.floorId === null || a.floorId !== b.floorId) return false;
    const grid = this.sim.world.floor(a.floorId).grid;
    return !grid || grid.componentAt(a.position) === grid.componentAt(b.position);
  }
  makeGroup(members, managed = true) {
    const id = `social-${++this.sequence}`, group = { id, members: members.map(agent => agent.id), managed,
      random: seededRandom(`${this.options.seed}:${id}`), plan: null, nextPlanAt: this.sim.time + (this.sequence % 5) * .2, lastExhibitId: null, visitAgainAt: 0, photoTurn: 0 };
    this.groups.set(id, group); this.metrics.groupsCreated++;
    for (const agent of members) { this.membership.set(agent.id, id); this.describe(agent, group, 'walk'); }
    this.emit('social_group_created', { groupId: id, kind: this.kind(group), memberIds: [...group.members], managed });
    return group;
  }
  describe(agent, group, phase, extra = {}) {
    const social = agent.social || (agent.social = {}), changed = social.phase !== phase;
    Object.assign(social, { groupId: group.id, kind: this.kind(group), memberCount: group.members.length, managed: group.managed,
      role: 'visitor', phase, exhibitId: group.plan?.exhibitId || null, photoStyle: null,
      phaseUntil: group.plan?.phaseUntil ?? null, planId: group.plan?.id || null, ...extra });
    if (changed) social.phaseStartedAt = this.sim.time;
    if (!extra.lookAt && phase === 'walk') social.lookAt = null;
  }
  syncPopulation() {
    if (!this.enabled || !this.pending.size) return;
    const pending = [...this.pending].map(id => this.sim.agents.get(id)).filter(agent => agent && !this.membership.has(agent.id)).sort((a, b) => a.ordinal - b.ordinal);
    this.pending.clear(); const unassigned = new Set(pending.map(agent => agent.id));
    for (const agent of pending) {
      if (!unassigned.has(agent.id)) continue;
      unassigned.delete(agent.id);
      const random = seededRandom(`${this.options.seed}:member:${agent.id}`);
      // Keep a deterministic share of the authored circulation, including
      // existing inter-floor trips, independent of social visits.
      if ((agent.ordinal % 10) / 10 < this.options.preservedFraction) { this.makeGroup([agent], false); continue; }
      if (random() < this.options.soloFraction) { this.makeGroup([agent]); continue; }
      const neighbours = this.sim.occupancy.query(agent.position, this.options.neighbourRadius).filter(other => {
        this.metrics.neighbourChecks++;
        if (other === agent || !this.sameComponent(agent, other) || distanceXZ(agent.position, other.position) > this.options.neighbourRadius) return false;
        if (unassigned.has(other.id)) return (other.ordinal % 10) / 10 >= this.options.preservedFraction;
        const group = this.groups.get(this.membership.get(other.id));
        return group?.managed && group.members.length === 1 && !busy(other);
      }).sort((a, b) => distanceXZ(agent.position, a.position) - distanceXZ(agent.position, b.position) || a.ordinal - b.ordinal);
      const desired = random() < .58 ? 2 : Math.min(this.options.maxGroupSize, 3 + Math.floor(random() * 3));
      const members = [agent];
      for (const neighbour of neighbours) {
        if (members.length >= desired) break;
        const prior = this.groups.get(this.membership.get(neighbour.id));
        if (prior) { this.cancelPlan(prior, 'joined_nearby_group'); this.groups.delete(prior.id); this.membership.delete(neighbour.id); }
        unassigned.delete(neighbour.id); members.push(neighbour);
      }
      this.makeGroup(members);
    }
  }
  removeAgents(ids) {
    const touched = new Set();
    for (const id of ids) { this.pending.delete(id); const groupId = this.membership.get(id); if (groupId) touched.add(groupId); this.membership.delete(id); }
    for (const id of touched) {
      const group = this.groups.get(id); if (!group) continue;
      this.cancelPlan(group, 'population_changed'); group.members = group.members.filter(member => this.sim.agents.has(member));
      if (!group.members.length) this.groups.delete(id);
      else for (const agent of this.agents(group)) this.describe(agent, group, 'walk');
    }
    if (!this.sim.order.length) { this.groups.clear(); this.membership.clear(); this.pending.clear(); this.slotReservations.clear(); this.slotHash.clear(); this.cursor = 0; }
  }
  refreshRevision() {
    if (this.worldRevision === this.sim.world.revision) return;
    this.worldRevision = this.sim.world.revision;
    for (const group of this.groups.values()) this.cancelPlan(group, 'world_revision');
  }
  setExhibits(records = []) {
    this.refreshRevision();
    if (!Array.isArray(records)) throw new Error('Social exhibits must be an array');
    const exhibits = new Map();
    for (const record of records) {
      if (!record || record.visible === false || record.id === undefined || (!record.center && !record.lookAt)) continue;
      const id = String(record.id), center = xyz(record.center || record.lookAt), lookAt = xyz(record.lookAt || record.center);
      if (!finitePoint(center) || !finitePoint(lookAt)) continue;
      const slots = [];
      for (const [index, item] of (record.slots || []).entries()) {
        if (!item?.position || !this.sim.world.floors.has(String(item.floorId))) continue;
        const floorId = String(item.floorId), floor = this.sim.world.floor(floorId), position = xyz(item.position, floor.elevation);
        const gaze = xyz(item.lookAt || lookAt);
        if (!finitePoint(position) || !finitePoint(gaze) || Math.abs(position.y - floor.elevation) > .03
          || !this.sim.world.pointAllowed(floorId, position, this.sim.defaultRadius)
          || this.sim.inTransitionCorridor(position, this.sim.defaultRadius, this.sim.defaultHeight)) continue;
        slots.push({ ...item, id: String(item.id ?? `${floorId}-${index}`), key: `${id}:${item.id ?? `${floorId}-${index}`}`, floorId, position, lookAt: gaze });
      }
      if (slots.length) exhibits.set(id, { ...record, id, center, lookAt, slots });
    }
    const signature = JSON.stringify([...exhibits.values()].map(exhibit => [exhibit.id, exhibit.center, exhibit.lookAt, exhibit.slots.map(slot => [slot.key, slot.floorId, slot.position, slot.lookAt])]));
    const changed = signature !== this.catalogSignature;
    this.catalogWorldRevision = this.sim.world.revision;
    if (changed) {
      for (const group of this.groups.values()) if (group.plan?.kind === 'visit') this.cancelPlan(group, 'exhibits_changed');
      this.exhibits = exhibits; this.catalogSignature = signature;
      for (const group of this.groups.values()) group.nextPlanAt = Math.min(group.nextPlanAt, this.sim.time + 1);
    }
    return { exhibits: this.exhibits.size, slots: [...this.exhibits.values()].reduce((sum, exhibit) => sum + exhibit.slots.length, 0), revision: this.catalogWorldRevision, changed };
  }
  slotFree(slot, agent, group, chosen = []) {
    this.metrics.slotChecks++;
    if (this.slotReservations.has(slot.key) || !this.sim.world.pointAllowed(slot.floorId, slot.position, agent.radius)
      || this.sim.inTransitionCorridor(slot.position, agent.radius, agent.height)) return false;
    const requiredGap = this.options.slotGap;
    for (const reservation of this.slotHash.query(slot.position, agent.radius + this.sim.maxRadius + requiredGap)) {
      if (overlapsHeight({ position: slot.position, height: agent.height }, reservation)
        && distanceXZ(slot.position, reservation.position) < agent.radius + reservation.radius + requiredGap - 1e-6) return false;
    }
    for (const entry of chosen) if (entry.slot.floorId === slot.floorId
      && distanceXZ(entry.slot.position, slot.position) < agent.radius + entry.agent.radius + requiredGap - 1e-6) return false;
    for (const other of this.sim.occupancy.query(slot.position, agent.radius + this.sim.maxRadius + .08)) {
      if (group.members.includes(other.id)) continue;
      if (overlapsHeight({ position: slot.position, height: agent.height }, other)
        && distanceXZ(slot.position, other.position) < agent.radius + other.radius + .08) return false;
    }
    const grid = this.sim.world.floor(slot.floorId).grid;
    return agent.floorId !== slot.floorId || !grid || grid.componentAt(agent.position) === grid.componentAt(slot.position);
  }
  reserve(group, assignments, kind, exhibit = null) {
    const id = `social-plan-${++this.planSequence}`;
    const plan = { id, kind, exhibitId: exhibit?.id || null, assignments, phase: 'walk', startedAt: this.sim.time,
      phaseUntil: null, deadline: this.sim.time + (kind === 'visit' ? this.options.maxVisitSeconds : 40), gatherStarted: null, photoStyle: null, photographerId: null };
    group.plan = plan;
    for (const assignment of assignments) {
      const { agent, slot } = assignment;
      assignment.resumeGoal = agent.goal && !agent.goal.socialPlanId ? agent.goal : agent.itinerary[agent.itineraryIndex] || null;
      const reservation = { id: `${id}:${agent.id}`, groupId: group.id, agentId: agent.id, key: slot.key, position: slot.position, radius: agent.radius, height: agent.height };
      this.slotReservations.set(slot.key, reservation); this.slotHash.insert(reservation);
      const target = { floorId: slot.floorId, position: copy(slot.position), dwellSeconds: 3600, socialPlanId: id, socialExhibitId: exhibit?.id || null };
      this.queueDestination(agent, target); this.describe(agent, group, 'walk', { lookAt: slot.lookAt || exhibit?.lookAt || slot.position });
    }
    if (kind === 'visit') { this.metrics.visitsStarted++; this.emit('social_visit_start', { groupId: group.id, kind: this.kind(group), planId: id, exhibitId: exhibit.id, memberIds: [...group.members] }); }
    return true;
  }
  queueDestination(agent, target) {
    if (busy(agent)) { agent.pendingAfterTransition = target; agent.goal = target; return; }
    for (const controller of this.sim.controllers) controller.cancel(agent.id);
    this.sim.releaseDestination(agent); agent.goal = target; agent.pendingDestination = target;
    agent.route = null; agent.activePath = null; agent.queuePath = null; agent.queueReady = false; agent.elevatorId = null;
    agent.activity = 'route_pending'; agent.velocity = { x: 0, z: 0 }; agent.speed = 0;
  }
  release(group) {
    const plan = group.plan; if (!plan) return;
    for (const { agent, slot, resumeGoal } of plan.assignments) {
      const reservation = this.slotReservations.get(slot.key);
      if (reservation?.groupId === group.id) { this.slotReservations.delete(slot.key); this.slotHash.remove(reservation); }
      agent.socialHold = false; agent.socialSpeedFactor = 1;
      if (!this.sim.agents.has(agent.id)) continue;
      const owned = [agent.goal, agent.pendingDestination, agent.pendingAfterTransition].some(target => target?.socialPlanId === plan.id);
      if (owned) {
        let continuation = resumeGoal;
        if (!continuation && !busy(agent) && agent.floorId !== null) continuation = localItinerary(this.sim, agent.floorId, agent.position, agent.radius, `${agent.id}:resume:${this.sim.tick}`)[0];
        // A transit can finish safely even if it was the only authored goal.
        // Its next destination is a plain floor point, with no exhibit ownership.
        if (!continuation && busy(agent)) continuation = { floorId: slot.floorId, position: copy(slot.position), dwellSeconds: 1 };
        if (continuation) this.queueDestination(agent, continuation);
        else {
          for (const controller of this.sim.controllers) controller.cancel(agent.id);
          this.sim.releaseDestination(agent); agent.goal = null; agent.pendingDestination = null; agent.pendingAfterTransition = null;
          agent.route = null; agent.activePath = null; agent.queuePath = null; agent.queueReady = false; agent.activity = 'idle'; agent.idleUntil = this.sim.time + .5;
        }
      }
    }
    group.plan = null;
    for (const agent of this.agents(group)) this.describe(agent, group, 'walk');
  }
  cancelPlan(group, reason) {
    if (!group.plan) return;
    const plan = group.plan;
    if (plan.kind === 'visit') { this.metrics.cancelledVisits++; this.metrics.cancellationReasons[reason] = (this.metrics.cancellationReasons[reason] || 0) + 1;
      this.emit('social_visit_cancel', { groupId: group.id, planId: plan.id, exhibitId: plan.exhibitId, reason }); }
    this.release(group); group.nextPlanAt = this.sim.time + 1 + group.random() * 2;
  }
  chooseVisit(group, agents) {
    const leader = agents[0], floorId = leader.floorId;
    const candidates = [...this.exhibits.values()].filter(exhibit => exhibit.id !== group.lastExhibitId || this.sim.time >= group.visitAgainAt)
      .map(exhibit => ({ exhibit, slots: exhibit.slots.filter(slot => slot.floorId === floorId), distance: distanceXZ(leader.position, exhibit.center) }))
      .filter(candidate => candidate.slots.length >= agents.length).sort((a, b) => a.distance - b.distance);
    for (const { exhibit, slots } of candidates.slice(0, 5)) {
      const assignments = [], remaining = [...slots];
      for (const agent of agents) {
        const anchor = assignments[0]?.slot.position;
        const score = slot => anchor ? distanceXZ(anchor, slot.position) + distanceXZ(agent.position, slot.position) * .15 : distanceXZ(agent.position, slot.position);
        remaining.sort((a, b) => score(a) - score(b));
        const index = remaining.findIndex(slot => this.slotFree(slot, agent, group, assignments));
        if (index < 0) break;
        assignments.push({ agent, slot: remaining.splice(index, 1)[0] });
      }
      if (assignments.length === agents.length) return this.reserve(group, assignments, 'visit', exhibit);
    }
    return false;
  }
  chooseRoam(group, agents) {
    const leader = agents[0], floorId = leader.floorId;
    if (agents.some(agent => agent.floorId !== floorId)) return false;
    const spacing = this.sim.maxRadius * 2 + this.options.slotGap + .14;
    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = group.random() * Math.PI * 2, distance = 4 + group.random() * 6;
      const center = { x: leader.position.x + Math.cos(angle) * distance, y: leader.position.y, z: leader.position.z + Math.sin(angle) * distance };
      const assignments = [];
      for (let index = 0; index < agents.length; index++) {
        const agent = agents[index], offset = (index - (agents.length - 1) / 2) * spacing;
        // Adjacent goals make open-space pairs walk abreast. The ordinary path
        // planner naturally separates them around walls and through passages.
        const position = { x: center.x - Math.sin(angle) * offset, y: center.y, z: center.z + Math.cos(angle) * offset };
        const slot = { key: `roam:${group.id}:${index}`, floorId, position, lookAt: center };
        if (!this.slotFree(slot, agent, group, assignments) || !this.sim.world.segmentAllowed(floorId, leader.position, position, agent.radius)) break;
        assignments.push({ agent, slot });
      }
      if (assignments.length === agents.length) return this.reserve(group, assignments, 'roam');
    }
    return false;
  }
  enterPhase(group, phase, seconds, arrived) {
    const plan = group.plan; plan.phase = phase; plan.phaseUntil = this.sim.time + seconds;
    this.emit(phase === 'gather' ? 'social_gather' : 'social_phase', { groupId: group.id, planId: plan.id, phase, until: plan.phaseUntil, exhibitId: plan.exhibitId, arrived: arrived.length });
  }
  updatePlan(group) {
    const plan = group.plan, agents = this.agents(group);
    if (!plan) return;
    if (this.sim.time > plan.deadline) { this.cancelPlan(group, 'visit_deadline'); return; }
    if (plan.assignments.some(({ agent }) => !this.sim.agents.has(agent.id) || (!busy(agent) && agent.goal?.socialPlanId !== plan.id && agent.pendingDestination?.socialPlanId !== plan.id))) {
      this.cancelPlan(group, 'route_changed'); return;
    }
    const arrived = plan.assignments.filter(({ agent, slot }) => !busy(agent) && agent.floorId === slot.floorId && agent.activity === 'idle' && agent.speed < .05 && distanceXZ(agent.position, slot.position) < .18);
    const holdingIds = new Set(arrived.map(entry => entry.agent.id));
    for (const { agent } of plan.assignments) agent.socialHold = holdingIds.has(agent.id);
    if (plan.kind === 'roam') {
      if (arrived.length === agents.length) { this.metrics.completedRoams++; this.release(group); group.nextPlanAt = this.sim.time + .5; }
      return;
    }
    if (plan.phase === 'walk' && arrived.length) this.enterPhase(group, 'gather', this.options.gatherSeconds, arrived);
    if (plan.phase === 'gather' && (arrived.length === agents.length || this.sim.time >= plan.phaseUntil)) {
      if (arrived.length < Math.min(2, agents.length)) { this.cancelPlan(group, 'gather_timeout'); return; }
      this.metrics.phaseCompletions.gather++; this.enterPhase(group, 'look', this.duration(this.options.lookSeconds, group.random), arrived);
    } else if (plan.phase === 'look' && this.sim.time >= plan.phaseUntil) {
      if (!arrived.length) { this.cancelPlan(group, 'no_photo_participants'); return; }
      this.metrics.phaseCompletions.look++;
      plan.photographerId = arrived[group.photoTurn % arrived.length].agent.id;
      plan.photoStyle = arrived.length > 1 && group.random() < .75 ? 'group' : group.random() < .45 ? 'selfie' : 'exhibit';
      this.enterPhase(group, 'photo', this.duration(this.options.photoSeconds, group.random), arrived);
    } else if (plan.phase === 'photo' && this.sim.time >= plan.phaseUntil) {
      this.metrics.phaseCompletions.photo++; this.metrics.photos++;
      group.photoTurn++;
      this.emit('social_photo', { groupId: group.id, kind: this.kind(group), planId: plan.id, exhibitId: plan.exhibitId, photographerId: plan.photographerId, photoStyle: plan.photoStyle, participantIds: arrived.map(entry => entry.agent.id) });
      this.enterPhase(group, 'phone', this.duration(this.options.phoneSeconds, group.random), arrived);
    } else if (plan.phase === 'phone' && this.sim.time >= plan.phaseUntil) {
      this.metrics.phaseCompletions.phone++; this.metrics.completedVisits++;
      this.emit('social_visit_complete', { groupId: group.id, kind: this.kind(group), planId: plan.id, exhibitId: plan.exhibitId, participantIds: arrived.map(entry => entry.agent.id), duration: this.sim.time - plan.startedAt });
      group.lastExhibitId = plan.exhibitId; group.visitAgainAt = this.sim.time + 35;
      this.release(group); group.nextPlanAt = this.sim.time + 1; return;
    }
    const arrivedIds = new Set(arrived.map(entry => entry.agent.id));
    const photographer = this.sim.agents.get(plan.photographerId);
    for (const { agent, slot } of plan.assignments) {
      if (!arrivedIds.has(agent.id)) { this.describe(agent, group, 'walk', { lookAt: slot.lookAt }); continue; }
      let phase = plan.phase === 'walk' ? 'gather' : plan.phase, role = 'visitor', lookAt = slot.lookAt;
      if (plan.phase === 'photo') {
        role = agent.id === plan.photographerId ? 'photographer' : 'subject';
        phase = role === 'photographer' ? 'photo' : plan.photoStyle === 'group' ? 'pose' : 'look';
        if (role === 'subject' && plan.photoStyle === 'group') lookAt = { x: photographer.position.x, y: photographer.position.y + Math.min(1.5, photographer.height * .8), z: photographer.position.z };
        else if (role === 'photographer' && plan.photoStyle === 'group') {
          const subjects = arrived.filter(entry => entry.agent.id !== agent.id), n = subjects.length || 1;
          lookAt = { x: subjects.reduce((sum, entry) => sum + entry.agent.position.x, 0) / n, y: agent.position.y + 1.35, z: subjects.reduce((sum, entry) => sum + entry.agent.position.z, 0) / n };
        } else if (role === 'photographer' && plan.photoStyle === 'selfie') lookAt = { x: agent.position.x * 2 - slot.lookAt.x, y: agent.position.y + agent.height * .8, z: agent.position.z * 2 - slot.lookAt.z };
      } else if (plan.phase === 'phone') role = agent.id === plan.photographerId ? 'photographer' : 'visitor';
      this.describe(agent, group, phase, { role, lookAt, photoStyle: plan.photoStyle, phaseUntil: plan.phaseUntil });
    }
  }
  cohesion(group) {
    const agents = this.agents(group);
    for (const agent of agents) agent.socialSpeedFactor = 1;
    if (!group.plan || agents.length < 2 || group.plan.phase !== 'walk' || agents.some(busy)) return;
    if (!agents.every(agent => agent.floorId === agents[0].floorId)) return;
    const center = group.plan.assignments.reduce((point, entry) => ({ x: point.x + entry.slot.position.x / agents.length, z: point.z + entry.slot.position.z / agents.length }), { x: 0, z: 0 });
    const distances = agents.map(agent => distanceXZ(agent.position, center)), furthest = Math.max(...distances);
    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      if (agent.activity !== 'walk' || furthest - distances[i] <= 1.6 || this.sim.inTransitionCorridor(agent.position, agent.radius, agent.height)) continue;
      if (furthest - distances[i] > 3) agent.socialSpeedFactor = .65;
      else if (furthest - distances[i] > 1.6) agent.socialSpeedFactor = .82;
    }
  }
  tick() {
    if (!this.enabled) return;
    this.syncPopulation(); this.refreshRevision();
    const groups = [...this.groups.values()];
    const cohesionDue = this.sim.time >= this.nextCohesionAt;
    if (cohesionDue) this.nextCohesionAt = this.sim.time + .2;
    for (const group of groups) { this.updatePlan(group); if (cohesionDue) this.cohesion(group); }
    if (!this.exhibits.size || this.catalogWorldRevision !== this.sim.world.revision || !groups.length) return;
    let plans = 0;
    for (let scanned = 0; scanned < groups.length && plans < this.options.maxPlansPerTick; scanned++) {
      const group = groups[this.cursor++ % groups.length];
      if (!group.managed || group.plan || this.sim.time < group.nextPlanAt) continue;
      const agents = this.agents(group);
      if (!agents.length || agents.some(agent => busy(agent) || agent.floorId === null || this.sim.inTransitionCorridor(agent.position, agent.radius, agent.height))) { group.nextPlanAt = this.sim.time + 1; continue; }
      this.metrics.plansAttempted++; plans++;
      if (!this.chooseVisit(group, agents) && !this.chooseRoam(group, agents)) group.nextPlanAt = this.sim.time + 3 + group.random() * 3;
    }
    this.cursor %= Math.max(1, groups.length);
  }
  snapshot({ includeGroups = false } = {}) {
    const counts = { solo: 0, pair: 0, group: 0 }, sizes = {}, phases = {}, groups = [...this.groups.values()];
    let activeVisits = 0, preservedMembers = 0;
    for (const group of groups) { counts[this.kind(group)]++; sizes[group.members.length] = (sizes[group.members.length] || 0) + 1; if (group.plan?.kind === 'visit') activeVisits++; if (!group.managed) preservedMembers += group.members.length; }
    for (const agent of this.sim.order) { const phase = agent.social?.phase || 'walk'; phases[phase] = (phases[phase] || 0) + 1; }
    return { enabled: this.enabled, groupsTotal: groups.length, members: this.membership.size, ...counts, groupSizes: sizes, phaseCounts: phases, preservedMembers,
      exhibits: this.exhibits.size, activeVisits, slotReservations: this.slotReservations.size, worldRevision: this.worldRevision, catalogWorldRevision: this.catalogWorldRevision,
      ...this.metrics, phaseCompletions: { ...this.metrics.phaseCompletions }, cancellationReasons: { ...this.metrics.cancellationReasons },
      ...(includeGroups ? { groups: groups.map(group => ({ id: group.id, kind: this.kind(group), managed: group.managed, memberIds: [...group.members], phase: group.plan?.phase || 'walk', exhibitId: group.plan?.exhibitId || null, phaseUntil: group.plan?.phaseUntil ?? null, deadline: group.plan?.deadline ?? null })) } : {}) };
  }
  dispose() { for (const group of this.groups.values()) this.release(group); this.groups.clear(); this.membership.clear(); this.pending.clear(); this.slotReservations.clear(); this.slotHash.clear(); this.enabled = false; }
}

export const createSocialController = (simulation, options) => new SocialController(simulation, options);
