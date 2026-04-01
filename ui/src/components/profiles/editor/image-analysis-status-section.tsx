import { AlertTriangle, Image as ImageIcon, Route } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CliTarget, ImageAnalysisStatus } from '@/lib/api-client';

interface ImageAnalysisStatusSectionProps {
  status?: ImageAnalysisStatus | null;
  target?: CliTarget;
  source?: 'saved' | 'editor';
  previewState?: 'saved' | 'preview' | 'refreshing' | 'invalid';
}

const RESOLUTION_SOURCE_LABELS: Record<ImageAnalysisStatus['resolutionSource'], string> = {
  'cliproxy-provider': 'Direct provider route',
  'cliproxy-variant': 'Variant route',
  'cliproxy-composite': 'Composite route',
  'copilot-alias': 'Copilot alias',
  'cliproxy-bridge': 'Derived from profile API route',
  'profile-backend': 'Saved Image Analysis mapping',
  'fallback-backend': 'Fallback backend',
  disabled: 'Disabled globally',
  'unsupported-profile': 'Unsupported profile type',
  unresolved: 'No backend mapped',
  'missing-model': 'Missing model',
};
const TARGET_LABELS: Record<CliTarget, string> = {
  claude: 'Claude Code',
  droid: 'Factory Droid',
  codex: 'Codex CLI',
};

function getPreviewBadge(
  source: 'saved' | 'editor',
  previewState: ImageAnalysisStatusSectionProps['previewState']
) {
  if (previewState === 'refreshing') {
    return { label: 'Refreshing', variant: 'outline' as const };
  }

  if (source === 'editor') {
    return { label: 'Live Preview', variant: 'secondary' as const };
  }

  return { label: 'Saved', variant: 'outline' as const };
}

function getRuntimeBadge(status: ImageAnalysisStatus | null | undefined, target: CliTarget) {
  if (!status) return { label: 'Checking', variant: 'outline' as const };
  if (target !== 'claude') {
    if (status.status === 'disabled') return { label: 'Disabled', variant: 'outline' as const };
    if (status.status === 'hook-missing')
      return { label: 'Setup needed', variant: 'destructive' as const };
    if (status.authReadiness === 'missing')
      return { label: 'Needs auth', variant: 'destructive' as const };
    if (status.proxyReadiness === 'unavailable')
      return { label: 'Needs proxy', variant: 'destructive' as const };
    if (status.effectiveRuntimeMode === 'native-read' && status.backendId) {
      return { label: 'Saved fallback', variant: 'outline' as const };
    }
    return { label: 'Target bypassed', variant: 'outline' as const };
  }
  if (status.status === 'disabled') return { label: 'Disabled', variant: 'outline' as const };
  if (status.status === 'hook-missing')
    return { label: 'Setup needed', variant: 'destructive' as const };
  if (status.authReadiness === 'missing')
    return { label: 'Needs auth', variant: 'destructive' as const };
  if (status.proxyReadiness === 'unavailable')
    return { label: 'Needs proxy', variant: 'destructive' as const };
  if (
    status.effectiveRuntimeMode === 'cliproxy-image-analysis' &&
    status.proxyReadiness === 'stopped'
  ) {
    return { label: 'Starts on launch', variant: 'secondary' as const };
  }
  if (status.effectiveRuntimeMode === 'cliproxy-image-analysis') {
    return { label: 'CLIProxy Active', variant: 'default' as const };
  }
  if (
    status.authReadiness === 'unknown' ||
    status.proxyReadiness === 'unknown' ||
    status.status === 'attention'
  ) {
    return { label: 'Needs review', variant: 'outline' as const };
  }
  return { label: 'Native Access', variant: 'outline' as const };
}

function getSummary(status: ImageAnalysisStatus, target: CliTarget): string {
  const backendName = status.backendDisplayName || status.backendId || 'this backend';
  const currentTarget = TARGET_LABELS[target];

  if (target !== 'claude') {
    if (!status.backendId) {
      return (
        status.reason ||
        `Current default target: ${currentTarget}. This launch path bypasses the Claude Read hook, and no Claude-side Image Analysis backend is currently mapped.`
      );
    }

    if (status.status === 'disabled') {
      return `Current default target: ${currentTarget}. This launch path bypasses the Claude Read hook, and saved Claude-side Image Analysis is disabled for this profile.`;
    }

    if (status.status === 'hook-missing') {
      return `Current default target: ${currentTarget}. This launch path bypasses the Claude Read hook, and the saved Claude-side setup for ${backendName} still falls back to native file access because ${status.reason || 'the profile hook is not fully installed yet.'}`;
    }

    if (status.effectiveRuntimeMode === 'native-read') {
      return `Current default target: ${currentTarget}. This launch path bypasses the Claude Read hook, and the saved Claude-side setup for ${backendName} still falls back to native file access. ${status.effectiveRuntimeReason || status.reason || `Image Analysis via ${backendName} could not be confirmed.`}`;
    }

    return `Images and PDFs for this profile are configured to resolve through ${backendName} when the profile runs on Claude Code.`;
  }

  if (status.status === 'disabled') {
    return 'Image Analysis is disabled globally, so images and PDFs use built-in file access for this profile.';
  }

  if (!status.backendId) {
    return status.reason || 'This profile currently uses built-in file access for images and PDFs.';
  }

  if (status.status === 'hook-missing') {
    return `Images and PDFs are configured for ${backendName}, but ${status.reason || 'the profile hook is not fully installed yet.'}`;
  }

  if (status.effectiveRuntimeMode === 'native-read') {
    return `This profile currently falls back to native file access. ${status.effectiveRuntimeReason || status.reason || `Image Analysis via ${backendName} could not be confirmed.`}`;
  }

  if (status.proxyReadiness === 'stopped') {
    return `Images and PDFs for this profile resolve through ${backendName}. Auth is ready and CCS will start the local CLIProxy runtime when needed.`;
  }

  if (status.resolutionSource === 'profile-backend') {
    return `Images and PDFs for this profile resolve through ${backendName} via a saved Image Analysis mapping.`;
  }

  if (status.status === 'attention' && status.reason) {
    return `Images and PDFs for this profile resolve through ${backendName} via CLIProxy, but ${status.reason}`;
  }

  return `Images and PDFs for this profile resolve through ${backendName} via CLIProxy.`;
}

function getRuntimeLine(status: ImageAnalysisStatus, target: CliTarget): string {
  if (target !== 'claude') {
    return `${TARGET_LABELS[target]} launch -> no Claude Read hook`;
  }

  if (status.effectiveRuntimeMode === 'native-read') {
    return 'Read -> native file access';
  }

  if (status.proxyReadiness === 'stopped') {
    return 'Read -> image-analysis hook -> start local CLIProxy';
  }

  if (status.proxyReadiness === 'remote') {
    return 'Read -> image-analysis hook -> remote CLIProxy';
  }

  return `Read -> image-analysis hook -> ${status.runtimePath || 'CLIProxy'}`;
}

function getConfiguredBackendDetail(status: ImageAnalysisStatus): string {
  if (!status.backendId) {
    return status.reason || 'No backend mapped';
  }

  return RESOLUTION_SOURCE_LABELS[status.resolutionSource] || 'Configured';
}

function getEffectiveRuntimeValue(status: ImageAnalysisStatus, target: CliTarget): string {
  if (target !== 'claude') {
    return `Not active on ${TARGET_LABELS[target]}`;
  }

  if (status.effectiveRuntimeMode === 'native-read') {
    return 'Native file access';
  }

  return 'CLIProxy image analysis';
}

function getEffectiveRuntimeDetail(status: ImageAnalysisStatus, target: CliTarget): string {
  if (target !== 'claude') {
    if (status.status === 'hook-missing') {
      return (
        status.reason ||
        `${TARGET_LABELS[target]} bypasses the Claude Read hook, and the saved Claude-side profile hook is still missing.`
      );
    }

    if (status.effectiveRuntimeMode === 'native-read') {
      return (
        status.effectiveRuntimeReason ||
        status.reason ||
        `${TARGET_LABELS[target]} bypasses the Claude Read hook, and the saved Claude-side setup currently falls back to native file access.`
      );
    }

    return `${TARGET_LABELS[target]} bypasses the Claude Read hook. Switch the target back to Claude Code to use the saved backend shown here.`;
  }

  if (status.effectiveRuntimeMode === 'native-read') {
    return (
      status.effectiveRuntimeReason ||
      status.reason ||
      'Uses built-in file access for this profile.'
    );
  }

  if (status.proxyReadiness === 'stopped') {
    return 'Auth ready • Local CLIProxy starts on demand';
  }

  if (status.proxyReadiness === 'remote') {
    return 'Auth ready • Remote CLIProxy reachable';
  }

  if (status.authReadiness === 'ready' && status.proxyReadiness === 'ready') {
    return 'Auth ready • Local CLIProxy reachable';
  }

  return status.proxyReason || status.authReason || 'Runtime verified';
}

function getAuthLine(status: ImageAnalysisStatus): string {
  if (status.authReadiness === 'not-needed') return 'Not required';
  if (status.authReadiness === 'ready')
    return `${status.authDisplayName || status.authProvider} ready`;
  return status.authReason || 'Auth readiness could not be verified.';
}

function getProxyLine(status: ImageAnalysisStatus): string {
  if (status.proxyReadiness === 'not-needed') return 'Not required';
  if (status.proxyReadiness === 'ready') return 'Local CLIProxy ready';
  if (status.proxyReadiness === 'remote') return status.proxyReason || 'Remote CLIProxy ready';
  if (status.proxyReadiness === 'stopped') return 'Local CLIProxy idle; starts on launch';
  return status.proxyReason || 'CLIProxy runtime readiness could not be verified.';
}

function getStatusContext(
  source: 'saved' | 'editor',
  previewState: ImageAnalysisStatusSectionProps['previewState']
): string {
  if (previewState === 'invalid') {
    return 'Showing last saved runtime status. The live preview resumes when the JSON above is valid again.';
  }
  if (previewState === 'refreshing') {
    return 'Refreshing the live preview from the current editor state.';
  }
  if (source === 'editor') {
    return 'Live preview from the current editor state. Save to persist config changes; auth and proxy readiness stay derived below.';
  }
  return 'Saved runtime status for this profile. Config stays in the JSON editor above; auth and proxy readiness are derived at runtime.';
}

function getPersistenceValue(status: ImageAnalysisStatus): string {
  if (!status.shouldPersistHook || !status.persistencePath) {
    return 'Not persisted';
  }

  return status.hookInstalled ? 'Hook saved to profile' : 'Hook missing from profile';
}

function getPersistenceDetail(status: ImageAnalysisStatus): string {
  if (!status.shouldPersistHook || !status.persistencePath) {
    return 'Not required for this profile type';
  }

  return status.persistencePath;
}

export function ImageAnalysisStatusSection({
  status,
  target = 'claude',
  source = 'saved',
  previewState = 'saved',
}: ImageAnalysisStatusSectionProps) {
  if (!status) {
    return (
      <div className="rounded-md border bg-muted/20 p-4" aria-live="polite">
        <div className="h-4 w-44 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-3 w-72 animate-pulse rounded bg-muted" />
        <p className="mt-3 text-sm text-muted-foreground">Checking backend status...</p>
      </div>
    );
  }

  const previewBadge = getPreviewBadge(source, previewState);
  const runtimeBadge = getRuntimeBadge(status, target);
  const bypassedOnCurrentTarget = target !== 'claude';
  const notice = bypassedOnCurrentTarget
    ? null
    : status.effectiveRuntimeMode === 'native-read'
      ? status.effectiveRuntimeReason
      : status.status === 'attention' || status.status === 'hook-missing'
        ? status.reason
        : null;

  return (
    <section className="rounded-md border bg-muted/20 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-sky-600" />
            <h3 className="text-sm font-semibold">Image Analysis</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {getStatusContext(source, previewState)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={previewBadge.variant} className="h-5 shrink-0 px-1.5 text-[10px]">
            {previewBadge.label}
          </Badge>
          <Badge variant={runtimeBadge.variant} className="h-5 shrink-0 px-1.5 text-[10px]">
            {runtimeBadge.label}
          </Badge>
        </div>
      </div>

      <p aria-live="polite" className="mt-3 text-sm leading-6 text-muted-foreground">
        {getSummary(status, target)}
      </p>

      {bypassedOnCurrentTarget && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-sm text-sky-900 dark:text-sky-200">
          <Route className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-300" />
          <span>
            Current default target: {TARGET_LABELS[target]}. The diagnostics below describe the
            saved Claude-side Image Analysis hook and apply again if you switch back to Claude Code.
          </span>
        </div>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-md border bg-background/70 p-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Configured backend
          </div>
          <div className="mt-2 text-sm font-medium text-foreground">
            {status.backendDisplayName || status.backendId || 'No backend mapped'}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {getConfiguredBackendDetail(status)}
          </p>
        </div>

        <div className="rounded-md border bg-background/70 p-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Effective runtime
          </div>
          <div className="mt-2 text-sm font-medium text-foreground">
            {getEffectiveRuntimeValue(status, target)}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {getEffectiveRuntimeDetail(status, target)}
          </p>
        </div>

        <div className="rounded-md border bg-background/70 p-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Hook persistence
          </div>
          <div className="mt-2 text-sm font-medium text-foreground">
            {getPersistenceValue(status)}
          </div>
          <p
            className="mt-1 text-xs leading-5 text-muted-foreground"
            title={status.persistencePath || 'Not persisted'}
          >
            {getPersistenceDetail(status)}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid gap-x-4 gap-y-3 sm:grid-cols-3">
        <div className="space-y-1">
          <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Auth
          </dt>
          <dd className="text-sm text-foreground">{getAuthLine(status)}</dd>
        </div>
        <div className="space-y-1">
          <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Proxy
          </dt>
          <dd className="text-sm text-foreground">{getProxyLine(status)}</dd>
        </div>
        <div className="space-y-1">
          <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Model
          </dt>
          <dd className={cn('text-sm text-foreground', status.model && 'font-mono text-xs')}>
            {status.model || status.reason || 'Unavailable'}
          </dd>
        </div>
      </dl>

      <div className="mt-4 rounded-md border bg-background/60 px-3 py-2">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Runtime path
        </div>
        <div
          className="mt-1 font-mono text-xs leading-5 text-foreground"
          title={getRuntimeLine(status, target)}
        >
          {getRuntimeLine(status, target)}
        </div>
      </div>

      {notice && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span>{notice}</span>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
        <Route className="h-3.5 w-3.5" />
        <span>
          This panel covers the Image Analysis hook only. WebSearch stays managed separately and is
          not controlled here.
        </span>
      </div>
    </section>
  );
}
