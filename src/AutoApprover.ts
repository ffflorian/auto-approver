import * as logdown from 'logdown';
import {GitHubPullRequest, GitHubClient} from './GitHubClient';
import * as path from 'path';
import * as fs from 'fs';

import {GitLabClient, GitLabMergeRequest} from './GitLabClient';
import {getPlural} from './util';

const defaultPackageJsonPath = path.join(__dirname, 'package.json');
const packageJsonPath = fs.existsSync(defaultPackageJsonPath)
  ? defaultPackageJsonPath
  : path.join(__dirname, '../package.json');

const {bin, version: toolVersion} = require(packageJsonPath);
const toolName = Object.keys(bin)[0];

export interface ActionResult {
  error?: string;
  pullNumber: number;
  status: 'bad' | 'ok';
}

export interface ApproverConfig {
  /** The GitHub auth token */
  authToken: string;
  /** All projects to include */
  projects: {
    /** All projects hosted on GitHub in the format `user/repo` */
    gitHub?: string[];
    /** All projects hosted on GitLab in the format `user/repo` */
    gitLab?: string[];
  };
  useComment?: string;
  verbose?: boolean;
}

export interface GitHubProject {
  projectSlug: string;
  pullRequests: GitHubPullRequest[];
}

export interface GitLabProject {
  mergeRequests: GitLabMergeRequest[];
  projectSlug: string;
}

export interface ProjectResult {
  actionResults: ActionResult[];
  projectSlug: string;
}

export class AutoApprover {
  private readonly config: ApproverConfig;
  private readonly logger: logdown.Logger;
  private readonly gitHubClient: GitHubClient;
  private readonly gitLabClient: GitLabClient;

  constructor(config: ApproverConfig) {
    this.config = config;
    this.logger = logdown('auto-approver', {
      logger: console,
      markdown: false,
    });
    this.logger.state.isEnabled = true;
    this.checkConfig(this.config);

    const userAgent = `${toolName} v${toolVersion}`;
    this.gitHubClient = new GitHubClient(this.config.authToken, userAgent);
    this.gitLabClient = new GitLabClient(this.config.authToken, userAgent);
  }

  private checkConfig(config: ApproverConfig): void {
    const hasGitHubProjects = config.projects?.gitHub && config.projects.gitHub.length >= 1;
    const hasGitLabProjects = config.projects?.gitLab && config.projects.gitLab.length >= 1;

    if (!hasGitHubProjects && !hasGitLabProjects) {
      throw new Error('No projects in config file specified');
    }

    if (!config.authToken) {
      throw new Error('No authentication token in config file specified');
    }

    /* eslint-disable no-unsanitized/property */
    config.projects.gitHub ??= [];
    config.projects.gitLab ??= [];
    /* eslint-enable no-unsanitized/property */
  }

  async approveAllByMatch(regex: RegExp): Promise<ProjectResult[]> {
    const matchingProjects = await this.getMatchingProjects(regex);

    const resultPromises = matchingProjects.map(async matchingProject => {
      if ('pullRequests' in matchingProject) {
        const actionPromises = matchingProject.pullRequests.map(pullRequest =>
          this.approveByPullNumber(matchingProject.projectSlug, pullRequest.number)
        );
        const actionResults = await Promise.all(actionPromises);
        return {actionResults, projectSlug: matchingProject.projectSlug};
      }
      const actionPromises = matchingProject.mergeRequests.map(mergeRequest =>
        this.approveByPullNumber(matchingProject.projectSlug, mergeRequest.id)
      );
      const actionResults = await Promise.all(actionPromises);
      return {actionResults, projectSlug: matchingProject.projectSlug};
    });

    return Promise.all(resultPromises);
  }

  private async getMatchingProjects(regex: RegExp): Promise<Array<GitHubProject | GitLabProject>> {
    const gitHubProjectSlugs = this.config.projects.gitHub
      ?.map(projectSlug => this.gitHubClient.checkProject(projectSlug))
      .filter(Boolean) as string[];

    const gitLabProjectSlugs = this.config.projects.gitLab
      ?.map(projectSlug => this.gitHubClient.checkProject(projectSlug))
      .filter(Boolean) as string[];

    const gitHubProjectsPromises = gitHubProjectSlugs.map(async projectSlug => {
      const pullRequests = await this.gitHubClient.getPullRequestsBySlug(projectSlug);
      const matchedPulls = pullRequests.filter(pullRequest => !!pullRequest.head.ref.match(regex));
      if (matchedPulls.length) {
        const pluralSingular = getPlural('request', matchedPulls.length);
        this.logger.info(
          `Found ${matchedPulls.length} matching pull ${pluralSingular} for "${projectSlug}":`,
          matchedPulls.map(pull => pull.title)
        );
      }
      return {projectSlug, pullRequests: matchedPulls};
    });

    const gitLabProjectsPromises: Array<Promise<GitLabProject>> = gitLabProjectSlugs.map(async projectSlug => {
      const pullRequests = await this.gitLabClient.getPullRequestsBySlug(projectSlug);
      const matchedPulls = pullRequests.filter(pullRequest => !!pullRequest.source_branch.match(regex));
      this.logger.info(
        `Found matching GitLab merge requests for "${projectSlug}":`,
        matchedPulls.map(pull => pull.title)
      );
      return {mergeRequests: matchedPulls, projectSlug};
    });

    const gitHubProjects = await Promise.all(gitHubProjectsPromises);
    const gitLabProjects = await Promise.all(gitLabProjectsPromises);

    return [...gitHubProjects, ...gitLabProjects];
  }

  async commentByMatch(regex: RegExp, comment: string): Promise<ProjectResult[]> {
    const matchingProjects = await this.getMatchingProjects(regex);

    const resultPromises = matchingProjects.map(async matchingProject => {
      if ('pullRequests' in matchingProject) {
        const actionPromises = matchingProject.pullRequests.map(pullRequest =>
          this.commentOnPullRequest(matchingProject.projectSlug, pullRequest.number, comment)
        );
        const actionResults = await Promise.all(actionPromises);
        return {actionResults, projectSlug: matchingProject.projectSlug};
      }
      const actionPromises = matchingProject.mergeRequests.map(mergeRequest =>
        this.commentOnPullRequest(matchingProject.projectSlug, mergeRequest.id, comment)
      );
      const actionResults = await Promise.all(actionPromises);
      return {actionResults, projectSlug: matchingProject.projectSlug};
    });

    return Promise.all(resultPromises);
  }

  async approveByPullNumber(projectSlug: string, pullNumber: number): Promise<ActionResult> {
    const actionResult: ActionResult = {pullNumber, status: 'ok'};

    try {
      await this.gitHubClient.postReview(projectSlug, pullNumber);
    } catch (error) {
      this.logger.error(error);
      actionResult.status = 'bad';
      actionResult.error = error.toString();
    }
    return actionResult;
  }

  async commentOnPullRequest(projectSlug: string, pullNumber: number, comment: string): Promise<ActionResult> {
    const actionResult: ActionResult = {pullNumber, status: 'ok'};

    try {
      await this.gitHubClient.postComment(projectSlug, pullNumber, comment);
    } catch (error) {
      this.logger.error(error);
      actionResult.status = 'bad';
      actionResult.error = error.toString();
    }
    return actionResult;
  }
}
