import * as THREE from 'three';
export const ROUTE_DEFINITIONS = [
  {
    "id": "northwest-regions",
    "kind": "circle",
    "floorY": 0.0992,
    "speed": 1.04,
    "sourceAvatar": "emma",
    "rooms": [
      "Северо-западный региональный зал",
      "Обход центрального экспоната у арочных экранов"
    ],
    "center": [
      -16.15,
      -10.2
    ],
    "radius": 1.7,
    "clockwise": false
  }
];
class CircleXZ extends THREE.Curve {
  constructor(def){ super(); this.def=def; this.arcLengthDivisions=4096; this.circle=new THREE.EllipseCurve(def.center[0],def.center[1],def.radius,def.radius,0,Math.PI*2,Boolean(def.clockwise),0); }
  getPoint(t,target=new THREE.Vector3()){ const p=this.circle.getPoint(t); return target.set(p.x,this.def.floorY,p.y); }
  getTangent(t,target=new THREE.Vector3()){ const p=this.circle.getTangent(t); return target.set(p.x,0,p.y).normalize(); }
  getPointAt(u,target){return this.getPoint(u,target);}
  getTangentAt(u,target){return this.getTangent(u,target);}
  getLength(){return 2*Math.PI*this.def.radius;}
}
export function makeRoute(def){return new CircleXZ(def);}
export function roomAt(def){return def.rooms[0];}
