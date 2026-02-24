const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

function getTelegramProxyUrl() {
  const useProxy = String(process.env.USE_PROXY || '').trim() === 'true';
  const rawUrl = (process.env.TELEGRAM_PROXY_URL || '').trim();
  if (!useProxy || !rawUrl) return null;
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && (rawUrl.includes('localhost') || rawUrl.includes('127.0.0.1'))) return null;
  return rawUrl;
}

function createTelegramProxyAgent(proxyUrl) {
  if (!proxyUrl) return null;
  const lower = proxyUrl.toLowerCase();
  if (lower.startsWith('socks5://') || lower.startsWith('socks4://')) {
    return new SocksProxyAgent(proxyUrl);
  }
  return new HttpsProxyAgent(proxyUrl);
}

module.exports = {
  getTelegramProxyUrl,
  createTelegramProxyAgent,
};
