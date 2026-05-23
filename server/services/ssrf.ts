import { promises as dns } from "dns";
import { isIP } from "net";

const MAX_REDIRECTS = 5;

const BLOCKED_HOSTS = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
]);

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255))
    return -1;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function inV4Cidr(ip: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split("/");
  const bits = parseInt(bitsStr, 10);
  const ipi = ipv4ToInt(ip);
  const basei = ipv4ToInt(base);
  if (ipi < 0 || basei < 0) return false;
  if (bits === 0) return true;
  const mask = (~0 << (32 - bits)) >>> 0;
  return (ipi & mask) === (basei & mask);
}

const V4_BLOCKED_CIDRS = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
  "255.255.255.255/32",
];

function isBlockedV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80:")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
  if (lower.startsWith("ff")) return true; // multicast
  // IPv4-mapped: ::ffff:a.b.c.d
  const m = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (m) return isBlockedIp(m[1]);
  return false;
}

export function isBlockedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return V4_BLOCKED_CIDRS.some((c) => inV4Cidr(ip, c));
  if (v === 6) return isBlockedV6(ip);
  return true;
}

export async function assertSafeUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Blocked protocol: ${parsed.protocol}`);
  }
  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) {
    throw new Error(`Blocked host: ${host}`);
  }
  if (isIP(host)) {
    if (isBlockedIp(host)) throw new Error(`Blocked IP: ${host}`);
    return;
  }
  // Resolve DNS — block if any A/AAAA record is private/internal
  let addrs: { address: string; family: number }[] = [];
  try {
    addrs = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error(`DNS resolution failed for ${host}`);
  }
  if (!addrs.length) throw new Error(`No DNS records for ${host}`);
  for (const a of addrs) {
    if (isBlockedIp(a.address)) {
      throw new Error(
        `Blocked target ${host} resolves to private/internal address ${a.address}`
      );
    }
  }
}

/**
 * Manual-redirect-following fetch that re-validates every hop against SSRF
 * rules. Honors a per-request AbortSignal and a timeout.
 */
export async function safeFetch(
  initialUrl: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  let url = initialUrl;
  const seen = new Set<string>();
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    if (seen.has(url)) throw new Error(`Redirect loop at ${url}`);
    seen.add(url);
    await assertSafeUrl(url);

    const ac = new AbortController();
    const timer = setTimeout(
      () => ac.abort(),
      init.timeoutMs ?? 20000
    );
    const onAbort = () => ac.abort();
    init.signal?.addEventListener("abort", onAbort);
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        signal: ac.signal,
        redirect: "manual",
      });
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener("abort", onAbort);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      url = new URL(loc, url).toString();
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}
