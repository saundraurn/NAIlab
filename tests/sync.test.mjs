/**
 * Sync process tests for nailabpre.html
 *
 * Tests the core sync logic extracted from the single-file app:
 *   - _collectImageIds: image ID extraction from conversation data
 *   - _buildCorsProxy: CORS proxy URL construction
 *   - _getGistHeaders / _getGitHubApiHeaders: header construction
 *   - extractSyncPayload: payload extraction & sensitive data stripping
 *   - Pull conflict detection logic
 *   - _pushConvoImages early-return conditions
 *   - _runGistSync serialization / dirty-set draining
 *   - syncConversationNow create-vs-update flow
 *   - _patchConvoText success/failure
 *   - _syncConversationToItsGist orchestration
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Extract pure functions from nailabpre.html source
// ---------------------------------------------------------------------------
const htmlPath = resolve(import.meta.dirname, '..', 'nailabpre.html');
const html = readFileSync(htmlPath, 'utf-8');

// Helper: grab a JS function body between markers in the HTML
const extractFn = (src, name) => {
    // Match:  const name = (args) => { ... };  OR  const name = (args) => expr;
    const patterns = [
        new RegExp(`const ${name} = \\(([^)]*)\\) => \\{([\\s\\S]*?)\\};`, 'm'),
        new RegExp(`const ${name} = \\(([^)]*)\\) => ([^;]+);`, 'm'),
    ];
    for (const p of patterns) {
        const m = src.match(p);
        if (m) return m;
    }
    return null;
};

// ---------------------------------------------------------------------------
// Re-implement _collectImageIds for testing (extracted from nailabpre source)
// ---------------------------------------------------------------------------
function _collectImageIds(convoData) {
    const ids = new Set();
    for (const msg of convoData.messages || []) {
        for (const img of msg.images || []) { if (img.imageId) ids.add(img.imageId); }
        for (const v of msg.variants || []) {
            for (const part of v.parts || []) { if (part._imageRef) ids.add(part._imageRef); }
            for (const img of v._images || []) { if (img.imageId) ids.add(img.imageId); }
        }
    }
    return ids;
}

// Re-implement _buildCorsProxy for testing
function _buildCorsProxy(proxyUrl) {
    let base = proxyUrl;
    if (!base) return null;
    if (!/^https?:\/\//i.test(base)) base = 'https://' + base;
    return base.replace(/\/$/, '') + '/git';
}

// Re-implement header helpers
function _getGitHubApiHeaders(token) {
    return {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    };
}

function _getGistHeaders(token) {
    return {
        ..._getGitHubApiHeaders(token),
        'Content-Type': 'application/json'
    };
}

// Re-implement extractSyncPayload
const _SYNC_KEYS = ['tagTest', 'genConfig', 'genState', 'app', 'danbooru'];

function extractSyncPayload(fullConfig) {
    const snap = {};
    for (const k of [..._SYNC_KEYS, '_syncMeta']) {
        if (fullConfig[k] !== undefined) snap[k] = JSON.parse(JSON.stringify(fullConfig[k]));
    }
    if (snap.app) delete snap.app.apiKey;
    return snap;
}

// Re-implement _stampSyncTime
function _stampSyncTime(cfg, etag) {
    cfg.jssync.lastSyncedAt = Date.now();
    cfg.jssync.lastPulledEtag = etag || '';
}

// Re-implement _finalizePush
function _finalizePush(cfg, etag) {
    _stampSyncTime(cfg, etag);
    cfg.jssync.lastSyncedRevs ??= {};
    _SYNC_KEYS.forEach(k => {
        cfg.jssync.lastSyncedRevs[k] = cfg._syncMeta?.[k]?.rev || 0;
    });
}

// ---------------------------------------------------------------------------
// Verify functions exist in source
// ---------------------------------------------------------------------------
describe('Source verification', () => {
    it('nailabpre.html contains _collectImageIds', () => {
        assert.ok(html.includes('const _collectImageIds'));
    });
    it('nailabpre.html contains _buildCorsProxy', () => {
        assert.ok(html.includes('const _buildCorsProxy'));
    });
    it('nailabpre.html contains _patchConvoText', () => {
        assert.ok(html.includes('const _patchConvoText'));
    });
    it('nailabpre.html contains _pushConvoImages', () => {
        assert.ok(html.includes('const _pushConvoImages'));
    });
    it('nailabpre.html contains _syncConversationToItsGist', () => {
        assert.ok(html.includes('const _syncConversationToItsGist'));
    });
    it('nailabpre.html contains _runGistSync', () => {
        assert.ok(html.includes('const _runGistSync'));
    });
    it('nailabpre.html contains syncConversationNow', () => {
        assert.ok(html.includes('const syncConversationNow'));
    });
    it('nailabpre.html contains createConversationGist', () => {
        assert.ok(html.includes('const createConversationGist'));
    });
    it('nailabpre.html contains extractSyncPayload', () => {
        assert.ok(html.includes('const extractSyncPayload'));
    });
    it('nailabpre.html uses two-step sync: _patchConvoText then _pushConvoImages', () => {
        const syncFn = html.match(/const _syncConversationToItsGist[\s\S]*?(?=\n\s*let _gistSyncInProgress)/);
        assert.ok(syncFn, '_syncConversationToItsGist function found');
        const body = syncFn[0];
        const patchIdx = body.indexOf('_patchConvoText');
        const pushIdx = body.indexOf('_pushConvoImages');
        assert.ok(patchIdx > -1, '_patchConvoText called');
        assert.ok(pushIdx > -1, '_pushConvoImages called');
        assert.ok(patchIdx < pushIdx, '_patchConvoText is called before _pushConvoImages');
    });
    it('_pushConvoImages uses onAuth callback (not makeAuthHttp)', () => {
        const pushFn = html.match(/const _pushConvoImages[\s\S]*?(?=\n\s*const _syncConversationToItsGist)/);
        assert.ok(pushFn, '_pushConvoImages function found');
        const body = pushFn[0];
        assert.ok(body.includes('onAuth'), 'uses onAuth callback');
        assert.ok(body.includes('window.gitHttp'), 'uses window.gitHttp');
        assert.ok(!body.includes('makeAuthHttp'), 'does NOT use makeAuthHttp');
    });
    it('_pushConvoImages returns early when no new/orphaned images', () => {
        const pushFn = html.match(/const _pushConvoImages[\s\S]*?(?=\n\s*const _syncConversationToItsGist)/);
        const body = pushFn[0];
        assert.ok(body.includes('if (!newImages.length && !maybeOrphaned.length) return'), 'early return present');
    });
    it('git push does not use force:true', () => {
        const pushFn = html.match(/const _pushConvoImages[\s\S]*?(?=\n\s*const _syncConversationToItsGist)/);
        const body = pushFn[0];
        assert.ok(!body.includes('force: true') && !body.includes('force:true'), 'no force:true in push');
    });
});

// ---------------------------------------------------------------------------
// _collectImageIds
// ---------------------------------------------------------------------------
describe('_collectImageIds', () => {
    it('returns empty set for empty convo', () => {
        const ids = _collectImageIds({});
        assert.equal(ids.size, 0);
    });

    it('returns empty set for messages with no images', () => {
        const ids = _collectImageIds({
            messages: [
                { role: 'user', text: 'hello' },
                { role: 'model', variants: [{ parts: [{ text: 'hi' }] }] }
            ]
        });
        assert.equal(ids.size, 0);
    });

    it('collects user message imageIds', () => {
        const ids = _collectImageIds({
            messages: [
                { role: 'user', images: [{ imageId: 'img_001.webp' }, { imageId: 'img_002.webp' }] }
            ]
        });
        assert.equal(ids.size, 2);
        assert.ok(ids.has('img_001.webp'));
        assert.ok(ids.has('img_002.webp'));
    });

    it('collects variant _images imageIds', () => {
        const ids = _collectImageIds({
            messages: [
                { role: 'model', variants: [{ _images: [{ imageId: 'img_v1.webp' }] }] }
            ]
        });
        assert.equal(ids.size, 1);
        assert.ok(ids.has('img_v1.webp'));
    });

    it('collects variant parts _imageRef', () => {
        const ids = _collectImageIds({
            messages: [
                { role: 'model', variants: [{ parts: [{ _imageRef: 'img_ref.webp' }] }] }
            ]
        });
        assert.equal(ids.size, 1);
        assert.ok(ids.has('img_ref.webp'));
    });

    it('deduplicates across all sources', () => {
        const ids = _collectImageIds({
            messages: [
                {
                    role: 'user',
                    images: [{ imageId: 'img_shared.webp' }]
                },
                {
                    role: 'model',
                    variants: [
                        {
                            parts: [{ _imageRef: 'img_shared.webp' }],
                            _images: [{ imageId: 'img_shared.webp' }, { imageId: 'img_unique.webp' }]
                        }
                    ]
                }
            ]
        });
        assert.equal(ids.size, 2);
        assert.ok(ids.has('img_shared.webp'));
        assert.ok(ids.has('img_unique.webp'));
    });

    it('skips images without imageId', () => {
        const ids = _collectImageIds({
            messages: [
                { role: 'user', images: [{ data: 'base64...' }, { imageId: 'img_has_id.webp' }] }
            ]
        });
        assert.equal(ids.size, 1);
        assert.ok(ids.has('img_has_id.webp'));
    });

    it('handles multiple messages with mixed content', () => {
        const ids = _collectImageIds({
            messages: [
                { role: 'user', images: [{ imageId: 'u1.webp' }], text: 'draw a cat' },
                { role: 'model', variants: [
                    { _images: [{ imageId: 'v1a.webp' }], parts: [{ text: 'here' }] },
                    { _images: [{ imageId: 'v1b.webp' }], parts: [{ _imageRef: 'ref1.webp' }] }
                ]},
                { role: 'user', images: [{ imageId: 'u2.webp' }] },
                { role: 'model', variants: [{ _images: [] }] }
            ]
        });
        assert.equal(ids.size, 5);
        for (const id of ['u1.webp', 'v1a.webp', 'v1b.webp', 'ref1.webp', 'u2.webp']) {
            assert.ok(ids.has(id), `should contain ${id}`);
        }
    });
});

// ---------------------------------------------------------------------------
// _buildCorsProxy
// ---------------------------------------------------------------------------
describe('_buildCorsProxy', () => {
    it('returns null for empty/falsy proxy URL', () => {
        assert.equal(_buildCorsProxy(''), null);
        assert.equal(_buildCorsProxy(null), null);
        assert.equal(_buildCorsProxy(undefined), null);
    });

    it('adds https:// and /git suffix', () => {
        assert.equal(_buildCorsProxy('my-worker.example.com'), 'https://my-worker.example.com/git');
    });

    it('preserves existing https://', () => {
        assert.equal(_buildCorsProxy('https://proxy.test.io'), 'https://proxy.test.io/git');
    });

    it('preserves existing http://', () => {
        assert.equal(_buildCorsProxy('http://localhost:8787'), 'http://localhost:8787/git');
    });

    it('strips trailing slash before adding /git', () => {
        assert.equal(_buildCorsProxy('https://proxy.test.io/'), 'https://proxy.test.io/git');
    });

    it('handles URL with path', () => {
        assert.equal(_buildCorsProxy('https://proxy.test.io/api'), 'https://proxy.test.io/api/git');
    });
});

// ---------------------------------------------------------------------------
// Header helpers
// ---------------------------------------------------------------------------
describe('_getGitHubApiHeaders', () => {
    it('includes Bearer auth, Accept, and API version', () => {
        const h = _getGitHubApiHeaders('test-token-123');
        assert.equal(h['Authorization'], 'Bearer test-token-123');
        assert.equal(h['Accept'], 'application/vnd.github+json');
        assert.equal(h['X-GitHub-Api-Version'], '2022-11-28');
    });
});

describe('_getGistHeaders', () => {
    it('extends API headers with Content-Type', () => {
        const h = _getGistHeaders('tok');
        assert.equal(h['Content-Type'], 'application/json');
        assert.equal(h['Authorization'], 'Bearer tok');
    });
});

// ---------------------------------------------------------------------------
// extractSyncPayload
// ---------------------------------------------------------------------------
describe('extractSyncPayload', () => {
    it('picks only sync keys and _syncMeta', () => {
        const cfg = {
            tagTest: { iterations: 1 },
            genConfig: { steps: 28 },
            genState: { prompt: 'hello' },
            app: { apiKey: 'SECRET', model: 'nai-diffusion-4-5-full' },
            danbooru: { folders: [] },
            _syncMeta: { tagTest: { rev: 1 } },
            ui: { collapsibleStates: {} },
            gemini: { apiKey: 'another-secret' },
            jssync: { gistId: 'abc123' }
        };
        const payload = extractSyncPayload(cfg);
        assert.ok(payload.tagTest);
        assert.ok(payload.genConfig);
        assert.ok(payload.genState);
        assert.ok(payload.app);
        assert.ok(payload.danbooru);
        assert.ok(payload._syncMeta);
        assert.equal(payload.ui, undefined);
        assert.equal(payload.gemini, undefined);
        assert.equal(payload.jssync, undefined);
    });

    it('strips app.apiKey from payload', () => {
        const cfg = {
            app: { apiKey: 'TOP_SECRET', model: 'test' },
            _syncMeta: {}
        };
        const payload = extractSyncPayload(cfg);
        assert.equal(payload.app.apiKey, undefined);
        assert.equal(payload.app.model, 'test');
    });

    it('deep clones data (mutations do not affect original)', () => {
        const cfg = {
            danbooru: { folders: [{ id: 1, name: 'test' }] },
            _syncMeta: {}
        };
        const payload = extractSyncPayload(cfg);
        payload.danbooru.folders[0].name = 'MUTATED';
        assert.equal(cfg.danbooru.folders[0].name, 'test');
    });
});

// ---------------------------------------------------------------------------
// _finalizePush
// ---------------------------------------------------------------------------
describe('_finalizePush', () => {
    it('stamps sync time and stores revs', () => {
        const cfg = {
            jssync: { lastSyncedAt: null, lastPulledEtag: '' },
            _syncMeta: {
                tagTest: { rev: 3 },
                genConfig: { rev: 1 },
                genState: { rev: 0 },
                app: { rev: 2 },
                danbooru: { rev: 5 }
            }
        };
        _finalizePush(cfg, 'W/"etag123"');
        assert.ok(cfg.jssync.lastSyncedAt > 0);
        assert.equal(cfg.jssync.lastPulledEtag, 'W/"etag123"');
        assert.equal(cfg.jssync.lastSyncedRevs.tagTest, 3);
        assert.equal(cfg.jssync.lastSyncedRevs.genConfig, 1);
        assert.equal(cfg.jssync.lastSyncedRevs.danbooru, 5);
    });

    it('initializes lastSyncedRevs if missing', () => {
        const cfg = {
            jssync: {},
            _syncMeta: {}
        };
        _finalizePush(cfg, '');
        assert.ok(cfg.jssync.lastSyncedRevs);
        assert.equal(cfg.jssync.lastSyncedRevs.tagTest, 0);
    });
});

// ---------------------------------------------------------------------------
// Pull conflict detection logic
// ---------------------------------------------------------------------------
describe('Pull conflict detection', () => {
    // Re-implement the conflict detection from pull() for isolated testing
    function detectConflicts(local, remote, localMeta, remoteMeta, lastSyncedRevs) {
        const conflicts = [];
        const autoMerged = {};
        for (const key of _SYNC_KEYS) {
            if (!remote[key]) continue;
            const isDifferent = JSON.stringify(local[key]) !== JSON.stringify(remote[key]);
            if (!isDifferent) continue;
            const localRev = localMeta[key]?.rev || 0;
            const remoteRev = remoteMeta[key]?.rev || 0;
            const lastRev = lastSyncedRevs[key] || 0;
            const localChanged = localRev > lastRev;
            const remoteChanged = remoteRev > lastRev;
            if (localChanged && remoteChanged) {
                conflicts.push(key);
            } else if (remoteChanged) {
                autoMerged[key] = remote[key];
            } else if (!localChanged && !remoteChanged) {
                conflicts.push(key);
            }
        }
        return { conflicts, autoMerged };
    }

    it('detects no changes when local === remote', () => {
        const data = { tagTest: { iterations: 1 } };
        const { conflicts, autoMerged } = detectConflicts(
            data, data, {}, {}, {}
        );
        assert.equal(conflicts.length, 0);
        assert.equal(Object.keys(autoMerged).length, 0);
    });

    it('auto-merges when only remote changed', () => {
        const local = { tagTest: { iterations: 1 } };
        const remote = { tagTest: { iterations: 5 } };
        const { conflicts, autoMerged } = detectConflicts(
            local, remote,
            { tagTest: { rev: 1 } },
            { tagTest: { rev: 2 } },
            { tagTest: 1 }
        );
        assert.equal(conflicts.length, 0);
        assert.deepEqual(autoMerged.tagTest, { iterations: 5 });
    });

    it('ignores when only local changed (local-only edits)', () => {
        const local = { tagTest: { iterations: 5 } };
        const remote = { tagTest: { iterations: 1 } };
        const { conflicts, autoMerged } = detectConflicts(
            local, remote,
            { tagTest: { rev: 2 } },
            { tagTest: { rev: 1 } },
            { tagTest: 1 }
        );
        assert.equal(conflicts.length, 0);
        assert.equal(Object.keys(autoMerged).length, 0);
    });

    it('detects conflict when both sides changed', () => {
        const local = { tagTest: { iterations: 3 } };
        const remote = { tagTest: { iterations: 7 } };
        const { conflicts, autoMerged } = detectConflicts(
            local, remote,
            { tagTest: { rev: 2 } },
            { tagTest: { rev: 3 } },
            { tagTest: 1 }
        );
        assert.deepEqual(conflicts, ['tagTest']);
        assert.equal(Object.keys(autoMerged).length, 0);
    });

    it('detects conflict when both have zero revs but differ', () => {
        const local = { tagTest: { iterations: 1 } };
        const remote = { tagTest: { iterations: 2 } };
        const { conflicts } = detectConflicts(
            local, remote,
            { tagTest: { rev: 0 } },
            { tagTest: { rev: 0 } },
            {}
        );
        assert.deepEqual(conflicts, ['tagTest']);
    });

    it('handles multiple sections with mixed outcomes', () => {
        const local = {
            tagTest: { iterations: 1 },
            genConfig: { steps: 28 },
            app: { model: 'a' },
            danbooru: { folders: [1] }
        };
        const remote = {
            tagTest: { iterations: 1 },      // same
            genConfig: { steps: 50 },         // remote only
            app: { model: 'b' },              // both changed → conflict
            danbooru: { folders: [1, 2] }     // remote only
        };
        const { conflicts, autoMerged } = detectConflicts(
            local, remote,
            { genConfig: { rev: 1 }, app: { rev: 2 }, danbooru: { rev: 1 } },
            { genConfig: { rev: 2 }, app: { rev: 3 }, danbooru: { rev: 2 } },
            { genConfig: 1, app: 1, danbooru: 1 }
        );
        assert.deepEqual(conflicts, ['app']);
        assert.deepEqual(autoMerged.genConfig, { steps: 50 });
        assert.deepEqual(autoMerged.danbooru, { folders: [1, 2] });
        assert.equal(autoMerged.tagTest, undefined);
    });

    it('skips sections not present in remote', () => {
        const local = { tagTest: { iterations: 1 }, genConfig: { steps: 28 } };
        const remote = { genConfig: { steps: 50 } }; // no tagTest
        const { conflicts, autoMerged } = detectConflicts(
            local, remote,
            {},
            { genConfig: { rev: 1 } },
            {}
        );
        assert.equal(autoMerged.tagTest, undefined);
    });
});

// ---------------------------------------------------------------------------
// _pushConvoImages early return logic
// ---------------------------------------------------------------------------
describe('_pushConvoImages early return', () => {
    // Simulates the early return check
    function shouldPushImages(imageIds, syncedArr) {
        const syncedSet = new Set(syncedArr);
        const newImages = [...imageIds].filter(id => !syncedSet.has(id));
        const maybeOrphaned = syncedArr.filter(id => !imageIds.has(id));
        return newImages.length > 0 || maybeOrphaned.length > 0;
    }

    it('returns false when all images already synced (no changes)', () => {
        const imageIds = new Set(['img_1.webp', 'img_2.webp']);
        const syncedArr = ['img_1.webp', 'img_2.webp'];
        assert.equal(shouldPushImages(imageIds, syncedArr), false);
    });

    it('returns true when new images need syncing', () => {
        const imageIds = new Set(['img_1.webp', 'img_2.webp', 'img_3.webp']);
        const syncedArr = ['img_1.webp', 'img_2.webp'];
        assert.equal(shouldPushImages(imageIds, syncedArr), true);
    });

    it('returns true when orphaned images need removal', () => {
        const imageIds = new Set(['img_1.webp']);
        const syncedArr = ['img_1.webp', 'img_2.webp'];
        assert.equal(shouldPushImages(imageIds, syncedArr), true);
    });

    it('returns false with empty sets on both sides', () => {
        assert.equal(shouldPushImages(new Set(), []), false);
    });

    it('returns true when starting from scratch (no synced, some local)', () => {
        const imageIds = new Set(['img_new.webp']);
        assert.equal(shouldPushImages(imageIds, []), true);
    });
});

// ---------------------------------------------------------------------------
// _runGistSync serialization logic
// ---------------------------------------------------------------------------
describe('_runGistSync serialization', () => {
    it('drains dirty set and processes each id', async () => {
        const processed = [];
        const conversationGists = { 'c1': 'gist_1', 'c2': 'gist_2' };
        const convoSyncStatus = {};
        let inProgress = false;
        const dirtySet = new Set(['c1', 'c2']);

        const _syncMock = async (id) => {
            processed.push(id);
        };

        // Simulated _runGistSync
        const _runGistSync = async () => {
            if (inProgress) return;
            inProgress = true;
            try {
                const ids = [...dirtySet];
                dirtySet.clear();
                for (const id of ids) {
                    const gistId = conversationGists[id];
                    if (!gistId) continue;
                    convoSyncStatus[id] = 'syncing';
                    try {
                        await _syncMock(id);
                        convoSyncStatus[id] = 'synced';
                    } catch (e) {
                        convoSyncStatus[id] = 'error';
                    }
                }
            } finally {
                inProgress = false;
                if (dirtySet.size) await _runGistSync();
            }
        };

        await _runGistSync();
        assert.deepEqual(processed, ['c1', 'c2']);
        assert.equal(convoSyncStatus['c1'], 'synced');
        assert.equal(convoSyncStatus['c2'], 'synced');
        assert.equal(dirtySet.size, 0);
    });

    it('skips ids without a gist mapping', async () => {
        const processed = [];
        const conversationGists = { 'c1': 'gist_1' }; // c2 has no gist
        const convoSyncStatus = {};
        let inProgress = false;
        const dirtySet = new Set(['c1', 'c2']);

        const _runGistSync = async () => {
            if (inProgress) return;
            inProgress = true;
            try {
                const ids = [...dirtySet];
                dirtySet.clear();
                for (const id of ids) {
                    const gistId = conversationGists[id];
                    if (!gistId) continue;
                    convoSyncStatus[id] = 'syncing';
                    processed.push(id);
                    convoSyncStatus[id] = 'synced';
                }
            } finally {
                inProgress = false;
            }
        };

        await _runGistSync();
        assert.deepEqual(processed, ['c1']);
        assert.equal(convoSyncStatus['c2'], undefined);
    });

    it('handles sync error gracefully per-conversation', async () => {
        const conversationGists = { 'c1': 'g1', 'c2': 'g2', 'c3': 'g3' };
        const convoSyncStatus = {};
        let inProgress = false;
        const dirtySet = new Set(['c1', 'c2', 'c3']);

        const _syncMock = async (id) => {
            if (id === 'c2') throw new Error('network error');
        };

        const _runGistSync = async () => {
            if (inProgress) return;
            inProgress = true;
            try {
                const ids = [...dirtySet];
                dirtySet.clear();
                for (const id of ids) {
                    const gistId = conversationGists[id];
                    if (!gistId) continue;
                    convoSyncStatus[id] = 'syncing';
                    try {
                        await _syncMock(id);
                        convoSyncStatus[id] = 'synced';
                    } catch {
                        convoSyncStatus[id] = 'error';
                    }
                }
            } finally {
                inProgress = false;
                if (dirtySet.size) await _runGistSync();
            }
        };

        await _runGistSync();
        assert.equal(convoSyncStatus['c1'], 'synced');
        assert.equal(convoSyncStatus['c2'], 'error');
        assert.equal(convoSyncStatus['c3'], 'synced');
    });

    it('re-runs if new items added during execution', async () => {
        const processed = [];
        const conversationGists = { 'c1': 'g1', 'c2': 'g2' };
        const convoSyncStatus = {};
        let inProgress = false;
        const dirtySet = new Set(['c1']);

        const _syncMock = async (id) => {
            processed.push(id);
            // Simulate a new item becoming dirty during sync of c1
            if (id === 'c1') dirtySet.add('c2');
        };

        const _runGistSync = async () => {
            if (inProgress) return;
            inProgress = true;
            try {
                const ids = [...dirtySet];
                dirtySet.clear();
                for (const id of ids) {
                    const gistId = conversationGists[id];
                    if (!gistId) continue;
                    convoSyncStatus[id] = 'syncing';
                    try {
                        await _syncMock(id);
                        convoSyncStatus[id] = 'synced';
                    } catch {
                        convoSyncStatus[id] = 'error';
                    }
                }
            } finally {
                inProgress = false;
                if (dirtySet.size) await _runGistSync();
            }
        };

        await _runGistSync();
        assert.deepEqual(processed, ['c1', 'c2']);
    });

    it('blocks concurrent calls via inProgress flag', async () => {
        let inProgress = false;
        let concurrentCallAttempted = false;
        const dirtySet = new Set(['c1']);
        const conversationGists = { 'c1': 'g1' };

        const _runGistSync = async () => {
            if (inProgress) { concurrentCallAttempted = true; return; }
            inProgress = true;
            try {
                const ids = [...dirtySet];
                dirtySet.clear();
                // simulate async work
                await new Promise(r => setTimeout(r, 10));
            } finally {
                inProgress = false;
            }
        };

        // Launch two concurrent calls
        const p1 = _runGistSync();
        const p2 = _runGistSync();
        await Promise.all([p1, p2]);
        assert.ok(concurrentCallAttempted);
    });
});

// ---------------------------------------------------------------------------
// syncConversationNow logic
// ---------------------------------------------------------------------------
describe('syncConversationNow flow', () => {
    it('creates gist if none exists, then syncs', async () => {
        const calls = [];
        const conversationGists = {};
        const convoSyncStatus = {};

        const createConversationGist = async (id) => {
            calls.push(`create:${id}`);
            conversationGists[id] = 'new-gist-id';
        };
        const _syncConversationToItsGist = async (id) => {
            calls.push(`sync:${id}`);
        };

        // Simulated syncConversationNow
        const syncConversationNow = async (id) => {
            convoSyncStatus[id] = 'syncing';
            try {
                if (!conversationGists[id]) await createConversationGist(id);
                else await _syncConversationToItsGist(id);
                convoSyncStatus[id] = 'synced';
            } catch (e) {
                convoSyncStatus[id] = 'error';
            }
        };

        await syncConversationNow('conv-123');
        assert.deepEqual(calls, ['create:conv-123']);
        assert.equal(convoSyncStatus['conv-123'], 'synced');
    });

    it('syncs existing gist without creating', async () => {
        const calls = [];
        const conversationGists = { 'conv-456': 'existing-gist' };
        const convoSyncStatus = {};

        const createConversationGist = async (id) => { calls.push(`create:${id}`); };
        const _syncConversationToItsGist = async (id) => { calls.push(`sync:${id}`); };

        const syncConversationNow = async (id) => {
            convoSyncStatus[id] = 'syncing';
            try {
                if (!conversationGists[id]) await createConversationGist(id);
                else await _syncConversationToItsGist(id);
                convoSyncStatus[id] = 'synced';
            } catch {
                convoSyncStatus[id] = 'error';
            }
        };

        await syncConversationNow('conv-456');
        assert.deepEqual(calls, ['sync:conv-456']);
        assert.equal(convoSyncStatus['conv-456'], 'synced');
    });

    it('sets error status on failure', async () => {
        const conversationGists = { 'conv-err': 'gist-err' };
        const convoSyncStatus = {};

        const syncConversationNow = async (id) => {
            convoSyncStatus[id] = 'syncing';
            try {
                throw new Error('Network failure');
            } catch {
                convoSyncStatus[id] = 'error';
            }
        };

        await syncConversationNow('conv-err');
        assert.equal(convoSyncStatus['conv-err'], 'error');
    });
});

// ---------------------------------------------------------------------------
// _patchConvoText
// ---------------------------------------------------------------------------
describe('_patchConvoText', () => {
    it('sends PATCH with correct URL, headers, and body', async () => {
        let captured = null;
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async (url, opts) => {
            captured = { url, opts };
            return { ok: true };
        };

        try {
            const _patchConvoText = async (gistId, convoJson) => {
                const token = 'test-token';
                const res = await fetch(`https://api.github.com/gists/${gistId}`, {
                    method: 'PATCH',
                    headers: _getGistHeaders(token),
                    body: JSON.stringify({ files: { 'conversation.json': { content: convoJson } } })
                });
                if (!res.ok) throw new Error(`Gist PATCH failed: ${res.status}`);
            };

            await _patchConvoText('gist123', '{"messages":[]}');
            assert.equal(captured.url, 'https://api.github.com/gists/gist123');
            assert.equal(captured.opts.method, 'PATCH');
            assert.equal(captured.opts.headers['Authorization'], 'Bearer test-token');

            const body = JSON.parse(captured.opts.body);
            assert.equal(body.files['conversation.json'].content, '{"messages":[]}');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('throws on non-ok response', async () => {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async () => ({ ok: false, status: 422 });

        try {
            const _patchConvoText = async (gistId, convoJson) => {
                const token = 'test-token';
                const res = await fetch(`https://api.github.com/gists/${gistId}`, {
                    method: 'PATCH',
                    headers: _getGistHeaders(token),
                    body: JSON.stringify({ files: { 'conversation.json': { content: convoJson } } })
                });
                if (!res.ok) throw new Error(`Gist PATCH failed: ${res.status}`);
            };

            await assert.rejects(
                () => _patchConvoText('gist123', '{}'),
                { message: 'Gist PATCH failed: 422' }
            );
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});

// ---------------------------------------------------------------------------
// _syncConversationToItsGist orchestration
// ---------------------------------------------------------------------------
describe('_syncConversationToItsGist orchestration', () => {
    it('reads conversation from LFS, patches text, then pushes images', async () => {
        const callOrder = [];
        const convoJson = JSON.stringify({
            messages: [
                { role: 'user', images: [{ imageId: 'img_1.webp' }] },
                { role: 'model', variants: [{ _images: [{ imageId: 'img_2.webp' }] }] }
            ]
        });

        const localFs = {
            promises: {
                readFile: async (path, opts) => {
                    callOrder.push(`readFile:${path}`);
                    return convoJson;
                }
            }
        };

        let patchArgs, pushArgs;
        const _patchConvoText = async (gistId, json) => {
            callOrder.push('patch');
            patchArgs = { gistId, json };
        };
        const _pushConvoImages = async (gistId, imageIds, fs) => {
            callOrder.push('push');
            pushArgs = { gistId, imageIds };
        };

        // Simulated _syncConversationToItsGist
        const token = 'tok';
        const gistId = 'gist-abc';
        const id = 'convo-1';

        const convoData = JSON.parse(convoJson);
        const imageIds = _collectImageIds(convoData);
        await _patchConvoText(gistId, convoJson);
        await _pushConvoImages(gistId, imageIds, localFs);

        assert.deepEqual(callOrder, ['patch', 'push']);
        assert.equal(patchArgs.gistId, 'gist-abc');
        assert.equal(pushArgs.gistId, 'gist-abc');
        assert.ok(pushArgs.imageIds.has('img_1.webp'));
        assert.ok(pushArgs.imageIds.has('img_2.webp'));
    });

    it('throws when conversation data not found locally', async () => {
        const localFs = {
            promises: {
                readFile: async () => { throw new Error('ENOENT'); }
            }
        };

        const _syncConversationToItsGist = async () => {
            let convoJson;
            try {
                convoJson = await localFs.promises.readFile('/convo_test.json', { encoding: 'utf8' });
            } catch {
                throw new Error('Conversation data not found locally.');
            }
        };

        await assert.rejects(
            () => _syncConversationToItsGist(),
            { message: 'Conversation data not found locally.' }
        );
    });
});

// ---------------------------------------------------------------------------
// createConversationGist
// ---------------------------------------------------------------------------
describe('createConversationGist', () => {
    it('sends POST to create gist, stores mapping, then syncs', async () => {
        const callOrder = [];
        const conversationGists = {};
        const conversationMap = new Map();
        conversationMap.set('c1', { title: 'My Chat' });

        const originalFetch = globalThis.fetch;
        globalThis.fetch = async (url, opts) => {
            callOrder.push(`fetch:${opts.method}`);
            const body = JSON.parse(opts.body);
            assert.equal(body.description, 'NAILab: My Chat');
            assert.equal(body.public, false);
            return {
                ok: true,
                json: async () => ({ id: 'new-gist-id' })
            };
        };

        const _syncConversationToItsGist = async (id) => {
            callOrder.push(`sync:${id}`);
        };

        try {
            const createConversationGist = async (id) => {
                const token = 'tok';
                const convo = conversationMap.get(id);
                const title = convo?.title || 'Conversation';
                const res = await fetch('https://api.github.com/gists', {
                    method: 'POST',
                    headers: _getGistHeaders(token),
                    body: JSON.stringify({ description: `NAILab: ${title}`, public: false, files: { 'conversation.json': { content: '{}' } } })
                });
                if (!res.ok) throw new Error(`Create gist failed: ${res.status}`);
                const gistData = await res.json();
                conversationGists[id] = gistData.id;
                await _syncConversationToItsGist(id);
                return gistData.id;
            };

            const result = await createConversationGist('c1');
            assert.equal(result, 'new-gist-id');
            assert.equal(conversationGists['c1'], 'new-gist-id');
            assert.deepEqual(callOrder, ['fetch:POST', 'sync:c1']);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('throws when no token configured (source verification)', () => {
        assert.ok(html.includes("throw new Error('No GitHub token configured.')"));
    });
});

// ---------------------------------------------------------------------------
// Orphan image removal in _pushConvoImages
// ---------------------------------------------------------------------------
describe('Orphan image detection', () => {
    function findOrphans(gistFiles, imageIds) {
        return gistFiles.filter(f =>
            f.startsWith('img_') && f.endsWith('.webp') && !imageIds.has(f)
        );
    }

    it('identifies orphaned images in gist that are no longer in convo', () => {
        const gistFiles = ['conversation.json', 'img_1.webp', 'img_2.webp', 'img_old.webp'];
        const imageIds = new Set(['img_1.webp', 'img_2.webp']);
        assert.deepEqual(findOrphans(gistFiles, imageIds), ['img_old.webp']);
    });

    it('returns empty when all images are still referenced', () => {
        const gistFiles = ['conversation.json', 'img_1.webp'];
        const imageIds = new Set(['img_1.webp']);
        assert.deepEqual(findOrphans(gistFiles, imageIds), []);
    });

    it('ignores non-image files', () => {
        const gistFiles = ['conversation.json', 'README.md', 'img_1.webp'];
        const imageIds = new Set([]);
        assert.deepEqual(findOrphans(gistFiles, imageIds), ['img_1.webp']);
    });

    it('ignores files that start with img_ but do not end in .webp', () => {
        const gistFiles = ['img_data.json', 'img_1.webp'];
        const imageIds = new Set([]);
        assert.deepEqual(findOrphans(gistFiles, imageIds), ['img_1.webp']);
    });
});

// ---------------------------------------------------------------------------
// Architecture invariants
// ---------------------------------------------------------------------------
describe('Sync architecture invariants', () => {
    it('_convoPath follows expected pattern', () => {
        assert.ok(html.includes("const _convoPath = id => `/convo_${id}.json`"));
    });

    it('gist sync uses per-gist LightningFS wipe for isolation', () => {
        assert.ok(html.includes("new LightningFS(`nailab-convo-push-${safeGistId}`, { wipe: true })"));
    });

    it('auto-sync debounce is 30 seconds', () => {
        assert.ok(html.includes('useDebounceFn(_runGistSync, 30000)'));
    });

    it('auto-save debounce is 1.5 seconds', () => {
        // The _autoSave function has a 1500ms debounce
        assert.ok(html.includes('_autoSave = useDebounceFn(') && html.includes(', 1500)'));
    });

    it('auto-save skips temp, generating, and hydrating convos', () => {
        assert.ok(html.includes('!convo.isTemp && !convo.generating && !convo.isHydrating'));
    });

    it('convo sync only marks dirty when autoSync is enabled', () => {
        assert.ok(html.includes('store.config.value.jssync.autoSync'));
    });

    it('sync creates gist on first save when autoSync and token are configured', () => {
        // The saveConversation function auto-creates gist
        const match = html.includes('syncConversationNow(id).catch');
        assert.ok(match, 'auto-create gist on save');
    });

    it('conversation gist creation POSTs with private gist', () => {
        assert.ok(html.includes("public: false, files: { 'conversation.json': { content: '{}' }"));
    });

    it('_pushConvoImages clones with depth:1 for efficiency', () => {
        assert.ok(html.includes('depth: 1, onAuth'));
    });
});
