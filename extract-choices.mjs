/**
 * Extract Choice Groups with Translations
 *
 * Pianissimo has no game-script opcodes — choices are embedded directly in
 * the text as consecutive lines that don't end with punctuation symbols.
 *
 * Detection: 2+ consecutive non-speech lines whose last character is a
 * regular character (hiragana, katakana, kanji) or full-width ？, rather
 * than sentence-ending punctuation (。」！…― etc.).
 *
 * Output: `choices-with-translations.txt`
 *
 * Usage:
 *   node extract-choices.mjs
 */

import { readFile, writeFile } from "fs/promises";
import { glob } from "glob";

const ORIGINAL_CHUNKS_DIR = "original-merged-chunks";
const TRANSLATED_CHUNKS_DIR = "translated-merged-chunks";
const OUTPUT_FILE = "choices-with-translations.txt";

const SECTION_SEPARATOR = "--------------------";
const HEADER_SEPARATOR = "********************";

// Matches hiragana, katakana, CJK ideographs, or full-width ？
const NON_SYMBOL_ENDING =
  /[\p{Script=Hiragana}\p{Script=Katakana}\p{Unified_Ideograph}？]$/u;

/**
 * Read and concatenate all chunk files from a directory.
 */
async function readChunks(dir) {
  const files = (await glob(`${dir}/part-*.txt`)).sort();
  const parts = await Promise.all(files.map((f) => readFile(f, "utf-8")));
  return parts.join("\n");
}

/**
 * Parse a merged text file into a Map of { fileName → lines[] }.
 */
function parseSections(text) {
  const raw = text.split(`${SECTION_SEPARATOR}\n`);
  const sections = new Map();
  for (const block of raw) {
    const headerEnd = block.indexOf(`\n${HEADER_SEPARATOR}\n`);
    if (headerEnd === -1) continue;
    const fileName = block.slice(0, headerEnd).trim();
    const body = block.slice(headerEnd + HEADER_SEPARATOR.length + 2);
    sections.set(fileName, body.split("\n"));
  }
  return sections;
}

/**
 * A line is a choice candidate if it's non-empty, not a speech source,
 * and ends with a non-symbol character (or ？).
 */
function isChoiceCandidate(line) {
  if (!line || line.startsWith("＃")) return false;
  return NON_SYMBOL_ENDING.test(line);
}

async function main() {
  // Step 1: Read and parse the line-aligned original/translated chunks.
  const originalText = await readChunks(ORIGINAL_CHUNKS_DIR);
  const translatedText = await readChunks(TRANSLATED_CHUNKS_DIR);
  const origSections = parseSections(originalText);
  const transSections = parseSections(translatedText);

  const outputSections = [];
  let totalGroups = 0;
  let totalChoices = 0;
  let untranslated = 0;

  // Step 2: Scan each section for runs of 2+ choice candidates.
  for (const [fileName, origLines] of origSections) {
    const transLines = transSections.get(fileName);
    const groups = [];

    let i = 0;
    while (i < origLines.length) {
      if (!isChoiceCandidate(origLines[i])) {
        i++;
        continue;
      }

      // Collect consecutive choice candidate lines.
      const startIdx = i;
      const choices = [];
      while (i < origLines.length && isChoiceCandidate(origLines[i])) {
        choices.push(origLines[i]);
        i++;
      }

      if (choices.length >= 2) {
        groups.push({ idx: startIdx, choices });
      }
    }

    if (groups.length === 0) continue;

    const lines = [];
    for (let g = 0; g < groups.length; g++) {
      if (g > 0) lines.push("");
      lines.push(`Group ${g + 1}`);
      for (let c = 0; c < groups[g].choices.length; c++) {
        const choice = groups[g].choices[c];
        totalChoices++;
        const translation = transLines?.[groups[g].idx + c];
        if (translation) {
          lines.push(`${choice} → ${translation}`);
        } else {
          lines.push(`${choice} → [UNTRANSLATED]`);
          untranslated++;
        }
      }
      totalGroups++;
    }

    outputSections.push(
      `${fileName}\n${HEADER_SEPARATOR}\n${lines.join("\n")}`,
    );
  }

  // Step 3: Write output file.
  const output = outputSections
    .map((s) => `${SECTION_SEPARATOR}\n${s}`)
    .join("\n");
  await writeFile(OUTPUT_FILE, output + "\n", "utf-8");

  console.log("— Summary —");
  console.log(`  Files with choices: ${outputSections.length}`);
  console.log(`  Total groups:       ${totalGroups}`);
  console.log(`  Total choices:      ${totalChoices}`);
  console.log(`  Untranslated:       ${untranslated}`);
  console.log(`  Exported to:        ${OUTPUT_FILE}`);
}

main().catch(console.error);
