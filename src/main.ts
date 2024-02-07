import * as core from '@actions/core'
import * as github from '@actions/github'
import { PayloadRepository } from '@actions/github/lib/interfaces'
import { GitHub } from '@actions/github/lib/utils'

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  const input = core.getInput('paths', { required: true })
  const ghToken = core.getInput('github-token', { required: true })

  const inputs = parseInpuit(input)
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

  if (inputs instanceof Map) {
    core.info('Using map input')
    runWithMapInput(inputs, files)
  } else {
    core.info('Using array input')
    runWithArrayInput(inputs, files)
  }
}

function runWithMapInput(input: Map<string, RegExp>, files: string[]): void {
  const changedFiles = new Map<string, boolean>()
  for (const [key, value] of input) {
    changedFiles.set(
      key,
      files.some(f => value.test(f))
    )
  }

  for (const [key, value] of changedFiles) {
    core.info(`Evaluating ${files.length} changed file(s).`)
    core.info(`${key} has changes: ${value}`)
    core.setOutput(key, value)
  }
}

function runWithArrayInput(input: RegExp[], files: string[]): void {
  const pathsChanged = files.some(f => input.some(r => r.test(f)))

  core.info(`Evaluating ${files.length} changed file(s).`)
  core.info(`Has changes: ${pathsChanged}`)

  core.setOutput('has-changes', pathsChanged)
}

export function parseInpuit(input: string): RegExp[] | Map<string, RegExp> {
  try {
    const json = JSON.parse(input)
    return parseMapInput(json)
  } catch {
    return parseArrayInput(input)
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function parseMapInput(json: any): Map<string, RegExp> {
  const map: Map<string, RegExp> = new Map()
  for (const key in json) {
    map.set(key, new RegExp(json[key]))
  }
  return map
}

export function parseArrayInput(input: string): RegExp[] {
  // Inspired by answer: https://stackoverflow.com/questions/75420197/how-to-use-array-input-for-a-custom-github-actions
  const paths: RegExp[] = []
  for (const line of input.split(/\r|\n/)) {
    const pieces = line.split(',').map(e => e.trim())
    for (const path of pieces) {
      paths.push(new RegExp(path))
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
