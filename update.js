/**
 * update.js - NiREvil/vless Specialized Aggregator (ES Module)
 */
import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';

// NiREvil/vless ၏ အဓိက Sub Links များ
const SOURCES = [
  'https://raw.githubusercontent.com/NiREvil/vless/main/sub/link',
  'https://raw.githubusercontent.com/NiREvil/vless/main/sub/base64',
  'https://raw.githubusercontent.com/NiREvil/vless/main/sub/clash',
  'https://raw.githubusercontent.com/yebekhe/TVC/main/subscriptions/protocols/vless'
];

function fetchUrl(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'v2rayNG/1.8.5' }, timeout: 10000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
}

function decodeRecursive(content) {
  if (!content) return '';
  content = content.trim();
  for (let i = 0; i < 3; i++) {
    try {
      const buff = Buffer.from(content.replace(/\s+/g, ''), 'base64');
      const decoded = buff.toString('utf-8');
      if (decoded.includes('://')) content = decoded;
      else break;
    } catch (e) { break; }
  }
  return content;
}

function verifyNodeConnection(host, port, timeout = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);

    socket.connect(port, host, () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function extractHostPort(uri) {
  try {
    const clean = uri.replace(/^vless:\/\//, '');
    const mainPart = clean.split('?')[0].split('#')[0];
    const hostPort = mainPart.includes('@') ? mainPart.split('@')[1] : mainPart;
    const parts = hostPort.split(':');
    const host = parts[0];
    const port = parseInt(parts[1], 10) || 443;
    return { host, port };
  } catch (e) {
    return null;
  }
}

async function main() {
  console.log('--- Step 1: Digging NiREvil/vless Nodes ---');
  let rawVless = [];

  for (const src of SOURCES) {
    try {
      console.log(`Fetching: ${src}`);
      const raw = await fetchUrl(src);
      const text = decodeRecursive(raw);
      const lines = text.split(/[\r\n]+/);

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith('vless://')) {
          rawVless.push(trimmed);
        }
      }
    } catch (err) {
      console.log(`Failed: ${src}`);
    }
  }

  const unique = Array.from(new Set(rawVless));
  console.log(`Discovered ${unique.length} candidate nodes from NiREvil/vless.`);

  console.log('--- Step 2: Testing TCP Handshake ---');
  const candidates = unique.slice(0, 150);
  let aliveNodes = [];

  for (const uri of candidates) {
    const target = extractHostPort(uri);
    if (!target || !target.host) continue;

    const isAlive = await verifyNodeConnection(target.host, target.port, 1200);
    if (isAlive) {
      console.log(`[PASS] ${target.host}:${target.port}`);
      aliveNodes.push(uri);
      if (aliveNodes.length >= 60) break;
    }
  }

  if (aliveNodes.length === 0) {
    console.log('No alive nodes found. Leaving sub.txt untouched.');
    return;
  }

  const base64Output = Buffer.from(aliveNodes.join('\n'), 'utf-8').toString('base64');
  fs.writeFileSync('sub.txt', base64Output, 'utf-8');
  console.log(`Successfully updated sub.txt with ${aliveNodes.length} NiREvil nodes.`);
}

main();
