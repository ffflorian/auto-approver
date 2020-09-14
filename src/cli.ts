#!/usr/bin/env node

import * as commander from 'commander';
import {cosmiconfigSync} from 'cosmiconfig';
import * as fs from 'fs';
import * as logdown from 'logdown';
import * as path from 'path';
import * as readline from 'readline';

import {ApproverConfig, AutoApprover} from './AutoApprover';
import {getPlural} from './util';

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
  .option('-m, --message <text>', 'comment on PRs instead of approving them')
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

if (configFileData.useComment) {
  commander.message = configFileData.useComment;
}

logger.info('Found the following repositories to check:', configFileData.projects.gitHub);
const action = commander.message ? 'comment on' : 'approve';
input.question(`ℹ️  auto-approver Which PR would you like to ${action} (enter a branch name)? `, async answer => {
  const autoApprover = new AutoApprover(configFileData);

  try {
    if (commander.message) {
      const commentResult = await autoApprover.commentByMatch(new RegExp(answer), commander.message);
      const commentedProjects = commentResult.reduce((count, project) => count + project.actionResults.length, 0);
      const pluralSingular = getPlural('request', commentedProjects);
      logger.info(`Commented "${commander.message}" on ${commentedProjects} pull ${pluralSingular}.`);
    } else {
      const approveResult = await autoApprover.approveAllByMatch(new RegExp(answer));
      const approvedProjects = approveResult.reduce((count, project) => count + project.actionResults.length, 0);
      const pluralSingular = getPlural('request', approvedProjects);
      logger.info(`Approved ${approvedProjects} pull ${pluralSingular}.`);
    }
    process.exit();
  } catch (error) {
    logger.error(error);
    process.exit(1);
  }
});
