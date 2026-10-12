/**
 * update.js - Asia-Optimized Reality & Hysteria 2 Aggregator
 */
import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';

const SOURCES = [
  'https://raw.githubusercontent.com/yebekhe/TVC/main/subscriptions/protocols/hysteria2',
  'https://raw.githubusercontent.com/soroushmirzaei/telegram-configs-collector/main/protocols/hysteria',
  'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/sub/splitted/hysteria2.txt',
  'https://raw.githubusercontent.com/soroushmirzaei/telegram-configs-collector/main/protocols/reality',
  'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/sub/splitted/reality.txt',
  'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/Sub1.txt'
];

// မြန်မာနိုင်ငံအတွက် အဆင်ပြေဆုံး Asia Regions
const ASIA_KEYWORDS = ['SG', 'Singapore', 'TH', 'Thailand', 'MY', 'Malaysia', 'JP', 'Japan', 'HK', 'Hong'];

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

async function main() {
  console.log('--- Aggregating Best Quality Asia Nodes ---');
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

  // Asia nodes များကို ဦးစားပေး စစ်ထုတ်ခြင်း
  const asiaNodes = unique.filter(node => {
    return ASIA_KEYWORDS.some(kw => node.toLowerCase().includes(kw.toLowerCase()));
  });

  const otherNodes = unique.filter(node => !asiaNodes.includes(node));

  // Asia Nodes အရင်ထည့်ပြီး ကျန်နေရာကို အခြား low-latency ဖြစ်နိုင်သော node များဖြင့် ဖြည့်ခြင်း
  const selectedPool = [
    ...asiaNodes.slice(0, 35),
    ...otherNodes.slice(0, 15)
  ];

  if (selectedPool.length === 0) {
    console.log('No nodes found.');
    return;
  }

  const base64Output = Buffer.from(selectedPool.join('\n'), 'utf-8').toString('base64');
  fs.writeFileSync('sub.txt', base64Output, 'utf-8');
  console.log(`Successfully generated sub.txt with ${selectedPool.length} nodes (Prioritized Asia).`);
}

main();
