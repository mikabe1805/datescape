"""Validate Resonance Garden runtime output and finalize manifest/checksums."""

import argparse
import hashlib
import json
import struct
from pathlib import Path


SOURCE_DIR = Path(__file__).resolve().parent
ART_DIR = SOURCE_DIR.parent
OUTPUT_DIR = ART_DIR / "output"
RAW_GLB_PATH = OUTPUT_DIR / "afterlight_resonance_garden_kit.raw.glb"
RUNTIME_GLB_PATH = OUTPUT_DIR / "afterlight_resonance_garden_kit.runtime.draco.glb"
BLEND_PATH = OUTPUT_DIR / "afterlight_resonance_garden_kit.blend"
PREVIEW_PATH = OUTPUT_DIR / "afterlight_resonance_garden_kit.preview.png"
MANIFEST_PATH = OUTPUT_DIR / "afterlight_resonance_garden_kit.manifest.json"
CHECKSUM_PATH = OUTPUT_DIR / "afterlight_resonance_garden_kit.checksums.sha256"


def parse_glb(path):
    data = path.read_bytes()
    if len(data) < 20:
        raise RuntimeError("{} is unexpectedly small".format(path.name))
    magic, version, declared_length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2 or declared_length != len(data):
        raise RuntimeError("{} has an invalid GLB header".format(path.name))
    json_length, json_type = struct.unpack_from("<I4s", data, 12)
    if json_type != b"JSON":
        raise RuntimeError("{} does not begin with a JSON chunk".format(path.name))
    document = json.loads(data[20:20 + json_length].decode("utf-8"))
    return data, document


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def relative_label(path):
    try:
        return path.relative_to(ART_DIR).as_posix()
    except ValueError:
        return path.name


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tool-version", default="4.4.1")
    parser.add_argument("--draco-roundtrip-ok", action="store_true")
    args = parser.parse_args()

    required = [RAW_GLB_PATH, RUNTIME_GLB_PATH, BLEND_PATH,
                PREVIEW_PATH, MANIFEST_PATH]
    missing_files = [str(path) for path in required if not path.is_file()]
    if missing_files:
        raise RuntimeError("Missing build outputs: {}".format(missing_files))

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    raw_data, raw_document = parse_glb(RAW_GLB_PATH)
    runtime_data, runtime_document = parse_glb(RUNTIME_GLB_PATH)
    expected_nodes = manifest["piece_nodes"] + manifest["marker_nodes"]
    raw_nodes = [node.get("name", "") for node in raw_document.get("nodes", [])]
    runtime_nodes = [node.get("name", "")
                     for node in runtime_document.get("nodes", [])]
    raw_missing = [name for name in expected_nodes if name not in raw_nodes]
    runtime_missing = [name for name in expected_nodes if name not in runtime_nodes]
    if raw_missing or runtime_missing:
        raise RuntimeError(
            "Stable nodes missing after compression: raw={} runtime={}".format(
                raw_missing, runtime_missing))
    if any(name.startswith("__PREVIEW_") for name in runtime_nodes):
        raise RuntimeError("Preview-only nodes leaked into runtime GLB")

    raw_extras = {node.get("name", "") for node in raw_document.get("nodes", [])
                  if node.get("extras")}
    runtime_extras = {
        node.get("name", "") for node in runtime_document.get("nodes", [])
        if node.get("extras")}
    lost_extras = sorted((set(expected_nodes) & raw_extras) - runtime_extras)
    if lost_extras:
        raise RuntimeError(
            "Runtime compression stripped node extras: {}".format(lost_extras))

    primitives = [primitive for mesh in runtime_document.get("meshes", [])
                  for primitive in mesh.get("primitives", [])]
    draco_primitives = [
        primitive for primitive in primitives
        if "KHR_draco_mesh_compression" in primitive.get("extensions", {})]
    if not primitives or len(draco_primitives) != len(primitives):
        raise RuntimeError(
            "Expected every runtime primitive to use Draco: {}/{}".format(
                len(draco_primitives), len(primitives)))
    extensions_used = runtime_document.get("extensionsUsed", [])
    extensions_required = runtime_document.get("extensionsRequired", [])
    if ("KHR_draco_mesh_compression" not in extensions_used or
            "KHR_draco_mesh_compression" not in extensions_required):
        raise RuntimeError("Runtime GLB does not require the Draco extension")
    if not args.draco_roundtrip_ok:
        raise RuntimeError(
            "Pinned decoder round-trip must succeed before finalization")

    generated_assets = [BLEND_PATH, RAW_GLB_PATH, RUNTIME_GLB_PATH, PREVIEW_PATH]
    source_assets = [
        SOURCE_DIR / "build_resonance_garden_kit.py",
        SOURCE_DIR / "finalize_resonance_garden.py",
        SOURCE_DIR / "build_resonance_garden.ps1",
    ]
    checksum_targets = [path for path in generated_assets + source_assets
                        if path.is_file()]
    checksums = {relative_label(path): sha256(path) for path in checksum_targets}

    generator = runtime_document.get("asset", {}).get("generator", "")
    manifest["byte_size"] = len(raw_data)
    manifest["runtime_asset"] = {
        "asset": RUNTIME_GLB_PATH.name,
        "byte_size": len(runtime_data),
        "compression": "KHR_draco_mesh_compression",
        "compressed_primitive_count": len(draco_primitives),
        "primitive_count": len(primitives),
        "node_count": len(runtime_document.get("nodes", [])),
        "mesh_count": len(runtime_document.get("meshes", [])),
        "material_count": len(runtime_document.get("materials", [])),
        "pipeline": "@gltf-transform/cli@{} draco --method edgebreaker".format(
            args.tool_version),
        "document_generator": generator,
    }
    manifest["checksums_sha256"] = checksums
    manifest["validation"].update({
        "runtime_glb_header": "ok",
        "runtime_expected_piece_nodes": "ok",
        "runtime_expected_marker_nodes": "ok",
        "runtime_node_extras_preserved": "ok",
        "runtime_draco_extension": "ok",
        "runtime_all_primitives_draco": True,
        "pinned_decoder_roundtrip": "ok",
        "pinned_gltf_transform_version": args.tool_version,
    })
    MANIFEST_PATH.write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    checksum_lines = []
    for path in checksum_targets + [MANIFEST_PATH]:
        checksum_lines.append("{}  {}".format(
            sha256(path), relative_label(path)))
    CHECKSUM_PATH.write_text(
        "\n".join(sorted(checksum_lines)) + "\n", encoding="utf-8")
    print("RESONANCE_GARDEN_FINALIZE_OK")
    print(json.dumps({
        "raw_bytes": len(raw_data),
        "runtime_bytes": len(runtime_data),
        "runtime_generator": generator,
        "draco_primitives": len(draco_primitives),
        "stable_nodes": len(expected_nodes),
        "checksums": len(checksum_lines),
    }, indent=2))


if __name__ == "__main__":
    main()
