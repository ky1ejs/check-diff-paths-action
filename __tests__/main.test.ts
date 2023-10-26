/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * These should be run as if the action was called from a workflow.
 * Specifically, the inputs listed in `action.yml` shouldnp be set as environment
 * variables following the pattern `INPUT_<INPUT_NAME>`.
 */

import * as core from '@actions/core'
import * as github from '@actions/github'
import * as main from '../src/main'

// Mock the GitHub Actions core library
const getInputMock = jest.spyOn(core, 'getInput')
const setOutputMock = jest.spyOn(core, 'setOutput')

// Shallow clone original @actions/github context
const originalContext = { ...github.context }

// Mock the action's main function
const runMock = jest.spyOn(main, 'run')

describe('action', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Mock github context
    jest.spyOn(github.context, 'repo', 'get').mockImplementation(() => {
      return {
        owner: 'some-owner',
        repo: 'some-repo'
      }
    })

    github.context.ref = 'refs/heads/some-ref'
    github.context.sha = '1234567890123456789012345678901234567890'
    github.context.payload.pull_request = {
      number: 1
    }
    github.context.payload.repository = {
      name: 'some-repo',
      owner: {
        login: 'some-owner'
      }
    }

    const oktokit = github.getOctokit('some-token')
    jest.spyOn(oktokit, 'paginate').mockImplementation(async () => {
      return Promise.resolve([
        'folder-1/sub-folder-1/file.txt',
        'folder-1/sub-folder-2/file.txt',
        'folder-2/sub-folder-1/file.txt'
      ])
    })
    jest.spyOn(github, 'getOctokit').mockImplementation(() => {
      return oktokit
    })
  })

  afterAll(() => {
    // Restore @actions/github context
    github.context.ref = originalContext.ref
    github.context.sha = originalContext.sha

    // Restore
    jest.restoreAllMocks()
  })

  it('returns true when a matching path is present', async () => {
    // Set the action's inputs as return values from core.getInput()
    getInputMock.mockImplementation((name: string): string => {
      switch (name) {
        case 'paths':
          return 'folder-1/sub-folder-1/file.txt, folder-2/*'
        case 'github-token':
          return 'some-token'
        default:
          return ''
      }
    })

    await main.run()
    expect(runMock).toHaveReturned()

    // Verify that all of the core library functions were called correctly
    expect(setOutputMock).toHaveBeenCalledWith('has-changes', true)
  })

  it('returns false when a matching path is not present', async () => {
    // Set the action's inputs as return values from core.getInput()
    getInputMock.mockImplementation((name: string): string => {
      switch (name) {
        case 'paths':
          return 'folder-4/*'
        case 'github-token':
          return 'some-token'
        default:
          return ''
      }
    })

    await main.run()
    expect(runMock).toHaveReturned()

    // Verify that all of the core library functions were called correctly
    expect(setOutputMock).toHaveBeenCalledWith('has-changes', false)
  })
})
