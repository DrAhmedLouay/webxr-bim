// ---------------------------------------------------------------------------
// nft-marker.js — self-contained QR / NFT anchor marker generator
// ---------------------------------------------------------------------------
// Implements a QR Code encoder (byte mode, versions 1-40, all ECC levels) with
// no external dependency, so the platform can produce printable anchor markers
// for the AR workflow entirely offline.
//
// The generated marker encodes a deep link back into the platform, e.g.
//   https://<host>/<path>?anchor=<token>&model=<id>
// so a phone camera scan opens the platform and can trigger AR placement.
//
// Exposed API (classic script, attaches to window.NFTMarker):
//   NFTMarker.encode(text, options) -> { size, modules, version, mask, ecc }
//   NFTMarker.renderToCanvas(canvas, matrix, options)
//   NFTMarker.toPNGBlob(matrix, options)
//   NFTMarker.buildDeepLink(options)
// ---------------------------------------------------------------------------
(function (global) {
    'use strict';

    // ---- GF(256) arithmetic for Reed-Solomon error correction ----
    var EXP = new Uint8Array(512);
    var LOG = new Uint8Array(256);
    (function initTables() {
        var x = 1;
        for (var i = 0; i < 255; i++) {
            EXP[i] = x;
            LOG[x] = i;
            x <<= 1;
            if (x & 0x100) x ^= 0x11d;
        }
        for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
    })();

    function gfMul(a, b) {
        if (a === 0 || b === 0) return 0;
        return EXP[LOG[a] + LOG[b]];
    }

    function generatorPoly(degree) {
        var g = [1];
        for (var i = 0; i < degree; i++) {
            var next = new Array(g.length + 1).fill(0);
            for (var j = 0; j < g.length; j++) {
                next[j] ^= g[j];                    // g * x
                next[j + 1] ^= gfMul(g[j], EXP[i]);  // g * alpha^i
            }
            g = next;
        }
        return g;
    }

    function rsRemainder(data, degree) {
        var gen = generatorPoly(degree);
        var result = new Uint8Array(degree);
        for (var i = 0; i < data.length; i++) {
            var factor = data[i] ^ result[0];
            result.copyWithin(0, 1);
            result[degree - 1] = 0;
            for (var j = 0; j < degree; j++) {
                result[j] ^= gfMul(gen[j + 1], factor);
            }
        }
        return result;
    }

    // ---- Version / capacity tables (index = version, 1-based) ----
    var ECC_LEVELS = ['L', 'M', 'Q', 'H'];
    var ECC_FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 }; // as used in the format info

    var ECC_CODEWORDS_PER_BLOCK = {
        L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
        M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
        Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
        H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
    };

    var NUM_ECC_BLOCKS = {
        L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
        M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
        Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
        H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
    };

    function numRawDataModules(ver) {
        var result = (16 * ver + 128) * ver + 64;
        if (ver >= 2) {
            var numAlign = Math.floor(ver / 7) + 2;
            result -= (25 * numAlign - 10) * numAlign - 55;
            if (ver >= 7) result -= 36;
        }
        return result;
    }

    function numDataCodewords(ver, ecl) {
        return Math.floor(numRawDataModules(ver) / 8)
            - ECC_CODEWORDS_PER_BLOCK[ecl][ver] * NUM_ECC_BLOCKS[ecl][ver];
    }

    function alignmentPatternPositions(ver) {
        if (ver === 1) return [];
        var numAlign = Math.floor(ver / 7) + 2;
        var step = (ver === 32) ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
        var result = [6];
        for (var pos = ver * 4 + 10; result.length < numAlign; pos -= step) {
            result.splice(1, 0, pos);
        }
        return result;
    }

    // ---- Bit buffer ----
    function BitBuffer() {
        this.bits = [];
    }
    BitBuffer.prototype.append = function (value, length) {
        for (var i = length - 1; i >= 0; i--) {
            this.bits.push((value >>> i) & 1);
        }
    };
    BitBuffer.prototype.length = function () {
        return this.bits.length;
    };

    // ---- Data encoding (byte mode) ----
    function encodeData(text, ver, ecl) {
        var bytes = [];
        for (var i = 0; i < text.length; i++) {
            var code = text.charCodeAt(i);
            if (code < 0x80) {
                bytes.push(code);
            } else if (code < 0x800) {
                bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
            } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
                var next = text.charCodeAt(i + 1);
                if (next >= 0xdc00 && next <= 0xdfff) {
                    code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
                    bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f),
                        0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
                    i++;
                } else {
                    bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
                }
            } else {
                bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
            }
        }

        var capacityBits = numDataCodewords(ver, ecl) * 8;
        var bb = new BitBuffer();
        bb.append(0x4, 4);                       // byte mode indicator
        bb.append(bytes.length, ver <= 9 ? 8 : 16); // character count indicator
        for (var j = 0; j < bytes.length; j++) {
            bb.append(bytes[j], 8);
        }

        if (bb.length() > capacityBits) return null;

        bb.append(0, Math.min(4, capacityBits - bb.length())); // terminator
        bb.append(0, (8 - (bb.length() % 8)) % 8);             // pad to byte boundary

        var codewords = [];
        for (var k = 0; k < bb.length(); k += 8) {
            var byteVal = 0;
            for (var m = 0; m < 8; m++) byteVal = (byteVal << 1) | bb.bits[k + m];
            codewords.push(byteVal);
        }
        for (var pad = 0xec; codewords.length < numDataCodewords(ver, ecl); pad ^= 0xec ^ 0x11) {
            codewords.push(pad);
        }
        return codewords;
    }

    // ---- Reed-Solomon block interleaving ----
    function interleave(dataCodewords, ver, ecl) {
        var numBlocks = NUM_ECC_BLOCKS[ecl][ver];
        var eccLen = ECC_CODEWORDS_PER_BLOCK[ecl][ver];
        var rawCodewords = Math.floor(numRawDataModules(ver) / 8);
        var numShortBlocks = numBlocks - (rawCodewords % numBlocks);
        var shortBlockLen = Math.floor(rawCodewords / numBlocks);

        var blocks = [];
        var k = 0;
        for (var i = 0; i < numBlocks; i++) {
            var datLen = shortBlockLen - eccLen + (i < numShortBlocks ? 0 : 1);
            var dat = Array.prototype.slice.call(dataCodewords, k, k + datLen);
            k += datLen;
            var block = dat.slice();
            var ecc = rsRemainder(dat, eccLen);
            blocks.push({ data: block, ecc: ecc });
        }

        var result = [];
        for (var d = 0; d < shortBlockLen - eccLen + 1; d++) {
            for (var b = 0; b < blocks.length; b++) {
                if (d < blocks[b].data.length) result.push(blocks[b].data[d]);
            }
        }
        for (var e = 0; e < eccLen; e++) {
            for (var b2 = 0; b2 < blocks.length; b2++) {
                result.push(blocks[b2].ecc[e]);
            }
        }
        return result;
    }

    // ---- Matrix construction ----
    function QrMatrix(version, ecl, mask, codewords) {
        this.version = version;
        this.ecl = ecl;
        this.mask = mask;
        this.size = version * 4 + 17;
        this.modules = [];
        this.isFunction = [];
        for (var i = 0; i < this.size; i++) {
            this.modules.push(new Array(this.size).fill(false));
            this.isFunction.push(new Array(this.size).fill(false));
        }
        this.drawFunctionPatterns();
        this.drawCodewords(codewords);
    }

    QrMatrix.prototype.set = function (x, y, dark, isFn) {
        this.modules[y][x] = dark;
        if (isFn) this.isFunction[y][x] = true;
    };

    QrMatrix.prototype.drawFunctionPatterns = function () {
        var size = this.size;
        var i, j;

        // timing patterns
        for (i = 0; i < size; i++) {
            this.set(6, i, i % 2 === 0, true);
            this.set(i, 6, i % 2 === 0, true);
        }

        // three finder patterns (with separators)
        this.drawFinder(3, 3);
        this.drawFinder(size - 4, 3);
        this.drawFinder(3, size - 4);

        // alignment patterns
        var align = alignmentPatternPositions(this.version);
        for (i = 0; i < align.length; i++) {
            for (j = 0; j < align.length; j++) {
                var skipCorner = (i === 0 && j === 0)
                    || (i === 0 && j === align.length - 1)
                    || (i === align.length - 1 && j === 0);
                if (!skipCorner) {
                    this.drawAlignment(align[i], align[j]);
                }
            }
        }

        // reserve format info areas + dark module
        this.drawFormatBits(0);
        this.set(8, size - 8, true, true);

        // version info for version >= 7
        if (this.version >= 7) this.drawVersion();
    };

    QrMatrix.prototype.drawFinder = function (cx, cy) {
        for (var dy = -4; dy <= 4; dy++) {
            for (var dx = -4; dx <= 4; dx++) {
                var dist = Math.max(Math.abs(dx), Math.abs(dy));
                var x = cx + dx;
                var y = cy + dy;
                if (x >= 0 && x < this.size && y >= 0 && y < this.size) {
                    this.set(x, y, dist !== 2 && dist !== 4, true);
                }
            }
        }
    };

    QrMatrix.prototype.drawAlignment = function (cx, cy) {
        for (var dy = -2; dy <= 2; dy++) {
            for (var dx = -2; dx <= 2; dx++) {
                this.set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1, true);
            }
        }
    };

    QrMatrix.prototype.drawFormatBits = function (mask) {
        var data = (ECC_FORMAT_BITS[this.ecl] << 3) | mask;
        var rem = data;
        for (var i = 0; i < 10; i++) {
            rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
        }
        var bits = ((data << 10) | rem) ^ 0x5412;

        var size = this.size;
        var i2;
        // top-left
        for (i2 = 0; i2 <= 5; i2++) this.set(8, i2, ((bits >>> i2) & 1) !== 0, true);
        this.set(8, 7, ((bits >>> 6) & 1) !== 0, true);
        this.set(8, 8, ((bits >>> 7) & 1) !== 0, true);
        this.set(7, 8, ((bits >>> 8) & 1) !== 0, true);
        for (i2 = 9; i2 < 15; i2++) this.set(14 - i2, 8, ((bits >>> i2) & 1) !== 0, true);

        // bottom-left and top-right copies
        for (i2 = 0; i2 < 8; i2++) this.set(size - 1 - i2, 8, ((bits >>> i2) & 1) !== 0, true);
        for (i2 = 8; i2 < 15; i2++) this.set(8, size - 15 + i2, ((bits >>> i2) & 1) !== 0, true);
        this.set(8, size - 8, true, true);
    };

    QrMatrix.prototype.drawVersion = function () {
        var rem = this.version;
        for (var i = 0; i < 12; i++) {
            rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
        }
        var bits = (this.version << 12) | rem;
        var size = this.size;
        for (var i2 = 0; i2 < 18; i2++) {
            var bit = ((bits >>> i2) & 1) !== 0;
            var a = size - 11 + (i2 % 3);
            var b = Math.floor(i2 / 3);
            this.set(a, b, bit, true);
            this.set(b, a, bit, true);
        }
    };

    QrMatrix.prototype.drawCodewords = function (data) {
        var size = this.size;
        var i = 0; // bit index
        for (var right = size - 1; right >= 1; right -= 2) {
            if (right === 6) right = 5;
            for (var vert = 0; vert < size; vert++) {
                for (var j = 0; j < 2; j++) {
                    var x = right - j;
                    var upward = ((right + 1) & 2) === 0;
                    var y = upward ? size - 1 - vert : vert;
                    if (!this.isFunction[y][x] && i < data.length * 8) {
                        this.modules[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
                        i++;
                    }
                }
            }
        }
    };

    QrMatrix.prototype.applyMask = function (mask) {
        for (var y = 0; y < this.size; y++) {
            for (var x = 0; x < this.size; x++) {
                if (this.isFunction[y][x]) continue;
                var invert;
                switch (mask) {
                    case 0: invert = (x + y) % 2 === 0; break;
                    case 1: invert = y % 2 === 0; break;
                    case 2: invert = x % 3 === 0; break;
                    case 3: invert = (x + y) % 3 === 0; break;
                    case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
                    case 5: invert = (x * y) % 2 + (x * y) % 3 === 0; break;
                    case 6: invert = ((x * y) % 2 + (x * y) % 3) % 2 === 0; break;
                    case 7: invert = ((x + y) % 2 + (x * y) % 3) % 2 === 0; break;
                    default: invert = false;
                }
                if (invert) this.modules[y][x] = !this.modules[y][x];
            }
        }
    };

    // ---- Mask penalty scoring (ISO/IEC 18004 rules 1-4) ----
    function penaltyScore(modules, size) {
        var score = 0;

        // rule 1: runs of 5+ same-colour modules in a row
        for (var y = 0; y < size; y++) {
            var runColor = modules[y][0];
            var runLen = 1;
            for (var x = 1; x < size; x++) {
                if (modules[y][x] === runColor) {
                    runLen++;
                    if (runLen === 5) score += 3;
                    else if (runLen > 5) score += 1;
                } else {
                    runColor = modules[y][x];
                    runLen = 1;
                }
            }
        }
        for (var x2 = 0; x2 < size; x2++) {
            var runColor2 = modules[0][x2];
            var runLen2 = 1;
            for (var y2 = 1; y2 < size; y2++) {
                if (modules[y2][x2] === runColor2) {
                    runLen2++;
                    if (runLen2 === 5) score += 3;
                    else if (runLen2 > 5) score += 1;
                } else {
                    runColor2 = modules[y2][x2];
                    runLen2 = 1;
                }
            }
        }

        // rule 2: 2x2 blocks of the same colour
        for (var y3 = 0; y3 < size - 1; y3++) {
            for (var x3 = 0; x3 < size - 1; x3++) {
                var c = modules[y3][x3];
                if (c === modules[y3][x3 + 1] && c === modules[y3 + 1][x3] && c === modules[y3 + 1][x3 + 1]) {
                    score += 3;
                }
            }
        }

        // rule 3: finder-like patterns
        var pattern1 = [true, false, true, true, true, false, true, false, false, false, false];
        var pattern2 = [false, false, false, false, true, false, true, true, true, false, true];
        function matchesAt(get, i) {
            var a = true, b = true;
            for (var k = 0; k < 11; k++) {
                if (get(i + k) !== pattern1[k]) a = false;
                if (get(i + k) !== pattern2[k]) b = false;
            }
            return a || b;
        }
        for (var y4 = 0; y4 < size; y4++) {
            for (var x4 = 0; x4 + 11 <= size; x4++) {
                var getRow = (function (row) {
                    return function (i) { return modules[row][i]; };
                })(y4);
                if (matchesAt(getRow, x4)) score += 40;
            }
        }
        for (var x5 = 0; x5 < size; x5++) {
            for (var y5 = 0; y5 + 11 <= size; y5++) {
                var getCol = (function (col) {
                    return function (i) { return modules[i][col]; };
                })(x5);
                if (matchesAt(getCol, y5)) score += 40;
            }
        }

        // rule 4: proportion of dark modules
        var dark = 0;
        for (var yy = 0; yy < size; yy++) {
            for (var xx = 0; xx < size; xx++) {
                if (modules[yy][xx]) dark++;
            }
        }
        var total = size * size;
        var k4 = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
        score += Math.max(k4, 0) * 10;

        return score;
    }

    // ---- Public API ----
    function encode(text, options) {
        options = options || {};
        var ecl = (options.ecc || 'M').toUpperCase();
        if (ECC_LEVELS.indexOf(ecl) === -1) ecl = 'M';
        var minVersion = options.minVersion || 1;
        var maxVersion = Math.min(options.maxVersion || 40, 40);
        var forcedMask = (options.mask === undefined || options.mask === null) ? -1 : options.mask;

        var dataCodewords = null;
        var version = -1;
        for (var v = minVersion; v <= maxVersion; v++) {
            var candidate = encodeData(text, v, ecl);
            if (candidate) {
                dataCodewords = candidate;
                version = v;
                break;
            }
        }
        if (!dataCodewords) {
            throw new Error('الpayload أطول من سعة رمز QR المسموحة (' + text.length + ' حرفاً)');
        }

        var interleaved = interleave(dataCodewords, version, ecl);

        var bestMask = forcedMask;
        var bestMatrix = null;
        var bestScore = Infinity;

        var masks = forcedMask >= 0 ? [forcedMask] : [0, 1, 2, 3, 4, 5, 6, 7];
        for (var mi = 0; mi < masks.length; mi++) {
            var m = masks[mi];
            var matrix = new QrMatrix(version, ecl, m, interleaved);
            matrix.applyMask(m);
            matrix.drawFormatBits(m);
            var score = penaltyScore(matrix.modules, matrix.size);
            if (score < bestScore) {
                bestScore = score;
                bestMask = m;
                bestMatrix = matrix;
            }
        }

        return {
            size: bestMatrix.size,
            modules: bestMatrix.modules,
            version: version,
            mask: bestMask,
            ecc: ecl,
            penalty: bestScore,
            codewords: interleaved
        };
    }

    function renderToCanvas(canvas, matrix, options) {
        options = options || {};
        var scale = options.scale || 8;
        var quiet = options.quiet === undefined ? 4 : options.quiet;
        var dark = options.dark || '#000000';
        var light = options.light || '#ffffff';
        var size = matrix.size + quiet * 2;
        var px = size * scale;

        canvas.width = px;
        canvas.height = px;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = light;
        ctx.fillRect(0, 0, px, px);
        ctx.fillStyle = dark;
        for (var y = 0; y < matrix.size; y++) {
            for (var x = 0; x < matrix.size; x++) {
                if (matrix.modules[y][x]) {
                    ctx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
                }
            }
        }
        return canvas;
    }

    function toPNGBlob(matrix, options) {
        options = options || {};
        var canvas = document.createElement('canvas');
        renderToCanvas(canvas, matrix, options);
        return new Promise(function (resolve, reject) {
            if (canvas.toBlob) {
                canvas.toBlob(function (blob) {
                    if (blob) resolve(blob);
                    else reject(new Error('تعذّر إنشاء ملف PNG'));
                }, 'image/png');
            } else {
                reject(new Error('المتصفح لا يدعم canvas.toBlob'));
            }
        });
    }

    function buildDeepLink(options) {
        options = options || {};
        var base = options.baseUrl || (typeof location !== 'undefined' ? location.href.split('?')[0].split('#')[0] : '');
        var params = [];
        if (options.anchor) params.push('anchor=' + encodeURIComponent(options.anchor));
        if (options.model) params.push('model=' + encodeURIComponent(options.model));
        if (options.storey) params.push('storey=' + encodeURIComponent(options.storey));
        if (options.token) params.push('token=' + encodeURIComponent(options.token));
        return base + (params.length ? '?' + params.join('&') : '');
    }

    global.NFTMarker = {
        encode: encode,
        renderToCanvas: renderToCanvas,
        toPNGBlob: toPNGBlob,
        buildDeepLink: buildDeepLink,
        eccLevels: ECC_LEVELS.slice(),
        versions: { min: 1, max: 40 }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = global.NFTMarker;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
