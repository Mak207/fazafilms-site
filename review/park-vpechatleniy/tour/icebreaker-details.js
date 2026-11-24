import * as THREE from 'three';

/** Exact, readable hull lettering over the generated relief. Master GLBs stay intact. */
export function attachIcebreakerDetails(instanceRoot, originalDimensions) {
  if (!instanceRoot || instanceRoot.userData.icebreakerLettering) return null;
  const ratio = originalDimensions[2] / 18;
  const canvas = document.createElement('canvas');
  canvas.width = 2048; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#122254'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#f2f2e9'; ctx.font = '600 164px Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const letters = [...'АТОМФЛОТ'];
  letters.forEach((letter, i) => ctx.fillText(letter, 192 + i * (1664 / 7), 135));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: .66, metalness: .08 });
  material.name = 'АТОМФЛОТ · точная бортовая надпись';
  const geometry = new THREE.PlaneGeometry(3.76 * ratio, .45 * ratio);
  const group = new THREE.Group(); group.name = 'АТОМФЛОТ · исправленные надписи';
  for (const side of [-1, 1]) {
    const sign = new THREE.Mesh(geometry, material);
    sign.name = 'АТОМФЛОТ · ' + (side < 0 ? 'левый борт' : 'правый борт');
    sign.position.set(side * 2.17 * ratio, 1.405 * ratio, -.28 * ratio);
    sign.rotation.y = side * Math.PI / 2;
    Object.assign(sign.userData, instanceRoot.userData, { correctedHullLettering: true });
    group.add(sign);
  }
  instanceRoot.add(group); instanceRoot.userData.icebreakerLettering = 'АТОМФЛОТ';
  return { group, text: 'АТОМФЛОТ', sides: 2, sourceLength: 18, ratio,
    dispose() { group.removeFromParent(); geometry.dispose(); material.dispose(); texture.dispose(); } };
}
