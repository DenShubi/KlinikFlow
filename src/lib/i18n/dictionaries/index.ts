import type { Locale } from "../config";
import { en } from "./en";
import { id, type Dictionary } from "./id";

export type { Dictionary };

// Both dictionaries are small, so they are bundled for the browser too: client
// components pick theirs from the locale the server rendered with.
export const DICTIONARIES: Record<Locale, Dictionary> = { id, en };
