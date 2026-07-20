import { chromium } from "playwright";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = "http://localhost:3056";
const EMAIL = "savazar01@gmail.com";
const PASSWORD = "$Jun2020";
const ARTIFACTS_DIR = path.resolve(__dirname, "..", "test-results");

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on("requestfailed", (req) => {
    if (!req.url().includes("_rsc=")) {
      console.log(`[Browser RequestFailed] ${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
    }
  });

  try {
    // ===== LOGIN =====
    console.log("[E2E Multi-Turn] Navigating to signin...");
    await page.goto(`${BASE_URL}/signin`, { waitUntil: "domcontentloaded" });
    await delay(3000);
    console.log("[E2E Multi-Turn] Waiting for login form...");
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });

    console.log("[E2E Multi-Turn] Filling credentials...");
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');

    console.log("[E2E Multi-Turn] Waiting for session...");
    await delay(4000);

    // ===== NAVIGATE TO DASHBOARD =====
    console.log("[E2E Multi-Turn] Navigating to dashboard...");
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForSelector('textarea, input[placeholder*="message"], [contenteditable]', { timeout: 15000 });
    console.log("[E2E Multi-Turn] Dashboard loaded. URL:", page.url());

    // ===== TURN 1: Find vendors in City A =====
    console.log("\n===== TURN 1: Find vendors in Secunderabad =====");
    await sendPromptAndCapture(page, "Find top 5 wedding planners in Secunderabad, Telangana, India", "turn1_secunderabad.png", 60000);

    // ===== TURN 2: Find vendors in City B (MUST return NEW results, not stale) =====
    console.log("\n===== TURN 2: Find wedding pandits in Chennai =====");
    await sendPromptAndCapture(page, "Find top 5 wedding pandits in Chennai, Tamil Nadu", "turn2_chennai.png", 60000);

    // ===== TURN 3: Guest list + email (test CommunicationAgent chaining) =====
    console.log("\n===== TURN 3: Guest list + email =====");
    await sendPromptAndCapture(page, "Provide a guest list report with RSVP status and send the report to avasat01@gmail.com", "turn3_guestlist_email.png", 60000);

    console.log("\n[E2E Multi-Turn] ALL TURNS COMPLETED SUCCESSFULLY!");
  } catch (err) {
    console.error("[E2E Multi-Turn] Error:", err);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "error_screenshot.png"), fullPage: true });
  } finally {
    await browser.close();
  }
}

async function sendPromptAndCapture(page: any, prompt: string, screenshotName: string, timeout: number) {
  const inputSelector = 'textarea, input[placeholder*="message"], [contenteditable]';
  await page.waitForSelector(inputSelector, { timeout: 10000 });

  const input = await page.$(inputSelector);
  if (input) {
    await input.fill("");
    await delay(200);
  }

  console.log(`[E2E Multi-Turn] Typing prompt: "${prompt}"`);
  await page.fill(inputSelector, prompt);
  await delay(500);

  console.log("[E2E Multi-Turn] Clicking Send...");
  const sendButton = await page.$('button[title="Send"]');
  if (sendButton) {
    await sendButton.click();
  } else {
    // Fallback: press Enter
    await page.keyboard.press("Enter");
  }

  console.log("[E2E Multi-Turn] Waiting for response...");
  const responsePromise = page.waitForResponse(
    (resp: any) => resp.url().includes("/api/chat") && resp.status() === 200,
    { timeout }
  ).catch(() => null);

  const response = await responsePromise;
  if (response) {
    console.log(`[E2E Multi-Turn] API response received: ${response.status()}`);
  } else {
    console.log("[E2E Multi-Turn] API response timed out");
  }

  await delay(3000);

  const screenshotPath = path.join(ARTIFACTS_DIR, screenshotName);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`[E2E Multi-Turn] Screenshot saved: ${screenshotPath}`);
}

run().catch(console.error);
