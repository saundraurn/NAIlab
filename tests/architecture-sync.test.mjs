import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

test('config jssync has config gist only (no convo sync flags)', () => {
  const jssyncBlock = html.match(/jssync:\s*\{([\s\S]*?)\},\s*_syncMeta:/);
  assert.ok(jssyncBlock, 'jssync config block not found');
  const body = jssyncBlock[1];
  assert.match(body, /gistId:''/);
  assert.match(body, /proxyUrl:''/);
  assert.match(body, /autoSync:true/);
  assert.doesNotMatch(body, /gitProxyUrl/);
  assert.doesNotMatch(body, /syncConversations/);
});

test('conversation metadata moved out of config and into dedicated local storage keys', () => {
  assert.match(html, /const savedConversations = useLocalStorage\('nai-saved-conversations', \[\]\);/);
  assert.match(html, /const conversationGists = useLocalStorage\('nai-conversation-gists', \{\}\);/);
  assert.doesNotMatch(html, /savedConversations:\s*\[\]/);
});

test('per-conversation gist sync primitives are present', () => {
  assert.match(html, /const createConversationGist = async \(id\) =>/);
  assert.match(html, /const _syncConversationToItsGist = async \(id\) =>/);
  assert.match(html, /const syncConversationNow = async \(id\) =>/);
  assert.match(html, /const deleteConversationGist = async \(id\) =>/);
});

test('config sync path no longer syncs conversations directly', () => {
  const syncNowMatch = html.match(/const syncNow = async \(\) => \{([\s\S]*?)\n\s*\};/);
  assert.ok(syncNowMatch, 'syncNow function not found');
  const body = syncNowMatch[1];
  assert.match(body, /await pull\(\);/);
  assert.match(body, /await push\(true\);/);
  assert.doesNotMatch(body, /syncAllConversationsNow\(/);
  assert.doesNotMatch(body, /syncConversationNow\(/);
});
