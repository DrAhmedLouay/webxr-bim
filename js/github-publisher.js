// ---------------------------------------------------------------------------
// github-publisher.js — publish the loaded BIM model to a GitHub repository
// ---------------------------------------------------------------------------
// Design decisions (verified against the live GitHub API):
//
//   * Authentication uses a Personal Access Token, NEVER a password.
//     GitHub removed password authentication for the API in 2020, and asking a
//     user to type their GitHub password into a web form is unsafe. The token
//     is kept in sessionStorage only (cleared when the tab closes) and can be
//     wiped at any time.
//
//   * The model is committed as a repository file (models/<name>.glb) rather
//     than as a release asset: raw.githubusercontent.com answers with
//     `access-control-allow-origin: *`, so the AR page can fetch it from any
//     device, while release assets do not allow cross-origin reads.
//
//   * api.github.com allows cross-origin requests, so the upload runs
//     straight from the browser with no backend of our own.
// ---------------------------------------------------------------------------
(function (global) {
    'use strict';

    var API_BASE = 'https://api.github.com';
    var MAX_CONTENTS_SIZE = 50 * 1024 * 1024; // practical ceiling for the
    // base64-in-JSON Contents API (GitHub's hard limit is 100 MB, but the
    // JSON request body is the real bottleneck)

    function setApiBase(url) { API_BASE = String(url || API_BASE).replace(/\/+$/, ''); }
    function getApiBase() { return API_BASE; }

    // ---------------------------------------------------------------- token
    var TOKEN_KEY = 'webxr_github_pat';

    function getToken() {
        try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
    }
    function setToken(token) {
        try {
            if (token) sessionStorage.setItem(TOKEN_KEY, token);
            else sessionStorage.removeItem(TOKEN_KEY);
        } catch (e) { /* storage unavailable */ }
    }
    function clearToken() { setToken(''); }
    function hasToken() { return !!getToken(); }

    // -------------------------------------------------------------- helpers
    function request(method, path, body, extraHeaders) {
        var headers = {
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        };
        var token = getToken();
        if (token) headers['Authorization'] = 'Bearer ' + token;
        if (body !== undefined && body !== null) headers['Content-Type'] = 'application/json';
        if (extraHeaders) {
            Object.keys(extraHeaders).forEach(function (k) { headers[k] = extraHeaders[k]; });
        }
        return fetch(API_BASE + path, {
            method: method,
            headers: headers,
            body: body === undefined || body === null ? undefined : JSON.stringify(body)
        }).then(function (response) {
            var scopes = response.headers.get('x-oauth-scopes') || '';
            return response.text().then(function (text) {
                var payload = null;
                try { payload = text ? JSON.parse(text) : null; } catch (e) { payload = { raw: text }; }
                if (!response.ok) {
                    var message = (payload && payload.message) || ('HTTP ' + response.status);
                    var err = new Error(message);
                    err.status = response.status;
                    err.payload = payload;
                    throw err;
                }
                payload.__scopes = scopes;
                return payload;
            });
        });
    }

    /**
     * Base64-encodes an ArrayBuffer without exceeding the argument limit of
     * String.fromCharCode (chunked).
     */
    function arrayBufferToBase64(buffer) {
        var bytes = new Uint8Array(buffer);
        var chunkSize = 0x8000; // 32 KB
        var parts = [];
        for (var i = 0; i < bytes.length; i += chunkSize) {
            var chunk = bytes.subarray(i, i + chunkSize);
            parts.push(String.fromCharCode.apply(null, chunk));
        }
        return btoa(parts.join(''));
    }

    /** Encodes a repository path segment by segment, keeping the slashes. */
    function encodeRepoPath(path) {
        return String(path || '').split('/').filter(function (seg) { return seg.length; })
            .map(encodeURIComponent).join('/');
    }

    function humanSize(bytes) {
        if (!bytes && bytes !== 0) return '—';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }

    // ----------------------------------------------------------------- API
    /** Verifies the token and reports the account and its scopes. */
    function verify() {
        return request('GET', '/user').then(function (user) {
            return {
                login: user.login,
                name: user.name,
                avatar: user.avatar_url,
                scopes: user.__scopes ? user.__scopes.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [],
                canWrite: !!(user.__scopes && /repo|public_repo/.test(user.__scopes)) || user.__scopes === ''
            };
        });
    }

    /** Repositories the token can write to. */
    function listRepos() {
        return request('GET', '/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member')
            .then(function (repos) {
                return (repos || []).map(function (r) {
                    return {
                        name: r.name,
                        fullName: r.full_name,
                        private: !!r.private,
                        defaultBranch: r.default_branch,
                        permissions: r.permissions || {}
                    };
                });
            });
    }

    function listBranches(owner, repo) {
        return request('GET', '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/branches?per_page=100')
            .then(function (branches) {
                return (branches || []).map(function (b) { return b.name; });
            });
    }

    /** Returns the blob sha of an existing file, or null. */
    function getFileSha(owner, repo, path, branch) {
        return request('GET', '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) +
            '/contents/' + encodeRepoPath(path) + (branch ? '?ref=' + encodeURIComponent(branch) : ''))
            .then(function (file) { return file && file.sha ? file.sha : null; })
            .catch(function (err) {
                if (err && err.status === 404) return null;
                throw err;
            });
    }

    /**
     * Uploads (creates or updates) a file in the repository.
     * @param {Object} options { owner, repo, path, branch, message, bytes, name }
     * @returns {Promise<Object>} { downloadUrl, rawUrl, htmlUrl, sha, created }
     */
    function uploadFile(options) {
        var owner = options.owner;
        var repo = options.repo;
        var path = options.path;
        var branch = options.branch || 'main';
        var bytes = options.bytes;

        if (!owner || !repo || !path) {
            return Promise.reject(new Error('المستودع والمسار مطلوبان'));
        }
        if (!bytes || !bytes.byteLength) {
            return Promise.reject(new Error('لا توجد بيانات للرفع'));
        }
        if (bytes.byteLength > MAX_CONTENTS_SIZE) {
            var err = new Error('الملف (' + humanSize(bytes.byteLength) + ') يتجاوز الحد الأقصى (' +
                humanSize(MAX_CONTENTS_SIZE) + ') لطريقة Contents API. استخدم الأمر المُولَّد أو Git LFS.');
            err.code = 'TOO_LARGE';
            err.size = bytes.byteLength;
            throw err;
        }

        var apiPath = '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) +
            '/contents/' + encodeRepoPath(path);

        return getFileSha(owner, repo, path, branch)
            .then(function (sha) {
                var payload = {
                    message: options.message || ('Upload BIM model: ' + (options.name || path)),
                    content: arrayBufferToBase64(bytes),
                    branch: branch
                };
                if (sha) payload.sha = sha;   // required when replacing a file
                return request('PUT', apiPath, payload).then(function (result) {
                    return { result: result, replaced: !!sha };
                });
            })
            .then(function (outcome) {
                var result = outcome.result;
                var content = (result && result.content) ? result.content : {};
                return {
                    created: !outcome.replaced,
                    path: path,
                    sha: content.sha,
                    downloadUrl: content.download_url,
                    rawUrl: rawUrl(owner, repo, path, branch),
                    htmlUrl: content.html_url,
                    size: content.size,
                    commitUrl: (result && result.commit) ? result.commit.html_url : null
                };
            });
    }

    /** The CORS-friendly raw URL of a file in a repository. */
    function rawUrl(owner, repo, path, branch) {
        return 'https://raw.githubusercontent.com/' + encodeURIComponent(owner) + '/' +
            encodeURIComponent(repo) + '/' + encodeURIComponent(branch || 'main') + '/' +
            String(path).split('/').map(encodeURIComponent).join('/');
    }

    /**
     * A copy/paste command that performs the same upload with curl — the
     * no-token route, and the way around the 50 MB Contents API limit.
     */
    function curlCommand(options) {
        var path = encodeRepoPath(options.path);
        var apiPath = '/repos/' + encodeURIComponent(options.owner) + '/' +
            encodeURIComponent(options.repo) + '/contents/' + path;
        var branch = options.branch || 'main';
        return [
            '# رفع النموذج إلى GitHub دون وضع الرمز داخل المتصفح:',
            '# 1) احصل على رمز محدود الصلاحية (repo scope):',
            '#    https://github.com/settings/tokens',
            '# 2) ارفع الملف:',
            'curl -L -X PUT "https://api.github.com' + apiPath + '" \\',
            '  -H "Accept: application/vnd.github+json" \\',
            '  -H "Authorization: Bearer $GITHUB_TOKEN" \\',
            '  -H "X-GitHub-Api-Version: 2022-11-28" \\',
            '  -d \'{"message":"Upload BIM model","branch":"' + branch + '",' +
            '"content":"$(base64 -w0 \'' + (options.fileName || 'model.glb') + '\')"}\'',
            '# 3) الرابط الجاهز للاستخدام في علامة NFT:',
            '#    ' + rawUrl(options.owner, options.repo, options.path, branch)
        ].join('\n');
    }

    global.GitHubPublisher = {
        setApiBase: setApiBase,
        getApiBase: getApiBase,
        getToken: getToken,
        setToken: setToken,
        clearToken: clearToken,
        hasToken: hasToken,
        verify: verify,
        listRepos: listRepos,
        listBranches: listBranches,
        getFileSha: getFileSha,
        uploadFile: uploadFile,
        rawUrl: rawUrl,
        curlCommand: curlCommand,
        encodeRepoPath: encodeRepoPath,
        arrayBufferToBase64: arrayBufferToBase64,
        humanSize: humanSize,
        MAX_CONTENTS_SIZE: MAX_CONTENTS_SIZE
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = global.GitHubPublisher;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
