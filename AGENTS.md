# AGENTS.md

sprite-stack-kit helps people build pixel-art games that look 3D with no 3D engine. It holds a game to fork (`examples/starter`), skills, documents and prompts. The approach comes from "fighter", a game by Dash (@creativedash). His code is not in this repository.

For any request, start with `.agents/skills/sprite-stack-game/SKILL.md`. It picks a playbook and names the other skills. Skills are plain files at `.agents/skills/<name>/SKILL.md`.

## Commands

Bun only. No npm, no lockfile, no dependencies. There is nothing to install or build.

| Command | What it does |
| --- | --- |
| `bun start` | Serves the starter. For another game: `bun start --game examples/<name>` |
| `bun run check` | Runs a game with no browser and checks what the kit promises |
| `bun run states` | Tries every order of the steps in the game's `states.js` and checks its rules |
| `bun run snapshot` | Saves frames to `snapshots/` so you can look at what the game draws |
| `bun run maps` | Packs real map data into a game's source, from the places in its `maps.js`. Needs the network the first time |
| `bun run views <sheet.png>` | Cuts a stacked model from one PNG of four flat drawings: top, side, front, back |
| `bun run figures` | Redraws `docs/images/` from the starter's code. Never edit those by hand |
| `bun run fetch-reference` | Downloads Dash's build into `reference/`. Needs the network |

`start`, `check`, `states`, `snapshot` and `maps` take `--game examples/<name>`.

## What the code does not tell you

- The rules a game must keep are in the entry skill. `bun run check` enforces most of them.
- `reference/` is someone else's code. Read it to learn. Never commit it or copy from it.
- The original text in `prompts/` stays exactly as its author wrote it.
- New ideas and prompts from other people get a line and a link in `CREDITS.md`.
- Documents and skills are for people new to this: plain words, short sentences, new terms added to `docs/glossary.md`.
- `docs/tutorial.md` quotes lines from the starter. If you change one, change the quote.
- A change is done when the checks pass and you have looked at the frames (`check-your-work` skill).
