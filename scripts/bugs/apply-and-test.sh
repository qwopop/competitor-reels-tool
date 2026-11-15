#!/usr/bin/env bash
# Prove, on a scratch copy, what the bug patch does. The repository itself is never changed.
#
#   scripts/bugs/apply-and-test.sh
#
# 1. copies the tracked files to a temp directory and applies remix-intermittent-failure.patch there
# 2. runs the EXISTING backend test suite on the patched copy: it must still pass
# 3. runs scripts/bugs/test_patched_remix.py on the patched copy: the remix endpoint must
#    fail with 500 for the acronym titles and the failure counter must increase
# 4. runs that same test on the clean code: it must be skipped/fail there, which shows it
#    detects the patch (the endpoint is fine without it)
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# The whole tracked tree: some tests read files at the repository root (render.yaml, observability/).
(cd "$root" && git ls-files -z | tar --null -T - -cf -) | (cd "$work" && tar -xf -)
(cd "$work" && patch -p1 --silent < "$root/scripts/bugs/remix-intermittent-failure.patch")
# patch paths are backend/app/remix.py relative to the repo root
if ! grep -q normalise_acronyms "$work/backend/app/remix.py"; then
  echo "The patch did not apply to the scratch copy." >&2; exit 1
fi
grep -q normalise_acronyms "$root/backend/app/remix.py" && { echo "The committed code contains the bug!" >&2; exit 1; }

cp "$root/scripts/bugs/test_patched_remix.py" "$work/backend/tests/test_patched_remix.py"
# Share the project's virtualenv so nothing is downloaded twice.
export UV_PROJECT_ENVIRONMENT="${UV_PROJECT_ENVIRONMENT:-$root/backend/.venv}"
cd "$work/backend"

echo "== 1. existing suite on the patched copy (must pass; test_bug_patch.py is skipped because it asserts the tree is unpatched) =="
uv run --frozen pytest -q --ignore=tests/test_patched_remix.py --ignore=tests/test_bug_patch.py
echo "== 2. the bug test on the patched copy (500 for acronym titles, counter rises) =="
BUG_PATCH_APPLIED=1 uv run --frozen pytest -q tests/test_patched_remix.py
echo "== 3. the same bug test on the clean code (must detect that the patch is absent) =="
cp "$root/backend/app/remix.py" app/remix.py
if BUG_PATCH_APPLIED=1 uv run --frozen pytest -q tests/test_patched_remix.py >/dev/null 2>&1; then
  echo "The bug test passed on clean code: it proves nothing." >&2; exit 1
fi
echo "OK: the existing tests pass with the bug, the bug test fails without it."
