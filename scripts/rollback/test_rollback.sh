#!/usr/bin/env bash
# Runs the shell of each `run` block of .github/workflows/rollback.yml against mocks
# (gh, docker, curl, sleep). Usage: scripts/rollback/test_rollback.sh
set -u
root=$(cd "$(dirname "$0")/../.." && pwd)
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin"
python3 - "$root/.github/workflows/rollback.yml" "$work" <<'PY'
import sys, yaml
wf = yaml.safe_load(open(sys.argv[1]))
for job, jd in wf["jobs"].items():
    for s in jd["steps"]:
        if "run" in s:
            n = s["name"].lower().replace(" ", "_")
            open(f"{sys.argv[2]}/{job}__{n}.sh", "w").write(s["run"])
PY
# gh mock: promote runs 11 (already, no deploy) and 10 (deployed, previous in log)
cat > "$work/bin/gh" <<'M'
#!/usr/bin/env bash
case "$*" in
  *workflows/promote.yml/runs*) [ -n "${NO_RUNS:-}" ] || printf '11\n10\n' ;;
  *runs/11/jobs*) ;;
  *runs/10/jobs*) echo 555 ;;
  *jobs/555/logs*) printf 'x\r\nPrevious prod version: %s\r\n' "${LOGTAG-20261110-100000-aaaaaaa}" ;;
esac
M
cat > "$work/bin/docker" <<'M'
#!/usr/bin/env bash
case "$*" in *"${MISSING_TAG:-@@none}"*) exit 1;; esac; exit 0
M
cat > "$work/bin/curl" <<'M'
#!/usr/bin/env bash
case "$*" in
  *-X\ POST*) echo "$*" >> "$HOOK_LOG"; [ -n "${HOOK_FAIL:-}" ] && exit 22; exit 0;;
  *) echo "{\"status\":\"ok\",\"database\":\"ok\",\"version\":\"${LIVE:-v}\",\"environment\":\"prod\"}";;
esac
M
printf '#!/usr/bin/env bash\nexit 0\n' > "$work/bin/sleep"
chmod +x "$work/bin/"*
fail=0
t() { # name expected-exit grep-pattern ; env via caller
  local name=$1 want=$2 pat=$3 script=$4; shift 4
  : > "$work/out"; : > "$work/gout"; : > "$work/sum"; : > "$work/hook"
  env PATH="$work/bin:$PATH" GITHUB_OUTPUT="$work/gout" GITHUB_STEP_SUMMARY="$work/sum" HOOK_LOG="$work/hook" \
    GITHUB_REPOSITORY=Own/repo GITHUB_REPOSITORY_OWNER=Own "$@" bash -e "$work/$script.sh" > "$work/out" 2>&1
  local rc=$?
  if [ "$rc" = "$want" ] && { [ -z "$pat" ] || cat "$work/out" "$work/gout" "$work/sum" | grep -q -- "$pat"; }; then echo "ok   $name"
  else echo "FAIL $name (rc=$rc want=$want pattern=$pat)"; sed 's/^/     /' "$work/out"; fail=1; fi
}
P=resolve__pick_the_tag
t "branch guard" 1 "only runs from main" resolve__only_run_from_main GITHUB_REF=refs/heads/x
t "main allowed" 0 "" resolve__only_run_from_main GITHUB_REF=refs/heads/main
t "explicit tag wins" 0 "tag=20261101-000000-bbbbbbb" $P INPUT_TAG=" 20261101-000000-bbbbbbb "
t "default from promote log" 0 "tag=20261110-100000-aaaaaaa" $P INPUT_TAG=
t "image lowercased" 0 "image=ghcr.io/own/clipremix" $P INPUT_TAG=
t "bad format" 1 "is not an image tag" $P INPUT_TAG=latest
t "bad format from log (unknown)" 1 "is not an image tag" $P INPUT_TAG= LOGTAG=unknown
t "no promote runs" 1 "No previous prod version" $P INPUT_TAG= NO_RUNS=1
t "tag not in GHCR" 1 "does not exist" $P INPUT_TAG=20261101-000000-bbbbbbb MISSING_TAG=20261101
S=rollback__check_the_deploy_settings
t "skip without secrets" 0 "ready=false" $S DEPLOY_HOOK= PROD_URL=
t "skip notice names both" 0 "RENDER_DEPLOY_HOOK_URL secret and the RENDER_APP_URL" $S DEPLOY_HOOK= PROD_URL=
t "settings ok" 0 "ready=true" $S DEPLOY_HOOK=https://h/x PROD_URL=https://p
C=rollback__check_what_prod_runs_now
t "already on tag" 0 "already=true" $C PROD_URL=https://p TAG=v LIVE=v
t "different tag" 0 "already=false" $C PROD_URL=https://p TAG=t LIVE=v
D=rollback__trigger_the_deploy_of_this_image
t "hook with ?" 0 "" $D DEPLOY_HOOK=https://h/x?key=1 IMAGE=ghcr.io/o/clipremix TAG=t
grep -q 'key=1&imgURL=ghcr.io%2Fo%2Fclipremix%3At' "$work/hook" && echo "ok   imgURL appended with &" || { echo "FAIL imgURL &"; fail=1; }
t "hook without ?" 0 "" $D DEPLOY_HOOK=https://h/x IMAGE=ghcr.io/o/clipremix TAG=t
grep -q 'h/x?imgURL=' "$work/hook" && echo "ok   imgURL appended with ?" || { echo "FAIL imgURL ?"; fail=1; }
t "hook failure hides url" 1 "deploy hook call failed" $D DEPLOY_HOOK=https://h/TOPSEKRET IMAGE=i TAG=t HOOK_FAIL=1
grep -q TOPSEKRET "$work/out" && { echo "FAIL url leaked"; fail=1; } || echo "ok   url not printed"
W=rollback__wait_until_the_old_version_is_live_and_healthy
t "health reports tag" 0 "Rolled prod back" $W PROD_URL=https://p TAG=t LIVE=t IMAGE=i
t "health never reports tag" 1 "did not become healthy" $W PROD_URL=https://p TAG=t LIVE=other IMAGE=i
exit $fail
