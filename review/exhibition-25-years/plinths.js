import * as THREE from "three";

// One repeating section of the rail bed, projected along the train's long axis.
function trackTexture() {
  const tile = document.createElement("canvas");
  tile.width = 512;
  tile.height = 512;
  const g = tile.getContext("2d");
  g.fillStyle = "#566269";
  g.fillRect(0, 0, 512, 512);
  let seed = 937;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 5400; i++) {
    const tone = 66 + Math.floor(rand() * 65);
    g.fillStyle = `rgb(${tone},${tone+4},${tone+6})`;
    g.fillRect(rand()*512,rand()*512,2+rand()*5,2+rand()*4);
  }
  for (let x = 16; x < 512; x += 64) {
    g.fillStyle = "#394144"; g.fillRect(x+3,110,15,292);
    g.fillStyle = "#adb6b4"; g.fillRect(x,108,14,290);
    for(const y of [162,338]) {
      g.fillStyle = "#39484d"; g.fillRect(x-2,y-8,20,16);
      g.fillStyle = "#d1d6d5"; g.fillRect(x,y-5,4,10);
    }
  }
  for (const y of [0,428]) {
    g.fillStyle = "#616d74"; g.fillRect(0,y,512,84);
    g.fillStyle = "#839198"; g.fillRect(0,y+3,512,3);
    for (let x = 0; x < 512; x += 128) {
      g.fillStyle = "#2c3941"; g.fillRect(x,y,3,84);
      g.fillStyle = "#ffe078"; g.fillRect(x+10,y+(y?14:64),96,5);
    }
  }
  const map = new THREE.CanvasTexture(tile);
  map.wrapS = THREE.RepeatWrapping;
  map.repeat.x = 2.4;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

export function mountRailPanel(group, top) {
  const length = 2.80, width = 1.24, gauge = .432;
  const map = trackTexture();
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(length,width),
    new THREE.MeshBasicMaterial({map,toneMapped:false}));
  bed.name = "metro-track";
  bed.rotation.x = -Math.PI/2;
  bed.position.y = top+.008;
  group.add(bed);
  const steel = new THREE.MeshStandardMaterial({color:0xb8c6cc,metalness:.45,roughness:.43});
  const railHeight = .020;
  for (const z of [-gauge/2,gauge/2]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(length,.020,.034), steel);
    rail.position.set(0,bed.position.y+railHeight/2,z);
    group.add(rail);
  }
  // The kiosk click represents the physical visitor trigger. Walk mode also
  // senses arrival, with a larger departure radius to avoid retriggering.
  let running=false, inside=false, speed=0;
  function setRunning(value) {
    running=value;
    bed.userData.running=value;
  }
  setRunning(false);
  return {
    contactY: bed.position.y+railHeight,
    toggle() { setRunning(!running); },
    update(dt,camera,walking) {
      const distance=Math.hypot(camera.position.x-group.position.x,camera.position.z-group.position.z);
      if (walking && !inside && distance<1.85) {
        inside=true;
        setRunning(true);
      } else if (inside && (!walking || distance>2.45)) {
        inside=false; setRunning(false);
      }
      speed += ((running?0.80:0)-speed)*(1-Math.exp(-dt*3));
      map.offset.x=(map.offset.x-speed*dt+1)%1;
    }
  };
}

export function signPlinth(group,title,width,depth,top,hint="") {
  const make = (span,angle,x,z) => {
    const w=span*.87, h=Math.min(top*.72,.24);
    const layer=document.createElement("canvas");
    layer.width=1024; layer.height=Math.round(1024*h/w);
    const g=layer.getContext("2d"), H=layer.height;
    g.fillStyle="#183648"; g.fillRect(0,0,1024,H);
    g.fillStyle="#73d9cf"; g.fillRect(0,0,7,H);
    g.textBaseline="middle";
    function line(text,y,px,color) {
      g.font=`600 ${px}px Arial,sans-serif`;
      const scale=Math.min(1,930/g.measureText(text).width);
      g.font=`600 ${px*scale}px Arial,sans-serif`;
      g.fillStyle=color; g.fillText(text,34,y);
    }
    line(title,hint?H*.33:H*.51,H*(hint?.49:.70),"#ffffff");
    if(hint) line(hint,H*.76,H*.29,"#bcf0ea");
    const tex=new THREE.CanvasTexture(layer);
    tex.colorSpace=THREE.SRGBColorSpace; tex.anisotropy=8;
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(w,h),
      new THREE.MeshBasicMaterial({map:tex,toneMapped:false}));
    sign.name="Подпись · "+title;
    sign.position.set(x,top*.53,z);
    sign.rotation.y=angle; group.add(sign);
  };
  make(width,0,0,depth/2+.003);
  make(width,Math.PI,0,-depth/2-.003);
  if(width>depth*1.6) {
    make(depth,Math.PI/2,width/2+.003,0);
    make(depth,-Math.PI/2,-width/2-.003,0);
  }
}
