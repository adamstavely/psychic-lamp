/** "Good morning" before noon, "Good afternoon" until five, "Good evening" after. */
export function greeting(now: Date): string {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** "4 items need you today." / "1 item needs you today." / "Nothing needs you today." */
export function needsLine(open: number): string {
  if (open === 0) return 'Nothing needs you today.';
  return open === 1 ? '1 item needs you today.' : `${open} items need you today.`;
}

export function clockTime(iso: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

export function longDate(now: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric' }).format(now);
}

/** A time of day for today, "Yesterday 9:40 PM" for yesterday, else the date. */
export function relativeDay(iso: string, now: Date, locale?: string): string {
  const d = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (days === 0) return clockTime(iso, locale);
  if (days === 1) return `Yesterday ${clockTime(iso, locale)}`;
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(d);
}

/** "yesterday at 6:12 PM", "today at 8:00 AM" or a date, for the line under the heading. */
export function sinceLine(iso: string, now: Date, locale?: string): string {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000);
  const day = days === 0 ? 'today' : days === 1 ? 'yesterday' : `on ${relativeDay(iso, now, locale)}`;
  return `Since you signed off ${day} at ${clockTime(iso, locale)}`;
}

/** Up to two letters for an avatar. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const pick = words.length > 1 ? [words[0]!, words[words.length - 1]!] : words;
  return pick.map((w) => w.charAt(0).toUpperCase()).join('');
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
