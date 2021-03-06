import testAction from 'helpers/vuex_action_helper';
import {
  mockListsWithModel,
  mockLists,
  mockIssue,
  mockIssueWithModel,
  mockIssue2WithModel,
  rawIssue,
  mockIssues,
  labels,
} from '../mock_data';
import actions, { gqlClient } from '~/boards/stores/actions';
import * as types from '~/boards/stores/mutation_types';
import { inactiveId } from '~/boards/constants';
import issueMoveListMutation from '~/boards/queries/issue_move_list.mutation.graphql';
import { fullBoardId, formatListIssues, formatBoardLists } from '~/boards/boards_util';

const expectNotImplemented = action => {
  it('is not implemented', () => {
    expect(action).toThrow(new Error('Not implemented!'));
  });
};

// We need this helper to make sure projectPath is including
// subgroups when the movIssue action is called.
const getProjectPath = path => path.split('#')[0];

describe('setInitialBoardData', () => {
  it('sets data object', () => {
    const mockData = {
      foo: 'bar',
      bar: 'baz',
    };

    return testAction(
      actions.setInitialBoardData,
      mockData,
      {},
      [{ type: types.SET_INITIAL_BOARD_DATA, payload: mockData }],
      [],
    );
  });
});

describe('setFilters', () => {
  it('should commit mutation SET_FILTERS', done => {
    const state = {
      filters: {},
    };

    const filters = { labelName: 'label' };

    testAction(
      actions.setFilters,
      filters,
      state,
      [{ type: types.SET_FILTERS, payload: filters }],
      [],
      done,
    );
  });
});

describe('setActiveId', () => {
  it('should commit mutation SET_ACTIVE_ID', done => {
    const state = {
      activeId: inactiveId,
    };

    testAction(
      actions.setActiveId,
      { id: 1, sidebarType: 'something' },
      state,
      [{ type: types.SET_ACTIVE_ID, payload: { id: 1, sidebarType: 'something' } }],
      [],
      done,
    );
  });
});

describe('fetchLists', () => {
  const state = {
    endpoints: {
      fullPath: 'gitlab-org',
      boardId: 1,
    },
    filterParams: {},
    boardType: 'group',
  };

  let queryResponse = {
    data: {
      group: {
        board: {
          hideBacklogList: true,
          lists: {
            nodes: [mockLists[1]],
          },
        },
      },
    },
  };

  const formattedLists = formatBoardLists(queryResponse.data.group.board.lists);

  it('should commit mutations RECEIVE_BOARD_LISTS_SUCCESS on success', done => {
    jest.spyOn(gqlClient, 'query').mockResolvedValue(queryResponse);

    testAction(
      actions.fetchLists,
      {},
      state,
      [
        {
          type: types.RECEIVE_BOARD_LISTS_SUCCESS,
          payload: formattedLists,
        },
      ],
      [{ type: 'generateDefaultLists' }],
      done,
    );
  });

  it('dispatch createList action when backlog list does not exist and is not hidden', done => {
    queryResponse = {
      data: {
        group: {
          board: {
            hideBacklogList: false,
            lists: {
              nodes: [mockLists[1]],
            },
          },
        },
      },
    };
    jest.spyOn(gqlClient, 'query').mockResolvedValue(queryResponse);

    testAction(
      actions.fetchLists,
      {},
      state,
      [
        {
          type: types.RECEIVE_BOARD_LISTS_SUCCESS,
          payload: formattedLists,
        },
      ],
      [{ type: 'createList', payload: { backlog: true } }, { type: 'generateDefaultLists' }],
      done,
    );
  });
});

describe('generateDefaultLists', () => {
  let store;
  beforeEach(() => {
    const state = {
      endpoints: { fullPath: 'gitlab-org', boardId: '1' },
      boardType: 'group',
      disabled: false,
      boardLists: [{ type: 'backlog' }, { type: 'closed' }],
    };

    store = {
      commit: jest.fn(),
      dispatch: jest.fn(() => Promise.resolve()),
      state,
    };
  });

  it('should dispatch fetchLabels', () => {
    return actions.generateDefaultLists(store).then(() => {
      expect(store.dispatch.mock.calls[0]).toEqual(['fetchLabels', 'to do']);
      expect(store.dispatch.mock.calls[1]).toEqual(['fetchLabels', 'doing']);
    });
  });
});

describe('createList', () => {
  it('should dispatch addList action when creating backlog list', done => {
    const backlogList = {
      id: 'gid://gitlab/List/1',
      listType: 'backlog',
      title: 'Open',
      position: 0,
    };

    jest.spyOn(gqlClient, 'mutate').mockReturnValue(
      Promise.resolve({
        data: {
          boardListCreate: {
            list: backlogList,
            errors: [],
          },
        },
      }),
    );

    const state = {
      endpoints: { fullPath: 'gitlab-org', boardId: '1' },
      boardType: 'group',
      disabled: false,
      boardLists: [{ type: 'closed' }],
    };

    testAction(
      actions.createList,
      { backlog: true },
      state,
      [],
      [{ type: 'addList', payload: backlogList }],
      done,
    );
  });

  it('should commit CREATE_LIST_FAILURE mutation when API returns an error', done => {
    jest.spyOn(gqlClient, 'mutate').mockReturnValue(
      Promise.resolve({
        data: {
          boardListCreate: {
            list: {},
            errors: [{ foo: 'bar' }],
          },
        },
      }),
    );

    const state = {
      endpoints: { fullPath: 'gitlab-org', boardId: '1' },
      boardType: 'group',
      disabled: false,
      boardLists: [{ type: 'closed' }],
    };

    testAction(
      actions.createList,
      { backlog: true },
      state,
      [{ type: types.CREATE_LIST_FAILURE }],
      [],
      done,
    );
  });
});

describe('moveList', () => {
  it('should commit MOVE_LIST mutation and dispatch updateList action', done => {
    const initialBoardListsState = {
      'gid://gitlab/List/1': mockListsWithModel[0],
      'gid://gitlab/List/2': mockListsWithModel[1],
    };

    const state = {
      endpoints: { fullPath: 'gitlab-org', boardId: '1' },
      boardType: 'group',
      disabled: false,
      boardLists: initialBoardListsState,
    };

    testAction(
      actions.moveList,
      {
        listId: 'gid://gitlab/List/1',
        replacedListId: 'gid://gitlab/List/2',
        newIndex: 1,
        adjustmentValue: 1,
      },
      state,
      [
        {
          type: types.MOVE_LIST,
          payload: { movedList: mockListsWithModel[0], listAtNewIndex: mockListsWithModel[1] },
        },
      ],
      [
        {
          type: 'updateList',
          payload: {
            listId: 'gid://gitlab/List/1',
            position: 0,
            backupList: initialBoardListsState,
          },
        },
      ],
      done,
    );
  });
});

describe('updateList', () => {
  it('should commit UPDATE_LIST_FAILURE mutation when API returns an error', done => {
    jest.spyOn(gqlClient, 'mutate').mockResolvedValue({
      data: {
        updateBoardList: {
          list: {},
          errors: [{ foo: 'bar' }],
        },
      },
    });

    const state = {
      endpoints: { fullPath: 'gitlab-org', boardId: '1' },
      boardType: 'group',
      disabled: false,
      boardLists: [{ type: 'closed' }],
    };

    testAction(
      actions.updateList,
      { listId: 'gid://gitlab/List/1', position: 1 },
      state,
      [{ type: types.UPDATE_LIST_FAILURE }],
      [],
      done,
    );
  });
});

describe('deleteList', () => {
  expectNotImplemented(actions.deleteList);
});

describe('fetchIssuesForList', () => {
  const listId = mockLists[0].id;

  const state = {
    endpoints: {
      fullPath: 'gitlab-org',
      boardId: 1,
    },
    filterParams: {},
    boardType: 'group',
  };

  const mockIssuesNodes = mockIssues.map(issue => ({ node: issue }));

  const pageInfo = {
    endCursor: '',
    hasNextPage: false,
  };

  const queryResponse = {
    data: {
      group: {
        board: {
          lists: {
            nodes: [
              {
                id: listId,
                issues: {
                  edges: mockIssuesNodes,
                  pageInfo,
                },
              },
            ],
          },
        },
      },
    },
  };

  const formattedIssues = formatListIssues(queryResponse.data.group.board.lists);

  const listPageInfo = {
    [listId]: pageInfo,
  };

  it('should commit mutations REQUEST_ISSUES_FOR_LIST and RECEIVE_ISSUES_FOR_LIST_SUCCESS on success', done => {
    jest.spyOn(gqlClient, 'query').mockResolvedValue(queryResponse);

    testAction(
      actions.fetchIssuesForList,
      { listId },
      state,
      [
        {
          type: types.REQUEST_ISSUES_FOR_LIST,
          payload: { listId, fetchNext: false },
        },
        {
          type: types.RECEIVE_ISSUES_FOR_LIST_SUCCESS,
          payload: { listIssues: formattedIssues, listPageInfo, listId },
        },
      ],
      [],
      done,
    );
  });

  it('should commit mutations REQUEST_ISSUES_FOR_LIST and RECEIVE_ISSUES_FOR_LIST_FAILURE on failure', done => {
    jest.spyOn(gqlClient, 'query').mockResolvedValue(Promise.reject());

    testAction(
      actions.fetchIssuesForList,
      { listId },
      state,
      [
        {
          type: types.REQUEST_ISSUES_FOR_LIST,
          payload: { listId, fetchNext: false },
        },
        { type: types.RECEIVE_ISSUES_FOR_LIST_FAILURE, payload: listId },
      ],
      [],
      done,
    );
  });
});

describe('resetIssues', () => {
  it('commits RESET_ISSUES mutation', () => {
    return testAction(actions.resetIssues, {}, {}, [{ type: types.RESET_ISSUES }], []);
  });
});

describe('moveIssue', () => {
  const listIssues = {
    'gid://gitlab/List/1': [436, 437],
    'gid://gitlab/List/2': [],
  };

  const issues = {
    '436': mockIssueWithModel,
    '437': mockIssue2WithModel,
  };

  const state = {
    endpoints: { fullPath: 'gitlab-org', boardId: '1' },
    boardType: 'group',
    disabled: false,
    boardLists: mockListsWithModel,
    issuesByListId: listIssues,
    issues,
  };

  it('should commit MOVE_ISSUE mutation and MOVE_ISSUE_SUCCESS mutation when successful', done => {
    jest.spyOn(gqlClient, 'mutate').mockResolvedValue({
      data: {
        issueMoveList: {
          issue: rawIssue,
          errors: [],
        },
      },
    });

    testAction(
      actions.moveIssue,
      {
        issueId: '436',
        issueIid: mockIssue.iid,
        issuePath: mockIssue.referencePath,
        fromListId: 'gid://gitlab/List/1',
        toListId: 'gid://gitlab/List/2',
      },
      state,
      [
        {
          type: types.MOVE_ISSUE,
          payload: {
            originalIssue: mockIssueWithModel,
            fromListId: 'gid://gitlab/List/1',
            toListId: 'gid://gitlab/List/2',
          },
        },
        {
          type: types.MOVE_ISSUE_SUCCESS,
          payload: { issue: rawIssue },
        },
      ],
      [],
      done,
    );
  });

  it('calls mutate with the correct variables', () => {
    const mutationVariables = {
      mutation: issueMoveListMutation,
      variables: {
        projectPath: getProjectPath(mockIssue.referencePath),
        boardId: fullBoardId(state.endpoints.boardId),
        iid: mockIssue.iid,
        fromListId: 1,
        toListId: 2,
        moveBeforeId: undefined,
        moveAfterId: undefined,
      },
    };
    jest.spyOn(gqlClient, 'mutate').mockResolvedValue({
      data: {
        issueMoveList: {
          issue: rawIssue,
          errors: [],
        },
      },
    });

    actions.moveIssue(
      { state, commit: () => {} },
      {
        issueId: mockIssue.id,
        issueIid: mockIssue.iid,
        issuePath: mockIssue.referencePath,
        fromListId: 'gid://gitlab/List/1',
        toListId: 'gid://gitlab/List/2',
      },
    );

    expect(gqlClient.mutate).toHaveBeenCalledWith(mutationVariables);
  });

  it('should commit MOVE_ISSUE mutation and MOVE_ISSUE_FAILURE mutation when unsuccessful', done => {
    jest.spyOn(gqlClient, 'mutate').mockResolvedValue({
      data: {
        issueMoveList: {
          issue: {},
          errors: [{ foo: 'bar' }],
        },
      },
    });

    testAction(
      actions.moveIssue,
      {
        issueId: '436',
        issueIid: mockIssue.iid,
        issuePath: mockIssue.referencePath,
        fromListId: 'gid://gitlab/List/1',
        toListId: 'gid://gitlab/List/2',
      },
      state,
      [
        {
          type: types.MOVE_ISSUE,
          payload: {
            originalIssue: mockIssueWithModel,
            fromListId: 'gid://gitlab/List/1',
            toListId: 'gid://gitlab/List/2',
          },
        },
        {
          type: types.MOVE_ISSUE_FAILURE,
          payload: {
            originalIssue: mockIssueWithModel,
            fromListId: 'gid://gitlab/List/1',
            toListId: 'gid://gitlab/List/2',
            originalIndex: 0,
          },
        },
      ],
      [],
      done,
    );
  });
});

describe('createNewIssue', () => {
  expectNotImplemented(actions.createNewIssue);
});

describe('addListIssue', () => {
  it('should commit UPDATE_LIST_FAILURE mutation when API returns an error', done => {
    const payload = {
      list: mockLists[0],
      issue: mockIssue,
      position: 0,
    };

    testAction(
      actions.addListIssue,
      payload,
      {},
      [{ type: types.ADD_ISSUE_TO_LIST, payload }],
      [],
      done,
    );
  });
});

describe('addListIssueFailure', () => {
  it('should commit UPDATE_LIST_FAILURE mutation when API returns an error', done => {
    const payload = {
      list: mockLists[0],
      issue: mockIssue,
    };

    testAction(
      actions.addListIssueFailure,
      payload,
      {},
      [{ type: types.ADD_ISSUE_TO_LIST_FAILURE, payload }],
      [],
      done,
    );
  });
});

describe('setActiveIssueLabels', () => {
  const state = { issues: { [mockIssue.id]: mockIssue } };
  const getters = { getActiveIssue: mockIssue };
  const testLabelIds = labels.map(label => label.id);
  const input = {
    addLabelIds: testLabelIds,
    removeLabelIds: [],
    projectPath: 'h/b',
  };

  it('should assign labels on success', done => {
    jest
      .spyOn(gqlClient, 'mutate')
      .mockResolvedValue({ data: { updateIssue: { issue: { labels: { nodes: labels } } } } });

    const payload = {
      issueId: getters.getActiveIssue.id,
      prop: 'labels',
      value: labels,
    };

    testAction(
      actions.setActiveIssueLabels,
      input,
      { ...state, ...getters },
      [
        {
          type: types.UPDATE_ISSUE_BY_ID,
          payload,
        },
      ],
      [],
      done,
    );
  });

  it('throws error if fails', async () => {
    jest
      .spyOn(gqlClient, 'mutate')
      .mockResolvedValue({ data: { updateIssue: { errors: ['failed mutation'] } } });

    await expect(actions.setActiveIssueLabels({ getters }, input)).rejects.toThrow(Error);
  });
});

describe('fetchBacklog', () => {
  expectNotImplemented(actions.fetchBacklog);
});

describe('bulkUpdateIssues', () => {
  expectNotImplemented(actions.bulkUpdateIssues);
});

describe('fetchIssue', () => {
  expectNotImplemented(actions.fetchIssue);
});

describe('toggleIssueSubscription', () => {
  expectNotImplemented(actions.toggleIssueSubscription);
});

describe('showPage', () => {
  expectNotImplemented(actions.showPage);
});

describe('toggleEmptyState', () => {
  expectNotImplemented(actions.toggleEmptyState);
});
