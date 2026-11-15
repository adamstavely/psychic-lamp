import type { SensitivityLabel } from '@adamstavely/trenchcoat/sensitivity-label-picker';

/** The tiers, lowest first, with who each one is for: the chat's label picker and Register's governance step. */
export const SENSITIVITIES: SensitivityLabel[] = [
  { id: 'Public', label: 'Public', description: 'Anyone, inside or outside the company', level: 0 },
  { id: 'Internal', label: 'Internal', description: 'Everyone in the workspace', level: 1 },
  { id: 'Confidential', label: 'Confidential', description: 'Named teams; write tools need approval', level: 2 },
  { id: 'Restricted', label: 'Restricted', description: 'Named people; every tool call is reviewed', level: 3 },
];
