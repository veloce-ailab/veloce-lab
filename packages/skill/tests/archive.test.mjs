import assert from "node:assert/strict";
import { deflateRawSync, gzipSync } from "node:zlib";
import { test } from "node:test";
import { parseSkillArchive } from "../dist/archive.js";

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, value] of entries) {
    const fileName = Buffer.from(name);
    const data = Buffer.from(value);
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(fileName.length, 26);
    local.push(header, fileName, compressed);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(compressed.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(fileName.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, fileName);
    offset += header.length + fileName.length + compressed.length;
  }
  const directoryBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directoryBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directoryBytes, end]);
}

function tarEntry(name, content) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  header.write("0000644\0", 100, 8, "ascii");
  header.write("0000000\0", 108, 8, "ascii");
  header.write("0000000\0", 116, 8, "ascii");
  header.write(`${content.length.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii");
  header.write("00000000000\0", 136, 12, "ascii");
  header.fill(32, 148, 156);
  header[156] = name === "." || name.endsWith("/") ? 53 : 48;
  header.write("ustar\0", 257, 6, "ascii");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  const data = Buffer.from(content);
  const padded = Buffer.alloc(Math.ceil(data.length / 512) * 512);
  data.copy(padded);
  return Buffer.concat([header, padded]);
}

test("reads SKILL.md and resources from ZIP archives", () => {
  const archive = zip([["demo/SKILL.md", "---\nname: Demo\ndescription: Example\n---\nBody"], ["demo/references/guide.txt", "guide"]]);
  const files = parseSkillArchive(archive, "demo.zip");
  assert.deepEqual(files.map((file) => [file.path, file.data.toString()]), [
    ["demo/SKILL.md", "---\nname: Demo\ndescription: Example\n---\nBody"],
    ["demo/references/guide.txt", "guide"],
  ]);
});

test("reads SKILL.md from TGZ archives", () => {
  const tar = Buffer.concat([tarEntry(".", ""), tarEntry("./demo/SKILL.md", "# Demo\nUse this"), Buffer.alloc(1024)]);
  const files = parseSkillArchive(gzipSync(tar), "demo.tgz");
  assert.equal(files[0].path, "demo/SKILL.md");
  assert.equal(files[0].data.toString(), "# Demo\nUse this");
});

test("rejects archives without SKILL.md and paths that escape the package", () => {
  assert.throws(() => parseSkillArchive(zip([["readme.txt", "hello"]]), "x.zip"), /SKILL.md/);
  assert.throws(() => parseSkillArchive(zip([["../SKILL.md", "bad"]]), "x.zip"), /unsafe path/);
});
