import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const reviewOutput = await import('../../../../scripts/github/normalize-ai-review-output.mjs');

describe('normalize-ai-review-output', () => {
  test('renders validated structured output into stable markdown', () => {
    const validation = reviewOutput.normalizeStructuredOutput(
      JSON.stringify({
        summary: 'The PR is mostly correct, but one blocking regression remains.',
        findings: [
          {
            severity: 'high',
            title: 'Ambiguous account lookup drops valid matches',
            file: 'src/cliproxy/accounts/query.ts',
            line: 61,
            what: 'Exact email matches can return null when duplicate accounts exist.',
            why: 'That breaks normal selection flows for users with multiple Codex sessions.',
            fix: 'Match by stable account identity first and keep ambiguous email lookups out of exact-match paths.',
          },
        ],
        overallAssessment: 'changes_requested',
        overallRationale: 'The blocking lookup regression should be fixed before merge.',
        notes: ['Docs update is present and looks aligned with the code changes.'],
      })
    );

    expect(validation.ok).toBe(true);
    const markdown = reviewOutput.renderStructuredReview(validation.value, { model: 'glm-5.1' });

    expect(markdown).toContain('## Summary');
    expect(markdown).toContain('### 🔴 High');
    expect(markdown).toContain('`src/cliproxy/accounts/query.ts:61`');
    expect(markdown).toContain('**❌ CHANGES REQUESTED**');
    expect(markdown).toContain('Why it matters: That breaks normal selection flows for users with multiple Codex sessions.');
    expect(markdown).toContain('> Reviewed by `glm-5.1`');
  });

  test('writes a safe incomplete comment instead of leaking raw assistant text', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-review-'));
    const executionFile = path.join(tempDir, 'claude-execution-output.json');
    const outputFile = path.join(tempDir, 'pr_review.md');

    fs.writeFileSync(
      executionFile,
      JSON.stringify([
        { type: 'system', subtype: 'init', tools: ['Bash', 'Edit', 'Read'] },
        {
          type: 'result',
          subtype: 'success',
          num_turns: 25,
          result: 'Now let me verify the findings before I finalize the review...',
        },
      ])
    );

    const result = reviewOutput.writeReviewFromEnv({
      AI_REVIEW_EXECUTION_FILE: executionFile,
      AI_REVIEW_MODEL: 'glm-5.1',
      AI_REVIEW_OUTPUT_FILE: outputFile,
      AI_REVIEW_RUN_URL: 'https://github.com/kaitranntt/ccs/actions/runs/23758377592',
      AI_REVIEW_STRUCTURED_OUTPUT: '',
    });

    expect(result.usedFallback).toBe(true);

    const markdown = fs.readFileSync(outputFile, 'utf8');
    expect(markdown).toContain('## AI Review Incomplete');
    expect(markdown).toContain('Runtime tools: `Bash`, `Edit`, `Read`');
    expect(markdown).toContain('Turns used: 25');
    expect(markdown).not.toContain('Now let me verify the findings');
  });

  test('escapes markdown-looking content and ignores malformed execution metadata', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-review-'));
    const executionFile = path.join(tempDir, 'claude-execution-output.json');
    const outputFile = path.join(tempDir, 'pr_review.md');

    fs.writeFileSync(executionFile, '{not valid json');

    const result = reviewOutput.writeReviewFromEnv({
      AI_REVIEW_EXECUTION_FILE: executionFile,
      AI_REVIEW_MODEL: 'glm-5.1',
      AI_REVIEW_OUTPUT_FILE: outputFile,
      AI_REVIEW_RUN_URL: 'https://github.com/kaitranntt/ccs/actions/runs/1',
      AI_REVIEW_STRUCTURED_OUTPUT: JSON.stringify({
        summary: 'Summary with `code` and ## heading markers.',
        findings: [
          {
            severity: 'low',
            title: 'Title with `ticks`',
            file: 'src/example.ts',
            line: 9,
            what: 'Problem text uses **bold** markers.',
            why: 'Why text uses [link] syntax.',
            fix: 'Fix text uses <html> markers.',
          },
        ],
        overallAssessment: 'approved_with_notes',
        overallRationale: 'Rationale keeps `_formatting_` stable.',
        notes: ['Note with `inline code`.'],
      }),
    });

    expect(result.usedFallback).toBe(false);

    const markdown = fs.readFileSync(outputFile, 'utf8');
    expect(markdown).toContain('Summary with \\`code\\` and ## heading markers.');
    expect(markdown).toContain('**`src/example.ts:9` — Title with \\`ticks\\`**');
    expect(markdown).toContain('Problem: Problem text uses \\*\\*bold\\*\\* markers.');
    expect(markdown).toContain('Why it matters: Why text uses \\[link\\] syntax.');
    expect(markdown).toContain('Suggested fix: Fix text uses \\<html\\> markers.');
    expect(markdown).toContain('**⚠️ APPROVED WITH NOTES**');
  });
});
