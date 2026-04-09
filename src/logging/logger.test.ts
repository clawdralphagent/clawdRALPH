/**
 * Tests for logger
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Logger } from './logger.js';
import { MemoryTransport } from './transports.js';

describe('Logger', () => {
  let logger: Logger;
  let memoryTransport: MemoryTransport;

  beforeEach(() => {
    logger = new Logger({ level: 'debug' });
    memoryTransport = new MemoryTransport();
    // Replace default transport with memory transport
    (logger as unknown as { transports: unknown[] }).transports = [memoryTransport];
  });

  describe('log levels', () => {
    it('should log debug messages when level is debug', () => {
      logger.debug('debug message');
      expect(memoryTransport.getLogsForLevel('debug')).toHaveLength(1);
    });

    it('should log info messages', () => {
      logger.info('info message');
      expect(memoryTransport.getLogsForLevel('info')).toHaveLength(1);
    });

    it('should log warn messages', () => {
      logger.warn('warn message');
      expect(memoryTransport.getLogsForLevel('warn')).toHaveLength(1);
    });

    it('should log error messages', () => {
      logger.error('error message');
      expect(memoryTransport.getLogsForLevel('error')).toHaveLength(1);
    });

    it('should log fatal messages', () => {
      logger.fatal('fatal message');
      expect(memoryTransport.getLogsForLevel('fatal')).toHaveLength(1);
    });

    it('should not log debug when level is info', () => {
      logger.setLevel('info');
      logger.debug('should not appear');
      expect(memoryTransport.getLogsForLevel('debug')).toHaveLength(0);
    });

    it('should log error when level is error', () => {
      logger.setLevel('error');
      logger.info('should not appear');
      logger.error('should appear');
      expect(memoryTransport.getLogsForLevel('info')).toHaveLength(0);
      expect(memoryTransport.getLogsForLevel('error')).toHaveLength(1);
    });
  });

  describe('context', () => {
    it('should include context in log messages', () => {
      logger.info('message with context', { key: 'value' });
      const logs = memoryTransport.getLogs();
      expect(logs[0]?.message).toContain('key=');
    });
  });

  describe('child logger', () => {
    it('should create child with additional context', () => {
      const child = logger.child({ component: 'test' });
      child.info('child message');
      const logs = memoryTransport.getLogs();
      expect(logs[0]?.message).toContain('component=');
    });

    it('should inherit log level', () => {
      logger.setLevel('warn');
      const child = logger.child({ component: 'test' });
      expect(child.getLevel()).toBe('warn');
    });
  });

  describe('level management', () => {
    it('should get current level', () => {
      expect(logger.getLevel()).toBe('debug');
    });

    it('should set new level', () => {
      logger.setLevel('error');
      expect(logger.getLevel()).toBe('error');
    });
  });
});

describe('MemoryTransport', () => {
  let transport: MemoryTransport;

  beforeEach(() => {
    transport = new MemoryTransport();
  });

  it('should store logs', () => {
    transport.write('info', 'test message');
    expect(transport.getLogs()).toHaveLength(1);
  });

  it('should filter by level', () => {
    transport.write('info', 'info message');
    transport.write('error', 'error message');
    transport.write('info', 'another info');

    expect(transport.getLogsForLevel('info')).toHaveLength(2);
    expect(transport.getLogsForLevel('error')).toHaveLength(1);
  });

  it('should clear logs', () => {
    transport.write('info', 'message');
    transport.clear();
    expect(transport.getLogs()).toHaveLength(0);
  });

  it('should respect max entries', () => {
    const smallTransport = new MemoryTransport(3);
    smallTransport.write('info', '1');
    smallTransport.write('info', '2');
    smallTransport.write('info', '3');
    smallTransport.write('info', '4');

    expect(smallTransport.getLogs()).toHaveLength(3);
  });
});
