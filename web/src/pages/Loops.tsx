import { useState } from 'react';
import { Play, Pause, Square, RefreshCw, FileText, CheckCircle2, XCircle, Clock } from 'lucide-react';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import ProgressRing from '../components/ProgressRing';
import type { LoopState, UserStory } from '../types';

// Mock data for demonstration - will be replaced with real data from gateway
const mockLoop: LoopState = {
  id: 'loop-001',
  prdId: 'feature-auth',
  status: 'running',
  currentIteration: 3,
  maxIterations: 10,
  currentStoryId: 'story-3',
  totalStoriesCompleted: 2,
  totalStoriesFailed: 0,
  startedAt: '2026-01-30T10:00:00Z',
};

const mockStories: UserStory[] = [
  {
    id: 'story-1',
    title: 'Create User model',
    description: 'Define the User model with required fields',
    status: 'completed',
    priority: 1,
    acceptanceCriteria: ['User model has email field', 'User model has password field'],
    dependencies: [],
  },
  {
    id: 'story-2',
    title: 'Implement registration endpoint',
    description: 'Create POST /auth/register endpoint',
    status: 'completed',
    priority: 2,
    acceptanceCriteria: ['Endpoint accepts email and password', 'Returns JWT token on success'],
    dependencies: ['story-1'],
  },
  {
    id: 'story-3',
    title: 'Implement login endpoint',
    description: 'Create POST /auth/login endpoint',
    status: 'in_progress',
    priority: 3,
    acceptanceCriteria: ['Endpoint validates credentials', 'Returns JWT token on success'],
    dependencies: ['story-1'],
  },
  {
    id: 'story-4',
    title: 'Add password hashing',
    description: 'Hash passwords before storing',
    status: 'pending',
    priority: 4,
    acceptanceCriteria: ['Passwords are hashed with bcrypt', 'Hash comparison works correctly'],
    dependencies: ['story-1'],
  },
  {
    id: 'story-5',
    title: 'Implement JWT validation middleware',
    description: 'Create middleware for protected routes',
    status: 'pending',
    priority: 5,
    acceptanceCriteria: ['Middleware validates JWT tokens', 'Adds user to request context'],
    dependencies: ['story-2', 'story-3'],
  },
];

function getStoryIcon(status: string) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-5 h-5 text-green-500" />;
    case 'failed':
      return <XCircle className="w-5 h-5 text-red-500" />;
    case 'in_progress':
      return <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />;
    default:
      return <Clock className="w-5 h-5 text-slate-400" />;
  }
}

export default function Loops() {
  const [loop] = useState<LoopState | null>(mockLoop);
  const [stories] = useState<UserStory[]>(mockStories);
  const [selectedStory, setSelectedStory] = useState<string | null>(null);

  const completedCount = stories.filter(s => s.status === 'completed').length;
  const progress = (completedCount / stories.length) * 100;
  const storyDetail = selectedStory ? stories.find(s => s.id === selectedStory) : null;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Development Loops</h1>
          <p className="text-slate-600 dark:text-slate-400">Monitor autonomous development progress</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
            <Play className="w-4 h-4" />
            Start
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors">
            <Pause className="w-4 h-4" />
            Pause
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
            <Square className="w-4 h-4" />
            Stop
          </button>
        </div>
      </div>

      {loop ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Loop Status */}
          <div className="lg:col-span-2 space-y-6">
            {/* Progress Overview */}
            <Card title="Loop Progress">
              <div className="flex items-center gap-8">
                <ProgressRing progress={progress} size={140} strokeWidth={12} />
                <div className="flex-1 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Status</span>
                    <StatusBadge status={loop.status} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Iteration</span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      {loop.currentIteration} / {loop.maxIterations}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Stories Completed</span>
                    <span className="font-medium text-green-600">{loop.totalStoriesCompleted}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Stories Failed</span>
                    <span className="font-medium text-red-600">{loop.totalStoriesFailed}</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Stories List */}
            <Card title="User Stories">
              <div className="space-y-3">
                {stories.map((story) => (
                  <div
                    key={story.id}
                    onClick={() => setSelectedStory(story.id)}
                    className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedStory === story.id
                        ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 border border-transparent'
                    }`}
                  >
                    <div className="mt-0.5">{getStoryIcon(story.status)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-medium text-slate-900 dark:text-white truncate">
                          {story.title}
                        </h4>
                        <StatusBadge status={story.status} size="sm" />
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 truncate mt-1">
                        {story.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Story Detail / PRD Info */}
          <div className="space-y-6">
            <Card title="PRD Info">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-slate-400" />
                  <span className="font-medium text-slate-900 dark:text-white">
                    {loop.prdId}
                  </span>
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  <p>{stories.length} stories total</p>
                  <p>{completedCount} completed</p>
                  <p>{stories.filter(s => s.status === 'pending').length} pending</p>
                </div>
              </div>
            </Card>

            <Card title="Story Details">
              {storyDetail ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Title
                    </label>
                    <p className="font-medium text-slate-900 dark:text-white">
                      {storyDetail.title}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Description
                    </label>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {storyDetail.description}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Status
                    </label>
                    <div className="mt-1">
                      <StatusBadge status={storyDetail.status} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Acceptance Criteria
                    </label>
                    <ul className="mt-1 space-y-1">
                      {storyDetail.acceptanceCriteria.map((criterion, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                          <span className="text-primary-500">•</span>
                          {criterion}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {storyDetail.dependencies.length > 0 && (
                    <div>
                      <label className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Dependencies
                      </label>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {storyDetail.dependencies.map((dep) => (
                          <code
                            key={dep}
                            className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded"
                          >
                            {dep}
                          </code>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-slate-500 dark:text-slate-400 text-center">
                  Select a story to view details
                </p>
              )}
            </Card>
          </div>
        </div>
      ) : (
        <Card>
          <div className="text-center py-12">
            <RefreshCw className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
              No Active Loop
            </h3>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              Start a new development loop to begin autonomous coding
            </p>
            <button className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
              Create New Loop
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
