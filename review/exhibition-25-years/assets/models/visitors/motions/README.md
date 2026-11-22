# Visitor motion libraries

The 13-clip libraries target the existing exhibition Emma/Ethan rigs. Version 43 recalibrates the temporary source and target skeletons to a shared anatomical T-pose using UPF's `applyTPose` before retargeting. The original meshes, skin, inverse bind matrices and bone offsets remain the appearance source.

The earlier bundles from commit `2fe1edd8c75800a6a31e82401034e97831562aa6` retained a difference between the anatomical reference poses. Independent comparison found a systematic arm bias; their export-accuracy test alone did not detect it. These files replace those bundles.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| emma-native-motions.glb | 1,097,224 | ff0d24ed039371840a06f6dc1045fffc8e62345f96cd3d295ec3fab6fc4c25f4 |
| ethan-native-motions.glb | 1,372,436 | 34980ee3e9ce4e24c18cf5835d8a34f6e5e742ca7b12ed082cc6ad365cd9f397 |

Each file has 13 named animations and zero meshes. Independent source-to-target Walk comparisons on eight phases accepted the new anatomical calibration. Packing was separately checked across 13 clips × 21 phases × 80 joints per actor: joint position error below 0.1 mm; body orientation error below 0.013°, finger error below 0.015°. Facial helper orientation error reaches 0.087° and is recorded separately. These are data and pose checks, not a claim that every complete scene behaviour has been visually accepted.

Source, retargeting and initial provenance: [laboratory sources](../../../../motion-lab/ASSET-SOURCES.md). The Avatar Studio and Microsoft notices are preserved alongside the files. Direct Rocketbox turn sources are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The visitor controller removes linear Hips XZ motion once and advances walking phase from actual travelled distance. Animation owns the joint pose; floor alignment moves a separate whole-root group. The v42 post-mixer leg solvers are absent.

## Authored turns

The separate turn bundles each contain `TurnLeft90`, `TurnRight90`, `TurnLeft180` and `TurnRight180`. They derive from the pinned Microsoft Rocketbox FBX sources; animated Armature world motion is included before retargeting.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| emma-native-turns.glb | 647,080 | 167cfe59e23167a05139d317c1bb118db888127b2bf3a48827bf40e9090e4fe3 |
| ethan-native-turns.glb | 714,880 | 14e62618fb556d22e4177ec4d60b2b2a1b992918db6282d93b3bf7433ab85b6d |

[Source and output manifest](rocketbox-turns-provenance.json) records the exact revision, source hashes and output hashes. Rebuild instructions and the small portable exporter/converter live in [the laboratory](../../../../motion-lab/README.md).

The controller separates authored turn yaw and XZ motion from Hips exactly once. It follows the original turn trajectory without rotating an Idle or Walk clip to fake the pivot. Route planning starts at the actual turn endpoint and approaches the next exhibit along its viewing direction.

Floor alignment uses the full Foot/Toe weighted-vertex union (combined weight ≥0.25) and a separate root group: at most +35 mm lift or −30 mm drop. The negative adjustment fades out during gestures so the controller does not force an airborne gesture onto the floor. This is flat-floor alignment, not foot locking or a terrain solver.
