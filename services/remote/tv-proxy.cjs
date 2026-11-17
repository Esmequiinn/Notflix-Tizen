"use strict";

const liteProxy = require("../tizen/runtime/lite-proxy.cjs");

const port = Number(process.env.PORT || 7100);
const key = String(process.env.PROXY_KEY || "").trim();
const publicUrl = String(process.env.PUBLIC_URL || "").replace(/\/+$/, "");

if (!key || key.length < 16) {
  console.error("PROXY_KEY must have at least 16 characters");
  process.exit(1);
}
if (!/^https?:\/\//.test(publicUrl)) {
  console.error(
    "PUBLIC_URL must be the public address, for example https://example.duckdns.org/tvproxy"
  );
  process.exit(1);
}

const prefixPath = new URL(publicUrl).pathname.replace(/\/+$/, "");

liteProxy.start(port, "remote", {
  prefix: `${prefixPath}/${key}`,
  publicBase: `${publicUrl}/${key}`,
  host: "127.0.0.1"
});

console.log(`tv-proxy listening on 127.0.0.1:${port} for ${publicUrl}/<key>`);
