#!/usr/bin/env node
/**
 * Behavioural regression gate for the vendored DetourCrowd integration.
 * Run from any directory:
 * node review/exhibition-25-years/motion-lab/tools/verify-ready-crowd.mjs
 * Optional: --output /path/to/report.json
 * Tests actual shared simulation ticks, not only rendered snapshots.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createReadyCrowd } from '../../ready-crowd-v1.js';

const base = new URL('../../', import.meta.url);
const layout = JSON.parse(fs.readFileSync(new URL('ready-crowd-layout-v1.json', base)));
const navMeshBytes = fs.readFileSync(new URL('ready-crowd-navmesh-v1.bin', base));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const obstacleDistance = (p, [minX, maxX, minZ, maxZ]) =>
  Math.hypot(Math.max(minX - p.x, 0, p.x - maxX), Math.max(minZ - p.z, 0, p.z - maxZ));
const cases = [
  { name: 'head-on', start: [[-3, -6], [3, -6]], goals: [[3, -6], [-3, -6]] },
  { name: 'crossing', start: [[-3, -6], [0, -8]], goals: [[3, -6], [0, -4.8]] },
  { name: 'occupied-station', stations: [0, 3], targets: [null, 2], rejectTarget: 0 },
  { name: 'exhibition-crossing', stations: [0, 1], targets: [4, 3] },
];
const reports = [];
for (const scenario of cases) {
  let ticks = 0, minCenters = Infinity, minObstacle = Infinity, minBoundary = Infinity;
  let overlapTicks = 0, skinEnvelopeOverlapTicks = 0, obstacleTicks = 0;
  const world = await createReadyCrowd({
    navMeshBytes, layout,
    onFixedStep(state) {
      ticks++;
      const [a, b] = state.agents;
      const d = distance(a.position, b.position);
      minCenters = Math.min(minCenters, d);
      if (d + 1e-4 < a.radius + b.radius) overlapTicks++;
      if (d + 1e-4 < a.envelopeRadius + b.envelopeRadius) skinEnvelopeOverlapTicks++;
      for (const agent of state.agents) {
        const p = agent.position;
        const clearance = Math.min(...layout.obstacles.map(bounds => obstacleDistance(p, bounds)));
        const edge = Math.min(p.x - layout.bounds.minX, layout.bounds.maxX - p.x,
          p.z - layout.bounds.minZ, layout.bounds.maxZ - p.z);
        minObstacle = Math.min(minObstacle, clearance);
        minBoundary = Math.min(minBoundary, edge);
        if (clearance + 1e-4 < agent.envelopeRadius || edge + 1e-4 < agent.envelopeRadius) obstacleTicks++;
      }
    },
  });
  const ids = ['emma', 'ethan'];
  for (let index = 0; index < ids.length; index++) {
    const station = scenario.stations?.[index];
    world.addAgent(ids[index], Number.isInteger(station) ? layout.stations[station].position : scenario.start[index],
      index ? 1.04 : 1.14, Number.isInteger(station) ? { station } : {});
  }
  let occupiedResult = null;
  if (Number.isInteger(scenario.rejectTarget)) occupiedResult = world.requestStation('ethan', scenario.rejectTarget);
  const requests = ids.map((id, index) => scenario.goals
    ? world.moveTo(id, scenario.goals[index])
    : Number.isInteger(scenario.targets[index]) ? world.requestStation(id, scenario.targets[index]) : null);
  const dtPattern = [1 / 120, 1 / 60, 1 / 30];
  let elapsed = 0, frame = 0, completed = false;
  while (elapsed < 40) {
    const dt = dtPattern[frame++ % dtPattern.length];
    world.update(dt);
    elapsed += dt;
    completed = ids.every((id, index) => !requests[index] || world.get(id).arrived);
    if (completed && elapsed > .1) break;
  }
  const state = world.snapshot();
  const rejectionOK = occupiedResult === null || (!occupiedResult.accepted && occupiedResult.reason === 'occupied');
  const pass = completed && requests.every(request => !request || request.accepted)
    && rejectionOK && overlapTicks === 0 && skinEnvelopeOverlapTicks === 0 && obstacleTicks === 0
    && ticks === state.totalFixedSteps && Math.abs(state.simulationTime - ticks / 60) < 1e-7;
  reports.push({
    name: scenario.name, pass, completed, simulationSeconds: state.simulationTime, ticks,
    minCenterDistance: minCenters, minObstacleDistance: minObstacle, minBoundaryDistance: minBoundary,
    overlapTicks, skinEnvelopeOverlapTicks, obstacleTicks, occupiedResult,
    end: state.agents.map(a => ({ id: a.id, position: a.position, currentStation: a.currentStation, arrived: a.arrived })),
  });
  world.destroy();
}
// Retirement of a logical station claim must not depend on station spacing.
// Physical occupancy is still checked independently when another visitor asks.
{
  const localLayout = { ...layout, stations: [{ position: [-2, -6] }, { position: [-1.75, -6] }] };
  const world = await createReadyCrowd({ navMeshBytes, layout: localLayout });
  world.addAgent('emma', [-2, -6], 1, { station: 0 });
  world.addAgent('ethan', [3, -6], 1);
  const request = world.requestStation('emma', 1);
  for (let i = 0; i < 180; i++) world.update(1 / 60);
  const state = world.get('emma');
  const retiredOwner = world.stationOwner(0);
  const occupiedOwner = world.stationOwner(1);
  const blocked = world.requestStation('ethan', 0);
  const pass = request.accepted && state.arrived && state.currentStation === 1
    && retiredOwner === null && occupiedOwner === 'emma'
    && !blocked.accepted && blocked.reason === 'physically-occupied';
  reports.push({ name: 'station-claim-retirement', pass, currentStation: state.currentStation,
    retiredOwner, occupiedOwner, physicalOccupancyStillBlocks: blocked });
  world.destroy();
}
const report = {
  pass: reports.every(r => r.pass),
  scope: 'Navigation and measured conservative envelopes; not an artistic gait or foot-contact acceptance.',
  engine: 'recast-navigation@0.44.0',
  radius: .70, envelopeRadius: .68,
  adapterSha256: sha(fs.readFileSync(new URL('ready-crowd-v1.js', base))),
  navMeshSha256: sha(navMeshBytes),
  renderDtPattern: [1 / 120, 1 / 60, 1 / 30],
  cases: reports,
};
const outputIndex = process.argv.indexOf('--output');
if (outputIndex >= 0) {
  if (!process.argv[outputIndex + 1]) throw new Error('--output requires a path');
  fs.writeFileSync(process.argv[outputIndex + 1], JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
