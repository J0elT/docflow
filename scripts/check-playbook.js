#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");

const requiredFiles = [
  "PRD.Next.md",
  "Plan.md",
  "DECISIONS.md",
  "prompts.md",
  "v2docflowprompt.md",
];

let ok = true;

for (const file of requiredFiles) {
  const full = path.join(process.cwd(), file);
  if (!fs.existsSync(full)) {
    console.error(`[check-playbook] Missing required file: ${file}`);
    ok = false;
    continue;
  }
  const content = fs.readFileSync(full, "utf8").trim();
  if (!content) {
    console.error(`[check-playbook] File is empty: ${file}`);
    ok = false;
  }
}

if (!ok) {
  process.exit(1);
} else {
  console.log("[check-playbook] OK");
}
