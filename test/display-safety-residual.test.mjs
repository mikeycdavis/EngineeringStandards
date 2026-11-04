/**
 * ST-48: the display-safety limits ST-41 left (refs #157). One group of tests per acceptance criterion,
 * each driven against the surface it names and each paired with a mutation check recorded in the PR:
 *
 *   (a) renderVerdict: `policy.error` and `policy.reason` (and every other repository-controlled field the
 *       verdict prints) are escaped per field, so the verdict cannot carry a forged physical line.
 *   (b) The shell wrappers escape the repository path, branch, remote URL and git output they print.
 *   (c) The displaySafe classes ST-41 left open are escaped.
 *   (d) JSON output carries non-C0 bidi, format and C1 characters as escapes, and parses to the same value.
 *
 * Characters are built from code points: a literal control or bidi character in this file would be a
 * hostile-looking source file in its own right.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS = path.join(ROOT, "scripts");
const BS = String.fromCharCode(92);
const ch = (...codes) => String.fromCodePoint(...codes);
const LF = ch(10);
const ESC = ch(27);
const NEL = ch(0x85);
const RLO = ch(0x202e);
const FORGED = "FORGED: PASSED";

const mod = (name) => import(pathToFileURL(path.join(SCRIPTS, name)).href);

// A raw character this module must never leave in output: C0 other than LF/TAB/CR handled per site, DEL, C1,
// and every format, bidi, variation-selector and tag character. Written as ranges of code points.
const RAW_HOSTILE = new RegExp(
  "[" +
    [
      [0x00, 0x08], [0x0b, 0x0c], [0x0e, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x34f, 0x34f], [0x61c, 0x61c],
      [0x115f, 0x1160], [0x17b4, 0x17b5], [0x180e, 0x180e], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f],
      [0x3164, 0x3164], [0xfe00, 0xfe0f], [0xfeff, 0xfeff], [0xfff9, 0xfffc],
    ]
      .map(([a, b]) => String.fromCodePoint(a) + (b === a ? "" : "-" + String.fromCodePoint(b)))
      .join("") +
    "]|" +
    [ch(0xdb40, 0xdc00) + "|" + ch(0xdb40, 0xdd00)].join(""),
);
const rawHostile = (text) => RAW_HOSTILE.test(text) || /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(text);

// --- (a) renderVerdict ---------------------------------------------------------------------------

const emptyReport = () => ({
  status: "NOT_EVALUATED",
  score: null,
  denominator: { basis: "x", scored: 0 },
  summary: { passed: 0, failed: 0, warnings: 0, skipped: 0 },
  assurance: { automated: 0, manualReview: 0, notEvaluated: 0 },
  results: [],
});

/** What emitText writes: the verdict through the layout-preserving chokepoint. */
async function verdictText(policy, ...rest) {
  const { renderVerdict } = await mod("standards.mjs");
  const { displaySafeText } = await mod("display-safe.mjs");
  return displaySafeText(renderVerdict(emptyReport(), policy, ...rest));
}
const forgedLine = (text) => text.split(LF).some((line) => line.trimStart().startsWith("FORGED"));

test("ST-48 (a): policy.error cannot forge a physical line in the verdict", async () => {
  const text = await verdictText({ error: `cannot read policy${LF}${FORGED}`, document: null });
  assert.ok(text.includes("FORGED"), text);
  assert.ok(!forgedLine(text), `a forged line reached the verdict: ${JSON.stringify(text)}`);
  assert.ok(text.includes(`cannot read policy${BS}nFORGED`), text);
});

test("ST-48 (a): policy.reason cannot forge a physical line in the verdict", async () => {
  const text = await verdictText({ document: null, reason: `no policy${LF}${FORGED}` });
  assert.ok(!forgedLine(text), `a forged line reached the verdict: ${JSON.stringify(text)}`);
  assert.ok(text.includes(`no policy${BS}n${FORGED}.`), text);
});

test("ST-48 (a): the other repository-controlled fields the verdict prints are single-line too", async () => {
  const report = emptyReport();
  report.status = "COMPLIANT";
  report.results = [
    { ruleId: `r1${LF}${FORGED}`, status: "skipped", disposition: "not-applicable" },
    { ruleId: "r2", status: "failed", level: "required", message: "m", remediation: "x", disposition: "failed" },
  ];
  report.unestablishedProhibitions = [`u1${LF}${FORGED}`, `u2${LF}${FORGED}`];
  report.results.push({ ruleId: `u2${LF}${FORGED}`, freshness: `stale${LF}${FORGED}`, status: "skipped" });
  const hostile = `v${LF}${FORGED}`;
  const justifications = {
    trackedBasis: "tracked",
    applied: [{ rule: hostile, path: hostile, reason: hostile, approvedBy: hostile, approvedAt: hostile, expires: hostile, reference: hostile, removeWhen: hostile }],
    expired: [{ rule: hostile, path: hostile, expires: hostile, approvedBy: hostile }],
    stale: [{ rule: hostile, path: hostile, why: hostile }],
    unverified: [{ rule: hostile, path: hostile }],
  };
  const { renderVerdict } = await mod("standards.mjs");
  const { displaySafeText } = await mod("display-safe.mjs");
  const text = displaySafeText(
    renderVerdict(report, { document: {} }, [{ message: hostile, remediation: hostile }], [], false, justifications),
  );
  assert.ok(text.includes("FORGED"), text);
  assert.ok(!forgedLine(text), `a forged line reached the verdict: ${JSON.stringify(text)}`);
});

test("ST-48 (a): a policy parse error from a real unreadable policy reaches `standards validate` single-line", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "st48-policy-"));
  try {
    writeFileSync(path.join(dir, "project-policy.yml"), `standardVersion: "2.0.0"${LF}${ESC}[31m: [unclosed${LF}`);
    const run = spawnSync(process.execPath, [path.join(SCRIPTS, "standards.mjs"), "validate", dir], { encoding: "utf8", windowsHide: true });
    assert.ok(!rawHostile(run.stdout + run.stderr), "a raw control character reached validate output");
    assert.ok(!forgedLine(run.stdout), run.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- (c) the displaySafe classes ST-41 left -------------------------------------------------------

const CLASSES = {
  "variation selectors U+FE00-FE0F": [0xfe00, 0xfe08, 0xfe0f],
  "variation selectors supplement U+E0100-E01EF": [0xe0100, 0xe0150, 0xe01ef],
  "combining grapheme joiner U+034F": [0x034f],
  "Hangul choseong filler U+115F": [0x115f],
  "Hangul jungseong filler U+1160": [0x1160],
  "Hangul filler U+3164": [0x3164],
  "Khmer inherent vowels U+17B4 U+17B5": [0x17b4, 0x17b5],
  "deprecated format characters U+206A-206F": [0x206a, 0x206b, 0x206c, 0x206d, 0x206e, 0x206f],
  "unassigned U+2065": [0x2065],
  "object replacement U+FFFC": [0xfffc],
};

test("ST-48 (c): every class ST-41 left is escaped by displaySafe and displaySafeText", async () => {
  const { displaySafe, displaySafeText } = await mod("display-safe.mjs");
  for (const [name, points] of Object.entries(CLASSES)) {
    for (const point of points) {
      const hex = point.toString(16);
      const expected = point > 0xffff ? `a${BS}u{${hex}}b` : `a${BS}u${hex.padStart(4, "0")}b`;
      const raw = `a${String.fromCodePoint(point)}b`;
      assert.equal(displaySafe(raw), expected, `${name}: U+${hex}`);
      assert.equal(displaySafeText(raw), expected, `${name}: U+${hex} (text)`);
    }
  }
});

test("ST-48 (c): a lone surrogate is escaped and a well-formed pair is not", async () => {
  const { displaySafe, displaySafeText } = await mod("display-safe.mjs");
  for (const unit of [0xd800, 0xdbff, 0xdc00, 0xdfff]) {
    const hex = unit.toString(16);
    const raw = `a${String.fromCharCode(unit)}b`;
    assert.equal(displaySafe(raw), `a${BS}u${hex}b`, `lone U+${hex}`);
    assert.equal(displaySafeText(raw), `a${BS}u${hex}b`, `lone U+${hex} (text)`);
  }
  // A high surrogate followed by a low one is a supplementary character and stays readable.
  const emoji = String.fromCodePoint(0x1f600);
  assert.equal(displaySafe(`x${emoji}y`), `x${emoji}y`);
  // A reversed pair is two lone surrogates.
  assert.equal(displaySafe(ch(0xdc00, 0xd800).length === 2 ? String.fromCharCode(0xdc00, 0xd800) : ""), `${BS}udc00${BS}ud800`);
});

test("ST-48 (c): the neighbours of the new ranges stay readable", async () => {
  const { displaySafe } = await mod("display-safe.mjs");
  for (const point of [0x034e, 0x0350, 0x115e, 0x1161, 0x17b3, 0x17b6, 0x2070, 0x3163, 0x3165, 0xfdff, 0xfe10, 0xfffd, 0xe00ff, 0xe01f0, 0xfe, 0x1f600]) {
    const text = `a${String.fromCodePoint(point)}b`;
    assert.equal(displaySafe(text), text, `U+${point.toString(16)} must stay readable`);
  }
});

// --- (d) JSON output -----------------------------------------------------------------------------

const JSON_VALUE = {
  nel: `x${NEL}y`,
  del: `x${ch(0x7f)}y`,
  rlo: `x${RLO}y`,
  isolate: `x${ch(0x2066, 0x2069)}y`,
  fe0f: `x${ch(0xfe0f)}y`,
  cgj: `x${ch(0x34f)}y`,
  filler: `x${ch(0x3164, 0x115f)}y`,
  deprecated: `x${ch(0x206a, 0x206f, 0x2065)}y`,
  objectReplacement: `x${ch(0xfffc)}y`,
  tag: `x${ch(0xe0001, 0xe007f, 0xe0100, 0xe01ef)}y`,
  lone: `x${String.fromCharCode(0xd800)}y`,
  c0: `x${ESC}[31my${LF}z`,
  emoji: `ok ${ch(0x1f600)} ${ch(0xe9, 0x65e5)}`,
  [`key${RLO}`]: [`n${NEL}`, 1, null, true],
};

test("ST-48 (d): jsonText escapes every non-C0 bidi, format and C1 character and the parsed value is unchanged", async () => {
  const { jsonText } = await mod("display-safe.mjs");
  for (const space of [undefined, 2]) {
    const text = jsonText(JSON_VALUE, null, space);
    assert.ok(!rawHostile(text), `raw hostile character in the JSON text: ${JSON.stringify(text)}`);
    assert.deepEqual(JSON.parse(text), JSON.parse(JSON.stringify(JSON_VALUE)), "the parsed value changed");
  }
  const text = jsonText(JSON_VALUE);
  assert.ok(text.includes(`${BS}u0085`), "U+0085 must be escaped in JSON, the inherited gap in ST-41 criterion 2");
  assert.ok(text.includes(`${BS}u202e`));
  assert.ok(text.includes(`${BS}udb40${BS}udc01`), "a tag character above U+FFFF becomes a surrogate pair escape");
  assert.ok(text.includes(ch(0xe9)) && text.includes(ch(0x65e5)), "ordinary non-ASCII letters stay as they are");
  assert.equal(jsonText(undefined), undefined, "an unserialisable value still returns undefined, as JSON.stringify does");
  assert.equal(jsonText({ a: 1 }, null, 2), JSON.stringify({ a: 1 }, null, 2), "plain output is byte-identical");
});

function runNode(args, input) {
  const r = spawnSync(process.execPath, args, { encoding: "utf8", windowsHide: true, input, cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
}

test("ST-48 (d): JSON from submit-gate, policy and audit carries no raw hostile character", () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), "st48-json-"));
  try {
    // submit-gate: a branch name with C1, bidi and format characters comes back inside the verdict JSON.
    const hostile = `feature/${NEL}${RLO}${ch(0xfe0f)}${ch(0xe0001)}x`;
    const gate = runNode([path.join(SCRIPTS, "submit-gate.mjs"), "decide"], JSON.stringify({
      isRepository: true, branch: hostile, base: "develop", dirty: [], shaBefore: "a".repeat(40), shaAfter: "a".repeat(40), ciExitCode: 0, evidence: null,
    }));
    assert.ok(gate.out.length > 0, gate.err);
    assert.ok(!rawHostile(gate.out), `submit-gate JSON: ${JSON.stringify(gate.out)}`);
    assert.ok(JSON.parse(gate.out).message.length > 0);

    // policy: a schema diagnostic echoing an unknown property name.
    const policy = path.join(sandbox, "project-policy.yml");
    writeFileSync(policy, `standardVersion: "2.0.0"${LF}"bad${RLO}${NEL}key": 1${LF}`);
    const pol = runNode([path.join(SCRIPTS, "policy.mjs"), "--json", policy]);
    assert.ok(pol.out.includes("bad"), `policy produced no JSON: ${pol.out} ${pol.err}`);
    assert.ok(!rawHostile(pol.out), `policy JSON: ${JSON.stringify(pol.out)}`);

    // standards audit --json over a repository holding a file whose name has a bidi override and a C1 control
    // (NTFS and POSIX file systems both allow one), reported by path in the evidence surface.
    const repo = path.join(sandbox, "repo");
    mkdirSync(path.join(repo, "src"), { recursive: true });
    writeFileSync(path.join(repo, "src", `b${RLO}${NEL}.js`), "export const y = 2;" + LF);
    const audit = runNode([path.join(SCRIPTS, "standards.mjs"), "audit", repo, "--json"]);
    assert.ok(audit.out.includes(`${BS}u202e${BS}u0085`), `audit JSON does not carry the escaped file name: ${audit.out.slice(0, 400)} ${audit.err}`);
    assert.ok(!rawHostile(audit.out), `audit JSON: a raw hostile character reached the output`);
    assert.ok(JSON.parse(audit.out).schemaVersion, "audit JSON parses");
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("ST-48 (d): every JSON.stringify that feeds output in scripts/ goes through jsonText", () => {
  // Counts of JSON.stringify( per file that are NOT output: a digest input, a quoted diagnostic, or a message
  // fragment that is escaped by displaySafe on the way out. Anything else is output and must use jsonText.
  const ALLOWED = {
    "boundaries.mjs": 1, // a comparison key
    "compliance.mjs": 1, // quotedSafe: the quoted value is escaped by displaySafe
    "init.mjs": 1, // an error message that is escaped by its caller
    "jsonschema.mjs": 1, // a diagnostic fragment
    "justifications.mjs": 4, // diagnostic fragments
    "reviews.mjs": 3, // canonical JSON: a digest input, whose bytes must not change
    "submit-gate.mjs": 2, // inside displaySafe(...)
  };
  const found = {};
  for (const name of readdirSync(SCRIPTS).filter((n) => n.endsWith(".mjs") && n !== "display-safe.mjs")) {
    const text = readFileSync(path.join(SCRIPTS, name), "utf8");
    const count = (text.replace(/\/\/.*$/gm, "").match(/JSON\.stringify\(/g) ?? []).length;
    if (count > 0) found[name] = count;
  }
  assert.deepEqual(found, ALLOWED);
});

// --- (b) the shell wrappers -----------------------------------------------------------------------

const bashOk = (() => {
  const r = spawnSync("bash", ["-c", "exit 0"], { encoding: "utf8" });
  return !r.error && r.status === 0;
})();
const psExe = ["pwsh", "powershell"].find((exe) => {
  const r = spawnSync(exe, ["-NoProfile", "-Command", "exit 0"], { encoding: "utf8" });
  return !r.error && r.status === 0;
});

/** Every class ST-48 names plus the ST-41 ones, as UTF-8 text lines. */
function wrapperCases() {
  const points = [0x1b, 0x7f, 0x85, 0x9f, 0xad, 0x61c, 0x180e, 0x200b, 0x200f, 0x2028, 0x202e, 0x2060, 0x2066, 0x2069, 0xfeff, 0xfff9, 0xfffb, 0xe0001, 0xe007f];
  for (const list of Object.values(CLASSES)) points.push(...list);
  const cases = points.map((p) => `a${String.fromCodePoint(p)}b`);
  cases.push("plain /path with spaces", `${String.fromCodePoint(0xe9)} ${String.fromCodePoint(0x65e5)} ${String.fromCodePoint(0x1f600)}`, `tab${ch(9)}x`, `cr${ch(13)}x`);
  return cases;
}

test("ST-48 (b): display-safe.sh escapes the same classes as display-safe.mjs", async (t) => {
  if (!bashOk) return t.skip("bash is unavailable");
  const { displaySafe } = await mod("display-safe.mjs");
  const cases = wrapperCases();
  const r = spawnSync("bash", ["-c", `. "${SCRIPTS.split(BS).join("/")}/display-safe.sh"; display_safe_lines`], {
    input: cases.join(LF) + LF,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.stdout.split(LF).slice(0, -1), cases.map((c) => displaySafe(c)));
});

test("ST-48 (b): display-safe.sh shows a byte that is not well-formed UTF-8 as an escape", (t) => {
  if (!bashOk) return t.skip("bash is unavailable");
  const bytes = Buffer.from([0x61, 0xff, 0xed, 0xa0, 0x80, 0xc3, 0x28, 0xf4, 0x90, 0x80, 0x80, 0xc0, 0xaf, 0x62, 0x0a]);
  const r = spawnSync("bash", ["-c", `. "${SCRIPTS.split(BS).join("/")}/display-safe.sh"; display_safe_lines`], { input: bytes, windowsHide: true });
  const text = r.stdout.toString("latin1");
  assert.ok(!/[\x80-\xff]/.test(text), `a raw high byte reached the output: ${JSON.stringify(text)}`);
  assert.ok(text.includes(`${BS}xff`) && text.includes(`${BS}ud800`) && text.includes(`${BS}xc3`), text);
});

/** A directory holding copies of the wrappers, run from a hostile-named root with a stand-in `docker`. */
function wrapperSandbox(name) {
  const sandbox = mkdtempSync(path.join(tmpdir(), "st48-wrap-"));
  const root = path.join(sandbox, name);
  mkdirSync(path.join(root, "scripts"), { recursive: true });
  for (const f of readdirSync(SCRIPTS)) {
    if (/^(ci|ci-context|display-safe|submit-pr|submit-decide)\.(sh|ps1)$/.test(f)) {
      writeFileSync(path.join(root, "scripts", f), readFileSync(path.join(SCRIPTS, f)));
    }
  }
  writeFileSync(path.join(root, "compose.ci.yml"), "services: {}\n");
  const bin = path.join(sandbox, "bin");
  mkdirSync(bin);
  // `docker info` succeeds; everything else (build, run) fails, so the wrapper stops after printing its header.
  writeFileSync(path.join(bin, "docker"), `#!/bin/sh\nif [ "$1" = "info" ]; then echo 24; exit 0; fi\nexit 1\n`);
  chmodSync(path.join(bin, "docker"), 0o755);
  writeFileSync(path.join(bin, "docker.cmd"), `@echo off\r\nif "%1"=="info" (echo 24& exit /b 0)\r\nexit /b 1\r\n`);
  return { sandbox, root, bin, env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` } };
}

test("ST-48 (b): ci.sh escapes the repository path, an unknown option and the project name it prints", (t) => {
  if (!bashOk) return t.skip("bash is unavailable");
  const hostileRoot = `repo${RLO}${NEL}${ch(0xfe0f)}`;
  const { sandbox, root, env } = wrapperSandbox(hostileRoot);
  try {
    const script = path.join(root, "scripts", "ci.sh");
    // The unknown option is refused before anything else, with the hostile value echoed.
    const opt = spawnSync("bash", [script, `--bad${ESC}[31m${LF}${FORGED}`], { encoding: "utf8", env, windowsHide: true });
    assert.equal(opt.status, 2, opt.stderr);
    assert.ok(opt.stderr.includes("FORGED") && !rawHostile(opt.stderr) && !forgedLine(opt.stderr), JSON.stringify(opt.stderr));
    // A run from a hostile-named root prints it in the header. The stand-in docker makes the run stop early.
    const run = spawnSync("bash", [script, "--project", "p"], { encoding: "utf8", env, windowsHide: true });
    const out = run.stdout + run.stderr;
    assert.ok(out.includes("repository :"), out);
    assert.ok(!rawHostile(out), `a raw hostile character reached ci.sh output: ${JSON.stringify(out)}`);
    assert.ok(out.includes(`${BS}u202e`), `the escaped root is not shown: ${out}`);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("ST-48 (b): ci-context.sh escapes the project name and git output (status lines) it prints", (t) => {
  if (!bashOk) return t.skip("bash is unavailable");
  const sandbox = mkdtempSync(path.join(tmpdir(), "st48-ctx-"));
  try {
    const repo = path.join(sandbox, "repo");
    mkdirSync(repo);
    const git = (...args) => spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
    git("init", "--quiet");
    git("config", "user.email", "fixture@example.invalid");
    git("config", "user.name", "fixture");
    writeFileSync(path.join(repo, "k.txt"), "k\n");
    git("add", "k.txt");
    git("commit", "--quiet", "-m", "base");
    const script = path.join(SCRIPTS, "ci-context.sh");
    const env = { ...process.env, TMPDIR: path.join(sandbox, "temp"), GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.quotepath", GIT_CONFIG_VALUE_0: "false" };
    mkdirSync(env.TMPDIR);

    // The project name is refused, and echoed, before the repository is read.
    const name = spawnSync("bash", [script, repo, `p${ESC}[31m${LF}${FORGED}${RLO}`], { encoding: "utf8", env, windowsHide: true });
    assert.equal(name.status, 2, name.stderr);
    assert.ok(name.stderr.includes("FORGED") && !rawHostile(name.stderr) && !forgedLine(name.stderr), JSON.stringify(name.stderr));

    // An untracked file whose name holds bidi and format characters is listed by git as-is under quotepath=false.
    const dirty = `new${RLO}${NEL}${ch(0xfe0f)}.txt`;
    writeFileSync(path.join(repo, dirty), "x\n");
    const status = spawnSync("bash", [script, repo, "okproject"], { encoding: "utf8", env, windowsHide: true });
    assert.equal(status.status, 2, status.stderr);
    assert.ok(status.stderr.includes("uncommitted changes") && status.stderr.includes("new"), status.stderr);
    assert.ok(!rawHostile(status.stderr), `a raw hostile character reached ci-context.sh output: ${JSON.stringify(status.stderr)}`);
    assert.ok(status.stderr.includes(`${BS}u202e`), status.stderr);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

function psRun(args, options = {}) {
  return spawnSync(psExe, ["-NoProfile", "-NonInteractive", ...args], { encoding: "utf8", windowsHide: true, ...options });
}

test("ST-48 (b): display-safe.ps1 escapes the same classes as display-safe.mjs", async (t) => {
  if (!psExe) return t.skip("no PowerShell on this host");
  const { displaySafe } = await mod("display-safe.mjs");
  const sandbox = mkdtempSync(path.join(tmpdir(), "st48-ps-"));
  try {
    const cases = wrapperCases();
    const input = path.join(sandbox, "cases.txt");
    writeFileSync(input, cases.join(LF), "utf8");
    const helper = path.join(SCRIPTS, "display-safe.ps1");
    const cmd =
      `. '${helper}'; ` +
      `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ` +
      `$lines = [System.IO.File]::ReadAllText('${input}', [System.Text.Encoding]::UTF8) -split "\`n"; ` +
      `foreach ($l in $lines) { [Console]::Out.Write((ConvertTo-DisplaySafe $l) + "\`n") }`;
    const r = psRun(["-Command", cmd]);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.stdout.split(LF).slice(0, -1), cases.map((c) => displaySafe(c)));
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("ST-48 (b): ci.ps1 escapes the repository path it prints", (t) => {
  if (!psExe) return t.skip("no PowerShell on this host");
  const { sandbox, root, env } = wrapperSandbox(`repo${RLO}${NEL}${ch(0xfe0f)}`);
  try {
    const r = psRun(["-File", path.join(root, "scripts", "ci.ps1"), "-Project", "p"], { env });
    const out = r.stdout + r.stderr;
    assert.ok(out.includes("repository :"), out);
    assert.ok(!rawHostile(out), `a raw hostile character reached ci.ps1 output: ${JSON.stringify(out)}`);
    assert.ok(out.includes(`${BS}u202e`), out);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("ST-48 (b): submit-pr.ps1 escapes the branch, remote URL and a refusal message it prints", (t) => {
  if (!psExe) return t.skip("no PowerShell on this host");
  const hostileBranch = `feature/${RLO}${NEL}x`;
  const { sandbox, root, bin, env } = wrapperSandbox("repo");
  try {
    const git = (...args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    git("init", "--quiet");
    git("config", "user.email", "fixture@example.invalid");
    git("config", "user.name", "fixture");
    git("config", "core.autocrlf", "false");
    writeFileSync(path.join(root, ".gitignore"), "bin\n");
    git("add", "-A");
    git("commit", "--quiet", "-m", "base");
    git("checkout", "--quiet", "-b", hostileBranch);
    git("remote", "add", "origin", `https://example.invalid/${RLO}${NEL}${ch(0xfe0f)}/repo.git`);
    // A gate stand-in: `docker run` answers with a refusal whose message is hostile; every other docker call succeeds.
    writeFileSync(
      path.join(bin, "docker.cmd"),
      `@echo off\r\nif "%1"=="info" (echo 24& exit /b 0)\r\nif "%1"=="run" (more >nul & echo {"allowed":false,"reason":"no-evidence","message":"refused ${ESC}[31m ${FORGED}"}& exit /b 0)\r\nexit /b 0\r\n`,
    );
    writeFileSync(
      path.join(bin, "docker"),
      `#!/bin/sh\nif [ "$1" = "info" ]; then echo 24; exit 0; fi\nif [ "$1" = "run" ]; then cat >/dev/null; echo '{"allowed":false,"reason":"no-evidence","message":"refused \\u001b[31m ${FORGED}"}'; exit 0; fi\nexit 0\n`,
    );
    chmodSync(path.join(bin, "docker"), 0o755);
    const r = psRun(["-File", path.join(root, "scripts", "submit-pr.ps1")], { env, cwd: root });
    const out = r.stdout + r.stderr;
    assert.ok(out.includes("branch     :"), out);
    assert.ok(out.includes("repository :"), out);
    assert.ok(!rawHostile(out), `a raw hostile character reached submit-pr.ps1 output: ${JSON.stringify(out)}`);
    assert.ok(out.includes(`${BS}u202e`), out);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("ST-48 (b): submit-decide.ps1 escapes the gate's output in a refusal it throws and in a verdict message it returns", (t) => {
  if (!psExe) return t.skip("no PowerShell on this host");
  const { sandbox, root, bin, env } = wrapperSandbox("repo");
  try {
    const git = (...args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    git("init", "--quiet");
    git("config", "user.email", "fixture@example.invalid");
    git("config", "user.name", "fixture");
    git("config", "core.autocrlf", "false");
    writeFileSync(path.join(root, ".gitignore"), "bin\n");
    git("add", "-A");
    git("commit", "--quiet", "-m", "base");
    const gate = (body, code) => {
      writeFileSync(path.join(bin, "docker.cmd"), `@echo off\r\nif "%1"=="run" (more >nul & echo ${body}& exit /b ${code})\r\nexit /b 0\r\n`);
      writeFileSync(path.join(bin, "docker"), `#!/bin/sh\nif [ "$1" = "run" ]; then cat >/dev/null; echo '${body}'; exit ${code}; fi\nexit 0\n`);
      chmodSync(path.join(bin, "docker"), 0o755);
    };
    const decide = path.join(root, "scripts", "submit-decide.ps1");
    const call = `$ErrorActionPreference='Stop'; try { $v = & '${decide}' -Facts @{a=1} -RepoRoot '${root}'; [Console]::Out.Write($v.message) } catch { [Console]::Out.Write($_.Exception.Message) }`;

    gate(`gate failed ${RLO}${NEL}${ch(0xfe0f)} ${FORGED}`, 2); // a malformed question: thrown, with the gate's output inside
    const thrown = psRun(["-Command", call], { env, cwd: root });
    assert.ok(thrown.stdout.includes("could not evaluate"), thrown.stdout + thrown.stderr);
    assert.ok(!rawHostile(thrown.stdout), `thrown message: ${JSON.stringify(thrown.stdout)}`);
    assert.ok(thrown.stdout.includes(`${BS}u202e`), thrown.stdout);

    gate(`{"allowed":false,"reason":"x","message":"refused ${RLO} ${FORGED}"}`, 0);
    const verdict = psRun(["-Command", call], { env, cwd: root });
    assert.ok(verdict.stdout.includes("refused"), verdict.stdout + verdict.stderr);
    assert.ok(!rawHostile(verdict.stdout), `verdict message: ${JSON.stringify(verdict.stdout)}`);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
