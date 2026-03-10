// src/tools/read-gauntlet-ui.ts
import { file, Glob } from 'bun'
import { join } from 'path'
import { PathSandbox } from '../utils/path-sandbox'

export async function readGauntletUi(sandbox: PathSandbox, uiFileName: string) {
  // UI files are typically in GUI/Prefabs folders, so search globally for matching xml
  const glob = new Glob(`**/${uiFileName}*.xml`)
  let foundPath = ''

  for await (const p of glob.scan({ cwd: sandbox.basePath })) {
    foundPath = p
    break
  }

  if (!foundPath) return { content: [{ type: 'text' as const, text: `UI file not found: ${uiFileName}` }] }

  const fullPath = sandbox.validateAndResolve(foundPath)
  const content = await file(fullPath).text()

  let output = `UI file analysis report: ${foundPath}\n\n`

  // Extract DataSource bindings (properties in ViewModel)
  const dataSources = new Set()
  const dsRegex = /DataSource="{([^}]+)}"/g
  let match
  while ((match = dsRegex.exec(content)) !== null) {
    dataSources.add(match[1])
  }

  // Extract click events (Execute methods in ViewModel)
  const commands = new Set()
  const cmdRegex = /Command\.Click="([^"]+)"/g
  while ((match = cmdRegex.exec(content)) !== null) {
    commands.add(match[1])
  }

  output += `Properties to define in C# ViewModel (DataSource):\n`
  dataSources.forEach(ds => output += `  public string/bool/int ${ds} { get; set; }\n`)

  output += `\nMethods to define in C# ViewModel (Command.Click):\n`
  commands.forEach(cmd => output += `  public void ${cmd}() { }\n`)

  return { content: [{ type: 'text' as const, text: output }] }
}