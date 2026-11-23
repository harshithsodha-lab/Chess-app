import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { SentinelErrorBoundary } from './components/SentinelErrorBoundary.tsx';
import { sentinelAgent } from './lib/autoHealAgent.ts';
import './index.css';

sentinelAgent.installGlobalListeners();

createRoot(document.getElementById('root')!).render(
  <SentinelErrorBoundary>
    <App />
  </SentinelErrorBoundary>
);
