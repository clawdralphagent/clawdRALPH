/**
 * Gateway types for the web dashboard
 */

export type ConnectionState = 'connecting' | 'connected' | 'authenticated' | 'disconnected' | 'error';

export type ClientRole = 'admin' | 'user' | 'channel' | 'node' | 'viewer';

export type SessionState = 'active' | 'paused' | 'completed' | 'failed';

export interface GatewayStats {
  uptime: number;
  connections: {
    total: number;
    authenticated: number;
    byRole: Record<ClientRole, number>;
  };
  sessions: {
    active: number;
    total: number;
  };
  messages: {
    received: number;
    sent: number;
    errors: number;
  };
}

export interface SessionInfo {
  id: string;
  clientId: string;
  state: SessionState;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface ClientInfo {
  id: string;
  role: ClientRole;
  authenticated: boolean;
  connectedAt: string;
  lastActivity?: string;
}

export interface LoopState {
  id: string;
  prdId: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'stopped';
  currentIteration: number;
  maxIterations: number;
  currentStoryId?: string;
  totalStoriesCompleted: number;
  totalStoriesFailed: number;
  startedAt?: string;
  completedAt?: string;
}

export interface UserStory {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';
  priority: number;
  acceptanceCriteria: string[];
  dependencies: string[];
}

export interface PRD {
  id: string;
  title: string;
  description: string;
  stories: UserStory[];
  metadata: {
    createdAt: string;
    workspace: string;
  };
}

export interface GatewayMessage {
  id: string;
  type: string;
  timestamp: string;
  payload?: unknown;
}

export interface HealthStatus {
  status: 'ok' | 'error';
  version: string;
}
