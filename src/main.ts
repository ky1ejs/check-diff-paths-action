import * as core from '@actions/core'
import * as github from '@actions/github'

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  const pathsInput = core.getInput('paths', { required: true })
  const regexes = parseArrayInput(pathsInput).map(e => new RegExp(e))

  const ghToken = core.getInput('github-token')
  const octokit = github.getOctokit(ghToken)
  const context = github.context
  const repo = context.payload.repository

  if (!repo) {
    core.setFailed('Could not get repository from context, exiting')
    return
  }

  const result = await octokit.rest.pulls.listFiles({
    owner: repo.owner.login,
    repo: repo.name,
    pull_number: context.payload.number,
    per_page: 100
  })

  const pathsChanged = result.data
    .map(f => f.filename)
    .some(f => regexes.some(r => r.test(f)))

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
