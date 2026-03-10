// src/tools/search-xml.ts
import { getDb } from '../utils/db'

export async function searchXml(query: string) {
  const db = getDb()
  const rows = db.query<any, any>("SELECT name, filePath FROM xml_data WHERE content LIKE $q LIMIT 10")
    .all({ $q: `%${query}%` })

  if (rows.length === 0) return { content: [{ type: 'text' as const, text: 'No matching content found in XML.' }] }

  const text = rows.map(r => `File: ${r.filePath}`).join('\n')
  return { content: [{ type: 'text' as const, text: `Found matching XML files:\n${text}` }] }
}