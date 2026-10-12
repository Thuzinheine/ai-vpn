/**
 * update.js - Universal Multi-Protocol Verified Aggregator (ES Module)
 * Protocols: VLESS, VMess, Trojan, Shadowsocks, Hysteria 2
 * Features: True GeoIP Lookup + TCP Handshake Verification
 */
import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';
import dns from 'node:dns/promises';

// Protocol အစုံ သီးသန့် ထုတ်ပေးထားသော Direct Feeds များ
const SOURCES = [
  // 1. VLESS Dedicated
  'https://raw.githubusercontent.com/NiREvil/vless/main/sub/link',
  'https://raw.githubusercontent.com/yebekhe/TVC/main/subscriptions/protocols/vless',
  'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/sub/splitted/vless.txt',
  
  // 2. VMess Dedicated
  'https://raw.githubusercontent.com/yebekhe/TVC/main/subscriptions/protocols/vmess',
  'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/sub/splitted/vmess.txt',

  // 3. Hysteria 2 Dedicated
  'https://raw.githubusercontent.com/yebekhe/TVC/main/subscriptions/protocols/hysteria2',
  'https://raw.githubusercontent.com/soroushmirzaei/telegram-configs-collector/main/protocols/hysteria',
  'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/sub/splitted/hysteria2.txt',

  // 4. Trojan & Shadowsocks Dedicated
  'https://raw.githubusercontent.com/soroushmirzaei/telegram-configs-collector/main/protocols/trojan',
  'https://raw.githubusercontent.com/soroushmirzaei/telegram-configs-collector/main/protocols/shadowsocks',
  'https://raw.githubusercontent.com/10ium/telegram-configs-collector/main/countries/singapore',
  'https://raw.githubusercontent.com/10ium/telegram-configs-collector/main/countries/japan'
];

const SUPPORTED_PROTOCOLS = ['vless://', 'vmess://', 'trojan://', 'ss://', 'hy2://', 'hysteria2://'];

// Helper: HTTP/HTTPS URL များဆီမှ Data ဆွဲယူခြင်း (Redirect handling အပြည့်အစုံ)
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

// Helper: Nested Base64 Decode ပြုလုပ်ခြင်း
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

// Helper: TCP Socket အစစ်အမှန်ဖြင့် Handshake စစ်ဆေးခြင်း
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

// Helper: Protocol အမျိုးမျိုးမှ Host နှင့် Port ကို အမှားအယွင်းမရှိ ခွဲထုတ်ခြင်း
function extractHostPort(uri) {
  try {
    // 1. VMess (Base64 JSON)
    if (uri.startsWith('vmess://')) {
      const rawB64 = uri.replace(/^vmess:\/\//i, '').trim();
      const json = JSON.parse(Buffer.from(rawB64, 'base64').toString('utf-8'));
      const host = json.add || json.host || json.sni;
      const port = parseInt(json.port, 10) || 443;
      if (host) return { host, port };
    }

    // 2. Shadowsocks
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

    // 3. VLESS, Trojan, Hysteria 2
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

// Helper: Real Server IP ရှာဖွေပြီး နိုင်ငံအမည်နှင့် Code စစ်ဆေးခြင်း
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

// Helper: Node နာမည်ထဲတွင် တကယ့် GeoIP Tag ထည့်သွင်းပေးခြင်း
function injectCountryToUri(uri, countryCode, countryName, index) {
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
  console.log('--- Step 1: Digging Multi-Protocol Candidates ---');
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
        if (SUPPORTED_PROTOCOLS.some(proto => trimmed.toLowerCase().startsWith(proto))) {
          rawNodes.push(trimmed);
        }
      }
    } catch (err) {
      console.log(`Failed to fetch from ${src}`);
    }
  }

  const unique = Array.from(new Set(rawNodes));
  console.log(`Discovered ${unique.length} candidate nodes across all protocols.`);

  console.log('--- Step 2: Protocol-Balanced Verification & GeoIP Tagging ---');
  // Protocol တစ်မျိုးတည်း မကြီးစိုးစေရန် Bucket ၅ ခု ခွဲခြားခြင်း
  const buckets = {
    vless: [],
    vmess: [],
    trojan: [],
    ss: [],
    hy2: []
  };

  unique.forEach(uri => {
    const lower = uri.toLowerCase();
    if (lower.startsWith('vless://')) buckets.vless.push(uri);
    else if (lower.startsWith('vmess://')) buckets.vmess.push(uri);
    else if (lower.startsWith('trojan://')) buckets.trojan.push(uri);
    else if (lower.startsWith('ss://')) buckets.ss.push(uri);
    else if (lower.startsWith('hy2://') || lower.startsWith('hysteria2://')) buckets.hy2.push(uri);
  });

  console.log(`[Bucket Pool] VLESS: ${buckets.vless.length} | VMess: ${buckets.vmess.length} | Trojan: ${buckets.trojan.length} | SS: ${buckets.ss.length} | Hy2: ${buckets.hy2.length}`);

  let aliveNodes = [];
  let globalIndex = 1;

  // Protocol တစ်မျိုးချင်းစီမှ အသက်ရှင်သော node များကို ညီမျှစွာ စစ်ထုတ်ခြင်း (အမျိုးအစားတစ်ခုလျှင် ၁၀ ခုစီ)
  for (const [proto, list] of Object.entries(buckets)) {
    console.log(`Testing protocol: ${proto.toUpperCase()} (${list.length} candidate nodes)`);
    let count = 0;

    for (const uri of list.slice(0, 40)) {
      const target = extractHostPort(uri);
      if (!target || !target.host) continue;

      const isAlive = await verifyNodeConnection(target.host, target.port, 1400);
      if (isAlive) {
        // True GeoIP ရှာဖွေခြင်း
        const country = await resolveTrueCountry(target.host);
        console.log(`[ALIVE] ${proto.toUpperCase()} -> ${target.host}:${target.port} (${country.code})`);
        
        const taggedUri = injectCountryToUri(uri, country.code, country.name, globalIndex++);
        aliveNodes.push(taggedUri);
        count++;

        if (count >= 10) break; // protocol တစ်ခုစီမှ ၁၀ ခုစီသာ ကန့်သတ်ယူမည်
      }
    }
  }

  if (aliveNodes.length === 0) {
    console.log('No alive nodes passed handshake test. sub.txt remains unchanged.');
    return;
  }

  // Base64 encode ပြုလုပ်ပြီး sub.txt ထဲသို့ ရေးသားခြင်း
  const base64Output = Buffer.from(aliveNodes.join('\n'), 'utf-8').toString('base64');
  fs.writeFileSync('sub.txt', base64Output, 'utf-8');
  console.log(`Successfully compiled sub.txt with ${aliveNodes.length} balanced nodes across all protocols!`);
}

main();
