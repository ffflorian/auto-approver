import * as logdown from 'logdown';
import axios, {AxiosInstance} from 'axios';

/** @see https://docs.gitlab.com/ee/api/merge_requests.html#get-single-mr */
export interface GitLabMergeRequest {
  /** The pull request number */
  id: number;
  /** The commit hash */
  sha: string;
  /** The branch name */
  source_branch: string;
  /** The merge request title */
  title: string;
}

export interface GitLabActionResult {
  error?: string;
  mergeRequestId: number;
  status: 'bad' | 'ok';
}

export interface GitLabProject {
  mergeRequests: GitLabMergeRequest[];
  projectSlug: string;
}

export class GitLabClient {
  private readonly apiClient: AxiosInstance;
  private readonly logger: logdown.Logger;

  constructor(accessToken: string, userAgent: string) {
    this.apiClient = axios.create({
      baseURL: 'https://api.github.com',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': userAgent,
      },
    });
    this.logger = logdown('auto-approver/GitLabClient', {
      logger: console,
      markdown: false,
    });
    this.logger.state.isEnabled = true;
  }

  async approveByMergeRequestId(projectSlug: string, mergeRequestId: number): Promise<GitLabActionResult> {
    const actionResult: GitLabActionResult = {mergeRequestId, status: 'ok'};

    try {
      await this.postReview(projectSlug, mergeRequestId);
    } catch (error) {
      this.logger.error(error);
      actionResult.status = 'bad';
      actionResult.error = error.toString();
    }
    return actionResult;
  }

  async commentOnPullRequest(
    projectSlug: string,
    mergeRequestId: number,
    comment: string
  ): Promise<GitLabActionResult> {
    const actionResult: GitLabActionResult = {mergeRequestId, status: 'ok'};

    try {
      await this.postComment(projectSlug, mergeRequestId, comment);
    } catch (error) {
      this.logger.error(error);
      actionResult.status = 'bad';
      actionResult.error = error.toString();
    }
    return actionResult;
  }

  /** @see https://docs.gitlab.com/ee/api/merge_request_approvals.html#approve-merge-request */
  async postReview(projectId: string, mergeRequestId: number, approvalPassword?: string): Promise<void> {
    const resourceUrl = `/projects/${projectId}/merge_requests/${mergeRequestId}/approve`;
    const config = approvalPassword ? {approvalPassword} : undefined;
    await this.apiClient.post(resourceUrl, config);
  }

  /** @see https://docs.gitlab.com/ee/api/notes.html#create-new-merge-request-note */
  async postComment(projectId: string, mergeRequestId: number, comment: string): Promise<void> {
    const resourceUrl = `/projects/${projectId}/merge_requests/${mergeRequestId}/notes`;
    await this.apiClient.post(resourceUrl, {body: comment});
  }

  async getPullRequestsBySlug(projectId: string): Promise<GitLabMergeRequest[]> {
    const resourceUrl = `/projects/${projectId}/merge_requests`;
    const params = {state: 'opened'};
    const response = await this.apiClient.get<GitLabMergeRequest[]>(resourceUrl, {params});
    return response.data;
  }
}
