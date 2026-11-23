import * as THREE from 'three';
import { EAST_ROUTE, createEastRoute } from './routes/east.js?v=1';
import { WEST_ALL_ROUTE, createWestAllRoute } from './routes/west.js?v=1';
import * as Northwest from './routes/northwest.js?v=1';
import * as Northeast from './routes/northeast.js?v=1';
import { VISITOR_CAMERA_PROFILES } from './visitor-camera.js?v=1';
import { groundAtXZ } from './routes/ground.js?v=1';

const wrap = THREE.MathUtils.euclideanModulo;

// Each route keeps the exact standard Three.js curve accepted against the
// pavilion geometry. All gait and camera sampling use this same arc distance.
export function createVisitorRoutes() {
  const entries = [
    { id: 'west', definition: WEST_ALL_ROUTE, path: createWestAllRoute(THREE), title: 'Западные залы' },
    { id: 'east', definition: EAST_ROUTE, path: createEastRoute(THREE), title: 'Вход, мастерские и финал' },
    { id: 'northwest', definition: Northwest.ROUTE_DEFINITIONS[0],
      path: Northwest.makeRoute(Northwest.ROUTE_DEFINITIONS[0]), title: 'Региональный зал' },
    { id: 'northeast', definition: Northeast.ROUTE_DEFINITIONS[0],
      path: Northeast.makeRoute(Northeast.ROUTE_DEFINITIONS[0]), title: 'Северная галерея' },
  ];
  return entries.map(({ id, definition, path, title }) => {
    const length = path.getLength();
    const camera = VISITOR_CAMERA_PROFILES[id];
    if (!(length > 0) || !camera?.keys?.length || camera.keys[0].distance !== 0) {
      throw new Error('Incomplete visitor route: ' + id);
    }
    const hasRoomIds = Boolean(definition.roomLabels);
    const rooms = hasRoomIds ? [...definition.rooms] : [definition.id];
    const roomLabels = hasRoomIds ? { ...definition.roomLabels }
      : { [definition.id]: definition.rooms[0] };
    const sections = definition.sections || [{ startPhase: 0, endPhase: 1, room: rooms[0] }];
    const toWorld = (point, tangent = false) => new THREE.Vector3(
      point.x, tangent ? 0 : definition.floorY, point.isVector2 ? point.y : point.z,
    );
    return {
      id, title, definitionId: definition.id, path, length, camera,
      floorY: definition.floorY, speed: definition.speed,
      sourceAvatar: definition.sourceAvatar || null,
      requiresTerrainGrounding: Boolean(definition.requiresTerrainGrounding),
      groundAt: definition.requiresTerrainGrounding
        ? (x, z) => groundAtXZ(x, z, definition.floorY) : () => definition.floorY,
      rooms, roomLabels, sections,
      waypoints: definition.waypoints || [],
      clearance: {
        bodyRadius: definition.bodyRadius,
        centerlineMinimum: definition.minimumStaticClearance,
        skinMargin: definition.minimumSkinClearance,
        minimumTurnRadius: definition.minimumTurnRadius || definition.radius,
      },
      pointAtDistance(distance) {
        return toWorld(path.getPointAt(wrap(distance / length, 1)));
      },
      tangentAtDistance(distance) {
        return toWorld(path.getTangentAt(wrap(distance / length, 1)), true).normalize();
      },
      roomAt(phase) {
        const section = sections.find(row => phase >= row.startPhase && phase < row.endPhase) || sections[0];
        return { id: section.room, title: roomLabels[section.room] || title };
      },
    };
  });
}
