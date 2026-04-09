/**
 * Skills commands - manage the skill system
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createLogger } from '../../logging/logger.js';
import { createSkillsSystem } from '../../skills/index.js';

const log = createLogger('skills-cli');

/**
 * Create the skills command group
 */
export function skillsCommand(): Command {
  const cmd = new Command('skills');

  cmd
    .description('Manage the skill system');

  // List subcommand
  cmd
    .command('list')
    .description('List all available skills')
    .option('-c, --category <category>', 'Filter by category')
    .option('-e, --enabled', 'Show only enabled skills')
    .option('--json', 'Output as JSON')
    .action(async (options: { category?: string; enabled?: boolean; json: boolean }) => {
      try {
        const skills = createSkillsSystem();
        await skills.initialize();

        let list = skills.listSkills();

        if (options.category) {
          list = list.filter((s) => s.category === options.category);
        }

        if (options.enabled) {
          list = list.filter((s) => s.enabled);
        }

        if (options.json) {
          console.log(JSON.stringify(list, null, 2));
        } else {
          console.log('');
          console.log(chalk.cyan.bold('Available Skills'));
          console.log('');

          // Group by category
          const byCategory = new Map<string, typeof list>();
          for (const skill of list) {
            const cat = skill.category;
            if (!byCategory.has(cat)) {
              byCategory.set(cat, []);
            }
            byCategory.get(cat)!.push(skill);
          }

          for (const [category, categorySkills] of byCategory) {
            console.log(chalk.white.bold(`  ${category.toUpperCase()}`));
            for (const skill of categorySkills) {
              const status = skill.enabled
                ? chalk.green('enabled')
                : chalk.gray('disabled');
              console.log(`    ${chalk.cyan(skill.id.padEnd(15))} ${skill.name.padEnd(20)} [${status}]`);
            }
            console.log('');
          }

          const stats = skills.getStats();
          console.log(chalk.gray(`Total: ${stats.total} skills, ${stats.enabled} enabled, ${stats.tools} tools`));
          console.log('');
        }
      } catch (error) {
        log.error('Skills list failed', error);
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  // Enable subcommand
  cmd
    .command('enable <skillId>')
    .description('Enable a skill')
    .action(async (skillId: string) => {
      const spinner = ora(`Enabling skill "${skillId}"...`).start();

      try {
        const skills = createSkillsSystem();
        await skills.initialize();
        await skills.enableSkill(skillId);

        spinner.succeed(`Skill "${skillId}" enabled`);

        // Show tools provided by this skill
        const tools = skills.getTools().filter((t) =>
          t.definition.name.startsWith(skillId) || t.definition.name.includes(skillId)
        );

        if (tools.length > 0) {
          console.log(chalk.gray(`  Provides ${tools.length} tools`));
        }
      } catch (error) {
        spinner.fail(`Failed to enable skill "${skillId}"`);
        log.error('Skills enable failed', error);
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  // Disable subcommand
  cmd
    .command('disable <skillId>')
    .description('Disable a skill')
    .action(async (skillId: string) => {
      const spinner = ora(`Disabling skill "${skillId}"...`).start();

      try {
        const skills = createSkillsSystem();
        await skills.initialize();
        await skills.disableSkill(skillId);

        spinner.succeed(`Skill "${skillId}" disabled`);
      } catch (error) {
        spinner.fail(`Failed to disable skill "${skillId}"`);
        log.error('Skills disable failed', error);
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  // Tools subcommand
  cmd
    .command('tools')
    .description('List all tools from enabled skills')
    .option('-s, --skill <skillId>', 'Filter by skill')
    .option('--json', 'Output as JSON')
    .action(async (options: { skill?: string; json: boolean }) => {
      try {
        const skills = createSkillsSystem();
        await skills.initialize();

        // Enable all skills to show their tools
        for (const skill of skills.listSkills()) {
          try {
            await skills.enableSkill(skill.id);
          } catch {
            // Ignore enable errors
          }
        }

        let tools = skills.getTools();

        if (options.skill) {
          tools = tools.filter((t) =>
            t.definition.name.startsWith(options.skill!) ||
            t.definition.name.includes(`_${options.skill!}_`)
          );
        }

        if (options.json) {
          const toolDefs = tools.map((t) => ({
            name: t.definition.name,
            description: t.definition.description,
            parameters: t.definition.parameters,
          }));
          console.log(JSON.stringify(toolDefs, null, 2));
        } else {
          console.log('');
          console.log(chalk.cyan.bold('Available Tools'));
          console.log('');

          for (const tool of tools) {
            console.log(chalk.white.bold(`  ${tool.definition.name}`));
            console.log(chalk.gray(`    ${tool.definition.description}`));

            const params = tool.definition.parameters;
            if (params.properties && Object.keys(params.properties).length > 0) {
              const required = params.required ?? [];
              for (const [name, prop] of Object.entries(params.properties)) {
                const req = required.includes(name) ? chalk.red('*') : ' ';
                console.log(chalk.gray(`    ${req} ${name}: ${prop.type} - ${prop.description ?? ''}`));
              }
            }
            console.log('');
          }

          console.log(chalk.gray(`Total: ${tools.length} tools`));
          console.log('');
        }
      } catch (error) {
        log.error('Skills tools failed', error);
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  // Run subcommand
  cmd
    .command('run <tool>')
    .description('Run a skill tool')
    .option('-a, --args <json>', 'Tool arguments as JSON')
    .option('--cwd <dir>', 'Working directory')
    .option('--json', 'Output as JSON')
    .action(async (tool: string, options: { args?: string; cwd?: string; json: boolean }) => {
      const spinner = ora(`Running tool "${tool}"...`).start();

      try {
        const skills = createSkillsSystem({ workingDir: options.cwd });
        await skills.initialize();

        // Enable all skills
        for (const skill of skills.listSkills()) {
          try {
            await skills.enableSkill(skill.id);
          } catch {
            // Ignore enable errors
          }
        }

        // Parse arguments
        const args = options.args ? JSON.parse(options.args) : {};

        const result = await skills.executeTool(tool, args);

        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          if (result.success) {
            console.log(chalk.green('Success'));
          } else {
            console.log(chalk.red('Failed'));
          }
          console.log('');
          console.log(result.output);

          if (result.error) {
            console.log('');
            console.log(chalk.red('Error: ' + result.error));
          }
        }
      } catch (error) {
        spinner.fail(`Failed to run tool "${tool}"`);
        log.error('Skills run failed', error);
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  // Info subcommand
  cmd
    .command('info <skillId>')
    .description('Show detailed information about a skill')
    .action(async (skillId: string) => {
      try {
        const skills = createSkillsSystem();
        await skills.initialize();

        const list = skills.listSkills();
        const skill = list.find((s) => s.id === skillId);

        if (!skill) {
          console.error(chalk.red(`Skill not found: ${skillId}`));
          console.log(chalk.gray('Available skills: ' + list.map((s) => s.id).join(', ')));
          process.exit(1);
        }

        // Enable to get tools
        try {
          await skills.enableSkill(skillId);
        } catch {
          // Ignore
        }

        const tools = skills.getTools().filter((t) =>
          t.definition.name.startsWith(skill.id) ||
          t.definition.name.startsWith(`${skill.id}_`)
        );

        console.log('');
        console.log(chalk.cyan.bold(`Skill: ${skill.name}`));
        console.log('');
        console.log(chalk.gray('ID:       ') + chalk.white(skill.id));
        console.log(chalk.gray('Category: ') + chalk.white(skill.category));
        console.log(chalk.gray('Status:   ') + (skill.enabled ? chalk.green('enabled') : chalk.gray('disabled')));
        console.log('');

        if (tools.length > 0) {
          console.log(chalk.white.bold('Tools:'));
          for (const tool of tools) {
            console.log(`  ${chalk.cyan(tool.definition.name)}`);
            console.log(`    ${chalk.gray(tool.definition.description)}`);
          }
        } else {
          console.log(chalk.gray('No tools available'));
        }
        console.log('');
      } catch (error) {
        log.error('Skills info failed', error);
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  // Discover subcommand
  cmd
    .command('discover <path>')
    .description('Discover skills from a directory')
    .action(async (dirPath: string) => {
      const spinner = ora('Discovering skills...').start();

      try {
        const skills = createSkillsSystem();
        await skills.initialize();

        const discovered = await skills.discoverSkills(dirPath);

        spinner.succeed(`Discovered ${discovered.length} skills`);

        for (const manifest of discovered) {
          console.log(`  ${chalk.cyan(manifest.id)}: ${manifest.name}`);
        }
      } catch (error) {
        spinner.fail('Discovery failed');
        log.error('Skills discover failed', error);
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  return cmd;
}
