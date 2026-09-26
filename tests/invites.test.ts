import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInvite, inviteLink } from '../client/src/lib/invites';

test('browser-client invitations remain compatible with the desktop parser', () => {
  assert.equal(parseInvite('https://egvoice-web.pplx.app/#/invite/AbCd1234'), 'AbCd1234');
  assert.equal(inviteLink('AbCd1234', 'https://egvoice-web.pplx.app'), 'https://egvoice-web.pplx.app/#/invite/AbCd1234');
});
test('invites preserve case and accept code, public URL and old desktop URL', () => {
  for (const value of [' aB3d_-F9 ', 'https://egvoice.pplx.app/#/invite/aB3d_-F9', 'https://egvoice.ru/#/invite/aB3d_-F9', 'http://tauri.localhost/#/invite/aB3d_-F9', 'tauri://localhost/#/invite/aB3d_-F9']) {
    assert.equal(parseInvite(value), 'aB3d_-F9');
  }
});
test('malformed and foreign links never become navigation targets', () => {
  for (const value of ['', 'abc', '123456789', 'АБВГДЕЖЗ', 'javascript:alert(1)', 'https://evil.example/#/invite/aB3d_-F9', 'https://egvoice.ru@evil.example/#/invite/aB3d_-F9', 'https://egvoice.ru/#/invite/../../settings']) assert.equal(parseInvite(value), null);
});
test('share URLs never use native or API proxy origins', () => {
  assert.equal(inviteLink('aB3d_-F9', 'https://egvoice.pplx.app'), 'https://egvoice.pplx.app/#/invite/aB3d_-F9');
  assert.equal(inviteLink('aB3d_-F9', 'https://egvoice.ru'), 'https://egvoice.ru/#/invite/aB3d_-F9');
  assert.equal(inviteLink('aB3d_-F9', 'http://tauri.localhost'), null);
  assert.equal(inviteLink('aB3d_-F9', 'https://evil.example'), null);
});
