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
  assert.match(html, /const _patchConvoText = async \(gistId, convoJson\) =>/);
  assert.match(html, /const _pushConvoImages = async \(gistId, imageIds, localFs\) =>/);
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

test('auto-sync watcher covers conversation metadata alongside config sections', () => {
  // The debounced auto-sync callback must watch savedConversations and conversationGists
  assert.match(html, /geminiAPI\.savedConversations\.value/, 'savedConversations not watched for auto-sync');
  assert.match(html, /geminiAPI\.conversationGists\.value/, 'conversationGists not watched for auto-sync');
});

test('syncConversationNow polls convoSyncStatus with a bounded timeout', () => {
  const syncNowFn = html.match(/const syncConversationNow = async \(id\) => \{([\s\S]*?)\n\s*\};/);
  assert.ok(syncNowFn, 'syncConversationNow function not found');
  const body = syncNowFn[1];
  // Must have a polling loop with a deadline
  assert.match(body, /deadline/, 'missing deadline/timeout in polling loop');
  assert.match(body, /Promise\.race/, 'missing Promise.race for bounded await');
  assert.match(body, /convoSyncStatus\[id\] === 'pending'/, 'must poll until status leaves pending');
});

test('pull updates _lastPushedConvos and _lastPushedConvoGists to prevent redundant pushes', () => {
  // After merging remote conversations, pull must snapshot the merged state
  assert.match(html, /cfg\.jssync\._lastPushedConvos = JSON\.stringify\(gemini\.savedConversations\.value\)/,
    'pull must update _lastPushedConvos after merging remote conversations');
  assert.match(html, /cfg\.jssync\._lastPushedConvoGists = JSON\.stringify\(gemini\.conversationGists\.value\)/,
    'pull must update _lastPushedConvoGists after merging remote conversations');
});
