/**
 * update.js - 10ium Country Feeds Dedicated Aggregator (ES Module)
 * Upstream Source: https://github.com/10ium/telegram-configs-collector
 */
import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';

// သတ်မှတ်ထားသော 10ium Asia Country Links များသာ သီးသန့် အသုံးပြုသည်
const SOURCES = [
  { code: 'HK', name: 'Hong Kong', url: 'https://raw.githubusercontent.com/10ium/telegram-configs-collector/main/countries/hk/mixed' },
  { code: 'IN', name: 'India', url: 'https://raw.githubusercontent.com/10ium/telegram-configs-collector/main/countries/in/mixed' },
  { code: 'ID', name: 'Indonesia', url: 'https://raw.githubusercontent.com/10ium/telegram-configs-collector/main/countries/id/mixed' },
  { code: 'JP', name: 'Japan', url: 'https://raw.githubusercontent.com/10ium/telegram-configs-collector/main/countries/jp/mixed' },
  { code: 'MY', name: 'Malaysia', url: 'https://raw.githubusercontent.com/10ium/telegram-configs-collector/main/countries/my/mixed' },
  { code: 'PK', name: 'Pakistan', url: 'https://raw.githubusercontent.com/10ium/telegram-configs-collector/main/countries/pk/mixed' },
  { code: 'PH', name: 'Philippines', url: 'https://raw.githubusercontent.com/10ium/telegram-configs-collector/main/countries/ph/mixed' },
  { code: 'TH', name: 'Thailand', url: 'https://raw.githubusercontent.com/10ium/telegram-configs-collector/main/countries/th/mixed' },
  { code: 'VN', name: 'Vietnam', url: 'https://raw.githubusercontent.com/10ium/telegram-configs-collector/main/countries/vn/mixed' }
];

const SUPPORTED_PROTOCOLS = ['vless://', 'vmess://', 'trojan://', 'ss://', 'hy2://', 'hysteria2://'];

function fetchUrl(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: { 'User-Agent': 'v2rayNG/1.8.5' },
      timeout: 10000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });

    req.on('error', () => resolve(''));
    req.on('timeout', () => {
      req.destroy();
      resolve('');
    });
  });
}

function decodeRecursive(content) {
  if (!content) return '';
  content = content.trim();
  for (let i = 0; i < 3; i++) {
    try {
      const buff = Buffer.from(content.replace(/\s+/g, ''), 'base64');
      const decoded = buff.toString('utf-8');
      if (decoded.includes('://')) {
        content = decoded;
      } else {
        break;
      }
    } catch (e) {
      break;
    }
  }
  return content;
}

function verifyNodeConnection(host, port, timeout = 1400) {
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
    if (uri.startsWith('vmess://')) {
      const rawB64 = uri.replace(/^vmess:\/\//i, '').trim();
      const json = JSON.parse(Buffer.from(rawB64, 'base64').toString('utf-8'));
      const host = json.add || json.host || json.sni;
      const port = parseInt(json.port, 10) || 443;
      if (host) return { host, port };
    }

    if (uri.startsWith('ss://')) {
      const clean = uri.replace(/^ss:\/\//i, '').split('#')[0];
      const atSplit = clean.split('@');
      let hostPort = atSplit.length > 1 ? atSplit[1] : '';
      if (!hostPort) {
        const decoded = Buffer.from(atSplit[0], 'base64').toString('utf-8');
        hostPort = decoded.split('@')[1] || decoded;
      }
      const parts = hostPort.split(':');
      const host = parts[0];
      const port = parseInt(parts[1], 10) || 8388;
      if (host) return { host, port };
    }

    try {
      const parsedUrl = new URL(uri);
      const host = parsedUrl.hostname;
      const port = parseInt(parsedUrl.port, 10) || 443;
      if (host) return { host, port };
    } catch (urlErr) {
      const clean = uri.replace(/^[^:]+:\/\//, '');
      const mainPart = clean.split('?')[0].split('#')[0];
      const hostPort = mainPart.includes('@') ? mainPart.split('@')[1] : mainPart;
      const parts = hostPort.split(':');
      const host = parts[0];
      const port = parseInt(parts[1], 10) || 443;
      if (host) return { host, port };
    }
  } catch (e) {
    return null;
  }
  return null;
}

function tagCountryNode(uri, countryCode, countryName, index) {
  const label = `[${countryCode}] ${countryName} - Node ${index}`;
  try {
    if (uri.startsWith('vmess://')) {
      const rawB64 = uri.replace(/^vmess:\/\//i, '').trim();
      const json = JSON.parse(Buffer.from(rawB64, 'base64').toString('utf-8'));
      json.ps = label;
      return 'vmess://' + Buffer.from(JSON.stringify(json)).toString('base64');
    }
    const baseUri = uri.split('#')[0];
    return `${baseUri}#${encodeURIComponent(label)}`;
  } catch (e) {
    return uri;
  }
}

async function main() {
  console.log('=== Checking 10ium Dedicated Country Feeds ===');
  let verifiedPool = [];
  let nodeCounter = 1;

  for (const src of SOURCES) {
    try {
      console.log(`Checking ${src.name} (${src.code})...`);
      const raw = await fetchUrl(src.url);
      const decoded = decodeRecursive(raw);
      const lines = decoded.split(/[\r\n]+/);

      let candidateList = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (SUPPORTED_PROTOCOLS.some(proto => trimmed.toLowerCase().startsWith(proto))) {
          candidateList.push(trimmed);
        }
      }

      const uniqueCandidates = Array.from(new Set(candidateList));
      console.log(`-> Found ${uniqueCandidates.length} raw nodes for ${src.code}. Running handshake...`);

      let passedCount = 0;
      // နိုင်ငံတစ်ခုစီမှ အမြန်ဆုံး အလုပ်လုပ်သော node ၆ ခုစီ ညီမျှစွာ စစ်ထုတ်ယူခြင်း
      for (const uri of uniqueCandidates) {
        const target = extractHostPort(uri);
        if (!target || !target.host) continue;

        const isAlive = await verifyNodeConnection(target.host, target.port, 1200);
        if (isAlive) {
          const tagged = tagCountryNode(uri, src.code, src.name, nodeCounter++);
          verifiedPool.push(tagged);
          passedCount++;
          if (passedCount >= 6) break;
        }
      }
      console.log(`-> Verified ${passedCount} live nodes for ${src.code}`);
    } catch (err) {
      console.log(`Error processing ${src.code}: ${err.message}`);
    }
  }

  console.log(`Total live verified nodes collected: ${verifiedPool.length}`);

  if (verifiedPool.length === 0) {
    console.log('No live nodes detected. sub.txt remains unchanged.');
    return;
  }

  const base64Output = Buffer.from(verifiedPool.join('\n'), 'utf-8').toString('base64');
  fs.writeFileSync('sub.txt', base64Output, 'utf-8');
  console.log('Successfully written active country nodes to sub.txt');
}

main();
