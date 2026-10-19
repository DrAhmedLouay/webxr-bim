// ---------------------------------------------------------------------------
// gdrive-proxy — Google Apps Script web app that streams a Drive file to the
// browser with permissive CORS headers, so the WebXR BIM AR page can load a
// model that lives in Google Drive from any device.
// ---------------------------------------------------------------------------
// DEPLOYMENT
//   1. Open https://script.google.com  ->  New project
//   2. Delete the placeholder Code.gs content and paste this file
//   3. Name the project, click  Deploy > New deployment
//      -> type "Web app"
//      -> Execute as: "Me"
//      -> Who has access: "Anyone"            <-- required for cross-origin use
//   4. Copy the deployment URL:  https://script.google.com/macros/s/<ID>/exec
//   5. Use it in the platform:
//        "🔗 رابط النموذج المباشر"  =  https://script.google.com/macros/s/<ID>/exec?fileId=<DRIVE_FILE_ID>
//      (or simply paste the Drive share link — the platform converts it)
//   6. The Drive file must be shared as "Anyone with the link".
//
// VERIFY CORS (should print access-control-allow-origin: *)
//   curl -sI -H "Origin: https://drahmedlouay.github.io" \
//        "https://script.google.com/macros/s/<ID>/exec?fileId=<DRIVE_FILE_ID>"
//
// NOTE: the payload is returned base64-encoded (Apps Script cannot stream raw
// binary safely); the AR page decodes it automatically when it detects an
// Apps Script endpoint.
// ---------------------------------------------------------------------------

var DEFAULT_MIME = 'model/gltf-binary';

function doGet(e) {
  var params = (e && e.parameter) || {};
  var fileId = params.fileId || params.id || extractDriveId(params.url || params.src || '');

  if (!fileId) {
    return fail('Missing "fileId" parameter. Usage: .../exec?fileId=<DRIVE_FILE_ID>');
  }

  var file;
  try {
    file = DriveApp.getFileById(fileId);
  } catch (err) {
    return fail('Cannot access the file. Make sure it is shared as "Anyone with the link". (' + err + ')');
  }
  if (!file) {
    return fail('File not found: ' + fileId);
  }

  var blob = file.getBlob();
  var mime = blob.getContentType() || DEFAULT_MIME;
  if (mime === 'application/octet-stream' || !/\//.test(mime)) {
    mime = /\.ifc$/i.test(file.getName()) ? 'application/x-step' : DEFAULT_MIME;
  }

  // base64 payload: safe for any binary, decoded by the client
  var base64 = Utilities.base64Encode(blob.getBytes());

  return ContentService
    .createTextOutput(base64)
    .setMimeType('text/plain; charset=utf-8')
    .setHeaders({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Type, Content-Disposition',
      'X-File-Name': file.getName(),
      'X-File-Mime': mime,
      'Cache-Control': 'public, max-age=300'
    });
}

function doOptions() {
  return ContentService
    .createTextOutput('')
    .setMimeType('text/plain')
    .setHeaders({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range'
    });
}

function extractDriveId(url) {
  var patterns = [
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/uc\?[^#]*id=([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/open\?[^#]*id=([a-zA-Z0-9_-]+)/,
    /docs\.google\.com\/uc\?[^#]*id=([a-zA-Z0-9_-]+)/
  ];
  for (var i = 0; i < patterns.length; i++) {
    var m = String(url).match(patterns[i]);
    if (m && m[1]) return m[1];
  }
  return null;
}

function fail(message) {
  return ContentService
    .createTextOutput('ERROR: ' + message)
    .setMimeType('text/plain; charset=utf-8')
    .setHeaders({
      'Access-Control-Allow-Origin': '*',
      'X-Proxy-Error': '1'
    });
}
