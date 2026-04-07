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
  assert.match(html, /cfg\.jssync\._lastPushedConvos = _\.cloneDeep\(gemini\.savedConversations\.value\)/,
    'pull must update _lastPushedConvos after merging remote conversations');
  assert.match(html, /cfg\.jssync\._lastPushedConvoGists = _\.cloneDeep\(gemini\.conversationGists\.value\)/,
    'pull must update _lastPushedConvoGists after merging remote conversations');
});

test('sync uses last-write-wins timestamp strategy instead of three-way merge', () => {
  assert.match(html, /const _lwwPickWinner/, 'LWW helper function must be defined');
  assert.match(html, /remoteMeta\?\.\s*updatedAt/, 'LWW must compare updatedAt timestamps');
  // Pull must use LWW rather than conflict detection
  const pullFn = html.match(/const pull = async \(\) => \{([\s\S]*?)(?=\n\s*const push)/);
  assert.ok(pullFn, 'pull function not found');
  const pullBody = pullFn[1];
  assert.match(pullBody, /_lwwPickWinner/, 'pull must use _lwwPickWinner');
  assert.doesNotMatch(pullBody, /conflicts\.push/, 'pull must not build conflict arrays');
  assert.doesNotMatch(pullBody, /pendingConflict/, 'pull must not set pendingConflict');
});

test('conflict resolution modal is completely removed', () => {
  assert.doesNotMatch(html, /const ConflictResolutionModal\s*=/, 'ConflictResolutionModal component must be removed');
  assert.doesNotMatch(html, /conflict-resolution-modal/, 'conflict-resolution-modal tag must be removed from App template');
  assert.doesNotMatch(html, /resolveConflict/, 'resolveConflict function must be removed');
  assert.doesNotMatch(html, /pendingConflict/, 'pendingConflict ref must be removed');
  assert.doesNotMatch(html, /_CONFLICT_SECTIONS/, '_CONFLICT_SECTIONS must be removed');
});

test('useGitHubClient composable centralizes API header generation', () => {
  assert.match(html, /const useGitHubClient = createGlobalState/, 'useGitHubClient must be a global state composable');
  assert.match(html, /gistFetch/, 'useGitHubClient must expose gistFetch');
  assert.match(html, /makeAuthHttp/, 'useGitHubClient must expose makeAuthHttp');
  assert.match(html, /buildCorsProxy/, 'useGitHubClient must expose buildCorsProxy');
  // Old scattered header functions must be removed
  assert.doesNotMatch(html, /const _getGistHeaders/, 'scattered _getGistHeaders must be removed');
  assert.doesNotMatch(html, /const _getGitHubApiHeaders/, 'scattered _getGitHubApiHeaders must be removed');
});

test('useSyncQueue composable provides centralized background sync queue', () => {
  assert.match(html, /const useSyncQueue = createGlobalState/, 'useSyncQueue must be a global state composable');
  assert.match(html, /enqueue/, 'useSyncQueue must expose enqueue');
  // Queue must handle deduplication
  assert.match(html, /findIndex.*q\.key === key/, 'queue must deduplicate by key');
});

test('auto-sync debounce is reduced to 5 seconds', () => {
  assert.match(html, /useDebounceFn\(\(\) => \{[\s\S]*?queueSync[\s\S]*?\}, 5000\)/, 'auto-sync debounce must be 5000ms');
});

test('InlineEdit component is defined and registered', () => {
  assert.match(html, /const InlineEdit=\{/, 'InlineEdit component must be defined');
  assert.match(html, /InlineEdit/, 'InlineEdit must be in component registration');
  // Must handle Enter/Escape
  assert.match(html, /keydown\.enter\.prevent/, 'InlineEdit must handle Enter key');
  assert.match(html, /keydown\.escape\.prevent/, 'InlineEdit must handle Escape key');
});
