/**
 * GitHub Skill
 * Provides GitHub API operations
 */

import { createLogger } from '../../logging/logger.js';
import {
  BaseSkill,
  createSkillManifest,
  type SkillConfig,
  type SkillContext,
  type SkillResult,
} from '../types.js';

const log = createLogger('skill-github');

/**
 * GitHub Skill Implementation
 */
export class GitHubSkill extends BaseSkill {
  private token: string;
  private baseUrl: string;

  constructor(config?: SkillConfig) {
    super(
      createSkillManifest({
        id: 'github',
        name: 'GitHub',
        description: 'Interact with GitHub repositories, issues, and pull requests',
        category: 'integration',
        permissions: ['network'],
        tags: ['integration', 'github', 'git', 'api'],
      }),
      config
    );

    this.token = (config?.custom?.token as string) ?? process.env.GITHUB_TOKEN ?? '';
    this.baseUrl = (config?.custom?.baseUrl as string) ?? 'https://api.github.com';

    this.registerTools();
  }

  private registerTools(): void {
    // List repositories
    this.registerTool(
      {
        name: 'github_list_repos',
        description: 'List repositories for a user or organization',
        parameters: {
          type: 'object',
          properties: {
            owner: {
              type: 'string',
              description: 'Username or organization (default: authenticated user)',
            },
            type: {
              type: 'string',
              description: 'Repository type',
              enum: ['all', 'owner', 'member'],
            },
            sort: {
              type: 'string',
              description: 'Sort field',
              enum: ['created', 'updated', 'pushed', 'full_name'],
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results',
            },
          },
        },
      },
      this.listRepos.bind(this)
    );

    // Get repository
    this.registerTool(
      {
        name: 'github_get_repo',
        description: 'Get repository details',
        parameters: {
          type: 'object',
          properties: {
            owner: {
              type: 'string',
              description: 'Repository owner',
            },
            repo: {
              type: 'string',
              description: 'Repository name',
            },
          },
          required: ['owner', 'repo'],
        },
      },
      this.getRepo.bind(this)
    );

    // List issues
    this.registerTool(
      {
        name: 'github_list_issues',
        description: 'List issues for a repository',
        parameters: {
          type: 'object',
          properties: {
            owner: {
              type: 'string',
              description: 'Repository owner',
            },
            repo: {
              type: 'string',
              description: 'Repository name',
            },
            state: {
              type: 'string',
              description: 'Issue state',
              enum: ['open', 'closed', 'all'],
            },
            labels: {
              type: 'string',
              description: 'Comma-separated list of labels',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results',
            },
          },
          required: ['owner', 'repo'],
        },
      },
      this.listIssues.bind(this)
    );

    // Get issue
    this.registerTool(
      {
        name: 'github_get_issue',
        description: 'Get issue details',
        parameters: {
          type: 'object',
          properties: {
            owner: {
              type: 'string',
              description: 'Repository owner',
            },
            repo: {
              type: 'string',
              description: 'Repository name',
            },
            number: {
              type: 'number',
              description: 'Issue number',
            },
          },
          required: ['owner', 'repo', 'number'],
        },
      },
      this.getIssue.bind(this)
    );

    // Create issue
    this.registerTool(
      {
        name: 'github_create_issue',
        description: 'Create a new issue',
        parameters: {
          type: 'object',
          properties: {
            owner: {
              type: 'string',
              description: 'Repository owner',
            },
            repo: {
              type: 'string',
              description: 'Repository name',
            },
            title: {
              type: 'string',
              description: 'Issue title',
            },
            body: {
              type: 'string',
              description: 'Issue body',
            },
            labels: {
              type: 'array',
              description: 'Labels to add',
              items: { type: 'string' },
            },
            assignees: {
              type: 'array',
              description: 'Users to assign',
              items: { type: 'string' },
            },
          },
          required: ['owner', 'repo', 'title'],
        },
      },
      this.createIssue.bind(this)
    );

    // List pull requests
    this.registerTool(
      {
        name: 'github_list_prs',
        description: 'List pull requests for a repository',
        parameters: {
          type: 'object',
          properties: {
            owner: {
              type: 'string',
              description: 'Repository owner',
            },
            repo: {
              type: 'string',
              description: 'Repository name',
            },
            state: {
              type: 'string',
              description: 'PR state',
              enum: ['open', 'closed', 'all'],
            },
            base: {
              type: 'string',
              description: 'Base branch to filter by',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results',
            },
          },
          required: ['owner', 'repo'],
        },
      },
      this.listPRs.bind(this)
    );

    // Get pull request
    this.registerTool(
      {
        name: 'github_get_pr',
        description: 'Get pull request details',
        parameters: {
          type: 'object',
          properties: {
            owner: {
              type: 'string',
              description: 'Repository owner',
            },
            repo: {
              type: 'string',
              description: 'Repository name',
            },
            number: {
              type: 'number',
              description: 'PR number',
            },
          },
          required: ['owner', 'repo', 'number'],
        },
      },
      this.getPR.bind(this)
    );

    // Create pull request
    this.registerTool(
      {
        name: 'github_create_pr',
        description: 'Create a new pull request',
        parameters: {
          type: 'object',
          properties: {
            owner: {
              type: 'string',
              description: 'Repository owner',
            },
            repo: {
              type: 'string',
              description: 'Repository name',
            },
            title: {
              type: 'string',
              description: 'PR title',
            },
            body: {
              type: 'string',
              description: 'PR body',
            },
            head: {
              type: 'string',
              description: 'Head branch',
            },
            base: {
              type: 'string',
              description: 'Base branch',
            },
            draft: {
              type: 'boolean',
              description: 'Create as draft',
            },
          },
          required: ['owner', 'repo', 'title', 'head', 'base'],
        },
      },
      this.createPR.bind(this)
    );

    // Get file contents
    this.registerTool(
      {
        name: 'github_get_file',
        description: 'Get file contents from a repository',
        parameters: {
          type: 'object',
          properties: {
            owner: {
              type: 'string',
              description: 'Repository owner',
            },
            repo: {
              type: 'string',
              description: 'Repository name',
            },
            path: {
              type: 'string',
              description: 'File path',
            },
            ref: {
              type: 'string',
              description: 'Branch or commit ref',
            },
          },
          required: ['owner', 'repo', 'path'],
        },
      },
      this.getFile.bind(this)
    );

    // Search code
    this.registerTool(
      {
        name: 'github_search_code',
        description: 'Search for code across GitHub',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            repo: {
              type: 'string',
              description: 'Limit to repository (owner/repo)',
            },
            language: {
              type: 'string',
              description: 'Filter by language',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results',
            },
          },
          required: ['query'],
        },
      },
      this.searchCode.bind(this)
    );

    // List commits
    this.registerTool(
      {
        name: 'github_list_commits',
        description: 'List commits in a repository',
        parameters: {
          type: 'object',
          properties: {
            owner: {
              type: 'string',
              description: 'Repository owner',
            },
            repo: {
              type: 'string',
              description: 'Repository name',
            },
            sha: {
              type: 'string',
              description: 'Branch or commit SHA',
            },
            path: {
              type: 'string',
              description: 'Filter by file path',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results',
            },
          },
          required: ['owner', 'repo'],
        },
      },
      this.listCommits.bind(this)
    );
  }

  private async apiRequest(
    endpoint: string,
    options: {
      method?: string;
      body?: unknown;
      params?: Record<string, string>;
    } = {},
    context: SkillContext
  ): Promise<{ ok: boolean; status: number; data: unknown }> {
    const url = new URL(`${this.baseUrl}${endpoint}`);

    if (options.params) {
      for (const [key, value] of Object.entries(options.params)) {
        url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'clawdRALPH',
    };

    if (this.token) {
      headers.Authorization = `token ${this.token}`;
    }

    const fetchOptions: RequestInit = {
      method: options.method ?? 'GET',
      headers,
      signal: context.signal ?? AbortSignal.timeout(context.timeout),
    };

    if (options.body) {
      fetchOptions.body = JSON.stringify(options.body);
      headers['Content-Type'] = 'application/json';
    }

    log.debug('GitHub API request', { endpoint, method: options.method ?? 'GET' });

    const response = await fetch(url.toString(), fetchOptions);
    const data = await response.json();

    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  }

  private async listRepos(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const owner = args.owner as string | undefined;
    const type = args.type as string ?? 'all';
    const sort = args.sort as string ?? 'updated';
    const limit = args.limit as number ?? 30;

    try {
      const endpoint = owner ? `/users/${owner}/repos` : '/user/repos';
      const result = await this.apiRequest(
        endpoint,
        { params: { type, sort, per_page: String(limit) } },
        context
      );

      if (!result.ok) {
        return {
          success: false,
          output: `GitHub API error: ${result.status}`,
          error: JSON.stringify(result.data),
          duration: 0,
        };
      }

      const repos = result.data as Array<{ full_name: string; description: string; html_url: string }>;
      const output = repos
        .map((r) => `${r.full_name}: ${r.description ?? 'No description'}`)
        .join('\n');

      return {
        success: true,
        output: output || 'No repositories found',
        data: repos,
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Failed to list repos: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }

  private async getRepo(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const owner = args.owner as string;
    const repo = args.repo as string;

    try {
      const result = await this.apiRequest(`/repos/${owner}/${repo}`, {}, context);

      if (!result.ok) {
        return {
          success: false,
          output: `Repository not found: ${owner}/${repo}`,
          error: JSON.stringify(result.data),
          duration: 0,
        };
      }

      const data = result.data as Record<string, unknown>;
      const output = [
        `Repository: ${data.full_name}`,
        `Description: ${data.description ?? 'None'}`,
        `Stars: ${data.stargazers_count}`,
        `Forks: ${data.forks_count}`,
        `Language: ${data.language ?? 'Unknown'}`,
        `URL: ${data.html_url}`,
      ].join('\n');

      return {
        success: true,
        output,
        data,
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Failed to get repo: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }

  private async listIssues(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const owner = args.owner as string;
    const repo = args.repo as string;
    const state = args.state as string ?? 'open';
    const labels = args.labels as string | undefined;
    const limit = args.limit as number ?? 30;

    try {
      const params: Record<string, string> = {
        state,
        per_page: String(limit),
      };
      if (labels) params.labels = labels;

      const result = await this.apiRequest(
        `/repos/${owner}/${repo}/issues`,
        { params },
        context
      );

      if (!result.ok) {
        return {
          success: false,
          output: `Failed to list issues: ${result.status}`,
          error: JSON.stringify(result.data),
          duration: 0,
        };
      }

      const issues = result.data as Array<{ number: number; title: string; state: string }>;
      const output = issues
        .map((i) => `#${i.number} [${i.state}] ${i.title}`)
        .join('\n');

      return {
        success: true,
        output: output || 'No issues found',
        data: issues,
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Failed to list issues: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }

  private async getIssue(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const owner = args.owner as string;
    const repo = args.repo as string;
    const number = args.number as number;

    try {
      const result = await this.apiRequest(
        `/repos/${owner}/${repo}/issues/${number}`,
        {},
        context
      );

      if (!result.ok) {
        return {
          success: false,
          output: `Issue not found: #${number}`,
          error: JSON.stringify(result.data),
          duration: 0,
        };
      }

      const data = result.data as Record<string, unknown>;
      const output = [
        `#${data.number} ${data.title}`,
        `State: ${data.state}`,
        `Author: ${(data.user as Record<string, unknown>)?.login}`,
        `Created: ${data.created_at}`,
        '',
        data.body ?? 'No description',
      ].join('\n');

      return {
        success: true,
        output,
        data,
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Failed to get issue: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }

  private async createIssue(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const owner = args.owner as string;
    const repo = args.repo as string;
    const title = args.title as string;
    const body = args.body as string | undefined;
    const labels = args.labels as string[] | undefined;
    const assignees = args.assignees as string[] | undefined;

    try {
      const result = await this.apiRequest(
        `/repos/${owner}/${repo}/issues`,
        {
          method: 'POST',
          body: { title, body, labels, assignees },
        },
        context
      );

      if (!result.ok) {
        return {
          success: false,
          output: `Failed to create issue: ${result.status}`,
          error: JSON.stringify(result.data),
          duration: 0,
        };
      }

      const data = result.data as Record<string, unknown>;

      return {
        success: true,
        output: `Created issue #${data.number}: ${data.html_url}`,
        data,
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Failed to create issue: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }

  private async listPRs(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const owner = args.owner as string;
    const repo = args.repo as string;
    const state = args.state as string ?? 'open';
    const base = args.base as string | undefined;
    const limit = args.limit as number ?? 30;

    try {
      const params: Record<string, string> = {
        state,
        per_page: String(limit),
      };
      if (base) params.base = base;

      const result = await this.apiRequest(
        `/repos/${owner}/${repo}/pulls`,
        { params },
        context
      );

      if (!result.ok) {
        return {
          success: false,
          output: `Failed to list PRs: ${result.status}`,
          error: JSON.stringify(result.data),
          duration: 0,
        };
      }

      const prs = result.data as Array<{ number: number; title: string; state: string; draft: boolean }>;
      const output = prs
        .map((p) => `#${p.number} [${p.draft ? 'draft' : p.state}] ${p.title}`)
        .join('\n');

      return {
        success: true,
        output: output || 'No pull requests found',
        data: prs,
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Failed to list PRs: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }

  private async getPR(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const owner = args.owner as string;
    const repo = args.repo as string;
    const number = args.number as number;

    try {
      const result = await this.apiRequest(
        `/repos/${owner}/${repo}/pulls/${number}`,
        {},
        context
      );

      if (!result.ok) {
        return {
          success: false,
          output: `PR not found: #${number}`,
          error: JSON.stringify(result.data),
          duration: 0,
        };
      }

      const data = result.data as Record<string, unknown>;
      const output = [
        `#${data.number} ${data.title}`,
        `State: ${data.state}${data.draft ? ' (draft)' : ''}`,
        `Author: ${(data.user as Record<string, unknown>)?.login}`,
        `Base: ${(data.base as Record<string, unknown>)?.ref} <- Head: ${(data.head as Record<string, unknown>)?.ref}`,
        `Mergeable: ${data.mergeable ?? 'unknown'}`,
        '',
        data.body ?? 'No description',
      ].join('\n');

      return {
        success: true,
        output,
        data,
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Failed to get PR: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }

  private async createPR(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const owner = args.owner as string;
    const repo = args.repo as string;
    const title = args.title as string;
    const body = args.body as string | undefined;
    const head = args.head as string;
    const base = args.base as string;
    const draft = args.draft as boolean ?? false;

    try {
      const result = await this.apiRequest(
        `/repos/${owner}/${repo}/pulls`,
        {
          method: 'POST',
          body: { title, body, head, base, draft },
        },
        context
      );

      if (!result.ok) {
        return {
          success: false,
          output: `Failed to create PR: ${result.status}`,
          error: JSON.stringify(result.data),
          duration: 0,
        };
      }

      const data = result.data as Record<string, unknown>;

      return {
        success: true,
        output: `Created PR #${data.number}: ${data.html_url}`,
        data,
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Failed to create PR: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }

  private async getFile(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const owner = args.owner as string;
    const repo = args.repo as string;
    const filePath = args.path as string;
    const ref = args.ref as string | undefined;

    try {
      const params: Record<string, string> = {};
      if (ref) params.ref = ref;

      const result = await this.apiRequest(
        `/repos/${owner}/${repo}/contents/${filePath}`,
        { params },
        context
      );

      if (!result.ok) {
        return {
          success: false,
          output: `File not found: ${filePath}`,
          error: JSON.stringify(result.data),
          duration: 0,
        };
      }

      const data = result.data as Record<string, unknown>;

      // Decode base64 content
      const content = Buffer.from(data.content as string, 'base64').toString('utf-8');

      return {
        success: true,
        output: content,
        data: { ...data, decoded_content: content },
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Failed to get file: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }

  private async searchCode(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const query = args.query as string;
    const repoFilter = args.repo as string | undefined;
    const language = args.language as string | undefined;
    const limit = args.limit as number ?? 30;

    try {
      let q = query;
      if (repoFilter) q += ` repo:${repoFilter}`;
      if (language) q += ` language:${language}`;

      const result = await this.apiRequest(
        '/search/code',
        { params: { q, per_page: String(limit) } },
        context
      );

      if (!result.ok) {
        return {
          success: false,
          output: `Search failed: ${result.status}`,
          error: JSON.stringify(result.data),
          duration: 0,
        };
      }

      const data = result.data as { total_count: number; items: Array<{ repository: { full_name: string }; path: string }> };
      const output = data.items
        .map((i) => `${i.repository.full_name}/${i.path}`)
        .join('\n');

      return {
        success: true,
        output: `Found ${data.total_count} results:\n${output}` || 'No results found',
        data,
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }

  private async listCommits(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const owner = args.owner as string;
    const repo = args.repo as string;
    const sha = args.sha as string | undefined;
    const filePath = args.path as string | undefined;
    const limit = args.limit as number ?? 30;

    try {
      const params: Record<string, string> = { per_page: String(limit) };
      if (sha) params.sha = sha;
      if (filePath) params.path = filePath;

      const result = await this.apiRequest(
        `/repos/${owner}/${repo}/commits`,
        { params },
        context
      );

      if (!result.ok) {
        return {
          success: false,
          output: `Failed to list commits: ${result.status}`,
          error: JSON.stringify(result.data),
          duration: 0,
        };
      }

      const commits = result.data as Array<{
        sha: string;
        commit: { message: string; author: { name: string; date: string } };
      }>;

      const output = commits
        .map((c) => `${c.sha.slice(0, 7)} ${c.commit.author.name}: ${c.commit.message.split('\n')[0]}`)
        .join('\n');

      return {
        success: true,
        output: output || 'No commits found',
        data: commits,
        duration: 0,
      };
    } catch (error) {
      return {
        success: false,
        output: `Failed to list commits: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      };
    }
  }
}

/**
 * GitHub skill factory
 */
export function createGitHubSkill(config?: SkillConfig): GitHubSkill {
  return new GitHubSkill(config);
}
