import { fireEvent, render, screen, waitFor } from '@tests/setup/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImageAnalysisStatus } from '@/lib/api-client';

vi.mock('@/components/shared/code-editor', () => ({
  CodeEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea
      aria-label="raw config editor"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

vi.mock('@/components/profiles/editor/header-section', () => ({
  HeaderSection: () => <div data-testid="profile-editor-header" />,
}));

vi.mock('@/components/profiles/editor/friendly-ui-section', () => ({
  FriendlyUISection: () => <div data-testid="profile-editor-friendly-ui" />,
}));

vi.mock('@/components/shared/confirm-dialog', () => ({
  ConfirmDialog: () => null,
}));

vi.mock('@/components/shared/global-env-indicator', () => ({
  GlobalEnvIndicator: () => <div data-testid="global-env-indicator" />,
}));

import { ImageAnalysisStatusSection } from '@/components/profiles/editor/image-analysis-status-section';
import { ProfileEditor } from '@/components/profiles/editor';

function createStatus(overrides: Partial<ImageAnalysisStatus> = {}): ImageAnalysisStatus {
  return {
    enabled: true,
    supported: true,
    status: 'active',
    backendId: 'gemini',
    backendDisplayName: 'Google Gemini',
    model: 'gemini-2.5-flash',
    resolutionSource: 'cliproxy-bridge',
    reason: null,
    shouldPersistHook: true,
    persistencePath: '/tmp/.ccs/glm.settings.json',
    runtimePath: '/api/provider/gemini',
    usesCurrentTarget: true,
    usesCurrentAuthToken: true,
    hookInstalled: true,
    sharedHookInstalled: true,
    authReadiness: 'ready',
    authProvider: 'gemini',
    authDisplayName: 'Google Gemini',
    authReason: null,
    proxyReadiness: 'ready',
    proxyReason: 'Local CLIProxy service is reachable.',
    effectiveRuntimeMode: 'cliproxy-image-analysis',
    effectiveRuntimeReason: null,
    ...overrides,
  };
}

function createJsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ImageAnalysisStatusSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders saved diagnostics for an active backend', () => {
    render(<ImageAnalysisStatusSection status={createStatus()} />);

    expect(screen.getByText('Image Analysis')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Saved runtime status for this profile\. Config stays in the JSON editor above; auth and proxy readiness are derived at runtime\./i
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('CLIProxy Active')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Images and PDFs for this profile resolve through Google Gemini via CLIProxy\./i
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Configured backend')).toBeInTheDocument();
    expect(screen.getByText('Effective runtime')).toBeInTheDocument();
    expect(screen.getByText('Hook persistence')).toBeInTheDocument();
    expect(screen.getByText('Google Gemini')).toBeInTheDocument();
    expect(screen.getByText('CLIProxy image analysis')).toBeInTheDocument();
    expect(screen.getByText('Hook saved to profile')).toBeInTheDocument();
    expect(screen.getByTitle(/\/api\/provider\/gemini/)).toBeInTheDocument();
    expect(screen.getAllByText('Google Gemini ready')).toHaveLength(1);
    expect(screen.getByText('Local CLIProxy ready')).toBeInTheDocument();
    expect(screen.getByText('gemini-2.5-flash')).toBeInTheDocument();
  });

  it('renders mapped status and the explicit mapping explanation', () => {
    render(
      <ImageAnalysisStatusSection
        status={createStatus({
          backendId: 'ghcp',
          backendDisplayName: 'GitHub Copilot (OAuth)',
          model: 'claude-haiku-4.5',
          resolutionSource: 'profile-backend',
          authReadiness: 'ready',
          authProvider: 'ghcp',
          authDisplayName: 'GitHub Copilot (OAuth)',
        })}
      />
    );

    expect(screen.getByText('CLIProxy Active')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Images and PDFs for this profile resolve through GitHub Copilot \(OAuth\) via a saved Image Analysis mapping\./i
      )
    ).toBeInTheDocument();
    expect(screen.getByText('GitHub Copilot (OAuth)')).toBeInTheDocument();
    expect(screen.getByText('Saved Image Analysis mapping')).toBeInTheDocument();
    expect(screen.getByText('claude-haiku-4.5')).toBeInTheDocument();
  });

  it('renders hook-missing state as native file access until the hook is installed', () => {
    render(
      <ImageAnalysisStatusSection
        status={createStatus({
          status: 'hook-missing',
          reason: 'Profile hook is missing from the persisted settings file.',
          effectiveRuntimeMode: 'native-read',
          effectiveRuntimeReason: 'Profile hook is missing from the persisted settings file.',
        })}
      />
    );

    expect(screen.getByText('Setup needed')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Images and PDFs are configured for Google Gemini, but Profile hook is missing/i
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Native file access')).toBeInTheDocument();
    expect(screen.getByTitle(/native file access/i)).toBeInTheDocument();
  });

  it('shows auth readiness gaps separately from backend resolution', () => {
    render(
      <ImageAnalysisStatusSection
        status={createStatus({
          backendId: 'ghcp',
          backendDisplayName: 'GitHub Copilot (OAuth)',
          model: 'claude-haiku-4.5',
          runtimePath: '/api/provider/ghcp',
          authReadiness: 'missing',
          authProvider: 'ghcp',
          authDisplayName: 'GitHub Copilot (OAuth)',
          authReason:
            'GitHub Copilot (OAuth) auth is missing. Run "ccs ghcp --auth" to enable image analysis.',
          effectiveRuntimeMode: 'native-read',
          effectiveRuntimeReason:
            'GitHub Copilot (OAuth) auth is missing. Run "ccs ghcp --auth" to enable image analysis.',
        })}
      />
    );

    expect(screen.getByText('Needs auth')).toBeInTheDocument();
    expect(
      screen.getByText(/This profile currently falls back to native file access\./i)
    ).toBeInTheDocument();
    expect(screen.getByText('Native file access')).toBeInTheDocument();
    expect(
      screen.getAllByText(/Run "ccs ghcp --auth" to enable image analysis/i).length
    ).toBeGreaterThanOrEqual(3);
  });

  it('treats an idle local proxy as launchable instead of unavailable', () => {
    render(
      <ImageAnalysisStatusSection
        status={createStatus({
          proxyReadiness: 'stopped',
          proxyReason:
            'Local CLIProxy service is idle. CCS will start it automatically when image analysis is needed.',
        })}
      />
    );

    expect(screen.getByText('Starts on launch')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Images and PDFs for this profile resolve through Google Gemini\. Auth is ready and CCS will start the local CLIProxy runtime when needed\./i
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Local CLIProxy idle; starts on launch')).toBeInTheDocument();
    expect(screen.getByText('Auth ready • Local CLIProxy starts on demand')).toBeInTheDocument();
    expect(screen.getByTitle(/start local CLIProxy/i)).toBeInTheDocument();
  });

  it('shows saved Claude-side diagnostics when the current target bypasses the hook', () => {
    render(<ImageAnalysisStatusSection status={createStatus()} target="droid" />);

    expect(screen.getByText('Target bypassed')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Images and PDFs for this profile are configured to resolve through Google Gemini when the profile runs on Claude Code\./i
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Current default target: Factory Droid\. The diagnostics below describe the saved Claude-side Image Analysis hook/i
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Not active on Factory Droid')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Factory Droid bypasses the Claude Read hook\. Switch the target back to Claude Code to use the saved backend shown here\./i
      )
    ).toBeInTheDocument();
    expect(screen.getByTitle(/Factory Droid launch -> no Claude Read hook/i)).toBeInTheDocument();
  });

  it('keeps saved Claude-side auth failures visible when another target bypasses the hook', () => {
    render(
      <ImageAnalysisStatusSection
        status={createStatus({
          backendId: 'ghcp',
          backendDisplayName: 'GitHub Copilot (OAuth)',
          authReadiness: 'missing',
          authProvider: 'ghcp',
          authDisplayName: 'GitHub Copilot (OAuth)',
          authReason:
            'GitHub Copilot (OAuth) auth is missing. Run "ccs ghcp --auth" to enable image analysis.',
          effectiveRuntimeMode: 'native-read',
          effectiveRuntimeReason:
            'GitHub Copilot (OAuth) auth is missing. Run "ccs ghcp --auth" to enable image analysis.',
        })}
        target="codex"
      />
    );

    expect(screen.getByText('Needs auth')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Current default target: Codex CLI\. This launch path bypasses the Claude Read hook, and the saved Claude-side setup for GitHub Copilot \(OAuth\) still falls back to native file access\./i
      )
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/Run "ccs ghcp --auth" to enable image analysis/i).length
    ).toBeGreaterThanOrEqual(1);
  });

  it('falls back to backend id when a display name is unavailable', () => {
    render(
      <ImageAnalysisStatusSection
        status={createStatus({
          backendDisplayName: null,
          backendId: 'ghcp',
        })}
      />
    );

    expect(screen.getByText('ghcp')).toBeInTheDocument();
  });

  it('switches the panel to a live preview when the current editor JSON changes', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes('/api/settings/glm/raw')) {
        return Promise.resolve(
          createJsonResponse({
            profile: 'glm',
            settings: {
              env: {
                ANTHROPIC_BASE_URL: 'https://api.z.ai/v1',
                ANTHROPIC_AUTH_TOKEN: 'saved-token',
              },
            },
            mtime: 1,
            path: '/tmp/glm.settings.json',
            imageAnalysisStatus: createStatus(),
          })
        );
      }

      if (url.includes('/api/settings/glm/image-analysis-status')) {
        expect(init?.method).toBe('POST');
        return Promise.resolve(
          createJsonResponse({
            imageAnalysisStatus: createStatus({
              backendId: 'ghcp',
              backendDisplayName: 'GitHub Copilot (OAuth)',
              model: 'claude-haiku-4.5',
              runtimePath: '/api/provider/ghcp',
              authReadiness: 'ready',
              authProvider: 'ghcp',
              authDisplayName: 'GitHub Copilot (OAuth)',
            }),
          })
        );
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<ProfileEditor profileName="glm" profileTarget="claude" />);

    expect(await screen.findByText('Google Gemini')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('raw config editor'), {
      target: {
        value: JSON.stringify(
          {
            env: {
              ANTHROPIC_BASE_URL: 'https://proxy.example/api/provider/ghcp',
              ANTHROPIC_AUTH_TOKEN: 'preview-token',
            },
          },
          null,
          2
        ),
      },
    });

    await waitFor(() => {
      expect(screen.getByText('GitHub Copilot (OAuth)')).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        /Live preview from the current editor state\. Save to persist config changes; auth and proxy readiness stay derived below\./i
      )
    ).toBeInTheDocument();
  });

  it('falls back to saved status messaging when the editor JSON is invalid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('/api/settings/glm/raw')) {
          return Promise.resolve(
            createJsonResponse({
              profile: 'glm',
              settings: {
                env: {
                  ANTHROPIC_BASE_URL: 'https://api.z.ai/v1',
                  ANTHROPIC_AUTH_TOKEN: 'saved-token',
                },
              },
              mtime: 1,
              path: '/tmp/glm.settings.json',
              imageAnalysisStatus: createStatus(),
            })
          );
        }

        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      })
    );

    render(<ProfileEditor profileName="glm" profileTarget="claude" />);

    expect(await screen.findByText('Google Gemini')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('raw config editor'), {
      target: { value: '{' },
    });

    await waitFor(() => {
      expect(
        screen.getByText(
          /Showing last saved runtime status\. The live preview resumes when the JSON above is valid again\./i
        )
      ).toBeInTheDocument();
    });
    expect(screen.getByText('Google Gemini')).toBeInTheDocument();
  });

  it('marks the preview as refreshing when a newer editor preview is still loading', async () => {
    let secondPreviewResolver: ((value: Response) => void) | null = null;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes('/api/settings/glm/raw')) {
        return Promise.resolve(
          createJsonResponse({
            profile: 'glm',
            settings: {
              env: {
                ANTHROPIC_BASE_URL: 'https://api.z.ai/v1',
                ANTHROPIC_AUTH_TOKEN: 'saved-token',
              },
            },
            mtime: 1,
            path: '/tmp/glm.settings.json',
            imageAnalysisStatus: createStatus(),
          })
        );
      }

      if (url.includes('/api/settings/glm/image-analysis-status')) {
        expect(init?.method).toBe('POST');
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          settings?: { env?: Record<string, string> };
        };
        const baseUrl = body.settings?.env?.ANTHROPIC_BASE_URL ?? '';

        if (baseUrl.includes('/ghcp')) {
          return Promise.resolve(
            createJsonResponse({
              imageAnalysisStatus: createStatus({
                backendId: 'ghcp',
                backendDisplayName: 'GitHub Copilot (OAuth)',
                model: 'claude-haiku-4.5',
                runtimePath: '/api/provider/ghcp',
                authReadiness: 'ready',
                authProvider: 'ghcp',
                authDisplayName: 'GitHub Copilot (OAuth)',
              }),
            })
          );
        }

        if (baseUrl.includes('/codex')) {
          return new Promise<Response>((resolve) => {
            secondPreviewResolver = resolve;
          });
        }
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<ProfileEditor profileName="glm" profileTarget="claude" />);

    expect(await screen.findByText('Google Gemini')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('raw config editor'), {
      target: {
        value: JSON.stringify(
          {
            env: {
              ANTHROPIC_BASE_URL: 'https://proxy.example/api/provider/ghcp',
              ANTHROPIC_AUTH_TOKEN: 'preview-token',
            },
          },
          null,
          2
        ),
      },
    });

    expect(await screen.findByText('GitHub Copilot (OAuth)')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('raw config editor'), {
      target: {
        value: JSON.stringify(
          {
            env: {
              ANTHROPIC_BASE_URL: 'https://proxy.example/api/provider/codex',
              ANTHROPIC_AUTH_TOKEN: 'preview-token-2',
            },
          },
          null,
          2
        ),
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Refreshing')).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Refreshing the live preview from the current editor state\./i)
    ).toBeInTheDocument();

    secondPreviewResolver?.(
      createJsonResponse({
        imageAnalysisStatus: createStatus({
          backendId: 'codex',
          backendDisplayName: 'Codex',
          model: 'gpt-5.4',
          runtimePath: '/api/provider/codex',
          authReadiness: 'ready',
          authProvider: 'codex',
          authDisplayName: 'Codex',
        }),
      })
    );

    await waitFor(() => {
      expect(screen.getByText('Codex')).toBeInTheDocument();
    });
  });
});
