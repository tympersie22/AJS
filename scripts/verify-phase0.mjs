import { spawn } from "node:child_process";

const port = 4100;
const baseUrl = `http://localhost:${port}`;
const server = spawn(process.execPath, ["dist/server.js"], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      await wait(200);
    }
  }

  throw new Error("API did not start in time");
}

async function request(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

try {
  await waitForServer();

  const rejected = await request("/protected/director-summary");
  if (rejected.response.status !== 401) {
    throw new Error(`Expected missing token rejection, got ${rejected.response.status}`);
  }

  const login = await request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "director@ajs.local", password: "Password123!" }),
  });

  if (!login.response.ok || !login.body.token) {
    throw new Error(`Expected successful login, got ${login.response.status}`);
  }

  const protectedRoute = await request("/protected/director-summary", {
    headers: { authorization: `Bearer ${login.body.token}` },
  });

  if (!protectedRoute.response.ok) {
    throw new Error(`Expected protected route success, got ${protectedRoute.response.status}`);
  }

  console.log("Phase 0 verification passed");
  console.log("- Seeded user can log in and receive a JWT");
  console.log("- Protected route rejects requests without a token");
  console.log("- Protected route accepts a valid director JWT");
} finally {
  server.kill();
}
