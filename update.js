/**
 * update.js - 10ium/telegram-configs-collector Asia Dedicated Scraper
 * Country Targets: SG, JP, HK, MY, TH (Low Latency & Clean IP)
 */
import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';

// 10ium Country-based Subscription Links (Asia Region)
const SOURCES = [
  // Singapore (အနိမ့်ဆုံး Ping ရရှိနိုင်သော အဓိက Source)
  'https://raw.githubusercontent.com/10ium/telegram-configs-collector/main/countries/singapore',
  // Japan (AI Service များနှင့် Streaming များအတွက် အကောင်းဆုံး)
  'https://raw.githubusercontent.com/10ium/telegram-configs-collector/main/countries/japan',
  // Hong Kong
  'https://raw.githubusercontent.com/10ium/telegram-configs-collector/main/countries/hong%20kong',
  // Malaysia
  'https://raw.githubusercontent.com/10ium/telegram-configs-collector/main/countries/malaysia',
  // Thailand
  'https://raw.githubusercontent.com/10ium/telegram-configs-collector/main/countries/thailand'
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

// TCP Handshake ဖြင့် Node လက်ရှိ အသက်ရှင်နေခြင်း စစ်ဆေးခြင်း
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

// Host & Port ခွဲထုတ်ခြင်း (VMess, VLESS, Trojan, SS, Hy2 အားလုံး အကျုံးဝင်သည်)
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
  console.log('--- Step 1: Digging 10ium Asia Country Feeds ---');
  let rawNodes = [];

  for (const src of SOURCES) {
    try {
      console.log(`Fetching Country Feed: ${src}`);
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
    } catch (err) {
      console.log(`Failed: ${src}`);
    }
  }

  const unique = Array.from(new Set(rawNodes));
  console.log(`Found ${unique.length} candidate Asia nodes from 10ium.`);

  console.log('--- Step 2: Live Socket Handshake Verification ---');
  // Asia node များထဲမှ ပထမ ၁၅၀ ခုအား latency စစ်ဆေးခြင်း
  const candidates = unique.slice(0, 150);
  let aliveNodes = [];

  for (const uri of candidates) {
    const target = extractHostPort(uri);
    if (!target || !target.host) continue;

    const isAlive = await verifyNodeConnection(target.host, target.port, 1200);
    if (isAlive) {
      console.log(`[PASS LIVE] ${target.host}:${target.port}`);
      aliveNodes.push(uri);
      if (aliveNodes.length >= 60) break; // အကောင်းဆုံး ၆၀ ခု ရလျှင် ရပ်မည်
    }
  }

  if (aliveNodes.length === 0) {
    console.log('No alive nodes found. Leaving sub.txt untouched.');
    return;
  }

  const base64Output = Buffer.from(aliveNodes.join('\n'), 'utf-8').toString('base64');
  fs.writeFileSync('sub.txt', base64Output, 'utf-8');
  console.log(`Successfully compiled sub.txt with ${aliveNodes.length} Verified Asia Nodes!`);
}

main();
