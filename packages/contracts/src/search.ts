import { z } from 'zod';

export const SearchQuery = z.object({ q: z.string().trim().min(1).max(200) });
export type SearchQuery = z.infer<typeof SearchQuery>;

const Hit = z.object({ id: z.string(), title: z.string(), detail: z.string() });

/** What ⌘K finds: chats (with the passage that matched), artifacts and projects. */
export const SearchResults = z.object({ chats: z.array(Hit), artifacts: z.array(Hit), projects: z.array(Hit) });
export type SearchResults = z.infer<typeof SearchResults>;
