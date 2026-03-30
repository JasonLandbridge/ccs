import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ASSESSMENTS = {
  approved: '✅ APPROVED',
  approved_with_notes: '⚠️ APPROVED WITH NOTES',
  changes_requested: '❌ CHANGES REQUESTED',
};

const SEVERITY_ORDER = ['high', 'medium', 'low'];
const SEVERITY_HEADERS = {
  high: '### 🔴 High',
  medium: '### 🟡 Medium',
  low: '### 🟢 Low',
};

function cleanText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function escapeMarkdownText(value) {
  return cleanText(value).replace(/\\/g, '\\\\').replace(/([`*_{}\[\]<>])/g, '\\$1');
}

function renderCode(value) {
  const text = cleanText(value);
  const longestFence = Math.max(...[...text.matchAll(/`+/g)].map((match) => match[0].length), 0);
  const fence = '`'.repeat(longestFence + 1);
  return `${fence}${text}${fence}`;
}

function readExecutionMetadata(executionFile) {
  if (!executionFile || !fs.existsSync(executionFile)) {
    return {};
  }

  try {
    const turns = JSON.parse(fs.readFileSync(executionFile, 'utf8'));
    const init = turns.find((turn) => turn?.type === 'system' && turn?.subtype === 'init');
    const result = [...turns].reverse().find((turn) => turn?.type === 'result');
    return {
      runtimeTools: Array.isArray(init?.tools) ? init.tools : [],
      turnsUsed: typeof result?.num_turns === 'number' ? result.num_turns : null,
    };
  } catch {
    return {};
  }
}

export function normalizeStructuredOutput(raw) {
  if (!raw) {
    return { ok: false, reason: 'missing structured output' };
  }

  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return { ok: false, reason: 'structured output is not valid JSON' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'structured output must be an object' };
  }

  const summary = cleanText(parsed.summary);
  const overallAssessment = cleanText(parsed.overallAssessment);
  const overallRationale = cleanText(parsed.overallRationale);
  const notes = Array.isArray(parsed.notes) ? parsed.notes.map(cleanText).filter(Boolean) : [];
  const findings = Array.isArray(parsed.findings) ? parsed.findings : null;

  if (!summary || !ASSESSMENTS[overallAssessment] || !overallRationale || findings === null) {
    return { ok: false, reason: 'structured output is missing required review fields' };
  }

  const normalizedFindings = [];
  for (const finding of findings) {
    const severity = cleanText(finding?.severity);
    const title = cleanText(finding?.title);
    const file = cleanText(finding?.file);
    const what = cleanText(finding?.what);
    const why = cleanText(finding?.why);
    const fix = cleanText(finding?.fix);
    const line =
      typeof finding?.line === 'number' && Number.isInteger(finding.line) && finding.line > 0
        ? finding.line
        : null;

    if (!SEVERITY_HEADERS[severity] || !title || !file || !what || !why || !fix) {
      return { ok: false, reason: 'structured output contains an invalid finding' };
    }

    normalizedFindings.push({ severity, title, file, line, what, why, fix });
  }

  return {
    ok: true,
    value: {
      summary,
      findings: normalizedFindings,
      overallAssessment,
      overallRationale,
      notes,
    },
  };
}

export function renderStructuredReview(review, { model }) {
  const lines = ['## Summary', escapeMarkdownText(review.summary), '', '## Findings'];

  if (review.findings.length === 0) {
    lines.push('No confirmed issues found after reviewing the diff and surrounding code.');
  } else {
    for (const severity of SEVERITY_ORDER) {
      const findings = review.findings.filter((finding) => finding.severity === severity);
      if (findings.length === 0) continue;

      lines.push(SEVERITY_HEADERS[severity]);
      for (const finding of findings) {
        const location = finding.line ? `${finding.file}:${finding.line}` : finding.file;
        lines.push(`- **${renderCode(location)} — ${escapeMarkdownText(finding.title)}**`);
        lines.push(`  Problem: ${escapeMarkdownText(finding.what)}`);
        lines.push(`  Why it matters: ${escapeMarkdownText(finding.why)}`);
        lines.push(`  Suggested fix: ${escapeMarkdownText(finding.fix)}`);
      }
      lines.push('');
    }
    if (lines[lines.length - 1] === '') {
      lines.pop();
    }
  }

  if (review.notes.length > 0) {
    lines.push('', '## Notes');
    for (const note of review.notes) {
      lines.push(`- ${escapeMarkdownText(note)}`);
    }
  }

  lines.push(
    '',
    '## Overall Assessment',
    `**${ASSESSMENTS[review.overallAssessment]}** — ${escapeMarkdownText(review.overallRationale)}`,
    '',
    `> Reviewed by \`${model}\``
  );

  return lines.join('\n');
}

export function renderIncompleteReview({ model, reason, runUrl, runtimeTools, turnsUsed }) {
  const lines = [
    '## AI Review Incomplete',
    '',
    'Claude did not return validated structured review output, so this workflow did not publish raw scratch text.',
    '',
    `- Reason: ${escapeMarkdownText(reason)}`,
  ];

  if (runtimeTools?.length) {
    lines.push(`- Runtime tools: ${runtimeTools.map(renderCode).join(', ')}`);
  }
  if (typeof turnsUsed === 'number') {
    lines.push(`- Turns used: ${turnsUsed}`);
  }

  lines.push('', `Re-run \`/review\` or inspect [the workflow run](${runUrl}).`, '', `> Reviewed by \`${model}\``);
  return lines.join('\n');
}

export function writeReviewFromEnv(env = process.env) {
  const outputFile = env.AI_REVIEW_OUTPUT_FILE || 'pr_review.md';
  const model = env.AI_REVIEW_MODEL || 'unknown-model';
  const runUrl = env.AI_REVIEW_RUN_URL || '#';
  const validation = normalizeStructuredOutput(env.AI_REVIEW_STRUCTURED_OUTPUT);
  const metadata = readExecutionMetadata(env.AI_REVIEW_EXECUTION_FILE);
  const content = validation.ok
    ? renderStructuredReview(validation.value, { model })
    : renderIncompleteReview({
        model,
        reason: validation.reason,
        runUrl,
        runtimeTools: metadata.runtimeTools,
        turnsUsed: metadata.turnsUsed,
      });

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${content}\n`, 'utf8');

  if (!validation.ok) {
    console.warn(`::warning::AI review output normalization fell back to incomplete comment: ${validation.reason}`);
  }

  return { usedFallback: !validation.ok, content };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  writeReviewFromEnv();
}
