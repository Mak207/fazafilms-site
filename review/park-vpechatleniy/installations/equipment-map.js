/** Equipment planning map. Coordinates are the exhibition model's X/Z metres. */
const NS = 'http://www.w3.org/2000/svg';
const VERSION = 'equipment-3d-20261125';
// Current published monorail, sampled at <= 1 m; support centres use the smooth route exactly.
const TRANSPORT = {"source":"perimeter-route.js + perimeter-smoothing.js · park-exhibition-20261125-r2","lengthM":354.30459,"widthM":2.8,"supports":[{"x":-10.43897,"z":-72.85858,"floorY":7.2,"beamBottom":15.34828},{"x":-1.2663,"z":-75.38625,"floorY":13.2,"beamBottom":15.87108},{"x":4.17985,"z":-66.91636,"floorY":13.2,"beamBottom":15.61898},{"x":11.81529,"z":-60.72794,"floorY":7.2,"beamBottom":15.38403},{"x":22.69407,"z":-60.37038,"floorY":7.2,"beamBottom":15.37015},{"x":30.87075,"z":-54.90329,"floorY":7.2,"beamBottom":15.37432},{"x":31.69991,"z":-44.16434,"floorY":7.2,"beamBottom":15.3799},{"x":31.68664,"z":-34.22186,"floorY":7.2,"beamBottom":15.38497},{"x":30.00061,"z":-22.49311,"floorY":7.2,"beamBottom":15.39107},{"x":28.05297,"z":-11.80931,"floorY":7.2,"beamBottom":15.39665},{"x":28,"z":-0.86895,"floorY":13.2,"beamBottom":15.40224},{"x":27.93419,"z":10.06315,"floorY":13.2,"beamBottom":15.40782},{"x":23.12302,"z":18.82454,"floorY":13.2,"beamBottom":15.41341},{"x":14.97242,"z":25.29441,"floorY":7.2,"beamBottom":15.41878},{"x":14,"z":35.96268,"floorY":7.2,"beamBottom":15.42},{"x":13.07558,"z":46.67241,"floorY":7.2,"beamBottom":15.02804},{"x":6.02362,"z":54.53411,"floorY":7.2,"beamBottom":14.47953},{"x":2.55927,"z":64.39418,"floorY":13.2,"beamBottom":14.47},{"x":-5.98208,"z":69.61571,"floorY":13.2,"beamBottom":14.51285},{"x":-14.54144,"z":64.42586,"floorY":13.2,"beamBottom":15.21227},{"x":-15.99881,"z":53.84047,"floorY":13.2,"beamBottom":16.07409},{"x":-16,"z":42.89755,"floorY":13.2,"beamBottom":16.83741},{"x":-16,"z":31.95453,"floorY":13.2,"beamBottom":16.92},{"x":-16.009,"z":20.51282,"floorY":13.2,"beamBottom":16.92},{"x":-18.77942,"z":11.14936,"floorY":13.2,"beamBottom":16.92},{"x":-27.56595,"z":5.08242,"floorY":13.2,"beamBottom":16.92},{"x":-29.99557,"z":-5.01361,"floorY":13.2,"beamBottom":16.92},{"x":-30,"z":-15.95614,"floorY":13.2,"beamBottom":16.92},{"x":-29.9999,"z":-26.89915,"floorY":13.2,"beamBottom":16.85501},{"x":-29.17044,"z":-37.65121,"floorY":13.2,"beamBottom":16.34594},{"x":-21.75108,"z":-45.07165,"floorY":7.2,"beamBottom":15.78359},{"x":-13.63064,"z":-51.91762,"floorY":7.2,"beamBottom":15.233},{"x":-12.3,"z":-61.75,"floorY":13.2,"beamBottom":15.07}],"points":[[-12.3,-62.5,15.07],[-12.3,-63.49804,15.07],[-12.29978,-64.49608,15.07004],[-12.29156,-65.49408,15.07153],[-12.25215,-66.49126,15.0787],[-12.17115,-67.48596,15.09333],[-12.05936,-68.47764,15.11301],[-11.88697,-69.46045,15.14222],[-11.63416,-70.42558,15.18287],[-11.28627,-71.36051,15.23512],[-10.83444,-72.24975,15.29768],[-10.27677,-73.07665,15.36806],[-9.61771,-73.82519,15.44331],[-8.86645,-74.48113,15.52048],[-8.03531,-75.03234,15.5967],[-7.13863,-75.46891,15.66899],[-6.1921,-75.7831,15.73414],[-5.21233,-75.96935,15.78894],[-4.21654,-76.0244,15.83073],[-3.22222,-75.94727,15.85808],[-2.24683,-75.73934,15.87109],[-1.3075,-75.40425,15.87133],[-0.42069,-74.94795,15.86133],[0.39819,-74.37867,15.84388],[1.13546,-73.70703,15.82154],[1.7804,-72.94623,15.79633],[2.32738,-72.11212,15.76968],[2.77872,-71.22246,15.74246],[3.14688,-70.29509,15.71516],[3.45457,-69.34576,15.68797],[3.73219,-68.38712,15.66085],[4.01388,-67.42968,15.63371],[4.33329,-66.48427,15.60642],[4.71932,-65.56424,15.57892],[5.1924,-64.68598,15.55129],[5.76241,-63.86747,15.52373],[6.4293,-63.12584,15.49664],[7.18537,-62.4754,15.47063],[8.01794,-61.9262,15.44652],[8.91139,-61.48274,15.42524],[9.84923,-61.14273,15.40757],[10.81615,-60.89682,15.39391],[11.79993,-60.73,15.38415],[12.79198,-60.62147,15.37757],[13.78689,-60.54313,15.3727],[14.7842,-60.507,15.37044],[15.78221,-60.50012,15.37001],[16.78025,-60.5,15.37],[17.77829,-60.5,15.37],[18.77633,-60.5,15.37],[19.77438,-60.49966,15.37],[20.77235,-60.48994,15.37001],[21.76939,-60.44715,15.37006],[22.7639,-60.36367,15.37016],[23.75515,-60.24834,15.3703],[24.73694,-60.07026,15.3705],[25.7002,-59.81046,15.37077],[26.63214,-59.45466,15.37112],[27.51711,-58.99454,15.37154],[28.33852,-58.42882,15.37201],[29.08077,-57.76266,15.37251],[29.73071,-57.00617,15.37304],[30.27895,-56.17298,15.37357],[30.72134,-55.27899,15.3741],[31.06031,-54.34078,15.37463],[31.30531,-53.37363,15.37516],[31.47139,-52.38972,15.37568],[31.57642,-51.39733,15.3762],[31.63805,-50.40125,15.37671],[31.67139,-49.40378,15.37723],[31.68791,-48.40589,15.37774],[31.69536,-47.40787,15.37825],[31.6984,-46.40984,15.37875],[31.69951,-45.4118,15.37926],[31.69987,-44.41376,15.37977],[31.69997,-43.41572,15.38028],[31.7,-42.41767,15.38079],[31.7,-41.41963,15.3813],[31.69998,-40.42159,15.38181],[31.69993,-39.42355,15.38232],[31.69976,-38.42551,15.38283],[31.69926,-37.42747,15.38334],[31.69798,-36.42943,15.38385],[31.69498,-35.43139,15.38436],[31.68864,-34.43337,15.38487],[31.67636,-33.43541,15.38538],[31.65445,-32.43761,15.38589],[31.61828,-31.44024,15.3864],[31.56256,-30.44378,15.38691],[31.48191,-29.44903,15.38742],[31.37157,-28.45715,15.38793],[31.22802,-27.46954,15.38844],[31.04964,-26.48762,15.38895],[30.83713,-25.51252,15.38946],[30.59387,-24.54461,15.38998],[30.32583,-23.58326,15.39049],[30.0412,-22.62667,15.391],[29.74976,-21.67213,15.39151],[29.4619,-20.71651,15.39202],[29.1877,-19.75689,15.39253],[28.93592,-18.79116,15.39304],[28.7133,-17.81831,15.39355],[28.52404,-16.83843,15.39406],[28.36966,-15.85245,15.39458],[28.24923,-14.86175,15.39509],[28.15976,-13.86776,15.3956],[28.0968,-12.87173,15.39611],[28.05509,-11.87458,15.39662],[28.02926,-10.87688,15.39713],[28.01441,-9.87895,15.39764],[28.00654,-8.88094,15.39815],[28.00272,-7.88291,15.39866],[28.00102,-6.88487,15.39917],[28.00035,-5.88683,15.39968],[28.0001,-4.88879,15.40019],[28.00003,-3.89075,15.4007],[28.00001,-2.89271,15.4012],[28,-1.89467,15.40171],[28,-0.89662,15.40222],[28,0.10142,15.40273],[28,1.09946,15.40324],[28,2.0975,15.40375],[27.99997,3.09554,15.40426],[27.99986,4.09358,15.40477],[27.99947,5.09162,15.40528],[27.99826,6.08966,15.40579],[27.99499,7.0877,15.4063],[27.98698,8.08571,15.40681],[27.96923,9.08358,15.40732],[27.93333,10.08095,15.40783],[27.86667,11.0767,15.40835],[27.75229,12.06803,15.40887],[27.56995,13.049,15.40939],[27.29896,14.00909,15.40992],[26.92275,14.93286,15.41046],[26.43402,15.80226,15.411],[25.83751,16.60159,15.41154],[25.14815,17.32253,15.41208],[24.38593,17.96621,15.41261],[23.57091,18.54185,15.41313],[22.72046,19.06393,15.41365],[21.84863,19.54966,15.41416],[20.96698,20.01738,15.41468],[20.0857,20.48581,15.41519],[19.21505,20.97363,15.4157],[18.36672,21.49914,15.41622],[17.55501,22.07942,15.41674],[16.79752,22.72864,15.41726],[16.11444,23.45552,15.41777],[15.52557,24.26049,15.41826],[15.04525,25.13456,15.4187],[14.6773,26.06166,15.41909],[14.41359,27.0238,15.4194],[14.23707,28.00584,15.41963],[14.12693,28.99766,15.41979],[14.05682,29.99321,15.4199],[14.01465,30.99031,15.41997],[14.00131,31.98824,15.42],[14,32.98628,15.42],[14,33.98433,15.42],[14,34.98237,15.42],[14,35.98041,15.42],[13.99995,36.97845,15.41963],[13.99921,37.97649,15.41591],[13.99583,38.97452,15.40474],[13.98777,39.97253,15.38774],[13.97102,40.97043,15.36407],[13.93713,41.96787,15.33007],[13.87432,42.96388,15.28489],[13.76705,43.95602,15.22888],[13.59736,44.9393,15.16346],[13.34772,45.90527,15.09083],[13.00517,46.8422,15.01358],[12.56505,47.73742,14.93433],[12.03238,48.5809,14.85556],[11.41996,49.36852,14.7797],[10.74472,50.10316,14.70916],[10.02449,50.7939,14.64627],[9.2764,51.45448,14.59298],[8.51673,52.10178,14.5505],[7.76192,52.7547,14.51894],[7.02988,53.43295,14.49734],[6.34142,54.15519,14.48387],[5.72012,54.93571,14.47632],[5.18883,55.7799,14.47257],[4.7617,56.68128,14.47093],[4.43591,57.62422,14.4703],[4.19029,58.59137,14.47009],[3.9919,59.56945,14.47002],[3.80443,60.54973,14.47],[3.59406,61.52528,14.47],[3.33306,62.48841,14.47],[3.00166,63.42952,14.47],[2.58852,64.33764,14.47],[2.08961,65.20156,14.47],[1.50616,66.01076,14.47],[0.84276,66.75581,14.47003],[0.10593,67.42833,14.47011],[-0.69656,68.02095,14.47037],[-1.55612,68.52726,14.47112],[-2.46351,68.94178,14.47297],[-3.40897,69.26006,14.47708],[-4.38232,69.47868,14.48524],[-5.37307,69.59527,14.49977],[-6.37058,69.60858,14.52315],[-7.36409,69.51848,14.55736],[-8.34293,69.32592,14.6032],[-9.29654,69.03299,14.66006],[-10.21468,68.64284,14.72612],[-11.08745,68.15966,14.79893],[-11.90547,67.58866,14.87609],[-12.65996,66.93602,14.95573],[-13.34291,66.20885,15.0366],[-13.94731,65.41518,15.11798],[-14.46766,64.56403,15.19948],[-14.90073,63.66528,15.2809],[-15.2466,62.72946,15.36206],[-15.50966,61.767,15.44283],[-15.69877,60.78724,15.52312],[-15.82639,59.79752,15.60293],[-15.90672,58.80279,15.68231],[-15.95357,57.80588,15.76136],[-15.97874,56.80817,15.84019],[-15.9911,55.81021,15.9189],[-15.99662,54.81218,15.99755],[-15.99885,53.81414,16.07617],[-15.99965,52.8161,16.15476],[-15.99991,51.81806,16.23331],[-15.99998,50.82002,16.31174],[-16,49.82198,16.38986],[-16,48.82394,16.46724],[-16,47.8259,16.54307],[-16,46.82785,16.61603],[-16,45.82981,16.68426],[-16,44.83177,16.74556],[-16,43.83373,16.79784],[-16,42.83569,16.83968],[-16,41.83765,16.8708],[-16,40.83961,16.89211],[-16,39.84157,16.90547],[-16,38.84353,16.91307],[-16,37.84548,16.917],[-16,36.84744,16.91882],[-16,35.8494,16.91959],[-16,34.85136,16.91987],[-16,33.85332,16.91997],[-16,32.85528,16.91999],[-16,31.85724,16.92],[-16,30.8592,16.92],[-16,29.86116,16.92],[-16,28.86311,16.92],[-16,27.86507,16.92],[-16,26.86703,16.92],[-16,25.86899,16.92],[-16.00004,24.87095,16.92],[-16.00018,23.87291,16.92],[-16.00068,22.87487,16.92],[-16.0022,21.87683,16.92],[-16.00629,20.8788,16.92],[-16.0162,19.88081,16.92],[-16.03799,18.88301,16.92],[-16.08167,17.88596,16.92],[-16.16204,16.89125,16.92],[-16.29856,15.90279,16.92],[-16.51362,14.92855,16.92],[-16.82831,13.982,16.92],[-17.25632,13.08116,16.92],[-17.79866,12.24419,16.92],[-18.4433,11.48309,16.92],[-19.17022,10.79988,16.92],[-19.95776,10.18726,16.92],[-20.7868,9.63184,16.92],[-21.64188,9.11725,16.92],[-22.51071,8.62613,16.92],[-23.38298,8.14112,16.92],[-24.24907,7.6452,16.92],[-25.09882,7.12189,16.92],[-25.92043,6.55555,16.92],[-26.69962,5.93233,16.92],[-27.41951,5.24166,16.92],[-28.06177,4.47843,16.92],[-28.60967,3.64496,16.92],[-29.05246,2.75119,16.92],[-29.38912,1.81218,16.92],[-29.62895,0.84375,16.92],[-29.78859,-0.14122,16.92],[-29.8876,-1.13423,16.92],[-29.94458,-2.1306,16.92],[-29.97482,-3.12816,16.92],[-29.98953,-4.12609,16.92],[-29.99605,-5.12411,16.92],[-29.99866,-6.12215,16.92],[-29.9996,-7.12019,16.92],[-29.9999,-8.11823,16.92],[-29.99998,-9.11627,16.92],[-30,-10.11431,16.92],[-30,-11.11235,16.92],[-30,-12.11039,16.92],[-30,-13.10843,16.92],[-30,-14.10647,16.92],[-30,-15.10452,16.92],[-30,-16.10256,16.92],[-30,-17.1006,16.91999],[-30,-18.09864,16.91994],[-30,-19.09668,16.91981],[-30,-20.09472,16.91945],[-30,-21.09276,16.91854],[-30,-22.0908,16.91652],[-30,-23.08884,16.91247],[-30,-24.08689,16.90513],[-30,-25.08493,16.89306],[-29.99997,-26.08297,16.87494],[-29.99986,-27.08101,16.84993],[-29.99949,-28.07905,16.81795],[-29.99834,-29.07709,16.77972],[-29.99524,-30.07513,16.73649],[-29.98773,-31.07314,16.6897],[-29.97121,-32.07104,16.6406],[-29.93814,-33.06851,16.59014],[-29.87744,-34.06465,16.53884],[-29.77472,-35.05729,16.48695],[-29.61351,-36.04203,16.43457],[-29.37778,-37.01153,16.38174],[-29.05518,-37.95559,16.32857],[-28.63998,-38.86268,16.27524],[-28.13406,-39.72249,16.22195],[-27.54574,-40.52822,16.16886],[-26.88705,-41.27763,16.11608],[-26.1711,-41.97265,16.06363],[-25.41024,-42.61831,16.0115],[-24.61523,-43.22152,15.95964],[-23.79508,-43.79014,15.90797],[-22.95721,-44.33235,15.85646],[-22.10781,-44.85635,15.80504],[-21.25223,-45.37023,15.75367],[-20.39541,-45.88203,15.70231],[-19.5422,-46.39983,15.65091],[-18.69783,-46.93188,15.59944],[-17.86827,-47.48671,15.54785],[-17.06072,-48.07303,15.49611],[-16.284,-48.69956,15.44422],[-15.54897,-49.37439,15.39232],[-14.8685,-50.10408,15.34077],[-14.2568,-50.89221,15.29035],[-13.7277,-51.73792,15.24237],[-13.29155,-52.63508,15.19854],[-12.95192,-53.5731,15.16068],[-12.70379,-54.53946,15.13009],[-12.53448,-55.52282,15.10718],[-12.42699,-56.51493,15.09135],[-12.36272,-57.51086,15.08112],[-12.32134,-58.50802,15.07397],[-12.30342,-59.50588,15.07067],[-12.30008,-60.50392,15.07002],[-12.3,-61.50196,15.07],[-12.3,-62.5,15.07]]};
let mapSequence = 0;
const TYPE_COLORS = {screen:'#315fac',led:'#315fac',interactive:'#8e4fa8',showcase:'#a17722',vr:'#397d65',projector:'#b85c3e',navigation:'#315fac'};
const finite = n => Number.isFinite(Number(n));
const floorIdOf = n => n.floorId || (Number(n.floorY ?? n.y) > 10 ? 'upper' : 'main');
const round = n => Math.round(n * 1000) / 1000;
const hallIdOf = s => s ? `RGO-${String(s).replace(/^RGO-/, '').padStart(2, '0')}` : null;
const viewPoint = p => [p[1], -p[0]];
const worldPoint = p => [-p[1], p[0]];
const escapeText = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function element(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
function svgElement(tag, attrs = {}) { const n = document.createElementNS(NS, tag); for (const [key, value] of Object.entries(attrs)) n.setAttribute(key, String(value)); return n; }
function button(text, label) { const n = element('button', 'epm-button', text); n.type = 'button'; if (label) n.setAttribute('aria-label', label); return n; }
function ringBounds(ring) { const xs = ring.map(p=>p[0]), zs=ring.map(p=>p[1]); return [Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs)]; }
function mergeBounds(bounds) { return bounds.reduce((a,b)=>[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])],[Infinity,Infinity,-Infinity,-Infinity]); }
function boundsOverlap(a,b) { return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]; }
function polygonRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  if (geometry.type === 'GeometryCollection') return (geometry.geometries || []).flatMap(polygonRings);
  return [];
}
function lineDistance(p,a,b) { const dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/l)):0;return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dz*t); }
export function pointInRing(p, ring, tolerance=0) {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i],b=ring[j];
    if (lineDistance(p,a,b) <= Math.max(tolerance,1e-7)) return true;
    if ((a[1]>p[1]) !== (b[1]>p[1]) && p[0] < (b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside;
}
export function pointInPolygons(p, polygons, tolerance=0) { return polygons.some(rings => pointInRing(p,rings[0],tolerance) && !rings.slice(1).some(hole=>pointInRing(p,hole))); }
function rectangle(x,z,width,depth,yaw=0,frontOffset=0) {
  const c=Math.cos(yaw),s=Math.sin(yaw);
  return [[-width/2,-depth/2],[width/2,-depth/2],[width/2,depth/2],[-width/2,depth/2]].map(([a,b])=>[x+a*c+(b+frontOffset)*s,z-a*s+(b+frontOffset)*c]);
}
export function polygonsIntersect(a,b) {
  if(!boundsOverlap(ringBounds(a),ringBounds(b)))return false;
  for(const ring of [a,b]) for(let i=0;i<ring.length;i++) {
    const next=ring[(i+1)%ring.length],axis=[-(next[1]-ring[i][1]),next[0]-ring[i][0]];
    const pa=a.map(p=>p[0]*axis[0]+p[1]*axis[1]),pb=b.map(p=>p[0]*axis[0]+p[1]*axis[1]);
    if(Math.max(...pa)<=Math.min(...pb)+1e-7||Math.max(...pb)<=Math.min(...pa)+1e-7)return false;
  }
  return true;
}
function pathFromPolygons(polygons) { return polygons.map(rings=>rings.map(r=>r.length?'M'+r.map(p=>viewPoint(p).map(round).join(' ')).join('L')+'Z':'').join(' ')).join(' '); }
function pathFromRing(ring) { return pathFromPolygons([[ring]]); }
function samplesInRect(ring, step=.5) {
  const a=ring[0],u=[ring[1][0]-a[0],ring[1][1]-a[1]],v=[ring[3][0]-a[0],ring[3][1]-a[1]];
  const nx=Math.max(1,Math.ceil(Math.hypot(...u)/step)),nz=Math.max(1,Math.ceil(Math.hypot(...v)/step)),out=[];
  for(let i=0;i<=nx;i++) for(let j=0;j<=nz;j++)out.push([a[0]+u[0]*i/nx+v[0]*j/nz,a[1]+u[1]*i/nx+v[1]*j/nz]);
  return out;
}
function decodeGrid(grid) {
  if (!grid) return null;
  const mask=new Uint8Array(grid.width*grid.height);
  (grid.rows||[]).forEach((runs,z)=>runs.forEach(([start,length])=>mask.fill(1,z*grid.width+start,z*grid.width+start+length)));
  return {...grid,mask};
}
function onGrid(grid,p) { if(!grid)return false;const x=Math.floor((p[0]-grid.originXZ[0])/grid.cellSize),z=Math.floor((p[1]-grid.originXZ[1])/grid.cellSize);return x>=0&&z>=0&&x<grid.width&&z<grid.height&&grid.mask[z*grid.width+x]===1; }
function positionOf(p) {
  if (!p) return null;
  if (Array.isArray(p)) return finite(p[0])&&finite(p[2])?{x:Number(p[0]),y:Number(p[1]),z:Number(p[2]),yaw:0}:null;
  return finite(p.x)&&finite(p.z)?{x:Number(p.x),z:Number(p.z),...(finite(p.y)?{y:Number(p.y)}:{}),yaw:Number(p.yaw ?? p.rotationY ?? 0),floorId:p.floorId}:null;
}
function dimensionOf(item) { const d=item.dimensions||{};return {width:Math.max(.2,Number(d.widthM??d.width??1)),depth:Math.max(.15,Number(d.depthM??d.depth??.5)),height:Math.max(.1,Number(d.heightM??d.height??1.8))}; }
function classify(item,data) {
  const type=(Array.isArray(data?.catalog)?data.catalog:Object.values(data?.catalog||{})).find(t=>t.id===item.typeId)||{};
  const text=`${item.typeId||''} ${type.category||''} ${item.name||''}`.toLowerCase();
  if(/vr|виар/.test(text))return 'vr';
  if(/showcase|витрин|case|подиум/.test(text))return 'showcase';
  if(/projector|проектор/.test(text))return 'projector';
  if(/interactive|touch|сенсор|терминал|кабин|интерактив/.test(text)&&!(/кабинет/.test(text)))return 'interactive';
  return 'screen';
}
function footprint(item,p) { const d=dimensionOf(item);return rectangle(p.x,p.z,d.width,d.depth,p.yaw); }
function envelope(item,p,data) {
  const d=dimensionOf(item),kind=classify(item,data),front=kind==='showcase'?.8:kind==='projector'?.4:kind==='vr'?.35:1.35;
  return rectangle(p.x,p.z,d.width+.6,d.depth+.35+front,p.yaw,(front-.35)/2);
}
function matchesScope(item, scope={}) { return (!scope.regionId||item.regionId===scope.regionId)&&(!scope.hallId||hallIdOf(item.hallId)===hallIdOf(scope.hallId))&&(!scope.exhibitId||item.exhibitId===scope.exhibitId)&&(!scope.floorId||scope.floorId==='all'||floorIdOf(item)===scope.floorId); }
function geometryCollections(raw) {
  const zoneColors=new Map((raw.colors?.zones||[]).map(z=>[z.id,z.polygons]));
  const zones=(raw.zones?.zones||[]).map(z=>({...z,polygonsWithHoles:zoneColors.get(z.id)||z.polygons.map(r=>[r])}));
  const halls=(raw.colors?.rgo?.halls||[]).map(h=>({...h,id:hallIdOf(h.hallId||h.id),regionId:'rgo',floorId:'main',polygonsWithHoles:(h.polygonsWorldXZ||[]).map(r=>[r]),labelXZ:h.sourceLabelWorldXZ,title:h.name}));
  const floors=(raw.floorShapes?.floors||[]).map(f=>({...f,polygons:polygonRings(f.floor),grid:decodeGrid((raw.world?.floors||[]).find(w=>w.id===f.id)?.baseGrid)}));
  const objectNames=new Map((raw.manifest?.objects||[]).map(o=>[o.id,o.name]));
  const exhibits=(raw.placements?.placements||[]).filter(p=>!['Z03','Z04'].includes(p.objectId)).map(p=>{
    const b=p.worldBounds,ring=p.footprintHullXZ?.length?p.footprintHullXZ:(b?[[b.min[0],b.min[2]],[b.max[0],b.min[2]],[b.max[0],b.max[2]],[b.min[0],b.max[2]]]:rectangle(p.x,p.z,p.dimensions?.[0]||1,p.dimensions?.[2]||1,p.rotationY||0));
    return {...p,floorId:floorIdOf(p),name:objectNames.get(p.objectId)||'Экспонат',ring,bounds:ringBounds(ring)};
  });
  const reservations=[];
  for(const floor of floors) for(const polygon of polygonRings(floor.reservedTransitions)) reservations.push({floorId:floor.id,ring:polygon[0],bounds:ringBounds(polygon[0])});
  // The route is a working circulation reserve, independently preserved from hall colour masks.
  const route=raw.rgo?.routeDesign?.route||raw.rgo?.routePolyline||[],routeWidth=raw.rgo?.routeDesign?.width||2.3;
  for(let i=1;i<route.length;i++) {
    const a=route[i-1],b=route[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const ring=rectangle((a[0]+b[0])/2,(a[1]+b[1])/2,routeWidth,len+routeWidth,Math.atan2(b[0]-a[0],b[1]-a[1]));
    reservations.push({floorId:'main',ring,bounds:ringBounds(ring),kind:'rgo-route'});
  }
  const rgoWalls=[];
  for(const [a,b] of raw.rgo?.wallSegments||[]){const length=Math.hypot(b[0]-a[0],b[1]-a[1]),ring=rectangle((a[0]+b[0])/2,(a[1]+b[1])/2,.15,length,Math.atan2(b[0]-a[0],b[1]-a[1]));const wall={floorId:'main',ring,bounds:ringBounds(ring),kind:'rgo-wall'};rgoWalls.push(wall);reservations.push(wall);}
  const supportObstacles=[];
  for(const support of TRANSPORT.supports)for(const floor of floors)if(floor.floorY>=support.floorY-.1&&floor.floorY<support.beamBottom){const ring=rectangle(support.x,support.z,1.4,1.4);const obstacle={floorId:floor.id,ring,bounds:ringBounds(ring),kind:'monorail-support'};supportObstacles.push(obstacle);reservations.push(obstacle);}
  const overhead=[];
  for(let i=1;i<TRANSPORT.points.length;i++){const a=TRANSPORT.points[i-1],b=TRANSPORT.points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),ring=rectangle((a[0]+b[0])/2,(a[1]+b[1])/2,TRANSPORT.widthM,length+.3,Math.atan2(b[0]-a[0],b[1]-a[1]));overhead.push({ring,bounds:ringBounds(ring),bottom:Math.min(a[2],b[2])});}
  return {zones,halls,floors,exhibits,reservations,route,routeWidth,raw,rgoWalls,transport:TRANSPORT,supportObstacles,overhead};
}
export function prepareEquipmentGeometry(raw) { return geometryCollections(raw); }
function scopePolygon(item,geometry) {
  const hall=geometry.halls.find(h=>h.id===hallIdOf(item.hallId));
  if(hall)return hall;
  return geometry.zones.find(z=>z.id===item.zoneId)||geometry.zones.find(z=>z.regionId===item.regionId&&z.floorId===floorIdOf(item));
}
function nonConvexOverlap(rect,ring) {
  if(!boundsOverlap(ringBounds(rect),ringBounds(ring)))return false;
  if(rect.some(p=>pointInRing(p,ring))||ring.some(p=>pointInRing(p,rect)))return true;
  const orient=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  for(let i=0;i<rect.length;i++)for(let j=0;j<ring.length;j++){
    const a=rect[i],b=rect[(i+1)%rect.length],c=ring[j],d=ring[(j+1)%ring.length];
    if(orient(a,b,c)*orient(a,b,d)<0&&orient(c,d,a)*orient(c,d,b)<0)return true;
  }
  return false;
}
/** Geometric fit for a proposed copy. Existing verified seed bodies use their source positions. */
export function checkEquipmentPosition(item, p, geometry, placed=[], data={}) {
  const target=scopePolygon(item,geometry),floor=geometry.floors.find(f=>f.id===floorIdOf(item));
  if(!target||!floor)return {valid:false,reason:'Для этой зоны пока нет контура размещения'};
  const body=footprint(item,p),reserve=envelope(item,p,data),bodySamples=samplesInRect(body,.45),reserveSamples=samplesInRect(reserve,.55);
  if(!bodySamples.every(q=>pointInPolygons(q,target.polygonsWithHoles)))return {valid:false,reason:'Оборудование выходит за границу зоны'};
  // The architecture mask already includes a conservative body inset and CAD floor support.
  // Re-testing every sample against several thousand floor vertices adds no precision here.
  if(![...bodySamples,...reserveSamples].every(q=>onGrid(floor.grid,q)))return {valid:false,reason:'Здесь стена, край этажа или недостаточно места перед оборудованием'};
  const reserveBounds=ringBounds(reserve);
  for(const object of geometry.exhibits) {
    if(object.floorId!==floor.id)continue;
    if(object.floating&&Number(object.worldBounds?.min?.[1])>Number(floor.floorY)+dimensionOf(item).height+.3)continue;
    if(boundsOverlap(reserveBounds,object.bounds)&&nonConvexOverlap(reserve,object.ring))return {valid:false,reason:'Это место занято экспонатом'};
  }
  for(const reserved of geometry.reservations) if(reserved.floorId===floor.id&&boundsOverlap(reserveBounds,reserved.bounds)&&nonConvexOverlap(reserve,reserved.ring))return {valid:false,reason:reserved.kind==='monorail-support'?'Это место занимает опора монорельса':reserved.kind==='rgo-wall'?'Здесь стенка экспозиции':'Оставьте свободным проход'};
  const top=floor.floorY+Math.max(2.3,dimensionOf(item).height+Number(item.mountingBottomM||0));
  for(const segment of geometry.overhead||[])if(top>segment.bottom-.15&&boundsOverlap(reserveBounds,segment.bounds)&&polygonsIntersect(reserve,segment.ring))return {valid:false,reason:'Недостаточно высоты под монорельсом'};
  for(const other of placed) if(other.id!==item.id&&floorIdOf(other)===floor.id&&polygonsIntersect(reserve,other.envelope||envelope(other,other.position,data)))return {valid:false,reason:'Слишком близко к другому оборудованию'};
  return {valid:true,body,envelope:reserve};
}
function seedFitsZone(item,p,geometry) {
  const target=scopePolygon(item,geometry),floor=geometry.floors.find(f=>f.id===floorIdOf(item));
  if(!target||!floor)return false;
  const body=footprint(item,p);
  // Hall masks are schematic, so their centre is the correct classification test, not an invented wall.
  const points=hallIdOf(item.hallId)?[[p.x,p.z]]:body;
  return points.every(q=>pointInPolygons(q,target.polygonsWithHoles,.25))&&pointInPolygons([p.x,p.z],floor.polygons,.2);
}
function candidatePositions(item, geometry) {
  const target=scopePolygon(item,geometry);
  if(!target)return [];
  const bounds=mergeBounds(target.polygonsWithHoles.map(p=>ringBounds(p[0]))),seed=positionOf(item.seedPosition||item.position),anchor=target.labelXZ||target.sourceLabelWorldXZ||[seed?.x??(bounds[0]+bounds[2])/2,seed?.z??(bounds[1]+bounds[3])/2];
  const origin=seed&&pointInPolygons([seed.x,seed.z],target.polygonsWithHoles)?[seed.x,seed.z]:anchor;
  const angles=[seed?.yaw??0,Math.PI/2,Math.PI,-Math.PI/2].filter((v,i,a)=>a.findIndex(x=>Math.abs(x-v)<.001)===i);
  const points=[];
  for(let x=Math.ceil(bounds[0]*2)/2;x<=bounds[2];x+=.75)for(let z=Math.ceil(bounds[1]*2)/2;z<=bounds[3];z+=.75)if(pointInPolygons([x,z],target.polygonsWithHoles))points.push([x,z]);
  points.sort((a,b)=>Math.hypot(a[0]-origin[0],a[1]-origin[1])-Math.hypot(b[0]-origin[0],b[1]-origin[1])||a[0]-b[0]||a[1]-b[1]);
  return points.flatMap(([x,z])=>angles.map(yaw=>({x,z,yaw,floorId:floorIdOf(item)})));
}
/** Deterministic placement of the whole park; selection only filters the returned report. */
export function layoutEquipment(instances, geometry, {positions={}, previousPositions={}, data={}}={}) {
  const placed=[],unplaced=[],warnings=[],pending=[];
  const sorted=[...instances].sort((a,b)=>String(a.groupId||a.id).localeCompare(String(b.groupId||b.id),'en')||Number(String(a.id).split('::').at(-1))-Number(String(b.id).split('::').at(-1)));
  // Reserve all original installations before searching for additional units.
  for(const item of sorted) {
    const manual=positionOf(positions[item.id]),seed=positionOf(item.seedPosition||item.position);
    if(!manual&&seed&&seedFitsZone(item,seed,geometry)) {
      const position={...seed,floorId:floorIdOf(item)};
      placed.push({...item,position,footprint:footprint(item,position),envelope:envelope(item,position,data),placement:'existing'});
    }else pending.push({...item,_manual:manual,_seed:seed});
  }
  // Keep all surviving automatic copies before searching for newly requested equipment.
  // Counts in an earlier group therefore cannot move an unrelated existing installation.
  const searching=[];
  for(const item of pending) {
    const previous=!item._manual&&positionOf(previousPositions[item.id]);
    const check=previous&&checkEquipmentPosition(item,previous,geometry,placed,data);
    if(check?.valid){const record={...item,position:{...previous,floorId:floorIdOf(item)},footprint:check.body,envelope:check.envelope,placement:'added'};delete record._manual;delete record._seed;placed.push(record);}
    else searching.push(item);
  }
  for(const item of searching) {
    let position=null,fit=null,placement='added';
    const preferred=item._manual||positionOf(previousPositions[item.id]);
    if(preferred) {fit=checkEquipmentPosition(item,preferred,geometry,placed,data);if(fit.valid){position=preferred;placement=item._manual?'moved':'added';}}
    if(!position)for(const candidate of candidatePositions(item,geometry)){
      const check=checkEquipmentPosition(item,candidate,geometry,placed,data);
      if(check.valid){position=candidate;fit=check;break;}
    }
    if(position) {
      const record={...item,position:{...position,floorId:floorIdOf(item)},footprint:fit.body,envelope:fit.envelope,placement};
      delete record._manual;delete record._seed;placed.push(record);
      if(item._seed)warnings.push({id:item.id,name:item.name,reason:'Место уточнено внутри своей зоны'});
      if(item._manual&&(!preferred||Math.hypot(position.x-preferred.x,position.z-preferred.z)>.01))warnings.push({id:item.id,name:item.name,reason:'Сохранённое место занято; найдено свободное место в этой зоне'});
    }else unplaced.push({id:item.id,groupId:item.groupId,name:item.name,regionId:item.regionId,hallId:item.hallId,exhibitId:item.exhibitId,floorId:floorIdOf(item),reason:'Не найдено свободного места с площадкой для посетителей'});
  }
  return {placed,unplaced,warnings,placedCount:placed.length,unplacedCount:unplaced.length,total:instances.length,positions:Object.fromEntries(placed.map(p=>[p.id,p.position])),scope:{regionId:null,hallId:null,floorId:null}};
}
function scopedReport(report,scope) {
  const placed=report.placed.filter(p=>matchesScope(p,scope)),unplaced=report.unplaced.filter(p=>matchesScope(p,scope));
  return {...report,placed,unplaced,placedCount:placed.length,unplacedCount:unplaced.length,total:placed.length+unplaced.length,scope:{...scope},all:report};
}
async function fetchJSON(url,signal) { const r=await fetch(url,{signal});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json(); }
export async function loadEquipmentGeometry({signal}={}) {
  const paths={zones:'../tour/assets/zones/source-zones.json',colors:'../tour/assets/zones/floor-colors.json',world:'../tour/crowd/data/park-world.json',floorShapes:'./engineering/placement-frontal.json',placements:'../tour/assets/zones/placements-final.json',rgo:'../tour/assets/zones/rgo-layout.json',manifest:'../tour/assets/exhibits/manifest.json'};
  const entries=await Promise.all(Object.entries(paths).map(async([key,path])=>[key,await fetchJSON(new URL(`${path}?v=${VERSION}`,import.meta.url),signal)]));
  return prepareEquipmentGeometry(Object.fromEntries(entries));
}

/** The app owns quantities and selection; this component owns map navigation. */
export function createEquipmentMap(mount,{onSelect,onMove,onPreview,onPreviewEnd,onScopeChange,onReport,geometry:providedGeometry}={}) {
  if(!mount||typeof mount.append!=='function')throw new TypeError('Нужен контейнер плана');
  const abort=new AbortController(),on=(n,type,fn,options={})=>n.addEventListener(type,fn,{...options,signal:abort.signal});
  let geometry=providedGeometry||null,state={data:{},instances:[],scope:{floorId:'main'},positions:{}},report={placed:[],unplaced:[],total:0,placedCount:0,unplacedCount:0,positions:{},warnings:[]},destroyed=false;
  let box=[-90,-55,180,110],fitBox=[...box],scopeKey='',selectedNodes=new Map(),drag=null,lastPlacementKey='',labelsOn=true,transformControls=null,suppressClickUntil=0;
  const clipId=`epm-floor-${++mapSequence}`;
  const root=element('section','equipment-map');root.setAttribute('aria-label','Расположение оборудования');
  const toolsBar=element('div','epm-toolbar'),fit=button('Вся зона'),zoomOut=button('−','Уменьшить схему'),zoomIn=button('+','Увеличить схему'),zoomValue=element('span','epm-zoom-value','100%'),showLabels=button('Названия');showLabels.setAttribute('aria-pressed','true');
  const toolsLeft=element('div','epm-toolbar-group'),toolsRight=element('div','epm-toolbar-group');toolsLeft.append(fit,showLabels);toolsRight.append(zoomOut,zoomValue,zoomIn);toolsBar.append(toolsLeft,toolsRight);
  const stage=element('div','epm-stage'),svg=svgElement('svg',{class:'epm-svg',role:'group','aria-label':'План этажа и оборудование',tabindex:0,preserveAspectRatio:'xMidYMid meet'});stage.append(svg);
  const tooltip=element('div','epm-tooltip');tooltip.hidden=true;stage.append(tooltip);
  const footer=element('div','epm-footer'),status=element('p','epm-status','Загружаем план…');status.setAttribute('role','status');
  const hint=element('p','epm-hint','Перетащите оборудование мышью. Для поворота потяните круглый маркер.');footer.append(status,hint);
  const legend=element('div','epm-legend');legend.setAttribute('aria-label','Обозначения');
  for(const [kind,label] of [['screen','Экран'],['interactive','Интерактив'],['showcase','Витрина'],['vr','VR-место'],['projector','Проектор']]){const item=element('span','epm-key'),swatch=element('i');swatch.style.background=TYPE_COLORS[kind];item.append(swatch,document.createTextNode(label));legend.append(item);}
  const issueBox=element('div','epm-issues');issueBox.hidden=true;root.append(toolsBar,stage,legend,footer,issueBox);mount.append(root);
  function applyView() {svg.setAttribute('viewBox',box.map(round).join(' '));zoomValue.textContent=`${Math.round(fitBox[2]/box[2]*100)}%`;refreshControlSize();}
  function targetBounds() {
    const scope=state.scope||{},floor=geometry.floors.find(f=>f.id===(scope.floorId||'main'));
    const hall=geometry.halls.find(h=>h.id===hallIdOf(scope.hallId));
    const zones=hall?[hall]:scope.regionId==='rgo'&&(scope.floorId||'main')==='main'?geometry.halls:scope.regionId?geometry.zones.filter(z=>z.regionId===scope.regionId&&z.floorId===(scope.floorId||'main')):[];
    const polygons=zones.length?zones.flatMap(z=>z.polygonsWithHoles):floor?.polygons||[];
    let b=mergeBounds(polygons.map(p=>ringBounds(p[0])));if(!b.every(Number.isFinite))b=[-50,-87.5,50,87.5];
    const corner1=viewPoint([b[0],b[1]]),corner2=viewPoint([b[2],b[3]]),x=Math.min(corner1[0],corner2[0]),y=Math.min(corner1[1],corner2[1]),w=Math.abs(corner1[0]-corner2[0]),h=Math.abs(corner1[1]-corner2[1]),pad=Math.max(1.7,Math.min(w,h)*.06);
    return [x-pad,y-pad,w+2*pad,h+2*pad];
  }
  function fitView() {if(!geometry)return;fitBox=targetBounds();box=[...fitBox];applyView();}
  function focusItem(id=state.selectedId){const record=report.placed.find(p=>p.id===id);if(!record)return false;const [x,y]=viewPoint([record.position.x,record.position.z]),d=dimensionOf(record),size=Math.max(8,Math.max(d.width,d.depth)+6);box=[x-size*.75,y-size*.5,size*1.5,size];applyView();hideTip();return true;}
  function zoom(factor,anchor=null) {const nextW=Math.max(8,Math.min(450,box[2]*factor)),nextH=box[3]*nextW/box[2],p=anchor||[box[0]+box[2]/2,box[1]+box[3]/2],rx=(p[0]-box[0])/box[2],ry=(p[1]-box[1])/box[3];box=[p[0]-nextW*rx,p[1]-nextH*ry,nextW,nextH];applyView();hideTip();}
  function svgPoint(event) { const matrix=svg.getScreenCTM();if(!matrix)return null;const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;const q=p.matrixTransform(matrix.inverse());return[q.x,q.y]; }
  function unitsPerPixel() {const matrix=svg.getScreenCTM?.(),scale=matrix&&Math.hypot(matrix.a,matrix.b);if(scale>0)return 1/scale;const rect=svg.getBoundingClientRect();return Math.max(box[2]/(rect.width||900),box[3]/(rect.height||620));}
  function normalizedYaw(value) {return Math.atan2(Math.sin(value),Math.cos(value));}
  function finalPosition(record,p) {return {...p,x:round(p.x),z:round(p.z),yaw:normalizedYaw(p.yaw||0),floorId:floorIdOf(record)};}
  function refreshControlSize(position) {
    const unit=unitsPerPixel();
    for(const group of selectedNodes.values())group.querySelector('.epm-device-hit')?.setAttribute('r',Math.max(.6,14*unit));
    if(!transformControls)return;
    const controls=transformControls,record=controls.record,p=position||controls.position||record.position,[cx,cy]=viewPoint([p.x,p.z]),d=dimensionOf(record),radius=Math.max(d.width,d.depth)/2+28*unit,dx=Math.cos(p.yaw||0),dy=-Math.sin(p.yaw||0),hx=cx+dx*radius,hy=cy+dy*radius;
    controls.position=p;
    for(const [key,value] of Object.entries({cx,cy,r:radius}))controls.ring.setAttribute(key,value);
    for(const [key,value] of Object.entries({x1:cx+dx*d.depth/2,y1:cy+dy*d.depth/2,x2:hx,y2:hy}))controls.line.setAttribute(key,value);
    controls.handle.setAttribute('transform',`translate(${hx} ${hy}) scale(${unit})`);
    controls.angle.setAttribute('x',cx);controls.angle.setAttribute('y',cy-radius-9*unit);controls.angle.setAttribute('font-size',13*unit);controls.angle.textContent=`${Math.round(((p.yaw||0)*180/Math.PI%360+360)%360)}°`;
  }
  function drawTransformControls(record) {
    if(!record||!onMove)return;
    const controls=svgElement('g',{class:'epm-transform','data-transform-id':record.id}),ring=svgElement('circle',{class:'epm-rotation-ring'}),line=svgElement('line',{class:'epm-rotation-line'}),handle=svgElement('g',{class:'epm-rotate-handle',tabindex:0,role:'button','aria-label':`Повернуть: ${record.name}`,'data-rotate-id':record.id}),angle=svgElement('text',{class:'epm-angle','text-anchor':'middle','aria-hidden':'true'}),title=svgElement('title');
    title.textContent='Повернуть мышью. Shift — шаг 15°';
    handle.append(title,svgElement('circle',{r:15,class:'epm-rotate-hit'}),svgElement('circle',{r:11,class:'epm-rotate-disc'}),svgElement('path',{d:'M -5 -2 A 5.4 5.4 0 1 1 -4.8 3 M -5 -2 L -5 -6 M -5 -2 L -1 -2',class:'epm-rotate-symbol'}));
    on(handle,'pointerdown',e=>beginTransform(e,record,'rotate'));
    on(handle,'keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();e.stopPropagation();const angle=(e.shiftKey?15:5)*Math.PI/180*(e.key==='ArrowLeft'?1:-1);tryMove(record,{...record.position,yaw:normalizedYaw(record.position.yaw+angle)});}});
    controls.append(ring,line,angle,handle);svg.append(controls);transformControls={root:controls,ring,line,handle,angle,record,position:record.position};refreshControlSize();
  }
  function beginTransform(event,record,mode) {
    if(event.button!==0||!onMove||drag)return;
    const q=svgPoint(event);if(!q)return;event.stopPropagation();event.preventDefault();hideTip();
    if(state.selectedId!==record.id){state.selectedId=record.id;onSelect?.(record.id);render();}
    const node=selectedNodes.get(record.id);if(!node)return;
    const centre=viewPoint([record.position.x,record.position.z]);
    drag={mode,id:record.id,record,start:q,clientStart:[event.clientX,event.clientY],position:{...record.position},node,moved:false,valid:true,pointerId:event.pointerId,startAngle:Math.atan2(q[1]-centre[1],q[0]-centre[0])};
    try{svg.setPointerCapture?.(event.pointerId);}catch{}
    root.classList.add(mode==='rotate'?'is-rotating':'is-dragging');
    svg.focus({preventScroll:true});
  }
  function previewTransform(proposed) {
    const check=checkEquipmentPosition(drag.record,proposed,geometry,report.placed,state.data),a=viewPoint([proposed.x,proposed.z]),b=viewPoint([drag.position.x,drag.position.z]),degrees=-(proposed.yaw-drag.position.yaw)*180/Math.PI;
    drag.proposed=proposed;drag.valid=check.valid;drag.node.classList.toggle('is-invalid',!check.valid);drag.node.setAttribute('transform',`translate(${a[0]-b[0]} ${a[1]-b[1]}) rotate(${degrees} ${b[0]} ${b[1]})`);
    transformControls?.root.classList.toggle('is-invalid',!check.valid);refreshControlSize(proposed);
    status.textContent=check.valid?(drag.mode==='rotate'?'Отпустите, чтобы повернуть оборудование':'Отпустите, чтобы поставить оборудование'):check.reason;
    onPreview?.(drag.id,finalPosition(drag.record,proposed),{valid:check.valid,reason:check.reason||''});
  }
  function hideTip() {tooltip.hidden=true;}
  function showTip(event,record) {const rect=stage.getBoundingClientRect();tooltip.textContent=record.name||'Оборудование';tooltip.hidden=false;tooltip.style.left=`${Math.min(Math.max(8,event.clientX-rect.left+12),Math.max(8,rect.width-260))}px`;tooltip.style.top=`${Math.max(8,event.clientY-rect.top-50)}px`;}
  function drawLabel(text,p,cls,size=1.3) {const [x,y]=viewPoint(p),n=svgElement('text',{x,y,class:cls,'text-anchor':'middle','font-size':size});n.textContent=text;return n;}
  function render() {
    if(!geometry||destroyed)return;
    const currentFloor=state.scope?.floorId||'main',floor=geometry.floors.find(f=>f.id===currentFloor)||geometry.floors[0];
    svg.replaceChildren();selectedNodes=new Map();transformControls=null;
    const definitions=svgElement('defs'),clip=svgElement('clipPath',{id:clipId}),clipShape=svgElement('path',{d:pathFromPolygons(floor.polygons),'clip-rule':'evenodd'});clip.append(clipShape);definitions.append(clip);svg.append(definitions);
    const floorPath=svgElement('path',{d:pathFromPolygons(floor.polygons),class:'epm-floor','fill-rule':'evenodd'});svg.append(floorPath);
    const background=svgElement('g',{'aria-label':'Зоны','clip-path':`url(#${clipId})`});svg.append(background);
    const selectedRegion=state.scope?.regionId,selectedHall=hallIdOf(state.scope?.hallId);
    for(const zone of geometry.zones.filter(z=>z.floorId===floor.id)) {
      if(zone.regionId==='rgo')continue;
      const active=!selectedRegion||selectedRegion===zone.regionId,n=svgElement('path',{d:pathFromPolygons(zone.polygonsWithHoles),class:`epm-zone${active?' is-active':''}`,fill:zone.color||'#abb9c9','fill-rule':'evenodd','data-region':zone.regionId});
      const title=svgElement('title');title.textContent=zone.title;n.append(title);background.append(n);
      on(n,'dblclick',()=>onScopeChange?.({regionId:zone.regionId,hallId:null,floorId:floor.id}));
    }
    if(floor.id==='main')for(const hall of geometry.halls) {
      const n=svgElement('path',{d:pathFromPolygons(hall.polygonsWithHoles),class:`epm-hall${(!selectedRegion||selectedRegion==='rgo')&&(!selectedHall||selectedHall===hall.id)?' is-active':''}`,fill:hall.color,'fill-rule':'evenodd'}),title=svgElement('title');title.textContent=hall.name;n.append(title);background.append(n);on(n,'dblclick',()=>onScopeChange?.({regionId:'rgo',hallId:hall.id,floorId:'main'}));
    }
    if(floor.id==='main'&&geometry.route.length){const route=svgElement('path',{d:'M'+geometry.route.map(p=>viewPoint(p).join(' ')).join('L'),class:'epm-walkway','stroke-width':geometry.routeWidth});svg.append(route);}
    if(floor.id==='main')for(const wall of geometry.rgoWalls||[])svg.append(svgElement('path',{d:pathFromRing(wall.ring),class:'epm-rgo-wall'}));
    if(geometry.transport?.points?.length){const track=svgElement('path',{d:'M'+geometry.transport.points.map(p=>viewPoint(p).join(' ')).join('L'),class:'epm-monorail'}),title=svgElement('title');title.textContent='Монорельс';track.append(title);svg.append(track);}
    for(const support of geometry.supportObstacles||[])if(support.floorId===floor.id){const shape=svgElement('path',{d:pathFromRing(support.ring),class:'epm-support'}),title=svgElement('title');title.textContent='Опора монорельса';shape.append(title);svg.append(shape);}
    const circulation=svgElement('g',{'aria-label':'Лестницы и лифты',class:'epm-circulation','clip-path':`url(#${clipId})`});
    for(const stair of geometry.raw?.world?.stairs||[]){const points=(stair.polyline||[]).map(p=>[p[0],p[2]]);if(points.length){const line=svgElement('path',{d:'M'+points.map(p=>viewPoint(p).join(' ')).join('L'),class:'epm-stair'}),title=svgElement('title');title.textContent='Лестница';line.append(title);circulation.append(line);}}
    for(const lift of geometry.raw?.world?.elevators||[]){const min=lift.shaftBoundsMin,max=lift.shaftBoundsMax;if(min&&max){const ring=[[min[0],min[2]],[max[0],min[2]],[max[0],max[2]],[min[0],max[2]]],shape=svgElement('path',{d:pathFromRing(ring),class:'epm-lift'}),title=svgElement('title');title.textContent='Лифт';shape.append(title);circulation.append(shape);}}
    svg.append(circulation);
    const objects=svgElement('g',{'aria-label':'Экспонаты'});
    for(const object of geometry.exhibits.filter(o=>o.floorId===floor.id)){const p=svgElement('path',{d:pathFromRing(object.ring),class:`epm-exhibit${object.floating?' is-suspended':''}`}),title=svgElement('title');title.textContent=object.name;p.append(title);objects.append(p);}
    svg.append(objects);
    const visible=report.placed.filter(p=>floorIdOf(p)===floor.id),equipment=svgElement('g',{'aria-label':'Оборудование'});svg.append(equipment);
    for(const record of visible) {
      const active=matchesScope(record,{...state.scope,floorId:floor.id}),isSelected=record.id===state.selectedId,kind=classify(record,state.data),type=(Array.isArray(state.data.catalog)?state.data.catalog:Object.values(state.data.catalog||{})).find(t=>t.id===record.typeId),color=type?.color||TYPE_COLORS[kind],p=viewPoint([record.position.x,record.position.z]);
      const group=svgElement('g',{class:`epm-equipment${active?' is-in-scope':' is-muted'}${isSelected?' is-selected':''}`,tabindex:active?0:-1,role:'button','aria-label':record.name||type?.name||'Оборудование','aria-pressed':String(isSelected),'data-instance-id':record.id});
      const title=svgElement('title');title.textContent=record.name;group.append(title);
      group.append(svgElement('path',{d:pathFromRing(record.envelope),class:'epm-audience'}));
      group.append(svgElement('path',{d:pathFromRing(record.footprint),class:'epm-device',fill:color}));
      const radius=kind==='vr'?.6:.38;
      const marker=svgElement('circle',{cx:p[0],cy:p[1],r:radius,class:'epm-device-dot',fill:color});group.append(marker);
      const hit=svgElement('circle',{cx:p[0],cy:p[1],r:1.15,class:'epm-device-hit'});group.append(hit);
      on(group,'pointerenter',e=>{if(!drag)showTip(e,record);});on(group,'pointerleave',hideTip);
      on(group,'click',e=>{e.stopPropagation();if(drag?.moved||Date.now()<suppressClickUntil)return;state.selectedId=record.id;onSelect?.(record.id);render();});
      on(group,'keydown',e=>{
        if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect?.(record.id);}
        if(e.altKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&onMove){e.preventDefault();const step=e.shiftKey?1:.25,delta={ArrowLeft:[0,-step],ArrowRight:[0,step],ArrowUp:[step,0],ArrowDown:[-step,0]}[e.key],proposed={...record.position,x:record.position.x+delta[0],z:record.position.z+delta[1]};tryMove(record,proposed);}
      });
      on(group,'pointerdown',e=>beginTransform(e,record,'object'));
      equipment.append(group);selectedNodes.set(record.id,group);
    }
    if(labelsOn){
      const labels=svgElement('g',{'aria-hidden':'true',class:'epm-labels'}),size=Math.max(.85,Math.min(1.7,fitBox[2]/100));
      for(const zone of geometry.zones.filter(z=>z.floorId===floor.id&&z.regionId!=='rgo'))if(zone.labelXZ&&(!selectedRegion||zone.regionId===selectedRegion))labels.append(drawLabel(zone.title,zone.labelXZ,'epm-zone-label',size));
      if(floor.id==='main'&&(!selectedRegion||selectedRegion==='rgo'))for(const hall of geometry.halls)if(hall.labelXZ&&(!selectedHall||selectedHall===hall.id)){const title=state.data.halls?.find(h=>hallIdOf(h.id)===hall.id)?.name||hall.name;labels.append(drawLabel(title.replace(/^\d+[.·\s]+/,''),hall.labelXZ,'epm-hall-label',size*.8));}
      svg.append(labels);
    }
    drawTransformControls(visible.find(p=>p.id===state.selectedId));
    applyView();
    const scoped=scopedReport(report,state.scope),floorLabel=floor.id==='upper'?'Верхний уровень':'Нижний уровень';status.textContent=`${floorLabel} · размещено ${scoped.placedCount} из ${scoped.total}`;
    fit.textContent=state.scope?.regionId?'Вся зона':'Весь этаж';
    hint.textContent='Перетащите оборудование мышью. Для поворота потяните круглый маркер. Shift — шаг 15°. Esc — отмена.'+(selectedRegion==='rgo'?' Границы залов РГО показаны условно.':'');
    issueBox.hidden=!scoped.unplacedCount||typeof onReport==='function';
    if(scoped.unplacedCount){const names=[...new Set(scoped.unplaced.map(x=>x.name))];issueBox.innerHTML=`<strong>Для ${scoped.unplacedCount} ${scoped.unplacedCount===1?'единицы':'единиц'} нужно выбрать другое место</strong><p>${names.map(escapeText).join(', ')}. Уменьшите количество или освободите место в зоне.</p>`;}
    else issueBox.replaceChildren();
  }
  function tryMove(record,proposed) {
    const check=checkEquipmentPosition(record,proposed,geometry,report.placed,state.data);
    if(check.valid){onMove?.(record.id,finalPosition(record,proposed));status.textContent='Положение изменено';}
    else status.textContent=check.reason;
    return check.valid;
  }
  on(fit,'click',()=>{fitView();render();});on(zoomIn,'click',()=>zoom(.8));on(zoomOut,'click',()=>zoom(1.25));
  on(showLabels,'click',()=>{labelsOn=!labelsOn;showLabels.setAttribute('aria-pressed',String(labelsOn));render();});
  on(svg,'wheel',event=>{if(!event.ctrlKey||drag)return;event.preventDefault();zoom(event.deltaY>0?1.12:.89,svgPoint(event));},{passive:false});
  on(svg,'pointerdown',event=>{if(event.button!==0||drag||event.target.closest?.('.epm-equipment,.epm-transform'))return;const p=svgPoint(event);if(!p)return;drag={mode:'pan',start:p,clientStart:[event.clientX,event.clientY],box:[...box],moved:false,pointerId:event.pointerId};try{svg.setPointerCapture?.(event.pointerId);}catch{}root.classList.add('is-panning');hideTip();});
  on(svg,'pointermove',event=>{
    if(!drag||event.pointerId!==drag.pointerId)return;const p=svgPoint(event);if(!p)return;const dx=p[0]-drag.start[0],dy=p[1]-drag.start[1];
    if(Math.hypot(event.clientX-drag.clientStart[0],event.clientY-drag.clientStart[1])>3)drag.moved=true;
    if(drag.mode==='pan'){box[0]-=dx;box[1]-=dy;applyView();return;}
    if(!drag.moved)return;
    let proposed;
    if(drag.mode==='rotate'){
      const centre=viewPoint([drag.position.x,drag.position.z]),angle=Math.atan2(p[1]-centre[1],p[0]-centre[0]),delta=Math.atan2(Math.sin(angle-drag.startAngle),Math.cos(angle-drag.startAngle));
      let yaw=drag.position.yaw-delta;if(event.shiftKey)yaw=Math.round(yaw/(Math.PI/12))*(Math.PI/12);proposed={...drag.position,yaw:normalizedYaw(yaw)};
    }else{
      const delta=worldPoint([dx,dy]),snap=n=>event.shiftKey?Math.round(n*4)/4:round(n);proposed={...drag.position,x:snap(drag.position.x+delta[0]),z:snap(drag.position.z+delta[1])};
    }
    previewTransform(proposed);
  });
  function finishDrag(event,cancel=false){
    if(!drag||(event?.pointerId!==undefined&&event.pointerId!==drag.pointerId))return;
    const current=drag;drag=null;root.classList.remove('is-dragging','is-panning','is-rotating');
    try{svg.releasePointerCapture?.(current.pointerId);}catch{}
    if(current.mode==='pan')return;
    current.node.removeAttribute('transform');current.node.classList.remove('is-invalid');transformControls?.root.classList.remove('is-invalid');refreshControlSize(current.position);
    let committed=false;
    if(!cancel&&current.moved&&current.proposed&&current.valid&&Math.hypot(current.proposed.x-current.position.x,current.proposed.z-current.position.z,normalizedYaw(current.proposed.yaw-current.position.yaw))>1e-5)committed=tryMove(current.record,current.proposed);
    if(!committed&&current.moved)status.textContent='Оборудование осталось на прежнем месте';
    if(current.moved)suppressClickUntil=Date.now()+250;
    onPreviewEnd?.(current.id,{committed,position:finalPosition(current.record,committed?current.proposed:current.position)});
  }
  on(svg,'pointerup',e=>finishDrag(e));on(svg,'pointercancel',e=>finishDrag(e,true));on(svg,'lostpointercapture',e=>finishDrag(e,true));
  on(mount.ownerDocument.defaultView,'blur',()=>finishDrag(null,true));
  on(mount.ownerDocument.defaultView,'resize',()=>refreshControlSize(drag?.proposed));
  on(svg,'keydown',e=>{if(e.key==='Escape'){e.preventDefault();hideTip();if(drag)finishDrag(null,true);else onSelect?.(null);}if(!drag&&(e.key==='+'||e.key==='=')){e.preventDefault();zoom(.8);}if(!drag&&e.key==='-'){e.preventDefault();zoom(1.25);}if(!drag&&e.key==='Home'){e.preventDefault();fitView();render();}});
  function update(next={}) {
    if(drag)finishDrag(null,true);
    const oldSelected=state.selectedId;
    state={...state,...next,scope:{floorId:'main',...(next.scope||state.scope)}};
    if(!geometry)return;
    const placementKey=JSON.stringify([state.instances.map(i=>[i.id,i.zoneId,i.hallId,i.floorId,i.dimensions,i.position,i.seedPosition]),state.positions]);
    if(placementKey!==lastPlacementKey){report=layoutEquipment(state.instances,geometry,{positions:state.positions||{},previousPositions:report.positions||{},data:state.data});lastPlacementKey=placementKey;}
    const nextScope=JSON.stringify(state.scope);if(nextScope!==scopeKey){scopeKey=nextScope;fitView();}
    render();
    if(state.selectedId&&state.selectedId!==oldSelected){const selected=report.placed.find(p=>p.id===state.selectedId);if(selected&&floorIdOf(selected)===(state.scope.floorId||'main')){const [x,y]=viewPoint([selected.position.x,selected.position.z]);if(x<box[0]||x>box[0]+box[2]||y<box[1]||y>box[1]+box[3])focusItem(selected.id);}}
    onReport?.(scopedReport(report,state.scope));
  }
  const ready=(geometry?Promise.resolve(geometry):loadEquipmentGeometry({signal:abort.signal})).then(g=>{if(destroyed)return;geometry=g;update(state);return geometry;}).catch(error=>{if(destroyed||error.name==='AbortError')return;status.textContent='Не удалось загрузить план. Обновите страницу.';root.classList.add('has-error');throw error;});
  // Prevent an unhandled rejection when the host uses the visible load state only.
  ready.catch(()=>{});
  return {ready,update,getPlacementReport:()=>scopedReport(report,state.scope),fit:fitView,focus:focusItem,destroy(){finishDrag(null,true);destroyed=true;abort.abort();root.remove();}};
}
