import { HttpClient, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { ChatHistory } from '@adamstavely/trenchcoat/angular/chat-history';
import { CommandMenu } from '@adamstavely/trenchcoat/angular/command-menu';
import { HeaderBrand } from '@adamstavely/trenchcoat/angular/header-brand';
import { HeaderNav } from '@adamstavely/trenchcoat/angular/header-nav';
import { Notifications } from '@adamstavely/trenchcoat/angular/notifications';
import { SegmentedControl } from '@adamstavely/trenchcoat/angular/segmented-control';
import { SideNav } from '@adamstavely/trenchcoat/angular/side-nav';
import { Toaster } from '@adamstavely/trenchcoat/angular/toaster';
import type { ChatConversation, ChatFolder } from '@adamstavely/trenchcoat/chat-history';
import type { CommandMenuGroup, CommandMenuRun } from '@adamstavely/trenchcoat/command-menu';
import type { HeaderNavAccountSelect } from '@adamstavely/trenchcoat/header-nav';
import type { NotificationCategory, NotificationItem } from '@adamstavely/trenchcoat/notifications';
import type { ProfileMenuItem } from '@adamstavely/trenchcoat/profile-menu';
import type { SegmentOption, SegmentValueChange } from '@adamstavely/trenchcoat/segmented-control';
import type { SideNavCollapsedChange, SideNavItem, SideNavNavigate } from '@adamstavely/trenchcoat/side-nav';
import { toast } from '@adamstavely/trenchcoat/toaster';
import type { RegistryCounts, RegistrySummary, SearchResults } from '@donovan/contracts';
import { catchError, debounceTime, filter, forkJoin, map, of, Subject, switchMap } from 'rxjs';
import { IconDirective } from '../core/icon.directive';
import { ChatsStore } from '../core/chats-store';
import { ProjectsStore } from '../core/projects-store';
import { NotificationsStore } from '../core/notifications-store';
import { brandMark, icon } from '../core/icons';
import { Session } from '../core/session';
import { ThemeService } from '../core/theme';
import { areaFor, ASSIST_AREAS, BUILD_AREAS, buildAreaFor, modeFor, type Mode } from './areas';

const SIGN_OUT = 'sign-out';

function chatIdFor(url: string): string | null {
  const match = /^\/chats\/([a-z0-9-]+)/.exec(url.split(/[?#]/)[0]!);
  return match && match[1] !== 'new' ? match[1]! : null;
}

/** The frame around every page: the header bar, the side rail and the main region. */
@Component({
  selector: 'dn-shell',
  imports: [
    RouterOutlet,
    Button,
    ChatHistory,
    CommandMenu,
    HeaderBrand,
    HeaderNav,
    Notifications,
    SegmentedControl,
    SideNav,
    Toaster,
    IconDirective,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  protected readonly session = inject(Session);
  protected readonly theme = inject(ThemeService);
  protected readonly chats = inject(ChatsStore);
  readonly #projects = inject(ProjectsStore);
  protected readonly notifications = inject(NotificationsStore);

  protected readonly notificationCategories: NotificationCategory[] = [
    { id: 'approvals', label: 'Approvals' },
    { id: 'memos', label: 'Memos' },
    { id: 'updates', label: 'Updates' },
  ];
  protected readonly notificationItems = computed<NotificationItem[]>(() =>
    this.notifications.items().map((n) => ({
      id: n.id,
      title: n.title,
      ...(n.actor ? { actor: n.actor } : {}),
      ...(n.body ? { body: n.body } : {}),
      ...(n.context ? { context: n.context } : {}),
      time: n.time,
      read: n.read,
      category: n.category,
      ...(n.href ? { href: n.href } : {}),
      tone: n.category === 'approvals' ? ('warning' as const) : ('neutral' as const),
      dismissible: true,
    })),
  );

  // The bell's events carry their details as unknown through the Angular wrapper; these read what they need.
  protected onNotificationsOpen(event: CustomEvent<{ open: unknown }>): void {
    if (event.detail.open === true) this.notifications.feed.reload();
  }

  protected onNotificationRead(event: CustomEvent<{ ids: unknown; read: unknown }>): void {
    event.preventDefault();
    void this.notifications.markRead((event.detail.ids as string[]) ?? [], event.detail.read !== false);
  }

  protected onNotificationsAllRead(event: CustomEvent<{ ids: unknown }>): void {
    event.preventDefault();
    void this.notifications.markRead((event.detail.ids as string[]) ?? []);
  }

  protected onNotificationDismiss(event: CustomEvent<{ id: unknown }>): void {
    event.preventDefault();
    void this.notifications.dismiss(String(event.detail.id));
  }

  protected onNotificationOpen(event: CustomEvent<{ id: unknown; item: unknown }>): void {
    event.preventDefault();
    const id = String(event.detail.id);
    const href = this.notifications.items().find((n) => n.id === id)?.href;
    void this.notifications.markRead([id]);
    if (href) void this.#router.navigateByUrl(href);
  }

  constructor() {
    inject(DestroyRef).onDestroy(() => this.#searchSub.unsubscribe());
    this.#narrow?.addEventListener('change', (e) => this.narrow.set(e.matches));
    this.#compact?.addEventListener('change', (e) => this.compact.set(e.matches));
  }
  readonly #router = inject(Router);

  protected readonly brandIcon = brandMark();

  protected readonly modes: SegmentOption[] = [
    { value: 'assist', label: 'Assist', icon: icon('chat', 14) },
    { value: 'build', label: 'Build', icon: icon('grid', 14) },
  ];

  readonly #url = toSignal(
    this.#router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.#router.url },
  );
  protected readonly currentArea = computed(() => areaFor(this.#url()));
  /** Assist or Build, from the address: /build/… is Build. */
  protected readonly mode = computed<Mode>(() => modeFor(this.#url()));

  /** How many items each Build area holds, for the rail; loaded only in Build. */
  readonly #counts = httpResource<RegistryCounts>(() => (this.mode() === 'build' ? '/api/registry/counts' : undefined));

  protected readonly navItems = computed<SideNavItem[]>(() => {
    if (this.mode() === 'assist')
      return ASSIST_AREAS.map((a) => ({
        id: a.id,
        label: a.label,
        href: a.path,
        icon: icon(a.icon),
        section: 'Assist',
      }));
    const counts = this.#counts.hasValue() ? this.#counts.value() : undefined;
    return BUILD_AREAS.map((a) => ({
      id: a.id,
      label: a.label,
      href: a.path,
      icon: icon(a.icon),
      section: 'Build',
      ...(a.kind && counts ? { badge: counts[a.kind] } : {}),
    }));
  });

  /** Switching mode goes to the other mode's first area; the toggle then follows the address. */
  protected onMode(event: CustomEvent<SegmentValueChange>): void {
    event.preventDefault();
    void this.#router.navigateByUrl(event.detail.value === 'build' ? '/build/skills' : '/brief');
  }

  /** The open chat, from the URL, so the rail's list marks it. */
  protected readonly currentChat = toSignal(
    this.#router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => chatIdFor(e.urlAfterRedirects)),
    ),
    { initialValue: chatIdFor(this.#router.url) },
  );

  protected readonly conversations = computed<ChatConversation[]>(() =>
    this.chats.chats().map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt,
      pinned: c.pinned,
      folder: c.projectId,
    })),
  );
  /** The person's projects, as the list's folders: chats filed under one are grouped there, and can be moved. */
  protected readonly folders = computed<ChatFolder[]>(() =>
    this.#projects.mine().map((p) => ({ id: p.id, label: p.name })),
  );

  protected openChat(event: CustomEvent<{ value: string | null }>): void {
    event.preventDefault();
    if (event.detail.value) void this.#router.navigate(['/chats', event.detail.value]);
  }

  /** The list's own edits are applied through the API (and the store), not inside the element. */
  protected keepConversations(event: Event): void {
    event.preventDefault();
  }

  // tc-chat-history's Angular outputs type their details as unknown, so these read them as strings and booleans.
  protected onPin(event: CustomEvent<{ id: unknown; pinned: unknown }>): void {
    void this.chats.update(String(event.detail.id), { pinned: event.detail.pinned === true });
  }

  protected onRename(event: CustomEvent<{ id: unknown; title: unknown }>): void {
    void this.chats.update(String(event.detail.id), { title: String(event.detail.title) });
  }

  protected onDelete(event: CustomEvent<{ id: unknown }>): void {
    const id = String(event.detail.id);
    void this.chats.archive(id);
    if (this.currentChat() === id) void this.#router.navigateByUrl('/chats');
  }

  protected onMove(event: CustomEvent<{ id: unknown; folder: unknown }>): void {
    const folder = event.detail.folder;
    void this.chats.update(String(event.detail.id), { projectId: typeof folder === 'string' ? folder : null });
  }

  protected onRestore(event: CustomEvent<{ id: unknown }>): void {
    void this.chats.restore(String(event.detail.id));
  }

  /** Below 1024px (or zoomed in that far) the rail folds to icons, whatever the saved preference, so pages keep room. */
  readonly #narrow = typeof matchMedia === 'function' ? matchMedia('(max-width: 1024px)') : undefined;
  protected readonly narrow = signal(this.#narrow?.matches ?? false);
  protected readonly railCollapsed = computed(() => this.narrow() || !this.session.preferences().railExpanded);
  /** Phone-width windows and 400% zoom (WCAG 1.4.10 at 320px): New chat keeps its name but shows only its icon. */
  readonly #compact = typeof matchMedia === 'function' ? matchMedia('(max-width: 600px)') : undefined;
  protected readonly compact = signal(this.#compact?.matches ?? false);

  protected readonly user = computed(() => {
    const me = this.session.me.hasValue() ? this.session.me.value() : undefined;
    return { name: me?.name ?? '', email: me?.email ?? '' };
  });

  protected readonly accountItems: ProfileMenuItem[] = [{ id: SIGN_OUT, label: 'Sign out' }];

  protected readonly themeLabel = computed(() =>
    this.theme.resolved() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
  );
  protected readonly themeIconName = computed(() => (this.theme.resolved() === 'dark' ? 'sun' : 'moon'));

  readonly #http = inject(HttpClient);
  /** The search text, and what the API found for it. */
  protected readonly query = signal('');
  protected readonly found = signal<(SearchResults & { registry: RegistrySummary[] }) | null>(null);
  protected readonly searching = signal(false);
  readonly #queries = new Subject<string>();

  readonly #searchSub = this.#queries
    .pipe(
      debounceTime(200),
      switchMap((q) => {
        if (!q) return of(null);
        this.searching.set(true);
        // Assist's search and the Build registry, side by side; either failing leaves the other's results.
        return forkJoin({
          assist: this.#http.get<SearchResults>('/api/search', { params: { q } }).pipe(catchError(() => of(null))),
          registry: this.#http
            .get<RegistrySummary[]>('/api/registry', { params: { q } })
            .pipe(catchError(() => of([] as RegistrySummary[]))),
        }).pipe(
          map(({ assist, registry }) =>
            assist || registry.length
              ? { chats: [], artifacts: [], projects: [], ...assist, registry: registry.slice(0, 8) }
              : null,
          ),
        );
      }),
    )
    .subscribe((r) => {
      this.found.set(r);
      this.searching.set(false);
    });

  protected onQuery(event: CustomEvent<{ query: unknown }>): void {
    const q = String(event.detail.query ?? '').trim();
    this.query.set(q);
    this.#queries.next(q);
  }

  /** The commands for what's typed: matching places and actions, then chats, artifacts and projects from the API. */
  protected readonly searchGroups = computed<CommandMenuGroup[]>(() => {
    const q = this.query().toLowerCase();
    if (!q) return this.commands;
    const matches = (c: { label: string; keywords?: string }) =>
      `${c.label} ${c.keywords ?? ''}`.toLowerCase().includes(q);
    const local = this.commands
      .map((g) => ({ ...g, commands: g.commands.filter(matches) }))
      .filter((g) => g.commands.length);
    const r = this.found();
    const remote: CommandMenuGroup[] = r
      ? [
          {
            id: 'chats',
            label: 'Chats',
            commands: r.chats.map((c) => ({ id: `chat:${c.id}`, label: c.title, hint: c.detail, icon: icon('chat') })),
          },
          {
            id: 'artifacts',
            label: 'Artifacts',
            commands: r.artifacts.map((a) => ({
              id: `artifact:${a.id}`,
              label: a.title,
              hint: a.detail,
              icon: icon('artifact'),
            })),
          },
          {
            id: 'projects',
            label: 'Projects',
            commands: r.projects.map((p) => ({
              id: `project:${p.id}`,
              label: p.title,
              hint: p.detail,
              icon: icon('folder'),
            })),
          },
          {
            id: 'registry',
            label: 'Build',
            commands: r.registry.map((item) => {
              const area = buildAreaFor(item.kind);
              return {
                id: `build:${area.path}/${item.id}`,
                label: item.name,
                hint: `${area.label} · ${item.slug}`,
                icon: icon(area.icon),
              };
            }),
          },
        ].filter((g) => g.commands.length)
      : [];
    return [...local, ...remote];
  });

  protected readonly commands: CommandMenuGroup[] = [
    {
      id: 'go',
      label: 'Go to',
      commands: ASSIST_AREAS.map((a) => ({ id: `go:${a.path}`, label: a.label, icon: icon(a.icon) })),
    },
    {
      id: 'go-build',
      label: 'Go to Build',
      commands: BUILD_AREAS.map((a) => ({
        id: `go:${a.path}`,
        label: a.label,
        icon: icon(a.icon),
        keywords: 'build registry',
      })),
    },
    {
      id: 'actions',
      label: 'Actions',
      commands: [
        { id: 'new-chat', label: 'New chat', icon: icon('plus'), keywords: 'ask start conversation' },
        { id: 'theme', label: 'Toggle theme', icon: icon('moon'), keywords: 'dark light appearance' },
      ],
    },
  ];

  protected readonly runCommand: CommandMenuRun = async (id) => {
    if (id.startsWith('go:')) await this.#router.navigateByUrl(id.slice(3));
    else if (id.startsWith('build:')) await this.#router.navigateByUrl(id.slice(6));
    else if (id.startsWith('chat:')) await this.#router.navigate(['/chats', id.slice(5)]);
    else if (id.startsWith('artifact:')) await this.#router.navigate(['/artifacts', id.slice(9)]);
    else if (id.startsWith('project:')) await this.#router.navigate(['/projects', id.slice(8)]);
    else if (id === 'new-chat') await this.newChat();
    else if (id === 'theme') await this.toggleTheme();
  };

  /** With <base href="/">, "#main" would resolve to "/#main" and navigate; move focus to the main region instead. */
  protected skipToMain(event: MouseEvent): void {
    event.preventDefault();
    document.getElementById('main')?.focus();
  }

  protected async newChat(): Promise<void> {
    await this.#router.navigateByUrl('/chats/new');
  }

  protected async toggleTheme(): Promise<void> {
    await this.save(() => this.theme.toggle());
  }

  /** Plain clicks route in place; tc-side-nav leaves modifier and middle clicks to the browser. */
  protected onNavigate(event: CustomEvent<SideNavNavigate>): void {
    if (!event.detail.href) return;
    event.preventDefault();
    void this.#router.navigateByUrl(event.detail.href);
  }

  protected onBrandNavigate(event: CustomEvent<{ href: string }>): void {
    event.preventDefault();
    void this.#router.navigateByUrl(event.detail.href);
  }

  protected onRailCollapsed(event: CustomEvent<SideNavCollapsedChange>): void {
    // Folded for width, the button only changes it for now; the saved preference is for wide windows.
    if (this.narrow()) {
      event.preventDefault();
      this.narrow.set(event.detail.collapsed);
      return;
    }
    void this.save(() => this.session.updatePreferences({ railExpanded: !event.detail.collapsed }));
  }

  protected onAccountSelect(event: CustomEvent<HeaderNavAccountSelect>): void {
    if (event.detail.id === SIGN_OUT) this.session.signOut();
  }

  /** A preference change shows at once; if saving fails it's undone and the person is told. */
  private async save(change: () => Promise<void>): Promise<void> {
    try {
      await change();
    } catch {
      toast.error("Couldn't save that change", { description: 'Check your connection and try again.' });
    }
  }
}
