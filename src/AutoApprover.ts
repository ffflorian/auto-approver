import axios, {AxiosInstance} from 'axios';
import * as fs from 'fs';
import * as logdown from 'logdown';
import * as path from 'path';

const defaultPackageJsonPath = path.join(__dirname, 'package.json');
const packageJsonPath = fs.existsSync(defaultPackageJsonPath)
  ? defaultPackageJsonPath
  : path.join(__dirname, '../package.json');

const {bin, version: toolVersion} = require(packageJsonPath);
const toolName = Object.keys(bin)[0];

interface GitHubPullRequest {
  head: {
    ref: string;
    sha: string;
  };
  number: number;
  title: string;
}

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
    gitHub: string[];
  };
  verbose?: boolean;
}

export interface Project {
  projectSlug: string;
  pullRequests: GitHubPullRequest[];
}

export interface ProjectResult {
  actionResults: ActionResult[];
  projectSlug: string;
}

export class AutoApprover {
  private readonly apiClient: AxiosInstance;
  private readonly config: ApproverConfig;
  private readonly logger: logdown.Logger;

  constructor(config: ApproverConfig) {
    this.config = config;
    this.logger = logdown('auto-approver', {
      logger: console,
      markdown: false,
    });
    this.logger.state.isEnabled = true; //!!this.config.verbose;
    this.apiClient = axios.create({
      baseURL: 'https://api.github.com',
      headers: {
        Authorization: `token ${this.config.authToken}`,
        'User-Agent': `${toolName} v${toolVersion}`,
      },
    });
    this.config.projects.gitHub.forEach(projectSlug => this.checkProject(projectSlug));
  }

  async approveAllByMatch(regex: RegExp): Promise<ProjectResult[]> {
    const pullRequests = await this.getMatchingProjects(regex);

    return Promise.all(
      pullRequests.map(async ({pullRequests, projectSlug}) => {
        const actionResults = await Promise.all(
          pullRequests.map(pullRequest => this.approveByPullNumber(projectSlug, pullRequest.number))
        );
        return {actionResults, projectSlug};
      })
    );
  }

  private getMatchingProjects(regex: RegExp): Promise<Project[]> {
    const projectSlugs = this.config.projects.gitHub
      .map(projectSlug => this.checkProject(projectSlug))
      .filter(Boolean) as string[];

    return Promise.all(
      projectSlugs.map(async projectSlug => {
        const pullRequests = await this.getPullRequestsBySlug(projectSlug);
        const matchedPulls = pullRequests.filter(pullRequest => !!pullRequest.head.ref.match(regex));
        this.logger.info(
          `Found matching pull requests for "${projectSlug}":`,
          matchedPulls.map(pull => pull.title)
        );
        return {projectSlug, pullRequests: matchedPulls};
      })
    );
  }

  async commentByMatch(regex: RegExp, comment: string): Promise<ProjectResult[]> {
    const pullRequests = await this.getMatchingProjects(regex);
    return Promise.all(
      pullRequests.map(async ({pullRequests, projectSlug}) => {
        const actionResults = await Promise.all(
          pullRequests.map(pullRequest => this.commentOnPullRequest(projectSlug, pullRequest.number, comment))
        );
        return {actionResults, projectSlug};
      })
    );
  }

  async approveByPullNumber(projectSlug: string, pullNumber: number): Promise<ActionResult> {
    const actionResult: ActionResult = {pullNumber, status: 'ok'};

    try {
      await this.postReview(projectSlug, pullNumber);
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
      await this.postComment(projectSlug, pullNumber, comment);
    } catch (error) {
      this.logger.error(error);
      actionResult.status = 'bad';
      actionResult.error = error.toString();
    }
    return actionResult;
  }

  /** @see https://docs.github.com/en/rest/reference/pulls#create-a-review-for-a-pull-request */
  private async postReview(projectSlug: string, pullNumber: number): Promise<void> {
    const resourceUrl = `/repos/${projectSlug}/pulls/${pullNumber}/reviews`;
    await this.apiClient.post(resourceUrl, {event: 'APPROVE'});
  }

  /** @see https://docs.github.com/en/rest/reference/issues#create-an-issue-comment */
  private async postComment(projectSlug: string, pullNumber: number, comment: string): Promise<void> {
    const resourceUrl = `/repos/${projectSlug}/issues/${pullNumber}/comments`;
    await this.apiClient.post(resourceUrl, {body: comment});
  }

  private checkProject(projectSlug: string): string | false {
    const gitHubUsernameRegex = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
    const gitHubProjectRegex = /^[\w-.]{0,100}$/i;
    const [userName, project] = projectSlug.trim().replace(/^\//, '').replace(/\/$/, '').split('/');
    if (!gitHubUsernameRegex.test(userName) || !gitHubProjectRegex.test(project)) {
      this.logger.warn(`Invalid GitHub project slug "${projectSlug}". Skipping.`);
      return false;
    }
    return projectSlug;
  }

  private async getPullRequestsBySlug(projectSlug: string): Promise<GitHubPullRequest[]> {
    const resourceUrl = `/repos/${projectSlug}/pulls`;
    const params = {state: 'open'};
    const response = await this.apiClient.get<GitHubPullRequest[]>(resourceUrl, {params});
    return response.data;
  }
}
