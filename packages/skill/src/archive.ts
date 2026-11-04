import { gunzipSync, inflateRawSync } from "node:zlib";

export interface SkillArchiveFile {
  path: string;
  data: Buffer;
}

const maxFiles = 2048;
const maxExpandedBytes = 128 << 20;
const maxFileBytes = 32 << 20;

export function parseSkillArchive(archive: Buffer, sourceName: string): SkillArchiveFile[] {
  const files = /\.(tgz|tar\.gz)$/i.test(sourceName)
    ? parseTar(gunzipSync(archive, { maxOutputLength: maxExpandedBytes }))
    : parseZip(archive);
  if (!files.some((file) => file.path.toLowerCase().endsWith("skill.md")))
    throw new Error("Skill package must contain at least one SKILL.md");
  return files;
}

function parseZip(archive: Buffer): SkillArchiveFile[] {
  const minEOCD = Math.max(0, archive.length - 65557);
  let eocd = -1;
  for (let offset = archive.length - 22; offset >= minEOCD; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error("Invalid ZIP archive");
  const count = archive.readUInt16LE(eocd + 10);
  const directorySize = archive.readUInt32LE(eocd + 12);
  let cursor = archive.readUInt32LE(eocd + 16);
  if (count > maxFiles || cursor + directorySize > eocd) throw new Error("Invalid ZIP directory");
  const files: SkillArchiveFile[] = [];
  const paths = new Set<string>();
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > archive.length || archive.readUInt32LE(cursor) !== 0x02014b50)
      throw new Error("Invalid ZIP entry");
    const flags = archive.readUInt16LE(cursor + 8);
    const method = archive.readUInt16LE(cursor + 10);
    const crc = archive.readUInt32LE(cursor + 16);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const size = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const externalAttributes = archive.readUInt32LE(cursor + 38);
    const localOffset = archive.readUInt32LE(cursor + 42);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    const rawName = archive.subarray(nameStart, nameEnd).toString(flags & 0x800 ? "utf8" : "latin1");
    cursor = nameEnd + extraLength + commentLength;
    if (rawName.endsWith("/")) continue;
    const path = safeArchivePath(rawName);
    if (paths.has(path)) throw new Error("Skill package contains duplicate paths");
    paths.add(path);
    const unixMode = externalAttributes >>> 16;
    if (((unixMode >>> 12) & 0xf) === 0xa) throw new Error("ZIP symlinks are not allowed");
    if (flags & 1) throw new Error("Encrypted ZIP entries are not supported");
    if (size > maxFileBytes || total + size > maxExpandedBytes) throw new Error("Skill package expands beyond the size limit");
    if (localOffset + 30 > archive.length || archive.readUInt32LE(localOffset) !== 0x04034b50)
      throw new Error("Invalid ZIP local header");
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > archive.length) throw new Error("Truncated ZIP entry");
    const compressed = archive.subarray(dataStart, dataEnd);
    const data = method === 0 ? Buffer.from(compressed) : method === 8
      ? inflateRawSync(compressed, { maxOutputLength: maxFileBytes })
      : (() => { throw new Error("Unsupported ZIP compression method"); })();
    if (data.length !== size || crc32(data) !== crc) throw new Error("Invalid ZIP entry checksum");
    total += data.length;
    files.push({ path, data });
  }
  if (files.length > maxFiles) throw new Error("Skill package contains too many files");
  return files;
}

function parseTar(tar: Buffer): SkillArchiveFile[] {
  const files: SkillArchiveFile[] = [];
  let cursor = 0;
  let total = 0;
  let entries = 0;
  const paths = new Set<string>();
  while (cursor + 512 <= tar.length) {
    const header = tar.subarray(cursor, cursor + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = tarString(header.subarray(0, 100));
    const prefix = tarString(header.subarray(345, 500));
    const rawPath = prefix ? `${prefix}/${name}` : name;
    const size = parseTarNumber(header.subarray(124, 136));
    const type = String.fromCharCode(header[156] || 48);
    cursor += 512;
    entries += 1;
    if (entries > maxFiles * 2) throw new Error("Skill package contains too many entries");
    if (size < 0 || size > maxFileBytes || cursor + size > tar.length || total + size > maxExpandedBytes)
      throw new Error("Invalid or oversized TAR entry");
    if (type === "0" || type === "\0") {
      const path = safeArchivePath(rawPath);
      if (paths.has(path)) throw new Error("Skill package contains duplicate paths");
      paths.add(path);
      files.push({ path, data: Buffer.from(tar.subarray(cursor, cursor + size)) });
      total += size;
      if (files.length > maxFiles) throw new Error("Skill package contains too many files");
    }
    cursor += Math.ceil(size / 512) * 512;
  }
  return files;
}

function safeArchivePath(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  const parts = normalized.split("/").filter((part) => part && part !== ".");
  if (!parts.length || normalized.startsWith("/") || /^[a-z]:/i.test(normalized) || parts.some((part) => part === ".." || part.includes("\0")))
    throw new Error("Skill package contains an unsafe path");
  return parts.join("/");
}

function tarString(value: Buffer): string {
  const end = value.indexOf(0);
  return value.subarray(0, end < 0 ? value.length : end).toString("utf8");
}

function parseTarNumber(value: Buffer): number {
  const text = tarString(value).trim();
  return text ? Number.parseInt(text, 8) : 0;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
