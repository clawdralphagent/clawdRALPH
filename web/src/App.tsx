import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Sessions from './pages/Sessions';
import Loops from './pages/Loops';
import Settings from './pages/Settings';
import { GatewayProvider } from './hooks/useGateway';

export default function App() {
  return (
    <GatewayProvider>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="sessions" element={<Sessions />} />
          <Route path="loops" element={<Loops />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </GatewayProvider>
  );
}
