import { detailsFor } from './registration.js';

describe('detailsFor', () => {
  it("dates a dataset's update to the day it was registered, not a phrase that goes stale", () => {
    const details = detailsFor({
      kind: 'dataset',
      name: 'Orders',
      summary: 'Orders by day.',
      team: null,
      sensitivity: 'Internal',
      access: { readOnly: true, approval: true, internalOnly: false, audit: true },
      format: 'Parquet',
      rows: '',
      splits: '',
      source: 's3://orders',
    } as Parameters<typeof detailsFor>[0]);
    expect(details).toMatchObject({ updated: expect.stringMatching(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/) });
  });
});
