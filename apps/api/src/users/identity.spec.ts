import { identityFrom, initialsOf } from './identity.js';

describe('identityFrom', () => {
  it('uses the name claim and the given name', () => {
    expect(identityFrom({ sub: 's', name: 'Alex Morgan', given_name: 'Alex', email: 'a@x.test' })).toEqual({
      subject: 's',
      name: 'Alex Morgan',
      firstName: 'Alex',
      email: 'a@x.test',
    });
  });

  it('falls back to given and family names, then the username', () => {
    expect(identityFrom({ sub: 's', given_name: 'Mara', family_name: 'Lindqvist' }).name).toBe('Mara Lindqvist');
    expect(identityFrom({ sub: 's', preferred_username: 'devon' })).toMatchObject({
      name: 'devon',
      firstName: 'devon',
    });
  });
});

describe('initialsOf', () => {
  it('takes the first and last word', () => {
    expect(initialsOf('Mara Anna Lindqvist')).toBe('ML');
    expect(initialsOf('alex')).toBe('A');
  });
});
