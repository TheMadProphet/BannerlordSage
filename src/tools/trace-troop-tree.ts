// src/tools/trace-troop-tree.ts
import { getDb } from '../utils/db'
import { parser } from '../utils/xml-utils'

export async function traceTroopTree(characterId: string) {
  const db = getDb()
  const rows = db.query<any, any>("SELECT filePath, content FROM xml_data WHERE content LIKE $id")
    .all({ $id: `%id="${characterId}"%` })

  if (rows.length === 0) {
    return { content: [{ type: 'text' as const, text: `Troop ID not found: ${characterId}` }] }
  }

  let output = `Troop [${characterId}] tracking report:\n\n`
  let found = false

  for (const row of rows) {
    try {
      const xmlObj = parser.parse(row.content)
      if (!xmlObj || !xmlObj.NPCCharacters || !xmlObj.NPCCharacters.NPCCharacter) continue

      const npcs = xmlObj.NPCCharacters.NPCCharacter
      // Ensure conversion to array for iteration
      const npcArray = Array.isArray(npcs) ? npcs : [npcs]

      // Find exact troop ID match (fast-xml-parser prefixes attributes with @_)
      const targetNpc = npcArray.find((n: any) => n['@_id'] === characterId)

      if (targetNpc) {
        found = true
        output += `File: ${row.filePath}\n`
        output += `In-game name: ${targetNpc['@_name'] || 'Unknown'}\n`
        output += `Level: ${targetNpc['@_level'] || 'Unknown'}\n`
        output += `Culture/Faction: ${targetNpc['@_culture'] || 'Unknown'}\n`
        output += `Skill template: ${targetNpc['@_skill_template'] || 'Independent skills'}\n`

        // Parse upgrade tree
        const upgradeTargets = targetNpc.upgrade_targets?.upgrade_target
        if (upgradeTargets) {
          const upgArray = Array.isArray(upgradeTargets) ? upgradeTargets : [upgradeTargets]
          const upgIds = upgArray.map((u: any) => u['@_id'])
          output += `Upgrade path: -> ${upgIds.join(' -> ')}\n\n`
        } else {
          output += `Upgrade path: None (top-tier or cannot be upgraded)\n\n`
        }
      }
    } catch (err) {
      console.error(`Failed to parse XML file ${row.filePath}`, err)
    }
  }

  if (!found) {
    output += `Could not precisely locate <NPCCharacter> tag in files containing this ID. The XML format may be non-standard or the ID is only a partial match.\n`
  }

  return { content: [{ type: 'text' as const, text: output }] }
}