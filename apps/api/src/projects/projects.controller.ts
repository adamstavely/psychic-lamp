import {
  AddSources,
  NewNote,
  NewProject,
  type Project,
  type ProjectAnswer,
  ProjectPatch,
  ProjectQuestion,
  type ProjectsOverview,
  type ProjectSummary,
  SourceSelection,
} from '@donovan/contracts';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { Claims } from '../auth/claims.decorator.js';
import type { Claims as TokenClaims } from '../auth/claims.js';
import { UsersService } from '../users/users.service.js';
import { ProjectsService } from './projects.service.js';

const ProjectId = z.string().regex(/^[a-z0-9-]{1,64}$/, 'Not a project id');
const SourceId = z.string().regex(/^s\d{1,3}$/, 'Not a source id');

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly users: UsersService,
  ) {}

  @Get()
  async overview(@Claims() claims: TokenClaims): Promise<ProjectsOverview> {
    return this.projects.overview(await this.users.idFor(claims));
  }

  @Post()
  async create(@Claims() claims: TokenClaims, @Body({ schema: NewProject }) body: NewProject): Promise<ProjectSummary> {
    return this.projects.create(await this.users.idFor(claims), body);
  }

  @Get(':id')
  async get(@Claims() claims: TokenClaims, @Param('id', { schema: ProjectId }) id: string): Promise<Project> {
    return this.projects.get(await this.users.idFor(claims), id);
  }

  @Patch(':id')
  async update(
    @Claims() claims: TokenClaims,
    @Param('id', { schema: ProjectId }) id: string,
    @Body({ schema: ProjectPatch }) body: ProjectPatch,
  ): Promise<ProjectSummary> {
    return this.projects.update(await this.users.idFor(claims), id, body);
  }

  @Put(':id/sources/:sourceId/selected')
  @HttpCode(204)
  async select(
    @Claims() claims: TokenClaims,
    @Param('id', { schema: ProjectId }) id: string,
    @Param('sourceId', { schema: SourceId }) sourceId: string,
    @Body({ schema: SourceSelection }) body: SourceSelection,
  ): Promise<void> {
    await this.projects.selectSource(await this.users.idFor(claims), id, sourceId, body.selected);
  }

  @Post(':id/sources')
  @HttpCode(204)
  async addSources(
    @Claims() claims: TokenClaims,
    @Param('id', { schema: ProjectId }) id: string,
    @Body({ schema: AddSources }) body: AddSources,
  ): Promise<void> {
    await this.projects.addSources(await this.users.idFor(claims), id, body);
  }

  @Post(':id/ask')
  @HttpCode(200)
  async ask(
    @Claims() claims: TokenClaims,
    @Param('id', { schema: ProjectId }) id: string,
    @Body({ schema: ProjectQuestion }) body: ProjectQuestion,
  ): Promise<ProjectAnswer> {
    return this.projects.ask(await this.users.idFor(claims), id, body);
  }

  @Post(':id/notes')
  @HttpCode(204)
  async addNote(
    @Claims() claims: TokenClaims,
    @Param('id', { schema: ProjectId }) id: string,
    @Body({ schema: NewNote }) body: NewNote,
  ): Promise<void> {
    await this.projects.addNote(await this.users.idFor(claims), id, body);
  }

  @Delete(':id/notes/:noteId')
  @HttpCode(204)
  async deleteNote(
    @Claims() claims: TokenClaims,
    @Param('id', { schema: ProjectId }) id: string,
    @Param('noteId', { schema: z.uuid() }) noteId: string,
  ): Promise<void> {
    await this.projects.deleteNote(await this.users.idFor(claims), id, noteId);
  }
}
