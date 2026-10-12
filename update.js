/**
 * update.js - True GeoIP Verified Multi-Protocol Aggregator (ES Module)
 */
import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';
import dns from 'node:dns/promises';

const SOURCES = [
  // 10ium Country Asia Feeds (Clean IPs)
  'https://raw.githubusercontent.com/10ium/telegram-configs-collector/main/countries/singapore',
  'https://raw.githubusercontent.com/10ium/telegram-configs-collector/main/countries/japan',
  'https://raw.githubusercontent.com/10ium/telegram-configs-collector/main/countries/hong%20kong',
  'https://raw.githubusercontent.com/10ium/telegram-configs-collector/main/countries/malaysia',
  // Dedicated Multi-Protocol Mix Feeds
  'https://raw.githubusercontent.com/NiREvil/vless/main/sub/link',
  'https://raw.githubusercontent.com/yebekhe/TVC/main/subscriptions/protocols/vless',
  'https://raw.githubusercontent.com/yebekhe/TVC/main/subscriptions/protocols/vmess',
  'https://raw.githubusercontent.com/yebekhe/TVC/main/subscriptions/protocols/hysteria2',
  'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/Sub1.txt'
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

// Host & Port ခွဲထုတ်ခြင်း
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
    const parsedUrl = new URL(uri);
    const host = parsedUrl.hostname;
    const port = parseInt(parsedUrl.port, 10) || 443;
    if (host) return { host, port };
  } catch (e) {
    try {
      const clean = uri.replace(/^[^:]+:\/\//, '');
      const mainPart = clean.split('?')[0].split('#')[0];
      const hostPort = mainPart.includes('@') ? mainPart.split('@')[1] : mainPart;
      const parts = hostPort.split(':');
      return { host: parts[0], port: parseInt(parts[1], 10) || 443 };
    } catch (err) {}
  }
  return null;
}

// Real IP & Country Lookup စစ်ဆေးခြင်း
async function resolveTrueCountry(host) {
  try {
    let targetIp = host;
    if (!net.isIP(host)) {
      const resolved = await dns.lookup(host);
      targetIp = resolved.address;
    }
    const rawGeo = await fetchUrl(`https://ipwho.is/${targetIp}`);
    const geo = JSON.parse(rawGeo);
    if (geo && geo.success) {
      return { code: geo.country_code || 'UN', name: geo.country || 'Unknown' };
    }
  } catch (e) {}
  return { code: 'UN', name: 'Global Edge' };
}

// Config ၏ နာမည် (#hash သို့မဟုတ် vmess ps) တွင် တကယ့် Country Tag ထည့်ခြင်း
function injectCountryToUri(uri, countryCode, countryName, index) {
  const label = `[${countryCode}] ${countryName} - Node ${index}`;
  try {
    if (uri.startsWith('vmess://')) {
      const b64 = uri.replace('vmess://', '').trim();
      const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
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
  console.log('--- Step 1: Digging Raw Feeds ---');
  let rawNodes = [];

  for (const src of SOURCES) {
    try {
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
  console.log(`Discovered ${unique.length} candidate nodes.`);

  console.log('--- Step 2: Protocol-Balanced Verification & GeoIP Lookup ---');
  const buckets = { vless: [], vmess: [], trojan: [], ss: [], hy2: [] };
  
  unique.forEach(uri => {
    if (uri.startsWith('vless://')) buckets.vless.push(uri);
    else if (uri.startsWith('vmess://')) buckets.vmess.push(uri);
    else if (uri.startsWith('trojan://')) buckets.trojan.push(uri);
    else if (uri.startsWith('ss://')) buckets.ss.push(uri);
    else if (uri.startsWith('hy2://') || uri.startsWith('hysteria2://')) buckets.hy2.push(uri);
  });

  let aliveNodes = [];
  let globalIndex = 1;

  for (const [proto, list] of Object.entries(buckets)) {
    let count = 0;
    for (const uri of list.slice(0, 35)) {
      const target = extractHostPort(uri);
      if (!target || !target.host) continue;

      const isAlive = await verifyNodeConnection(target.host, target.port, 1200);
      if (isAlive) {
        // True GeoIP ရှာဖွေခြင်း
        const country = await resolveTrueCountry(target.host);
        console.log(`[ALIVE] ${target.host}:${target.port} -> Real Country: ${country.code} (${country.name})`);
        
        const taggedUri = injectCountryToUri(uri, country.code, country.name, globalIndex++);
        aliveNodes.push(taggedUri);
        count++;
        if (count >= 12) break;
      }
    }
  }

  if (aliveNodes.length === 0) {
    console.log('No alive nodes found.');
    return;
  }

  const base64Output = Buffer.from(aliveNodes.join('\n'), 'utf-8').toString('base64');
  fs.writeFileSync('sub.txt', base64Output, 'utf-8');
  console.log(`Successfully generated sub.txt with ${aliveNodes.length} Verified GeoIP Nodes.`);
}

main();
