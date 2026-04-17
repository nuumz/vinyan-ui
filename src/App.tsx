import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import AppLayout from './layouts/app-layout';
import { ErrorBoundary } from './components/error-boundary';
import { ToastContainer } from './components/toast-container';

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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
      <ToastContainer />
    </ErrorBoundary>
  );
}
