import { chromium } from "playwright";

async function debug() {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();

  await p.goto("http://localhost:3056/signin", { waitUntil: "domcontentloaded" });
  await new Promise((r) => setTimeout(r, 3000));

  await p.fill('input[type="email"]', "savazar01@gmail.com");
  await p.fill('input[type="password"]', "$Jun2020");
  await p.click('button[type="submit"]');
  await new Promise((r) => setTimeout(r, 4000));

  await p.goto("http://localhost:3056/dashboard", { waitUntil: "domcontentloaded" });
  await new Promise((r) => setTimeout(r, 3000));

  console.log("URL:", p.url());

  // List all buttons
  const buttons = await p.locator("button").all();
  console.log("BUTTONS COUNT:", buttons.length);
  for (let i = 0; i < buttons.length; i++) {
    const btn = buttons[i];
    const vis = await btn.isVisible();
    const text = (await btn.textContent().catch(() => "")) || "";
    const ariaLabel = (await btn.getAttribute("aria-label").catch(() => "")) || "";
    const type = (await btn.getAttribute("type").catch(() => "")) || "";
    console.log(`BTN[${i}] visible=${vis} type="${type}" text="${text.trim().substring(0, 60)}" aria="${ariaLabel}"`);
  }

  // List textareas
  const textareas = await p.locator("textarea").all();
  console.log("TEXTAREAS:", textareas.length);
  for (const ta of textareas) {
    const vis = await ta.isVisible();
    const ph = (await ta.getAttribute("placeholder").catch(() => "")) || "";
    console.log(`TEXTAREA visible=${vis} placeholder="${ph}"`);
  }

  await b.close();
}

debug().catch(console.error);
