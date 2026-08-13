const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const { chromium } = require("C:/Users/diman/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

const WORKBOOK = process.argv[2];
const BASE_URL = "https://ims.go1.kworld.kpmg.com";
const PROFILE_DIR = path.join(process.cwd(), "automation-profile");

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!WORKBOOK) fail("Usage: node scripts/timesheet-automation.js <workbook.xlsx>");
if (!fs.existsSync(WORKBOOK)) fail(`Workbook not found: ${WORKBOOK}`);

const parsed = spawnSync(
  "C:/Users/diman/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe",
  [path.join(__dirname, "parse_excel.py"), WORKBOOK],
  { encoding: "utf8" }
);
if (parsed.status !== 0) fail(parsed.stderr || parsed.stdout || "Failed to parse workbook");

const payload = JSON.parse(parsed.stdout);
const entries = payload.entries || [];
if (!entries.length) fail("No entries found in workbook.");

const DAY_ALIASES = {
  monday: ["mon", "monday"],
  tuesday: ["tue", "tuesday"],
  wednesday: ["wed", "wednesday"],
  thursday: ["thu", "thursday"],
  friday: ["fri", "friday"],
  saturday: ["sat", "saturday"],
  sunday: ["sun", "sunday"],
};

function normalizeDay(text) {
  const value = String(text || "").trim().toLowerCase();
  for (const [day, aliases] of Object.entries(DAY_ALIASES)) {
    if (aliases.some((alias) => value === alias || value.includes(alias))) return day;
  }
  return "";
}

async function getVisibleDays(page) {
  const labels = await page.locator("th, [role='columnheader'], [data-testid], div").evaluateAll((nodes) =>
    nodes
      .map((n) => (n.innerText || "").trim())
      .filter(Boolean)
      .slice(0, 500)
  ).catch(() => []);
  const found = [];
  for (const label of labels) {
    const day = normalizeDay(label);
    if (day && !found.includes(day)) found.push(day);
  }
  return found;
}

async function fillProjectRow(page, code, hoursByDay) {
  const attachButton = page.getByText("Attach Internal Order", { exact: false }).first();
  if (await attachButton.count()) {
    await attachButton.click().catch(() => {});
  }

  const searchInput = page.getByPlaceholder(/search by code or name/i).first();
  if (await searchInput.count()) {
    await searchInput.fill(code);
    await page.waitForTimeout(800);
    const match = page.getByText(code, { exact: true }).first();
    if (await match.count()) await match.click();
  }

  const visibleDays = await getVisibleDays(page);
  console.log(`Visible days in this week: ${visibleDays.join(", ") || "none detected"}`);

  for (const [day, value] of Object.entries(hoursByDay || {})) {
    if (!visibleDays.includes(day)) {
      console.log(`Skipping ${day} because it is not present in the active week view.`);
      continue;
    }

    const cellCandidates = page
      .locator("input, textarea, [contenteditable='true']")
      .filter({ has: page.getByText(new RegExp(`^${day.slice(0, 3)}`, "i")) });

    if (await cellCandidates.count()) {
      const cell = cellCandidates.first();
      await cell.click({ clickCount: 3 }).catch(() => {});
      await cell.fill(String(value)).catch(async () => {
        await page.keyboard.type(String(value));
      });
      console.log(`Filled ${day} with ${value} hours.`);
    } else {
      console.log(`Could not find an editable cell for ${day}; leaving it untouched.`);
    }
  }
}

async function run() {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: null,
  });
  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(15000);

  await page.goto(`${BASE_URL}/timesheets/my`, { waitUntil: "domcontentloaded" });
  console.log("If prompted, sign in with email and complete the OTP step manually.");
  console.log("Once you reach My Timesheets, press Enter here to continue.");
  await new Promise((resolve) => process.stdin.once("data", resolve));

  await page.goto(`${BASE_URL}/timesheets/my`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  const currentMonthText = await page.locator("text=/Current timesheet/i").first().textContent().catch(() => "");
  console.log(`Current timesheet panel: ${currentMonthText || "not detected"}`);

  const monthCard = page.getByRole("button", { name: /open/i }).first();
  if (await monthCard.count()) {
    await monthCard.click();
  }

  await page.waitForLoadState("networkidle").catch(() => {});

  const rowAction = page.locator("text=Fill out").first();
  if (await rowAction.count()) {
    await rowAction.click();
  }

  await page.waitForLoadState("networkidle").catch(() => {});

  for (const entry of entries) {
    const code = String(entry.internal_order_code || "").trim();
    if (!code) {
      console.log(`Skipping entry without code: ${JSON.stringify(entry)}`);
      continue;
    }

    const projectHeader = page.getByText("Internal Order", { exact: true }).first();
    if (await projectHeader.count()) {
      await projectHeader.click().catch(() => {});
    }

    const hoursByDay = entry.hours_by_day || {};
    await fillProjectRow(page, code, hoursByDay);
    if (Object.keys(hoursByDay).length === 0 && entry.hours != null) {
      console.log(`No per-day hours found; total hours in workbook: ${entry.hours}`);
    }
    console.log(`Prepared code ${code}.`);
  }

  console.log("Review the entries in the browser. If everything looks right, click Submit for Review yourself.");
  await context.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
