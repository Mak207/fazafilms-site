import * as THREE from 'three';
import { createPerimeterRoute, PERIMETER_ROUTE_CONFIG } from './perimeter-route.js?v=park-exhibition-20261125-r2';

/**
 * Monorail for the Park Impressions viewer. Three.js r180, metres, Y up.
 * The alignment is a presentation reconstruction, not a surveyed CAD axis.
 * No animation loop, network dependency, or substitute wagon is created.
 * A local canvas labels the provisional use of the existing CAD terrace.
 */
export const DEFAULT_ROUTE_CONFIG = Object.freeze({
  centerX: 5, centerZ: -15.75, width: 46, length: 99.5,
  cornerRadius: 22.5, height: 19.2, floorHeight: 13.2,
});

export const TRAM_CONSTANTS = Object.freeze({
  vehicleLength: 12,
  vehicleCount: 2,
  baseSpeed: 3,
  maxDeltaSeconds: 0.1,
  maxSpeedMultiplier: 4,
  beamWidth: 0.95,
  beamDepth: 0.72,
  runningSurfaceWidth: 0.30,
  runningSurfaceDepth: 0.06,
  supportSpacing: 12,
  geometryStep: 0.3,
  maxLateralAcceleration: 0.35,
  maxTurnRate: 0.20,
  comfortAcceleration: 0.45,
  comfortJerk: 0.35,
});

const UP = new THREE.Vector3(0, 1, 0);
const modulo = (value, length) => ((value % length) + length) % length;

function finiteNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`Монорельс: ${name} должен быть конечным числом.`);
  }
  return value;
}

function normalizedConfig(input = {}) {
  const config = { ...DEFAULT_ROUTE_CONFIG };
  for (const key of Object.keys(config)) {
    if (input[key] !== undefined) config[key] = finiteNumber(input[key], key);
  }
  if (config.width <= 0 || config.length <= 0) {
    throw new RangeError('Монорельс: width и length должны быть положительными.');
  }
  if (config.cornerRadius <= 0 || config.cornerRadius > Math.min(config.width, config.length) / 2) {
    throw new RangeError('Монорельс: cornerRadius должен быть > 0 и не больше половины меньшего габарита.');
  }
  if (config.height - config.floorHeight <= 1.2) {
    throw new RangeError('Монорельс: между floorHeight и верхом направляющей height требуется более 1,2 м.');
  }
  return Object.freeze(config);
}

/**
 * Exact arc-length route: four lines and four quarter circles in XZ.
 * width/length are centreline extents, height is the TOP of the running surface.
 * The initial point is on the +X side, heading +Z. The direction is a demo choice.
 * Curvature changes at line/arc joins; position and unit tangent are continuous.
 */
export function createRoundedRectangleRoute(input = {}) {
  const config = normalizedConfig(input);
  const { centerX: cx, centerZ: cz, width, length, cornerRadius: r, height } = config;
  const hx = width / 2, hz = length / 2;
  const segments = [];
  let total = 0;
  const add = segment => {
    if (segment.length <= 1e-12) return;
    segments.push(Object.freeze({ ...segment, start: total, end: total + segment.length }));
    total += segment.length;
  };
  const line = (x, z, tx, tz, distance) => add({ type: 'line', x, z, tx, tz, length: distance });
  const arc = (x, z, angle) => add({ type: 'arc', x, z, angle, radius: r, length: Math.PI * r / 2 });

  line(cx + hx, cz - hz + r, 0, 1, length - 2 * r);
  arc(cx + hx - r, cz + hz - r, 0);
  line(cx + hx - r, cz + hz, -1, 0, width - 2 * r);
  arc(cx - hx + r, cz + hz - r, Math.PI / 2);
  line(cx - hx, cz + hz - r, 0, -1, length - 2 * r);
  arc(cx - hx + r, cz - hz + r, Math.PI);
  line(cx - hx + r, cz - hz, 1, 0, width - 2 * r);
  arc(cx + hx - r, cz - hz + r, Math.PI * 1.5);

  function sampleDistance(distance, target) {
    finiteNumber(distance, 'distance');
    const d = modulo(distance, total);
    const segment = segments.find(item => d < item.end) || segments[segments.length - 1];
    const local = Math.max(0, Math.min(segment.length, d - segment.start));
    const result = target || { position: new THREE.Vector3(), tangent: new THREE.Vector3() };
    if (segment.type === 'line') {
      result.position.set(segment.x + segment.tx * local, height, segment.z + segment.tz * local);
      result.tangent.set(segment.tx, 0, segment.tz);
    } else {
      const angle = segment.angle + local / segment.radius;
      result.position.set(segment.x + r * Math.cos(angle), height, segment.z + r * Math.sin(angle));
      result.tangent.set(-Math.sin(angle), 0, Math.cos(angle));
    }
    result.distance = d;
    result.phase = d / total;
    // Three.js positive Y rotation maps the wagon's +Z nose to this tangent.
    result.heading = Math.atan2(result.tangent.x, result.tangent.z);
    return result;
  }

  return Object.freeze({
    config,
    length: total,
    segments: Object.freeze(segments),
    sampleDistance,
    getPointAt(phase, target = new THREE.Vector3()) {
      return target.copy(sampleDistance(finiteNumber(phase, 'phase') * total).position);
    },
    getTangentAt(phase, target = new THREE.Vector3()) {
      return target.copy(sampleDistance(finiteNumber(phase, 'phase') * total).tangent);
    },
  });
}


/** Closed route attached to the existing CAD terrace by a controlled boarding bridge. */
export const MONORAIL_ROUTE_CONFIG = PERIMETER_ROUTE_CONFIG;

export const MONORAIL_BOARDING_GATE = Object.freeze({
  id: 'nw-terrace-boarding-gate', provisional: true,
  meshName: 'Ограждение__7f7f7fff',
  min: Object.freeze([-16.22, 16.50, -63.75]),
  max: Object.freeze([-16.12, 17.80, -61.25]),
  sourceTriangleIndices: Object.freeze([]),
  method: 'Subtract this local box from polygons; preserve the rest of each long triangle.',
  sourceCadFileModified: false,
});

export const MONORAIL_STATION_EVIDENCE = Object.freeze({
  label: 'Посадка на кольцевой монорельс',
  status: 'provisional', existingCadPlatformConfirmed: true,
  passengerPurposeConfirmed: false,
  evidence: Object.freeze([
    'Скриншот пользователя: бежевая площадка рядом со стеклянным блоком, реактором и прежним местом ледокола.',
    'CAD: Перекрытие ATR_ВН_ОТ_Пол_Керамо_56ecded, верх Y=16.65 м.',
    'Существующие лестницы _03d5fb0 и _45104e1 соединяют площадку с антресолью Y=13.2 м.',
    'Посадочное назначение, локальная калитка 2.4 м, выдвижной мостик и кольцевая трасса — рабочее сценовое решение.',
  ]),
  platformBounds: Object.freeze({ min: Object.freeze([-34.884342, 16.65, -80.292366]), max: Object.freeze([-16.184341, 16.65, -61.167366]) }),
  passengerFloorOffset: 0.8,
  passengerFloorOffsetNote: 'В GLB вагона отдельный пол салона не выделен; +0.8 м — рабочая визуальная калибровка.',
  buildingSha256: '0fe60c53a9fc72c9ed0ad15ac8808ca721b3a7af8e96d81329cdc748c78fd792',
  boardingVehicle: 0,
});

/**
 * Open C-shaped route. Both vehicles keep their body orientation when the pair
 * reverses; no in-place turn or hidden path through the northern rooms is used.
 */
export function createMonorailRoute(input = MONORAIL_ROUTE_CONFIG) {
  if (input.routeMode === 'perimeter') return createPerimeterRoute(input);
  if (input.routeMode !== 'shuttle') return createRoundedRectangleRoute(input);
  const config = Object.freeze({ ...MONORAIL_ROUTE_CONFIG, ...input });
  for (const key of ['height', 'stationRailHeight', 'vehicleSpacing', 'endClearance']) finiteNumber(config[key], key);
  if (config.vehicleSpacing < TRAM_CONSTANTS.vehicleLength + 1) throw new RangeError('Монорельс: между вагонами нужен рабочий интервал.');
  const segments = [];
  let total = 0;
  function add(raw) {
    const divisions = raw.type === 'line' ? 1 : 512, lengths = [0];
    let previous = raw.point(0);
    for (let i = 1; i <= divisions; i++) {
      const point = raw.point(i / divisions);
      lengths.push(lengths[lengths.length - 1] + Math.hypot(point[0] - previous[0], point[1] - previous[1]));
      previous = point;
    }
    const length = lengths[lengths.length - 1];
    segments.push(Object.freeze({ ...raw, divisions, lengths: Object.freeze(lengths), length, start: total, end: total + length }));
    total += length;
  }
  const line = (x, z, tx, tz, length) => add({ type: 'line',
    point: u => [x + tx * length * u, z + tz * length * u], tangent: () => [tx, tz] });
  const arc = (x, z, radius, angle) => add({ type: 'arc',
    point: u => [x + radius * Math.cos(angle + Math.PI * u / 2), z + radius * Math.sin(angle + Math.PI * u / 2)],
    tangent: u => [-radius * Math.sin(angle + Math.PI * u / 2), radius * Math.cos(angle + Math.PI * u / 2)] });
  const cubic = (a, b, c, d) => add({ type: 'cubic',
    point: u => { const v = 1 - u; return [0, 1].map(i => v*v*v*a[i] + 3*v*v*u*b[i] + 3*v*u*u*c[i] + u*u*u*d[i]); },
    tangent: u => { const v = 1 - u; return [0, 1].map(i => 3*v*v*(b[i]-a[i]) + 6*v*u*(c[i]-b[i]) + 3*u*u*(d[i]-c[i])); } });
  const stationX = -14.88982323428045;
  line(28, -43, 0, 1, 54.5);
  arc(5.5, 11.5, 22.5, 0);
  line(5.5, 34, -1, 0, 1);
  arc(4.5, 11.5, 22.5, Math.PI / 2);
  line(-18, 11.5, 0, -1, 54.5);
  cubic([-18, -43], [-18, -49], [stationX, -54.5], [stationX, -60.5]);
  line(stationX, -60.5, 0, -1, 14.3);
  const lowerEnd = segments[segments.length - 1].start + 2, lowerStart = lowerEnd - 25;
  const drop = config.height - config.stationRailHeight;
  function sampleDistance(distance, target) {
    const d = Math.max(0, Math.min(total, finiteNumber(distance, 'distance')));
    const segment = segments.find(item => d < item.end) || segments[segments.length - 1], local = d - segment.start;
    let lo = 0, hi = segment.divisions;
    while (hi - lo > 1) {
      const middle = (lo + hi) >> 1;
      if (segment.lengths[middle] <= local) lo = middle; else hi = middle;
    }
    const span = segment.lengths[hi] - segment.lengths[lo];
    const u = (lo + (span > 0 ? (local - segment.lengths[lo]) / span : 0)) / segment.divisions;
    const point = segment.point(u), tangent = segment.tangent(u), horizontalLength = Math.hypot(...tangent);
    const p = Math.max(0, Math.min(1, (d - lowerStart) / 25));
    const y = config.height - drop * (3*p*p - 2*p*p*p);
    const grade = p > 0 && p < 1 ? -drop * (6*p - 6*p*p) / 25 : 0;
    const result = target || { position: new THREE.Vector3(), tangent: new THREE.Vector3() };
    result.position.set(point[0], y, point[1]);
    result.tangent.set(tangent[0] / horizontalLength, grade, tangent[1] / horizontalLength).normalize();
    result.heading = Math.atan2(tangent[0], tangent[1]); result.grade = grade;
    result.distance = d; result.phase = d / total;
    return result;
  }
  const minLeadingDistance = config.endClearance + config.vehicleSpacing;
  const maxLeadingDistance = total - config.endClearance;
  const supportCount = Math.ceil(total / TRAM_CONSTANTS.supportSpacing) + 1;
  const supportDistances = Array.from({ length: supportCount }, (_, i) => 0.6 + i * (total - 1.2) / (supportCount - 1));
  // Move the final approach foot away from the existing mezzanine guardrail.
  // The end support follows by 0.5 m; every resulting span remains below 12 m.
  if (supportCount === 19) { supportDistances[17] -= 0.7; supportDistances[18] -= 0.5; }
  return Object.freeze({
    config, closed: false, routeMode: 'shuttle', length: total, segments: Object.freeze(segments),
    lowerStart, lowerEnd, minLeadingDistance, maxLeadingDistance, supportDistances: Object.freeze(supportDistances),
    station: Object.freeze({ id: 'nw-existing-terrace', railX: stationX, railY: config.stationRailHeight, platformY: 16.65, centerZ: -68.5, boardingVehicle: 0 }),
    sampleDistance,
    getPointAt(phase, target = new THREE.Vector3()) { return target.copy(sampleDistance(finiteNumber(phase, 'phase') * total).position); },
    getTangentAt(phase, target = new THREE.Vector3()) { return target.copy(sampleDistance(finiteNumber(phase, 'phase') * total).tangent); },
  });
}

function routeStations(route) {
  const result = [];
  // Sample the final checked centreline densely, including its continuous bends.
  for (const segment of route.segments) {
    const count = Math.max(1, Math.ceil(segment.length / TRAM_CONSTANTS.geometryStep));
    for (let i = 0; i < count; i++) result.push(route.sampleDistance(segment.start + segment.length * i / count));
  }
  result.push(route.sampleDistance(route.closed === false ? route.length : 0));
  return result;
}

/** Closed rectangular sweep, with explicit hard top/bottom edges and smooth side normals. */
function sweptRectangle(stations, width, top, bottom, closeEnds = false) {
  const positions = [], normals = [], indices = [];
  const half = width / 2, referenceHeight = stations[0].position.y;
  function at(s, offset, y) {
    const horizontal = Math.hypot(s.tangent.x, s.tangent.z) || 1;
    return [s.position.x + s.tangent.z / horizontal * offset, y + s.position.y - referenceHeight, s.position.z - s.tangent.x / horizontal * offset];
  }
  function quad(points, faceNormals) {
    const base = positions.length / 3;
    for (let i = 0; i < 4; i++) { positions.push(...points[i]); normals.push(...faceNormals[i]); }
    const u = points[1].map((v, i) => v - points[0][i]);
    const v = points[2].map((v, i) => v - points[0][i]);
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const forward = cross.reduce((sum, value, i) => sum + value * faceNormals[0][i], 0) >= 0;
    if (forward) indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i], b = stations[i + 1];
    const ah = Math.hypot(a.tangent.x, a.tangent.z) || 1, bh = Math.hypot(b.tangent.x, b.tangent.z) || 1;
    const ar = [a.tangent.z / ah, 0, -a.tangent.x / ah], br = [b.tangent.z / bh, 0, -b.tangent.x / bh];
    const au = [-a.tangent.x * a.tangent.y / ah, ah, -a.tangent.z * a.tangent.y / ah], bu = [-b.tangent.x * b.tangent.y / bh, bh, -b.tangent.z * b.tangent.y / bh];
    const al = ar.map(value => -value), bl = br.map(value => -value);
    quad([at(a, -half, top), at(b, -half, top), at(b, half, top), at(a, half, top)], [au, bu, bu, au]);
    quad([at(a, -half, bottom), at(b, -half, bottom), at(b, half, bottom), at(a, half, bottom)], [au.map(v => -v), bu.map(v => -v), bu.map(v => -v), au.map(v => -v)]);
    quad([at(a, half, bottom), at(b, half, bottom), at(b, half, top), at(a, half, top)], [ar, br, br, ar]);
    quad([at(a, -half, bottom), at(b, -half, bottom), at(b, -half, top), at(a, -half, top)], [al, bl, bl, al]);
  }
  if (closeEnds) {
    for (const [s, sign] of [[stations[0], -1], [stations[stations.length - 1], 1]]) {
      const h = Math.hypot(s.tangent.x, s.tangent.z) || 1, normal = [s.tangent.x / h * sign, 0, s.tangent.z / h * sign];
      quad([at(s, -half, bottom), at(s, half, bottom), at(s, half, top), at(s, -half, top)], [normal, normal, normal, normal]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function buildMonorail(route, supportFloorHeight) {
  const group = new THREE.Group();
  group.name = 'Монорельс — одна центральная направляющая';
  const c = TRAM_CONSTANTS, floorHeight = route.config.floorHeight;
  // Sweep coordinates are relative to the first sample, which is the lower station.
  const height = route.sampleDistance(0).position.y;
  const beamTop = height - c.runningSurfaceDepth, beamBottom = beamTop - c.beamDepth;
  const stations = routeStations(route);
  const concrete = new THREE.MeshStandardMaterial({ color: 0xd2cabb, roughness: 0.88, metalness: 0 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9c9d96, roughness: 0.36, metalness: 0.72 });
  const glow = new THREE.MeshStandardMaterial({ color: 0xc8a57a, emissive: 0xd1a56b, emissiveIntensity: 0.40, roughness: 0.75, metalness: 0 });
  const addSweep = (name, width, top, bottom, material) => {
    const mesh = new THREE.Mesh(sweptRectangle(stations, width, top, bottom, route.closed === false), material);
    mesh.name = name;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    group.add(mesh);
    return mesh;
  };
  addSweep('Единственная несущая балка 0,95 × 0,72 м', c.beamWidth, beamTop, beamBottom, concrete);
  addSweep('Одна центральная металлическая рабочая поверхность', c.runningSurfaceWidth, height, beamTop, metal);
  // A single discreet strip UNDER the centre of the beam; no second visual rail.
  addSweep('Одна тёплая линия под балкой', 0.055, beamBottom + 0.006, beamBottom - 0.018, glow);

  const fallbackSupportCount = Math.max(4, Math.ceil(route.length / c.supportSpacing));
  const supportDistances = route.supportDistances || Array.from({ length: fallbackSupportCount }, (_, i) => i * route.length / fallbackSupportCount);
  const supportCount = supportDistances.length, supportRecords = [];
  let minFloorHeight = Infinity, maxFloorHeight = -Infinity;
  const columns = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.27, 0.34, 1, 10, 1), concrete, supportCount);
  const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1.12, 1, 0.58), concrete, supportCount);
  const feet = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.52, 0.60, 1, 12, 1), concrete, supportCount);
  columns.name = 'Опоры монорельса'; caps.name = 'Оголовки опор'; feet.name = 'Основания опор';
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3(), scale = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < supportCount; i++) {
    const sample = route.sampleDistance(supportDistances[i]);
    const sampleBeamBottom = sample.position.y - c.runningSurfaceDepth - c.beamDepth;
    let baseY = floorHeight;
    const anchor = route.supportAnchors?.[i];
    if (anchor && Math.abs(anchor.distance-supportDistances[i])<1e-6) baseY=anchor.floorY;
    else {
      try {
        const candidate=typeof supportFloorHeight==='function'?supportFloorHeight(sample.position.x,sample.position.z):floorHeight;
        if(Number.isFinite(candidate)&&candidate<=sampleBeamBottom-.65)baseY=candidate;
      } catch { /* The pre-existing legacy route keeps its documented fallback. */ }
    }
    const gap=sampleBeamBottom-baseY;
    if(gap<=.10)throw new Error('Монорельс: недостаточно места для опоры '+i);
    const footHeight=Math.min(.20,gap*.25),capHeight=Math.min(.20,gap*.25);
    const columnBottom=baseY+footHeight,sampleColumnTop=sampleBeamBottom-capHeight,columnHeight=sampleColumnTop-columnBottom;
    minFloorHeight=Math.min(minFloorHeight,baseY);maxFloorHeight=Math.max(maxFloorHeight,baseY);
    position.set(sample.position.x,(sampleColumnTop+columnBottom)/2,sample.position.z);
    matrix.compose(position,quaternion.identity(),scale.set(1,columnHeight,1));columns.setMatrixAt(i,matrix);
    position.y=sampleBeamBottom-capHeight/2;quaternion.setFromAxisAngle(UP,sample.heading);
    matrix.compose(position,quaternion,scale.set(1,capHeight,1));caps.setMatrixAt(i,matrix);
    position.y=baseY+footHeight/2;
    matrix.compose(position,quaternion.identity(),scale.set(1,footHeight,1));feet.setMatrixAt(i,matrix);
    supportRecords.push({index:i,distance:supportDistances[i],x:sample.position.x,z:sample.position.z,floorY:baseY,railY:sample.position.y,
      beamBottom:sampleBeamBottom,footRadius:.60,columnRadius:.34,capHalfWidth:.56,capHalfLength:.29,heading:sample.heading,
      footHeight,capHeight,columnHeight,source:anchor?'CAD floor triangles and swept support clearance':'runtime floor ray'});
  }
  for (const mesh of [columns, caps, feet]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const supportSpans = supportDistances.slice(1).map((d, i) => d - supportDistances[i]);
  if (route.closed !== false) supportSpans.push(route.length - supportDistances[supportCount - 1] + supportDistances[0]);
  const collisionObstacles = supportRecords.map(p => ({ id: 'monorail-support-' + p.index, kind: 'monorail-support', shape: 'cylinder', x: p.x, z: p.z, radius: p.footRadius, minY: p.floorY, maxY: p.beamBottom }));
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i].position, b = stations[i + 1].position;
    collisionObstacles.push({ id: 'monorail-beam-' + i, kind: 'monorail-beam', shape: 'capsule', start: [a.x, a.y - 0.78, a.z], end: [b.x, b.y - 0.78, b.z], radius: c.beamWidth / 2, minY: Math.min(a.y, b.y) - 0.78, maxY: Math.max(a.y, b.y) });
  }
  group.userData = { supportCount, supportSpacing: supportSpans.reduce((a,b) => a+b, 0) / supportSpans.length, minSupportSpacing: Math.min(...supportSpans), maxSupportSpacing: Math.max(...supportSpans), supportRecords, collisionObstacles, beamTop, beamBottom, minBeamBottom: Math.min(...stations.map(s => s.position.y - 0.78)), floorHeight, minFloorHeight, maxFloorHeight };
  return group;
}


/** A level deck whose footprint and fixed components are included in CAD/sweep QA. */
function buildBoardingStation(route, definition = route.station) {
  if (!definition) return null;
  if (!definition.fixedGeometry) return buildLegacyBoardingStation(route);
  const group=new THREE.Group();group.name=definition.label;
  const floorY=definition.platformY,width=definition.bridgeWidth,extension=definition.bridgeExtension,travel=definition.retractionTravel??extension;
  const steel=new THREE.MeshStandardMaterial({color:0xb3c8d0,roughness:.42,metalness:.55});
  const deckMaterial=new THREE.MeshStandardMaterial({color:0xbcb7a7,roughness:.82});
  const gold=new THREE.MeshStandardMaterial({color:0xe1bc73,roughness:.65});
  const corners=definition.fixedGeometry.coordinates[0],shape=new THREE.Shape();
  corners.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();
  const deckGeometry=new THREE.ExtrudeGeometry(shape,{depth:.12,bevelEnabled:false,steps:1});deckGeometry.rotateX(-Math.PI/2);
  const deck=new THREE.Mesh(deckGeometry,deckMaterial);deck.position.y=floorY-.12;deck.name='Неподвижный настил посадочного перехода';group.add(deck);
  let gate=null;
  const collisionObstacles=[];
  function box(parent,name,min,max,material){
    const size=max.map((v,i)=>v-min[i]),position=max.map((v,i)=>(v+min[i])/2);
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);mesh.position.fromArray(position);mesh.name=name;parent.add(mesh);return mesh;
  }
  for(const [index,part] of definition.bridgeComponents.entries()){
    if(part.kind==='deck'||part.kind==='elbow'){
      collisionObstacles.push({id:definition.id+'-deck-'+index,kind:'monorail-boarding-deck',shape:'obb',centerXZ:[(part.min[0]+part.max[0])/2,(part.min[2]+part.max[2])/2],halfSizeXZ:[(part.max[0]-part.min[0])/2,(part.max[2]-part.min[2])/2],rotationY:0,minY:part.min[1],maxY:part.max[1]});continue;
    }
    const mesh=box(group,part.kind==='gate'?'Посадочная калитка':part.kind==='post'?'Стойка поручня':'Поручень',part.min,part.max,part.kind==='gate'?gold:steel);
    if(part.kind==='gate')gate=mesh;
  }
  const sliding=new THREE.Group();sliding.name='Выдвижной посадочный край';group.add(sliding);
  const end=definition.bridgePath.at(-1),fixed=definition.fixedPath.at(-1),[dx,dz]=definition.retractDirection;
  if(extension>0){
    const ax=Math.abs(dx),az=Math.abs(dz),cx=(fixed[0]+end[0])/2,cz=(fixed[1]+end[1])/2;
    const halfX=(ax*extension+az*width)/2,halfZ=(az*extension+ax*width)/2;
    box(sliding,'Выдвижной настил',[cx-halfX,floorY-.10,cz-halfZ],[cx+halfX,floorY,cz+halfZ],deckMaterial);
    for(const sign of [-1,1]){
      const nx=-dz*sign*width/2,nz=dx*sign*width/2;
      box(sliding,'Выдвижной поручень',[Math.min(fixed[0],end[0])+nx-.0225,floorY+1.0775,Math.min(fixed[1],end[1])+nz-.0225],[Math.max(fixed[0],end[0])+nx+.0225,floorY+1.1225,Math.max(fixed[1],end[1])+nz+.0225],steel);
      box(sliding,'Стойка выдвижного края',[end[0]+nx-.0225,floorY,end[1]+nz-.0225],[end[0]+nx+.0225,floorY+1.12,end[1]+nz+.0225],steel);
    }
  }
  const canvas=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(1100,230):typeof document!=='undefined'?document.createElement('canvas'):null;
  if(canvas){canvas.width=1100;canvas.height=230;const context=canvas.getContext('2d');if(context){
    context.fillStyle='rgba(16,36,47,.94)';context.fillRect(0,0,1100,230);context.textAlign='center';context.fillStyle='#f1f8fb';context.font='600 55px sans-serif';context.fillText('Площадка '+definition.number+' · монорельс',550,85);
    context.fillStyle='#b7e7ef';context.font='38px sans-serif';context.fillText('Посадка и высадка',550,148);context.font='29px sans-serif';context.fillText('Кольцевой маршрут',550,198);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));label.position.set(definition.originalEdgePoint[0],floorY+2.6,definition.originalEdgePoint[2]);label.scale.set(7.5,1.57,1);group.add(label);
  }}
  group.userData={...definition,kind:'boarding-on-existing-terrace',provisional:true,sourceCadFileModified:false,passengerPurposeConfirmed:false,
    boardingVehicle:null,boardingOpen:false,gatePhase:'closed',retractableLength:extension,bridgeExtension:0,collisionObstacles};
  group.setBoardingState=(open,amount=0,phase='closed',vehicleIndex=null)=>{
    const a=Math.max(0,Math.min(1,amount));sliding.position.set(-dx*travel*(1-a),0,-dz*travel*(1-a));sliding.visible=extension>0&&a>1e-5;
    if(gate)gate.visible=!open;group.userData.boardingOpen=Boolean(open);group.userData.bridgeExtension=a;
    group.userData.gatePhase=phase;group.userData.boardingVehicle=vehicleIndex;
  };
  group.setBoardingState(false);return group;
}

/** Attaches a retractable level bridge to the original CAD terrace. */
function buildLegacyBoardingStation(route) {
  if (!route.station) return null;
  const group=new THREE.Group();group.name=MONORAIL_STATION_EVIDENCE.label;
  const floorY=16.65,edgeX=-16.184341430664062,z=route.station.centerZ;
  const halfWidth=2.2890363928/2,newEdge=route.station.railX-halfWidth-.15;
  const extension=route.station.bridgeExtension||0,fixedEdge=newEdge-extension,bridgeWidth=route.station.bridgeWidth||1.2;
  const gold=new THREE.MeshStandardMaterial({color:0xe1bc73,roughness:.75});
  const steel=new THREE.MeshStandardMaterial({color:0xb3c8d0,roughness:.42,metalness:.55});
  const deckMaterial=new THREE.MeshStandardMaterial({color:0xbcb7a7,roughness:.82});
  function box(parent,name,dimensions,position,material){const mesh=new THREE.Mesh(new THREE.BoxGeometry(...dimensions),material);mesh.name=name;mesh.position.set(...position);parent.add(mesh);return mesh;}
  const floorStart=edgeX-.025;
  box(group,'Настил, примыкающий к существующей площадке',[fixedEdge-floorStart,.12,bridgeWidth],[(fixedEdge+floorStart)/2,floorY-.06,z],deckMaterial);
  for(const side of [-1,1]){
    box(group,'Поручень неподвижной части',[fixedEdge-floorStart,.045,.045],[(fixedEdge+floorStart)/2,floorY+1.1,z+side*(bridgeWidth/2-.025)],steel);
    for(const x of [floorStart+.04,fixedEdge-.04])box(group,'Стойка посадочного мостика',[.045,1.1,.045],[x,floorY+.55,z+side*(bridgeWidth/2-.025)],steel);
  }
  const bridge=new THREE.Group();bridge.name='Выдвижной посадочный мостик';group.add(bridge);
  if(extension>0){
    box(bridge,'Выдвижной настил',[extension,.10,bridgeWidth],[fixedEdge+extension/2,floorY-.05,z],deckMaterial);
    for(const side of [-1,1]){
      box(bridge,'Выдвижной поручень',[extension,.045,.045],[fixedEdge+extension/2,floorY+1.1,z+side*(bridgeWidth/2-.025)],steel);
      box(bridge,'Крайняя стойка мостика',[.045,1.1,.045],[newEdge-.035,floorY+.55,z+side*(bridgeWidth/2-.025)],steel);
    }
  }
  const gate=box(group,'Посадочная калитка',[.06,.86,1.30],[fixedEdge-.04,floorY+.52,z],gold);
  const canvas=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(1100,250):typeof document!=='undefined'?document.createElement('canvas'):null;
  if(canvas){
    canvas.width=1100;canvas.height=250;const context=canvas.getContext('2d');
    if(context){context.fillStyle='rgba(16,36,47,.93)';context.fillRect(0,0,1100,250);context.strokeStyle='#74d0df';context.lineWidth=5;context.strokeRect(3,3,1094,244);
      context.textAlign='center';context.fillStyle='#f1f8fb';context.font='600 56px sans-serif';context.fillText('Посадка на монорельс',550,88);
      context.fillStyle='#b7e7ef';context.font='38px sans-serif';context.fillText('Кольцевой маршрут по парку',550,154);
      context.font='30px sans-serif';context.fillText('Площадка 16,65 м',550,207);
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
      const label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));label.position.set(edgeX-2.8,floorY+2.6,z);label.scale.set(7.6,1.73,1);group.add(label);
    }
  }
  group.userData={...MONORAIL_STATION_EVIDENCE,id:route.station.id,kind:'boarding-on-existing-terrace',provisional:true,sourceCadFileModified:false,
    platformY:floorY,railY:route.station.railY,boardingVehicle:null,sideGap:.15,gate:MONORAIL_BOARDING_GATE,
    bridgeLength:newEdge-edgeX,bridgeWidth,retractableLength:extension,bridgeExtension:0,boardingOpen:false,
    center:[-24.5,floorY,-67],focusPosition:[-4,25,-43],boardingPoint:[newEdge,floorY,z],originalEdgePoint:[edgeX,floorY,z],
    stoppedVehicleCenter:[route.station.railX,route.station.railY,z]};
  group.setBoardingState=(open,amount=0)=>{
    const a=Math.max(0,Math.min(1,amount));bridge.position.x=-extension*(1-a);bridge.visible=a>0.001;
    gate.visible=!open;group.userData.bridgeExtension=a;group.userData.boardingOpen=Boolean(open);
  };
  group.setBoardingState(false,0);return group;
}

function collectResources(root, resources) {
  root?.traverse(node => {
    if (node.geometry) resources.geometries.add(node.geometry);
    if (node.isInstancedMesh) resources.instances.add(node);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!material) continue;
      resources.materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) resources.textures.add(value);
    }
  });
}

/**
 * @param {object} options
 * @param {THREE.Scene|THREE.Group} options.scene Existing scene; metres, Y up.
 * @param {string} options.modelUrl Real static GLB; its nose points along +Z.
 * @param {object} options.loader Existing GLTFLoader with MeshoptDecoder configured.
 * @param {object} [options.routeConfig]
 * @param {(x:number,z:number)=>number} [options.supportFloorHeight] Surface Y beneath each support; invalid/failed queries use routeConfig.floorHeight.
 * @param {(state:object)=>void} [options.onState] Loading/ready/error/control changes; moving state at <=4 Hz.
 * @returns {Promise<object>} No replacement vehicle is used if the real GLB fails.
 */
export async function createTramSystem({ scene, modelUrl, loader, routeConfig, onState, supportFloorHeight } = {}) {
  if (!scene?.isObject3D || typeof scene.add !== 'function') throw new TypeError('Монорельс: scene должен быть Object3D.');
  if (typeof modelUrl !== 'string' || !modelUrl.trim()) throw new TypeError('Монорельс: нужен URL настоящего GLB вагона.');
  if (!loader || (typeof loader.loadAsync !== 'function' && typeof loader.load !== 'function')) {
    throw new TypeError('Монорельс: передайте настроенный GLTFLoader.');
  }
  const route = createMonorailRoute(routeConfig || MONORAIL_ROUTE_CONFIG);
  const group = new THREE.Group(); group.name = 'Монорельс — два вагона';
  const resources = { geometries: new Set(), materials: new Set(), textures: new Set(), instances: new Set() };
  const vehicles = [];
  let track, station, sourceBounds, sourceSize, scaledSize, wagonScale;
  const stationGroups=[];
  let loaded = false, disposed = false, playing = true, speedMultiplier = 1;
  const shuttle=route.routeMode==='shuttle',definitions=route.stations||(route.station?[route.station]:[]),loopWithStation=route.closed&&definitions.length>0;
  const dwellSeconds=18,bridgeSeconds=.8,closeSeconds=1,acceleration=TRAM_CONSTANTS.comfortAcceleration;
  const stops=loopWithStation?definitions.flatMap(st=>Array.from({length:TRAM_CONSTANTS.vehicleCount},(_,vehicleIndex)=>({phase:modulo((st.distance||0)-vehicleIndex*route.length/TRAM_CONSTANTS.vehicleCount,route.length),stationId:st.id,vehicleIndex}))).sort((a,b)=>a.phase-b.phase):[];
  let distance=shuttle?route.maxLeadingDistance:0,travelDirection=shuttle?-1:1,dwellRemaining=loopWithStation?dwellSeconds:shuttle?8:0;
  let activeStop=loopWithStation?stops.find(stop=>Math.abs(stop.phase)<1e-6):null,currentSpeed=0,currentAcceleration=0,stopSerial=0,pendingDisembark=null;
  const activeStation=()=>activeStop?stationGroups.find(item=>item.userData.id===activeStop.stationId):null;
  function dwellPhase(){if(!activeStop||dwellRemaining<=0)return 'closed';const elapsed=dwellSeconds-dwellRemaining;return elapsed<bridgeSeconds?'opening':dwellRemaining<=closeSeconds?'closing':elapsed<5?'alighting':'boarding';}
  function nextStopForVehicle(index){
    const d=modulo(distance+index*route.length/TRAM_CONSTANTS.vehicleCount,route.length);
    const list=definitions.map(item=>({id:item.id,label:item.label,number:item.number,distanceAhead:modulo((item.distance||0)-d,route.length)})).sort((a,b)=>a.distanceAhead-b.distanceAhead);
    return list[0]||null;
  }
  function exitPose(index){
    const current=activeStation();if(!current?.userData.boardingOpen||activeStop.vehicleIndex!==index)return null;
    const st=current.userData,feet=new THREE.Vector3(...st.disembarkPoint),position=feet.clone().add(new THREE.Vector3(0,1.65,0));
    const target=new THREE.Vector3(...st.originalEdgePoint).add(new THREE.Vector3(0,1.45,0));
    return {vehicleIndex:index,stationId:st.id,stationNumber:st.number,position,target,up:UP.clone(),feet,walkToPlatformPath:st.bridgePath.slice().reverse().map(([x,z])=>[x,st.platformY,z]),station:st};
  }
  // Every station-to-station leg uses a seventh-order easing law: velocity,
  // acceleration and jerk are all zero at each platform. Its duration is bounded
  // by the tightest bend encountered by either vehicle on that leg.
  function instantaneousCurveLimit(phase) {
    let limit=TRAM_CONSTANTS.baseSpeed;
    for(let i=0;i<TRAM_CONSTANTS.vehicleCount;i++) {
      const curvature=Math.abs(route.sampleDistance(phase+i*route.length/TRAM_CONSTANTS.vehicleCount).curvature||0);
      if(curvature>1e-7)limit=Math.min(limit,Math.sqrt(TRAM_CONSTANTS.maxLateralAcceleration/curvature),TRAM_CONSTANTS.maxTurnRate/curvature);
    }
    return limit;
  }
  const comfortLegs=loopWithStation?stops.map((stop,index)=>{
    const next=stops[(index+1)%stops.length],length=modulo(next.phase-stop.phase,route.length);
    let maxSpeed=TRAM_CONSTANTS.baseSpeed;
    const count=Math.max(1,Math.ceil(length/.25));
    for(let i=0;i<=count;i++)maxSpeed=Math.min(maxSpeed,instantaneousCurveLimit(stop.phase+length*i/count));
    maxSpeed*=.99;
    const duration=Math.max(2.1875*length/maxSpeed,Math.sqrt(7.514*length/acceleration),Math.cbrt(52.5*length/TRAM_CONSTANTS.comfortJerk));
    return {start:stop.phase,next,length,maxSpeed,duration};
  }):[];
  let activeLeg=null,legElapsed=0;
  const curveSpeedLimitAt=phase=>activeLeg?.maxSpeed??instantaneousCurveLimit(phase);
  let simulatedSeconds = 0, lastDelta = 0, sinceState = 0, errorMessage = null;
  let callbackError = null;
  const samples = Array.from({ length: TRAM_CONSTANTS.vehicleCount }, () => ({ position: new THREE.Vector3(), tangent: new THREE.Vector3() }));

  function getState() {
    return {
      status: disposed ? 'disposed' : errorMessage ? 'error' : loaded ? 'ready' : 'loading',
      loaded, playing: playing && !disposed, visible: group.visible && !disposed,
      vehicleCount: vehicles.length, expectedVehicleCount: TRAM_CONSTANTS.vehicleCount,
      trackLength: route.length, distance, phase: distance / route.length,
      baseSpeed: TRAM_CONSTANTS.baseSpeed, speedMultiplier,
      curveSpeedLimit:curveSpeedLimitAt(distance),acceleration:currentAcceleration,
      routeSmoothing:route.smoothing||null,
      speedMetersPerSecond: playing&&!disposed&&dwellRemaining<=0?(loopWithStation?currentSpeed:TRAM_CONSTANTS.baseSpeed)*speedMultiplier:0,
      routeMode: shuttle ? 'shuttle' : 'loop', travelDirection, dwellRemaining,
      shuttle: shuttle ? { enabled: true, direction: travelDirection, dwellRemaining, spacing: route.config.vehicleSpacing, nominalBodyGap: route.config.vehicleSpacing - TRAM_CONSTANTS.vehicleLength, leadingRange: [route.minLeadingDistance, route.maxLeadingDistance] } : null,
      boardingVehicle: activeStop?.vehicleIndex??(shuttle&&Math.abs(distance-route.maxLeadingDistance)<.02?0:null),
      activeStationId:activeStop?.stationId??null,stopSerial,dwellPhase:dwellPhase(),dwellSeconds,
      closed:route.closed!==false,boardingOpen:activeStation()?.userData.boardingOpen||false,
      canBoard:dwellPhase()==='boarding'&&Boolean(activeStation()?.userData.boardingOpen),
      nextStops:Array.from({length:vehicles.length},(_,i)=>({vehicleIndex:i,...nextStopForVehicle(i)})),
      disembarkRequest:pendingDisembark===null?null:{vehicleIndex:pendingDisembark,status:exitPose(pendingDisembark)?'ready':'waiting',stationId:exitPose(pendingDisembark)?.stationId||nextStopForVehicle(pendingDisembark)?.id},
      simulatedSeconds, lastDeltaSeconds: lastDelta,
      dimensions: { ...route.config, beamWidth: TRAM_CONSTANTS.beamWidth, beamDepth: TRAM_CONSTANTS.beamDepth,
        vehicleLength: TRAM_CONSTANTS.vehicleLength, vehicleWidth: scaledSize?.x ?? null, vehicleHeight: scaledSize?.y ?? null },
      supports: track ? { count: track.userData.supportCount, spacing: track.userData.supportSpacing,
        minFloorHeight: track.userData.minFloorHeight, maxFloorHeight: track.userData.maxFloorHeight,
        minSpacing: track.userData.minSupportSpacing, maxSpacing: track.userData.maxSupportSpacing,
        records: track.userData.supportRecords } : null,
      stations:stationGroups.map(item=>item.userData),stationCandidates:(route.stationCandidates||definitions).map(item=>({...item})),
      source: { modelUrl, scale: wagonScale ?? null, bounds: sourceBounds ? { min: sourceBounds.min.toArray(), max: sourceBounds.max.toArray() } : null },
      coordinateSystem: 'scene metres; Y up; route XZ; GLB nose +Z',
      alignmentStatus: 'presentation reconstruction, not surveyed or approved CAD alignment',
      vehicles: vehicles.map((vehicle, index) => ({
        index, position: vehicle.position.toArray(), heading: samples[index].heading,
        phase: samples[index].phase, distance: samples[index].distance,
      })),
      error: errorMessage, callbackError,
    };
  }
  function emit() {
    if (typeof onState !== 'function') return;
    try { onState(getState()); }
    catch (error) { callbackError = error?.message || String(error); }
  }
  function release() {
    group.removeFromParent();
    for (const instance of resources.instances) instance.dispose();
    for (const geometry of resources.geometries) geometry.dispose();
    for (const material of resources.materials) material.dispose();
    for (const texture of resources.textures) texture.dispose();
    for (const set of Object.values(resources)) set.clear();
    group.clear();
    for (const vehicle of vehicles) vehicle.clear();
    vehicles.length = 0;
  }
  function placeVehicles() {
    if(loopWithStation){
      for(const candidate of stationGroups){
        const selected=activeStop?.stationId===candidate.userData.id&&dwellRemaining>0;
        const elapsed=dwellSeconds-dwellRemaining,amount=selected?(dwellRemaining>closeSeconds?Math.min(1,elapsed/bridgeSeconds):Math.max(0,dwellRemaining/closeSeconds)):0;
        const open=selected&&elapsed>=bridgeSeconds&&dwellRemaining>closeSeconds;
        candidate.setBoardingState(open,amount,selected?dwellPhase():'closed',selected?activeStop.vehicleIndex:null);
      }
    }
    for (let index = 0; index < vehicles.length; index++) {
      const vehicleDistance = shuttle ? distance - index * route.config.vehicleSpacing : distance + index * route.length / TRAM_CONSTANTS.vehicleCount;
      const sample = route.sampleDistance(vehicleDistance, samples[index]);
      vehicles[index].position.copy(sample.position);
      const right = new THREE.Vector3(sample.tangent.z, 0, -sample.tangent.x).normalize();
      const up = sample.tangent.clone().cross(right).normalize();
      vehicles[index].quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, sample.tangent));
      vehicles[index].updateMatrix();
    }
  }
  emit();

  try {
    const gltf = typeof loader.loadAsync === 'function'
      ? await loader.loadAsync(modelUrl)
      : await new Promise((resolve, reject) => loader.load(modelUrl, resolve, undefined, reject));
    const source = gltf?.scene;
    if (!source?.isObject3D) throw new Error('GLB не содержит сцену.');
    collectResources(source, resources);
    let meshCount = 0, hasSkin = false;
    source.traverse(node => { if (node.isMesh) meshCount++; if (node.isSkinnedMesh) hasSkin = true; });
    if (!meshCount) throw new Error('GLB не содержит геометрию вагона.');
    if (hasSkin) throw new Error('Ожидался статический GLB вагона; SkinnedMesh не поддерживается этим модулем.');
    source.updateMatrixWorld(true);
    sourceBounds = new THREE.Box3().setFromObject(source, true);
    sourceSize = sourceBounds.getSize(new THREE.Vector3());
    if (sourceBounds.isEmpty() || !Number.isFinite(sourceSize.length()) || sourceSize.z <= 1e-8 || sourceSize.x <= 0 || sourceSize.y <= 0) {
      throw new Error('Некорректные габариты GLB; продольная ось должна быть +Z.');
    }
    wagonScale = TRAM_CONSTANTS.vehicleLength / sourceSize.z;
    scaledSize = sourceSize.clone().multiplyScalar(wagonScale);
    const sourceCenter = sourceBounds.getCenter(new THREE.Vector3());
    track = buildMonorail(route, supportFloorHeight); group.add(track); collectResources(track, resources);
    for(const definition of definitions){const item=buildBoardingStation(route,definition);if(item){stationGroups.push(item);group.add(item);collectResources(item,resources);}}
    station=stationGroups[0]||null;
    for (let index = 0; index < TRAM_CONSTANTS.vehicleCount; index++) {
      const vehicle = new THREE.Group(); vehicle.name = `Вагон монорельса ${index + 1}`;
      const normalization = new THREE.Group(); normalization.name = 'Масштаб 12 м и опора нижней точки на направляющую';
      normalization.scale.setScalar(wagonScale);
      normalization.position.set(-sourceCenter.x * wagonScale, -sourceBounds.min.y * wagonScale, -sourceCenter.z * wagonScale);
      const clone = source.clone(true);
      clone.traverse(node => { if (node.isMesh) { node.castShadow = false; node.receiveShadow = true; } });
      normalization.add(clone); vehicle.add(normalization);
      vehicle.userData = { index, phaseOffset: shuttle ? null : index / TRAM_CONSTANTS.vehicleCount, distanceOffset: shuttle ? -index * route.config.vehicleSpacing : null, sourceModelUrl: modelUrl };
      vehicles.push(vehicle); group.add(vehicle);
    }
    placeVehicles();
    loaded = true;
    scene.add(group);
    group.updateMatrixWorld(true);
    emit();
  } catch (cause) {
    loaded = false; playing = false;
    errorMessage = `Не удалось загрузить монорельс (${modelUrl}): ${cause?.message || String(cause)}`;
    release(); emit();
    const error = new Error(errorMessage); error.cause = cause; throw error;
  }

  return {
    group,route,vehicles,station,stations:stationGroups,
    update(deltaSeconds) {
      if (disposed || !loaded) return false;
      if (typeof deltaSeconds !== 'number' || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return false;
      lastDelta = Math.min(deltaSeconds, TRAM_CONSTANTS.maxDeltaSeconds);
      if (!playing || speedMultiplier === 0) return false;
      simulatedSeconds += lastDelta;
      if (shuttle) {
        if (dwellRemaining > 0) dwellRemaining = Math.max(0, dwellRemaining - lastDelta * speedMultiplier);
        else {
          distance += travelDirection * TRAM_CONSTANTS.baseSpeed * speedMultiplier * lastDelta;
          if (distance >= route.maxLeadingDistance) { distance = route.maxLeadingDistance; travelDirection = -1; dwellRemaining = 8; }
          if (distance <= route.minLeadingDistance) { distance = route.minLeadingDistance; travelDirection = 1; dwellRemaining = 4; }
        }
      } else if(loopWithStation){
        let dt=lastDelta*speedMultiplier;
        if(dwellRemaining>0){const used=Math.min(dt,dwellRemaining);dwellRemaining=Math.max(0,dwellRemaining-used);dt-=used;if(dwellRemaining===0){activeStop=null;currentSpeed=0;currentAcceleration=0;}}
        if(dt>0&&dwellRemaining===0){
          if(!activeLeg){
            activeLeg=comfortLegs.find(leg=>Math.abs(leg.start-distance)<1e-5)||comfortLegs[0];legElapsed=0;
          }
          const used=Math.min(dt,activeLeg.duration-legElapsed);legElapsed+=used;
          const u=Math.max(0,Math.min(1,legElapsed/activeLeg.duration)),v=1-u;
          const progress=u*u*u*u*(35+u*(-84+u*(70-20*u)));
          const derivative=140*u*u*u*v*v*v;
          const second=420*u*u*v*v*(1-2*u);
          distance=modulo(activeLeg.start+activeLeg.length*progress,route.length);
          currentSpeed=activeLeg.length/activeLeg.duration*derivative;
          currentAcceleration=activeLeg.length/(activeLeg.duration**2)*second;
          if(legElapsed>=activeLeg.duration-1e-9){
            distance=activeLeg.next.phase;activeStop=activeLeg.next;dwellRemaining=Math.max(0,dwellSeconds-(dt-used));
            currentSpeed=0;currentAcceleration=0;stopSerial++;activeLeg=null;legElapsed=0;
          }
        }
      } else distance = modulo(distance + TRAM_CONSTANTS.baseSpeed * speedMultiplier * lastDelta, route.length);
      placeVehicles();
      sinceState += lastDelta;
      if (sinceState >= 0.25) { sinceState %= 0.25; emit(); }
      return group.visible;
    },
    setPlaying(value) {
      if (disposed) return;
      playing = Boolean(value); lastDelta = 0; emit();
    },
    setSpeed(value) {
      if (disposed) return;
      finiteNumber(value, 'speedMultiplier');
      if (value < 0) throw new RangeError('Монорельс: скорость не может быть отрицательной.');
      speedMultiplier = Math.min(value, TRAM_CONSTANTS.maxSpeedMultiplier); emit();
    },
    setVisible(value) {
      if (disposed) return;
      group.visible = Boolean(value); emit();
    },
    getState,
    getStationPose(index=0) {
      if(disposed||!loaded)return null;const list=route.stationCandidates||definitions;
      const st=typeof index==='string'?list.find(item=>item.id===index):list[index];if(!st)return null;
      return {position:new THREE.Vector3(...st.focusPosition),target:new THREE.Vector3(...st.center),up:UP.clone(),station:st};
    },
    getStationCandidates(){return (route.stationCandidates||definitions).map(item=>({...item}));},
    getBoardingOptions(){const st=activeStation();return st?.userData.boardingOpen?[{stationId:st.userData.id,vehicleIndex:activeStop.vehicleIndex,canBoard:dwellPhase()==='boarding',canDisembark:true}]:[];},
    getDisembarkPose(index){if(!Number.isInteger(index)||index<0||index>=vehicles.length)return null;return exitPose(index);},
    requestDisembark(index){if(!Number.isInteger(index)||index<0||index>=vehicles.length)throw new RangeError('Монорельс: индекс вагона должен быть 0 или 1.');pendingDisembark=index;emit();return true;},
    cancelDisembarkRequest(){pendingDisembark=null;emit();},
    completeDisembark(){if(pendingDisembark===null)return null;const pose=exitPose(pendingDisembark);if(pose){pendingDisembark=null;emit();}return pose;},
    getSupportRecords(){return track?track.userData.supportRecords.map(record=>({...record})):[];},
    getRgoCanopyClearances(){return (route.rgoCanopyClearances||[]).map(item=>({...item}));},
    getCollisionObstacles(){return [...(track?.userData.collisionObstacles||[]),...stationGroups.flatMap(item=>item.userData.collisionObstacles||[])];},
    getFollowPose(index = 0) {
      if (disposed || !loaded) return null;
      if (!Number.isInteger(index) || index < 0 || index >= vehicles.length) throw new RangeError('Монорельс: индекс вагона должен быть 0 или 1.');
      const vehicle = vehicles[index];
      vehicle.updateWorldMatrix(true, false);
      const vehiclePosition = vehicle.getWorldPosition(new THREE.Vector3());
      const worldQuaternion = vehicle.getWorldQuaternion(new THREE.Quaternion());
      const tangent = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQuaternion).normalize();
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(worldQuaternion).normalize();
      return {
        index,
        position: vehiclePosition.clone().addScaledVector(tangent, -19.2).addScaledVector(up, Math.max(6, scaledSize.y * 1.4)),
        target: vehiclePosition.clone().addScaledVector(tangent, 4.2).addScaledVector(up, scaledSize.y * 0.55),
        up, tangent, travelTangent: tangent.clone().multiplyScalar(travelDirection), vehiclePosition, heading: samples[index].heading, travelDirection,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true; loaded = false; playing = false;
      release(); emit();
    },
  };
}
