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
    github.context.payload.before = 'abcd1234567890123456789012345678901234567'
    github.context.payload.after = '1234567890123456789012345678901234567890'

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

  it('uses compare API for push events with before/after SHAs', async () => {
    // Clear PR context to simulate push event
    github.context.payload.pull_request = undefined

    const mockOctokit = github.getOctokit('some-token')
    const paginateSpy = jest.spyOn(mockOctokit, 'paginate')

    getInputMock.mockImplementation((name: string): string => {
      switch (name) {
        case 'paths':
          return 'folder-1/*'
        case 'github-token':
          return 'some-token'
        default:
          return ''
      }
    })

    await main.run()

    // Verify compare API was called with before/after SHAs
    expect(paginateSpy).toHaveBeenCalledWith(
      mockOctokit.rest.repos.compareCommits,
      {
        owner: 'some-owner',
        repo: 'some-repo',
        base: 'abcd1234567890123456789012345678901234567',
        head: '1234567890123456789012345678901234567890',
        per_page: 100
      },
      expect.any(Function)
    )
  })

  it('falls back to single commit API when before SHA is null', async () => {
    // Clear PR context and set before SHA to null (new branch scenario)
    github.context.payload.pull_request = undefined
    github.context.payload.before = '0000000000000000000000000000000000000000'

    const mockOctokit = github.getOctokit('some-token')
    const paginateSpy = jest.spyOn(mockOctokit, 'paginate')

    getInputMock.mockImplementation((name: string): string => {
      switch (name) {
        case 'paths':
          return 'folder-1/*'
        case 'github-token':
          return 'some-token'
        default:
          return ''
      }
    })

    await main.run()

    // Verify single commit API was called instead of compare
    expect(paginateSpy).toHaveBeenCalledWith(
      mockOctokit.rest.repos.getCommit,
      {
        owner: 'some-owner',
        repo: 'some-repo',
        ref: 'refs/heads/some-ref',
        per_page: 100
      },
      expect.any(Function)
    )
  })
})
