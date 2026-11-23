// Exact Three.js route checked against the original pavilion GLB.
// Includes the accessible public floor under the final rings; avoids the raised centre.
export const EAST_ROUTE = {
  "id": "east-entrance-rings-workshops-central",
  "floorY": 0.0067,
  "speed": 1.04,
  "bodyRadius": 0.7,
  "minimumStaticClearance": 0.9206278925262381,
  "minimumTurnRadius": 1.9,
  "rooms": [
    "entrance",
    "rings",
    "workshops",
    "central-rectangle"
  ],
  "roomLabels": {
    "entrance": "Входной зал",
    "rings": "Финальный зал с кольцами",
    "workshops": "Мастерские",
    "central-rectangle": "Большой прямоугольный зал"
  },
  "sections": [
    {
      "room": "workshops",
      "startDistance": 0,
      "endDistance": 14.178657680235627,
      "startPhase": 0,
      "endPhase": 0.10117009132420092
    },
    {
      "room": "rings",
      "startDistance": 14.178657680235627,
      "endDistance": 28.977256669480145,
      "startPhase": 0.10117009132420092,
      "endPhase": 0.206763698630137
    },
    {
      "room": "entrance",
      "startDistance": 28.977256669480145,
      "endDistance": 73.03308582259592,
      "startPhase": 0.206763698630137,
      "endPhase": 0.5211187214611872
    },
    {
      "room": "rings",
      "startDistance": 73.03308582259592,
      "endDistance": 87.83168481184043,
      "startPhase": 0.5211187214611872,
      "endPhase": 0.6267123287671232
    },
    {
      "room": "workshops",
      "startDistance": 87.83168481184043,
      "endDistance": 102.79026865502273,
      "startPhase": 0.6267123287671232,
      "endPhase": 0.7334474885844748
    },
    {
      "room": "central-rectangle",
      "startDistance": 102.79026865502273,
      "endDistance": 139.34680777980515,
      "startPhase": 0.7334474885844748,
      "endPhase": 0.9942922374429224
    },
    {
      "room": "workshops",
      "startDistance": 139.34680777980515,
      "endDistance": 140.14673204949403,
      "startPhase": 0.9942922374429224,
      "endPhase": 1
    }
  ],
  "waypoints": [
    {
      "room": "workshops",
      "phase": 0.061215753424657536,
      "distance": 8.579187792413377,
      "point": [
        13.994675054558519,
        0.0067,
        13.8
      ],
      "tangent": [
        0.9999999457911549,
        0,
        -0.0003292684120750995
      ]
    },
    {
      "room": "rings",
      "phase": 0.56949200913242,
      "distance": 79.81244400820928,
      "point": [
        26.002931705105528,
        0.0067,
        8.200001648428731
      ],
      "tangent": [
        -0.9999993625115762,
        0,
        -0.0011291485470227133
      ]
    },
    {
      "room": "entrance",
      "phase": 0.3588755707762557,
      "distance": 50.295238456689134,
      "point": [
        36.94081900804265,
        0.0067,
        0.00002107276434548666
      ],
      "tangent": [
        -0.9999894636178271,
        0,
        0.004590495978678433
      ]
    },
    {
      "room": "central-rectangle",
      "phase": 0.8674372146118722,
      "distance": 121.5684908859695,
      "point": [
        9.502730387208528,
        0.0067,
        0.10000000000000005
      ],
      "tangent": [
        1,
        0,
        0
      ]
    }
  ]
};
export function createEastRoute(THREE) {
  const spine=new THREE.Path();
  spine.moveTo(10,8.4); spine.lineTo(10,11.9);
  spine.absarc(11.9,11.9,1.9,Math.PI,Math.PI/2,true);
  spine.lineTo(14,13.8);
  spine.bezierCurveTo(17,13.8,19,10.5,22,10.5);
  // Enter the public floor beneath the rings, in front of the raised centre.
  spine.bezierCurveTo(24,10.5,24,8.2,26,8.2);
  spine.bezierCurveTo(28,8.2,28,10.5,30,10.5);
  spine.lineTo(32,10.5);
  spine.bezierCurveTo(34,10.5,34.85,13.25,36.85,13.25);
  spine.absarc(36.85,11.15,2.1,Math.PI/2,0,true);
  spine.lineTo(38.95,10);
  const entrance=new THREE.Path();
  entrance.moveTo(38.95,10);entrance.lineTo(38.95,2);
  entrance.absarc(36.95,2,2,0,-Math.PI,true);
  entrance.lineTo(34.95,3.5);
  entrance.bezierCurveTo(34.95,6.5,38.95,7,38.95,10);
  const central=new THREE.Path();
  central.moveTo(10,8.4);central.lineTo(10,7.6);
  central.absarc(7.5,7.6,2.5,0,-Math.PI/2,true);
  central.lineTo(5,5.1);
  central.absarc(5,2.6,2.5,Math.PI/2,Math.PI*1.5,false);
  central.lineTo(14,.1);
  central.absarc(14,2.6,2.5,-Math.PI/2,Math.PI/2,false);
  central.lineTo(12.5,5.1);
  central.absarc(12.5,7.6,2.5,-Math.PI/2,-Math.PI,true);
  central.lineTo(10,8.4);
  const reverseCurve=c=>{
    if(c.isLineCurve)return new THREE.LineCurve(c.v2.clone(),c.v1.clone());
    if(c.isCubicBezierCurve)return new THREE.CubicBezierCurve(c.v3.clone(),c.v2.clone(),c.v1.clone(),c.v0.clone());
    if(c.isEllipseCurve)return new THREE.EllipseCurve(c.aX,c.aY,c.xRadius,c.yRadius,c.aEndAngle,c.aStartAngle,!c.aClockwise,c.aRotation);
    throw new Error('Unsupported standard path segment');
  };
  const path=new THREE.Path();
  path.curves=[...spine.curves,...entrance.curves,...spine.curves.slice().reverse().map(reverseCurve),...central.curves];
  path.curves=path.curves.filter(c=>c.getLength()>1e-8);
  path.currentPoint.copy(new THREE.Vector2(10,8.4));
  path.arcLengthDivisions=16384;
  for(const c of path.curves)c.arcLengthDivisions=2048;
  path.updateArcLengths();
  return path;
}
