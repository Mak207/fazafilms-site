// Exact XZ geometry is identical to west-stage-route-design.mjs (SHA256 7eecc6e640a00c4b799e3a250c293f5981778b093e91a8a13ffaf3f19ad35189).
// Validated against original pavilion.glb b3baac592a3b46b0a9577e61f92142e23aa44ee945ed2afbf2c8c905270712dc.
// Covers public main-stage visitor route (source 02-route-plan.png, zone8), south halls and north-middle hall.
// One actor reuses connecting passages in opposite directions; all joins and loop seam are C1.
// Thin .0212113m tile overlay requires actual weighted-shoe terrain grounding. thinFloorIntervals are diagnostic centre samples, not a centre-height animation rule.
// Native gait/contact acceptance requires integrated continuous viewport review.
export const WEST_ALL_ROUTE = {
  "id": "west-complete-main-stage",
  "floorY": 0.0067,
  "speed": 1,
  "bodyRadius": 0.7,
  "minimumStaticClearance": 0.8682139761416111,
  "minimumTurnRadius": 1.4,
  "requiresTerrainGrounding": true,
  "floorLevels": {
    "base": 0.006600328723180907,
    "thinTile": 0.02121130356066983
  },
  "thinFloorIntervals": [
    {
      "startPhase": 0.6601072035233049,
      "endPhase": 0.7449691997120411,
      "startDistance": 116.30242792822195,
      "endDistance": 131.25402388552482,
      "height": 0.02121130356066983
    },
    {
      "startPhase": 0.7798246803631765,
      "endPhase": 0.9024314711459571,
      "startDistance": 137.39511279456153,
      "endDistance": 158.99685774207217,
      "height": 0.02121130356066983
    }
  ],
  "rooms": [
    "west-hall",
    "main-stage",
    "bells-front",
    "south-pocket",
    "north-passage",
    "north-middle"
  ],
  "roomLabels": {
    "west-hall": "Ярославль · западный зал",
    "main-stage": "Главная сцена",
    "bells-front": "Сергиев Посад · колокола",
    "south-pocket": "Кострома и Иваново",
    "north-passage": "Северный переход",
    "north-middle": "Владимир · северный зал"
  },
  "sections": [
    {
      "room": "west-hall",
      "startDistance": 0,
      "endDistance": 1.574813029104243,
      "startPhase": 0,
      "endPhase": 0.008938295126182922
    },
    {
      "room": "bells-front",
      "startDistance": 1.574813029104243,
      "endDistance": 8.903347923599872,
      "startPhase": 0.008938295126182922,
      "endPhase": 0.05053346008795043
    },
    {
      "room": "south-pocket",
      "startDistance": 8.903347923599872,
      "endDistance": 35.652733572181916,
      "startPhase": 0.05053346008795043,
      "endPhase": 0.20235713626562685
    },
    {
      "room": "bells-front",
      "startDistance": 35.652733572181916,
      "endDistance": 42.9812687114398,
      "startPhase": 0.20235713626562685,
      "endPhase": 0.24395230261661152
    },
    {
      "room": "west-hall",
      "startDistance": 42.9812687114398,
      "endDistance": 52.87325622198014,
      "startPhase": 0.24395230261661152,
      "endPhase": 0.3000970652771142
    },
    {
      "room": "north-passage",
      "startDistance": 52.87325622198014,
      "endDistance": 54.105931752992056,
      "startPhase": 0.3000970652771142,
      "endPhase": 0.3070934626191376
    },
    {
      "room": "west-hall",
      "startDistance": 54.105931752992056,
      "endDistance": 67.42538150338733,
      "startPhase": 0.3070934626191376,
      "endPhase": 0.38269175307468084
    },
    {
      "room": "main-stage",
      "startDistance": 67.42538150338733,
      "endDistance": 84.83905156007114,
      "startPhase": 0.38269175307468084,
      "endPhase": 0.481527944622542
    },
    {
      "room": "bells-front",
      "startDistance": 84.83905156007114,
      "endDistance": 96.97935109871385,
      "startPhase": 0.481527944622542,
      "endPhase": 0.5504336357688577
    },
    {
      "room": "west-hall",
      "startDistance": 96.97935109871385,
      "endDistance": 106.73100274651266,
      "startPhase": 0.5504336357688577,
      "endPhase": 0.6057818826939751
    },
    {
      "room": "north-passage",
      "startDistance": 106.73100274651266,
      "endDistance": 128.62954568256552,
      "startPhase": 0.6057818826939751,
      "endPhase": 0.7300732340978708
    },
    {
      "room": "north-middle",
      "startDistance": 128.62954568256552,
      "endDistance": 146.66973998773773,
      "startPhase": 0.7300732340978708,
      "endPhase": 0.8324654405714431
    },
    {
      "room": "north-passage",
      "startDistance": 146.66973998773773,
      "endDistance": 168.5178252972635,
      "startPhase": 0.8324654405714431,
      "endPhase": 0.9564704054971152
    },
    {
      "room": "west-hall",
      "startDistance": 168.5178252972635,
      "endDistance": 176.18718188115625,
      "startPhase": 0.9564704054971152,
      "endPhase": 1
    }
  ],
  "waypoints": [
    {
      "room": "west-hall",
      "phase": 0.2788,
      "distance": 49.120986308466364,
      "point": [
        -21.31060668713446,
        0.0067,
        1.1764633566725884
      ],
      "tangent": [
        -0.5024966398410333,
        0,
        -0.8645791617593331
      ]
    },
    {
      "room": "main-stage",
      "phase": 0.43355,
      "distance": 76.38595270457529,
      "point": [
        -33.3,
        0.0067,
        1.9978196998031597
      ],
      "tangent": [
        0,
        0,
        1
      ]
    },
    {
      "room": "bells-front",
      "phase": 0.5375,
      "distance": 94.70061026112148,
      "point": [
        -22.63620150939327,
        0.0067,
        8.38068148189296
      ],
      "tangent": [
        0.6643873821335521,
        0,
        -0.7473883906388468
      ]
    },
    {
      "room": "south-pocket",
      "phase": 0.1186,
      "distance": 20.895799771105132,
      "point": [
        -2.600003417055324,
        0.0067,
        11.696906823116777
      ],
      "tangent": [
        -0.0022094120594456155,
        0,
        -0.9999975592461972
      ]
    },
    {
      "room": "north-passage",
      "phase": 0.686,
      "distance": 120.8644067704732,
      "point": [
        -6.976916517968741,
        0.0067,
        -10.708968719936754
      ],
      "tangent": [
        0.9703823432444242,
        0,
        -0.24157422859125643
      ]
    },
    {
      "room": "north-middle",
      "phase": 0.78125,
      "distance": 137.64623584465332,
      "point": [
        6.599997098106964,
        0.0067,
        -7.203406987484391
      ],
      "tangent": [
        0.0017034937421882817,
        0,
        0.9999985490534826
      ]
    }
  ],
  "bounds": {
    "x": [
      -33.3,
      6.5999999706324965
    ],
    "z": [
      -10.8,
      14.199999488422591
    ]
  }
};
export function createWestAllRoute(THREE){
 const spine=new THREE.Path();
 spine.moveTo(-19,5);spine.bezierCurveTo(-19,8,-13.736370828390449,10.728189745631054,-9.736370828390449,13);
 const south=new THREE.Path();
 south.moveTo(-9.736370828390449,13);south.bezierCurveTo(-6.343960456352729,14.926728167555716,-5.830836169111153,13.1,-4,13.1);
 south.absarc(-4,11.7,1.4,Math.PI/2,-Math.PI,true);
 south.bezierCurveTo(-5.4,12.0666666667,-5.3,12.4333333333,-5.3,12.8);
 south.absarc(-6.7,12.8,1.4,0,Math.PI/2,false);
 south.bezierCurveTo(-7.2,14.2,-7.736370828390449,14.135905127184472,-9.736370828390449,13);
 const northJoin=new THREE.Path();
 northJoin.moveTo(-19,5);northJoin.bezierCurveTo(-19,2.8,-21.7,2,-21.7,-.2);
 northJoin.bezierCurveTo(-21.7,-8,-25.5,-10.75,-28,-9);
 northJoin.bezierCurveTo(-29.421413030766267,-8.005010878463613,-33.3,-3.852497499811172,-33.3,-0.20957368438634785);
 northJoin.lineTo(-33.3,4.5);
 northJoin.bezierCurveTo(-33.3,7.126461147516989,-30.069061558044492,11.630509162916296,-28,11.630509162916296);
 northJoin.bezierCurveTo(-25.8,11.630509162916296,-21,7.915285549797007,-21,5);
 northJoin.bezierCurveTo(-21,0,-19.5,-1.875,-17,-3.6);
 const northSpine=new THREE.Path();
 northSpine.moveTo(-17,-3.6);northSpine.bezierCurveTo(-14,-5.67,-9,-10.8,-6.3,-10.8);
 northSpine.lineTo(-4.4,-10.8);
 northSpine.bezierCurveTo(-1.7,-10.8,-1.7,-7.2,1,-7.2);
 const middle=new THREE.Path();
 middle.moveTo(1,-7.2);middle.bezierCurveTo(2.8,-7.2,2.8,-9.2,4.6,-9.2);
 middle.absarc(4.6,-7.2,2,-Math.PI/2,Math.PI/2,false);
 middle.bezierCurveTo(2.8,-5.2,2.8,-7.2,1,-7.2);
 const westReturn=new THREE.Path();
 westReturn.moveTo(-17,-3.6);westReturn.bezierCurveTo(-19,-2.22,-19,-1.6,-19,-.2);westReturn.lineTo(-19,5);
 const reverseCurve=c=>{
  if(c.isLineCurve)return new THREE.LineCurve(c.v2.clone(),c.v1.clone());
  if(c.isCubicBezierCurve)return new THREE.CubicBezierCurve(c.v3.clone(),c.v2.clone(),c.v1.clone(),c.v0.clone());
  if(c.isEllipseCurve)return new THREE.EllipseCurve(c.aX,c.aY,c.xRadius,c.yRadius,c.aEndAngle,c.aStartAngle,!c.aClockwise,c.aRotation);
  throw Error('Unsupported standard curve');
 };
 const path=new THREE.Path();
 path.curves=[...spine.curves,...south.curves,...spine.curves.slice().reverse().map(reverseCurve),...northJoin.curves,...northSpine.curves,...middle.curves,...northSpine.curves.slice().reverse().map(reverseCurve),...westReturn.curves].filter(c=>c.getLength()>1e-8);
 path.currentPoint.set(-19,5);path.arcLengthDivisions=32768;
 for(const c of path.curves)c.arcLengthDivisions=2048;
 path.updateArcLengths();return path;
}
