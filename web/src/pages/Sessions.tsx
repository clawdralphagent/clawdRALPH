import { useState } from 'react';
import { Trash2, RefreshCw, Eye } from 'lucide-react';
import { useGateway } from '../hooks/useGateway';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString();
}

export default function Sessions() {
  const { sessions, refresh } = useGateway();
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  const filteredSessions = sessions.filter(session => {
    if (filter === 'all') return true;
    return session.state === filter;
  });

  const sessionDetail = selectedSession
    ? sessions.find(s => s.id === selectedSession)
    : null;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Sessions</h1>
          <p className="text-slate-600 dark:text-slate-400">Manage active and past sessions</p>
        </div>
        <button
          onClick={() => refresh()}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Filter */}
      <div className="mb-6">
        <div className="flex gap-2">
          {['all', 'active', 'paused', 'completed', 'failed'].map((state) => (
            <button
              key={state}
              onClick={() => setFilter(state)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === state
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {state.charAt(0).toUpperCase() + state.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sessions List */}
        <div className="lg:col-span-2">
          <Card title={`Sessions (${filteredSessions.length})`}>
            {filteredSessions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-sm text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                      <th className="pb-3 font-medium">Session ID</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">Created</th>
                      <th className="pb-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSessions.map((session) => (
                      <tr
                        key={session.id}
                        className={`border-b border-slate-100 dark:border-slate-700 last:border-0 ${
                          selectedSession === session.id ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                        }`}
                      >
                        <td className="py-3">
                          <code className="text-sm bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
                            {session.id.slice(0, 8)}...
                          </code>
                        </td>
                        <td className="py-3">
                          <StatusBadge status={session.state} size="sm" />
                        </td>
                        <td className="py-3 text-sm text-slate-600 dark:text-slate-400">
                          {formatDate(session.createdAt)}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setSelectedSession(session.id)}
                              className="p-1.5 text-slate-500 hover:text-primary-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                              title="View details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                              title="Delete session"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-slate-500 dark:text-slate-400 text-center py-8">
                No sessions found
              </p>
            )}
          </Card>
        </div>

        {/* Session Detail */}
        <div>
          <Card title="Session Details">
            {sessionDetail ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Session ID
                  </label>
                  <p className="font-mono text-sm text-slate-900 dark:text-white break-all">
                    {sessionDetail.id}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Client ID
                  </label>
                  <p className="font-mono text-sm text-slate-900 dark:text-white break-all">
                    {sessionDetail.clientId}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Status
                  </label>
                  <div className="mt-1">
                    <StatusBadge status={sessionDetail.state} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Created
                  </label>
                  <p className="text-sm text-slate-900 dark:text-white">
                    {formatDate(sessionDetail.createdAt)}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Updated
                  </label>
                  <p className="text-sm text-slate-900 dark:text-white">
                    {formatDate(sessionDetail.updatedAt)}
                  </p>
                </div>
                {sessionDetail.metadata && Object.keys(sessionDetail.metadata).length > 0 && (
                  <div>
                    <label className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Metadata
                    </label>
                    <pre className="mt-1 text-xs bg-slate-100 dark:bg-slate-700 p-2 rounded overflow-x-auto">
                      {JSON.stringify(sessionDetail.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-slate-500 dark:text-slate-400 text-center">
                Select a session to view details
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
