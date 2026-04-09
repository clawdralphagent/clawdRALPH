interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

const statusColors: Record<string, string> = {
  // Connection states
  connected: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  authenticated: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  connecting: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  disconnected: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  error: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',

  // Session states
  active: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  paused: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  stopped: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',

  // Loop states
  idle: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  running: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',

  // Story states
  pending: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  blocked: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',

  // Roles
  admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  user: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  channel: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300',
  node: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
  viewer: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
};

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const colorClass = statusColors[status.toLowerCase()] || statusColors.pending;
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${colorClass} ${sizeClass}`}>
      {status}
    </span>
  );
}
