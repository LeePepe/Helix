#!/usr/bin/env python3
"""
Find design system guide in the project hierarchy.
Returns the absolute path to the guide, or exits with code 1 if not found.
"""

import os
import sys
from pathlib import Path


def find_design_system_guide(start_dir=None):
    """
    Search for .github/design-system-guide.md using priority strategy:
    1. Current directory
    2. Parent directories up to git root
    3. Global search within git repo
    """
    if start_dir is None:
        start_dir = Path.cwd()
    else:
        start_dir = Path(start_dir).resolve()

    # Strategy 1 & 2: Search upward from current directory
    current = start_dir
    git_root = None

    while current != current.parent:
        # Check for design system guide
        candidate = current / ".github" / "design-system-guide.md"
        if candidate.exists():
            return candidate

        # Track git root for strategy 3
        if (current / ".git").exists():
            git_root = current

        current = current.parent

    # Strategy 3: Global search within git repo
    if git_root:
        for candidate in git_root.rglob(".github/design-system-guide.md"):
            # Return the one closest to start_dir
            try:
                candidate.relative_to(start_dir)
                return candidate
            except ValueError:
                # Not relative to start_dir, but still valid
                return candidate

    return None


if __name__ == "__main__":
    start_dir = sys.argv[1] if len(sys.argv) > 1 else None

    guide_path = find_design_system_guide(start_dir)

    if guide_path:
        print(guide_path)
        sys.exit(0)
    else:
        print("Design system guide not found", file=sys.stderr)
        sys.exit(1)
