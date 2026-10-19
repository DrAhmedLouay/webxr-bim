// ---------------------------------------------------------------------------
// model-store.js — shared model store between the desktop platform and the
// standalone AR page (same origin, so IndexedDB is shared).
// ---------------------------------------------------------------------------
// The platform (index.html) and the AR page (ar.html) run on the same origin
// (https://<host>/webxr-bim/). IndexedDB is therefore a common rendezvous:
// the platform stores the raw bytes of the imported model, and the AR page
// reads them back by key through the deep link:
//
//   ar.html?modelKey=bim-model-current&anchor=bim-4a95b400&storey=3
//
// Scope note: IndexedDB is per browser profile, so this bridge moves a model
// between the two pages of the SAME device. For a different device the model
// must be reachable over http(s) (the ?model=<url> parameter) — the exported
// .glb from the platform works for that.
// ---------------------------------------------------------------------------
(function (global) {
    'use strict';

    var DB_NAME = 'webxr-bim-store';
    var DB_VERSION = 1;
    var STORE = 'models';
    var CURRENT_KEY = 'bim-model-current';

    function openDb() {
        return new Promise(function (resolve, reject) {
            if (!global.indexedDB) {
                reject(new Error('IndexedDB غير متوفر في هذا المتصفح'));
                return;
            }
            var request = global.indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = function () {
                var db = request.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    db.createObjectStore(STORE, { keyPath: 'key' });
                }
            };
            request.onsuccess = function () { resolve(request.result); };
            request.onerror = function () {
                reject(request.error || new Error('تعذّر فتح قاعدة بيانات IndexedDB'));
            };
        });
    }

    function withStore(mode, fn) {
        return openDb().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(STORE, mode);
                var store = tx.objectStore(STORE);
                var result;
                try { result = fn(store); } catch (err) { reject(err); return; }
                tx.oncomplete = function () { db.close(); resolve(result && result.__req ? result.__req.result : result); };
                tx.onerror = function () { db.close(); reject(tx.error || new Error('فشلت عملية IndexedDB')); };
                tx.onabort = function () { db.close(); reject(tx.error || new Error('أُلغيت عملية IndexedDB')); };
            });
        });
    }

    function fileToArrayBuffer(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.onerror = function () { reject(reader.error || new Error('تعذّرت قراءة الملف')); };
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Stores a model file so the AR page (or a later session) can load it.
     * @param {File|Blob} file
     * @param {string} key
     * @param {Object} meta extra metadata (e.g. { name, type })
     * @returns {Promise<string>} the storage key
     */
    function save(file, key, meta) {
        if (!file) return Promise.reject(new Error('لا يوجد ملف'));
        var storageKey = key || CURRENT_KEY;
        return fileToArrayBuffer(file).then(function (buffer) {
            var record = {
                key: storageKey,
                name: (meta && meta.name) || file.name || 'model',
                type: (meta && meta.type) || file.type || 'application/octet-stream',
                size: buffer.byteLength,
                bytes: buffer,
                savedAt: new Date().toISOString()
            };
            return withStore('readwrite', function (store) {
                store.put(record);
                return record;
            }).then(function () { lastName = record.name; return storageKey; });
        });
    }

    /**
     * Loads a previously stored model.
     * @param {string} key
     * @returns {Promise<Object|null>} the record (name, type, bytes) or null
     */
    function load(key) {
        var storageKey = key || CURRENT_KEY;
        return withStore('readonly', function (store) {
            var req = store.get(storageKey);
            return { __req: req };
        }).then(function (record) {
            if (record) lastName = record.name;
            return record || null;
        }).catch(function () { return null; });
    }

    function remove(key) {
        var storageKey = key || CURRENT_KEY;
        return withStore('readwrite', function (store) {
            store.delete(storageKey);
            return storageKey;
        });
    }

    function list() {
        return withStore('readonly', function (store) {
            var req = store.getAll();
            return { __req: req };
        }).then(function (items) {
            return (items || []).map(function (i) {
                return { key: i.key, name: i.name, type: i.type, size: i.size, savedAt: i.savedAt };
            });
        }).catch(function () { return []; });
    }

    /**
     * Builds the deep link that opens the AR page with a given model.
     * @param {Object} options { modelKey, anchor, storey, baseUrl }
     * @returns {string}
     */
    function buildArLink(options) {
        options = options || {};
        var base = options.baseUrl || (global.location ? global.location.href.split('?')[0].split('#')[0] : '');
        var page = base.replace(/[^/]*$/, 'ar.html');
        var params = [];
        if (options.modelKey) params.push('modelKey=' + encodeURIComponent(options.modelKey));
        if (options.anchor) params.push('anchor=' + encodeURIComponent(options.anchor));
        if (options.storey) params.push('storey=' + encodeURIComponent(options.storey));
        return page + (params.length ? '?' + params.join('&') : '');
    }

    // ---------------------------------------------------------------------
    // Hosted model URLs — Google Drive aware
    // ---------------------------------------------------------------------
    // A Google Drive *share* link returns an HTML viewer page, never the
    // model bytes. Only the direct-download endpoints serve the file, and
    // only some of them allow cross-origin reads. We therefore expand any
    // Drive link into an ordered list of candidate download URLs and let the
    // caller try them until one yields the actual binary.
    /**
     * Parses a GitHub URL into its parts.
     * Accepts raw.githubusercontent.com, github.com/.../blob/... and
     * github.com/.../raw/... so a link copied from the GitHub UI still works.
     * @returns {Object|null} { owner, repo, ref, path }
     */
    function parseGitHubUrl(url) {
        var value = String(url || '').trim();
        var patterns = [
            /raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/,
            /github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/,
            /github\.com\/([^/]+)\/([^/]+)\/raw\/([^/]+)\/(.+)$/,
            /github\.com\/([^/]+)\/([^/]+)\/raw\/(.+)$/,
            /api\.github\.com\/repos\/([^/]+)\/([^/]+)\/contents\/(.+?)(?:\?.*)?$/
        ];
        for (var i = 0; i < patterns.length; i++) {
            var m = value.match(patterns[i]);
            if (m) {
                return {
                    owner: m[1],
                    repo: m[2],
                    ref: m[3] && m[3].indexOf('/') === -1 ? m[3] : 'main',
                    path: m[4] || m[3]
                };
            }
        }
        return null;
    }

    /** Decodes a URI component without throwing on malformed input. */
    function safeDecode(value) {
        try { return decodeURIComponent(String(value)); } catch (e) { return String(value); }
    }

    /** Normalises a repository path: decoded once, then re-encoded per segment. */
    function normalizeRepoPath(path) {
        return String(path || '').split('/').filter(function (seg) { return seg.length; })
            .map(function (seg) { return encodeURIComponent(safeDecode(seg)); })
            .join('/');
    }

    function isGitHubUrl(url) {
        return !!parseGitHubUrl(url);
    }

    function driveFileId(url) {
        var patterns = [
            /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
            /drive\.google\.com\/uc\?[^#]*id=([a-zA-Z0-9_-]+)/,
            /drive\.google\.com\/open\?[^#]*id=([a-zA-Z0-9_-]+)/,
            /drive\.google\.com\/drive\/folders\//,
            /docs\.google\.com\/uc\?[^#]*id=([a-zA-Z0-9_-]+)/,
            /drive\.usercontent\.google\.com\/download\?[^#]*id=([a-zA-Z0-9_-]+)/
        ];
        for (var i = 0; i < patterns.length; i++) {
            var m = String(url).match(patterns[i]);
            if (m && m[1]) return m[1];
        }
        return null;
    }

    /**
     * Expands a model URL into an ordered list of downloadable candidates.
     * @param {string} url
     * @returns {string[]}
     */
    function normalizeModelUrl(url) {
        var value = String(url || '').trim();
        if (!value) return [];
        var id = driveFileId(value);
        if (!id) {
            // A GitHub link copied from the UI (blob/raw) is converted to the
            // raw endpoint, which is the one that allows cross-origin reads.
            var gh = parseGitHubUrl(value);
            if (gh) {
                return ['https://raw.githubusercontent.com/' + gh.owner + '/' + gh.repo + '/' +
                    gh.ref + '/' + normalizeRepoPath(gh.path)];
            }
            // Not a Drive or GitHub link: try the value as-is (absolute or repo-relative)
            return [value];
        }
        return [
            'https://drive.usercontent.google.com/download?id=' + encodeURIComponent(id) + '&export=download',
            'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(id),
            'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?alt=media'
        ];
    }

    function isGoogleDriveUrl(url) {
        return !!driveFileId(url);
    }

    var lastName = '';
    function getLastName() { return lastName; }

    global.ModelStore = {
        CURRENT_KEY: CURRENT_KEY,
        getLastName: getLastName,
        save: save,
        load: load,
        remove: remove,
        list: list,
        buildArLink: buildArLink,
        normalizeModelUrl: normalizeModelUrl,
        isGoogleDriveUrl: isGoogleDriveUrl,
        parseGitHubUrl: parseGitHubUrl,
        isGitHubUrl: isGitHubUrl,
        normalizeRepoPath: normalizeRepoPath,
        safeDecode: safeDecode,
        driveFileId: driveFileId
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = global.ModelStore;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
