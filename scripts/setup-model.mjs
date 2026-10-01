import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const directory = new URL('../assets/', import.meta.url);
const destination = new URL('hand_landmarker.task', directory);
const expected = 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1';
const checksum = (data) => createHash('sha256').update(data).digest('hex');
try {
  if (checksum(await readFile(destination)) === expected) process.exit(0);
} catch { /* The model will be downloaded on first install. */ }
const response = await fetch('https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', { signal: AbortSignal.timeout(120000) });
if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
const data = Buffer.from(await response.arrayBuffer());
if (checksum(data) !== expected) throw new Error('Hand landmark model checksum did not match');
await mkdir(directory, { recursive: true });
await writeFile(destination, data);
console.log('Verified hand landmark model installed.');
