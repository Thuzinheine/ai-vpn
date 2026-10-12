import fs from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';
import net from 'net';
import dns from 'dns';
import { URL } from 'url';

const SOURCES = [
  'https://raw.githubusercontent.com/cmliu/WorkerVless2sub/main/sub',
  'https://raw.githubusercontent.com/yebekhe/TVC/main/subscriptions/xray/normal/vless',
  'https://raw.githubusercontent.com/peass/v2ray-node/main/vless',
  'https://raw.githubusercontent.com/freefq/free/master/v2'
];

async function fetchNodes() {
  let list = [];
  for (const url of SOURCES) {
    try {
      const res = await axios.get(url, { timeout: 6000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      let data = res.data;
      try {
        const decoded = Buffer.from(data, 'base64').toString('utf-8');
        if (decoded.includes('://')) data = decoded;
      } catch (e) {}

      const matches = data.match(/vless:\/\/[^\s<"']+/g);
      if (matches) list.push(...matches);
    } catch (e) {}
  }
  return [...new Set(list)];
}

async function main() {
  console.log("Fetching VLESS nodes...");
  let nodes = await fetchNodes();
  console.log(`Found ${nodes.length} nodes.`);

  // Node လုံးဝ မရခဲ့ပါက ထည့်မည့် အရန် Backup Nodes
  if (nodes.length === 0) {
    nodes = [
      "vless://auto-sg-node@speed.cloudflare.com:443?encryption=none&security=tls&sni=speed.cloudflare.com&fp=chrome&type=ws&host=speed.cloudflare.com#SG-AI-Backup-1",
      "vless://auto-sg-node@gateway.icloud.com:443?encryption=none&security=tls&sni=gateway.icloud.com&fp=chrome&type=ws&host=gateway.icloud.com#SG-AI-Backup-2"
    ];
  }

  // အများဆုံး Node အခု ၃၀ အထိ ယူမည်
  const finalPool = nodes.slice(0, 30);
  const base64Content = Buffer.from(finalPool.join('\n')).toString('base64');

  fs.writeFileSync('sub.txt', base64Content, 'utf-8');
  console.log(`Success: Written ${finalPool.length} nodes to sub.txt (${base64Content.length} chars).`);
}

main();
