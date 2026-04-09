/**
 * Tests for CLI program
 */

import { describe, it, expect } from 'vitest';
import { buildProgram } from './program.js';

describe('CLI Program', () => {
  describe('buildProgram', () => {
    it('should create a program with correct name', () => {
      const program = buildProgram();
      expect(program.name()).toBe('clawdralph');
    });

    it('should have description', () => {
      const program = buildProgram();
      expect(program.description()).toContain('Autonomous');
    });

    it('should have gateway command', () => {
      const program = buildProgram();
      const gateway = program.commands.find(cmd => cmd.name() === 'gateway');
      expect(gateway).toBeDefined();
    });

    it('should have config command', () => {
      const program = buildProgram();
      const config = program.commands.find(cmd => cmd.name() === 'config');
      expect(config).toBeDefined();
    });

    it('should have loop command', () => {
      const program = buildProgram();
      const loop = program.commands.find(cmd => cmd.name() === 'loop');
      expect(loop).toBeDefined();
    });

    it('should have prd command', () => {
      const program = buildProgram();
      const prd = program.commands.find(cmd => cmd.name() === 'prd');
      expect(prd).toBeDefined();
    });

    it('should have status command', () => {
      const program = buildProgram();
      const status = program.commands.find(cmd => cmd.name() === 'status');
      expect(status).toBeDefined();
    });

    it('should have version command', () => {
      const program = buildProgram();
      const version = program.commands.find(cmd => cmd.name() === 'version');
      expect(version).toBeDefined();
    });

    it('should have global options', () => {
      const program = buildProgram();
      const options = program.options.map(opt => opt.long);
      expect(options).toContain('--config');
      expect(options).toContain('--verbose');
      expect(options).toContain('--quiet');
    });
  });

  describe('config subcommands', () => {
    it('should have config init command', () => {
      const program = buildProgram();
      const config = program.commands.find(cmd => cmd.name() === 'config');
      const init = config?.commands.find(cmd => cmd.name() === 'init');
      expect(init).toBeDefined();
    });

    it('should have config show command', () => {
      const program = buildProgram();
      const config = program.commands.find(cmd => cmd.name() === 'config');
      const show = config?.commands.find(cmd => cmd.name() === 'show');
      expect(show).toBeDefined();
    });

    it('should have config get command', () => {
      const program = buildProgram();
      const config = program.commands.find(cmd => cmd.name() === 'config');
      const get = config?.commands.find(cmd => cmd.name() === 'get');
      expect(get).toBeDefined();
    });

    it('should have config set command', () => {
      const program = buildProgram();
      const config = program.commands.find(cmd => cmd.name() === 'config');
      const set = config?.commands.find(cmd => cmd.name() === 'set');
      expect(set).toBeDefined();
    });
  });

  describe('loop subcommands', () => {
    it('should have loop start command', () => {
      const program = buildProgram();
      const loop = program.commands.find(cmd => cmd.name() === 'loop');
      const start = loop?.commands.find(cmd => cmd.name() === 'start');
      expect(start).toBeDefined();
    });

    it('should have loop status command', () => {
      const program = buildProgram();
      const loop = program.commands.find(cmd => cmd.name() === 'loop');
      const status = loop?.commands.find(cmd => cmd.name() === 'status');
      expect(status).toBeDefined();
    });

    it('should have loop stop command', () => {
      const program = buildProgram();
      const loop = program.commands.find(cmd => cmd.name() === 'loop');
      const stop = loop?.commands.find(cmd => cmd.name() === 'stop');
      expect(stop).toBeDefined();
    });
  });

  describe('prd subcommands', () => {
    it('should have prd create command', () => {
      const program = buildProgram();
      const prd = program.commands.find(cmd => cmd.name() === 'prd');
      const create = prd?.commands.find(cmd => cmd.name() === 'create');
      expect(create).toBeDefined();
    });

    it('should have prd convert command', () => {
      const program = buildProgram();
      const prd = program.commands.find(cmd => cmd.name() === 'prd');
      const convert = prd?.commands.find(cmd => cmd.name() === 'convert');
      expect(convert).toBeDefined();
    });
  });
});
