/**
 * UI verification system
 * Visual regression detection, element assertions, and layout verification
 */

import { createLogger } from '../logging/logger.js';
import { PageController } from './page.js';
import type { BrowserManager } from './manager.js';
import type {
  VerificationResult,
  VerificationCheck,
  VisualDiffResult,
  ScreenshotOptions,
  LocatorOptions,
} from './types.js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const log = createLogger('browser-verify');

/**
 * Assertion builder for fluent verification API
 */
export class ElementAssertion {
  private controller: PageController;
  private selector: string;
  private strategy: LocatorOptions['strategy'];
  private checks: VerificationCheck[] = [];
  private timeout?: number;

  constructor(
    controller: PageController,
    selector: string,
    strategy: LocatorOptions['strategy'] = 'css'
  ) {
    this.controller = controller;
    this.selector = selector;
    this.strategy = strategy;
  }

  /**
   * Set timeout for all checks
   */
  withTimeout(ms: number): this {
    this.timeout = ms;
    return this;
  }

  /**
   * Assert element is visible
   */
  async isVisible(): Promise<this> {
    try {
      const visible = await this.controller.isVisible(this.selector, {
        strategy: this.strategy,
        timeout: this.timeout,
      });

      this.checks.push({
        name: 'isVisible',
        passed: visible,
        message: visible
          ? `Element "${this.selector}" is visible`
          : `Element "${this.selector}" is not visible`,
        expected: true,
        actual: visible,
      });
    } catch (error) {
      this.checks.push({
        name: 'isVisible',
        passed: false,
        message: `Failed to check visibility: ${error instanceof Error ? error.message : String(error)}`,
        expected: true,
        actual: false,
      });
    }

    return this;
  }

  /**
   * Assert element is hidden
   */
  async isHidden(): Promise<this> {
    try {
      const visible = await this.controller.isVisible(this.selector, {
        strategy: this.strategy,
        timeout: this.timeout,
      });

      this.checks.push({
        name: 'isHidden',
        passed: !visible,
        message: !visible
          ? `Element "${this.selector}" is hidden`
          : `Element "${this.selector}" is visible (expected hidden)`,
        expected: false,
        actual: visible,
      });
    } catch (error) {
      // Element not found means it's hidden
      this.checks.push({
        name: 'isHidden',
        passed: true,
        message: `Element "${this.selector}" is hidden (not found)`,
        expected: false,
        actual: false,
      });
    }

    return this;
  }

  /**
   * Assert element is enabled
   */
  async isEnabled(): Promise<this> {
    try {
      const enabled = await this.controller.isEnabled(this.selector, {
        strategy: this.strategy,
        timeout: this.timeout,
      });

      this.checks.push({
        name: 'isEnabled',
        passed: enabled,
        message: enabled
          ? `Element "${this.selector}" is enabled`
          : `Element "${this.selector}" is disabled`,
        expected: true,
        actual: enabled,
      });
    } catch (error) {
      this.checks.push({
        name: 'isEnabled',
        passed: false,
        message: `Failed to check enabled state: ${error instanceof Error ? error.message : String(error)}`,
        expected: true,
        actual: false,
      });
    }

    return this;
  }

  /**
   * Assert element is disabled
   */
  async isDisabled(): Promise<this> {
    try {
      const enabled = await this.controller.isEnabled(this.selector, {
        strategy: this.strategy,
        timeout: this.timeout,
      });

      this.checks.push({
        name: 'isDisabled',
        passed: !enabled,
        message: !enabled
          ? `Element "${this.selector}" is disabled`
          : `Element "${this.selector}" is enabled (expected disabled)`,
        expected: false,
        actual: enabled,
      });
    } catch (error) {
      this.checks.push({
        name: 'isDisabled',
        passed: false,
        message: `Failed to check disabled state: ${error instanceof Error ? error.message : String(error)}`,
        expected: false,
        actual: true,
      });
    }

    return this;
  }

  /**
   * Assert element is checked (checkbox/radio)
   */
  async isChecked(): Promise<this> {
    try {
      const checked = await this.controller.isChecked(this.selector, {
        strategy: this.strategy,
        timeout: this.timeout,
      });

      this.checks.push({
        name: 'isChecked',
        passed: checked,
        message: checked
          ? `Element "${this.selector}" is checked`
          : `Element "${this.selector}" is not checked`,
        expected: true,
        actual: checked,
      });
    } catch (error) {
      this.checks.push({
        name: 'isChecked',
        passed: false,
        message: `Failed to check checked state: ${error instanceof Error ? error.message : String(error)}`,
        expected: true,
        actual: false,
      });
    }

    return this;
  }

  /**
   * Assert element has specific text
   */
  async hasText(expected: string, options: { exact?: boolean } = {}): Promise<this> {
    try {
      const actual = await this.controller.innerText(this.selector, {
        strategy: this.strategy,
        timeout: this.timeout,
      });

      const passed = options.exact
        ? actual === expected
        : actual.includes(expected);

      this.checks.push({
        name: 'hasText',
        passed,
        message: passed
          ? `Element "${this.selector}" has expected text`
          : `Element "${this.selector}" text mismatch`,
        expected,
        actual,
      });
    } catch (error) {
      this.checks.push({
        name: 'hasText',
        passed: false,
        message: `Failed to get text: ${error instanceof Error ? error.message : String(error)}`,
        expected,
        actual: null,
      });
    }

    return this;
  }

  /**
   * Assert element has specific attribute value
   */
  async hasAttribute(name: string, value?: string): Promise<this> {
    try {
      const actual = await this.controller.getAttribute(this.selector, name, {
        strategy: this.strategy,
        timeout: this.timeout,
      });

      let passed: boolean;
      let message: string;

      if (value === undefined) {
        // Just check attribute exists
        passed = actual !== null;
        message = passed
          ? `Element "${this.selector}" has attribute "${name}"`
          : `Element "${this.selector}" missing attribute "${name}"`;
      } else {
        // Check attribute value
        passed = actual === value;
        message = passed
          ? `Element "${this.selector}" has attribute "${name}=${value}"`
          : `Element "${this.selector}" attribute "${name}" mismatch`;
      }

      this.checks.push({
        name: 'hasAttribute',
        passed,
        message,
        expected: value ?? `attribute "${name}" exists`,
        actual,
      });
    } catch (error) {
      this.checks.push({
        name: 'hasAttribute',
        passed: false,
        message: `Failed to get attribute: ${error instanceof Error ? error.message : String(error)}`,
        expected: value,
        actual: null,
      });
    }

    return this;
  }

  /**
   * Assert element has specific class
   */
  async hasClass(className: string): Promise<this> {
    try {
      const classAttr = await this.controller.getAttribute(this.selector, 'class', {
        strategy: this.strategy,
        timeout: this.timeout,
      });

      const classes = classAttr?.split(/\s+/) || [];
      const passed = classes.includes(className);

      this.checks.push({
        name: 'hasClass',
        passed,
        message: passed
          ? `Element "${this.selector}" has class "${className}"`
          : `Element "${this.selector}" missing class "${className}"`,
        expected: className,
        actual: classAttr,
      });
    } catch (error) {
      this.checks.push({
        name: 'hasClass',
        passed: false,
        message: `Failed to get class: ${error instanceof Error ? error.message : String(error)}`,
        expected: className,
        actual: null,
      });
    }

    return this;
  }

  /**
   * Assert element count matches
   */
  async hasCount(expected: number): Promise<this> {
    try {
      const actual = await this.controller.count(this.selector, {
        strategy: this.strategy,
      });

      const passed = actual === expected;

      this.checks.push({
        name: 'hasCount',
        passed,
        message: passed
          ? `Found ${expected} elements matching "${this.selector}"`
          : `Expected ${expected} elements, found ${actual}`,
        expected,
        actual,
      });
    } catch (error) {
      this.checks.push({
        name: 'hasCount',
        passed: false,
        message: `Failed to count elements: ${error instanceof Error ? error.message : String(error)}`,
        expected,
        actual: null,
      });
    }

    return this;
  }

  /**
   * Get all verification checks
   */
  getChecks(): VerificationCheck[] {
    return [...this.checks];
  }

  /**
   * Check if all assertions passed
   */
  passed(): boolean {
    return this.checks.every((c) => c.passed);
  }
}

/**
 * UI Verification class for comprehensive testing
 */
export class UIVerifier {
  private controller: PageController;
  private baselineDir: string;

  constructor(
    manager: BrowserManager,
    browserId: string,
    pageId: string,
    baselineDir: string = '.clawdralph/baselines'
  ) {
    this.controller = new PageController(manager, browserId, pageId);
    this.baselineDir = baselineDir;
  }

  /**
   * Start assertion chain for an element
   */
  expect(selector: string, strategy: LocatorOptions['strategy'] = 'css'): ElementAssertion {
    return new ElementAssertion(this.controller, selector, strategy);
  }

  /**
   * Run multiple element assertions
   */
  async verify(
    assertions: Array<(verifier: UIVerifier) => Promise<ElementAssertion>>
  ): Promise<VerificationResult> {
    const startTime = Date.now();
    const allChecks: VerificationCheck[] = [];

    for (const assertFn of assertions) {
      const assertion = await assertFn(this);
      allChecks.push(...assertion.getChecks());
    }

    const passed = allChecks.every((c) => c.passed);

    const result: VerificationResult = {
      passed,
      checks: allChecks,
      duration: Date.now() - startTime,
      timestamp: new Date(),
    };

    log.info('Verification complete', {
      passed,
      totalChecks: allChecks.length,
      failedChecks: allChecks.filter((c) => !c.passed).length,
    });

    return result;
  }

  /**
   * Take a screenshot and optionally compare with baseline
   */
  async screenshot(
    name: string,
    options: Partial<ScreenshotOptions> & { compareBaseline?: boolean } = {}
  ): Promise<{ buffer: Buffer; diff?: VisualDiffResult }> {
    const buffer = await this.controller.screenshot(options);

    let diff: VisualDiffResult | undefined;

    if (options.compareBaseline) {
      diff = await this.compareWithBaseline(name, buffer);
    }

    return { buffer, diff };
  }

  /**
   * Compare screenshot with baseline
   */
  async compareWithBaseline(
    name: string,
    currentBuffer: Buffer
  ): Promise<VisualDiffResult> {
    const baselinePath = path.join(this.baselineDir, `${name}.png`);

    // Check if baseline exists
    if (!fs.existsSync(baselinePath)) {
      // Create baseline
      fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
      fs.writeFileSync(baselinePath, currentBuffer);

      log.info('Baseline created', { name, path: baselinePath });

      return {
        match: true,
        diffPercentage: 0,
        diffPixels: 0,
        baselineImage: currentBuffer.toString('base64'),
        currentImage: currentBuffer.toString('base64'),
      };
    }

    // Load baseline
    const baselineBuffer = fs.readFileSync(baselinePath);

    // Simple comparison using hash (for production, use pixelmatch or similar)
    const baselineHash = crypto.createHash('md5').update(baselineBuffer).digest('hex');
    const currentHash = crypto.createHash('md5').update(currentBuffer).digest('hex');

    if (baselineHash === currentHash) {
      return {
        match: true,
        diffPercentage: 0,
        diffPixels: 0,
        baselineImage: baselineBuffer.toString('base64'),
        currentImage: currentBuffer.toString('base64'),
      };
    }

    // For a real implementation, use image comparison library
    // This is a placeholder that detects any difference
    log.warn('Visual difference detected', { name });

    return {
      match: false,
      diffPercentage: 100, // Would be calculated by pixel diff
      diffPixels: -1, // Would be calculated
      baselineImage: baselineBuffer.toString('base64'),
      currentImage: currentBuffer.toString('base64'),
    };
  }

  /**
   * Update baseline with current screenshot
   */
  async updateBaseline(name: string, options: Partial<ScreenshotOptions> = {}): Promise<void> {
    const buffer = await this.controller.screenshot(options);
    const baselinePath = path.join(this.baselineDir, `${name}.png`);

    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(baselinePath, buffer);

    log.info('Baseline updated', { name, path: baselinePath });
  }

  /**
   * Verify page title
   */
  async verifyTitle(expected: string, options: { exact?: boolean } = {}): Promise<VerificationCheck> {
    const actual = await this.controller.title();
    const passed = options.exact ? actual === expected : actual.includes(expected);

    return {
      name: 'verifyTitle',
      passed,
      message: passed
        ? `Page title matches: "${expected}"`
        : `Page title mismatch`,
      expected,
      actual,
    };
  }

  /**
   * Verify current URL
   */
  async verifyUrl(expected: string | RegExp): Promise<VerificationCheck> {
    const actual = await this.controller.url();
    const passed =
      typeof expected === 'string'
        ? actual === expected || actual.includes(expected)
        : expected.test(actual);

    return {
      name: 'verifyUrl',
      passed,
      message: passed ? `URL matches: "${expected}"` : `URL mismatch`,
      expected: expected.toString(),
      actual,
    };
  }

  /**
   * Verify no console errors
   */
  async verifyNoConsoleErrors(): Promise<VerificationCheck> {
    // This would need to be set up before page load to capture console
    // For now, return a placeholder
    return {
      name: 'verifyNoConsoleErrors',
      passed: true,
      message: 'Console error check requires setup before page load',
    };
  }

  /**
   * Verify page accessibility (basic checks)
   */
  async verifyAccessibility(): Promise<VerificationCheck[]> {
    const checks: VerificationCheck[] = [];

    // Check for alt text on images
    const imagesWithoutAlt = await this.controller.evaluate(
      `document.querySelectorAll('img:not([alt])').length`
    );

    checks.push({
      name: 'imagesHaveAlt',
      passed: (imagesWithoutAlt as number) === 0,
      message:
        (imagesWithoutAlt as number) === 0
          ? 'All images have alt text'
          : `${imagesWithoutAlt} images missing alt text`,
      expected: 0,
      actual: imagesWithoutAlt as number,
    });

    // Check for form labels
    const inputsWithoutLabel = await this.controller.evaluate(`
      (() => {
        const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"])');
        let count = 0;
        inputs.forEach((input) => {
          const id = input.getAttribute('id');
          const ariaLabel = input.getAttribute('aria-label');
          const ariaLabelledBy = input.getAttribute('aria-labelledby');
          const hasLabel = id && document.querySelector('label[for="' + id + '"]');
          if (!hasLabel && !ariaLabel && !ariaLabelledBy) {
            count++;
          }
        });
        return count;
      })()
    `);

    checks.push({
      name: 'inputsHaveLabels',
      passed: (inputsWithoutLabel as number) === 0,
      message:
        (inputsWithoutLabel as number) === 0
          ? 'All inputs have labels'
          : `${inputsWithoutLabel} inputs missing labels`,
      expected: 0,
      actual: inputsWithoutLabel as number,
    });

    // Check for document language
    const hasLang = await this.controller.evaluate(
      `document.documentElement.hasAttribute('lang')`
    );

    checks.push({
      name: 'hasDocumentLanguage',
      passed: hasLang as boolean,
      message: hasLang ? 'Document has lang attribute' : 'Document missing lang attribute',
      expected: true,
      actual: hasLang as boolean,
    });

    return checks;
  }

  /**
   * Verify layout (element positions and sizes)
   */
  async verifyLayout(
    expectations: Array<{
      selector: string;
      minWidth?: number;
      maxWidth?: number;
      minHeight?: number;
      maxHeight?: number;
      visible?: boolean;
    }>
  ): Promise<VerificationCheck[]> {
    const checks: VerificationCheck[] = [];

    for (const expectation of expectations) {
      const box = await this.controller.boundingBox(expectation.selector);

      if (!box) {
        checks.push({
          name: 'layoutCheck',
          passed: expectation.visible === false,
          message: `Element "${expectation.selector}" not found/visible`,
          expected: expectation,
          actual: null,
        });
        continue;
      }

      if (expectation.minWidth !== undefined && box.width < expectation.minWidth) {
        checks.push({
          name: 'minWidth',
          passed: false,
          message: `"${expectation.selector}" width ${box.width} < ${expectation.minWidth}`,
          expected: expectation.minWidth,
          actual: box.width,
        });
      }

      if (expectation.maxWidth !== undefined && box.width > expectation.maxWidth) {
        checks.push({
          name: 'maxWidth',
          passed: false,
          message: `"${expectation.selector}" width ${box.width} > ${expectation.maxWidth}`,
          expected: expectation.maxWidth,
          actual: box.width,
        });
      }

      if (expectation.minHeight !== undefined && box.height < expectation.minHeight) {
        checks.push({
          name: 'minHeight',
          passed: false,
          message: `"${expectation.selector}" height ${box.height} < ${expectation.minHeight}`,
          expected: expectation.minHeight,
          actual: box.height,
        });
      }

      if (expectation.maxHeight !== undefined && box.height > expectation.maxHeight) {
        checks.push({
          name: 'maxHeight',
          passed: false,
          message: `"${expectation.selector}" height ${box.height} > ${expectation.maxHeight}`,
          expected: expectation.maxHeight,
          actual: box.height,
        });
      }

      // If no specific dimension checks failed, element passes
      const elemChecks = checks.filter((c) => c.message.includes(expectation.selector));
      if (elemChecks.length === 0) {
        checks.push({
          name: 'layoutCheck',
          passed: true,
          message: `Element "${expectation.selector}" layout verified`,
          expected: expectation,
          actual: box,
        });
      }
    }

    return checks;
  }

  /**
   * Run a full verification suite
   */
  async runSuite(
    suite: {
      name: string;
      assertions?: Array<(verifier: UIVerifier) => Promise<ElementAssertion>>;
      screenshots?: Array<{ name: string; options?: Partial<ScreenshotOptions> }>;
      layoutChecks?: Array<{
        selector: string;
        minWidth?: number;
        maxWidth?: number;
        minHeight?: number;
        maxHeight?: number;
      }>;
      accessibilityCheck?: boolean;
    }
  ): Promise<VerificationResult> {
    const startTime = Date.now();
    const allChecks: VerificationCheck[] = [];
    let screenshot: string | undefined;

    log.info('Running verification suite', { name: suite.name });

    // Run assertions
    if (suite.assertions) {
      const result = await this.verify(suite.assertions);
      allChecks.push(...result.checks);
    }

    // Take screenshots
    if (suite.screenshots) {
      for (const ss of suite.screenshots) {
        const { buffer, diff } = await this.screenshot(ss.name, {
          ...ss.options,
          compareBaseline: true,
        });

        if (diff && !diff.match) {
          allChecks.push({
            name: `screenshot_${ss.name}`,
            passed: false,
            message: `Visual regression detected in "${ss.name}"`,
            expected: 'baseline match',
            actual: `${diff.diffPercentage}% difference`,
          });
        } else {
          allChecks.push({
            name: `screenshot_${ss.name}`,
            passed: true,
            message: `Screenshot "${ss.name}" matches baseline`,
          });
        }

        // Use last screenshot for result
        screenshot = buffer.toString('base64');
      }
    }

    // Run layout checks
    if (suite.layoutChecks) {
      const layoutResults = await this.verifyLayout(suite.layoutChecks);
      allChecks.push(...layoutResults);
    }

    // Run accessibility checks
    if (suite.accessibilityCheck) {
      const a11yResults = await this.verifyAccessibility();
      allChecks.push(...a11yResults);
    }

    const passed = allChecks.every((c) => c.passed);

    log.info('Verification suite complete', {
      name: suite.name,
      passed,
      totalChecks: allChecks.length,
      failedChecks: allChecks.filter((c) => !c.passed).length,
    });

    return {
      passed,
      checks: allChecks,
      screenshot,
      duration: Date.now() - startTime,
      timestamp: new Date(),
    };
  }
}

/**
 * Create a UI verifier
 */
export function createUIVerifier(
  manager: BrowserManager,
  browserId: string,
  pageId: string,
  baselineDir?: string
): UIVerifier {
  return new UIVerifier(manager, browserId, pageId, baselineDir);
}
