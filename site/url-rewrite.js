// CloudFront Function (viewer-request) for clean URLs.
//
// The origin is the S3 website endpoint, which only understands index
// documents, so /privacy has to be mapped to /privacy.html before the
// request reaches it. The .html URLs themselves keep working untouched;
// each page's canonical tag points at the clean form, so search engines
// treat the pair as one page.
//
// Trailing slashes redirect to the bare path (/privacy/ -> /privacy) so
// there is exactly one URL that ever appears in the address bar.

function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (uri !== '/' && uri.endsWith('/')) {
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: { location: { value: uri.slice(0, -1) } },
    };
  }

  // No dot in the last segment means it is a page, not an asset.
  if (uri !== '/' && !uri.split('/').pop().includes('.')) {
    request.uri = uri + '.html';
  }

  return request;
}
