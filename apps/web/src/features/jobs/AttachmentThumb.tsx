import { useEffect, useState } from 'react';
import { FileText, Video } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';

/**
 * Renders one attachment by fetching it through the authenticated, job-scoped file endpoint
 * (never a bare <img src="/uploads/...">, which would bypass auth — see
 * apps/api/src/modules/attachments/routes.ts). The blob is fetched with the same axios
 * instance used everywhere else, so it carries the Authorization header and gets a normalized
 * 404 if the caller isn't allowed to see this job's evidence.
 */
export function AttachmentThumb({
  jobId,
  attachmentId,
  type,
  caption,
}: {
  jobId: string;
  attachmentId: string;
  type: string;
  caption: string;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    apiClient
      .get(`/jobs/${jobId}/attachments/${attachmentId}/file`, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;
        url = URL.createObjectURL(res.data as Blob);
        setObjectUrl(url);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [jobId, attachmentId]);

  const open = () => objectUrl && window.open(objectUrl, '_blank', 'noopener');

  if (failed) {
    return <div className="flex h-24 items-center justify-center rounded-md border border-border text-xs text-danger dark:border-border-dark">Unavailable</div>;
  }
  if (!objectUrl) {
    return <div className="h-24 animate-pulse rounded-md bg-surface-muted dark:bg-surface-dark-muted" />;
  }
  return (
    <button onClick={open} className="block w-full overflow-hidden rounded-md border border-border text-left dark:border-border-dark" title={caption}>
      {type === 'PHOTO' ? (
        <img src={objectUrl} alt={caption} className="h-24 w-full object-cover" />
      ) : (
        <div className="flex h-24 flex-col items-center justify-center gap-1 text-content-muted dark:text-content-dark-muted">
          {type === 'VIDEO' ? <Video className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
          <span className="text-[11px]">{type}</span>
        </div>
      )}
    </button>
  );
}
