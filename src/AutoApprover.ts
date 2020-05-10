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

export interface ApproveResult {
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

  approveAllByMatch(match: RegExp): Promise<{approveResults: ApproveResult[]; projectSlug: string}[]> {
    const validProjects = this.config.projects.gitHub
      .map(projectSlug => this.checkProject(projectSlug))
      .filter(Boolean) as string[];

    return Promise.all(
      validProjects.map(async projectSlug => {
        const pullRequests = await this.getPullRequestsBySlug(projectSlug);
        const matchedPulls = pullRequests.filter(pullRequest => !!pullRequest.head.ref.match(match));
        this.logger.info(
          `Found matching pull requests for "${projectSlug}":`,
          matchedPulls.map(pull => pull.title)
        );
        const approveResults = await Promise.all(
          matchedPulls.map(async pull => this.approveByPullNumber(projectSlug, pull.number))
        );
        return {approveResults, projectSlug};
      })
    );
  }

  async approveByPullNumber(projectSlug: string, pullNumber: number): Promise<ApproveResult> {
    const approveResult: ApproveResult = {pullNumber, status: 'ok'};
    try {
      await this.approvePullRequest(projectSlug, pullNumber);
    } catch (error) {
      this.logger.error(error);
      approveResult.status = 'bad';
      approveResult.error = error.toString();
    }
    return approveResult;
  }

  private async approvePullRequest(projectSlug: string, pullNumber: number): Promise<void> {
    const resourceUrl = `/repos/${projectSlug}/pulls/${pullNumber}/reviews`;

    await this.apiClient.post(resourceUrl, {
      event: 'APPROVE',
    });
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

    const response = await this.apiClient.get<GitHubPullRequest[]>(resourceUrl, {
      params: {
        state: 'open',
      },
    });

    return response.data;
  }
}
