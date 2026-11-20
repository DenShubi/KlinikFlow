// Smoke test for staff pages: signs in each role the way the app does (auth
// cookies), requests the pages from a running dev server and checks who gets
// what. Start the app first (`npm run dev`), then:
//
//   npm run test:auth
//
// Needs in .env.local: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
// DEMO_STAFF_PASSWORD, and optionally NEXT_PUBLIC_APP_URL (default http://localhost:3000).

import { createServerClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const password = process.env.DEMO_STAFF_PASSWORD ?? "";
const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
if (!url || !publishableKey || !password) {
  console.error("Missing Supabase env or DEMO_STAFF_PASSWORD in .env.local.");
  process.exit(1);
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(56)} ${detail}`);
}

// Signs in and returns the auth cookies as a Cookie header.
async function signInCookies(email: string): Promise<string> {
  const jar = new Map<string, string>();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function get(path: string, cookie?: string) {
  const res = await fetch(`${appUrl}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  const location = res.headers.get("location");
  // Staff pages stream: the role redirect may arrive inside the HTML stream.
  const body = await res.text();
  const streamedRedirect = body.match(/NEXT_REDIRECT;[^;]*;([^;"\\]+)/)?.[1] ?? null;
  return { status: res.status, location: location ? new URL(location, appUrl).pathname : streamedRedirect, body };
}

async function main() {
  const health = await fetch(`${appUrl}/api/health`).catch(() => null);
  if (!health) {
    console.error(`App is not running at ${appUrl}. Start it with npm run dev.`);
    process.exit(1);
  }

  console.log("Signed out");
  for (const path of ["/reception", "/doctor"]) {
    const r = await get(path);
    check(`  ${path} sends to /login`, r.location === "/login", `${r.status} -> ${r.location}`);
  }

  console.log("\nReceptionist");
  const receptionist = await signInCookies("resepsionis@klinikflow.test");
  let r = await get("/reception", receptionist);
  check("  /reception opens", r.status === 200 && !r.location, `${r.status}`);
  check(
    "  sees all three doctors' queues",
    ["dr. Larasati Wibowo", "dr. Hendra Kusuma", "dr. Maya Sitompul"].every((n) => r.body.includes(n)),
  );
  check("  sees patient WhatsApp numbers", r.body.includes("+62800"));
  r = await get("/doctor", receptionist);
  check("  /doctor sends to /reception", r.location === "/reception", `${r.status} -> ${r.location}`);

  console.log("\nDoctor A");
  const doctor = await signInCookies("dokter.a@klinikflow.test");
  r = await get("/doctor", doctor);
  check("  /doctor opens", r.status === 200 && !r.location, `${r.status}`);
  check("  sees own queue (A- tickets)", /A-0\d\d/.test(r.body));
  check("  sees no other doctor's tickets", !/[BC]-0\d\d/.test(r.body));
  check("  sees no patient WhatsApp numbers", !r.body.includes("+62800"));
  r = await get("/reception", doctor);
  check("  /reception sends to /doctor", r.location === "/doctor", `${r.status} -> ${r.location}`);

  console.log(failures ? `\n${failures} check(s) failed.` : "\nAll page checks passed.");
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
