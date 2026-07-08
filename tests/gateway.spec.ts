import { test, expect } from "@playwright/test";

test("GET /health returns 200 OK with status", async ({ request }) => {
  const response = await request.get("/health");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toHaveProperty("status", "ok");
  expect(body).toHaveProperty("timestamp");
});

test("POST /api/test-mask masks and unmaskes PII", async ({ request }) => {
  const response = await request.post("/api/test-mask", {
    data: { text: "My email is test@example.com" },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.masked).toContain("[MASK_email_");
  expect(body.unmasked).toBe(body.original);
});

test("POST /api/graph/invoke returns graph state", async ({ request }) => {
  const response = await request.post("/api/graph/invoke", {
    data: { message: "hello world" },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toHaveProperty("messages");
  expect(body).toHaveProperty("routingDecision");
});
