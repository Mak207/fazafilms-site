#!/usr/bin/env python3
"""Fetch or verify exactly eight pinned author FBX files; never alter existing bytes."""
import argparse
import hashlib
import json
import pathlib
import urllib.parse
import urllib.request

PIN = "0943055db6ec570bcef9f2c8b41c9e5467c808f9"
PREFIX = "https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/" + PIN + "/"

def verify(data, asset):
    measured = {"bytes": len(data),
                "git_blob_sha1": hashlib.sha1(("blob " + str(len(data)) + "\0").encode() + data).hexdigest(),
                "sha256": hashlib.sha256(data).hexdigest()}
    for key, value in measured.items():
        if value != asset[key]:
            raise ValueError(asset["filename"] + ": " + key + " differs from pinned manifest")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=pathlib.Path,
                        default=pathlib.Path(__file__).resolve().parents[1] / "source-manifest.json")
    parser.add_argument("--out-dir", type=pathlib.Path, required=True)
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    if manifest["source_revision"] != PIN:
        raise ValueError("Unexpected source revision")
    expected = {f"{sex}_{action}.max.fbx" for sex in ("f", "m")
                for action in ("idle_neutral_01", "walk_neutral", "walk_start", "walk_stop")}
    assets = manifest["assets"]
    if len(assets) != 8 or {a["filename"] for a in assets} != expected:
        raise ValueError("Manifest must contain precisely the verified eight author files")
    args.out_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    for asset in assets:
        path = args.out_dir / asset["filename"]
        if path.exists():
            verify(path.read_bytes(), asset)
            mode = "verified_existing"
        elif args.verify_only:
            raise FileNotFoundError(path)
        else:
            relative = pathlib.PurePosixPath(asset["source_path"])
            if relative.is_absolute() or ".." in relative.parts:
                raise ValueError("Unsafe source path")
            url = PREFIX + urllib.parse.quote(asset["source_path"], safe="/")
            if asset["url"] != url:
                raise ValueError("Source URL differs from pinned official path")
            request = urllib.request.Request(url, headers={"User-Agent": "matched-rocketbox-reference"})
            with urllib.request.urlopen(request, timeout=60) as response:
                data = response.read()
            verify(data, asset)
            with path.open("xb") as stream:
                stream.write(data)
            mode = "downloaded_and_verified"
        rows.append({"file": asset["filename"], "mode": mode, "sha256": asset["sha256"]})
    print(json.dumps({"source_revision": PIN, "files": rows}, indent=2))

if __name__ == "__main__":
    main()
