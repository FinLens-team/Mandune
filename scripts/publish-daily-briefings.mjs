#!/usr/bin/env node

import { constants } from "node:fs";
import { access, copyFile, mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { URL } from "node:url";

const THEME_IDS = [
  "eastern_observation",
  "jixing_doudou",
  "sunge",
  "zhouli",
  "tieba_laoge",
  "male_succubus",
  "female_succubus",
];

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateBriefing(value, expectedDate, expectedTheme) {
  if (!value || typeof value !== "object") throw new Error("root must be an object");
  if (value.schema_version !== "daily-briefing.v2") throw new Error("invalid schema_version");
  if (value.date !== expectedDate) throw new Error(`date must equal ${expectedDate}`);
  if (value.theme_id !== expectedTheme) throw new Error(`theme_id must equal ${expectedTheme}`);
  for (const key of ["fact_sheet_id", "generated_at", "market_data_cutoff", "title", "dek", "notice"]) {
    if (!nonEmpty(value[key])) throw new Error(`${key} is required`);
  }
  if (!Array.isArray(value.sections) || value.sections.length < 2) throw new Error("at least two sections are required");
  if (!Array.isArray(value.market) || !Array.isArray(value.news) || !Array.isArray(value.sources)) {
    throw new Error("market, news and sources arrays are required");
  }
  const sourceIds = new Set();
  for (const source of value.sources) {
    if (!nonEmpty(source?.id) || !nonEmpty(source?.name) || !nonEmpty(source?.url)) throw new Error("invalid source");
    const url = new URL(source.url);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("source URL must be HTTP(S)");
    if (sourceIds.has(source.id)) throw new Error(`duplicate source id: ${source.id}`);
    sourceIds.add(source.id);
  }
  for (const item of value.market) {
    if (!nonEmpty(item?.label) || !nonEmpty(item?.value) || !nonEmpty(item?.observed_at) || !sourceIds.has(item?.source_id)) {
      throw new Error("invalid market item or source reference");
    }
  }
  for (const item of value.news) {
    if (!nonEmpty(item?.title) || !nonEmpty(item?.summary) || !nonEmpty(item?.published_at) ||
      !sourceIds.has(item?.source_id) || !["high", "medium"].includes(item?.importance) ||
      !Array.isArray(item?.related_assets)) throw new Error("invalid news item or source reference");
  }
  for (const [index, section] of value.sections.entries()) {
    if (!nonEmpty(section?.heading) || !nonEmpty(section?.body)) throw new Error(`section ${index + 1} is invalid`);
  }
  if (!value.notice.includes("不构成个性化投资建议")) throw new Error("notice must preserve the non-advice boundary");
}

function sharedFacts(value) {
  return JSON.stringify({
    fact_sheet_id: value.fact_sheet_id,
    date: value.date,
    market_data_cutoff: value.market_data_cutoff,
    market: value.market,
    news: value.news,
    sources: value.sources,
  });
}

async function main() {
  const date = process.argv[2];
  if (!date || !/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    fail("Usage: node scripts/publish-daily-briefings.mjs YYYY-MM-DD");
    return;
  }

  const root = path.resolve("src/client/public/daily-briefings");
  const sourceDir = path.join(root, date);
  const latestDir = path.join(root, "latest");
  const stagingDir = path.join(root, `.latest-${process.pid}`);

  try {
    await access(sourceDir, constants.R_OK);
    await rm(stagingDir, { force: true, recursive: true });
    await mkdir(stagingDir, { recursive: true });
    let expectedFacts;

    for (const themeId of THEME_IDS) {
      const source = path.join(sourceDir, `${themeId}.json`);
      const raw = await readFile(source, "utf8");
      const value = JSON.parse(raw);
      validateBriefing(value, date, themeId);
      const facts = sharedFacts(value);
      if (expectedFacts === undefined) expectedFacts = facts;
      else if (facts !== expectedFacts) throw new Error(`${themeId} does not share the reviewed fact sheet`);
      await copyFile(source, path.join(stagingDir, `${themeId}.json`));
    }

    const previousDir = `${latestDir}.previous-${process.pid}`;
    let hadLatest = true;
    try {
      await rename(latestDir, previousDir);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      hadLatest = false;
    }
    try {
      await rename(stagingDir, latestDir);
      if (hadLatest) await rm(previousDir, { force: true, recursive: true });
    } catch (error) {
      if (hadLatest) await rename(previousDir, latestDir);
      throw error;
    }

    process.stdout.write(`Published ${THEME_IDS.length} daily briefing variants for ${date}.\n`);
  } catch (error) {
    await rm(stagingDir, { force: true, recursive: true });
    fail(`Daily briefing publish failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

await main();
