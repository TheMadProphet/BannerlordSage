# BannerlordSage — Bannerlord Source MCP Server

[![Bannerlord](https://img.shields.io/badge/Game-Bannerlord_II-8B0000?style=flat&logo=target)](https://www.taleworlds.com/en/Games/Bannerlord)
[![ILSpy](https://img.shields.io/badge/Tool-ILSpy-blue?style=flat&logo=c-sharp)](https://github.com/icsharpcode/ILSpy)
[![bun](https://img.shields.io/badge/Bun-%23000000.svg?style=flat&logo=bun&logoColor=white)](https://bun.com/)
[![ripgrep](https://img.shields.io/badge/ripgrep-%23000000.svg?style=flat&logo=rust&logoColor=white)](https://github.com/BurntSushi/ripgrep)

An MCP server providing source code search and data browsing for Mount & Blade II: Bannerlord.

## Foreword

This project is inspired by [RimSage](https://github.com/realloon/rimsage), restructured and customized for Mount & Blade II: Bannerlord's source code structure, XML data, and Harmony patch development needs.

## Available Tools

The server provides the following tools for AI to call automatically:

- `search_source` - Search Bannerlord source code.
- `read_file` - Read the contents of a specific file.
- `list_directory` - List directory structure.
- `search_xml` - Search XML data files.
- `get_item_stats` - Get equipment and item attribute data.
- `read_csharp_type` - Read C# class/struct/interface definitions.
- `generate_harmony_patch` - Generate Harmony patch code templates.
- `trace_troop_tree` - Trace troop upgrade trees and base attributes.
- `read_gauntlet_ui` - Parse UI views and ViewModel bindings.

> **Example prompt:** "Use `read_csharp_type` to look up the `MobileParty` class and check if it has any properties related to movement Speed."

---

## Local Deployment

### 1. Install Prerequisites (Windows)

Run the following commands in a terminal (PowerShell) to install the required components:

- **Install Bun runtime:**
  ```powershell
  powershell -c "irm bun.sh/install.ps1 | iex"
  ```
- **Install Ripgrep:**
  ```powershell
  winget install BurntSushi.ripgrep.MSVC
  ```
(After installation, you can verify by running `bun -v` and `rg --version` in your terminal.)
### 2. Initialize the Project

Run the following in the project root directory:
```bash
bun install
```

### 3. Prepare Data Structure

Manually create the following folders in the project root:
- `dist/assets/Source/`
- `dist/assets/Xmls/`

### 4. Import Game Data

- **C# source code**: Use ILSpy to decompile the game DLLs, and place the generated "C# project (*.csproj)" project files into `dist/assets/Source/`.
- **XML data**: Copy the XML configuration files from the game's `Modules` directory (e.g., `Native/ModuleData`) into `dist/assets/Xmls/`.

### 5. Build the Index

Once data is ready, run the following commands to generate the local SQLite database:
```bash
bun run src/scripts/index-csharp.ts
bun run src/scripts/index-xml.ts
```
> **Tip:** After indexing is complete, you can test the server by running `bun run start` in the terminal.

## Connecting to AI (VS Code + Cline example)

1. Open the Cline extension in VS Code.
2. Click **Manage MCP Servers** at the bottom.
3. Add the following configuration to `cline_mcp_settings.json` (**modify the path to match your actual setup**):

```json
{
  "mcpServers": {
    "bannerlord-sage": {
      "command": "bun",
      "args": ["run", "D:/BannerlordSage/src/stdio.ts"]
    }
  }
}
```
If you see

<img width="357" height="85" alt="image" src="https://github.com/user-attachments/assets/8a43f91f-2cb3-42fb-9e14-f66a54fedc82" />

then the configuration is complete.

---

## Disclaimer

This project and its accompanying tools are intended solely for personal learning, researching Mount & Blade II: Bannerlord game mechanics, and Mod development discussion.

1. This project **does not include or provide** any original code or data files from TaleWorlds.
2. Please use this tool only if you own a legitimate copy of the game, and strictly comply with the official End User License Agreement (EULA).
3. Do not use any game assets decompiled or extracted through this tool for any form of commercial profit or copyright infringement.
4. Any legal disputes arising from improper use of original game data are the sole responsibility of the user and are not related to this project or its original author.
