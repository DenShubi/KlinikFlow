// Age in whole years on a given day, from YYYY-MM-DD dates. Undefined when
// the birth date is missing or not plausible.
export function ageInYears(birthDate: string | null | undefined, onDate: string): number | undefined {
  if (!birthDate) return undefined;
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = onDate.split("-").map(Number);
  if (!by || !ty) return undefined;
  const age = ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
  return age >= 0 && age < 130 ? age : undefined;
}
