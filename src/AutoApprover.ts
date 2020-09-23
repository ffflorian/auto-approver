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
  status: 'bad' | 'good';
}

export interface ApproverConfig {
  /** The GitHub auth token */
  authToken: string;
  /** Don't send any data */
  dryRun?: boolean;
  /** All projects to include */
  projects: {
    /** All projects hosted on GitHub in the format `user/repo` */
    gitHub: string[];
  };
  /** Post a comment on the PRs instead of approving them */
  useComment?: string;
  /**
   * Currently not in use
   * @deprecated
   */
  verbose?: boolean;
}

export interface Repository {
  pullRequests: GitHubPullRequest[];
  repositorySlug: string;
}

export interface RepositoryResult {
  actionResults: ActionResult[];
  repositorySlug: string;
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
    this.logger.state.isEnabled = true;
    this.apiClient = axios.create({
      baseURL: 'https://api.github.com',
      headers: {
        Authorization: `token ${this.config.authToken}`,
        'User-Agent': `${toolName} v${toolVersion}`,
      },
    });
    this.checkConfig(this.config);
  }

  private checkConfig(config: ApproverConfig): void {
    if (!config.projects?.gitHub || config.projects.gitHub.length < 1) {
      throw new Error('No projects in config file specified');
    }

    if (!config.authToken) {
      throw new Error('No authentication token in config file specified');
    }
  }

  private checkRepository(repositorySlug: string): string | false {
    const gitHubUsernameRegex = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
    const gitHubRepositoryRegex = /^[\w-.]{0,100}$/i;
    const [userName, repositoryName] = repositorySlug.trim().replace(/^\//, '').replace(/\/$/, '').split('/');
    if (!gitHubUsernameRegex.test(userName) || !gitHubRepositoryRegex.test(repositoryName)) {
      this.logger.warn(`Invalid GitHub repository slug "${repositorySlug}". Skipping.`);
      return false;
    }
    return repositorySlug;
  }

  async approveByMatch(regex: RegExp, repositories?: Repository[]): Promise<RepositoryResult[]> {
    const allRepositories = repositories || (await this.getRepositoriesWithOpenPullRequests());
    const matchingRepositories = this.getMatchingRepositories(allRepositories, regex);

    const resultPromises = matchingRepositories.map(async ({pullRequests, repositorySlug}) => {
      const actionPromises = pullRequests.map(pullRequest =>
        this.approveByPullNumber(repositorySlug, pullRequest.number)
      );
      const actionResults = await Promise.all(actionPromises);
      return {actionResults, repositorySlug};
    });

    return Promise.all(resultPromises);
  }

  private getMatchingRepositories(repositories: Repository[], regex: RegExp): Repository[] {
    return repositories.filter(repository => {
      const matchingRepositories = repository.pullRequests.filter(pullRequest => !!pullRequest.head.ref.match(regex));
      return !!matchingRepositories.length;
    });
  }

  async commentByMatch(regex: RegExp, comment: string, repositories?: Repository[]): Promise<RepositoryResult[]> {
    const allRepositories = repositories || (await this.getRepositoriesWithOpenPullRequests());
    const matchingRepositories = this.getMatchingRepositories(allRepositories, regex);

    const resultPromises = matchingRepositories.map(async ({pullRequests, repositorySlug}) => {
      const actionPromises = pullRequests.map(pullRequest =>
        this.commentOnPullRequest(repositorySlug, pullRequest.number, comment)
      );
      const actionResults = await Promise.all(actionPromises);
      return {actionResults, repositorySlug};
    });

    return Promise.all(resultPromises);
  }

  async approveByPullNumber(repositorySlug: string, pullNumber: number): Promise<ActionResult> {
    const actionResult: ActionResult = {pullNumber, status: 'good'};

    try {
      if (!this.config.dryRun) {
        await this.postReview(repositorySlug, pullNumber);
      }
    } catch (error) {
      this.logger.error(error);
      actionResult.status = 'bad';
      actionResult.error = error.toString();
    }
    return actionResult;
  }

  async commentOnPullRequest(repositorySlug: string, pullNumber: number, comment: string): Promise<ActionResult> {
    const actionResult: ActionResult = {pullNumber, status: 'good'};

    try {
      if (!this.config.dryRun) {
        await this.postComment(repositorySlug, pullNumber, comment);
      }
    } catch (error) {
      this.logger.error(error);
      actionResult.status = 'bad';
      actionResult.error = error.toString();
    }
    return actionResult;
  }

  async getAllRepositories(): Promise<Repository[]> {
    const repositorySlugs = this.config.projects.gitHub
      .map(repositorySlug => this.checkRepository(repositorySlug))
      .filter(Boolean) as string[];

    const repositoriesPromises = repositorySlugs.map(async repositorySlug => {
      const pullRequests = await this.getPullRequestsBySlug(repositorySlug);
      return {pullRequests, repositorySlug};
    });

    return Promise.all(repositoriesPromises);
  }

  async getRepositoriesWithOpenPullRequests(): Promise<Repository[]> {
    const allRepositories = await this.getAllRepositories();
    return allRepositories.filter(repository => !!repository.pullRequests.length);
  }

  /** @see https://docs.github.com/en/rest/reference/pulls#create-a-review-for-a-pull-request */
  private async postReview(repositorySlug: string, pullNumber: number): Promise<void> {
    const resourceUrl = `/repos/${repositorySlug}/pulls/${pullNumber}/reviews`;
    await this.apiClient.post(resourceUrl, {event: 'APPROVE'});
  }

  /** @see https://docs.github.com/en/rest/reference/issues#create-an-issue-comment */
  private async postComment(repositorySlug: string, pullNumber: number, comment: string): Promise<void> {
    const resourceUrl = `/repos/${repositorySlug}/issues/${pullNumber}/comments`;
    await this.apiClient.post(resourceUrl, {body: comment});
  }

  private async getPullRequestsBySlug(repositorySlug: string): Promise<GitHubPullRequest[]> {
    const resourceUrl = `/repos/${repositorySlug}/pulls`;
    const params = {state: 'open'};
    const response = await this.apiClient.get<GitHubPullRequest[]>(resourceUrl, {params});
    return response.data;
  }
}
