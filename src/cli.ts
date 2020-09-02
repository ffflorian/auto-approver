#!/usr/bin/env node

import * as commander from 'commander';
import {cosmiconfigSync} from 'cosmiconfig';
import * as fs from 'fs';
import * as logdown from 'logdown';
import * as path from 'path';
import * as readline from 'readline';

import {ApproverConfig, AutoApprover} from './AutoApprover';

const input = readline.createInterface(process.stdin, process.stdout);
const logger = logdown('auto-approver', {
  logger: console,
  markdown: false,
});
logger.state.isEnabled = true;

const defaultPackageJsonPath = path.join(__dirname, 'package.json');
const packageJsonPath = fs.existsSync(defaultPackageJsonPath)
  ? defaultPackageJsonPath
  : path.join(__dirname, '../package.json');

const {bin, description, version} = require(packageJsonPath);

commander
  .name(Object.keys(bin)[0])
  .description(description)
  .option('-m, --message <text>', 'Use a comment instead of an approval')
  .option('-c, --config <path>', 'specify a configuration file (default: .approverrc.json)')
  .version(version)
  .parse(process.argv);

const configExplorer = cosmiconfigSync('approver');
const configResult = commander.config ? configExplorer.load(commander.config) : configExplorer.search();

if (!configResult || configResult.isEmpty) {
  logger.error('No valid configuration file found.');
  commander.help();
}

const configFileData = configResult.config as ApproverConfig;

logger.info('Found the following repositories to check:', configFileData.projects.gitHub);
const action = commander.comment ? 'comment on' : 'approve';
input.question(`ℹ️  auto-approver Which PR would you like to ${action} (enter a branch name)? `, async answer => {
  const autoApprover = new AutoApprover(configFileData);

  try {
    if (commander.comment) {
      const results = await autoApprover.commentByMatch(new RegExp(answer), commander.comment);
      const approvedProjects = results.filter(result => result.actionResults.length > 0);
      logger.info(`Commented "${commander.comment}" on ${approvedProjects.length} pull requests.`);
    } else {
      const results = await autoApprover.approveAllByMatch(new RegExp(answer));
      const approvedProjects = results.filter(result => result.actionResults.length > 0);
      logger.info(`Approved ${approvedProjects.length} pull requests.`);
    }
    process.exit();
  } catch (error) {
    logger.error(error);
    process.exit(1);
  }
});
