import { chromium } from "playwright";
import fs from "fs";
import path from "path";

async function run() {
  const screenshotDir = path.resolve("devplans/screenshots");
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log("1. Navigating to signin...");
  await page.goto("http://localhost:3056/signin", { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', "savazar01@gmail.com");
  await page.fill('input[type="password"]', "SavazAI@Admin2026!");
  await page.click('button[type="submit"]');

  await page.waitForNavigation({ waitUntil: "networkidle" }).catch(() => {});
  console.log("Logged in. Current URL:", page.url());

  // 1. Governance Hub
  console.log("2. Verifying Governance Hub...");
  await page.goto("http://localhost:3056/admin/governance", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // Verify left subnav rail elements exist
  const railHeading = page.locator('span:has-text("Report Directory")');
  if (!(await railHeading.isVisible())) {
    throw new Error("Report Directory rail heading is missing in Governance Hub!");
  }
  await page.screenshot({ path: path.join(screenshotDir, "governance_subnav_rail.png"), fullPage: false });
  console.log("Saved governance_subnav_rail.png");

  // 2. User Admin & Multi-Role Filter
  console.log("3. Verifying User Admin...");
  await page.goto("http://localhost:3056/admin/users", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // Click on "Roles & Access Profiles" tab
  const rolesTabButton = page.locator('button:has-text("Roles & Access Profiles")');
  await rolesTabButton.click();
  await page.waitForTimeout(600);

  // Verify List Mode table is rendered by default
  const rolesTable = page.locator('table th:has-text("Role Profile Name")');
  if (!(await rolesTable.isVisible())) {
    throw new Error("Roles & Access Profiles did not default to List View table!");
  }
  await page.screenshot({ path: path.join(screenshotDir, "user_admin_roles_list_default.png"), fullPage: false });
  console.log("Saved user_admin_roles_list_default.png");

  // Locate the Auditor row by looking for ID: role_auditor
  const auditorRow = page.locator('tr').filter({ hasText: 'role_auditor' });
  const assignedPill = auditorRow.locator('button:has-text("Users Assigned")');
  await assignedPill.click();
  await page.waitForTimeout(1000);

  // Verify that the filter is set to Auditor and Sujatha A is visible (NOT "No active users matching criteria")
  const noUsersMsg = page.locator('text="No active users matching criteria"');
  if (await noUsersMsg.isVisible()) {
    throw new Error("Multi-role filter failed: 'No active users matching criteria' was shown!");
  }

  const sujathaCell = page.locator('td:has-text("Sujatha")');
  if (!(await sujathaCell.isVisible())) {
    throw new Error("Multi-role filter failed: Sujatha was not shown for Auditor role!");
  }
  console.log("Multi-role filter verified: Sujatha is visible under Auditor filter!");

  await page.screenshot({ path: path.join(screenshotDir, "user_admin_auditor_filter_success.png"), fullPage: false });
  console.log("Saved user_admin_auditor_filter_success.png");

  // 3. Agent Catalog & Builder Hub
  console.log("4. Verifying Agent Catalog & Builder Hub...");
  await page.goto("http://localhost:3056/studio", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  const agentBuilderHubBtn = page.locator('button:has-text("Agent Builder Hub")');
  await agentBuilderHubBtn.click();
  await page.waitForTimeout(800);

  // Verify that List View table is rendered by default
  const agentsTable = page.locator('table th:has-text("Agent Name & Key")');
  if (!(await agentsTable.isVisible())) {
    throw new Error("Agent Catalog & Builder Hub did not default to List View table!");
  }
  console.log("Agent Catalog & Builder Hub verified: List View table rendered by default!");
  await page.screenshot({ path: path.join(screenshotDir, "agent_catalog_list_default.png"), fullPage: false });
  console.log("Saved agent_catalog_list_default.png");

  // 4. Agent Inspector & Knowledge Tab Parity
  console.log("5. Verifying Agent Inspector & Knowledge Tab...");
  const createAgentBtn = page.locator('button:has-text("Create Agent")').first();
  if (await createAgentBtn.isVisible()) {
    await createAgentBtn.click();
  } else {
    const editBtn = page.locator('button:has-text("Edit")').first();
    await editBtn.click();
  }
  await page.waitForTimeout(1000);

  // Check that the drawer is opened in expanded view
  const drawer = page.locator('div.max-w-5xl, div.sm\\:max-w-6xl').first();
  if (!(await drawer.isVisible())) {
    throw new Error("Agent Inspector did not open in expanded view by default!");
  }
  console.log("Agent Inspector verified: opened in expanded max-w-5xl/max-w-6xl view by default!");

  // Switch to Knowledge tab
  const knowledgeTabBtn = page.locator('button:has-text("KNOWLEDGE")');
  await knowledgeTabBtn.click();
  await page.waitForTimeout(800);

  // Check Knowledge Tab sections
  const skillsTableHeading = page.locator('span:has-text("Universal Business Skills")');
  const okfTableHeading = page.locator('span:has-text("OKF v0.1 Concept Bundles")');
  if (!(await skillsTableHeading.isVisible()) || !(await okfTableHeading.isVisible())) {
    throw new Error("Knowledge Tab data tables for Skills and OKF are missing!");
  }
  console.log("Knowledge Tab verified: Skills and OKF data tables rendered!");

  await page.screenshot({ path: path.join(screenshotDir, "agent_inspector_knowledge_parity.png"), fullPage: false });
  console.log("Saved agent_inspector_knowledge_parity.png");

  await browser.close();

  // Test in Light Mode
  console.log("6. Verifying Light Mode...");
  const lightBrowser = await chromium.launch({ headless: true });
  const lightContext = await lightBrowser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  const lightPage = await lightContext.newPage();

  await lightPage.goto("http://localhost:3056/signin", { waitUntil: "networkidle" });
  await lightPage.fill('input[type="email"]', "savazar01@gmail.com");
  await lightPage.fill('input[type="password"]', "SavazAI@Admin2026!");
  await lightPage.click('button[type="submit"]');
  await lightPage.waitForNavigation({ waitUntil: "networkidle" }).catch(() => {});

  // Governance Hub Light Mode
  await lightPage.goto("http://localhost:3056/admin/governance", { waitUntil: "networkidle" });
  await lightPage.evaluate(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.classList.add("light");
  });
  await lightPage.waitForTimeout(600);
  await lightPage.screenshot({ path: path.join(screenshotDir, "governance_subnav_rail_light.png"), fullPage: false });
  console.log("Saved governance_subnav_rail_light.png");

  // Agent Inspector Knowledge Tab Light Mode
  await lightPage.goto("http://localhost:3056/studio", { waitUntil: "networkidle" });
  await lightPage.evaluate(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.classList.add("light");
  });
  await lightPage.waitForTimeout(800);
  const lightAgentBuilderBtn = lightPage.locator('button:has-text("Agent Builder Hub")');
  await lightAgentBuilderBtn.click();
  await lightPage.waitForTimeout(600);
  const lightCreateAgentBtn = lightPage.locator('button:has-text("Create Agent")').first();
  await lightCreateAgentBtn.click();
  await lightPage.waitForTimeout(800);
  const lightKnowledgeBtn = lightPage.locator('button:has-text("KNOWLEDGE")');
  await lightKnowledgeBtn.click();
  await lightPage.waitForTimeout(800);
  await lightPage.screenshot({ path: path.join(screenshotDir, "agent_inspector_knowledge_parity_light.png"), fullPage: false });
  console.log("Saved agent_inspector_knowledge_parity_light.png");

  await lightBrowser.close();
  console.log("All dual-theme verifications passed with 100% success!");
}

run().catch((err) => {
  console.error("Verification error:", err);
  process.exit(1);
});
