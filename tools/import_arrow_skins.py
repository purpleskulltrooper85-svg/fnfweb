"""Copy custom arrow skins from a folder on your PC into arrowskins/.

Usage:
    python tools/import_arrow_skins.py "C:\\Users\\purpl\\Downloads\\the_best_custom_arrow_skins"

A "skin" is any folder that contains a Sparrow sheet: a .png plus a .xml with
the same base name (e.g. arrow.png + arrow.xml, or NOTE_assets.png +
NOTE_assets.xml). Each one is copied into arrowskins/<folder name>/ as
arrow.png + arrow.xml so the game can load it. Existing skins are skipped unless
you pass --force.
"""
import argparse
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(ROOT, "arrowskins")
SKIP_XML = {"notesplashes", "notessplashes", "splash", "splashes"}


def find_sheets(src):
    """Yield (name, png_path, xml_path) for every sheet under src."""
    for dirpath, dirnames, filenames in os.walk(src):
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]
        lower = {f.lower(): f for f in filenames}
        seen = set()
        for f in filenames:
            base, ext = os.path.splitext(f)
            key = base.lower()
            if ext.lower() != ".png" or key in seen or key in SKIP_XML:
                continue
            xml = lower.get(key + ".xml")
            if not xml:
                continue
            seen.add(key)
            name = os.path.basename(dirpath) if base.lower() in ("arrow", "note_assets") else base
            if dirpath != src and base.lower() in ("arrow", "note_assets"):
                name = os.path.basename(dirpath)
            yield name, os.path.join(dirpath, f), os.path.join(dirpath, xml)


def main():
    ap = argparse.ArgumentParser(description="Import custom arrow skins.")
    ap.add_argument("source", help="folder containing your arrow skins")
    ap.add_argument("--force", action="store_true", help="overwrite skins that already exist")
    args = ap.parse_args()

    src = os.path.abspath(os.path.expanduser(args.source))
    if not os.path.isdir(src):
        print(f"Not a folder: {src}")
        return 1

    os.makedirs(DEST, exist_ok=True)
    count = 0
    for name, png, xml in find_sheets(src):
        safe = "".join(c for c in name if c.isalnum() or c in " -_").strip() or "skin"
        out = os.path.join(DEST, safe)
        if os.path.isdir(out) and not args.force:
            print(f"skip (exists): {safe}")
            continue
        os.makedirs(out, exist_ok=True)
        shutil.copy2(png, os.path.join(out, "arrow.png"))
        shutil.copy2(xml, os.path.join(out, "arrow.xml"))
        print(f"added: {safe}")
        count += 1

    print(f"\n{count} skin(s) copied into {DEST}")
    print("Reload the game and pick one under Options > Arrows.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
