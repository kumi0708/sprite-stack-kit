# Worldfight

Fly a rocket ship over the whole Earth, drop down to the United States and then to San Francisco, where the rocket turns into a fighter plane and dogfights waves of enemy planes over the city. Built with sprite-stack-kit by following its `new-game` playbook, then its `feature` playbook for the plane, the cockpit and the fight.

```sh
bun start --game examples/worldfight
```

Add `?level=2` to the address to start in the city, `?view=chase` or `?view=cockpit` to start from behind or from the seat, and `?assist` to have missiles leave by themselves once locked (touch screens always do).

| Do | Mouse or touch | Keys |
| --- | --- | --- |
| Steer | Point | A / D or arrows; W / S to climb and dive |
| Thrusters | Hold (away from the city); BOOST on touch in the city | Shift |
| Cannon, in the city | Hold | F, held |
| Missile, in the city | Right click, or MSL | E |
| Roll | Click or tap | R or Q |
| Change view: above, behind, cockpit | VIEW | Space |
| Go down a level, over a beam of light | DOWN | Enter |
| Go up a level | UP | Backspace |
| Sound off and on | | M |

Flying out of the side of a country also takes you up a level. In the middle of a fight the edge of the city turns the plane back; leave with UP.

## How to fight

- Hold the button with an enemy near the green gunsight. The guns do the rest of the aiming up and down.
- Keep an enemy in front of you and a box closes round it. When the box turns red, fire a missile: it follows.
- A red mark and the word MISSILE mean one is coming for you. When it says ROLL!, roll. Time slows as it goes by, and the missile button then fires three back at whoever sent it.
- A roll also throws off cannon rounds, but your own guns are silent while you roll.
- Three waves: two, three, then four enemies. Eight hits and you are shot down. Points for hits, kills, dodged missiles, cleared waves and hull left at the end; the best score is kept until the page is closed.
- When it is over, click to fly again.

## How the real maps get in

The game uses no network and no data files. `bun run maps --game examples/worldfight` is run once, by whoever changes the maps:

1. It reads the places in `maps.js`: the whole Earth, the lower 48 states, San Francisco.
2. It downloads open elevation tiles and border lines for each, and shrinks each place to a grid of 256 or 320 cells a side. A cell holds one number: 0 for water, or 1 to 15 for how high the land is.
3. It packs each grid as text and writes `src/map-<name>.js`. The three come to 75 KB.

When the game starts, `src/world.js` unpacks each grid, smooths between its cells, and adds fine detail from seeded noise. So the coasts and mountains are real, and the last few pixels of detail are made up. The same seed always gives the same maps.

Not from data: the deserts and plains (ovals drawn by hand in `world.js`) and San Francisco's buildings (`src/city.js`). Blocks are placed by rule where the city is. The bridges, Salesforce Tower, the Transamerica Pyramid, Coit Tower and Sutro Tower stand at their real positions.

To add a place, add a line to `maps.js`, run the tool, and add a level to `LEVELS` in `src/world.js`.

## Files

| File | Holds |
| --- | --- |
| `GAME.md` | The brief: what the game is, what must always be true, what is left for later |
| `maps.js` | The places the maps tool makes maps of |
| `states.js` | The state map: 34 rules, checked in every state by `bun run states --game examples/worldfight` |
| `playtest.js` | Three scripted pilots that fly whole fights and print how they went: `bun examples/worldfight/playtest.js` |
| `src/atlas.js` | Unpacks a map; turns longitude and latitude into map pixels |
| `src/world.js` | Rebuilds the three maps; the materials and their colours |
| `src/city.js` | San Francisco's streets, blocks and landmarks |
| `src/model.js` | The three models: the rocket, the fighter plane it turns into, and the enemy's plane |
| `src/game.js` | Flight, the levels, the change of shape, the camera, slow motion and shake, the draw order |
| `src/dogfight.js` | The enemy pilots, the cannon, missiles both ways, lock-on, the dodge, hull, score, waves, who won. `FIGHT` at the top holds every number to tune |
| `src/effects.js` | Smoke, sparks, debris and blasts, in fixed pools |
| `src/cockpit.js` | The cockpit and its instruments, with a radar and fight read-outs over the city |
| `src/roll.js` | Banks the picture in the cockpit view |
| `src/hud.js` | What is written over the picture: hull, score, gunsight, lock box, missile warning, banners |
| `src/sound.js` | Every sound, made with Web Audio from what the game counts in `game.heard` |
| `src/main.js` | The page: input, buttons, the frame loop |

## Credit

Elevation: Mapzen terrain tiles, hosted by AWS Open Data. Borders: Natural Earth, public domain. See `CREDITS.md` at the top of the kit.
