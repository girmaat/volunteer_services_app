/**
 * One CSV cell: quoted, quotes doubled, and a leading = + - @ (or tab/CR) neutralised with an
 * apostrophe so spreadsheets don't run user-supplied text as a formula (CSV injection).
 */
export function csvCell(value: unknown) {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
