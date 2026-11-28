"use server";

import { redirect } from "next/navigation";

import { ROLE_HOME } from "@/lib/auth/roles";
import { getDictionary } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export type SignInState = {
  error?: string;
  email?: string;
};

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const t = (await getDictionary()).login.errors;

  if (!email || !password) {
    return { error: t.missing, email };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { error: t.wrong, email };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile) {
    await supabase.auth.signOut();
    return { error: t.notStaff, email };
  }

  redirect(ROLE_HOME[profile.role]);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
