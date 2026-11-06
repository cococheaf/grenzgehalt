const prefix = '#rechnung=';
const maxLength = 25000;

export function shareHash(snapshot) {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  const encoded = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  if (encoded.length > maxLength) throw new Error('Die Rechnung ist für einen Link zu groß. Verwende den JSON-Export.');
  return prefix + encoded;
}

export function readShareHash(hash) {
  if (!hash.startsWith(prefix)) return null;
  const encoded = hash.slice(prefix.length);
  if (encoded.length > maxLength || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new Error('Ungültiger Rechenlink.');
  }
  const bytes = Uint8Array.from(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
