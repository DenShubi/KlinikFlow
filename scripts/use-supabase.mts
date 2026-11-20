// Switches .env.local between the hosted Supabase project and the local
// Supabase stack (Docker), for the local fallback.
//
//   npm run env:local    point the app at the local stack (run `npm run db:start` first)
//   npm run env:hosted   point the app back at the hosted project
//
// The first `env:local` saves your current hosted .env.local as .env.hosted
// (git-ignored, like every .env file). Nothing is ever deleted.

import { execSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const LOCAL = ".env.local";
const HOSTED_BACKUP = ".env.hosted";
const target = process.argv[2];

function readEnv(file: string): string {
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

function getVar(content: string, name: string): string | undefined {
  return content.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim();
}

function setVar(content: string, name: string, value: string): string {
  const line = `${name}=${value}`;
  return new RegExp(`^${name}=.*$`, "m").test(content)
    ? content.replace(new RegExp(`^${name}=.*$`, "m"), line)
    : `${content.trimEnd()}\n${line}\n`;
}

function isLocalUrl(url: string | undefined): boolean {
  return !!url && /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url);
}

if (target === "hosted") {
  if (!existsSync(HOSTED_BACKUP)) {
    console.error(`${HOSTED_BACKUP} not found: .env.local already points at the hosted project (or was never switched).`);
    process.exit(1);
  }
  copyFileSync(HOSTED_BACKUP, LOCAL);
  console.log(`.env.local now points at the hosted project (${getVar(readEnv(LOCAL), "NEXT_PUBLIC_SUPABASE_URL")}).`);
  console.log("Restart `npm run dev` to use it.");
  process.exit(0);
}

if (target !== "local") {
  console.error("Usage: npm run env:local | npm run env:hosted");
  process.exit(1);
}

// Read the running local stack's URL and keys.
let status: string;
try {
  status = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
} catch {
  console.error("The local Supabase stack is not running. Start Docker Desktop, then run: npm run db:start");
  process.exit(1);
}
const statusVar = (...names: string[]) =>
  names.map((n) => getVar(status, n)?.replace(/^"|"$/g, "")).find((v) => v);
const apiUrl = statusVar("API_URL");
const publishableKey = statusVar("PUBLISHABLE_KEY", "ANON_KEY");
const secretKey = statusVar("SECRET_KEY", "SERVICE_ROLE_KEY");
if (!apiUrl || !publishableKey || !secretKey) {
  console.error("Could not read API_URL and keys from `npx supabase status -o env`.");
  process.exit(1);
}

const current = readEnv(LOCAL);
if (current && !isLocalUrl(getVar(current, "NEXT_PUBLIC_SUPABASE_URL")) && !existsSync(HOSTED_BACKUP)) {
  copyFileSync(LOCAL, HOSTED_BACKUP);
  console.log(`Saved your hosted settings to ${HOSTED_BACKUP}.`);
}

// Start from the hosted settings (keeps Gemini, WhatsApp and the demo password).
let next = readEnv(HOSTED_BACKUP) || current || readEnv(".env.example");
next = setVar(next, "NEXT_PUBLIC_SUPABASE_URL", apiUrl);
next = setVar(next, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", publishableKey);
next = setVar(next, "SUPABASE_SECRET_KEY", secretKey);
next = setVar(next, "NEXT_PUBLIC_APP_URL", "http://localhost:3000");
writeFileSync(LOCAL, next);

console.log(`.env.local now points at the local stack (${apiUrl}).`);
if (!getVar(next, "DEMO_STAFF_PASSWORD")) {
  console.log("Set DEMO_STAFF_PASSWORD in .env.local (at least 10 characters) before the next step.");
}
console.log("Next: npm run staff:seed, then npm run dev. Switch back with: npm run env:hosted");
