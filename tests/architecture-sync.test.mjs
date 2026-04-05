import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('/home/runner/work/NAIlab/NAIlab/index.html', 'utf8');

test('config jssync has config gist only (no convo sync flags)', () => {
  assert.match(html, /jssync:\s*\{gistId:'',\s*proxyUrl:'',\s*autoSync:true/);
  assert.doesNotMatch(html, /jssync:\s*\{[^}]*gitProxyUrl/);
  assert.doesNotMatch(html, /jssync:\s*\{[^}]*syncConversations/);
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
