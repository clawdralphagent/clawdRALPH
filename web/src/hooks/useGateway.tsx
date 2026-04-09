/**
 * Gateway connection hook with WebSocket support
 */

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import type { GatewayStats, SessionInfo, ClientInfo, ConnectionState, GatewayMessage, HealthStatus } from '../types';

interface GatewayContextValue {
  connectionState: ConnectionState;
  stats: GatewayStats | null;
  sessions: SessionInfo[];
  clients: ClientInfo[];
  health: HealthStatus | null;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
  refresh: () => Promise<void>;
  sendMessage: (message: Omit<GatewayMessage, 'id' | 'timestamp'>) => void;
}

const GatewayContext = createContext<GatewayContextValue | null>(null);

const API_BASE = '/api';
const WS_URL = `ws://${window.location.hostname}:18789`;

function generateId(): string {
  return crypto.randomUUID();
}

export function GatewayProvider({ children }: { children: ReactNode }) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [stats, setStats] = useState<GatewayStats | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch data from REST endpoints
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/stats`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, []);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/sessions`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    }
  }, []);

  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/clients`);
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients || []);
      }
    } catch (err) {
      console.error('Failed to fetch clients:', err);
    }
  }, []);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
        setError(null);
      } else {
        setHealth({ status: 'error', version: 'unknown' });
        setError('Gateway not responding');
      }
    } catch (err) {
      setHealth({ status: 'error', version: 'unknown' });
      setError('Failed to connect to gateway');
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([
      fetchHealth(),
      fetchStats(),
      fetchSessions(),
      fetchClients(),
    ]);
  }, [fetchHealth, fetchStats, fetchSessions, fetchClients]);

  // WebSocket connection
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setConnectionState('connecting');

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionState('connected');
        setError(null);
        // Request auth
        sendMessage({ type: 'auth.request', payload: { token: '', role: 'viewer' } });
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as GatewayMessage;
          handleMessage(message);
        } catch (err) {
          console.error('Failed to parse message:', err);
        }
      };

      ws.onerror = () => {
        setError('WebSocket error');
        setConnectionState('error');
      };

      ws.onclose = () => {
        setConnectionState('disconnected');
        wsRef.current = null;
        // Try to reconnect after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 5000);
      };
    } catch (err) {
      setConnectionState('error');
      setError('Failed to connect');
    }
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionState('disconnected');
  }, []);

  const sendMessage = useCallback((message: Omit<GatewayMessage, 'id' | 'timestamp'>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const fullMessage: GatewayMessage = {
        ...message,
        id: generateId(),
        timestamp: new Date().toISOString(),
      };
      wsRef.current.send(JSON.stringify(fullMessage));
    }
  }, []);

  const handleMessage = useCallback((message: GatewayMessage) => {
    switch (message.type) {
      case 'welcome':
        // Connected successfully
        break;
      case 'auth.response':
        const payload = message.payload as { success: boolean };
        if (payload.success) {
          setConnectionState('authenticated');
        }
        break;
      case 'event':
        // Handle events - refresh data
        refresh();
        break;
      case 'pong':
        // Heartbeat response
        break;
      default:
        console.log('Received message:', message.type);
    }
  }, [refresh]);

  // Initial connection and data fetch
  useEffect(() => {
    refresh();
    connect();

    // Refresh data periodically
    const interval = setInterval(refresh, 5000);

    return () => {
      clearInterval(interval);
      disconnect();
    };
  }, []);

  const value: GatewayContextValue = {
    connectionState,
    stats,
    sessions,
    clients,
    health,
    error,
    connect,
    disconnect,
    refresh,
    sendMessage,
  };

  return (
    <GatewayContext.Provider value={value}>
      {children}
    </GatewayContext.Provider>
  );
}

export function useGateway() {
  const context = useContext(GatewayContext);
  if (!context) {
    throw new Error('useGateway must be used within a GatewayProvider');
  }
  return context;
}
