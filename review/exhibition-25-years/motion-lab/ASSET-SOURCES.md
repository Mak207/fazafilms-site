# Sources, build and fidelity

Version 43 is integrated into the working branch of the real exhibition. The public fazafilms.ru deployment remains v42 pending owner review. The 45-second desktop/mobile run is complete; [integration results](INTEGRATION-V43.md) explicitly retain the strict cap failure and the separate 2 mm contact acceptance. Numerical asset validation is not a deployment or a complete behaviour approval.

## Existing exhibition avatars

The lab reuses `../assets/models/visitors/walking-woman.glb` and `walking-man.glb` from v42 commit `2be1b5b1567716e4b9b47fb252953431bc352be7`. Their mesh, materials, texture files and skin are not replaced by the motion libraries.

| File | SHA256 |
| --- | --- |
| walking-woman.glb | `be518e47c6e418c3a3dc4cf0692bbcc324ff9b70af23c0c539376f1e6debb957` |
| walking-man.glb | `710096e92e0acbfac10f9680f262514402822dfeda33f9f0dc4117bec24172d9` |

Existing visitor notices remain in their asset directory.

## Animation donors

[Avatar Studio](https://github.com/memoriesrohit/avatar-studio/tree/2fd9ec82fbe1613d40ae38aadcca3f410725f740), pinned revision `2fd9ec82fbe1613d40ae38aadcca3f410725f740`:

| Asset | Git blob | SHA256 |
| --- | --- | --- |
| `models/emma_casual.glb` | `17f922a84643c38dee8771f9613d6c883672f539` | `dc825893bdb47fa25fe3017ab0c923018b57003a7d734a5206366fb95036769a` |
| `models/ethan_casual.glb` | `c91c29eb512d6b459547432de81937d42ef1132c` | `88b282a080bc1d35d17f9b428afdd14404abda84e0f651424db4fa7e1dbb6ce5` |

Both Git object hashes were verified from the downloaded bytes. The original source notices, including Microsoft Rocketbox attribution, are copied unchanged to `licenses/`. See `checks/source-provenance.json` for exact URLs and measurements. Avatar Studio and Rocketbox assets are distributed under the notices supplied by those sources; the copied MIT notices must accompany redistribution.

The 13 real bone animation clips are Idle, Walk, Wave, Talk, Confident, Argue, Cheer, Laugh, Drink, Clap, Think, Shrug and Phone. Source avatars look different from the accepted exhibition avatars. The source models in this lab are comparison donors, not replacement appearance assets.

`tools/prepare_native_avatar.py` removes unused wardrobe meshes and zero-default facial morph targets while verifying that retained base geometry, skin data, bone hierarchy/TRS, inverse bind matrices and all bone animation sampler bytes remain unchanged. Its exact outputs were separately compressed using gltfpack 1.3 with `-c -kn -km -ke -noq -af 0 -ac`, without mesh simplification. The resulting comparison assets are `emma-native-original.glb` and `ethan-native-original.glb`.

## Retargeting

[UPF GTI retargeting-threejs](https://github.com/upf-gti/retargeting-threejs/tree/82f1b8218813547224dd96df1638c950d241824d), Apache-2.0; pinned source and full license in `vendor/upf/`.

All 80 joint names match, but source UpLeg bones have Spine as parent while the exhibition bones use Hips. Bind orientations differ by up to 73.57 degrees for Emma and 68.88 degrees for Ethan. Therefore direct track-name copying is invalid.

`retarget-experiment.js` uses temporary clones. It reparents the two source UpLeg bones to Hips while preserving the rest world transform, samples their new local motion at 60 Hz plus authored key times, and deduplicates Float32 key times. It then applies UPF `applyTPose` to both temporary skeletons before explicit one-to-one CURRENT retargeting. CURRENT alone is insufficient when the two real anatomical reference poses differ. The current default node transforms were checked against the inverse-bind reconstruction: they are genuine bind transforms, not an accidentally saved animation frame.

The former raw-CURRENT method preserved an anatomical arm bias of roughly 11–19°. Independent eight-phase source-to-current comparison accepted the canonical correction: maximum arm direction errors were 0.138° for Emma and 0.0264° for Ethan; leg direction errors were below 0.135°. The target retains its own local bone offsets, mesh, skin and inverse bind matrices. Quaternion outputs are checked for finite nonzero norms and normalized. Temporary CURRENT calibration also avoids treating compressed mesh coordinates as skeleton scale.

UPF transfers root position and bone rotation/scale, not non-root translation tracks. The intermediate reparent reconstruction is not a claim of exact final foot trajectories.

`export-motion-library.js` exports animations and nodes only. The motion GLBs contain no mesh, texture or replacement skin. The accepted current canonical libraries are installed in both this lab's `assets/` and the [real exhibition motion directory](../assets/models/visitors/motions/README.md).

| Current canonical library | Bytes | SHA-256 |
| --- | ---: | --- |
| `emma-native-motions.glb` | 1,097,224 | `ff0d24ed039371840a06f6dc1045fffc8e62345f96cd3d295ec3fab6fc4c25f4` |
| `ethan-native-motions.glb` | 1,372,436 | `34980ee3e9ce4e24c18cf5835d8a34f6e5e742ca7b12ed082cc6ad365cd9f397` |

Each contains 13 clips and zero meshes. The new packaging gate compared 13 × 21 phases × 80 joints per actor against the accepted uncompressed canonical result: position error below 0.1 mm, body orientation error below 0.013°, finger error below 0.015°. Facial helper orientations reach 0.087° and are reported separately. These limits describe data fidelity, not every transition or the artistic quality of every clip.

### Historical export and A/B/C results

`checks/motion-bundle-validation.json` documents the **earlier, pre-canonical bundles**: 1,074,652 / 1,336,596 bytes, 273 sampled poses per actor, and maximum export errors of 0.1194 / 0.1424 mm. It tested faithful encoding of the old UPF output and therefore did not detect the donor-to-target anatomical arm bias. It must not be cited as validation of the new hashes above.

`CONTACT-RESULTS.md`, `checks/contact-comparison.json`, the former 20 mm upward-only C correction, earlier Walk seam values, and `checks/ui-validation.json` are likewise preserved historical results. Re-running `contact-bench.html` with current files produces a new experiment, not the saved old A/B/C evidence. Version 43 instead uses independent signed whole-root floor alignment and authored turns; it does not import the lab's hook controller.

## Eight authored Rocketbox turns

Direct sources: [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox/tree/0943055db6ec570bcef9f2c8b41c9e5467c808f9), revision `0943055db6ec570bcef9f2c8b41c9e5467c808f9`, MIT. The eight files are `Assets/Animations/all_animations_max_motextr_xyz/{f,m}_turn_{left,right}_{90,180}.max.fbx`. Exact URLs, sizes, Git object hashes, SHA-256 hashes and license references are in [rocketbox-turns-manifest.json](tools/rocketbox-turns-manifest.json). The original Microsoft license is preserved as `../assets/models/visitors/motions/LICENSE.microsoft-rocketbox.txt`.

[export_rocketbox_world_samples.py](tools/export_rocketbox_world_samples.py) verifies the pinned inputs, imports the static reference and animation separately in Blender 4.5, and samples 54 mapped bone world matrices at 60 Hz. The animated Armature object's transform is included: most of the recorded turn yaw lives there. The format is `rocketbox-world-samples-v1`, column-major matrices, metres, +Y up. The `samplesRigid` matrices remove the imported uniform scale without removing position or orientation. A clip's static reference is not assumed to be a canonical bind pose.

[retarget_rocketbox_turns.mjs](tools/retarget_rocketbox_turns.mjs) builds a source hierarchy corresponding to the target's mapped parents and rebakes the sampled world poses into local tracks. It uses the existing pinned UPF library on temporary source/target skeletons. After `applyTPose`, both references explicitly use the same spine, arm, leg and Foot→ToeBase directions; this avoids selecting ToeEnd on one skeleton and ToeBase on the other. Original target offsets remain unchanged. The resulting GLB contains only nodes and animations.

| Current turn library in exhibition `motions/` | Bytes | SHA-256 |
| --- | ---: | --- |
| `emma-native-turns.glb` | 647,080 | `167cfe59e23167a05139d317c1bb118db888127b2bf3a48827bf40e9090e4fe3` |
| `ethan-native-turns.glb` | 714,880 | `14e62618fb556d22e4177ec4d60b2b2a1b992918db6282d93b3bf7433ab85b6d` |

Each contains TurnLeft90, TurnRight90, TurnLeft180 and TurnRight180. Nine samples per clip checked the source world directions against the retargeted current rig: arm/leg/foot errors below 0.0002°, knee-angle errors below 0.00005°, relative root yaw below 0.00001°, scaled root translation below 0.00000007 m. A separate check of every one of the 141 frames of each actor's Left90 clip confirmed world direction errors below 0.000064° and knee-angle errors below 0.000052°.

The larger difference measured in a separately constructed torso coordinate frame was traced to differing shoulder proportions and animated source shoulder translations; direct world and common-Hips comparisons confirm that it was not a leg/foot direction error. UPF retains target offsets and does not transfer those non-root shoulder translations.

At runtime, `prepareTurn` extracts recorded root yaw and XZ once, and the separate turn action supplies the joint pose. No yaw-angle warping is applied. Navigation checks the entire root trajectory, replans from its actual endpoint, and uses an approach segment facing the exhibit. These design properties and the asset checks do not replace continuous visual/contact acceptance.

See [exact portable CLI commands and prerequisites](README.md#пересборка-записанных-поворотов). The tools use explicit input/output paths, do not download dependencies, and do not publish the site. A smoke run of the portable converter reproduced the independently checked Emma Left90 GLB byte for byte.

## Runtime dependencies

- Three.js r169, MIT: `vendor/three/`. `source.json` pins downloaded paths and SHA256 hashes.
- hh-hang three-player-controller FootIK 0.6.3, MIT, commit `29403c7dcc48c43153c2d6126571e685ca012617`: the separate contact experiment uses a pinned source bundle and explicit metre conversion. Preserve its accompanying license and build provenance.
- The baseline imports the original `../visitors-v40.js` from v42 and checks its content hash. It does not load a rewritten imitation of the controller.

## Known baseline defect

At seed 424242, fixed step 1/60 s, v42 frame 507 (8.45 s) places Emma's left toe vertex 48828 at Y = -0.0805183 m. The vertex is entirely weighted to LeftToeBase. The ankle is still at +0.1220089 m, so an ankle-height check misses the shoe penetration. A fresh replay reproduced it exactly. At 30 seconds both actors also occupy the same observation position `(0, 0, 3.62)`.

These are measured properties of the preserved v42 baseline. The v43 working branch uses a new visitor controller; the public deployment still requires owner review. Neither these historical defects nor static asset checks establish final acceptance or full dynamic actor avoidance.
