import * as logdown from 'logdown';
import axios, {AxiosInstance} from 'axios';

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

  /** @see https://docs.github.com/en/rest/reference/pulls#create-a-review-for-a-pull-request */
  async postReview(projectSlug: string, pullNumber: number): Promise<void> {
    const resourceUrl = `/repos/${projectSlug}/pulls/${pullNumber}/reviews`;
    await this.apiClient.post(resourceUrl, {event: 'APPROVE'});
  }

  /** @see https://docs.github.com/en/rest/reference/issues#create-an-issue-comment */
  async postComment(projectSlug: string, pullNumber: number, comment: string): Promise<void> {
    const resourceUrl = `/repos/${projectSlug}/issues/${pullNumber}/comments`;
    await this.apiClient.post(resourceUrl, {body: comment});
  }

  /** @see https://docs.github.com/en/rest/reference/pulls#list-pull-requests */
  async getPullRequestsBySlug(projectSlug: string): Promise<GitHubPullRequest[]> {
    const resourceUrl = `/repos/${projectSlug}/pulls`;
    const params = {state: 'open'};
    const response = await this.apiClient.get<GitHubPullRequest[]>(resourceUrl, {params});
    return response.data;
  }

  checkProject(projectSlug: string): string | false {
    const gitHubUsernameRegex = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
    const gitHubProjectRegex = /^[\w-.]{0,100}$/i;
    const [userName, project] = projectSlug.trim().replace(/^\//, '').replace(/\/$/, '').split('/');
    if (!gitHubUsernameRegex.test(userName) || !gitHubProjectRegex.test(project)) {
      this.logger.warn(`Invalid GitHub project slug "${projectSlug}". Skipping.`);
      return false;
    }
    return projectSlug;
  }
}
