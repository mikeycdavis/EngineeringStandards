#!/usr/bin/env bash
# Run this repository's complete CI pipeline in an ephemeral Docker container.
#
# The POSIX twin of scripts/ci.ps1, for Linux and macOS developers and for a future GitHub
# self-hosted runner, which would invoke this file and nothing else. The two scripts own the
# environment; neither owns the check list. That lives in scripts/pipeline.mjs, which
# .github/workflows/ci.yml also runs, so adding a check means editing one file rather than three.
#
# Host requirements: Docker and git. No Node, no npm, no globally installed anything — the checks
# run against a Node baked into the image at a pinned digest.
#
# Usage:
#   ./scripts/ci.sh [--keep-on-failure] [--verbose] [--project NAME]
set -euo pipefail

keep_on_failure=0
verbose=0
project=""

while [ $# -gt 0 ]; do
  case "$1" in
    --keep-on-failure) keep_on_failure=1 ;;
    --verbose) verbose=1 ;;
    --project) project="${2:?--project needs a name}"; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repo_root/compose.ci.yml"
report_dir="$repo_root/artifacts/local-ci"
report_path="$report_dir/latest.json"

# Derived from the directory rather than hardcoded, so this file can be copied into another
# repository unchanged. Stable image name for the layer cache; unique project name per run, so two
# concurrent runs cannot share a container, a network, or a teardown.
repo_slug="$(basename "$repo_root" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '-' | sed 's/-\{2,\}/-/g; s/^-//; s/-$//')"
image="${repo_slug}-ci:local"
[ -n "$project" ] || project="${repo_slug}-ci-$(date -u +%s)-$$"
ci_container="${project}-ci"
export CI_IMAGE="$image"
export LOCAL_CI_VERBOSE="$verbose"

compose() { docker compose -p "$project" -f "$compose_file" "$@"; }
stage() { printf '\n==> %s\n' "$1"; }

# Teardown removes exactly what this run created, scoped by the unique project name. It can never
# reach a developer's own containers, volumes, or databases. There is deliberately no
# `docker system prune` anywhere in this file: a CI script that garbage-collects the host is a CI
# script that deletes someone's work.
teardown() {
  stage "Tearing down project '$project'"
  # The one-off `run` container is named, so it is removed by name; `down` then removes the
  # project's network and any volumes it created. Both are scoped to this run's project.
  docker rm --force --volumes "$ci_container" >/dev/null 2>&1 || true
  compose down --volumes --remove-orphans --timeout 10 || true
}

exit_code=1
finish() {
  if [ "$keep_on_failure" -eq 1 ] && [ "$exit_code" -ne 0 ]; then
    printf '\nContainers kept for inspection (--keep-on-failure).\n'
    printf '  docker logs %s\n' "$ci_container"
    printf '  docker compose -p %s -f compose.ci.yml run --rm --entrypoint bash ci\n' "$project"
    printf '  docker rm -f %s && docker compose -p %s -f compose.ci.yml down --volumes --remove-orphans\n' "$ci_container" "$project"
  else
    teardown
  fi
  printf '\n'
  if [ "$exit_code" -eq 0 ]; then echo "LOCAL CI PASSED"; else echo "LOCAL CI FAILED (exit $exit_code)"; fi
}
# Runs on every exit path, including an interrupted run. Cleanup that only happens on success is
# cleanup that never happens when it matters.
trap finish EXIT

command -v docker >/dev/null 2>&1 || {
  echo "docker was not found on PATH. Docker is the only required host dependency besides git." >&2
  exit_code=2; exit 2
}
docker info --format '{{.ServerVersion}}' >/dev/null 2>&1 || {
  echo "the Docker daemon is not reachable. Start Docker and retry." >&2
  exit_code=2; exit 2
}

echo "repository : $repo_root"
echo "image      : $image"
echo "project    : $project"

stage "Building the CI image"
compose build

# Dependencies, if this repository ever grows any. `--wait` blocks on each declared healthcheck and
# fails when a service never becomes healthy; no sleep is involved. The list is empty today — no
# database, cache, or broker — so this costs one command and means adding a service later needs no
# change here.
services="$(compose config --services | grep -v '^ci$' || true)"
if [ -n "$services" ]; then
  stage "Starting dependencies and waiting for health: $(echo "$services" | tr '\n' ' ')"
  # shellcheck disable=SC2086
  compose up --detach --wait $services
fi

stage "Running the pipeline"
# `run --name` rather than `run --rm`: the container must outlive its own exit long enough for the
# verification record to be copied out. `run` also propagates the pipeline's exit code directly and
# leaves its output unprefixed, which `up` does not. The summary block the pipeline prints is
# rendered inside the container, so this script formats nothing and cannot drift from its twin.
pipeline_exit=0
compose run --name "$ci_container" ci || pipeline_exit=$?

stage "Extracting the verification record"
mkdir -p "$report_dir"
rm -f "$report_path"
# Copied out of the stopped container rather than written through a bind mount. Nothing on the host
# was reachable from inside the container.
docker cp "${ci_container}:/work/artifacts/local-ci/latest.json" "$report_path" >/dev/null 2>&1 || true

if [ -f "$report_path" ]; then
  echo "record          : $report_path"
elif [ "$pipeline_exit" -eq 0 ]; then
  # A pass with no record is not a pass anyone can act on: submit-pr has nothing to check the commit
  # against, and a reader has nothing to read.
  echo "the pipeline reported success but produced no verification record." >&2
  pipeline_exit=2
fi

exit_code="$pipeline_exit"
exit "$exit_code"
