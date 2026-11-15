import { HttpClient, httpResource } from '@angular/common/http';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  inject,
  Injector,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Button } from '@adamstavely/trenchcoat/angular/button';
import { CodeBlock } from '@adamstavely/trenchcoat/angular/code-block';
import { SegmentedControl } from '@adamstavely/trenchcoat/angular/segmented-control';
import type { SegmentOption } from '@adamstavely/trenchcoat/segmented-control';
import { toast } from '@adamstavely/trenchcoat/toaster';
import type { InstallClient, RegistryInstall, RegistryItem, TryResult } from '@donovan/contracts';
import { INSTALL_CLIENTS } from '@donovan/contracts/defaults';
import { firstValueFrom } from 'rxjs';
import { chatStart } from './use-in-chat';

type Server = Extract<RegistryItem, { kind: 'server' }>;
type Tool = Server['details']['tools'][number];
type Tab = 'tools' | 'overview' | 'install';

/** An MCP server: its tools (each can be tried in a sandbox), what it is, and where you've installed it. */
@Component({
  selector: 'dn-server-detail',
  imports: [FormsModule, Button, CodeBlock, SegmentedControl],
  templateUrl: './server-detail.html',
  styleUrls: ['./detail.css', './server-detail.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServerDetail {
  readonly item = input.required<Server>();
  readonly #http = inject(HttpClient);
  readonly #injector = inject(Injector);

  protected readonly tab = signal<Tab>('tools');
  protected readonly tabs = computed<SegmentOption[]>(() => [
    { value: 'tools', label: `Tools · ${this.item().details.tools.length}`, controls: 'server-panel' },
    { value: 'overview', label: 'Overview', controls: 'server-panel' },
    { value: 'install', label: 'Install', controls: 'server-panel' },
  ]);
  protected pick(event: CustomEvent<{ value: unknown }>): void {
    this.tab.set(event.detail.value as Tab);
  }

  readonly #router = inject(Router);
  protected useInChat(): void {
    void this.#router.navigate(['/chats/new'], { queryParams: chatStart(this.item()) });
  }
  protected readonly needsSignIn = computed(() => !/^none\b/i.test(this.item().details.auth));
  protected readonly publisher = computed(() => this.item().slug.split('/')[0]);
  protected readonly cli = computed(
    () =>
      `donovan servers add ${this.item().slug}@${this.item().version}\ndonovan servers allow ${this.item().slug} --tools read_only`,
  );

  // Try a tool: a sandbox run against a mock.
  private readonly tryDialog = viewChild.required<ElementRef<HTMLDialogElement>>('tryDialog');
  protected readonly trying = signal<Tool | null>(null);
  protected args: Record<string, string> = {};
  protected readonly running = signal(false);
  protected readonly result = signal<TryResult | null>(null);
  protected readonly tryError = signal('');

  protected openTry(tool: Tool): void {
    this.trying.set(tool);
    this.args = Object.fromEntries(tool.params.map((p) => [p.name, '']));
    this.result.set(null);
    this.tryError.set('');
    // The form renders with the tool; open it then, so focus lands on the first field (or Run, with none).
    afterNextRender(
      () => {
        const dialog = this.tryDialog().nativeElement;
        dialog.showModal();
        dialog.querySelector<HTMLInputElement>('input')?.focus();
      },
      { injector: this.#injector },
    );
  }

  protected closeTry(): void {
    this.tryDialog().nativeElement.close();
  }

  protected async runTry(): Promise<void> {
    const tool = this.trying();
    if (!tool || this.running()) return;
    this.running.set(true);
    this.tryError.set('');
    try {
      const url = `/api/registry/server/${encodeURIComponent(this.item().id)}/tools/${encodeURIComponent(tool.name)}/try`;
      this.result.set(await firstValueFrom(this.#http.post<TryResult>(url, { args: this.args })));
    } catch (err) {
      this.result.set(null);
      this.tryError.set(
        (err as { error?: { message?: string } }).error?.message ?? "The sandbox didn't answer. Try again.",
      );
    } finally {
      this.running.set(false);
    }
  }

  // Install in a client: recorded per person.
  protected readonly clients = INSTALL_CLIENTS;
  protected readonly installs = httpResource<RegistryInstall[]>(
    () => `/api/registry/server/${encodeURIComponent(this.item().id)}/installs`,
  );
  protected readonly installedIn = computed(() =>
    (this.installs.hasValue() ? this.installs.value() : []).map((i) => i.client),
  );
  protected label(client: InstallClient): string {
    return INSTALL_CLIENTS.find((c) => c.id === client)!.label;
  }

  private readonly installDialog = viewChild.required<ElementRef<HTMLDialogElement>>('installDialog');
  protected client: InstallClient = 'donovan-chat';
  protected readonly installing = signal(false);
  protected readonly snippet = signal('');

  protected openInstall(): void {
    this.updateSnippet();
    this.installDialog().nativeElement.showModal();
  }

  protected closeInstall(): void {
    this.installDialog().nativeElement.close();
  }

  protected updateSnippet(): void {
    const s = this.item();
    const config = {
      mcpServers: {
        [s.id]: { transport: s.details.transport.toLowerCase(), url: `https://gateway.donovan.internal/${s.slug}` },
      },
    };
    this.snippet.set(JSON.stringify(config, null, 2));
  }

  protected async install(): Promise<void> {
    this.installing.set(true);
    try {
      const url = `/api/registry/server/${encodeURIComponent(this.item().id)}/installs`;
      this.installs.set(await firstValueFrom(this.#http.post<RegistryInstall[]>(url, { client: this.client })));
      toast.success(`Installed ${this.item().name}`, { description: `Added to ${this.label(this.client)}.` });
      this.closeInstall();
    } catch (err) {
      toast.error(`Couldn't install ${this.item().name}`, {
        description: (err as { error?: { message?: string } }).error?.message ?? 'Try again in a moment.',
      });
    } finally {
      this.installing.set(false);
    }
  }

  protected async uninstall(client: InstallClient): Promise<void> {
    try {
      const url = `/api/registry/server/${encodeURIComponent(this.item().id)}/installs/${client}`;
      this.installs.set(await firstValueFrom(this.#http.delete<RegistryInstall[]>(url)));
      toast.success(`Removed from ${this.label(client)}`);
    } catch {
      toast.error("Couldn't remove it", { description: 'Try again in a moment.' });
    }
  }
}
