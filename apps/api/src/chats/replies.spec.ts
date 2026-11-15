import { pickReply, shapeReply } from './replies.js';

describe('shapeReply', () => {
  const prep = () => pickReply('What should I prep for the meeting?', 'auto');

  it('leaves a Balanced, workspace answer as it is', () => {
    expect(shapeReply(prep(), 'balanced', 'workspace')).toEqual(prep());
  });

  it('answers Training only without tools, servers or documents, and says so', () => {
    const shaped = shapeReply(prep(), 'balanced', 'training');
    expect(shaped.blocks.some((b) => b.type === 'tool')).toBe(false);
    expect(shaped.routing.every((r) => r.kind === 'model' || r.kind === 'skill')).toBe(true);
    expect(shaped.blocks[0]).toMatchObject({ type: 'text', text: expect.stringMatching(/^Training only:/) });
  });

  it('adds a live web search for Live, beside the workspace tools', () => {
    const shaped = shapeReply(prep(), 'balanced', 'live');
    const tools = shaped.blocks.filter((b) => b.type === 'tool').map((b) => b.type === 'tool' && b.name);
    expect(tools).toEqual(['web_search', 'list_events', 'search_mail']);
    expect(shaped.routing).toContainEqual({ kind: 'server', name: 'Web search' });
  });

  it('opens with how a persona approaches it, and Red Cell closes with its strongest objection', () => {
    const red = shapeReply(prep(), 'red-cell', 'workspace');
    expect(red.blocks[0]).toEqual({ type: 'text', text: 'Red Cell: arguing against the obvious reading.' });
    expect(red.blocks.at(-1)).toMatchObject({ type: 'text', text: expect.stringMatching(/^Strongest objection:/) });
    const historian = shapeReply(prep(), 'historian', 'workspace');
    expect(historian.blocks[0]).toMatchObject({ text: expect.stringMatching(/^Historian:/) });
    expect(historian.blocks.at(-1)).toEqual(prep().blocks.at(-1));
  });
});
