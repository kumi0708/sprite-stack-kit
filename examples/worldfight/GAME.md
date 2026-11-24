# Worldfight

**In one sentence:** Fly a rocket ship over the whole Earth, drop down to the United States and then to San Francisco, where the rocket turns into a fighter plane and dogfights waves of enemy planes over the city.

**The look:** A chunky pixel rocket ship with a flame, which unfolds into a white fighter with red wingtips over the city. The enemies fly a dark delta-winged dart with a cold blue flame. The maps are the real Earth: real coastlines and real mountains, in the kit's stacked-pixel style. Bright daytime. San Francisco has its bay, its hills, a street grid, downtown towers and the towers of its two bridges.

**Views and controls:** From above, from behind, and from the cockpit, on every level. Mouse and keyboard, with touch for steering.

| Do | Mouse or touch | Keys |
| --- | --- | --- |
| Steer | Point | A / D or arrows; W / S to climb and dive |
| Thrusters | Hold (away from the city); BOOST button on touch in the city | Shift |
| Cannon, in the city | Hold | F, held |
| Missile, in the city, once the box round an enemy turns red | Right click, or MSL | E |
| Roll: throws off a missile that is about to hit, and enemy rounds | Click or tap | R or Q |
| Change view | VIEW button | Space |
| Go down a level, over a marked place | DOWN button | Enter |
| Go up a level | UP button | Backspace |
| Sound off and on | | M |
| Swap up and down, as with a plane's stick: S or pointing low climbs | INVERT | I |

On a touch screen a missile leaves by itself once it has a lock, so the fight can be played with one finger: drag to steer, hold to fire, tap to roll.

## The three levels

| Level | The map | The ship | The marked place to go down |
| --- | --- | --- | --- |
| World | The whole Earth, wrapping east to west | Rocket | The United States |
| Country | The lower 48 states with their borders | Rocket | San Francisco |
| City | San Francisco, about 24 km across | Fighter plane | None: this is where the fight is |

## First playable

Flying over the world and dropping from world to country to city, and back up, feels good. The camera dives into the place you were over and you come out above it on the next map, heading the same way.

## Features, in order

1. **Real maps, packed small.** A tool (`bun run maps`) downloads open elevation tiles and border lines once, shrinks each level to a small grid, and saves it as packed text in the game's source. The game rebuilds each map when it starts and adds fine detail with seeded noise. The game itself uses no network and no data files.
2. **San Francisco as a city.** Buildings on the real ground: low blocks across the city, towers downtown, and landmarks placed at their real positions (the Golden Gate Bridge and Bay Bridge towers, Sutro Tower, the Transamerica Pyramid, Salesforce Tower, Coit Tower).
3. **The rocket turns into a plane.** Arriving over the city, once the haze between levels has cleared, the rocket's slices pull apart, twirl, and close again as a fighter plane, with a flash and a burst of sparks. Leaving, the plane turns back into the rocket the same way. The plane turns 30% harder than the rocket.
4. **The cockpit.** A third view on every level, with a map, an attitude ball, a compass tape, two needles and four lamps, and a picture that banks with the ship. Over the city the map is a radar with the enemies and their missiles on it, the numbers screen shows hull, score and missiles, and a gunsight ring sits on the glass.
5. **The dogfight.** Three waves of two, three and four enemies.
   - A cannon that fires fourteen rounds a second from two guns for as long as the trigger is held. The guns are raised on to whoever is in the sights, because height cannot be judged from above.
   - Missiles: hold an enemy in the sights for most of a second and the box round it closes and turns red. A missile let go then follows it. Two rails, five seconds to reload each.
   - Enemies wander, take turns to attack (one at a time in the first wave, up to three in the last), fire bursts at where you will be, break away when they are too close or hit, jink when locked on to, and trail smoke when damaged. Shot down, they fall burning and blow up on the ground or splash into the bay.
   - Their missiles: a warning shows where one is coming from, then ROLL!. A roll begun in the last half second throws it off, time slows for a moment, and the missile button then answers with a volley of three at whoever fired. A roll also throws off cannon rounds, but the guns are silent while rolling.
   - Hits flash, shake the picture and throw debris. The edges of the picture flash red when the plane is hit, and it trails smoke when it is nearly done for.
   - Shot down, the plane falls spinning and blows up. Win or lose, the score and the best score are shown, and a click starts a new fight.
6. **Detail.** Wingtip trails, shadows under every plane, spray when the ship skims low over water, specks of air that streak past and a wider lens with the thrusters open, spurts of dust or water where rounds strike.
7. **Sound.** Made in code with Web Audio in `src/sound.js`: engine, wind, cannon, hits, blasts, missiles, a lock tone, a missile alarm that quickens, and short tunes for a wave, a win and a loss. It starts with the first click or key. The game only counts what happened (`game.heard`); the page plays it.

## Later

- Real players online. The fight is written so that a pilot is steered by a few numbers, whoever writes them.
- More cities and more countries. The maps tool takes a place and a size, so a new place is a new line.
- Real building footprints. This version places landmarks by hand and fills the rest by rule.
- A gamepad, a bridge roadway (the ground has one height per pixel, so only the towers stand), crashing into the ground, ejecting.

## Always true

- Every pixel of every frame is drawn, on every level and half-way between levels.
- You can only go down over a marked place, and only up from the country or the city.
- Left alone, a change of level finishes, and you are then on exactly one level.
- After going down and up again you are over the place you went down from.
- The ship never touches the ground or a building.
- Left alone, the ship is a fighter plane in the city and a rocket everywhere else. It changes shape in plain sight, never while it is hidden.
- The plane has wingtips for trails and nozzles for flames, and the enemies fly a plane of their own.
- From above and from behind the ship is in sight, unless it has been shot down. From the cockpit it is out of sight, the dashboard is under the view, and the picture banks with the ship. In no other view is the picture banked.
- From the cockpit over the city, the radar shows that there are enemies in the air. While there is a fight a gunsight shows, in every view, and so do the hull and the score.
- Enemies exist only in the city. They fly above the ground, no more of them than the wave has, and the wave only moves on.
- In the city there is a fight: enemies in the air, or the next wave on its way, or a fight that is over.
- Holding the button fires a stream of rounds as a plane in a fight, and opens the thrusters anywhere else. A missile only leaves its rail in a fight.
- The cannon, held on an enemy, takes one from its hull with every round, shoots it down and scores. A missile let go with a lock follows its enemy and shoots it down.
- An enemy round that reaches the ship takes one from the hull, unless the ship is rolling.
- An enemy missile that arrives early in a roll is thrown off and time slows. One that arrives on a level ship takes hull and shakes the picture.
- During a fight the score never goes down. The best score never goes down at all. Hull strength never goes up during a fight, and never below zero.
- With no hull left the game is lost; with no enemies left it is won; never both.
- Once a fight is over and its end has played out, a click starts a new one with a full hull and no score.
- Left alone with nothing hit, time runs at full speed, the picture is still and no flash is left.
- What the page plays as sound is only ever counted up, and the game itself plays nothing.
- The same seed and the same input draw the same frames.

## Limits

Every kit rule holds: no libraries, no WebGL, no network and no image, sound or data files when the game runs. The maps tool uses the network when a map is rebuilt, and its output is committed as source. Laptop first; it must also run on a phone. Map data comes from the Mapzen terrain tiles on AWS Open Data and from Natural Earth, and both get credit.

## How we work

Run to the end and report.

## What the agent could not check here

How the sound sounds: it was run in a browser with no errors, but nobody listened to it. A real touch device, Safari and Firefox. Whether a person finds the fight the right difficulty: it was tuned with scripted pilots.
