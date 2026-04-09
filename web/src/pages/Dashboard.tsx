import {
  Users,
  Monitor,
  MessageSquare,
  AlertTriangle,
  Clock,
  Activity
} from 'lucide-react';
import { useGateway } from '../hooks/useGateway';
import Card from '../components/Card';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString();
}

export default function Dashboard() {
  const { stats, sessions, clients, connectionState, refresh } = useGateway();

  const activeSessions = sessions.filter(s => s.state === 'active').length;
  const recentSessions = sessions.slice(0, 5);
  const recentClients = clients.slice(0, 5);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
          <p className="text-slate-600 dark:text-slate-400">System overview and status</p>
        </div>
        <button
          onClick={() => refresh()}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <StatCard
          title="Uptime"
          value={stats ? formatUptime(stats.uptime) : '-'}
          subtitle="Since last restart"
          icon={<Clock className="w-6 h-6 text-primary-600" />}
        />
        <StatCard
          title="Connections"
          value={stats?.connections.total ?? 0}
          subtitle={`${stats?.connections.authenticated ?? 0} authenticated`}
          icon={<Users className="w-6 h-6 text-primary-600" />}
        />
        <StatCard
          title="Active Sessions"
          value={activeSessions}
          subtitle={`${sessions.length} total`}
          icon={<Monitor className="w-6 h-6 text-primary-600" />}
        />
        <StatCard
          title="Messages"
          value={stats ? (stats.messages.received + stats.messages.sent).toLocaleString() : '-'}
          subtitle={stats ? `${stats.messages.errors} errors` : '-'}
          icon={<MessageSquare className="w-6 h-6 text-primary-600" />}
        />
      </div>

      {/* Connection Status Card */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card title="Connection Status">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Gateway Status</span>
              <StatusBadge status={connectionState} />
            </div>
            {stats && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Total Connections</span>
                  <span className="font-medium text-slate-900 dark:text-white">
                    {stats.connections.total}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Messages Received</span>
                  <span className="font-medium text-slate-900 dark:text-white">
                    {stats.messages.received.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Messages Sent</span>
                  <span className="font-medium text-slate-900 dark:text-white">
                    {stats.messages.sent.toLocaleString()}
                  </span>
                </div>
                {stats.messages.errors > 0 && (
                  <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                    <AlertTriangle className="w-4 h-4" />
                    <span>{stats.messages.errors} message errors</span>
                  </div>
                )}
              </>
            )}
          </div>
        </Card>

        <Card title="Connections by Role">
          {stats ? (
            <div className="space-y-3">
              {Object.entries(stats.connections.byRole).map(([role, count]) => (
                <div key={role} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={role} size="sm" />
                  </div>
                  <span className="font-medium text-slate-900 dark:text-white">{count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 dark:text-slate-400">No data available</p>
          )}
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Recent Sessions">
          {recentSessions.length > 0 ? (
            <div className="space-y-3">
              {recentSessions.map((session) => (
                <div key={session.id} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white text-sm truncate max-w-[200px]">
                      {session.id.slice(0, 8)}...
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatDate(session.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={session.state} size="sm" />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 dark:text-slate-400">No sessions yet</p>
          )}
        </Card>

        <Card title="Connected Clients">
          {recentClients.length > 0 ? (
            <div className="space-y-3">
              {recentClients.map((client) => (
                <div key={client.id} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white text-sm truncate max-w-[200px]">
                      {client.id.slice(0, 8)}...
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatDate(client.connectedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={client.role} size="sm" />
                    {client.authenticated && (
                      <Activity className="w-4 h-4 text-green-500" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 dark:text-slate-400">No clients connected</p>
          )}
        </Card>
      </div>
    </div>
  );
}
