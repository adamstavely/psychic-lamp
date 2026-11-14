import { z } from 'zod';

export const NotificationCategory = z.enum(['approvals', 'memos', 'updates']);
export type NotificationCategory = z.infer<typeof NotificationCategory>;

/** Something that happened that the person may want to act on: a write waiting for approval, a memo, an update. */
export const Notification = z.object({
  id: z.string(),
  category: NotificationCategory,
  title: z.string(),
  actor: z.string().nullable(),
  body: z.string().nullable(),
  /** Where it happened: a chat's title, a project. */
  context: z.string().nullable(),
  time: z.iso.datetime({ offset: true }),
  read: z.boolean(),
  /** Where opening it goes, inside Donovan. */
  href: z.string().nullable(),
});
export type Notification = z.infer<typeof Notification>;

export const NotificationsRead = z.strictObject({
  ids: z.array(z.string()).min(1).max(200),
  read: z.boolean().default(true),
});
export type NotificationsRead = z.infer<typeof NotificationsRead>;

export const NotificationDismiss = z.strictObject({ id: z.string().min(1) });
export type NotificationDismiss = z.infer<typeof NotificationDismiss>;
