import fs from 'fs';
import axios from 'axios';
import net from 'net';
import dns from 'dns/promises';
import { URL } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// DigitalOcean & Vultr ASN / Org Keywords
const TARGET_ISPS = ['digitalocean', 'vultr', 'choopa', 'constant company'];

// Singapore DigitalOcean & Vultr Native IP Subnet Prefixes
const TARGET_SUBNET_PREFIXES = [
  '128.199.', '159.89.', '167.99.', '178.128.', '188.166.', '206.189.', '139.59.', '68.183.', // DigitalOcean SG (SGP1)
  '45.76.', '45.32.', '139.180.', '149.28.', '207.148.', '108.61.' // Vultr SG (Choopa)
];

// High-Grade Dedicated VPS & Node Repositories
async function fetchDedicatedSources() {
  const sources = [
    'https://raw.githubusercontent.com/yebekhe/TVC/main/subscriptions/xray/normal/vless',
    'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/sub/sub_merge.txt',
    'https://raw.githubusercontent.com/freefq/free/master/v2',
    'https://raw.githubusercontent.com/Pawdroid/Free-servers/main/sub',
    'https://raw.githubusercontent.com/v2ray-free/v2ray-free.github.io/master/sub/sub_merge.txt',
    'https://raw.githubusercontent.com/peass/v2ray-node/main/vless'
  ];

  let rawList = [];

  for (const url of sources) {
    try {
      const res = await axios.get(url, { 
        timeout: 6000, 
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } 
      });
      let data = res.data;

      // Base64 decode
      try {
        const decoded = Buffer.from(data, 'base64').toString('utf-8');
        if (decoded.includes('://')) data = decoded;
      } catch (e) {}

      const matches = data.match(/(vless|vmess|trojan):\/\/[^\s<"']+/g);
      if (matches) rawList.push(...matches);
    } catch (e) {}
  }

  return [...new Set(rawList)];
}

// Check if Host is DigitalOcean or Vultr SG
async function isTargetSgServer(host) {
  try {
    let resolvedIp = host;
    // Domain ဖြစ်ပါက IP ပြောင်းယူခြင်း
    if (!net.isIP(host)) {
      const addresses = await dns.lookup(host);
      resolvedIp = addresses.address;
    }

    // 1. IP Subnet Match (အမြန်ဆုံးနည်းလမ်း)
    const matchedSubnet = TARGET_SUBNET_PREFIXES.some(prefix => resolvedIp.startsWith(prefix));
    if (matchedSubnet) {
      const provider = resolvedIp.startsWith('45.') || resolvedIp.startsWith('139.180.') || resolvedIp.startsWith('149.28.') || resolvedIp.startsWith('207.148.') || resolvedIp.startsWith('108.61.') ? 'Vultr' : 'DigitalOcean';
      return { valid: true, provider, ip: resolvedIp };
    }

    // 2. IP-API Fallback Verification
    const res = await axios.get(`http://ip-api.com/json/${resolvedIp}?fields=status,countryCode,isp,org,as`, { timeout: 2500 });
    if (res.data && res.data.status === 'success') {
      const isSg = res.data.countryCode === 'SG';
      const org = (res.data.org + ' ' + res.data.isp + ' ' + res.data.as).toLowerCase();
      const isTarget = TARGET_ISPS.some(p => org.includes(p));

      if (isSg && isTarget) {
        const provider = org.includes('vultr') || org.includes('choopa') ? 'Vultr' : 'DigitalOcean';
        return { valid: true, provider, ip: resolvedIp };
      }
    }
  } catch (err) {}
  return { valid: false };
}

// TCP Port Alive Check
function checkTcpAlive(host, port, timeout = 1200) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);

    socket.connect(port, host, () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('error', () => { socket.destroy(); resolve(false); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
  });
}

// AI Repair & Tune
async function aiRepairNodes(rawKeys) {
  if (!GEMINI_API_KEY) return rawKeys;

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
You are a networking expert in Xray-core v1.8.24, Sing-box and NekoBox.
Review and fix these raw VLESS/VMESS/Trojan URIs:
${rawKeys.slice(0, 40).join('\n')}

Rules:
1. Fix corrupted characters, base64 syntax, broken reality parameters (pbk, sid).
2. Clean reality SNIs to speed.cloudflare.com, gateway.icloud.com or keep original if valid.
3. Return ONLY valid URI lines (one per line). Zero markdown, zero explanations.
`;
    const result = await model.generateContent(prompt);
    return result.response.text().trim().split(/\r?\n/).filter(l => l.includes('://'));
  } catch (e) {
    return rawKeys;
  }
}

// Main Runner
async function main() {
  console.log("[1/4] Scraping high-grade node repositories...");
  const candidates = await fetchDedicatedSources();
  console.log(`Found ${candidates.length} candidates. Filtering for SG DigitalOcean & Vultr...`);

  const matchedNodes = [];

  for (let i = 0; i < candidates.length; i++) {
    const uri = candidates[i];
    try {
      const parsed = new URL(uri);
      const host = parsed.hostname;
      const port = parseInt(parsed.port, 10) || 443;

      const serverCheck = await isTargetSgServer(host);
      if (serverCheck.valid) {
        const isAlive = await checkTcpAlive(serverCheck.ip, port);
        if (isAlive) {
          const base = uri.split('#')[0];
          const nodeName = `SG-${serverCheck.provider}-Direct-${matchedNodes.length + 1}`;
          matchedNodes.push(`${base}#${nodeName}`);
          console.log(`[+] Match found: ${nodeName} (${serverCheck.ip})`);
        }
      }
    } catch (e) {}

    if (matchedNodes.length >= 25) break;
  }

  console.log(`[2/4] Found ${matchedNodes.length} native SG DigitalOcean & Vultr nodes.`);

  // Node အရေအတွက် နည်းနေပါက AI ဖြင့် Repair လုပ်ပြီး ဖြည့်စွက်ခြင်း
  let finalNodes = matchedNodes;
  if (finalNodes.length < 15) {
    console.log("[3/4] Tuning candidate pool with Gemini AI...");
    const repaired = await aiRepairNodes(candidates.slice(0, 30));
    finalNodes = [...new Set([...matchedNodes, ...repaired])].slice(0, 25);
  }

  // Base64 Subscription Encode
  const base64Data = Buffer.from(finalNodes.join('\n')).toString('base64');
  fs.writeFileSync('sub.txt', base64Data, 'utf-8');
  console.log(`[4/4] Successfully generated sub.txt with ${finalNodes.length} nodes!`);
}

main();
