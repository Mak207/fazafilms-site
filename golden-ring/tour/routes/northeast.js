import * as THREE from 'three';
// Public front aisle inside the History/Map hall; avoids the raised central platform.
// One Ethan actor, with the same native Walk and measured shoe correction over the real thin tile.
export const ROUTE_DEFINITIONS = [
  {
    "id": "northeast-history-map",
    "kind": "hall-tour",
    "floorY": 0.0067,
    "speed": 0.78,
    "sourceAvatar": "ethan",
    "requiresTerrainGrounding": true,
    "rooms": [
      "history-map"
    ],
    "roomLabels": {
      "history-map": "История и карта"
    },
    "sourceZones": [
      {
        "number": 2,
        "title": "История"
      },
      {
        "number": 3,
        "title": "Карта"
      }
    ],
    "minimumTurnRadius": 1.3,
    "leftCenter": [
      9.5,
      -6
    ],
    "rightCenter": [
      33,
      -5.8
    ],
    "radius": 1.3,
    "floorLevels": {
      "base": 0.006600328723180907,
      "thinTile": 0.02121130356066983
    }
  }
];
export function makePath2D(def){
 const r=def.radius,l=def.leftCenter,rr=def.rightCenter,gateR=rr[0]-2*r;
 const spine=new THREE.Path();spine.moveTo(13,-6);
 spine.bezierCurveTo(14.5,-6,15.5,-4.25,17,-4.25);
 spine.bezierCurveTo(21,-4.25,26,-4.5,gateR,rr[1]+r);
 const right=new THREE.Path();right.moveTo(gateR,rr[1]+r);right.lineTo(rr[0],rr[1]+r);
 right.absarc(rr[0],rr[1],r,Math.PI/2,-Math.PI,true);
 right.absarc(gateR,rr[1],r,0,Math.PI/2,false);
 const left=new THREE.Path();left.moveTo(13,-6);
 left.bezierCurveTo(11.75,-6,10.75,l[1]+r,l[0],l[1]+r);
 left.absarc(l[0],l[1],r,Math.PI/2,Math.PI*1.5,false);
 left.bezierCurveTo(10.75,l[1]-r,11.75,-6,13,-6);
 const reverse=c=>c.isLineCurve?new THREE.LineCurve(c.v2.clone(),c.v1.clone()):c.isCubicBezierCurve?new THREE.CubicBezierCurve(c.v3.clone(),c.v2.clone(),c.v1.clone(),c.v0.clone()):new THREE.EllipseCurve(c.aX,c.aY,c.xRadius,c.yRadius,c.aEndAngle,c.aStartAngle,!c.aClockwise,c.aRotation);
 const p=new THREE.Path();p.curves=[...spine.curves,...right.curves,...spine.curves.slice().reverse().map(reverse),...left.curves].filter(c=>c.getLength()>1e-8);
 p.currentPoint.set(13,-6);p.arcLengthDivisions=16384;for(const c of p.curves)c.arcLengthDivisions=2048;p.updateArcLengths();return p;
}
class HallRouteXZ extends THREE.Curve{
 constructor(def){super();this.def=def;this.path=makePath2D(def);this.arcLengthDivisions=16384;}
 getPoint(t,target=new THREE.Vector3()){const p=this.path.getPointAt(t);return target.set(p.x,this.def.floorY,p.y);}
 getTangent(t,target=new THREE.Vector3()){const p=this.path.getTangentAt(t);return target.set(p.x,0,p.y).normalize();}
 getPointAt(u,target){return this.getPoint(u,target);}
 getTangentAt(u,target){return this.getTangent(u,target);}
 getLength(){return this.path.getLength();}
}
export function makeRoute(def){return new HallRouteXZ(def);}
export function roomAt(def){return def.roomLabels[def.rooms[0]];}
