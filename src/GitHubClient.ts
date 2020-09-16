import * as logdown from 'logdown';
import axios, {AxiosInstance} from 'axios';

/** @see https://docs.github.com/en/rest/reference/pulls#get-a-pull-request */
export interface GitHubPullRequest {
  head: {
    /** The branch name */
    ref: string;
    /** The commit hash */
    sha: string;
  };
  /** The pull request number */
  number: number;
  /** The pull request title */
  title: string;
}

export interface GitHubActionResult {
  error?: string;
  pullRequestNumber: number;
  status: 'bad' | 'ok';
}

export interface GitHubProject {
  projectSlug: string;
  pullRequests: GitHubPullRequest[];
}

export class GitHubClient {
  private readonly apiClient: AxiosInstance;
  private readonly logger: logdown.Logger;

  constructor(authToken: string, userAgent: string) {
    this.apiClient = axios.create({
      baseURL: 'https://api.github.com',
      headers: {
        Authorization: `token ${authToken}`,
        'User-Agent': userAgent,
      },
    });
    this.logger = logdown('auto-approver/GitHubClient', {
      logger: console,
      markdown: false,
    });
    this.logger.state.isEnabled = true;
  }

  async approveByPullNumber(projectSlug: string, pullRequestNumber: number): Promise<GitHubActionResult> {
    const actionResult: GitHubActionResult = {pullRequestNumber, status: 'ok'};

    try {
      await this.postReview(projectSlug, pullRequestNumber);
    } catch (error) {
      this.logger.error(error);
      actionResult.status = 'bad';
      actionResult.error = error.toString();
    }
    return actionResult;
  }

  async commentOnPullRequest(
    projectSlug: string,
    pullRequestNumber: number,
    comment: string
  ): Promise<GitHubActionResult> {
    const actionResult: GitHubActionResult = {pullRequestNumber, status: 'ok'};

    try {
      await this.postComment(projectSlug, pullRequestNumber, comment);
    } catch (error) {
      this.logger.error(error);
      actionResult.status = 'bad';
      actionResult.error = error.toString();
    }
    return actionResult;
  }

  /** @see https://docs.github.com/en/rest/reference/pulls#create-a-review-for-a-pull-request */
  async postReview(projectSlug: string, pullRequestNumber: number): Promise<void> {
    const resourceUrl = `/repos/${projectSlug}/pulls/${pullRequestNumber}/reviews`;
    await this.apiClient.post(resourceUrl, {event: 'APPROVE'});
  }

  /** @see https://docs.github.com/en/rest/reference/issues#create-an-issue-comment */
  async postComment(projectSlug: string, pullRequestNumber: number, comment: string): Promise<void> {
    const resourceUrl = `/repos/${projectSlug}/issues/${pullRequestNumber}/comments`;
    await this.apiClient.post(resourceUrl, {body: comment});
  }

  /** @see https://docs.github.com/en/rest/reference/pulls#list-pull-requests */
  async getPullRequestsBySlug(projectSlug: string): Promise<GitHubPullRequest[]> {
    const resourceUrl = `/repos/${projectSlug}/pulls`;
    const params = {state: 'open'};
    const response = await this.apiClient.get<GitHubPullRequest[]>(resourceUrl, {params});
    return response.data;
  }
}
