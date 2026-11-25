import { describe, expect, it } from 'bun:test';
import {
  classify,
  getProjectContext,
  listIssuesForSync,
  parseRepoFullName,
  syncIssues,
  validateProjectFields,
} from '../../../../scripts/github/ccs-backlog-sync-lib.mjs';

describe('ccs backlog sync helpers', () => {
  it('maps closed issues to Done and clears follow-up state', () => {
    const plan = classify(
      [{ name: 'bug' }, { name: 'upstream-blocked' }],
      'closed',
      new Date('2026-03-28T00:00:00Z')
    );

    expect(plan).toEqual({
      priority: 'P1',
      followUp: 'Ready',
      nextReview: null,
      status: 'Done',
    });
  });

  it('rejects malformed repository identifiers with a clear error', () => {
    expect(() => parseRepoFullName('ccs')).toThrow(
      'Invalid GITHUB_REPOSITORY value "ccs". Expected OWNER/REPO.'
    );
  });

  it('validates required project fields before syncing', () => {
    const fields = new Map([['Status', { id: 'status', options: new Map() }]]);
    expect(() => validateProjectFields(fields)).toThrow(
      'Missing required project fields: "Priority", "Follow-up", "Next review"'
    );
  });

  it('paginates project items across multiple GraphQL pages', async () => {
    const graphqlRequest = async (_query: string, variables: { itemCursor?: string | null }) => {
      if (!variables.itemCursor) {
        return {
          user: {
            projectV2: {
              id: 'project-1',
              fields: {
                nodes: [
                  {
                    id: 'status',
                    name: 'Status',
                    options: [
                      { id: 'todo', name: 'Todo' },
                      { id: 'done', name: 'Done' },
                    ],
                  },
                  {
                    id: 'priority',
                    name: 'Priority',
                    options: [
                      { id: 'p1', name: 'P1' },
                      { id: 'p2', name: 'P2' },
                      { id: 'p3', name: 'P3' },
                    ],
                  },
                  { id: 'follow', name: 'Follow-up', options: [{ id: 'ready', name: 'Ready' }] },
                  { id: 'review', name: 'Next review', options: [] },
                ],
              },
              items: {
                pageInfo: { hasNextPage: true, endCursor: 'cursor-2' },
                nodes: [
                  {
                    id: 'item-1',
                    content: {
                      __typename: 'Issue',
                      number: 1,
                      repository: { nameWithOwner: 'kaitranntt/ccs' },
                    },
                  },
                ],
              },
            },
          },
        };
      }

      return {
        user: {
          projectV2: {
            id: 'project-1',
            fields: { nodes: [] },
            items: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                {
                  id: 'item-2',
                  content: {
                    __typename: 'Issue',
                    number: 2,
                    repository: { nameWithOwner: 'kaitranntt/ccs' },
                  },
                },
              ],
            },
          },
        },
      };
    };

    const context = await getProjectContext({
      owner: 'kaitranntt',
      projectNumber: 3,
      repoFullName: 'kaitranntt/ccs',
      graphqlRequest,
    });

    expect(context.projectId).toBe('project-1');
    expect(context.itemsByNumber.get(1)).toBe('item-1');
    expect(context.itemsByNumber.get(2)).toBe('item-2');
    expect(context.statusField.id).toBe('status');
  });

  it('includes recently closed issues during scheduled reconciliation while skipping stale closures', async () => {
    const headers = new Headers();
    const githubRequest = async (path: string) => {
      if (path.includes('state=open')) {
        return { body: [{ number: 10, state: 'open', labels: [], node_id: 'node-10' }], headers };
      }

      return {
        body: [
          {
            number: 11,
            state: 'closed',
            closed_at: '2026-03-25T00:00:00Z',
            labels: [],
            node_id: 'node-11',
          },
          {
            number: 12,
            state: 'closed',
            closed_at: '2026-02-01T00:00:00Z',
            labels: [],
            node_id: 'node-12',
          },
        ],
        headers,
      };
    };

    const issues = await listIssuesForSync({
      repoOwner: 'kaitranntt',
      repoName: 'ccs',
      githubRequest,
      now: new Date('2026-03-28T00:00:00Z'),
      closedLookbackDays: 14,
    });

    expect(issues.map((issue: { number: number }) => issue.number)).toEqual([10, 11]);
  });

  it('continues syncing remaining issues after an individual failure', async () => {
    const logs: string[] = [];
    const errors: string[] = [];
    const syncedItems: number[] = [];
    const context = {
      projectId: 'project-1',
      itemsByNumber: new Map(),
      statusField: {
        id: 'status',
        options: new Map([
          ['Todo', 'todo'],
          ['Done', 'done'],
        ]),
      },
      priorityField: {
        id: 'priority',
        options: new Map([
          ['P1', 'p1'],
          ['P2', 'p2'],
          ['P3', 'p3'],
        ]),
      },
      followUpField: { id: 'follow', options: new Map([['Ready', 'ready']]) },
      nextReviewField: { id: 'review', options: new Map() },
    };
    const issues = [
      { number: 1, state: 'open', labels: [], node_id: 'node-1' },
      { number: 2, state: 'open', labels: [], node_id: 'node-2' },
      { number: 3, state: 'open', labels: [], node_id: 'node-3' },
    ];
    const graphqlRequest = async (query: string, variables: Record<string, string>) => {
      if (query.includes('addProjectV2ItemById'))
        return { addProjectV2ItemById: { item: { id: `item-${variables.contentId}` } } };
      if (variables.itemId === 'item-node-2' && variables.fieldId === 'priority')
        throw new Error('priority write failed');
      syncedItems.push(Number(variables.itemId.replace('item-node-', '')));
      return {};
    };

    await expect(
      syncIssues({
        issues,
        context,
        graphqlRequest,
        logger: {
          log: (message: string) => logs.push(message),
          error: (message: string) => errors.push(message),
        },
        now: new Date('2026-03-28T00:00:00Z'),
      })
    ).rejects.toThrow('Failed to sync 1 issue(s): #2 (priority write failed)');

    expect(logs.some((message) => message.includes('synced #1'))).toBe(true);
    expect(logs.some((message) => message.includes('synced #3'))).toBe(true);
    expect(errors).toEqual(['[X] Failed to sync #2: priority write failed']);
    expect(syncedItems).toContain(3);
  });

  it('skips untracked closed issues during scheduled reconciliation', async () => {
    const logs: string[] = [];
    const context = {
      projectId: 'project-1',
      itemsByNumber: new Map([[9, 'item-9']]),
      statusField: {
        id: 'status',
        options: new Map([
          ['Todo', 'todo'],
          ['Done', 'done'],
        ]),
      },
      priorityField: {
        id: 'priority',
        options: new Map([
          ['P1', 'p1'],
          ['P2', 'p2'],
          ['P3', 'p3'],
        ]),
      },
      followUpField: { id: 'follow', options: new Map([['Ready', 'ready']]) },
      nextReviewField: { id: 'review', options: new Map() },
    };

    await syncIssues({
      issues: [{ number: 10, state: 'closed', labels: [], node_id: 'node-10' }],
      context,
      graphqlRequest: async () => {
        throw new Error('should not attempt to mutate project state');
      },
      logger: {
        log: (message: string) => logs.push(message),
        error: () => {},
      },
      now: new Date('2026-03-28T00:00:00Z'),
    });

    expect(logs).toEqual(['skipped #10: closed issue is not currently tracked in the project']);
  });
});
