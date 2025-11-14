#!/usr/bin/env python3
"""Patches SwiftTerm so it can build for visionOS."""

from __future__ import annotations

import stat
import sys
from pathlib import Path

SWIFTTERM_RELATIVE_PATH = "checkouts/SwiftTerm/Sources/SwiftTerm/iOS/iOSTextStorage.swift"

NEEDLE = (
    "  let _rect: CGRect\n"
    "  let _containsStart: Bool\n"
    "  let _containsEnd: Bool\n"
    "  \n"
    "  override var writingDirection: UITextWritingDirection {\n"
    "    return .leftToRight\n"
    "  }\n"
    "  \n"
)

OLD_PATCH = (
    "  let _rect: CGRect\n"
    "  let _containsStart: Bool\n"
    "  let _containsEnd: Bool\n"
    "  \n"
    "  // SWIFTTERM_VISIONOS_PATCH\n"
    "#if !os(visionOS)\n"
    "  override var writingDirection: UITextWritingDirection {\n"
    "    return .leftToRight\n"
    "  }\n"
    "#else\n"
    "  override var writingDirection: UITextWritingDirection {\n"
    "    return .leftToRight\n"
    "  }\n"
    "#endif\n"
    "  \n"
)

PATCH = (
    "  let _rect: CGRect\n"
    "  let _containsStart: Bool\n"
    "  let _containsEnd: Bool\n"
    "  \n"
    "  // SWIFTTERM_VISIONOS_PATCH\n"
    "#if !os(visionOS)\n"
    "  override var writingDirection: UITextWritingDirection {\n"
    "    return .leftToRight\n"
    "  }\n"
    "#endif\n"
    "  \n"
)


def ensure_writable(path: Path) -> None:
    mode = path.stat().st_mode
    if not mode & stat.S_IWUSR:
        path.chmod(mode | stat.S_IWUSR)


def patch_text(text: str) -> tuple[str, bool]:
    if PATCH in text:
        return text, False
    if OLD_PATCH in text:
        return text.replace(OLD_PATCH, PATCH), True
    if NEEDLE in text:
        return text.replace(NEEDLE, PATCH), True
    if "SWIFTTERM_VISIONOS_PATCH" in text:
        raise SystemExit("SwiftTerm patch marker changed; update patch script")
    raise SystemExit("SwiftTerm signature not found; patch format may have changed")


def main() -> int:
    sp_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    if not sp_dir:
        return 0
    swiftterm_file = sp_dir / SWIFTTERM_RELATIVE_PATH
    if not swiftterm_file.exists():
        return 0
    text = swiftterm_file.read_text()
    new_text, changed = patch_text(text)
    if not changed:
        return 0
    ensure_writable(swiftterm_file)
    swiftterm_file.write_text(new_text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
