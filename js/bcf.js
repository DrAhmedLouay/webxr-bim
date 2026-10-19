// ---------------------------------------------------------------------------
// bcf.js — OpenBIM BCF 2.1 writer + buildingSMART BCF-API 2.1 client
// ---------------------------------------------------------------------------
// Implements, without any external dependency:
//
//   1. A minimal ZIP writer (stored entries) so the platform can emit a
//      genuine `.bcf` archive (the BCF 2.1 container format used by Revit,
//      Navisworks, Solibri, BIMcollab and every BCF-API server).
//
//   2. The BCF 2.1 XML parts:
//        bcf.version                      -> <Version VersionId="2.1">
//        project.bcfp                     -> <ProjectExtension><Project>
//        <topicGuid>/markup.bcf           -> <Markup><Topic/><Comment/>
//        <topicGuid>/Viewpoint_<guid>.bcfv -> <VisualizationInfo>
//
//   3. A BCF-API 2.1 REST client (the API BIMcollab implements natively, and
//      which any buildingSMART BCF-API server exposes):
//        GET  /bcf/versions
//        GET  /bcf/{version}/auth
//        GET  /bcf/{version}/current-user
//        GET  /bcf/{version}/projects
//        GET  /bcf/{version}/projects/{projectId}/topics
//        POST /bcf/{version}/projects/{projectId}/topics
//        POST /bcf/{version}/projects/{projectId}/full-topic
//        GET  /bcf/{version}/projects/{projectId}/export
//
// Exposed API (classic script -> window.BCF):
//   BCF.buildArchive(topics, options)            -> Promise<Blob>
//   BCF.buildTopicXml(topic)                     -> string
//   BCF.buildViewpointXml(viewpoint)             -> string
//   BCF.BcfApiClient(baseUrl, token)             -> client
// ---------------------------------------------------------------------------
(function (global) {
    'use strict';

    // ---------------------------------------------------------------- utils
    function escapeXml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    function uuid() {
        if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
        var b = new Uint8Array(16);
        (global.crypto || {}).getRandomValues
            ? global.crypto.getRandomValues(b)
            : b.forEach(function (_, i) { b[i] = Math.floor(Math.random() * 256); });
        b[6] = (b[6] & 0x0f) | 0x40;
        b[8] = (b[8] & 0x3f) | 0x80;
        var hex = Array.prototype.map.call(b, function (x) {
            return ('0' + x.toString(16)).slice(-2);
        }).join('');
        return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' +
            hex.slice(16, 20) + '-' + hex.slice(20);
    }

    function isoNow() {
        return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    }

    // ---------------------------------------------------------- ZIP writer
    var CRC_TABLE = (function () {
        var table = new Uint32Array(256);
        for (var n = 0; n < 256; n++) {
            var c = n;
            for (var k = 0; k < 8; k++) {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            table[n] = c >>> 0;
        }
        return table;
    })();

    function crc32(bytes) {
        var crc = 0xFFFFFFFF;
        for (var i = 0; i < bytes.length; i++) {
            crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xFF];
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    function utf8Bytes(str) {
        if (global.TextEncoder) return new global.TextEncoder().encode(str);
        var out = [];
        for (var i = 0; i < str.length; i++) {
            var c = str.charCodeAt(i);
            if (c < 0x80) out.push(c);
            else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
            else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
        }
        return new Uint8Array(out);
    }

    /**
     * Builds a ZIP archive (stored / no compression) from a list of entries.
     * @param {Array<{name: string, data: string|Uint8Array}>} entries
     * @returns {Uint8Array}
     */
    function buildZip(entries) {
        var encoder = utf8Bytes;
        var localParts = [];
        var centralParts = [];
        var offset = 0;

        entries.forEach(function (entry) {
            var nameBytes = encoder(entry.name);
            var dataBytes = typeof entry.data === 'string' ? encoder(entry.data) : entry.data;
            var crc = crc32(dataBytes);

            var local = new Uint8Array(30 + nameBytes.length);
            var dv = new DataView(local.buffer);
            dv.setUint32(0, 0x04034b50, true);   // local file header signature
            dv.setUint16(4, 20, true);           // version needed
            dv.setUint16(6, 0x0800, true);       // flags: UTF-8 names
            dv.setUint16(8, 0, true);            // method: stored
            dv.setUint16(10, 0, true);           // mod time
            dv.setUint16(12, 0x21, true);        // mod date (1996-01-01)
            dv.setUint32(14, crc, true);
            dv.setUint32(18, dataBytes.length, true);
            dv.setUint32(22, dataBytes.length, true);
            dv.setUint16(26, nameBytes.length, true);
            dv.setUint16(28, 0, true);           // extra length
            local.set(nameBytes, 30);

            localParts.push(local, dataBytes);

            var central = new Uint8Array(46 + nameBytes.length);
            var cdv = new DataView(central.buffer);
            cdv.setUint32(0, 0x02014b50, true);  // central directory signature
            cdv.setUint16(4, 20, true);          // version made by
            cdv.setUint16(6, 20, true);          // version needed
            cdv.setUint16(8, 0x0800, true);
            cdv.setUint16(10, 0, true);
            cdv.setUint16(12, 0, true);
            cdv.setUint16(14, 0x21, true);
            cdv.setUint32(16, crc, true);
            cdv.setUint32(20, dataBytes.length, true);
            cdv.setUint32(24, dataBytes.length, true);
            cdv.setUint16(28, nameBytes.length, true);
            cdv.setUint16(30, 0, true);          // extra
            cdv.setUint16(32, 0, true);          // comment
            cdv.setUint16(34, 0, true);          // disk number
            cdv.setUint16(36, 0, true);          // internal attrs
            cdv.setUint32(38, 0, true);          // external attrs
            cdv.setUint32(42, offset, true);     // relative offset
            central.set(nameBytes, 46);
            centralParts.push(central);

            offset += local.length + dataBytes.length;
        });

        var centralSize = centralParts.reduce(function (sum, p) { return sum + p.length; }, 0);
        var end = new Uint8Array(22);
        var edv = new DataView(end.buffer);
        edv.setUint32(0, 0x06054b50, true);      // end of central directory
        edv.setUint16(4, 0, true);
        edv.setUint16(6, 0, true);
        edv.setUint16(8, entries.length, true);
        edv.setUint16(10, entries.length, true);
        edv.setUint32(12, centralSize, true);
        edv.setUint32(16, offset, true);
        edv.setUint16(20, 0, true);

        var total = 0;
        localParts.concat(centralParts, [end]).forEach(function (p) { total += p.length; });
        var out = new Uint8Array(total);
        var pos = 0;
        localParts.concat(centralParts, [end]).forEach(function (p) {
            out.set(p, pos);
            pos += p.length;
        });
        return out;
    }

    // --------------------------------------------------------- BCF 2.1 XML
    function buildVersionXml() {
        return '<?xml version="1.0" encoding="utf-8"?>\n' +
            '<Version xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
            'xmlns:xsd="http://www.w3.org/2001/XMLSchema" VersionId="2.1">\n' +
            '  <DetailedVersion>2.1</DetailedVersion>\n' +
            '</Version>';
    }

    function buildProjectXml(projectName, projectId) {
        return '<?xml version="1.0" encoding="utf-8"?>\n' +
            '<ProjectExtension xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
            'xmlns:xsd="http://www.w3.org/2001/XMLSchema">\n' +
            '  <Project ProjectId="' + escapeXml(projectId) + '">\n' +
            '    <Name>' + escapeXml(projectName) + '</Name>\n' +
            '  </Project>\n' +
            '</ProjectExtension>';
    }

    function buildTopicXml(topic) {
        var lines = [];
        lines.push('<?xml version="1.0" encoding="utf-8"?>');
        lines.push('<Markup xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
            'xmlns:xsd="http://www.w3.org/2001/XMLSchema">');

        if (topic.fileName) {
            lines.push('  <Header>');
            lines.push('    <File IfcProject="' + escapeXml(topic.ifcProject || '') + '" isExternal="false">');
            lines.push('      <Filename>' + escapeXml(topic.fileName) + '</Filename>');
            lines.push('      <Date>' + escapeXml(topic.creationDate || isoNow()) + '</Date>');
            lines.push('    </File>');
            lines.push('  </Header>');
        }

        lines.push('  <Topic Guid="' + escapeXml(topic.guid) + '" ' +
            'TopicType="' + escapeXml(topic.topicType || 'Issue') + '" ' +
            'TopicStatus="' + escapeXml(topic.topicStatus || 'Open') + '">');
        lines.push('    <Title>' + escapeXml(topic.title || '') + '</Title>');
        if (topic.description) {
            lines.push('    <Description>' + escapeXml(topic.description) + '</Description>');
        }
        if (topic.priority) {
            lines.push('    <Priority>' + escapeXml(topic.priority) + '</Priority>');
        }
        (topic.labels || []).forEach(function (label) {
            lines.push('    <Labels>' + escapeXml(label) + '</Labels>');
        });
        lines.push('    <CreationDate>' + escapeXml(topic.creationDate || isoNow()) + '</CreationDate>');
        lines.push('    <CreationAuthor>' + escapeXml(topic.creationAuthor || 'WebXR BIM Lab') + '</CreationAuthor>');
        if (topic.assignedTo) {
            lines.push('    <AssignedTo>' + escapeXml(topic.assignedTo) + '</AssignedTo>');
        }
        if (topic.stage) {
            lines.push('    <Stage>' + escapeXml(topic.stage) + '</Stage>');
        }
        lines.push('  </Topic>');

        (topic.comments || []).forEach(function (comment) {
            lines.push('  <Comment Guid="' + escapeXml(comment.guid || uuid()) + '">');
            lines.push('    <Date>' + escapeXml(comment.date || isoNow()) + '</Date>');
            lines.push('    <Author>' + escapeXml(comment.author || 'WebXR BIM Lab') + '</Author>');
            lines.push('    <Comment>' + escapeXml(comment.text || '') + '</Comment>');
            if (comment.viewpointGuid) {
                lines.push('    <Viewpoint Guid="' + escapeXml(comment.viewpointGuid) + '" />');
            }
            lines.push('  </Comment>');
        });

        lines.push('</Markup>');
        return lines.join('\n');
    }

    function buildViewpointXml(viewpoint) {
        var cam = viewpoint.camera || {};
        var pos = cam.position || { x: 0, y: 0, z: 0 };
        var target = cam.target || { x: 0, y: 0, z: 0 };
        var dir = cam.direction || { x: 0, y: 0, z: -1 };
        var up = cam.up || { x: 0, y: 1, z: 0 };

        function vec(v) {
            return '<X>' + Number(v.x || 0).toFixed(6) + '</X>' +
                '<Y>' + Number(v.y || 0).toFixed(6) + '</Y>' +
                '<Z>' + Number(v.z || 0).toFixed(6) + '</Z>';
        }

        var lines = [];
        lines.push('<?xml version="1.0" encoding="utf-8"?>');
        lines.push('<VisualizationInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
            'xmlns:xsd="http://www.w3.org/2001/XMLSchema" Guid="' + escapeXml(viewpoint.guid) + '">');
        lines.push('  <Components>');
        lines.push('    <ViewSetupHints SpacesVisible="false" SpaceBoundariesVisible="false" OpeningsVisible="true" />');
        lines.push('    <Selection>');
        (viewpoint.components || []).forEach(function (c) {
            if (!c || !c.ifcGuid) return;
            lines.push('      <Component IfcGuid="' + escapeXml(c.ifcGuid) + '" />');
        });
        lines.push('    </Selection>');
        lines.push('  </Components>');
        lines.push('  <PerspectiveCamera>');
        lines.push('    <CameraViewPoint>' + vec(pos) + '</CameraViewPoint>');
        lines.push('    <CameraDirection>' + vec(dir) + '</CameraDirection>');
        lines.push('    <CameraUpVector>' + vec(up) + '</CameraUpVector>');
        lines.push('  </PerspectiveCamera>');
        lines.push('</VisualizationInfo>');
        return lines.join('\n');
    }

    /**
     * Builds a genuine BCF 2.1 archive (.bcf) from a topic list.
     * @param {Array} topics
     * @param {Object} options { projectName, projectId, author }
     * @returns {Blob}
     */
    function buildArchive(topics, options) {
        options = options || {};
        var projectId = options.projectId || uuid();
        var entries = [
            { name: 'bcf.version', data: buildVersionXml() },
            { name: 'project.bcfp', data: buildProjectXml(options.projectName || 'WebXR BIM Lab', projectId) }
        ];

        (topics || []).forEach(function (topic) {
            var guid = topic.guid || uuid();
            var folder = guid;
            var comments = (topic.comments || []).slice();

            // attach the viewpoint to a comment so it is discoverable
            if (topic.viewpoint && topic.viewpoint.guid) {
                if (comments.length === 0) {
                    comments.push({
                        guid: uuid(),
                        author: topic.creationAuthor || options.author,
                        date: topic.creationDate || isoNow(),
                        text: topic.description || '',
                        viewpointGuid: topic.viewpoint.guid
                    });
                } else {
                    comments[0].viewpointGuid = topic.viewpoint.guid;
                }
                entries.push({
                    name: folder + '/Viewpoint_' + topic.viewpoint.guid + '.bcfv',
                    data: buildViewpointXml(topic.viewpoint)
                });
            }

            var xmlTopic = Object.assign({}, topic, { guid: guid, comments: comments });
            entries.push({ name: folder + '/markup.bcf', data: buildTopicXml(xmlTopic) });
        });

        var bytes = buildZip(entries);
        return new Blob([bytes], { type: 'application/octet-stream' });
    }

    // --------------------------------------------------- BCF-API 2.1 client
    /**
     * Client for the buildingSMART BCF-API 2.1 (implemented natively by
     * BIMcollab and compatible CDE servers).
     *
     * The server address may be given as a bare host ("https://space.bimcollab.com"),
     * as a BCF root ("https://host/bcf") or as a versioned root
     * ("https://host/bcf/2.1"). Endpoints always follow the specification layout:
     *   discovery  : {serverRoot}/bcf/versions
     *   versioned  : {serverRoot}/bcf/{version}/...
     */
    function BcfApiClient(baseUrl, token) {
        var url = String(baseUrl || '').trim().replace(/\/+$/, '');
        var versioned = url.match(/\/bcf\/([\d.]+)$/);
        if (versioned) {
            this.serverRoot = url.replace(/\/bcf\/[\d.]+$/, '');
            this.version = versioned[1];
        } else if (/\/bcf$/.test(url)) {
            this.serverRoot = url.replace(/\/bcf$/, '');
            this.version = '2.1';
        } else {
            this.serverRoot = url;
            this.version = '2.1';
        }
        this.token = token || '';
    }

    Object.defineProperty(BcfApiClient.prototype, 'versionRoot', {
        get: function () { return this.serverRoot + '/bcf/' + this.version; }
    });

    BcfApiClient.prototype._url = function (path) {
        return this.serverRoot + path;
    };

    BcfApiClient.prototype._versionedUrl = function (path) {
        return this.versionRoot + path;
    };

    BcfApiClient.prototype._request = function (method, url, body) {
        var headers = { 'Accept': 'application/json' };
        if (this.token) headers['Authorization'] = 'Bearer ' + this.token;
        if (body !== undefined && body !== null) headers['Content-Type'] = 'application/json';

        return fetch(url, {
            method: method,
            headers: headers,
            body: body === undefined || body === null ? undefined : JSON.stringify(body)
        }).then(function (response) {
            var contentType = response.headers.get('content-type') || '';
            var isJson = contentType.indexOf('application/json') !== -1;
            var parser = isJson ? response.json() : response.text();
            return parser.then(function (payload) {
                if (!response.ok) {
                    var message = (payload && payload.message) || (payload && payload.detail) ||
                        ('HTTP ' + response.status);
                    var err = new Error(message);
                    err.status = response.status;
                    throw err;
                }
                return payload;
            });
        });
    };

    BcfApiClient.prototype.getVersions = function () {
        return this._request('GET', this._url('/bcf/versions'));
    };
    BcfApiClient.prototype.getAuthInfo = function () {
        return this._request('GET', this._versionedUrl('/auth'));
    };
    BcfApiClient.prototype.getCurrentUser = function () {
        return this._request('GET', this._versionedUrl('/current-user'));
    };
    BcfApiClient.prototype.getProjects = function () {
        return this._request('GET', this._versionedUrl('/projects'));
    };
    BcfApiClient.prototype.getTopics = function (projectId) {
        return this._request('GET', this._versionedUrl('/projects/' + encodeURIComponent(projectId) + '/topics'));
    };
    BcfApiClient.prototype.createTopic = function (projectId, topic) {
        return this._request('POST', this._versionedUrl('/projects/' + encodeURIComponent(projectId) + '/topics'), topic);
    };
    BcfApiClient.prototype.createFullTopic = function (projectId, fullTopic) {
        return this._request('POST', this._versionedUrl('/projects/' + encodeURIComponent(projectId) + '/full-topic'), fullTopic);
    };
    BcfApiClient.prototype.getExtensions = function (projectId) {
        return this._request('GET', this._versionedUrl('/projects/' + encodeURIComponent(projectId) + '/extensions'));
    };
    BcfApiClient.prototype.exportProject = function (projectId) {
        return this._request('GET', this._versionedUrl('/projects/' + encodeURIComponent(projectId) + '/export'));
    };

    /**
     * Maps a platform clash record to a BCF-API topic payload.
     */
    function clashToTopic(clash, camera, controls, author) {
        var viewpoint = null;
        if (camera && controls) {
            var dir = camera.getWorldDirection
                ? camera.getWorldDirection(new global.THREE.Vector3())
                : new global.THREE.Vector3(0, 0, -1);
            viewpoint = {
                guid: uuid(),
                camera: {
                    position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
                    target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
                    direction: { x: dir.x, y: dir.y, z: dir.z },
                    up: { x: 0, y: 1, z: 0 }
                },
                components: [
                    { ifcGuid: clash.elementId },
                    { ifcGuid: clash.pairedId }
                ].filter(function (c) { return !!(c && c.ifcGuid); })
            };
        }
        return {
            guid: clash.guid || uuid(),
            title: clash.title,
            description: clash.description || '',
            topicType: clash.type || 'Issue',
            topicStatus: clash.status || 'Open',
            priority: clash.priority || 'Normal',
            creationDate: isoNow(),
            creationAuthor: author || 'WebXR BIM Lab',
            comments: [{
                guid: uuid(),
                author: author || 'WebXR BIM Lab',
                date: isoNow(),
                text: clash.description || ''
            }],
            viewpoint: viewpoint
        };
    }

    global.BCF = {
        buildArchive: buildArchive,
        buildZip: buildZip,
        buildTopicXml: buildTopicXml,
        buildViewpointXml: buildViewpointXml,
        buildVersionXml: buildVersionXml,
        buildProjectXml: buildProjectXml,
        clashToTopic: clashToTopic,
        uuid: uuid,
        isoNow: isoNow,
        escapeXml: escapeXml,
        BcfApiClient: BcfApiClient
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = global.BCF;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
