import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import AppLayout from './layouts/app-layout';

const Overview = lazy(() => import('./pages/overview'));
const Tasks = lazy(() => import('./pages/tasks'));
const Workers = lazy(() => import('./pages/workers'));
const Sessions = lazy(() => import('./pages/sessions'));
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
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Overview />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/workers" element={<Workers />} />
          <Route path="/sessions" element={<Sessions />} />
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
  );
}
