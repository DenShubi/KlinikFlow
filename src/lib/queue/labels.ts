// Ticket code shown to patients and staff, e.g. A-007.
export function ticketCode(prefix: string, ticketNumber: number): string {
  return `${prefix}-${String(ticketNumber).padStart(3, "0")}`;
}
