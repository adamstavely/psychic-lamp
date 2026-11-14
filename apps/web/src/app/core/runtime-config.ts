import { InjectionToken } from '@angular/core';

/** Settings that differ per deployment, read from /config.json before the app starts so one build runs anywhere. */
export interface RuntimeConfig {
  oidc: { authority: string; clientId: string };
}

export const RUNTIME_CONFIG = new InjectionToken<RuntimeConfig>('RUNTIME_CONFIG');

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  const res = await fetch('/config.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Couldn't load /config.json (${res.status})`);
  return (await res.json()) as RuntimeConfig;
}
