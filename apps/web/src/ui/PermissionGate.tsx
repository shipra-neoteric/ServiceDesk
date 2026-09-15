import type { ReactNode } from 'react';
import type { PermissionKey } from '@servicedesk/shared';
import { useAuth } from '../app/AuthProvider';

/**
 * UX-only gate (§37: "hidden buttons are not authorization"). Every action gated here is
 * re-checked server-side by requirePermission()/project-scope middleware regardless of
 * what this component renders.
 */
export function PermissionGate({
  permissions,
  fallback = null,
  children,
}: {
  permissions: PermissionKey[];
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { hasPermission } = useAuth();
  if (!hasPermission(...permissions)) return <>{fallback}</>;
  return <>{children}</>;
}
