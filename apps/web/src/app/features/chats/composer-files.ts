import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import type { ContextTrayItem, ContextTrayItemsChange } from '@adamstavely/trenchcoat/context-tray';
import { toast } from '@adamstavely/trenchcoat/toaster';
import type { ArtifactSummary, Attachment } from '@donovan/contracts';
import { firstValueFrom } from 'rxjs';
import { UPLOAD_LIMIT_BYTES } from '@donovan/contracts/defaults';

/** What the composer's + accepts: what an artifact upload accepts. */
const ACCEPT = '.md,.markdown,.txt,.csv,.json';
/** As many as a message may carry (SendMessage.attachments). */
const MAX_FILES = 10;

/**
 * The files on a composer, before they're sent. The + picks them; each is uploaded as an artifact at once, so it's in
 * Artifacts even if the message is never sent, and shows above the message as a chip that can be removed.
 */
@Injectable()
export class ComposerFiles {
  readonly #http = inject(HttpClient);

  readonly files = signal<Attachment[]>([]);
  /** Every file attached since the last send, so an undone removal can bring one back. */
  readonly #known = new Map<string, Attachment>();
  readonly uploading = signal(false);
  readonly ids = computed(() => this.files().map((f) => f.artifactId));
  /** The chips, for the composer's context tray; none while there are no files, so the tray isn't shown empty. */
  readonly context = computed<ContextTrayItem[] | undefined>(() =>
    this.files().length
      ? this.files().map((f) => ({ id: f.artifactId, label: f.name, tokens: f.tokens, kind: 'file' }))
      : undefined,
  );

  /** Opens the file picker, then uploads what was picked. */
  pick(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = ACCEPT;
    input.addEventListener('change', () => void this.add([...(input.files ?? [])]), { once: true });
    input.click();
  }

  async add(picked: File[]): Promise<void> {
    const room = MAX_FILES - this.files().length;
    if (picked.length > room)
      toast.error(`A message can carry ${MAX_FILES} files`, { description: 'Send these first.' });
    this.uploading.set(true);
    try {
      for (const file of picked.slice(0, Math.max(room, 0))) await this.#upload(file);
    } finally {
      this.uploading.set(false);
    }
  }

  async #upload(file: File): Promise<void> {
    if (file.size > UPLOAD_LIMIT_BYTES) {
      toast.error(`${file.name} is too big`, { description: 'Files can be up to 512 KB.' });
      return;
    }
    try {
      const content = await file.text();
      const saved = await firstValueFrom(
        this.#http.post<ArtifactSummary>('/api/artifacts', { name: file.name, content }),
      );
      // A rough guess from the text, for the chip; the API counts the stored artifact once it's sent.
      const attached = { artifactId: saved.id, name: saved.name, tokens: Math.round(content.length / 4) };
      this.#known.set(attached.artifactId, attached);
      this.files.update((list) => [...list, attached]);
    } catch (err) {
      const message = (err as { error?: { message?: string } }).error?.message;
      toast.error(`Couldn't attach ${file.name}`, { description: message ?? 'Try again in a moment.' });
    }
  }

  /** The tray's remove (and its undo), which bubbles up from the composer: the files become the list it's given. */
  onChange(event: Event): void {
    event.preventDefault();
    const { items } = (event as CustomEvent<ContextTrayItemsChange>).detail;
    this.files.set(items.flatMap((i) => this.#known.get(i.id) ?? []));
  }

  clear(): void {
    this.files.set([]);
    this.#known.clear();
  }
}
