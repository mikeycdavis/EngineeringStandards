/**
 * What a red check means, and the three answers that are not the same answer.
 *
 * `scripts/ci-triage.mjs` exists because this repository deliberately keeps two jobs permanently red,
 * and a reader that treats every `conclusion: failure` alike would either alarm on correct governance
 * evidence or, worse, learn to ignore it. The distinction it draws:
 *
 *   EXPECTED       the evidence establishes the expected state          exit 0
 *   ACTIONABLE     the evidence establishes an unexpected state         exit 1
 *   INDETERMINATE  the evidence cannot establish the state              exit 2
 *
 * Two kinds of test live here, and the split is the point.
 *
 * **The classifier is tested from structured observations.** `classify` is pure, so every terminal
 * branch is reachable from a small fixture describing what was observed — `stepsExecuted`,
 * `conclusion`, `reportedRules`, `validatorExit` — rather than from a fabricated runner log. A
 * ten-thousand-line log fixture would bake in timestamps and runner formatting, and would be exactly
 * the place a use/mention defect could hide unread.
 *
 * **Log parsing is tested separately, against tiny raw specimens.** That is where the runner's actual
 * shape matters, and where the defect this tool already committed once has to stay dead: a workflow
 * log contains the script it is about to run as well as that script's output, and this repository's
 * workflow contains the literal text `echo "::error::NO VERDICT (exit 2)"` in a branch that normally
 * never executes.
 *
 * The tool is a reader, not a gate. Nothing here asserts that it blocks anything.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  classify,
  parseValidatorLog,
  logLines,
  establishedRejectionsFrom,
  jobIdFrom,
  parseTarget,
  EXPECTED,
  ACTIONABLE,
  INDETERMINATE,
  EXIT,
} from "../scripts/ci-triage.mjs";
import { parseYaml } from "../scripts/yaml.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = path.join(ROOT, "test", "fixtures", "ci-triage");

const fixture = (name) => JSON.parse(readFileSync(path.join(FIXTURES, name), "utf8"));

// -------------------------------------------------------------------------------------------
// Every terminal branch, from a structured observation
// -------------------------------------------------------------------------------------------

test("every fixture classifies as the state it describes", () => {
  const files = readdirSync(FIXTURES).filter((f) => f.endsWith(".json")).sort();
  assert.ok(files.length >= 14, `only ${files.length} fixtures — the branch coverage was reduced`);

  for (const file of files) {
    const f = fixture(file);
    const { verdict } = classify(f);
    assert.equal(verdict, f.expect, `${file}: ${f.note}`);
  }
});

test("an established red beside a green required job is expected, and exits 0", () => {
  const result = classify(fixture("established-red.json"));
  assert.equal(result.verdict, EXPECTED);
  assert.equal(EXIT[result.verdict], 0);
  // Both arms are named as expected, individually — not merely absent from the complaints.
  const armFindings = result.findings.filter((r) => r.check.startsWith("validate"));
  assert.equal(armFindings.length, 2, "one of the two placements was not classified");
  assert.ok(armFindings.every((r) => r.class === EXPECTED), "an arm was not reported as expected");
});

test("a job that executed no step is infrastructure, never a failing code path", () => {
  const result = classify(fixture("zero-execution.json"));
  assert.equal(result.verdict, INDETERMINATE);
  assert.equal(EXIT[result.verdict], 2);
  const finding = result.findings.find((r) => r.check === "test");
  assert.equal(finding.class, INDETERMINATE, "a zero-step job was reported as a failure");
  assert.match(finding.why, /without executing any step/);
  assert.doesNotMatch(finding.why, /\bfailed\b/, "the wording still blames the code");
});

test("a real exit 2 is actionable and says the verdict was never produced", () => {
  const result = classify(fixture("real-exit-2.json"));
  assert.equal(result.verdict, ACTIONABLE);
  const finding = result.findings.find((r) => r.check === "validate");
  assert.equal(finding.class, ACTIONABLE);
  assert.match(finding.why, /exit 2/);
  assert.match(finding.why, /no verdict/i);
});

test("the two placements disagreeing is actionable, and the finding names both", () => {
  const result = classify(fixture("arms-disagree.json"));
  assert.equal(result.verdict, ACTIONABLE);
  const finding = result.findings.find((r) => r.check === "inside vs outside");
  assert.equal(finding.class, ACTIONABLE);
  assert.match(finding.why, /disagree/);
  assert.match(finding.why, /validate/);
  assert.match(finding.why, /validate-self/);
});

test("a rejection set that grew and one that shrank are both actionable, and distinguishable", () => {
  const grew = classify(fixture("rejection-set-grew.json"));
  assert.equal(grew.verdict, ACTIONABLE);
  const grewWhy = grew.findings.find((r) => r.check === "validate").why;
  assert.match(grewWhy, /newly failing: data\.no-silent-discard/);
  assert.doesNotMatch(grewWhy, /no longer reported/, "an addition was described as a removal");

  const shrank = classify(fixture("rejection-set-shrank.json"));
  assert.equal(shrank.verdict, ACTIONABLE);
  const shrankWhy = shrank.findings.find((r) => r.check === "validate").why;
  assert.match(shrankWhy, /no longer reported: errors\.no-false-success/);
  assert.doesNotMatch(shrankWhy, /newly failing/, "a removal was described as an addition");
});

test("the required job failing is actionable even while both advisory arms are correctly red", () => {
  const result = classify(fixture("required-test-fails.json"));
  assert.equal(result.verdict, ACTIONABLE);
  assert.equal(result.findings.find((r) => r.check === "test").class, ACTIONABLE);
  // The advisory arms are still reported as expected — the gating failure does not recolour them.
  for (const name of ["validate", "validate-self / validate"]) {
    assert.equal(result.findings.find((r) => r.check === name).class, EXPECTED, `${name} was recoloured`);
  }
});

test("unavailable evidence is never expected, and never reported as the repository being wrong", () => {
  // The load-bearing default. Each of these could collapse to EXPECTED through an `?? []` or a
  // truthiness check, and each would then hide the thing it was built to surface.
  for (const file of ["unreadable-policy.json", "unreadable-logs.json", "unreadable-execution.json", "missing-arm.json"]) {
    const result = classify(fixture(file));
    assert.equal(result.verdict, INDETERMINATE, `${file}: ${fixture(file).note}`);
    assert.notEqual(result.verdict, EXPECTED);
    assert.ok(
      result.findings.some((r) => r.class === INDETERMINATE),
      `${file} produced no indeterminate finding to explain itself`,
    );
  }
});

test("actionable outranks indeterminate", () => {
  // A run that proved something wrong and failed to establish something else needs a human for the
  // first reason. Reporting it as merely indeterminate would understate a known failure.
  const result = classify(fixture("actionable-outranks-indeterminate.json"));
  assert.equal(result.verdict, ACTIONABLE);
  assert.ok(result.findings.some((r) => r.class === INDETERMINATE), "the indeterminate finding was dropped rather than outranked");
});

test("an arm whose verdict printed without an exit annotation is still established", () => {
  // Only one of the two workflows emits `::error::`, so a missing exit class is the normal shape for
  // the other arm. Treating it as a failure to observe would make every run of that workflow
  // indeterminate and retire the tool on its second day.
  const result = classify(fixture("verdict-without-annotation.json"));
  assert.equal(result.verdict, EXPECTED);
  const finding = result.findings.find((r) => r.check === "validate");
  assert.equal(finding.class, EXPECTED, "a printed verdict with no annotation was discarded");
  assert.match(finding.why, /NON_COMPLIANT/);
});

test("an arm whose log yielded neither verdict nor exit class is unestablished, not cleared", () => {
  // The dangerous shape. With no reported rules parsed, a set comparison would read the empty result
  // as every established rejection having been cleared and call the repository changed — a claim about
  // the project derived from a defect in reading it. The exit class and the printed verdict are two
  // independent ways to establish the outcome; the absence of both is the absence of evidence.
  const result = classify(fixture("unreadable-verdict.json"));
  assert.equal(result.verdict, INDETERMINATE);
  const finding = result.findings.find((r) => r.check === "validate");
  assert.equal(finding.class, INDETERMINATE);
  assert.match(finding.why, /unestablished|neither/);
  assert.doesNotMatch(finding.why, /no longer reported/, "unread evidence was reported as a cleared rejection");
  for (const f of result.findings) assert.notEqual(f.class, ACTIONABLE, "unread evidence was reported as the repository being wrong");
});

test("an empty observation establishes nothing rather than passing", () => {
  assert.equal(classify({}).verdict, INDETERMINATE);
  assert.equal(classify({ jobs: [], establishedRejections: [] }).verdict, INDETERMINATE);
});

// -------------------------------------------------------------------------------------------
// Log parsing, against tiny raw specimens
// -------------------------------------------------------------------------------------------

const TS = "2026-08-16T17:42:13.9456194Z ";

test("the echoed script is not mistaken for the output of the script", () => {
  // The defect this tool committed on its first run. The workflow's own source contains the no-verdict
  // branch; the runner renders the command it is about to run inside a colour escape, and that is the
  // only thing distinguishing the branch's text from its execution.
  const log = [
    `${TS}[36;1m  2) echo "::error::NO VERDICT (exit 2) — the policy could not be read." ; exit 2 ;;[0m`,
    `${TS}  Status: NON_COMPLIANT`,
    `${TS}    errors.no-false-success [forbidden] reviewed by project-owner and found unmet.`,
    `${TS}##[error]NON-COMPLIANT (exit 1) — a required or forbidden rule failed.`,
  ].join("\n");

  const parsed = parseValidatorLog(log);
  assert.equal(parsed.validatorExit, 1, "the mentioned exit-2 branch was read as though it had run");
  assert.equal(parsed.status, "NON_COMPLIANT");
  assert.deepEqual(parsed.reportedRules, ["errors.no-false-success"]);
});

test("an emitted no-verdict annotation is read as exit 2", () => {
  const log = [
    `${TS}[36;1m  1) echo "::error::NON-COMPLIANT (exit 1)" ;;[0m`,
    `${TS}##[error]NO VERDICT (exit 2) — the declared standards version is not the one executing.`,
  ].join("\n");

  const parsed = parseValidatorLog(log);
  assert.equal(parsed.validatorExit, 2);
  assert.equal(parsed.status, null, "a status was invented where none was printed");
});

test("the leading runner timestamp does not defeat the line anchors", () => {
  // The second defect: every anchored pattern matched nothing, and the tool reported that four
  // expected rejections had vanished.
  const withStamp = parseValidatorLog(`${TS}  Status: NON_COMPLIANT`);
  assert.equal(withStamp.status, "NON_COMPLIANT");
  assert.deepEqual(logLines(`${TS}hello`), ["hello"]);
});

test("a log with neither annotation reports no exit class rather than guessing one", () => {
  const parsed = parseValidatorLog(`${TS}  Status: COMPLIANT`);
  assert.equal(parsed.validatorExit, null);
  assert.equal(parsed.status, "COMPLIANT");
  assert.deepEqual(parsed.reportedRules, []);
});

// -------------------------------------------------------------------------------------------
// Policy derivation — the authority for what "expected" means
// -------------------------------------------------------------------------------------------

test("the rejection set is derived from live reviews, and a superseded rejection does not count", () => {
  const policy = {
    attestations: {
      "a.rule": { reviews: [{ id: "r1", status: "rejected" }] },
      "b.rule": { reviews: [{ id: "r1", status: "rejected" }, { id: "r2", supersedes: "r1", status: "approved" }] },
      "c.rule": { reviews: [{ id: "r1", status: "approved" }, { id: "r2", supersedes: "r1", status: "rejected" }] },
    },
  };
  assert.deepEqual(establishedRejectionsFrom(policy), ["a.rule", "c.rule"]);
});

test("an unreadable policy establishes nothing rather than an empty rejection set", () => {
  // The difference between "no rejections are expected" and "we could not tell" is the whole point.
  assert.equal(establishedRejectionsFrom(null), null);
  assert.equal(establishedRejectionsFrom({}), null);
  assert.equal(establishedRejectionsFrom({ attestations: [] }), null);
  assert.deepEqual(establishedRejectionsFrom({ attestations: {} }), []);
});

test("this repository's own policy still yields a non-empty rejection set", () => {
  // If this ever returns empty, either the four rejections were cleared — an owner decision, not a
  // silent one — or the derivation broke. Both need a human, and neither should be discovered by a
  // classifier quietly reporting EXPECTED.
  const policy = parseYaml(readFileSync(path.join(ROOT, "project-policy.yml"), "utf8"));
  const rejected = establishedRejectionsFrom(policy);
  assert.ok(Array.isArray(rejected) && rejected.length > 0, "the repository's own rejections could not be derived");
});

test("no list of rejection ids is hardcoded in the tool", () => {
  // The derivation is the design. A copied list would still call a cleared rejection "expected".
  const source = readFileSync(path.join(ROOT, "scripts", "ci-triage.mjs"), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const rule of ["ai.no-fabricated-capabilities", "ai.no-safety-bypass", "errors.no-false-success", "scm.no-shared-history-rewrite"]) {
    assert.doesNotMatch(code, new RegExp(rule.replace(/\./g, "\\.")), `${rule} is hardcoded in the classifier`);
  }
});

test("the tool reads and classifies, and does not act", () => {
  // Scope, asserted rather than intended. It must not gain the ability to change the policy, re-run
  // checks, or suppress the jobs it interprets.
  const source = readFileSync(path.join(ROOT, "scripts", "ci-triage.mjs"), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /writeFileSync|rmSync|unlinkSync|appendFileSync/, "the classifier writes to disk");
  assert.doesNotMatch(code, /"(rerun|cancel)"|pr\s+(merge|close|edit)/, "the classifier acts on the pull request");
  assert.doesNotMatch(code, /\bgh\(\[\s*"api"[^\]]*-X\s*(POST|PATCH|PUT|DELETE)/, "the classifier issues a mutating API call");
});

test("the exit codes match the epistemic split", () => {
  assert.equal(EXIT[EXPECTED], 0);
  assert.equal(EXIT[ACTIONABLE], 1);
  assert.equal(EXIT[INDETERMINATE], 2);
});

// -------------------------------------------------------------------------------------------
// Addressing — which commit the verdict is about
// -------------------------------------------------------------------------------------------

test("each addressing mode names one subject", () => {
  assert.deepEqual(parseTarget(["26"]), { mode: "pr", value: "26" });
  assert.deepEqual(parseTarget(["--sha", "69de0c8"]), { mode: "sha", value: "69de0c8" });
  assert.deepEqual(parseTarget(["--branch", "develop"]), { mode: "branch", value: "develop" });
  assert.deepEqual(parseTarget(["--json", "--branch", "develop"]), { mode: "branch", value: "develop" });
});

test("two targets is an error, not a precedence rule", () => {
  // The whole reason this mode exists is that a verdict can be true about the wrong commit. Silently
  // preferring one of two subjects would reintroduce that at the argument list.
  assert.match(parseTarget(["26", "--sha", "69de0c8"]).error, /more than one target/);
  assert.match(parseTarget(["--branch", "develop", "--branch", "master"]).error, /more than one target/);
  assert.match(parseTarget([]).error, /no target/);
  assert.match(parseTarget(["--sha"]).error, /needs a value/);
  assert.match(parseTarget(["--sha", "--json"]).error, /needs a value/);
  assert.match(parseTarget(["--wat"]).error, /unrecognised/);
});

test("a run that cannot name its subject's gating branch says so, rather than reporting unreadable", () => {
  // A commit can sit on any number of branches with different protection. "Not asked" and "asked and
  // could not read" are different states, and collapsing them would let a guess read as a measurement.
  const unasked = classify({
    requiredChecksNote: "no branch was named, so which checks gate this commit was not asked",
    establishedRejections: [],
    jobs: [{ name: "build", conclusion: "failure", stepsExecuted: 4, required: null, logRead: false }],
  });
  const finding = unasked.findings.find((r) => r.check === "build");
  assert.equal(finding.class, ACTIONABLE, "a real failure was downgraded because required-ness was unknown");
  assert.match(finding.why, /was not asked/);
  assert.doesNotMatch(finding.why, /could not be read/, "an unasked question was reported as an unreadable answer");

  // With no note supplied the wording stays the original one, so a fixture that predates this field
  // still describes itself correctly.
  const noNote = classify({
    establishedRejections: [],
    jobs: [{ name: "build", conclusion: "failure", stepsExecuted: 4, required: null, logRead: false }],
  });
  assert.match(noNote.findings.find((r) => r.check === "build").why, /could not be read from branch protection/);
});

test("a job id is read from a details URL, and absence is not an id", () => {
  assert.equal(jobIdFrom("https://github.com/o/r/actions/runs/123/job/456"), "456");
  assert.equal(jobIdFrom("https://github.com/o/r/actions/runs/123"), null);
  assert.equal(jobIdFrom(undefined), null);
});
