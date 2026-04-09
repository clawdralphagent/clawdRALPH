import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Monitor,
  RefreshCcw,
  Settings,
  Wifi,
  WifiOff,
  Layers
} from 'lucide-react';
import { useGateway } from '../hooks/useGateway';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/sessions', label: 'Sessions', icon: Monitor },
  { path: '/loops', label: 'Loops', icon: RefreshCcw },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout() {
  const location = useLocation();
  const { connectionState, health, error } = useGateway();

  const isConnected = connectionState === 'connected' || connectionState === 'authenticated';

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Layers className="w-8 h-8 text-primary-400" />
            <div>
              <h1 className="text-lg font-bold">clawdRALPH</h1>
              <p className="text-xs text-slate-400">Dashboard</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-primary-600 text-white'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Connection status */}
        <div className="p-4 border-t border-slate-700">
          <div className="flex items-center gap-2 text-sm">
            {isConnected ? (
              <>
                <Wifi className="w-4 h-4 text-green-400" />
                <span className="text-green-400">Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-red-400" />
                <span className="text-red-400">Disconnected</span>
              </>
            )}
          </div>
          {health && (
            <div className="text-xs text-slate-500 mt-1">
              Gateway v{health.version}
            </div>
          )}
          {error && (
            <div className="text-xs text-red-400 mt-1">{error}</div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 bg-slate-100 dark:bg-slate-900">
        <Outlet />
      </main>
    </div>
  );
}
