// src/scripts/index-xml.ts
import { file, Glob } from 'bun'
import { join } from 'path'
import { defsPath, dbPath } from '../utils/env'
import { Database } from 'bun:sqlite'

async function main() {
  console.log('Indexing XML files...')
  const db = new Database(dbPath)

  db.run(`
    CREATE TABLE IF NOT EXISTS xml_data (
      name TEXT,
      type TEXT,
      content TEXT,
      filePath TEXT,
      PRIMARY KEY (name, type)
    );
  `)

  const insert = db.prepare('INSERT OR REPLACE INTO xml_data (name, type, content, filePath) VALUES ($name, $type, $content, $path)')
  const glob = new Glob('**/*.xml')

  let fileCount = 0

  for await (const path of glob.scan({ cwd: defsPath })) {
    const text = await file(join(defsPath, path)).text()
    insert.run({
      $name: path.split('/').pop() || path,
      $type: 'XML_FILE',
      $content: text,
      $path: path
    })
    fileCount++
  }

  db.close()
  console.log(`XML indexing complete! Processed ${fileCount} files.`)
}

main().catch(console.error)
