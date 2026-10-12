/**
 * update.js - Universal Multi-Protocol Aggregator (ES Module)
 * Protocols: VLESS, VMess, Trojan, Shadowsocks, Hysteria 2
 */
import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';

const SOURCES = [
  // NiREvil multi-protocol feeds
  'https://raw.githubusercontent.com/NiREvil/vless/main/sub/link',
  'https://raw.githubusercontent.com/NiREvil/vless/main/sub/base64',
  // Universal Top Mix Subscriptions
  'https://raw.githubusercontent.com/yebekhe/TVC/main/subscriptions/xray/normal/mix',
  'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/Sub1.txt',
  'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/Sub2.txt',
  'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/sub/sub_merge.txt',
  'https://raw.githubusercontent.com/soroushmirzaei/telegram-configs-collector/main/protocols/hysteria',
  'https://raw.githubusercontent.com/soroushmirzaei/telegram-configs-collector/main/protocols/trojan',
  'https://raw.githubusercontent.com/soroushmirzaei/telegram-configs-collector/main/protocols/shadowsocks'
];

const SUPPORTED_PROTOCOLS = ['vless://', 'vmess://', 'trojan://', 'ss://', 'hy2://', 'hysteria2://'];

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

// VMess (Base64 JSON), VLESS, Trojan, SS, Hy2 အားလုံးဆီမှ Host နှင့် Port ကို ထုတ်ယူခြင်း
function extractHostPort(uri) {
  try {
    if (uri.startsWith('vmess://')) {
      const b64 = uri.replace('vmess://', '').trim();
      const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
      return { host: json.add, port: parseInt(json.port, 10) || 443 };
    }

    if (uri.startsWith('ss://')) {
      const clean = uri.replace('ss://', '').split('#')[0];
      const atSplit = clean.split('@');
      let hostPort = atSplit.length > 1 ? atSplit[1] : '';
      if (!hostPort) {
        const decoded = Buffer.from(atSplit[0], 'base64').toString('utf-8');
        hostPort = decoded.split('@')[1] || decoded;
      }
      const parts = hostPort.split(':');
      return { host: parts[0], port: parseInt(parts[1], 10) || 8388 };
    }

    // vless, trojan, hy2
    const clean = uri.replace(/^[^:]+:\/\//, '');
    const mainPart = clean.split('?')[0].split('#')[0];
    const hostPort = mainPart.includes('@') ? mainPart.split('@')[1] : mainPart;
    const parts = hostPort.split(':');
    return { host: parts[0], port: parseInt(parts[1], 10) || 443 };
  } catch (e) {
    return null;
  }
}

async function main() {
  console.log('--- Step 1: Digging All Multi-Protocol Nodes ---');
  let rawNodes = [];

  for (const src of SOURCES) {
    try {
      console.log(`Fetching: ${src}`);
      const raw = await fetchUrl(src);
      const text = decodeRecursive(raw);
      const lines = text.split(/[\r\n]+/);

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (SUPPORTED_PROTOCOLS.some(proto => trimmed.startsWith(proto))) {
          rawNodes.push(trimmed);
        }
      }
    } catch (err) {}
  }

  const unique = Array.from(new Set(rawNodes));
  console.log(`Discovered ${unique.length} candidate nodes across all protocols.`);

  console.log('--- Step 2: Testing TCP Handshake ---');
  const candidates = unique.slice(0, 180);
  let aliveNodes = [];

  for (const uri of candidates) {
    const target = extractHostPort(uri);
    if (!target || !target.host) continue;

    const isAlive = await verifyNodeConnection(target.host, target.port, 1200);
    if (isAlive) {
      console.log(`[ALIVE] ${target.host}:${target.port}`);
      aliveNodes.push(uri);
      if (aliveNodes.length >= 70) break;
    }
  }

  if (aliveNodes.length === 0) {
    console.log('No alive nodes found. Leaving sub.txt untouched.');
    return;
  }

  const base64Output = Buffer.from(aliveNodes.join('\n'), 'utf-8').toString('base64');
  fs.writeFileSync('sub.txt', base64Output, 'utf-8');
  console.log(`Successfully updated sub.txt with ${aliveNodes.length} live verified nodes.`);
}

main();
