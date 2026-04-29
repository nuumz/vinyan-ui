import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import AppLayout from './layouts/app-layout';
import { ErrorBoundary } from './components/error-boundary';
import { ToastContainer } from './components/toast-container';
import { CommandPalette } from './components/command-palette';

const Overview = lazy(() => import('./pages/overview'));
const Tasks = lazy(() => import('./pages/tasks'));
const Engines = lazy(() => import('./pages/engines'));
const Sessions = lazy(() => import('./pages/sessions'));
const SessionChat = lazy(() => import('./pages/session-chat'));
const Economy = lazy(() => import('./pages/economy'));
const Events = lazy(() => import('./pages/events'));
const Peers = lazy(() => import('./pages/peers'));
const Rules = lazy(() => import('./pages/rules'));
const WorldGraph = lazy(() => import('./pages/world-graph'));
const Metrics = lazy(() => import('./pages/metrics'));
const Approvals = lazy(() => import('./pages/approvals'));
const Agents = lazy(() => import('./pages/agents'));
const Skills = lazy(() => import('./pages/skills'));
const Patterns = lazy(() => import('./pages/patterns'));
const Doctor = lazy(() => import('./pages/doctor'));
const Config = lazy(() => import('./pages/config'));
const MCP = lazy(() => import('./pages/mcp'));
const Oracles = lazy(() => import('./pages/oracles'));
const SleepCycle = lazy(() => import('./pages/sleep-cycle'));
const Shadow = lazy(() => import('./pages/shadow'));
const Trace = lazy(() => import('./pages/trace'));
const Governance = lazy(() => import('./pages/governance'));
const Memory = lazy(() => import('./pages/memory'));
const Calibration = lazy(() => import('./pages/calibration'));
const HMS = lazy(() => import('./pages/hms'));
const Providers = lazy(() => import('./pages/providers'));
const Federation = lazy(() => import('./pages/federation'));
const Market = lazy(() => import('./pages/market'));

function Loading() {
  return <div className="text-text-dim text-sm">Loading...</div>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Overview />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/engines" element={<Engines />} />
            <Route path="/workers" element={<Navigate to="/engines" replace />} />
            <Route path="/sessions" element={<Sessions />} />
            <Route path="/sessions/:id" element={<SessionChat />} />
            <Route path="/economy" element={<Economy />} />
            <Route path="/events" element={<Events />} />
            <Route path="/peers" element={<Peers />} />
            <Route path="/rules" element={<Rules />} />
            <Route path="/world-graph" element={<WorldGraph />} />
            <Route path="/metrics" element={<Metrics />} />
            <Route path="/approvals" element={<Approvals />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/skills" element={<Skills />} />
            <Route path="/patterns" element={<Patterns />} />
            <Route path="/doctor" element={<Doctor />} />
            <Route path="/config" element={<Config />} />
            <Route path="/mcp" element={<MCP />} />
            <Route path="/oracles" element={<Oracles />} />
            <Route path="/sleep-cycle" element={<SleepCycle />} />
            <Route path="/shadow" element={<Shadow />} />
            <Route path="/trace" element={<Trace />} />
            <Route path="/governance" element={<Governance />} />
            <Route path="/memory" element={<Memory />} />
            <Route path="/calibration" element={<Calibration />} />
            <Route path="/hms" element={<HMS />} />
            <Route path="/providers" element={<Providers />} />
            <Route path="/federation" element={<Federation />} />
            <Route path="/market" element={<Market />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
      <ToastContainer />
      <CommandPalette />
    </ErrorBoundary>
  );
}
