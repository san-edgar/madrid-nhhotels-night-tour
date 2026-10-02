// data.js — fetch static data. Heavy payloads ship as base64+gzip text
// chunks (push-path friendly) and are decoded + decompressed at boot.
// No three.js.
async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return r.text();
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function loadB64Gz(urls) {
  const parts = await Promise.all(urls.map(fetchText));
  const bytes = b64ToBytes(parts.join(''));
  const text = await new Response(
    new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  ).text();
  return JSON.parse(text);
}

const BD_PARTS = 9;

export async function loadData() {
  const bdUrls = Array.from({ length: BD_PARTS }, (_, i) => `data/bd-${i}.b64`);
  const [map, buildings, hotels] = await Promise.all([
    loadB64Gz(['data/mp-0.b64']),
    loadB64Gz(bdUrls),
    fetch('data/hotels.json').then((r) => { if (!r.ok) throw new Error('hotels.json ' + r.status); return r.json(); }),
  ]);
  return { roads: map.roads, buildings: buildings.buildings, hotels };
}

// Title art ships as base64 JPEG chunks; returns an object URL (or null).
export async function loadTitleArt() {
  try {
    const parts = await Promise.all(['data/at-0.b64', 'data/at-1.b64'].map(fetchText));
    const bytes = b64ToBytes(parts.join(''));
    return URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
  } catch {
    return null;
  }
}
