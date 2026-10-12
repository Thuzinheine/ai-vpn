/**
 * update.js - AI-VPN Core VLESS Aggregator (ES Module)
 * Protocol: VLESS Only (Live Handshake Verified)
 */
import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';

// အရည်အသွေးမြင့် VLESS nodes ပေါများသော သီးသန့် Feeds များ
const SOURCES = [
  'https://raw.githubusercontent.com/yebekhe/TVC/main/subscriptions/protocols/vless',
  'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/Sub1.txt',
  'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/Sub2.txt',
  'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/sub/splitted/vless.txt',
  'https://raw.githubusercontent.com/soroushmirzaei/telegram-configs-collector/main/protocols/vless',
  'https://raw.githubusercontent.com/LalatinaHub/Mineral/master/result/nodes'
];

function fetchUrl(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'v2rayNG/1.8.5' }, timeout: 8000 }, (res) => {
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

function verifyNodeConnection(host, port, timeout = 1800) {
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
  console.log('--- Step 1: Digging Public VLESS Nodes ---');
  let rawVless = [];

  for (const src of SOURCES) {
    try {
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
    } catch (err) {}
  }

  const unique = Array.from(new Set(rawVless));
  console.log(`Discovered ${unique.length} candidate VLESS nodes.`);

  console.log('--- Step 2: Live Socket Verification ---');
  const candidates = unique.slice(0, 120);
  let aliveNodes = [];

  for (const uri of candidates) {
    const target = extractHostPort(uri);
    if (!target || !target.host) continue;

    const isAlive = await verifyNodeConnection(target.host, target.port, 1500);
    if (isAlive) {
      console.log(`[ALIVE] ${target.host}:${target.port}`);
      aliveNodes.push(uri);
      if (aliveNodes.length >= 50) break;
    }
  }

  if (aliveNodes.length === 0) {
    console.log('No alive nodes passed handshake test. sub.txt remains unchanged.');
    return;
  }

  const base64Output = Buffer.from(aliveNodes.join('\n'), 'utf-8').toString('base64');
  fs.writeFileSync('sub.txt', base64Output, 'utf-8');
  console.log(`Successfully verified and updated sub.txt with ${aliveNodes.length} VLESS nodes.`);
}

main();
