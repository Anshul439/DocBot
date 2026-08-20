import express from "express";
import request from "supertest";
import {
  authLimiter,
  uploadLimiter,
  chatLimiter,
  generalLimiter,
} from "../middlewares/rateLimiter.middleware.js";

function buildApp() {
  const app = express();
  app.use(express.json());

  const ok = (_req: express.Request, res: express.Response): void => { res.json({ ok: true }); };
  app.post("/api/users/signin",  authLimiter,    ok);
  app.post("/api/users/signup",  authLimiter,    ok);
  app.post("/upload/pdf",        uploadLimiter,  ok);
  app.get("/chat",               chatLimiter,    ok);
  app.get("/pdfs",               generalLimiter, ok);

  return app;
}

async function fireRequests(
  app: express.Express,
  method: "get" | "post",
  path: string,
  count: number
): Promise<number[]> {
  const codes: number[] = [];
  for (let i = 0; i < count; i++) {
    const res = await (method === "get"
      ? request(app).get(path)
      : request(app).post(path).send({}));
    codes.push(res.status);
  }
  return codes;
}

async function run() {
  const app = buildApp();
  let passed = 0;
  let failed = 0;

  const check = (label: string, condition: boolean) => {
    if (condition) {
      console.log(`  ✓  ${label}`);
      passed++;
    } else {
      console.error(`  ✗  ${label}`);
      failed++;
    }
  };

  console.log("\n[1] Auth limiter  (POST /api/users/signin, max 10 per 15 min)");
  {
    const codes = await fireRequests(app, "post", "/api/users/signin", 12);
    const ok   = codes.filter(c => c === 200).length;
    const hit  = codes.filter(c => c === 429).length;
    console.log(`    Responses: ${codes.join(", ")}`);
    check("First 10 requests return 200", ok === 10);
    check("Requests 11-12 return 429",    hit === 2);
    const bodyCheck = await request(app).post("/api/users/signin").send({});
    check("429 body has 'error' field", "error" in (bodyCheck.body as object));
  }

  console.log("\n[2] Upload limiter  (POST /upload/pdf, max 20 per hour)");
  {
    const codes = await fireRequests(app, "post", "/upload/pdf", 22);
    const ok  = codes.filter(c => c === 200).length;
    const hit = codes.filter(c => c === 429).length;
    console.log(`    200s: ${ok}, 429s: ${hit}`);
    check("First 20 requests return 200", ok === 20);
    check("Requests 21-22 return 429",    hit === 2);
  }

  console.log("\n[3] Chat limiter  (GET /chat, max 60 per min)");
  {
    const codes = await fireRequests(app, "get", "/chat", 62);
    const ok  = codes.filter(c => c === 200).length;
    const hit = codes.filter(c => c === 429).length;
    console.log(`    200s: ${ok}, 429s: ${hit}`);
    check("First 60 requests return 200", ok === 60);
    check("Requests 61-62 return 429",    hit === 2);
  }

  console.log("\n[4] General limiter  (GET /pdfs, max 200 per min)");
  {
    const codes = await fireRequests(app, "get", "/pdfs", 202);
    const ok  = codes.filter(c => c === 200).length;
    const hit = codes.filter(c => c === 429).length;
    console.log(`    200s: ${ok}, 429s: ${hit}`);
    check("First 200 requests return 200", ok === 200);
    check("Requests 201-202 return 429",   hit === 2);
  }

  console.log("\n[5] 429 response body format");
  {
    // auth limiter is already exhausted from test 1, so next call hits 429
    const res = await request(app).post("/api/users/signin").send({});
    check("Status is 429",                 res.status === 429);
    check("success === false",             res.body.success === false);
    check("error message is a string",     typeof res.body.error === "string");
    check("RateLimit-Limit header present", !!res.headers["ratelimit-limit"]);
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch(err => { console.error(err); process.exit(1); });
