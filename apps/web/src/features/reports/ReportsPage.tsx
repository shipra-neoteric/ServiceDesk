import { useState } from 'react';
import { Download } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { PageHeader } from '../../ui/PageHeader';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';

const REPORTS = [
  { key: 'open-job-aging', label: 'Open Job Aging', description: 'How long every currently-open Job Card has been open.' },
  { key: 'overdue', label: 'Overdue Jobs', description: 'Open jobs whose next action is past due.' },
  { key: 'project-performance', label: 'Project Performance', description: 'Closed jobs, average resolution time and reopen count per project.' },
  { key: 'delay-responsibility', label: 'Delay Responsibility', description: 'Which party (engineer, approval, material, vendor, management) owns each job’s largest delay.' },
  { key: 'reopened', label: 'Reopened Jobs', description: 'Jobs that were closed and later reopened, with the latest reopen reason.' },
];

export function ReportsPage() {
  const { push } = useToast();
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const download = async (key: string, label: string) => {
    setLoadingKey(key);
    try {
      const res = await apiClient.get(`/reports/${key}`, { params: { format: 'csv' }, responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${key}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      push(`Failed to export ${label}`, 'error');
    } finally {
      setLoadingKey(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Reports" description="Operational reports with CSV export. Definitions are documented in SLA_RULES.md." />
      <div className="grid gap-4 md:grid-cols-2">
        {REPORTS.map((r) => (
          <Card key={r.key}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-content dark:text-content-dark">{r.label}</p>
                <p className="mt-1 text-sm text-content-muted dark:text-content-dark-muted">{r.description}</p>
              </div>
              <Button size="sm" variant="secondary" loading={loadingKey === r.key} onClick={() => download(r.key, r.label)}>
                <Download className="h-4 w-4" /> CSV
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
