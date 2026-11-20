"use server";

import { redirect } from "next/navigation";

import { ROLE_HOME } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export type SignInState = {
  error?: string;
  email?: string;
};

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Isi email dan kata sandi.", email };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { error: "Email atau kata sandi salah.", email };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile) {
    await supabase.auth.signOut();
    return { error: "Akun ini tidak terdaftar sebagai staf klinik.", email };
  }

  redirect(ROLE_HOME[profile.role]);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
