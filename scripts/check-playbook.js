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
  "WORKING_AGREEMENT.md",
  "tasks/tasks-template.md",
  "playbook_v2/schemas.md",
  "playbook_v2/context_retrieval.md",
  "playbook_v2/telemetry_and_logs.md",
  "playbook_v2/evals_and_judges.md",
  "playbook_v2/modes/FEATURE.md",
  "playbook_v2/modes/BUGFIX.md",
  "playbook_v2/modes/AI_FEATURE.md",
  "playbook_v2/modes/ARCHITECT.md",
  "playbook_v2/modes/JUDGE.md",
  "ai-dev-tasks-main/create-prd.md",
  "ai-dev-tasks-main/generate-tasks.md",
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

// Optional: encourage a real task list (not just the template).
const tasksDir = path.join(process.cwd(), "tasks");
if (fs.existsSync(tasksDir)) {
  const files = fs.readdirSync(tasksDir);
  const taskLists = files.filter(
    (f) => f.startsWith("tasks-") && f.endsWith(".md"),
  );
  if (taskLists.length === 0) {
    console.warn(
      "[check-playbook] Warning: no tasks/tasks-*.md found (generate via ai-dev-tasks-main/generate-tasks.md)",
    );
  }
}

if (!ok) {
  process.exit(1);
} else {
  console.log("[check-playbook] OK");
}
