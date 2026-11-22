# Sources, build and fidelity

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

`retarget-experiment.js` uses temporary clones. It reparents the two source UpLeg bones to Hips while preserving the rest world transform, samples their new local motion at 60 Hz plus authored key times, deduplicates Float32 key times, and runs UPF with explicit one-to-one mapping and CURRENT poses. This avoids interpreting compressed mesh coordinates as skeleton scale. The target retains its own local bone offsets. Quaternion outputs are checked for finite nonzero norms and normalized.

UPF transfers root position and bone rotation/scale, not non-root translation tracks. The intermediate reparent reconstruction is not a claim of exact final foot trajectories.

`export-motion-library.js` exports animations and nodes only. The motion GLBs contain no mesh, texture or replacement skin. `tools/build_motion_bundles.py` compresses them using gltfpack 1.3 (`-c -kn -noq -af 0 -ar 16 -at 24 -as 24`) and compares decoded playback to the uncompressed UPF result at 21 phases of each clip.

| Motion library | Size | Compared poses | Maximum joint position difference |
| --- | ---: | ---: | ---: |
| `emma-native-motions.glb` | 1,074,652 bytes | 273 | 0.1194 mm |
| `ethan-native-motions.glb` | 1,336,596 bytes | 273 | 0.1424 mm |

Both contain 13 clips, zero meshes, and passed finite-transform checks. This verifies export fidelity, not the artistic quality of every complete movement or every transition. Full details and hashes are in `checks/motion-bundle-validation.json`.

## Runtime dependencies

- Three.js r169, MIT: `vendor/three/`. `source.json` pins downloaded paths and SHA256 hashes.
- hh-hang three-player-controller FootIK 0.6.3, MIT, commit `29403c7dcc48c43153c2d6126571e685ca012617`: the separate contact experiment uses a pinned source bundle and explicit metre conversion. Preserve its accompanying license and build provenance.
- The baseline imports the original `../visitors-v40.js` from v42 and checks its content hash. It does not load a rewritten imitation of the controller.

## Known baseline defect

At seed 424242, fixed step 1/60 s, v42 frame 507 (8.45 s) places Emma's left toe vertex 48828 at Y = -0.0805183 m. The vertex is entirely weighted to LeftToeBase. The ankle is still at +0.1220089 m, so an ankle-height check misses the shoe penetration. A fresh replay reproduced it exactly. At 30 seconds both actors also occupy the same observation position `(0, 0, 3.62)`.

These are measured properties of the preserved baseline. They do not imply that this lab has already replaced the production navigation or solved actor avoidance.
