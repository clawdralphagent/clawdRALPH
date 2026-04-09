import { useState } from 'react';
import { Save, RotateCcw, Eye, EyeOff } from 'lucide-react';
import Card from '../components/Card';

interface ConfigSection {
  title: string;
  fields: ConfigField[];
}

interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'password' | 'select';
  description?: string;
  options?: { value: string; label: string }[];
}

const configSections: ConfigSection[] = [
  {
    title: 'Gateway',
    fields: [
      { key: 'gateway.port', label: 'Port', type: 'number', description: 'Gateway server port' },
      { key: 'gateway.bind', label: 'Bind Address', type: 'text', description: 'IP address to bind to' },
      { key: 'gateway.enableAuth', label: 'Enable Auth', type: 'boolean', description: 'Require authentication' },
    ],
  },
  {
    title: 'AI Models',
    fields: [
      {
        key: 'models.primary',
        label: 'Primary Model',
        type: 'select',
        options: [
          { value: 'anthropic/claude-opus-4-5', label: 'Claude Opus 4.5' },
          { value: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' },
          { value: 'openai/gpt-4-turbo', label: 'GPT-4 Turbo' },
          { value: 'ollama/llama3.2', label: 'Llama 3.2 (Local)' },
        ],
      },
      {
        key: 'models.reasoning',
        label: 'Reasoning Level',
        type: 'select',
        options: [
          { value: 'off', label: 'Off' },
          { value: 'minimal', label: 'Minimal' },
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
        ],
      },
    ],
  },
  {
    title: 'Ralph Loop',
    fields: [
      { key: 'ralph.maxIterations', label: 'Max Iterations', type: 'number', description: 'Maximum loop iterations' },
      { key: 'ralph.autoCommit', label: 'Auto Commit', type: 'boolean', description: 'Automatically commit changes' },
      { key: 'ralph.autoPush', label: 'Auto Push', type: 'boolean', description: 'Automatically push commits' },
      { key: 'ralph.pauseOnFailure', label: 'Pause on Failure', type: 'boolean', description: 'Pause loop when a story fails' },
    ],
  },
  {
    title: 'Quality Gates',
    fields: [
      { key: 'qualityGates.tests', label: 'Run Tests', type: 'boolean', description: 'Run test suite before commit' },
      { key: 'qualityGates.typecheck', label: 'Type Check', type: 'boolean', description: 'Run TypeScript type checking' },
      { key: 'qualityGates.lint', label: 'Lint', type: 'boolean', description: 'Run linter before commit' },
    ],
  },
  {
    title: 'API Keys',
    fields: [
      { key: 'anthropic.apiKey', label: 'Anthropic API Key', type: 'password' },
      { key: 'openai.apiKey', label: 'OpenAI API Key', type: 'password' },
    ],
  },
];

const defaultConfig: Record<string, unknown> = {
  'gateway.port': 18789,
  'gateway.bind': '127.0.0.1',
  'gateway.enableAuth': true,
  'models.primary': 'anthropic/claude-opus-4-5',
  'models.reasoning': 'high',
  'ralph.maxIterations': 10,
  'ralph.autoCommit': true,
  'ralph.autoPush': false,
  'ralph.pauseOnFailure': true,
  'qualityGates.tests': true,
  'qualityGates.typecheck': true,
  'qualityGates.lint': false,
  'anthropic.apiKey': '',
  'openai.apiKey': '',
};

export default function Settings() {
  const [config, setConfig] = useState<Record<string, unknown>>(defaultConfig);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [hasChanges, setHasChanges] = useState(false);

  const handleChange = (key: string, value: unknown) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    // TODO: Save to backend
    console.log('Saving config:', config);
    setHasChanges(false);
  };

  const handleReset = () => {
    setConfig(defaultConfig);
    setHasChanges(false);
  };

  const togglePassword = (key: string) => {
    setShowPasswords(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const renderField = (field: ConfigField) => {
    const value = config[field.key];

    switch (field.type) {
      case 'boolean':
        return (
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={value as boolean}
              onChange={(e) => handleChange(field.key, e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-primary-600"></div>
          </label>
        );

      case 'select':
        return (
          <select
            value={value as string}
            onChange={(e) => handleChange(field.key, e.target.value)}
            className="block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 text-slate-900 dark:text-white"
          >
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );

      case 'password':
        return (
          <div className="relative">
            <input
              type={showPasswords[field.key] ? 'text' : 'password'}
              value={(value as string) || ''}
              onChange={(e) => handleChange(field.key, e.target.value)}
              className="block w-full px-3 py-2 pr-10 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 text-slate-900 dark:text-white"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => togglePassword(field.key)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
            >
              {showPasswords[field.key] ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        );

      case 'number':
        return (
          <input
            type="number"
            value={value as number}
            onChange={(e) => handleChange(field.key, parseInt(e.target.value, 10))}
            className="block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 text-slate-900 dark:text-white"
          />
        );

      default:
        return (
          <input
            type="text"
            value={(value as string) || ''}
            onChange={(e) => handleChange(field.key, e.target.value)}
            className="block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 text-slate-900 dark:text-white"
          />
        );
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>
          <p className="text-slate-600 dark:text-slate-400">Configure clawdRALPH behavior</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            Save Changes
          </button>
        </div>
      </div>

      {/* Config Sections */}
      <div className="space-y-6">
        {configSections.map((section) => (
          <Card key={section.title} title={section.title}>
            <div className="space-y-4">
              {section.fields.map((field) => (
                <div key={field.key} className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-900 dark:text-white">
                      {field.label}
                    </label>
                    {field.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {field.description}
                      </p>
                    )}
                  </div>
                  <div className="w-64">{renderField(field)}</div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {hasChanges && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-4">
          <span>You have unsaved changes</span>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 bg-primary-600 rounded-md hover:bg-primary-700 transition-colors"
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}
