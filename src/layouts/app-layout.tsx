import { NavLink, Outlet } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  ListTodo,
  Bot,
  MessageSquare,
  Activity,
  Users,
  BookOpen,
  Globe,
  BarChart3,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHealth } from '@/hooks/use-health';
import { useSSESync } from '@/hooks/use-sse-sync';
import { ErrorBoundary } from '@/components/error-boundary';
import { AuthButton } from '@/components/auth-button';
import { bootstrapAuth } from '@/lib/api-client';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Overview' },
  { to: '/tasks', icon: ListTodo, label: 'Tasks' },
  { to: '/engines', icon: Bot, label: 'Engines' },
  { to: '/sessions', icon: MessageSquare, label: 'Sessions' },
  { to: '/economy', icon: Wallet, label: 'Economy' },
  { to: '/events', icon: Activity, label: 'Events' },
  { to: '/peers', icon: Users, label: 'Peers' },
  { to: '/rules', icon: BookOpen, label: 'Rules' },
  { to: '/world-graph', icon: Globe, label: 'World Graph' },
  { to: '/metrics', icon: BarChart3, label: 'Metrics' },
];

export default function AppLayout() {
  const [authReady, setAuthReady] = useState(false);
  const health = useHealth();
  const healthData = health.data;
  const healthError = health.error instanceof Error ? health.error.message : null;
  const prevHealthError = useRef(healthError);

  // Bootstrap auth once on mount; the query client will start driving fetches
  // the moment `authReady` flips on (enables SSE, hooks poll as fallback).
  useEffect(() => {
    bootstrapAuth().then(() => setAuthReady(true));
  }, []);

  const { connected, reconnectNow, reconnecting } = useSSESync({ enabled: authReady });

  // When health recovers from error, force a reconnect so the UI resyncs fast.
  useEffect(() => {
    const wasError = prevHealthError.current;
    prevHealthError.current = healthError;
    if (wasError && !healthError && !connected) {
      reconnectNow();
    }
  }, [healthError, connected, reconnectNow]);

  const uptimeStr = () => {
    if (!healthData) return '--';
    const s = Math.floor(healthData.uptime_ms / 1000);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-52 bg-surface border-r border-border flex flex-col shrink-0">
        <div className="p-4 border-b border-border">
          <h1 className="text-lg font-bold tracking-tight">
            <span className="text-accent">V</span>inyan
          </h1>
          <p className="text-xs text-text-dim mt-0.5">Epistemic Orchestration</p>
        </div>

        <nav className="flex-1 py-2 space-y-0.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-4 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-accent/10 text-accent border-r-2 border-accent'
                    : 'text-text-dim hover:text-text hover:bg-white/5',
                )
              }
            >
              <item.icon size={16} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-border text-xs text-text-dim">v0.1.0</div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-11 bg-surface border-b border-border flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'w-2 h-2 rounded-full',
                  connected
                    ? 'bg-green shadow-[0_0_6px_rgba(63,185,80,0.6)]'
                    : reconnecting
                      ? 'bg-yellow animate-pulse'
                      : 'bg-gray-500',
                )}
              />
              <span className="text-text-dim">
                {!authReady
                  ? 'Connecting...'
                  : connected
                    ? 'Connected'
                    : reconnecting
                      ? 'Reconnecting...'
                      : 'Disconnected'}
              </span>
              {!connected && authReady && !reconnecting && (
                <button
                  type="button"
                  className="px-2 py-0.5 text-xs rounded bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20"
                  onClick={reconnectNow}
                >
                  Retry
                </button>
              )}
            </div>
            {healthData && <span className="text-text-dim">Uptime: {uptimeStr()}</span>}
            {healthError && <span className="text-red">{healthError}</span>}
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <AuthButton />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6 relative">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
