/* Per-browser UI preferences. Reads the old Speklone keys as a fallback (same origin). */
export function readPref(key: string, fallback: string): string {
  try { return localStorage.getItem('mco.' + key) ?? localStorage.getItem('speklone.' + key) ?? fallback; } catch { return fallback; }
}
export function writePref(key: string, value: string) {
  try { localStorage.setItem('mco.' + key, value); } catch { /* storage unavailable */ }
}
