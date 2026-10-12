/**
 * update.js - AI-VPN Core Live Verification Scraper
 * Protocols: Hysteria 2 & VLESS Reality (Verified Active Only)
 */
import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';

const SOURCES = [
  'https://raw.githubusercontent.com/yebekhe/TVC/main/subscriptions/protocols/hysteria2',
  'https://raw.githubusercontent.com/soroushmirzaei/telegram-configs-collector/main/protocols/hysteria',
  'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/sub/splitted/hysteria2.txt',
  'https://raw.githubusercontent.com/soroushmirzaei/telegram-configs-collector/main/protocols/reality',
  'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/sub/splitted/reality.txt',
  'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/Sub1.txt'
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

// Server IP/Port အမှန်တကယ် ပွင့်/မပွင့် TCP Handshake စစ်ဆေးခြင်း
function verifyNodeConnection(host, port, timeout = 2500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let status = false;

    socket.setTimeout(timeout);

    socket.connect(port, host, () => {
      status = true;
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

// URI ထဲမှ Host နှင့် Port ကို ထုတ်ယူခြင်း
function extractHostPort(uri) {
  try {
    const clean = uri.replace(/^(vless|hy2|hysteria2):\/\//, '');
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
  console.log('--- Step 1: Scraping Raw Feeds ---');
  let rawList = [];

  for (const src of SOURCES) {
    try {
      const raw = await fetchUrl(src);
      const text = decodeRecursive(raw);
      const lines = text.split(/[\r\n]+/);

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const isHy2 = trimmed.startsWith('hy2://') || trimmed.startsWith('hysteria2://');
        const isReality = trimmed.startsWith('vless://') && trimmed.includes('security=reality');

        if (isHy2 || isReality) {
          rawList.push(trimmed);
        }
      }
    } catch (err) {}
  }

  const unique = Array.from(new Set(rawList));
  console.log(`Discovered ${unique.length} candidate nodes. Starting live connectivity tests...`);

  console.log('--- Step 2: Live Ping/Socket Verification ---');
  let aliveNodes = [];

  // အများဆုံး စစ်ဆေးမည့် node ပမာဏ (အချိန်မကြာစေရန် ပထမ ၁၅၀ ခု စစ်ဆေးမည်)
  const candidates = unique.slice(0, 150);

  for (const uri of candidates) {
    const target = extractHostPort(uri);
    if (!target || !target.host) continue;

    const isAlive = await verifyNodeConnection(target.host, target.port, 2000);
    if (isAlive) {
      console.log(`[PASS] ${target.host}:${target.port}`);
      aliveNodes.push(uri);
      if (aliveNodes.length >= 35) break; // အသက်ရှင်သော node ၃၅ ခုရလျှင် ရပ်မည်
    }
  }

  console.log(`Verified ${aliveNodes.length} active live nodes.`);

  if (aliveNodes.length === 0) {
    console.log('Warning: No live nodes passed socket test. sub.txt remains unchanged.');
    return;
  }

  const base64Output = Buffer.from(aliveNodes.join('\n'), 'utf-8').toString('base64');
  fs.writeFileSync('sub.txt', base64Output, 'utf-8');
  console.log(`Successfully updated sub.txt with ${aliveNodes.length} VERIFIED active nodes.`);
}

main();
