import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// A bone-and-animation-only GLB: exhibition mesh/texture/skin assets are reused.
export async function exportMotionLibrary(lab, modelId) {
  lab.pause(); lab.setRestPose([modelId]);
  const runtime = lab.getRuntime(modelId);
  const root = cloneSkinned(runtime.root);
  const remove = [];
  root.traverse((node) => { if (node.isMesh || node.isLight || node.isCamera) remove.push(node); });
  for (const node of remove) node.removeFromParent();
  root.updateMatrixWorld(true);
  const animations = runtime.clips.filter((clip) => clip.name.startsWith('UPF · '));
  if (animations.length !== 13) throw new Error(`Expected 13 retargeted clips, got ${animations.length}`);
  const exporter = new GLTFExporter();
  const buffer = await exporter.parseAsync(root, { animations, binary: true, onlyVisible: false, trs: true });
  if (!(buffer instanceof ArrayBuffer)) throw new Error('GLTFExporter did not return binary data');
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 16384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  return { base64: btoa(binary), bytes: bytes.length, modelId,
    clips: animations.map((clip) => ({name:clip.name, duration:clip.duration})), meshCount:0 };
}
