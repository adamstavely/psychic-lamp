import { Client } from '@elastic/elasticsearch';
import { Global, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { ChatSearch } from './chat-search.js';

@Global()
@Module({
  providers: [
    {
      provide: Client,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const apiKey = config.get('ELASTICSEARCH_API_KEY', { infer: true });
        const ca = config.get('ELASTICSEARCH_CA_PEM', { infer: true });
        return new Client({
          node: config.get('ELASTICSEARCH_URL', { infer: true }),
          ...(apiKey ? { auth: { apiKey } } : {}),
          ...(ca ? { tls: { ca, rejectUnauthorized: true } } : {}),
          requestTimeout: 10_000,
        });
      },
    },
    ChatSearch,
  ],
  exports: [Client, ChatSearch],
})
export class SearchModule implements OnApplicationShutdown {
  constructor(private readonly client: Client) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.close();
  }
}
