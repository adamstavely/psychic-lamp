import type { WorkflowNode } from '@donovan/contracts';
import { stagesOf } from './workflow-stages';

const step = (id: string, y = 0): WorkflowNode => ({ id, label: id, kind: 'Tool', sub: 'x', x: 0, y });

describe('workflow stages', () => {
  it('orders steps by what comes before them', () => {
    const stages = stagesOf(
      [step('c'), step('a'), step('b')],
      [
        ['a', 'b'],
        ['b', 'c'],
      ],
    );
    expect(stages.map((s) => s.map((n) => n.id))).toEqual([['a'], ['b'], ['c']]);
  });

  it('runs a loop together rather than never', () => {
    const stages = stagesOf(
      [step('a'), step('b')],
      [
        ['a', 'b'],
        ['b', 'a'],
      ],
    );
    expect(stages.map((s) => s.map((n) => n.id))).toEqual([['a', 'b']]);
  });

  it('ends on a stored graph with a repeated step id, counting the id once', () => {
    const stages = stagesOf([step('start'), step('dup', 1), step('dup', 2)], [['start', 'dup']]);
    expect(stages.map((s) => s.map((n) => [n.id, n.y]))).toEqual([[['start', 0]], [['dup', 1]]]);
  });
});
