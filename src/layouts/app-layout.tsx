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
  ShieldCheck,
  Sparkles,
  Lightbulb,
  ChevronDown,
  Stethoscope,
  Settings,
  Plug,
  Moon,
  ShieldAlert,
  FileText,
  FlaskConical,
  BrainCircuit,
  Target,
  BookOpenCheck,
  Landmark,
  Gavel,
  BadgeCheck,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHealth } from '@/hooks/use-health';
import { useSSESync } from '@/hooks/use-sse-sync';
import { ErrorBoundary } from '@/components/error-boundary';
import { AuthButton } from '@/components/auth-button';
import { SystemStatusBanner } from '@/components/system-status-banner';
import { bootstrapAuth } from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';

interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
  defaultOpen?: boolean;
}

const navGroups: NavGroup[] = [
  {
    id: 'runtime',
    label: 'Runtime',
    defaultOpen: true,
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Overview' },
      { to: '/tasks', icon: ListTodo, label: 'Tasks' },
      { to: '/approvals', icon: ShieldCheck, label: 'Approvals' },
      { to: '/sessions', icon: MessageSquare, label: 'Sessions' },
      { to: '/events', icon: Activity, label: 'Events' },
      { to: '/trace', icon: FileText, label: 'Trace' },
    ],
  },
  {
    id: 'fleet',
    label: 'Fleet',
    defaultOpen: true,
    items: [
      { to: '/engines', icon: Bot, label: 'Engines' },
      { to: '/agents', icon: Users, label: 'Agents' },
      { to: '/peers', icon: Users, label: 'Peers' },
      { to: '/mcp', icon: Plug, label: 'MCP' },
    ],
  },
  {
    id: 'knowledge',
    label: 'Knowledge',
    defaultOpen: false,
    items: [
      { to: '/skills', icon: Sparkles, label: 'Skills' },
      { to: '/patterns', icon: Lightbulb, label: 'Patterns' },
      { to: '/world-graph', icon: Globe, label: 'World Graph' },
      { to: '/memory', icon: BookOpenCheck, label: 'Memory' },
    ],
  },
  {
    id: 'evolution',
    label: 'Evolution',
    defaultOpen: false,
    items: [
      { to: '/rules', icon: BookOpen, label: 'Rules' },
      { to: '/oracles', icon: ShieldAlert, label: 'Oracles' },
      { to: '/sleep-cycle', icon: Moon, label: 'Sleep Cycle' },
      { to: '/shadow', icon: FlaskConical, label: 'Shadow' },
      { to: '/calibration', icon: Target, label: 'Calibration' },
      { to: '/hms', icon: BrainCircuit, label: 'HMS' },
    ],
  },
  {
    id: 'economy',
    label: 'Economy',
    defaultOpen: false,
    items: [
      { to: '/economy', icon: Wallet, label: 'Economy' },
      { to: '/providers', icon: BadgeCheck, label: 'Provider Trust' },
      { to: '/federation', icon: Landmark, label: 'Federation' },
      { to: '/market', icon: Gavel, label: 'Market' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    defaultOpen: false,
    items: [
      { to: '/metrics', icon: BarChart3, label: 'Metrics' },
      { to: '/doctor', icon: Stethoscope, label: 'Doctor' },
      { to: '/config', icon: Settings, label: 'Config' },
    ],
  },
];

export default function AppLayout() {
  const [authReady, setAuthReady] = useState(false);
  const health = useHealth();
  const healthData = health.data;
  const healthError = health.error instanceof Error ? health.error.message : null;
  const prevHealthError = useRef(healthError);
  const queryClient = useQueryClient();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    () => Object.fromEntries(navGroups.map((g) => [g.id, g.defaultOpen ?? false])),
  );

  useEffect(() => {
    bootstrapAuth().then(() => setAuthReady(true));
  }, []);

  const { connected, reconnectNow, reconnecting } = useSSESync({ enabled: authReady });

  useEffect(() => {
    const wasError = prevHealthError.current;
    prevHealthError.current = healthError;
    if (wasError && !healthError && !connected) {
      reconnectNow();
    }
  }, [healthError, connected, reconnectNow]);

  useEffect(() => {
    const onOnline = () => {
      reconnectNow();
      queryClient.invalidateQueries();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [reconnectNow, queryClient]);

  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));

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

        <nav className="flex-1 py-2 overflow-y-auto">
          {navGroups.map((group) => {
            const open = openGroups[group.id];
            return (
              <div key={group.id} className="mb-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center justify-between px-4 py-1.5 text-xs uppercase tracking-wider text-text-dim/70 hover:text-text transition-colors"
                >
                  <span>{group.label}</span>
                  <ChevronDown
                    size={12}
                    className={cn('transition-transform', open ? 'rotate-0' : '-rotate-90')}
                  />
                </button>
                {open &&
                  group.items.map((item) => (
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
              </div>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border text-xs text-text-dim flex items-center justify-between">
          <span>v0.1.0</span>
          <span className="text-text-dim/70">
            <kbd className="bg-bg px-1 py-0.5 rounded border border-border text-[10px]">⌘K</kbd>
          </span>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <SystemStatusBanner />
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

        <main className="flex-1 overflow-auto p-6 relative">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
