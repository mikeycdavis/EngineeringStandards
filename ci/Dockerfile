# The CI environment, pinned by digest.
#
# The tag is `node:20-bookworm`; the digest is what actually resolves. This repository already
# refuses a mutable reference for the framework revision its reusable workflow executes — "a
# mandatory check pinned to a moving ref can change what it enforces without anyone deciding to" —
# and a base image tag is the same hazard wearing different clothes. `node:20-bookworm` is rebuilt
# regularly; two runs of the same commit a month apart would not be the same run.
#
# To move to a newer base: pull the tag, read `docker image inspect --format '{{index .RepoDigests 0}}'`,
# and change the digest here in its own commit so the change is reviewable as a change.
#
#   Node 20 matches `.github/workflows/ci.yml`, deliberately. package.json declares engines >=18 and
#   the developer's host runs 24; the version that must be reproduced is the one the gate uses. This
#   repository has already shipped a suite that ran on the author's Node and died on the runner's.
FROM node:20-bookworm@sha256:8f693eaa7e0a8e71560c9a82b55fd54c2ae920a2ba5d2cde28bac7d1c01c9ba5

# git is required, not incidental. The audit asks the repository which paths it ignores rather than
# reimplementing .gitignore semantics, and attestation freshness is computed from committed blob
# identity — both are `git` calls (scripts/repository.mjs). Without git the run would still produce a
# verdict, and it would be a different verdict than CI's. `node:20-bookworm` ships git 2.39; the
# slim variant does not ship it at all, which is why this is not the slim variant.
#
# There is no package installation step here and no `npm ci`. This repository has zero third-party
# dependencies (design/standards-audit-cli.md) and CI having no install step is what enforces that
# decision structurally. If a RUN apt-get or npm install ever appears below, the decision changed.

# /work is created owned by the user that will run in it, before WORKDIR touches it.
#
# This is not tidiness. `WORKDIR` creates a missing directory as root; `COPY --chown` then fixes the
# contents and not the directory itself. git compares the *repository directory's* owner against the
# current uid and refuses a mismatch with "detected dubious ownership", so every `git` call in the
# audit failed — and the repository seam it feeds has no filesystem fallback by design, so the
# must-never fixtures stopped being detectable and one test went red. The failure was loud, which is
# the only reason this was a five-minute problem; the alternative design, where a missing repository
# silently degrades to a filesystem guess, would have produced a green run covering less than it
# claimed. `git config --global --add safe.directory` would also silence the error, and is refused:
# it tells git to stop asking the question rather than making the answer correct.
RUN mkdir -p /work && chown node:node /work
WORKDIR /work

# The repository is COPIED, not bind-mounted, and that is the isolation boundary.
#
# A bind mount would put the developer's working tree inside a container that runs the repository's
# own test suite — and that suite writes files (test/invocation-ownership.test.mjs materialises a
# patched copy of the evaluator to run its negative control). Copying means the container cannot
# touch the host tree at all: there is nothing mounted to touch.
#
# **What is copied is not the working directory.** The context handed to Docker is built by
# `scripts/ci-context.*`: a temporary clone of this repository at the exact commit HEAD names, with
# `core.autocrlf=false` and `core.eol=lf` written into its own config so the files it materialises
# are determined by the commit rather than by the host platform's checkout conventions. Building
# from the working directory is what made the earlier claim on this line too strong — the image was
# repeatable from itself, but what went into it was one platform's rendering of the tree, and the
# CRLF/LF difference between a Windows checkout and `ubuntu-latest` was measurable as a different
# test result for identical committed content.
#
# `.git` is copied on purpose — see the git note above, and note that this is why the context is a
# clone rather than a `git archive` export. The audit resolves tracked and ignored paths through
# git, and attestation freshness reads committed blob identity; an export plus a synthesised
# repository would answer those questions from something that is not the repository, which is
# ADR 0008's source-of-truth defect. `.dockerignore` keeps out only the verification artifacts, so a
# previous run's report can never be mistaken for this run's.
COPY --chown=node:node . /work

# Non-root. CI executes whatever is in the branch under test, which is untrusted by construction:
# the whole point of running it is that nobody has verified it yet.
USER node

# Overridden by compose; stated here so `docker run` on the image alone does the same thing.
CMD ["node", "scripts/pipeline.mjs", "run"]
