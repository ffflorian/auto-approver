#!/usr/bin/env node

import * as commander from 'commander';
import {cosmiconfigSync} from 'cosmiconfig';
import * as fs from 'fs';
import * as logdown from 'logdown';
import * as path from 'path';
import * as readline from 'readline';

import {ApproverConfig, AutoApprover, Repository} from './AutoApprover';
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

const configFileData: ApproverConfig = {
  ...configResult.config,
  ...(commander.message && {useComment: commander.message}),
};

async function runAction(
  autoApprover: AutoApprover,
  repositories: Repository[],
  pullRequestSlug: string
): Promise<void> {
  if (configFileData.useComment) {
    const commentResult = await autoApprover.commentByMatch(
      new RegExp(pullRequestSlug),
      configFileData.useComment,
      repositories
    );
    const commentedRepositories = commentResult.reduce(
      (count, repository) => count + repository.actionResults.length,
      0
    );
    const pluralSingular = getPlural('request', commentedRepositories);
    logger.info(`Commented "${configFileData.useComment}" on ${commentedRepositories} pull ${pluralSingular}.`);
  } else {
    const approveResult = await autoApprover.approveByMatch(new RegExp(pullRequestSlug), repositories);
    const approvedRepositories = approveResult.reduce(
      (count, repository) => count + repository.actionResults.length,
      0
    );
    const pluralSingular = getPlural('request', approvedRepositories);
    logger.info(`Approved ${approvedRepositories} pull ${pluralSingular}.`);
  }
}

function askQuestion(question: string): Promise<string> {
  return new Promise(resolve => {
    input.question(question, answer => resolve(answer));
  });
}

async function askAction(autoApprover: AutoApprover, repositories: Repository[], doAction: string): Promise<void> {
  const answer = await askQuestion(`ℹ️  auto-approver Which PR would you like to ${doAction} (enter a branch name)? `);
  await runAction(autoApprover, repositories, answer);
  await actionLoop(autoApprover, repositories, doAction);
}

async function actionLoop(autoApprover: AutoApprover, repositories: Repository[], doAction: string): Promise<void> {
  const answer = await askQuestion(`ℹ️  auto-approver Would you like to ${doAction} another PR (Y/n)? `);
  if (!/n(o)?$/i.test(answer)) {
    await askAction(autoApprover, repositories, doAction);
  }
}

void (async () => {
  try {
    const autoApprover = new AutoApprover(configFileData);
    logger.info('Loading all pull requests ...');
    const allRepositories = await autoApprover.getRepositoriesWithOpenPullRequests();

    if (!!allRepositories.length) {
      const repositories = allRepositories.map(repository => {
        const prText = getPlural('PR', repository.pullRequests.length);
        return `${repository.repositorySlug} (${repository.pullRequests.length} open ${prText})`;
      });

      logger.info('Found the following repositories to check:', repositories);

      const doAction = configFileData.useComment ? 'comment on' : 'approve';
      await askAction(autoApprover, allRepositories, doAction);
    } else {
      logger.info('Could not find any repositories with open pull requests.');
    }

    process.exit();
  } catch (error) {
    logger.error(error);
    process.exit(1);
  }
})();
