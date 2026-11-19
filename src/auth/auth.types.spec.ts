import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { authUserFromClaims, hasRole, isUuid } from './auth.types';

const USER_ID = '00000000-0000-4000-a000-000000000010';

describe('access-token claims', () => {
  it('reads the user id and roles', () => {
    assert.deepEqual(authUserFromClaims({ sub: USER_ID, roles: ['PLAYER', 'REFEREE'] }), { id: USER_ID, roles: ['PLAYER', 'REFEREE'] });
  });

  it('normalises the id to lower case', () => {
    assert.equal(authUserFromClaims({ sub: USER_ID.toUpperCase(), roles: [] })?.id, USER_ID);
  });

  it('drops roles it does not know instead of trusting them', () => {
    assert.deepEqual(authUserFromClaims({ sub: USER_ID, roles: ['ADMIN', 'SUPERUSER', 42] })?.roles, ['ADMIN']);
    assert.deepEqual(authUserFromClaims({ sub: USER_ID, roles: 'ADMIN' })?.roles, []);
    assert.deepEqual(authUserFromClaims({ sub: USER_ID })?.roles, []);
  });

  it('rejects a token without a usable subject', () => {
    assert.equal(authUserFromClaims({ sub: 'not-a-uuid', roles: ['ADMIN'] }), null);
    assert.equal(authUserFromClaims({ roles: ['ADMIN'] }), null);
    assert.equal(authUserFromClaims('a string payload'), null);
    assert.equal(authUserFromClaims(null), null);
  });

  it('checks roles', () => {
    const user = { id: USER_ID, roles: ['REFEREE' as const] };
    assert.equal(hasRole(user, 'REFEREE', 'ADMIN'), true);
    assert.equal(hasRole(user, 'ADMIN'), false);
  });

  it('recognises uuids', () => {
    assert.equal(isUuid(USER_ID), true);
    assert.equal(isUuid(`${USER_ID} `), false);
    assert.equal(isUuid(`${USER_ID}'; DROP TABLE users; --`), false);
    assert.equal(isUuid(123), false);
  });
});
