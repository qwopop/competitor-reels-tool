// Opens Grafana Explore in a real browser (Playwright) and checks that the signals of the
// app show up in it, filtered by environment and version, as the manual check asks:
//   - Tempo: a TraceQL search finds a trace, and opening that trace shows its spans
//   - Loki: the app's log lines
//   - Prometheus: every application metric
//
//   NODE_PATH=e2e/node_modules node observability/explore.cjs --env dev --version <sha> --out explore-results
//
// It listens to the /api/ds/query calls that Explore itself makes, asserts on their results,
// and saves a screenshot of every Explore page. Run after observability/smoke.py has driven the app.
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const GRAFANA = arg("grafana", "http://localhost:3000");
const ENV = arg("env", "dev");
const VERSION = arg("version", "");
const OUT = arg("out", "explore-results");
if (!VERSION) {
  console.error("--version is required");
  process.exit(2);
}
fs.mkdirSync(OUT, { recursive: true });

const problems = [];
const report = [];
const fail = (m) => {
  problems.push(m);
  console.log(`FAIL: ${m}`);
};

const filter = `deployment_environment="${ENV}", service_version="${VERSION}"`;
const metrics = [
  ["competitors added", `sum(clipremix_competitors_added_total{${filter}})`],
  ["videos fetched by outcome", `sum by (outcome) (clipremix_videos_fetched_total{${filter}})`],
  ["remixes created", `sum(clipremix_remixes_created_total{${filter}})`],
  ["plan items added", `sum(clipremix_plan_items_added_total{${filter}})`],
  ["fetch latency (sum)", `sum(clipremix_fetch_duration_seconds_sum{${filter}})`],
  ["fetch latency (count)", `sum(clipremix_fetch_duration_seconds_count{${filter}})`],
  ["total competitors", `sum(clipremix_competitors{${filter}})`],
];

function explorePane(datasourceUid, datasourceType, query) {
  const panes = {
    a: {
      datasource: datasourceUid,
      queries: [{ refId: "A", datasource: { type: datasourceType, uid: datasourceUid }, ...query }],
      range: { from: "now-1h", to: "now" },
    },
  };
  return `${GRAFANA}/explore?schemaVersion=1&orgId=1&panes=${encodeURIComponent(JSON.stringify(panes))}`;
}

// Open an Explore URL, wait for its query to finish, return { frames, status, text }.
async function runExplore(page, name, url, expectQuery) {
  const responses = [];
  const onResponse = async (res) => {
    if (res.url().includes("/api/ds/query") && res.request().method() === "POST") {
      try {
        responses.push(await res.json());
      } catch (_) {
        /* not JSON */
      }
    }
  };
  page.on("response", onResponse);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const deadline = Date.now() + 60000;
  let frames = [];
  let status = 0;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1000);
    for (const body of responses) {
      for (const r of Object.values(body.results || {})) {
        status = r.status || status;
        const f = r.frames || [];
        if (expectQuery(f)) frames = f;
      }
    }
    if (frames.length) break;
  }
  page.off("response", onResponse);
  await page.waitForTimeout(1500); // let the result render before the screenshot
  const file = `${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
  await page.screenshot({ path: path.join(OUT, file), fullPage: true });
  fs.writeFileSync(path.join(OUT, file.replace(".png", ".json")), JSON.stringify({ url, status, frames, responses }, null, 2));
  return { frames, status, file };
}

const values = (frame) => (frame.data && frame.data.values) || [];
const hasRows = (frames) => frames.some((f) => values(f).some((col) => col && col.length > 0));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

  // ---- Prometheus: each metric, filtered by environment and version ----
  for (const [label, expr] of metrics) {
    const url = explorePane("prometheus", "prometheus", { expr, range: true, instant: false });
    const r = await runExplore(page, `prometheus ${label}`, url, hasRows);
    const last = r.frames.flatMap((f) => values(f).slice(1).map((c) => Number(c[c.length - 1])));
    const ok = r.frames.length > 0 && last.some((v) => v >= 1);
    report.push(`- Prometheus, ${label}: ${ok ? "seen" : "MISSING"} (\`${expr}\`, last values ${JSON.stringify(last)}, screenshot ${r.file})`);
    if (!ok) fail(`Explore (Prometheus) shows no value >= 1 for ${label}: ${expr}`);
    const text = await page.locator("body").innerText();
    if (/No data|Query error|Bad Gateway/i.test(text) && !ok) fail(`Explore page for ${label} reports an error or no data`);
  }

  // ---- Loki: the app's log lines, filtered ----
  {
    const expr = `{service_name="clipremix", deployment_environment="${ENV}"} | service_version="${VERSION}"`;
    const url = explorePane("loki", "loki", { expr, queryType: "range", maxLines: 100 });
    const r = await runExplore(page, "loki logs", url, hasRows);
    const text = JSON.stringify(r.frames);
    const seen = ["Competitor added", "Remix created"].filter((s) => text.includes(s));
    const ok = r.frames.length > 0 && seen.length === 2;
    report.push(`- Loki: ${ok ? "seen" : "MISSING"} log lines \`${expr}\` (found: ${seen.join(", ") || "none"}, screenshot ${r.file})`);
    if (!ok) fail(`Explore (Loki) does not show the app's log lines for ${expr}`);
    if (!/trace_?id/i.test(text)) fail("Explore (Loki) log lines carry no trace_id");
  }

  // ---- Tempo: search, then open one trace ----
  {
    const q = `{ resource.service.name = "clipremix" && resource.deployment.environment = "${ENV}" && resource.service.version = "${VERSION}" }`;
    const url = explorePane("tempo", "tempo", { queryType: "traceql", query: q, limit: 20, tableType: "traces" });
    const r = await runExplore(page, "tempo search", url, hasRows);
    const flat = JSON.stringify(r.frames);
    const ids = [...new Set((flat.match(/\b[0-9a-f]{32}\b/g) || []))];
    const ok = r.frames.length > 0 && ids.length > 0;
    report.push(`- Tempo search: ${ok ? "seen" : "MISSING"} ${ids.length} trace(s) for \`${q}\` (screenshot ${r.file})`);
    if (!ok) fail(`Explore (Tempo) finds no trace for ${q}`);
    if (ids.length) {
      const traceUrl = explorePane("tempo", "tempo", { queryType: "traceql", query: ids[0], limit: 20, tableType: "traces" });
      const t = await runExplore(page, "tempo trace", traceUrl, hasRows);
      const spanText = JSON.stringify(t.frames);
      const cols = t.frames.flatMap((f) => values(f));
      const spans = cols.reduce((m, c) => Math.max(m, (c || []).length), 0);
      const tok = t.frames.length > 0 && spans >= 2 && spanText.includes("clipremix");
      report.push(`- Tempo trace ${ids[0]}: ${tok ? "opened" : "NOT OPENED"}, ${spans} span row(s) (screenshot ${t.file})`);
      if (!tok) fail(`Explore (Tempo) did not open trace ${ids[0]} with at least 2 spans`);
    }
  }

  await browser.close();
  const text = `## Grafana Explore check (real browser)\n\nResult: **${problems.length ? "FAILED" : "PASSED"}**. Environment \`${ENV}\`, version \`${VERSION}\`.\n\n${problems.length ? "Problems:\n" + problems.map((p) => `- ${p}`).join("\n") + "\n\n" : ""}${report.join("\n")}\n`;
  fs.writeFileSync(path.join(OUT, "summary.md"), text);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  console.log(text);
  process.exit(problems.length ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
