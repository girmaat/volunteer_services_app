"use client";

import { useMemo } from "react";

type Props = {
  text: string;
  size?: number;
  className?: string;
  title?: string;
};

/**
 * Lightweight QR generator (byte mode, error correction L, versions 1-4).
 * Intended for short share URLs (typically well under 80 bytes).
 */
export default function QrCode({ text, size = 200, className, title = "QR code" }: Props) {
  const { modules, moduleCount } = useMemo(() => generateQr(text), [text]);

  const scale = size / moduleCount;

  return (
    <svg
      className={className}
      role="img"
      aria-label={title}
      viewBox={`0 0 ${moduleCount} ${moduleCount}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
    >
      <rect x={0} y={0} width={moduleCount} height={moduleCount} fill="white" />
      {modules.map((row, y) =>
        row.map((on, x) =>
          on ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="black" /> : null
        )
      )}
    </svg>
  );
}

type QrOut = { modules: boolean[][]; moduleCount: number };

const CAPACITY_BYTES_L = [0, 17, 32, 53, 78];
const DATA_CODEWORDS_L = [0, 19, 34, 55, 80];
const EC_CODEWORDS_L = [0, 7, 10, 15, 20];

function generateQr(input: string): QrOut {
  const bytes = new TextEncoder().encode(input);
  const version = pickVersion(bytes.length);
  const size = 21 + (version - 1) * 4;

  const dataCw = DATA_CODEWORDS_L[version];
  const ecCw = EC_CODEWORDS_L[version];

  const data = makeDataCodewords(bytes, version, dataCw);
  const ec = reedSolomonEncode(data, ecCw);
  const codewords = new Uint8Array([...data, ...ec]);

  const { modules, reserved } = initMatrix(size);

  placeFunctionPatterns(modules, reserved, version);

  const bits = codewordsToBits(codewords);
  placeData(modules, reserved, bits);

  // mask pattern 0: (row + col) % 2 == 0
  applyMask(modules, reserved, 0);

  writeFormatInfo(modules, reserved, 0);

  return { modules, moduleCount: size };
}

function pickVersion(byteLen: number) {
  for (let v = 1; v <= 4; v++) if (byteLen <= CAPACITY_BYTES_L[v]) return v;
  // For unexpectedly long URLs, still render something: truncate to v4 capacity.
  return 4;
}

class BitBuffer {
  private _bits: number[] = [];
  put(value: number, length: number) {
    for (let i = length - 1; i >= 0; i--) this._bits.push((value >>> i) & 1);
  }
  get length() {
    return this._bits.length;
  }
  toBytes(byteLen: number): Uint8Array {
    const out = new Uint8Array(byteLen);
    for (let i = 0; i < byteLen; i++) {
      let v = 0;
      for (let j = 0; j < 8; j++) {
        const bit = this._bits[i * 8 + j] || 0;
        v = (v << 1) | bit;
      }
      out[i] = v;
    }
    return out;
  }
}

function makeDataCodewords(bytes: Uint8Array, version: number, dataCodewords: number): Uint8Array {
  const bb = new BitBuffer();
  // mode: byte
  bb.put(0b0100, 4);
  // length (versions 1-9 => 8 bits)
  bb.put(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) bb.put(b, 8);
  // terminator
  bb.put(0, 4);
  // pad to byte boundary
  while (bb.length % 8 !== 0) bb.put(0, 1);

  const out = Array.from(bb.toBytes(Math.min(dataCodewords, Math.ceil(bb.length / 8))));
  // pad bytes
  const PAD0 = 0xec;
  const PAD1 = 0x11;
  let padToggle = 0;
  while (out.length < dataCodewords) {
    out.push(padToggle === 0 ? PAD0 : PAD1);
    padToggle = 1 - padToggle;
  }
  return new Uint8Array(out.slice(0, dataCodewords));
}

function codewordsToBits(codewords: Uint8Array): number[] {
  const bits: number[] = [];
  for (const cw of codewords) {
    for (let i = 7; i >= 0; i--) bits.push((cw >>> i) & 1);
  }
  return bits;
}

function initMatrix(size: number) {
  const modules: boolean[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
  const reserved: boolean[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
  return { modules, reserved };
}

function setModule(modules: boolean[][], reserved: boolean[][], x: number, y: number, dark: boolean, markReserved = true) {
  if (x < 0 || y < 0 || y >= modules.length || x >= modules.length) return;
  modules[y][x] = dark;
  if (markReserved) reserved[y][x] = true;
}

function placeFinder(modules: boolean[][], reserved: boolean[][], x: number, y: number) {
  for (let dy = -1; dy <= 7; dy++) {
    for (let dx = -1; dx <= 7; dx++) {
      const xx = x + dx;
      const yy = y + dy;
      const isBorder = dx === -1 || dx === 7 || dy === -1 || dy === 7;
      const in7 = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
      let dark = false;

      if (isBorder) dark = false;
      else if (in7) {
        const onOuter = dx === 0 || dx === 6 || dy === 0 || dy === 6;
        const onInner = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
        dark = onOuter || onInner;
      }

      setModule(modules, reserved, xx, yy, dark);
    }
  }
}

function placeAlignment(modules: boolean[][], reserved: boolean[][], cx: number, cy: number) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const xx = cx + dx;
      const yy = cy + dy;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      const dark = dist === 2 || (dx === 0 && dy === 0);
      if (!reserved[yy]?.[xx]) setModule(modules, reserved, xx, yy, dark);
    }
  }
}

function placeFunctionPatterns(modules: boolean[][], reserved: boolean[][], version: number) {
  const size = modules.length;

  // Finder patterns
  placeFinder(modules, reserved, 0, 0);
  placeFinder(modules, reserved, size - 7, 0);
  placeFinder(modules, reserved, 0, size - 7);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0;
    if (!reserved[6][i]) setModule(modules, reserved, i, 6, dark);
    if (!reserved[i][6]) setModule(modules, reserved, 6, i, dark);
  }

  // Dark module
  setModule(modules, reserved, 8, size - 8, true);

  // Alignment patterns (versions 2-4 only)
  const alignPos = version === 1 ? [] : version === 2 ? [6, 18] : version === 3 ? [6, 22] : [6, 26];
  for (let i = 0; i < alignPos.length; i++) {
    for (let j = 0; j < alignPos.length; j++) {
      const cx = alignPos[i];
      const cy = alignPos[j];
      // Skip overlaps with finders
      const nearTopLeft = cx < 9 && cy < 9;
      const nearTopRight = cx > size - 9 && cy < 9;
      const nearBottomLeft = cx < 9 && cy > size - 9;
      if (nearTopLeft || nearTopRight || nearBottomLeft) continue;
      placeAlignment(modules, reserved, cx, cy);
    }
  }

  // Reserve format info areas
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      reserved[8][i] = true;
      reserved[i][8] = true;
    }
  }
  for (let i = size - 8; i < size; i++) reserved[8][i] = true;
  for (let i = size - 8; i < size; i++) reserved[i][8] = true;
  reserved[size - 8][8] = true; // already dark module, but keep reserved
}

function placeData(modules: boolean[][], reserved: boolean[][], bits: number[]) {
  const size = modules.length;
  let bitIdx = 0;
  let dir = -1;
  let x = size - 1;
  let y = size - 1;

  while (x > 0) {
    if (x === 6) x--; // skip timing column
    for (;;) {
      for (let dx = 0; dx < 2; dx++) {
        const xx = x - dx;
        if (!reserved[y][xx]) {
          const bit = bits[bitIdx++] ?? 0;
          modules[y][xx] = bit === 1;
        }
      }
      y += dir;
      if (y < 0 || y >= size) {
        y -= dir;
        dir = -dir;
        break;
      }
    }
    x -= 2;
  }
}

function applyMask(modules: boolean[][], reserved: boolean[][], mask: number) {
  const size = modules.length;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (reserved[y][x]) continue;
      const m = maskFunc(mask, x, y);
      if (m) modules[y][x] = !modules[y][x];
    }
  }
}

function maskFunc(mask: number, x: number, y: number) {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return false;
  }
}

function writeFormatInfo(modules: boolean[][], reserved: boolean[][], mask: number) {
  const size = modules.length;
  const levelBits = 0b01; // L
  const data = (levelBits << 3) | (mask & 0b111);
  const bch = formatBCH(data);
  const format = (data << 10) | bch;
  const formatMasked = format ^ 0x5412;

  const bits: number[] = [];
  for (let i = 14; i >= 0; i--) bits.push((formatMasked >>> i) & 1);

  const put = (x: number, y: number, bit: number) => setModule(modules, reserved, x, y, bit === 1, true);

  // top-left
  for (let i = 0; i <= 5; i++) put(i, 8, bits[i]);
  put(7, 8, bits[6]);
  put(8, 8, bits[7]);
  put(8, 7, bits[8]);
  for (let i = 9; i <= 14; i++) put(8, 14 - i, bits[i]);

  // bottom-left + top-right
  for (let i = 0; i <= 7; i++) put(8, size - 1 - i, bits[i]);
  for (let i = 8; i <= 14; i++) put(size - 15 + i, 8, bits[i]);
}

function formatBCH(data: number) {
  // BCH(15,5) generator 0x537
  let d = data << 10;
  const g = 0x537;
  while (bchDigit(d) - bchDigit(g) >= 0) d ^= g << (bchDigit(d) - bchDigit(g));
  return d;
}

function bchDigit(data: number) {
  let digit = 0;
  while (data !== 0) {
    digit++;
    data >>>= 1;
  }
  return digit;
}

// -------- Reed Solomon (GF256, primitive polynomial 0x11d) --------

type U8 = Uint8Array<ArrayBufferLike>;


const GF_EXP: U8 = (() => {
  const exp = new Uint8Array(512) as U8;
  let x = 1;
  for (let i = 0; i < 255; i++) {
    exp[i] = x;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];
  return exp;
})();

const GF_LOG = (() => {
  const log = new Uint16Array(256);
  for (let i = 0; i < 255; i++) log[GF_EXP[i]] = i;
  return log;
})();

function gfMul(a: number, b: number) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255];
}

function generatorPoly(degree: number): U8 {
  let poly: U8 = new Uint8Array([1]) as U8;
  for (let i = 0; i < degree; i++) {
    poly = polyMul(poly, new Uint8Array([1, GF_EXP[i]]) as U8);
  }
  return poly;
}

function polyMul(p: U8, q: U8): U8 {
  const out = new Uint8Array(p.length + q.length - 1) as U8;
  for (let i = 0; i < p.length; i++) {
    for (let j = 0; j < q.length; j++) out[i + j] ^= gfMul(p[i], q[j]);
  }
  return out;
}

function reedSolomonEncode(data: Uint8Array, ecLen: number): Uint8Array {
  const gen = generatorPoly(ecLen);
  const msg = new Uint8Array(data.length + ecLen);
  msg.set(data, 0);

  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef === 0) continue;
    for (let j = 0; j < gen.length; j++) msg[i + j] ^= gfMul(gen[j], coef);
  }

  return msg.slice(data.length);
}
