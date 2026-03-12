// src/tools/search-source.ts
import { $ } from 'bun'
import { PathSandbox } from '../utils/path-sandbox'

const MAX_RESULT_LINES = 400

export async function searchSource(sandbox: PathSandbox, query: string, caseSensitive: boolean = false, filePattern?: string) {
  const args = ['--no-ignore', '--line-number', '--heading', '--color', 'never']
  if (caseSensitive) args.push('-s')
  else args.push('-i')

  if (filePattern) args.push('-g', filePattern)
  args.push('-e', query)

  try {
    const res = await $`rg ${args} .`.cwd(sandbox.basePath).text()
    const result = res.trim()

    if (result.length === 0) return { content: [{ type: 'text' as const, text: 'No results found.' }] }

    const lines = result.split(/\r?\n/)
    if (lines.length > MAX_RESULT_LINES) {
      return { content: [{ type: 'text' as const, text: lines.slice(0, MAX_RESULT_LINES).join('\n') + `\n\n[Truncated] Too many results, showing only the first 400 lines.` }] }
    }

    return { content: [{ type: 'text' as const, text: result }] }
  } catch (error: any) {
    if (error.exitCode === 1) return { content: [{ type: 'text' as const, text: 'No matches found.' }] }
    throw error
  }
}
