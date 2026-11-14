import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
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
import type { ChatConversation } from '@adamstavely/trenchcoat/chat-history';
import type { CommandMenuGroup, CommandMenuRun } from '@adamstavely/trenchcoat/command-menu';
import type { HeaderNavAccountSelect } from '@adamstavely/trenchcoat/header-nav';
import type { ProfileMenuItem } from '@adamstavely/trenchcoat/profile-menu';
import type { SegmentOption } from '@adamstavely/trenchcoat/segmented-control';
import type { SideNavCollapsedChange, SideNavItem, SideNavNavigate } from '@adamstavely/trenchcoat/side-nav';
import { toast } from '@adamstavely/trenchcoat/toaster';
import { filter, map } from 'rxjs';
import { IconDirective } from '../core/icon.directive';
import { ChatsStore } from '../core/chats-store';
import { brandMark, icon } from '../core/icons';
import { Session } from '../core/session';
import { ThemeService } from '../core/theme';
import { areaFor, ASSIST_AREAS } from './areas';

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
  readonly #router = inject(Router);

  protected readonly brandIcon = brandMark();

  protected readonly modes: SegmentOption[] = [
    { value: 'assist', label: 'Assist', icon: icon('chat', 14) },
    // Build mode is a later slice: shown so the product's shape is clear, but it can't be picked yet.
    { value: 'build', label: 'Build', icon: icon('grid', 14), disabled: true, ariaLabel: 'Build, coming soon' },
  ];

  protected readonly navItems: SideNavItem[] = ASSIST_AREAS.map((a) => ({
    id: a.id,
    label: a.label,
    href: a.path,
    icon: icon(a.icon),
    section: 'Assist',
  }));

  protected readonly currentArea = toSignal(
    this.#router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => areaFor(e.urlAfterRedirects)),
    ),
    { initialValue: areaFor(this.#router.url) },
  );

  /** The open chat, from the URL, so the rail's list marks it. */
  protected readonly currentChat = toSignal(
    this.#router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => chatIdFor(e.urlAfterRedirects)),
    ),
    { initialValue: chatIdFor(this.#router.url) },
  );

  protected readonly conversations = computed<ChatConversation[]>(() =>
    this.chats.chats().map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, pinned: c.pinned })),
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

  protected onRestore(event: CustomEvent<{ id: unknown }>): void {
    void this.chats.restore(String(event.detail.id));
  }

  protected readonly railCollapsed = computed(() => !this.session.preferences().railExpanded);

  protected readonly user = computed(() => {
    const me = this.session.me.hasValue() ? this.session.me.value() : undefined;
    return { name: me?.name ?? '', email: me?.email ?? '' };
  });

  protected readonly accountItems: ProfileMenuItem[] = [{ id: SIGN_OUT, label: 'Sign out' }];

  protected readonly themeLabel = computed(() =>
    this.theme.resolved() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
  );
  protected readonly themeIconName = computed(() => (this.theme.resolved() === 'dark' ? 'sun' : 'moon'));

  protected readonly commands: CommandMenuGroup[] = [
    {
      id: 'go',
      label: 'Go to',
      commands: ASSIST_AREAS.map((a) => ({ id: `go:${a.path}`, label: a.label, icon: icon(a.icon) })),
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
