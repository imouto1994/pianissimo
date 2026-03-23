/**
 * Merge Original Scripts
 *
 * Reads every Shift-JIS text file in `original-script/`, strips kanji
 * reading annotations, and writes a single UTF-8 `merged-original.txt`.
 *
 * Kanji annotations follow the pattern `<kanji<reading>` and are replaced
 * with just the kanji characters. For example:
 *
 *   <琥珀<コハク>  →  琥珀
 *   <護<ゴ><堂<ドウ>  →  護堂
 *
 * The script files already use ＃{speaker} lines followed by 「content」
 * lines, so no speech detection is needed — lines are passed through as-is
 * after annotation stripping.
 *
 * File sections are separated by `--------------------` and each section
 * starts with the filename followed by `********************`.
 *
 * Usage:
 *   node merge-original-scripts.mjs
 */

import { glob } from "glob";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import Encoding from "encoding-japanese";

const INPUT_DIR = "original-script";
const OUTPUT_FILE = "merged-original.txt";

const SECTION_SEPARATOR = "--------------------";
const HEADER_SEPARATOR = "********************";

const MAX_CHUNK_LINES = 900;
const CHUNKS_DIR = "original-merged-chunks";

const sjisDecoder = new TextDecoder("shift_jis");

// Matches <kanji<reading> and captures just the kanji part.
const ANNOTATION_PATTERN = /<([^<>]+)<([^<>]+)>/g;

/**
 * Read a file, auto-detecting Shift-JIS or UTF-8.
 */
function decodeText(raw) {
  const detected = Encoding.detect(raw);
  if (detected === "SJIS") {
    return sjisDecoder.decode(raw);
  }
  return Buffer.from(raw).toString("utf-8");
}

/**
 * Strip kanji reading annotations from a line.
 * e.g. <琥珀<コハク> → 琥珀
 */
function stripAnnotations(line) {
  return line.replace(ANNOTATION_PATTERN, "$1");
}

async function main() {
  // Step 1: Discover all text files in the input directory.
  const files = (await glob(`${INPUT_DIR}/*.txt`)).sort();

  if (files.length === 0) {
    console.error(`No .txt files found in ${INPUT_DIR}/`);
    process.exit(1);
  }

  const sections = [];

  for (const filePath of files) {
    // Step 2: Read the file and decode from Shift-JIS (or UTF-8).
    const fileName = path.basename(filePath, ".txt");
    const raw = await readFile(filePath);
    const text = decodeText(raw);
    const srcLines = text.split("\n");
    if (srcLines.at(-1) === "") srcLines.pop();

    // Step 3: Strip kanji annotations from each line.
    const lines = srcLines.map(stripAnnotations);

    // Step 4: Build the section with a filename header.
    sections.push(`${fileName}\n${HEADER_SEPARATOR}\n${lines.join("\n")}`);
  }

  // Step 5: Prepend each section with a separator and write to disk as UTF-8.
  const output = sections.map((s) => `${SECTION_SEPARATOR}\n${s}`).join("\n");
  await writeFile(OUTPUT_FILE, output + "\n", "utf-8");

  console.log(`${files.length} files merged into ${OUTPUT_FILE}`);

  // Step N: Split sections into line-limited chunks.
  await rm(CHUNKS_DIR, { recursive: true, force: true });
  await mkdir(CHUNKS_DIR, { recursive: true });

  const chunks = [];
  let currentChunk = [];
  let currentLineCount = 0;

  for (const section of sections) {
    const sectionText = `${SECTION_SEPARATOR}\n${section}`;
    const sectionLineCount = sectionText.split("\n").length;

    // If adding this section exceeds the limit and we already have content,
    // flush the current chunk first.
    if (currentLineCount + sectionLineCount > MAX_CHUNK_LINES && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentLineCount = 0;
    }

    currentChunk.push(sectionText);
    currentLineCount += sectionLineCount;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunkNum = String(i + 1).padStart(3, "0");
    const chunkPath = path.join(CHUNKS_DIR, `part-${chunkNum}.txt`);
    await writeFile(chunkPath, chunks[i].join("\n") + "\n", "utf-8");
  }

  console.log(`${chunks.length} chunks written to ${CHUNKS_DIR}/`);
}

main().catch(console.error);
