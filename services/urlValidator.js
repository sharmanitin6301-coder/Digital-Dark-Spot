const dns = require('dns').promises;
const ipaddr = require('ipaddr.js');

/**
 * Checks whether an IP address string is a publicly routable unicast IP.
 * Rejects private, loopback, link-local, multicast, carrier-grade NAT, or reserved addresses.
 *
 * @param {string} ipString
 * @returns {boolean}
 */
function isPublicIp(ipString) {
  try {
    let addr = ipaddr.parse(ipString);
    if (addr.kind() === 'ipv6' && addr.isIPv4MappedAddress()) {
      addr = addr.toIPv4Address();
    }
    return addr.range() === 'unicast';
  } catch {
    return false;
  }
}

/**
 * Validates a URL to prevent SSRF, ensuring it only targets public HTTP/HTTPS endpoints.
 * Validates protocol, hostname, and all DNS-resolved IP addresses.
 *
 * @param {string} urlString
 * @returns {Promise<URL>} The validated URL object
 */
async function validateUrl(urlString) {
  if (typeof urlString !== 'string' || !urlString.trim()) {
    throw new Error('URL must be a non-empty string.');
  }

  let parsed;
  try {
    parsed = new URL(urlString.trim());
  } catch {
    throw new Error(`Invalid URL format: "${urlString}".`);
  }

  // 1. Only allow HTTP and HTTPS
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Invalid URL protocol "${parsed.protocol}". Only HTTP and HTTPS are permitted.`);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    throw new Error('URL hostname cannot be empty.');
  }

  // 2. Reject localhost and common internal domain patterns
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan') ||
    hostname.endsWith('.home') ||
    hostname.endsWith('.corp')
  ) {
    throw new Error(`Access to internal/private hostname "${hostname}" is forbidden. Please provide a publicly accessible website URL or switch to Pasted Text mode.`);
  }

  // Normalize IPv6 hostname brackets if present
  const cleanHost = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;

  // 3. If hostname is an IP literal, validate directly
  if (ipaddr.isValid(cleanHost)) {
    if (!isPublicIp(cleanHost)) {
      throw new Error(`Direct connection to private/internal IP address "${cleanHost}" is forbidden.`);
    }
    return parsed;
  }

  // 4. Validate all DNS-resolved IP addresses
  let resolvedAddresses;
  try {
    resolvedAddresses = await dns.lookup(cleanHost, { all: true });
  } catch (err) {
    throw new Error(`DNS resolution failed for hostname "${cleanHost}": ${err.message}`);
  }

  if (!resolvedAddresses || resolvedAddresses.length === 0) {
    throw new Error(`DNS lookup returned no IP addresses for hostname "${cleanHost}".`);
  }

  for (const record of resolvedAddresses) {
    const ip = record.address;
    if (!isPublicIp(ip)) {
      throw new Error(
        `Hostname "${cleanHost}" resolved to forbidden private/internal IP address "${ip}".`
      );
    }
  }

  return parsed;
}

module.exports = {
  validateUrl,
  isPublicIp
};
