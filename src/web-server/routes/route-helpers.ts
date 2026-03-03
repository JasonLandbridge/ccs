/**
 * Route Helpers - Shared utility functions for route handlers
 */

import * as fs from 'fs';
import * as path from 'path';
import { getCcsDir, getConfigPath, loadConfigSafe, loadSettings } from '../../utils/config-manager';
import { expandPath } from '../../utils/helpers';
import { getClaudeSettingsPath } from '../../utils/claude-config-path';
import { resolveDroidProvider } from '../../targets/droid-provider';
import { mapExternalProviderName } from '../../cliproxy/provider-capabilities';
import {
  canonicalizeModelIdForProvider,
  extractProviderFromPathname,
  getDeniedModelIdReasonForProvider,
} from '../../cliproxy/model-id-normalizer';
import type { CLIProxyProvider } from '../../cliproxy/types';
import type { Config, Settings } from '../../types/config';

/** Model mapping for API profiles */
export interface ModelMapping {
  model?: string;
  opusModel?: string;
  sonnetModel?: string;
  haikuModel?: string;
}

function resolveProviderFromBaseUrl(baseUrl: unknown): CLIProxyProvider | null {
  if (typeof baseUrl !== 'string' || baseUrl.trim().length === 0) {
    return null;
  }

  try {
    const parsed = new URL(baseUrl);
    const extracted = extractProviderFromPathname(parsed.pathname);
    return extracted ? mapExternalProviderName(extracted) : null;
  } catch {
    const extracted = extractProviderFromPathname(baseUrl);
    return extracted ? mapExternalProviderName(extracted) : null;
  }
}

function resolveProviderForModelCanonicalization(
  baseUrl: unknown,
  providerHint: unknown
): CLIProxyProvider | null {
  if (typeof providerHint === 'string' && providerHint.trim().length > 0) {
    const fromProviderHint = mapExternalProviderName(providerHint);
    if (fromProviderHint) {
      return fromProviderHint;
    }
  }
  return resolveProviderFromBaseUrl(baseUrl);
}

function getDeniedModelReasonForProvider(
  provider: CLIProxyProvider | null,
  values: Array<string | undefined>
): string | null {
  if (!provider) return null;
  for (const value of values) {
    if (typeof value !== 'string' || value.trim().length === 0) continue;
    const deniedReason = getDeniedModelIdReasonForProvider(value, provider);
    if (deniedReason) return deniedReason;
  }
  return null;
}

function canonicalizeModelForProvider(
  provider: CLIProxyProvider | null,
  value: string | undefined
): string | undefined {
  if (typeof value !== 'string') return value;
  if (!provider || value.trim().length === 0) return value;
  return canonicalizeModelIdForProvider(value, provider);
}

/**
 * Read config safely with fallback.
 * Uses loadConfigSafe which supports both unified (config.yaml) and legacy (config.json).
 */
export function readConfigSafe(): Config {
  try {
    return loadConfigSafe();
  } catch {
    return { profiles: {} };
  }
}

/**
 * Write config atomically
 */
export function writeConfig(config: Config): void {
  const configPath = getConfigPath();
  const tempPath = configPath + '.tmp';
  fs.writeFileSync(tempPath, JSON.stringify(config, null, 2) + '\n');
  fs.renameSync(tempPath, configPath);
}

/**
 * Check if profile is configured (has valid settings file)
 */
export function isConfigured(profileName: string, config: Config): boolean {
  const settingsPath = config.profiles[profileName];
  if (!settingsPath) return false;

  try {
    const expandedPath = expandPath(settingsPath);
    if (!fs.existsSync(expandedPath)) return false;

    const settings = loadSettings(expandedPath);
    return !!(settings.env?.ANTHROPIC_BASE_URL && settings.env?.ANTHROPIC_AUTH_TOKEN);
  } catch {
    return false;
  }
}

/**
 * Create settings file for profile
 */
export function createSettingsFile(
  name: string,
  baseUrl: string,
  apiKey: string,
  models: ModelMapping = {},
  provider?: string
): string {
  const settingsPath = path.join(getCcsDir(), `${name}.settings.json`);
  const { model, opusModel, sonnetModel, haikuModel } = models;
  const providerForModelCanonicalization = resolveProviderForModelCanonicalization(
    baseUrl,
    provider
  );
  const canonicalModel = canonicalizeModelForProvider(providerForModelCanonicalization, model);
  const canonicalOpusModel = canonicalizeModelForProvider(
    providerForModelCanonicalization,
    opusModel
  );
  const canonicalSonnetModel = canonicalizeModelForProvider(
    providerForModelCanonicalization,
    sonnetModel
  );
  const canonicalHaikuModel = canonicalizeModelForProvider(
    providerForModelCanonicalization,
    haikuModel
  );
  const deniedReason = getDeniedModelReasonForProvider(providerForModelCanonicalization, [
    canonicalModel,
    canonicalOpusModel,
    canonicalSonnetModel,
    canonicalHaikuModel,
  ]);
  if (deniedReason) {
    throw new Error(deniedReason);
  }
  const droidProvider = resolveDroidProvider({
    provider,
    baseUrl,
    model: canonicalModel,
  });

  const settings: Settings = {
    env: {
      ANTHROPIC_BASE_URL: baseUrl,
      ANTHROPIC_AUTH_TOKEN: apiKey,
      ...(canonicalModel && { ANTHROPIC_MODEL: canonicalModel }),
      ...(canonicalOpusModel && { ANTHROPIC_DEFAULT_OPUS_MODEL: canonicalOpusModel }),
      ...(canonicalSonnetModel && { ANTHROPIC_DEFAULT_SONNET_MODEL: canonicalSonnetModel }),
      ...(canonicalHaikuModel && { ANTHROPIC_DEFAULT_HAIKU_MODEL: canonicalHaikuModel }),
      CCS_DROID_PROVIDER: droidProvider,
    },
  };

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  return `~/.ccs/${name}.settings.json`;
}

/**
 * Update settings file
 */
export function updateSettingsFile(
  name: string,
  updates: {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    opusModel?: string;
    sonnetModel?: string;
    haikuModel?: string;
    provider?: string;
  }
): void {
  const settingsPath = path.join(getCcsDir(), `${name}.settings.json`);

  if (!fs.existsSync(settingsPath)) {
    throw new Error('Settings file not found');
  }

  const settings = loadSettings(settingsPath);
  const providerForValidation =
    resolveProviderForModelCanonicalization(updates.baseUrl, updates.provider) ??
    resolveProviderForModelCanonicalization(
      settings.env?.ANTHROPIC_BASE_URL,
      updates.provider ?? settings.env?.CCS_DROID_PROVIDER
    );
  const canonicalModel =
    updates.model !== undefined
      ? canonicalizeModelForProvider(providerForValidation, updates.model)
      : undefined;
  const canonicalOpusModel =
    updates.opusModel !== undefined
      ? canonicalizeModelForProvider(providerForValidation, updates.opusModel)
      : undefined;
  const canonicalSonnetModel =
    updates.sonnetModel !== undefined
      ? canonicalizeModelForProvider(providerForValidation, updates.sonnetModel)
      : undefined;
  const canonicalHaikuModel =
    updates.haikuModel !== undefined
      ? canonicalizeModelForProvider(providerForValidation, updates.haikuModel)
      : undefined;
  const deniedReason = getDeniedModelReasonForProvider(providerForValidation, [
    canonicalModel !== undefined ? canonicalModel : settings.env?.ANTHROPIC_MODEL,
    canonicalOpusModel !== undefined
      ? canonicalOpusModel
      : settings.env?.ANTHROPIC_DEFAULT_OPUS_MODEL,
    canonicalSonnetModel !== undefined
      ? canonicalSonnetModel
      : settings.env?.ANTHROPIC_DEFAULT_SONNET_MODEL,
    canonicalHaikuModel !== undefined
      ? canonicalHaikuModel
      : settings.env?.ANTHROPIC_DEFAULT_HAIKU_MODEL,
  ]);
  if (deniedReason) {
    throw new Error(deniedReason);
  }

  if (updates.baseUrl) {
    settings.env = settings.env || {};
    settings.env.ANTHROPIC_BASE_URL = updates.baseUrl;
  }

  if (updates.apiKey) {
    settings.env = settings.env || {};
    settings.env.ANTHROPIC_AUTH_TOKEN = updates.apiKey;
  }

  if (updates.model !== undefined) {
    settings.env = settings.env || {};
    if (canonicalModel) {
      settings.env.ANTHROPIC_MODEL = canonicalModel;
    } else {
      delete settings.env.ANTHROPIC_MODEL;
    }
  }

  // Handle model mapping fields
  if (updates.opusModel !== undefined) {
    settings.env = settings.env || {};
    if (canonicalOpusModel) {
      settings.env.ANTHROPIC_DEFAULT_OPUS_MODEL = canonicalOpusModel;
    } else {
      delete settings.env.ANTHROPIC_DEFAULT_OPUS_MODEL;
    }
  }

  if (updates.sonnetModel !== undefined) {
    settings.env = settings.env || {};
    if (canonicalSonnetModel) {
      settings.env.ANTHROPIC_DEFAULT_SONNET_MODEL = canonicalSonnetModel;
    } else {
      delete settings.env.ANTHROPIC_DEFAULT_SONNET_MODEL;
    }
  }

  if (updates.haikuModel !== undefined) {
    settings.env = settings.env || {};
    if (canonicalHaikuModel) {
      settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = canonicalHaikuModel;
    } else {
      delete settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL;
    }
  }

  if (
    updates.provider !== undefined ||
    updates.baseUrl !== undefined ||
    updates.model !== undefined ||
    settings.env?.CCS_DROID_PROVIDER
  ) {
    settings.env = settings.env || {};
    const resolvedProvider = resolveDroidProvider({
      provider: updates.provider ?? settings.env.CCS_DROID_PROVIDER,
      baseUrl: updates.baseUrl ?? settings.env.ANTHROPIC_BASE_URL,
      model: canonicalModel ?? settings.env.ANTHROPIC_MODEL,
    });
    settings.env.CCS_DROID_PROVIDER = resolvedProvider;
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

/**
 * Security: Validate file path is within allowed directories
 * - ~/.ccs/ directory: read/write allowed
 * - ~/.claude/settings.json: read-only
 */
function normalizePathForComparison(filePath: string): string {
  const normalized = path.resolve(path.normalize(filePath));
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isPathWithin(basePath: string, targetPath: string): boolean {
  const relative = path.relative(basePath, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isSymlinkPath(filePath: string): boolean {
  try {
    return fs.lstatSync(filePath).isSymbolicLink();
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT' || nodeError.code === 'ENOTDIR') {
      return false;
    }
    return true;
  }
}

function hasSymlinkSegment(basePath: string, targetPath: string): boolean {
  const relative = path.relative(basePath, targetPath);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    return false;
  }

  let currentPath = basePath;
  const segments = relative.split(path.sep).filter(Boolean);
  for (const segment of segments) {
    currentPath = path.join(currentPath, segment);
    if (isSymlinkPath(currentPath)) {
      return true;
    }
  }

  return false;
}

export function validateFilePath(filePath: string): {
  valid: boolean;
  readonly: boolean;
  error?: string;
} {
  const expandedPath = expandPath(filePath);
  const resolvedPath = path.resolve(path.normalize(expandedPath));
  const resolvedCcsDir = path.resolve(path.normalize(getCcsDir()));
  const resolvedClaudeSettingsPath = path.resolve(path.normalize(getClaudeSettingsPath()));
  const normalizedPath = normalizePathForComparison(resolvedPath);
  const ccsDir = normalizePathForComparison(resolvedCcsDir);
  const claudeSettingsPath = normalizePathForComparison(resolvedClaudeSettingsPath);

  // Check if path is within ~/.ccs/
  if (isPathWithin(ccsDir, normalizedPath)) {
    if (hasSymlinkSegment(resolvedCcsDir, resolvedPath)) {
      return { valid: false, readonly: false, error: 'Access to this path is not allowed' };
    }

    // Block access to sensitive subdirectories
    const relativePath = path.relative(ccsDir, normalizedPath);
    const pathSegments = relativePath.split(path.sep).filter(Boolean);
    if (pathSegments.includes('.git') || pathSegments.includes('node_modules')) {
      return { valid: false, readonly: false, error: 'Access to this path is not allowed' };
    }
    return { valid: true, readonly: false };
  }

  // Allow read-only access to ~/.claude/settings.json
  if (normalizedPath === claudeSettingsPath) {
    if (isSymlinkPath(resolvedClaudeSettingsPath)) {
      return { valid: false, readonly: false, error: 'Access to this path is not allowed' };
    }
    return { valid: true, readonly: true };
  }

  return { valid: false, readonly: false, error: 'Access to this path is not allowed' };
}
