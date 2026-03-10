// src/tools/get-item-stats.ts
import { getDb } from '../utils/db'
import { parser } from '../utils/xml-utils'

export async function getItemStats(itemId: string) {
  const db = getDb()
  const rows = db.query<any, any>("SELECT filePath, content FROM xml_data WHERE content LIKE $id")
    .all({ $id: `%id="${itemId}"%` })

  if (rows.length === 0) return { content: [{ type: 'text' as const, text: `Item or crafting piece ID not found: ${itemId}` }] }

  let output = `[${itemId}] Stats:\n\n`
  let found = false

  for (const row of rows) {
    try {
      const xmlObj = parser.parse(row.content)

      // ==========================================
      // 1. Try parsing standard items (weapons, armor, horses, shields)
      // ==========================================
      if (xmlObj?.Items?.Item) {
        const items = Array.isArray(xmlObj.Items.Item) ? xmlObj.Items.Item : [xmlObj.Items.Item]
        const targetItem = items.find((i: any) => i['@_id'] === itemId)

        if (targetItem) {
          found = true
          output += `File: ${row.filePath}\n`
          output += `Name: ${targetItem['@_name'] || 'Unknown'}\n`
          output += `Weight: ${targetItem['@_weight'] || 'Unknown'} | Value: ${targetItem['@_value'] || 'Unknown'}\n`
          output += `Type: ${targetItem['@_Type'] || 'Unknown'}\n`

          // Parse combat stats from ItemComponent
          const component = targetItem.ItemComponent
          if (component) {
            // Parse weapon/shield
            if (component.Weapon) {
              const wp = Array.isArray(component.Weapon) ? component.Weapon[0] : component.Weapon
              output += `\n[Weapon/Shield Stats]\n`
              output += `- Length: ${wp['@_weapon_length'] || 'Unknown'}\n`
              if (wp['@_swing_damage']) output += `- Swing damage: ${wp['@_swing_damage']} (${wp['@_swing_damage_type'] || 'None'})\n`
              if (wp['@_thrust_damage']) output += `- Thrust damage: ${wp['@_thrust_damage']} (${wp['@_thrust_damage_type'] || 'None'})\n`
              output += `- Speed: ${wp['@_speed_rating'] || 'Unknown'}\n`
              output += `- Handling/Durability: ${wp['@_weapon_balance'] || wp['@_hit_points'] || 'Unknown'}\n`
            }
            // Parse armor
            if (component.Armor) {
              const ar = Array.isArray(component.Armor) ? component.Armor[0] : component.Armor
              output += `\n[Armor Stats]\n`
              if (ar['@_head_armor']) output += `- Head armor: ${ar['@_head_armor']}\n`
              if (ar['@_body_armor']) output += `- Body armor: ${ar['@_body_armor']}\n`
              if (ar['@_leg_armor']) output += `- Leg armor: ${ar['@_leg_armor']}\n`
              if (ar['@_arm_armor']) output += `- Arm armor: ${ar['@_arm_armor']}\n`
            }
            // Parse horse
            if (component.Horse) {
              const hr = Array.isArray(component.Horse) ? component.Horse[0] : component.Horse
              output += `\n[Horse Stats]\n`
              output += `- Charge damage: ${hr['@_charge_damage'] || 0}\n`
              output += `- Speed: ${hr['@_speed'] || 0}\n`
              output += `- Maneuver: ${hr['@_maneuver'] || 0}\n`
            }
          }
          output += `\n`
        }
      }

      // ==========================================
      // 2. Try parsing crafting pieces (CraftingPiece)
      // ==========================================
      if (xmlObj?.CraftingPieces?.CraftingPiece) {
        const pieces = Array.isArray(xmlObj.CraftingPieces.CraftingPiece) ? xmlObj.CraftingPieces.CraftingPiece : [xmlObj.CraftingPieces.CraftingPiece]
        const targetPiece = pieces.find((p: any) => p['@_id'] === itemId)

        if (targetPiece) {
          found = true
          output += `File: ${row.filePath}\n`
          output += `Piece name: ${targetPiece['@_name'] || 'Unknown'}\n`
          output += `Tier: ${targetPiece['@_tier'] || 'Unknown'}\n`
          output += `Piece type: ${targetPiece['@_piece_type'] || 'Unknown'}\n`
          output += `Length: ${targetPiece['@_length'] || 'Unknown'} | Weight: ${targetPiece['@_weight'] || 'Unknown'}\n`

          if (targetPiece.Materials?.Material) {
            output += `Required materials: ${Array.isArray(targetPiece.Materials.Material) ? targetPiece.Materials.Material.length : 1} type(s)\n`
          }
          output += `\n`
        }
      }

    } catch (err) {
      console.error(`Failed to parse XML file ${row.filePath}`, err)
    }
  }

  if (!found) {
    output += `ID exists in database but could not extract data precisely. The node may not be a standard Item or CraftingPiece.\n`
  }

  return { content: [{ type: 'text' as const, text: output }] }
}