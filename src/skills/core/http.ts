/**
 * HTTP Skill
 * Provides HTTP request capabilities
 */

import { createLogger } from '../../logging/logger.js';
import {
  BaseSkill,
  createSkillManifest,
  type SkillConfig,
  type SkillContext,
  type SkillResult,
} from '../types.js';

const log = createLogger('skill-http');

/**
 * HTTP Skill Implementation
 */
export class HttpSkill extends BaseSkill {
  private allowedHosts: Set<string>;
  private deniedHosts: Set<string>;

  constructor(config?: SkillConfig) {
    super(
      createSkillManifest({
        id: 'http',
        name: 'HTTP',
        description: 'Make HTTP requests to APIs and web services',
        category: 'http',
        permissions: ['network'],
        tags: ['core', 'http', 'api', 'web'],
      }),
      config
    );

    // Default allowed hosts (if empty, all are allowed)
    this.allowedHosts = new Set(
      (this.config.custom?.allowedHosts as string[]) ?? []
    );

    // Denied hosts
    this.deniedHosts = new Set([
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '::1',
      // Add internal network ranges if needed
    ]);

    this.registerTools();
  }

  private registerTools(): void {
    // HTTP GET
    this.registerTool(
      {
        name: 'http_get',
        description: 'Make an HTTP GET request',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to request',
            },
            headers: {
              type: 'object',
              description: 'Request headers',
            },
            params: {
              type: 'object',
              description: 'Query parameters',
            },
          },
          required: ['url'],
        },
      },
      this.httpGet.bind(this)
    );

    // HTTP POST
    this.registerTool(
      {
        name: 'http_post',
        description: 'Make an HTTP POST request',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to request',
            },
            body: {
              type: 'object',
              description: 'Request body (JSON)',
            },
            headers: {
              type: 'object',
              description: 'Request headers',
            },
            contentType: {
              type: 'string',
              description: 'Content type (default: application/json)',
            },
          },
          required: ['url'],
        },
      },
      this.httpPost.bind(this)
    );

    // HTTP PUT
    this.registerTool(
      {
        name: 'http_put',
        description: 'Make an HTTP PUT request',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to request',
            },
            body: {
              type: 'object',
              description: 'Request body (JSON)',
            },
            headers: {
              type: 'object',
              description: 'Request headers',
            },
          },
          required: ['url'],
        },
      },
      this.httpPut.bind(this)
    );

    // HTTP PATCH
    this.registerTool(
      {
        name: 'http_patch',
        description: 'Make an HTTP PATCH request',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to request',
            },
            body: {
              type: 'object',
              description: 'Request body (JSON)',
            },
            headers: {
              type: 'object',
              description: 'Request headers',
            },
          },
          required: ['url'],
        },
      },
      this.httpPatch.bind(this)
    );

    // HTTP DELETE
    this.registerTool(
      {
        name: 'http_delete',
        description: 'Make an HTTP DELETE request',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to request',
            },
            headers: {
              type: 'object',
              description: 'Request headers',
            },
          },
          required: ['url'],
        },
      },
      this.httpDelete.bind(this)
    );

    // HTTP HEAD
    this.registerTool(
      {
        name: 'http_head',
        description: 'Make an HTTP HEAD request (headers only)',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to request',
            },
            headers: {
              type: 'object',
              description: 'Request headers',
            },
          },
          required: ['url'],
        },
      },
      this.httpHead.bind(this)
    );

    // Generic HTTP request
    this.registerTool(
      {
        name: 'http_request',
        description: 'Make a custom HTTP request',
        parameters: {
          type: 'object',
          properties: {
            method: {
              type: 'string',
              description: 'HTTP method',
              enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
            },
            url: {
              type: 'string',
              description: 'The URL to request',
            },
            headers: {
              type: 'object',
              description: 'Request headers',
            },
            body: {
              type: 'string',
              description: 'Request body',
            },
            timeout: {
              type: 'number',
              description: 'Timeout in milliseconds',
            },
          },
          required: ['method', 'url'],
        },
      },
      this.httpRequest.bind(this)
    );

    // Download file
    this.registerTool(
      {
        name: 'http_download',
        description: 'Download a file from a URL',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to download from',
            },
            headers: {
              type: 'object',
              description: 'Request headers',
            },
          },
          required: ['url'],
        },
      },
      this.httpDownload.bind(this)
    );
  }

  private isHostAllowed(url: string): { allowed: boolean; reason?: string } {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();

      // Check denied list
      if (this.deniedHosts.has(host)) {
        return {
          allowed: false,
          reason: `Host "${host}" is not allowed`,
        };
      }

      // Check if it's an internal IP
      if (this.isInternalIP(host)) {
        return {
          allowed: false,
          reason: 'Internal IP addresses are not allowed',
        };
      }

      // Check allowed list (if configured)
      if (this.allowedHosts.size > 0 && !this.allowedHosts.has(host)) {
        return {
          allowed: false,
          reason: `Host "${host}" is not in the allowed list`,
        };
      }

      return { allowed: true };
    } catch {
      return {
        allowed: false,
        reason: 'Invalid URL',
      };
    }
  }

  private isInternalIP(host: string): boolean {
    // Check for internal IP ranges
    const internalPatterns = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^169\.254\./,
      /^127\./,
    ];

    return internalPatterns.some((pattern) => pattern.test(host));
  }

  private async makeRequest(
    method: string,
    url: string,
    options: {
      headers?: Record<string, string>;
      body?: unknown;
      timeout?: number;
    },
    context: SkillContext
  ): Promise<SkillResult> {
    // Security check
    const check = this.isHostAllowed(url);
    if (!check.allowed) {
      return {
        success: false,
        output: check.reason!,
        error: check.reason,
        duration: 0,
      };
    }

    const startTime = Date.now();

    try {
      const headers = new Headers(options.headers ?? {});

      // Set default content type for JSON body
      if (options.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      const fetchOptions: RequestInit = {
        method,
        headers,
        signal: context.signal ?? AbortSignal.timeout(options.timeout ?? context.timeout),
      };

      if (options.body && method !== 'GET' && method !== 'HEAD') {
        fetchOptions.body = typeof options.body === 'string'
          ? options.body
          : JSON.stringify(options.body);
      }

      log.debug('Making HTTP request', { method, url });

      const response = await fetch(url, fetchOptions);

      const duration = Date.now() - startTime;

      // Get response headers
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      // Get response body
      const contentType = response.headers.get('content-type') ?? '';
      let body: unknown;

      if (contentType.includes('application/json')) {
        body = await response.json();
      } else if (contentType.includes('text/')) {
        body = await response.text();
      } else {
        body = `[Binary data: ${response.headers.get('content-length') ?? 'unknown'} bytes]`;
      }

      const output = typeof body === 'string'
        ? body
        : JSON.stringify(body, null, 2);

      return {
        success: response.ok,
        output: output.slice(0, 50000), // Limit output size
        data: {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          body,
        },
        error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      return {
        success: false,
        output: `Request failed: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration,
      };
    }
  }

  private async httpGet(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    let url = args.url as string;
    const headers = args.headers as Record<string, string> | undefined;
    const params = args.params as Record<string, string> | undefined;

    // Add query parameters
    if (params) {
      const searchParams = new URLSearchParams(params);
      const separator = url.includes('?') ? '&' : '?';
      url = `${url}${separator}${searchParams.toString()}`;
    }

    return this.makeRequest('GET', url, { headers }, context);
  }

  private async httpPost(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const url = args.url as string;
    const body = args.body;
    const headers = args.headers as Record<string, string> | undefined;

    return this.makeRequest('POST', url, { headers, body }, context);
  }

  private async httpPut(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const url = args.url as string;
    const body = args.body;
    const headers = args.headers as Record<string, string> | undefined;

    return this.makeRequest('PUT', url, { headers, body }, context);
  }

  private async httpPatch(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const url = args.url as string;
    const body = args.body;
    const headers = args.headers as Record<string, string> | undefined;

    return this.makeRequest('PATCH', url, { headers, body }, context);
  }

  private async httpDelete(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const url = args.url as string;
    const headers = args.headers as Record<string, string> | undefined;

    return this.makeRequest('DELETE', url, { headers }, context);
  }

  private async httpHead(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const url = args.url as string;
    const headers = args.headers as Record<string, string> | undefined;

    return this.makeRequest('HEAD', url, { headers }, context);
  }

  private async httpRequest(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const method = (args.method as string).toUpperCase();
    const url = args.url as string;
    const headers = args.headers as Record<string, string> | undefined;
    const body = args.body;
    const timeout = args.timeout as number | undefined;

    return this.makeRequest(method, url, { headers, body, timeout }, context);
  }

  private async httpDownload(
    args: Record<string, unknown>,
    context: SkillContext
  ): Promise<SkillResult> {
    const url = args.url as string;
    const headers = args.headers as Record<string, string> | undefined;

    // Security check
    const check = this.isHostAllowed(url);
    if (!check.allowed) {
      return {
        success: false,
        output: check.reason!,
        error: check.reason,
        duration: 0,
      };
    }

    const startTime = Date.now();

    try {
      const response = await fetch(url, {
        headers: new Headers(headers ?? {}),
        signal: context.signal ?? AbortSignal.timeout(context.timeout),
      });

      if (!response.ok) {
        return {
          success: false,
          output: `Download failed: HTTP ${response.status}`,
          error: `HTTP ${response.status}: ${response.statusText}`,
          duration: Date.now() - startTime,
        };
      }

      const contentType = response.headers.get('content-type');
      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');

      const duration = Date.now() - startTime;

      return {
        success: true,
        output: `Downloaded ${arrayBuffer.byteLength} bytes from ${url}`,
        data: {
          url,
          size: arrayBuffer.byteLength,
          contentType,
          base64: base64.slice(0, 1000) + (base64.length > 1000 ? '...' : ''),
        },
        duration,
      };
    } catch (error) {
      return {
        success: false,
        output: `Download failed: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }
}

/**
 * HTTP skill factory
 */
export function createHttpSkill(config?: SkillConfig): HttpSkill {
  return new HttpSkill(config);
}
