// Normalises an Indonesian WhatsApp number to E.164 (+62...), the format
// stored in patients.phone. Returns null for an empty input and "invalid" when
// the number cannot be a phone number.
export function normalizePhone(raw: string): string | null | "invalid" {
  const digits = raw.replace(/[\s\-().]/g, "");
  if (!digits) return null;

  let e164: string;
  if (digits.startsWith("+")) e164 = digits;
  else if (digits.startsWith("62")) e164 = `+${digits}`;
  else if (digits.startsWith("0")) e164 = `+62${digits.slice(1)}`;
  else e164 = `+62${digits}`;

  return /^\+[1-9][0-9]{7,14}$/.test(e164) ? e164 : "invalid";
}
