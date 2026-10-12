/**
 * update.js - AI-VPN Core Aggregator
 * Protocols: Hysteria 2 (High Priority) & VLESS Reality
 */
import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';

// Hysteria 2 နှင့် Reality အစစ်အမှန်များ သီးသန့်တင်သော Public Feeds များ
const SOURCES = [
  // Hysteria 2 Dedicated Feeds
  'https://raw.githubusercontent.com/yebekhe/TVC/main/subscriptions/protocols/hysteria2',
  'https://raw.githubusercontent.com/soroushmirzaei/telegram-configs-collector/main/protocols/hysteria',
  'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/sub/splitted/hysteria2.txt',
  'https://raw.githubusercontent.com/LalatinaHub/Mineral/master/result/nodes',
  
  // VLESS Reality Dedicated Feeds
  'https://raw.githubusercontent.com/soroushmirzaei/telegram-configs-collector/main/protocols/reality',
  'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/sub/splitted/reality.txt',
  'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/Sub1.txt'
];

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
  // Multi-pass Base64 decode
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

async function main() {
  console.log('--- Aggregating Hysteria 2 & VLESS Reality ---');
  let hy2List = [];
  let realityList = [];

  for (const src of SOURCES) {
    try {
      console.log(`Checking: ${src}`);
      const raw = await fetchUrl(src);
      const text = decodeRecursive(raw);
      const lines = text.split(/[\r\n]+/);

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // 1. Hysteria 2 Extract
        if (trimmed.startsWith('hy2://') || trimmed.startsWith('hysteria2://')) {
          hy2List.push(trimmed);
        }
        // 2. Reality Extract
        else if (trimmed.startsWith('vless://') && trimmed.includes('security=reality')) {
          realityList.push(trimmed);
        }
      }
    } catch (err) {
      console.log(`Error reading ${src}: ${err.message}`);
    }
  }

  // Deduplicate
  const uniqueHy2 = Array.from(new Set(hy2List));
  const uniqueReality = Array.from(new Set(realityList));

  console.log(`[Results] Found Hy2: ${uniqueHy2.length} | Found Reality: ${uniqueReality.length}`);

  // Hysteria 2 ကို ဦးစားပေး အလုံးရေ ထည့်သွင်းခြင်း (ဥပမာ Hy2 မှ အလုံး ၂၅ ခု + Reality မှ အလုံး ၂၅ ခု)
  const finalNodes = [
    ...uniqueHy2.slice(0, 25),
    ...uniqueReality.slice(0, 25)
  ];

  if (finalNodes.length === 0) {
    console.log('No valid nodes collected.');
    return;
  }

  const base64Output = Buffer.from(finalNodes.join('\n'), 'utf-8').toString('base64');
  fs.writeFileSync('sub.txt', base64Output, 'utf-8');
  console.log(`Successfully compiled sub.txt with ${finalNodes.length} nodes (Hy2 prioritized).`);
}

main();
