import type { ChatSummary } from '@donovan/contracts';

export interface ChatGroup {
  label: string;
  chats: ChatSummary[];
}

/** Pinned first, then by when the chat was last active: Today, Yesterday, Earlier this week, Older. Empty groups drop. */
export function groupChats(chats: ChatSummary[], now: Date): ChatGroup[] {
  const today = startOfDay(now);
  const day = 86_400_000;
  const bucket = (c: ChatSummary): string => {
    if (c.pinned) return 'Pinned';
    const t = new Date(c.updatedAt).getTime();
    if (t >= today) return 'Today';
    if (t >= today - day) return 'Yesterday';
    if (t >= today - 6 * day) return 'Earlier this week';
    return 'Older';
  };
  const order = ['Pinned', 'Today', 'Yesterday', 'Earlier this week', 'Older'];
  const sorted = [...chats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return order
    .map((label) => ({ label, chats: sorted.filter((c) => bucket(c) === label) }))
    .filter((g) => g.chats.length > 0);
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
