import * as core from '@actions/core'
import * as github from '@actions/github'
import { PayloadRepository } from '@actions/github/lib/interfaces'
import { GitHub } from '@actions/github/lib/utils'

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  const pathsInput = core.getInput('paths', { required: true })
  const ghToken = core.getInput('github-token', { required: true })

  const regexes = parseArrayInput(pathsInput).map(e => new RegExp(e))

  const octokit = github.getOctokit(ghToken)
  const context = github.context
  const repo = context.payload.repository

  if (!repo) {
    core.setFailed('Could not get repository from context, exiting')
    return
  }

  let files: string[]
  const prNumber = context.payload.pull_request?.number
  if (prNumber) {
    files = await getPullRequestFiles(octokit, repo, prNumber)
  } else {
    files = await getCommitFileNames(octokit, repo, context.ref)
  }

  core.notice(`Evaluating ${files.length} changed file(s).`)

  const pathsChanged = files.some(f => regexes.some(r => r.test(f)))
  core.setOutput('has-changes', pathsChanged)
}

/**
 * Accepts the actions list of secrets and parses them as References.
 *
 * @param input List of secrets, from the actions input, can be
 * comma-delimited or newline, whitespace around secret entires is removed.
 * @returns Array of References for each secret, in the same order they were
 * given.
 */
export function parseArrayInput(input: string): string[] {
  const paths: string[] = []
  for (const line of input.split(/\r|\n/)) {
    const pieces = line.split(',').map(e => e.trim())
    for (const path of pieces) {
      paths.push(path)
    }
  }
  return paths
}

async function getCommitFileNames(
  oktokit: InstanceType<typeof GitHub>,
  repo: PayloadRepository,
  ref: string
): Promise<string[]> {
  return await oktokit.paginate(
    oktokit.rest.repos.getCommit,
    {
      owner: repo.owner.login,
      repo: repo.name,
      ref,
      per_page: 100
    },
    response => response.data.files?.map(f => f.filename) ?? []
  )
}

async function getPullRequestFiles(
  oktokit: InstanceType<typeof GitHub>,
  repo: PayloadRepository,
  pullNumber: number
): Promise<string[]> {
  return await oktokit.paginate(
    oktokit.rest.pulls.listFiles,
    {
      owner: repo.owner.login,
      repo: repo.name,
      pull_number: pullNumber,
      per_page: 100
    },
    response => response.data.map(f => f.filename)
  )
}
