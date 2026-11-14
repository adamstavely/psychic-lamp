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
      useFactory: (config: ConfigService<Env, true>) =>
        new Client({ node: config.get('ELASTICSEARCH_URL', { infer: true }) }),
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
