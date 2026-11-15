"""The remix bug lives only as a patch file (scripts/bugs/). These tests keep it that way and
check that the bug build can never be promoted. The behaviour with the patch applied is
proved by scripts/bugs/apply-and-test.sh (CI: bug-patch.yml)."""

import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
PATCH = ROOT / "scripts" / "bugs" / "remix-intermittent-failure.patch"
TAG_RE = re.compile(r"^[0-9]{8}-[0-9]{6}-[0-9a-f]{7}$")


def promote_tag_regex() -> re.Pattern:
    """The tag-format check, read from promote.yml itself."""
    found = re.findall(r"grep -Eq '(\^\[0-9\]\{8\}[^']*)'", (ROOT / ".github/workflows/promote.yml").read_text())
    assert found, "promote.yml has no tag-format check"
    assert set(found) == {TAG_RE.pattern}
    return re.compile(found[0])


def test_committed_code_does_not_contain_the_bug():
    assert "normalise_acronyms" not in (ROOT / "backend/app/remix.py").read_text()


@pytest.mark.skipif(shutil.which("git") is None, reason="git not installed")
def test_patch_applies_to_the_committed_code():
    result = subprocess.run(["git", "apply", "--check", str(PATCH)], cwd=ROOT, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr


def test_promote_refuses_the_bug_build_tag():
    check = promote_tag_regex()
    assert check.match("20261115-120000-abcdef1")
    assert not check.match("bugtest-20261115-120000-abcdef1")


def test_bug_workflow_builds_prefixed_image_from_the_patch_and_never_touches_prod():
    text = (ROOT / ".github/workflows/deploy-dev-branch.yml").read_text()
    assert "tag_prefix: bugtest-" in text
    assert "patch: scripts/bugs/remix-intermittent-failure.patch" in text
    assert "workflow_dispatch" in text
    code = "\n".join(line for line in text.splitlines() if not line.lstrip().startswith("#"))
    assert "environment: prod" not in code and "promote" not in code.lower()
