// The repeat is the width in metres measured by the material's photographer.
const scans = {
  wall: {file:'plaster',width:1.5,normal:.36,roughness:.94},
  tile: {file:'stone',width:1.9,normal:.62,roughness:.79},
  wood: {file:'oak',width:1.8,normal:.31,roughness:.73}
};

export function scannedSurfaces(THREE,loader,renderer) {
  const textures=new Map();
  function texture(spec,channel) {
    const name=spec.file+'-'+channel;
    if(textures.has(name))return textures.get(name);
    const map=loader.load(new URL('art/surfaces/'+name+'.webp',import.meta.url).href,
      ()=>window.dispatchEvent(new Event('ringtexture')));
    map.wrapS=map.wrapT=THREE.RepeatWrapping;
    map.repeat.setScalar(1/spec.width);
    map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    map.colorSpace=channel==='color'?THREE.SRGBColorSpace:THREE.NoColorSpace;
    textures.set(name,map);
    return map;
  }
  return function apply(material,kind) {
    const scan=scans[kind];
    if(!scan)return false;
    material.map=texture(scan,'color');
    material.normalMap=texture(scan,'normal');
    material.roughnessMap=texture(scan,'rough');
    material.normalScale.setScalar(scan.normal);
    material.roughness=scan.roughness;
    return true;
  };
}
