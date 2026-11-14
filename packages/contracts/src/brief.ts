import { z } from 'zod';

const Id = z.string().min(1).max(64);
const Iso = z.iso.datetime({ offset: true });

/** Where a brief item leads. `href` is null when it lives in Build mode, which is a later slice. */
export const BriefLink = z.object({ label: z.string(), href: z.string().nullable() });
export type BriefLink = z.infer<typeof BriefLink>;

export const BriefNeed = z.object({
  id: Id,
  kind: z.enum(['approval', 'workflow', 'model', 'access']),
  title: z.string(),
  meta: z.string(),
  /** Set when it has to happen before something: the brief shows "Before <time>". */
  dueAt: Iso.nullable(),
  action: BriefLink,
  done: z.boolean(),
});
export type BriefNeed = z.infer<typeof BriefNeed>;

export const BriefMemo = z.object({
  id: Id,
  from: z.string(),
  role: z.string(),
  at: Iso,
  subject: z.string(),
  preview: z.string(),
  project: z.string().nullable(),
  read: z.boolean(),
});
export type BriefMemo = z.infer<typeof BriefMemo>;

export const BriefSearch = z.object({
  id: Id,
  query: z.string(),
  scope: z.string(),
  newCount: z.number().int().nonnegative(),
  top: z.string(),
  at: Iso,
});
export type BriefSearch = z.infer<typeof BriefSearch>;

export const BriefMeeting = z.object({
  id: Id,
  title: z.string(),
  start: Iso,
  end: Iso,
  where: z.string(),
  /** The one the brief's read points at. */
  important: z.boolean(),
});
export type BriefMeeting = z.infer<typeof BriefMeeting>;

export const BriefUpdate = z.object({ id: Id, at: Iso, text: z.string() });
export type BriefUpdate = z.infer<typeof BriefUpdate>;

/** A person, project, model, workflow or dataset that changed since yesterday. */
export const BriefAccount = z.object({
  id: Id,
  name: z.string(),
  sub: z.string(),
  kind: z.enum(['person', 'project', 'model', 'workflow', 'dataset', 'team']),
  link: BriefLink,
  updates: z.array(BriefUpdate).min(1),
});
export type BriefAccount = z.infer<typeof BriefAccount>;

export const BriefResume = z.object({ id: Id, title: z.string(), meta: z.string(), href: z.string() });
export type BriefResume = z.infer<typeof BriefResume>;

/** Another app Donovan reads from, and how many new things it has. */
export const BriefApp = z.object({ name: z.string(), unread: z.number().int().nonnegative() });
export type BriefApp = z.infer<typeof BriefApp>;

export const Brief = z.object({
  /** When the person last signed off: everything here is since then. */
  since: Iso,
  /** Donovan's read on the queue, a paragraph each. */
  read: z.array(z.string()).min(1),
  needs: z.array(BriefNeed),
  memos: z.array(BriefMemo),
  searches: z.array(BriefSearch),
  meetings: z.array(BriefMeeting),
  accounts: z.array(BriefAccount),
  /** Ids of account updates already seen. */
  seenUpdates: z.array(Id),
  resume: z.array(BriefResume),
  apps: z.array(BriefApp),
});
export type Brief = z.infer<typeof Brief>;

export const BriefQuery = z.object({
  /** The reader's IANA time zone, so times written into the read match their clock. */
  tz: z
    .string()
    .max(64)
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, 'Unknown time zone')
    .default('UTC'),
});
export type BriefQuery = z.infer<typeof BriefQuery>;

export const NeedDone = z.strictObject({ done: z.boolean() });
export type NeedDone = z.infer<typeof NeedDone>;

export const MemosRead = z.strictObject({ ids: z.array(Id).min(1).max(100) });
export type MemosRead = z.infer<typeof MemosRead>;

export const UpdatesSeen = z.strictObject({ ids: z.array(Id).min(1).max(100) });
export type UpdatesSeen = z.infer<typeof UpdatesSeen>;
