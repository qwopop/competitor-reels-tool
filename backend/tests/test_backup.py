"""The prod backup workflow (#84): its shape, and a real backup/restore rehearsal."""

import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "backup-db.yml"
DEPLOY_DOC = (ROOT / "docs" / "deploy.md").read_text()


def workflow():
    return yaml.safe_load(WORKFLOW.read_text())


def triggers():
    data = workflow()
    return data.get("on", data.get(True))


def test_runs_on_a_schedule_and_by_hand():
    assert "schedule" in triggers() and "workflow_dispatch" in triggers()


def test_artifact_has_a_stated_retention():
    steps = workflow()["jobs"]["backup"]["steps"]
    upload = next(s for s in steps if "upload-artifact" in s.get("uses", ""))
    assert isinstance(upload["with"]["retention-days"], int)


def test_secrets_are_documented_and_missing_ones_skip_with_a_notice():
    text = WORKFLOW.read_text()
    for name in ("NEON_PROD_DATABASE_URL", "BACKUP_PASSPHRASE", "NEON_SCRATCH_DATABASE_URL"):
        assert name in DEPLOY_DOC
    assert "::notice::" in text


def test_no_secret_is_echoed_or_dumped_to_logs():
    for path in [WORKFLOW, *(ROOT / "scripts" / "backup").glob("*.sh")]:
        for line in path.read_text().splitlines():
            if line.strip().startswith("#"):
                continue
            assert not re.search(r"(echo|printf)[^|]*\$\{?(SOURCE_DATABASE_URL|TARGET_DATABASE_URL|BACKUP_PASSPHRASE|URL|PASS)\b", line), line
            assert "set -x" not in line


def test_dump_is_encrypted_before_it_touches_disk():
    script = (ROOT / "scripts" / "backup" / "backup.sh").read_text()
    assert re.search(r"pg_dump .*\\\n\s*\| openssl enc", script)


needs_pg = pytest.mark.skipif(
    not (os.environ.get("TEST_DATABASE_URL") and shutil.which("pg_dump") and shutil.which("openssl")),
    reason="needs TEST_DATABASE_URL (PostgreSQL), pg_dump and openssl",
)


@needs_pg
def test_backup_restore_rehearsal_on_postgresql():
    admin = os.environ["TEST_DATABASE_URL"].rsplit("/", 1)[0] + "/postgres"
    # A dump from a newer pg_dump does not restore into an older server (see docs/deploy.md).
    server = int(subprocess.run(["psql", admin, "-tAc", "SHOW server_version_num"], capture_output=True, text=True).stdout.strip() or 0) // 10000
    client = int(re.search(r"(\d+)", subprocess.run(["pg_dump", "--version"], capture_output=True, text=True).stdout).group(1))
    if client > server:
        pytest.skip(f"pg_dump {client} is newer than the server {server}; the CI rehearsal job covers this")
    res = subprocess.run([str(ROOT / "scripts/backup/rehearse.sh"), admin], capture_output=True, text=True)
    assert res.returncode == 0, res.stdout + res.stderr
    assert "row counts match" in res.stdout
