import * as THREE from '../interactives/vendor/three-0.180/three.module.min.js';

// The three arched faces keep the original Screen material outline. The final
// ribbon follows Object174075804 and the two straight returns in the FBX.
export const screens = [
  { title: 'Волга на закате', position: [-20.25, 1.65, -12.0], target: [-23.60, 2.0, -12.05],
    images: ['barge-river', 'volga-windows/4'], water: [.43, .36], period: 29 },
  { title: 'Город у воды', position: [-22.55, 1.65, -10.0], target: [-22.53, 1.49, -13.20],
    images: ['bells-riverside', 'bells-riverside-dusk'], water: [.23, .23], period: 37 },
  { title: 'Излучины Волги', position: [-16., 1.65, -9.15], target: [-13.35, 1.60, -11.23],
    images: ['volga-windows/5', 'volga-windows/11'], water: [0, 0], period: 31 },
  { title: 'Панорама под кольцами', position: [25.0,1.66,8.35], target: [24.4,1.95,-.65],
    images: ['barge-river','bells-riverside'], water: [.43,.23], period: 43 }
];

export function lightGallery(scene, renderer) {
  scene.background = new THREE.Color(0xdcdad4);
  scene.fog = new THREE.FogExp2(0xdcdad4, .003);
  renderer.toneMappingExposure = 1.03;
  scene.add(new THREE.HemisphereLight(0xfff8ec, 0xb5ab9a, 1.36));
  const key = new THREE.DirectionalLight(0xffedda, 2.05);
  key.position.set(-23, 58, 31);
  key.castShadow = true;
  Object.assign(key.shadow.camera, { left: -48, right: 48, top: 37, bottom: -37, near: 1, far: 145 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -.00012;
  key.shadow.normalBias = .026;
  key.shadow.intensity = .55;
  scene.add(key);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const fill = new THREE.DirectionalLight(0xdce9fa, .68);
  fill.position.set(17, 15, -29);
  scene.add(fill);

  // Broad reflected sources give curved metal a readable profile even in shadow.
  const studio = new THREE.Scene();
  studio.background = new THREE.Color(.32, .31, .29);
  for (const [x,y,z,w,h,power] of [[-6,5,4,8,5,4.2],[5,4,-3,4,8,2.4],[0,7,0,9,7,1.8]]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w,h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(power,power*.97,power*.92), side: THREE.DoubleSide }));
    panel.position.set(x,y,z);
    panel.lookAt(0,0,0);
    studio.add(panel);
  }
  const generator = new THREE.PMREMGenerator(renderer);
  scene.environment = generator.fromScene(studio, .06).texture;
  scene.environmentIntensity = .58;
  generator.dispose();
  studio.children.forEach(p => { p.geometry.dispose(); p.material.dispose(); });

  function accent(position, target, power, color, angle) {
    const spot = new THREE.SpotLight(color, power, 12, angle, .8, 2);
    spot.position.fromArray(position);
    spot.target.position.fromArray(target);
    scene.add(spot, spot.target);
  }
  accent([-18,4.6,-7.7],[-19.1,1.6,-11.2],92,0xffddb5,.82);
  accent([25.5,5.9,5.9],[24.4,2.7,3.8],74,0xffead2,.85);
}

async function applyFinish(mesh, loader, renderer, name) {
  // Poly Haven CC0 scans: interior_tiles (1.9 m), plastered_wall_04 (3.2 m)
  // and walnut_veneer (1.8 m). The exported mesh UVs use those repeat sizes.
  const maps = await Promise.all(['color','normal','arm'].map(key =>
    loader.loadAsync('assets/finishes/' + name + '-' + key + '.webp')));
  const [color, normal, arm] = maps;
  color.colorSpace = THREE.SRGBColorSpace;
  for (const map of maps) {
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.flipY = false;
    map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }
  const material = new THREE.MeshStandardMaterial({
    name: name, map: color, normalMap: normal, aoMap: arm, roughnessMap: arm,
    roughness: name === 'wall' ? .98 : .9, metalness: 0, aoMapIntensity: .65,
    normalScale: new THREE.Vector2(.53, -.53), side: mesh.material.side
  });
  mesh.material = material;
}

async function applyScreen(mesh, loader, screen, clock) {
  const maps = await Promise.all(screen.images.map(name =>
    loader.loadAsync('../interactives/art/' + name + '.webp')));
  maps.forEach(map => { map.colorSpace = THREE.SRGBColorSpace; });
  const aspect = mesh.userData.displayAspect;
  if (!(aspect > 0)) throw new Error('Missing screen dimensions: ' + mesh.name);
  mesh.material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      time: clock, period: {value:screen.period}, faceAspect:{value:aspect},
      imageA: {value:maps[0]}, imageB: {value:maps[1]},
      imageAspects: {value:new THREE.Vector2(...maps.map(m => m.image.width/m.image.height))},
      water: {value:new THREE.Vector2(...screen.water)}
    },
    vertexShader: `
      varying vec2 faceUV;
      void main(){
        faceUV=vec2(uv.x,1.-uv.y);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }`,
    fragmentShader: `
      uniform float time,period,faceAspect;
      uniform vec2 imageAspects,water;
      uniform sampler2D imageA,imageB;
      varying vec2 faceUV;
      vec2 frame(float aspect,float waterline,float phase){
        float s=sin(phase), c=cos(phase);
        vec2 extent=.91*vec2(min(1.,faceAspect/aspect),min(1.,aspect/faceAspect));
        vec2 uv=vec2(.5)+vec2(.30*s,.18*c)*(1.-extent)+(faceUV-.5)*extent;
        // Keep the shoreline inside a 21 m ribbon throughout the dissolve.
        if(faceAspect>3.) uv.y=waterline+.065+.012*c+(faceUV.y-.5)*extent.y;
        float mask=waterline>0. ? 1.-smoothstep(waterline-.04,waterline,uv.y) : 0.;
        uv.x+=mask*.0032*sin(uv.y*117.+time*1.65+.6*sin(uv.x*38.-time));
        uv.y+=mask*.0012*cos(uv.y*81.-time*1.25);
        return uv;
      }
      void main(){
        float p=time*6.2831853/period;
        vec3 a=texture2D(imageA,frame(imageAspects.x,water.x,p)).rgb;
        vec3 b=texture2D(imageB,frame(imageAspects.y,water.y,p+.38)).rgb;
        gl_FragColor=vec4(mix(a,b,smoothstep(-.32,.32,-cos(p)))*.95,1.);
        #include <colorspace_fragment>
      }`
  });
}

export async function finishGallery(model, renderer, clock) {
  const loader = new THREE.TextureLoader();
  const tasks = [];
  model.traverse(mesh => {
    if (!mesh.isMesh) return;
    const category = mesh.name.replace(/^Pavilion_/, '');
    mesh.castShadow = !['glass','screen','tile','panorama'].includes(category);
    mesh.receiveShadow = category !== 'glass';
    if (category === 'tile' || category === 'plaster' || category === 'veneer') {
      tasks.push(applyFinish(mesh,loader,renderer,{tile:'floor',plaster:'wall',veneer:'veneer'}[category]));
    }
    if (/^display0[1-3]$/.test(category)) {
      tasks.push(applyScreen(mesh,loader,screens[Number(category.slice(-1))-1],clock));
    }
    if (category === 'panorama') tasks.push(applyScreen(mesh,loader,screens[3],clock));
  });
  if (tasks.length !== 7) throw new Error('Gallery scene has unexpected surface groups');
  await Promise.all(tasks);
  renderer.shadowMap.needsUpdate = true;
}
