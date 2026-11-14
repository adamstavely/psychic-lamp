import type { ChatDictationSession } from '@adamstavely/trenchcoat/chat-composer';

interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

/**
 * The composer's mic, on the browser's own speech recognition. Where there is none it says so, rather than letting the
 * composer play its sample transcript into a real message.
 */
export function dictate(session: ChatDictationSession): Promise<void> {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return Promise.reject(new Error("Dictation isn't available in this browser."));

  return new Promise<void>((resolve, reject) => {
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = document.documentElement.lang || navigator.language;
    r.onresult = (e) => {
      const text = Array.from(e.results, (alt) => alt[0]?.transcript ?? '').join('');
      session.onTranscript(text);
    };
    r.onerror = (e) =>
      reject(new Error(e.error === 'not-allowed' ? 'Allow the microphone to dictate.' : 'Dictation stopped.'));
    r.onend = () => resolve();
    session.signal.addEventListener('abort', () => r.stop(), { once: true });
    r.start();
  });
}
