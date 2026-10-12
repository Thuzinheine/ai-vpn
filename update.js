/**
 * update.js - AI-VPN Core Scraper (ES Module)
 * Reality & Hysteria 2 Specialized Aggregator
 */
import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';

// Reality & Hysteria 2 ပါဝင်သော Public Aggregator Sources များ
const SOURCES = [
  'https://raw.githubusercontent.com/yebekhe/TVC/main/subscriptions/xray/normal/mix',
  'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/Sub1.txt',
  'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/Sub2.txt',
  'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/sub/sub_merge.txt',
  'https://raw.githubusercontent.com/soroushmirzaei/telegram-configs-collector/main/protocols/reality',
  'https://raw.githubusercontent.com/soroushmirzaei/telegram-configs-collector/main/protocols/hysteria'
];

function fetchUrl(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'v2rayNG/1.8.5' }, timeout: 10000 }, (res) => {
      let data = '';
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location));
      }
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
}

function decodeContent(content) {
  if (!content) return '';
  content = content.trim();
  try {
    const buff = Buffer.from(content.replace(/\s+/g, ''), 'base64');
    const decoded = buff.toString('utf-8');
    if (decoded.includes('://')) return decoded;
  } catch (e) {}
  return content;
}

async function main() {
  console.log('Fetching configurations from sources...');
  let collected = [];

  for (const src of SOURCES) {
    try {
      const raw = await fetchUrl(src);
      const text = decodeContent(raw);
      const lines = text.split(/[\r\n]+/);

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // 1. Hysteria 2 စစ်ဆေးခြင်း
        const isHy2 = trimmed.startsWith('hy2://') || trimmed.startsWith('hysteria2://');
        
        // 2. VLESS Reality စစ်ဆေးခြင်း
        const isReality = trimmed.startsWith('vless://') && trimmed.includes('security=reality');

        if (isHy2 || isReality) {
          collected.push(trimmed);
        }
      }
    } catch (err) {
      console.log(`Failed to fetch from ${src}: ${err.message}`);
    }
  }

  // Duplicate များကို ဖယ်ထုတ်ခြင်း
  const uniqueNodes = Array.from(new Set(collected));
  console.log(`Discovered ${uniqueNodes.length} unique Reality & Hysteria 2 nodes.`);

  // အများဆုံး 50 ခုသာ ရွေးထုတ်ခြင်း
  const finalNodes = uniqueNodes.slice(0, 50);

  if (finalNodes.length === 0) {
    console.log('No valid Reality / Hysteria 2 nodes found. Leaving sub.txt untouched.');
    return;
  }

  // Base64 encode ပြုလုပ်၍ sub.txt ထဲသို့ ရေးသားခြင်း
  const base64Output = Buffer.from(finalNodes.join('\n'), 'utf-8').toString('base64');
  fs.writeFileSync('sub.txt', base64Output, 'utf-8');
  console.log(`Successfully written ${finalNodes.length} nodes to sub.txt`);
}

main();
