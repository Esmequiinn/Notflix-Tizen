"use strict";

var http = require("http");
var https = require("https");
var urlLib = require("url");
var querystring = require("querystring");

var MAX_REDIRECTS = 6;
var REQUEST_TIMEOUT_MS = 20000;
var MAX_PLAYLIST_BYTES = 6 * 1024 * 1024;
var REPORT_TTL_MS = 120000;
var DEFAULT_USER_AGENT =
  "Mozilla/5.0 (SMART-TV; Linux; Tizen 5.5) AppleWebKit/537.36 (KHTML, like Gecko) Version/5.5 TV Safari/537.36";
var PASS_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "last-modified",
  "etag",
  "cache-control"
];

var server = null;
var reports = {};
var info = { lite: true, reason: "" };

function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function parseHeaderList(list) {
  var headers = {};
  toArray(list).forEach(function (entry) {
    var text = String(entry || "");
    var index = text.indexOf(":");
    if (index <= 0) return;
    var key = text.slice(0, index).trim();
    var value = text.slice(index + 1);
    try {
      value = decodeURIComponent(value);
    } catch (_) {}
    if (key && value) headers[key.toLowerCase()] = value;
  });
  return headers;
}

function validTrace(id) {
  return typeof id === "string" && /^[0-9a-f]{32}$/.test(id);
}

function pruneReports() {
  var now = Date.now();
  Object.keys(reports).forEach(function (id) {
    if (now - reports[id].touched > REPORT_TTL_MS) delete reports[id];
  });
}

function sendJson(res, status, body) {
  var text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(text),
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(text);
}

function sendError(res, status, message) {
  if (res.headersSent) {
    try {
      res.end();
    } catch (_) {}
    return;
  }
  var text = String(message || "Proxy error");
  res.writeHead(status, {
    "Content-Type": "text/plain",
    "Content-Length": Buffer.byteLength(text),
    "Access-Control-Allow-Origin": "*"
  });
  res.end(text);
}

function originOf(parsed) {
  return parsed.protocol + "//" + parsed.host;
}

function buildProxyUrl(baseUrl, absoluteUrl, headerList, trace) {
  var parsed = urlLib.parse(absoluteUrl);
  if (!parsed.protocol || !parsed.host) return absoluteUrl;
  var opts = { d: originOf(parsed) };
  if (headerList.length) opts.h = headerList;
  if (trace) opts.nuvioTrace = trace;
  return baseUrl + "/proxy/" + querystring.stringify(opts) + (parsed.path || "/");
}

function fetchUpstream(target, headers, method, redirectsLeft, done) {
  var parsed = urlLib.parse(target);
  var client = parsed.protocol === "https:" ? https : http;
  var finished = false;
  function finish(error, response, finalUrl) {
    if (finished) return;
    finished = true;
    done(error, response, finalUrl);
  }
  var request;
  try {
    request = client.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.path,
        method: method,
        headers: headers,
        rejectUnauthorized: false
      },
      function (response) {
        var status = Number(response.statusCode || 0);
        var location = response.headers.location;
        if (status >= 300 && status < 400 && location && redirectsLeft > 0) {
          response.resume();
          fetchUpstream(
            urlLib.resolve(target, location),
            headers,
            method,
            redirectsLeft - 1,
            finish
          );
          return;
        }
        finish(null, response, target);
      }
    );
  } catch (error) {
    finish(error);
    return;
  }
  request.setTimeout(REQUEST_TIMEOUT_MS, function () {
    request.abort();
    finish(new Error("Upstream timeout"));
  });
  request.on("error", function (error) {
    finish(error);
  });
  request.end();
}

function isPlaylist(response, finalUrl) {
  var type = String(response.headers["content-type"] || "").toLowerCase();
  if (type.indexOf("mpegurl") >= 0) return true;
  var path = String(urlLib.parse(finalUrl).pathname || "").toLowerCase();
  return /\.m3u8?$/.test(path);
}

function rewritePlaylist(text, finalUrl, baseUrl, headerList) {
  function proxied(value) {
    var absolute = urlLib.resolve(finalUrl, value);
    if (!/^https?:\/\//i.test(absolute)) return value;
    return buildProxyUrl(baseUrl, absolute, headerList, "");
  }
  return text
    .split(/\r?\n/)
    .map(function (line) {
      var trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.charAt(0) === "#") {
        return line.replace(/URI="([^"]+)"/g, function (_, uri) {
          return 'URI="' + proxied(uri) + '"';
        });
      }
      return proxied(trimmed);
    })
    .join("\n");
}

function handleProxy(req, res) {
  var raw = String(req.url || "");
  var rest = raw.slice("/proxy/".length);
  var slash = rest.indexOf("/");
  var optsText = slash >= 0 ? rest.slice(0, slash) : rest;
  var tail = slash >= 0 ? rest.slice(slash) : "/";
  var opts = querystring.parse(optsText);

  if (opts.nuvioReport === "1") {
    pruneReports();
    var record = validTrace(opts.nuvioTrace) ? reports[opts.nuvioTrace] : null;
    if (!validTrace(opts.nuvioTrace)) {
      sendJson(res, 400, { status: "invalid" });
      return;
    }
    if (record) record.touched = Date.now();
    sendJson(
      res,
      200,
      record && record.resolvedUrl
        ? {
            status: "resolved",
            requestedUrl: record.requestedUrl,
            resolvedUrl: record.resolvedUrl,
            sequence: record.sequence
          }
        : { status: "pending" }
    );
    return;
  }

  var destination = String(opts.d || "");
  if (!/^https?:\/\/[^/]+$/i.test(destination)) {
    sendError(res, 400, "Missing destination");
    return;
  }
  var target = destination + tail;
  var headerList = toArray(opts.h).map(String);
  var headers = parseHeaderList(headerList);
  if (!headers["user-agent"]) headers["user-agent"] = DEFAULT_USER_AGENT;
  if (!headers.accept) headers.accept = "*/*";
  if (req.headers.range) headers.range = req.headers.range;
  var method = req.method === "HEAD" ? "HEAD" : "GET";
  var trace = validTrace(opts.nuvioTrace) ? opts.nuvioTrace : "";
  var sequence = 0;
  if (trace) {
    pruneReports();
    var entry = reports[trace];
    if (!entry || entry.requestedUrl !== target) {
      entry = reports[trace] = { requestedUrl: target, sequence: 0, touched: Date.now() };
    }
    entry.sequence += 1;
    entry.touched = Date.now();
    sequence = entry.sequence;
  }

  fetchUpstream(target, headers, method, MAX_REDIRECTS, function (error, response, finalUrl) {
    if (error || !response) {
      sendError(res, 502, error && error.message ? error.message : "Upstream error");
      return;
    }
    var status = Number(response.statusCode || 502);
    if (trace && reports[trace] && reports[trace].sequence === sequence && status >= 200 && status < 300) {
      reports[trace].resolvedUrl = finalUrl;
      reports[trace].touched = Date.now();
    }
    var host = String(req.headers.host || "127.0.0.1:" + (server && server.address() ? server.address().port : 2710));
    var baseUrl = "http://" + host;

    if (method === "GET" && status >= 200 && status < 300 && isPlaylist(response, finalUrl)) {
      var chunks = [];
      var size = 0;
      response.on("data", function (chunk) {
        size += chunk.length;
        if (size > MAX_PLAYLIST_BYTES) {
          response.destroy();
          sendError(res, 502, "Playlist too large");
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", function () {
        if (res.headersSent) return;
        var body = rewritePlaylist(
          Buffer.concat(chunks).toString("utf8"),
          finalUrl,
          baseUrl,
          headerList
        );
        res.writeHead(200, {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Content-Length": Buffer.byteLength(body),
          "Cache-Control": "no-cache",
          "Access-Control-Allow-Origin": "*"
        });
        res.end(body);
      });
      response.on("error", function (streamError) {
        sendError(res, 502, streamError && streamError.message);
      });
      return;
    }

    var outHeaders = { "Access-Control-Allow-Origin": "*" };
    PASS_HEADERS.forEach(function (name) {
      if (response.headers[name] != null) outHeaders[name] = response.headers[name];
    });
    res.writeHead(status, outHeaders);
    response.pipe(res);
    response.on("error", function () {
      try {
        res.end();
      } catch (_) {}
    });
    req.on("close", function () {
      try {
        response.destroy();
      } catch (_) {}
    });
  });
}

function handle(req, res) {
  var path = String(req.url || "/");
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS"
    });
    res.end();
    return;
  }
  if (path.indexOf("/settings") === 0) {
    sendJson(res, 200, { lite: true, reason: info.reason, node: process.version || "" });
    return;
  }
  if (path.indexOf("/removeAll") === 0) {
    sendJson(res, 200, {});
    return;
  }
  if (path.indexOf("/proxy/") === 0) {
    handleProxy(req, res);
    return;
  }
  sendError(res, 404, "Not found");
}

exports.start = function (port, reason) {
  if (server) return server;
  info.reason = String(reason || "");
  server = http.createServer(handle);
  server.on("error", function () {});
  server.listen(Number(port || 2710));
  return server;
};

exports.stop = function () {
  if (!server) return;
  try {
    server.close();
  } catch (_) {}
  server = null;
};
