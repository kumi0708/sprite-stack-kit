# ドラゴン版 sprite-stack-kit（フォーク）

このリポジトリは [RayFernando1337/sprite-stack-kit](https://github.com/RayFernando1337/sprite-stack-kit) をフォークしたものです。元のキットを使って、オリジナルのゲーム「**ドラゴン**」を作りました。赤いドラゴンに乗って砂漠の上を飛ぶゲームです。

### ▶ すぐ遊べるデモ

**https://kumi0708.github.io/sprite-stack-kit/examples/dragon/**

ブラウザで開くだけで遊べます。インストールは要りません。スマホでも動きます。

| 上から | 後ろから |
| --- | --- |
| ![上から見たドラゴンとオアシス](examples/dragon/screenshots/top.jpg) | ![後ろから見た、砂漠を滑空するドラゴン](examples/dragon/screenshots/chase.jpg) |
| **オアシスの上を飛ぶ** | **背中に乗った視点** |
| ![オアシスの上を飛ぶドラゴン](examples/dragon/screenshots/oasis.jpg) | ![ドラゴンの背中から見た景色](examples/dragon/screenshots/saddle.jpg) |

### 遊び方

| 操作 | パソコン | スマホ |
| --- | --- | --- |
| 操縦 | マウスを動かす（W/S キーで上昇・下降） | ドラッグ |
| 火を吐く・加速 | 長押し | 長押し |
| 一回転 | クリック | タップ |
| 視点を変える（上から → 後ろから → 背中の上） | スペースキー、または右上の「視点」 | 右上の「視点」 |
| 上下の操作を逆にする | I キー、または右上の「上下反転」 | 右上の「上下反転」 |

#### 上下反転モード

飛行機の操縦桿と同じく、**手前に引くと上昇、奥に押すと下降** になるモードです。右上の「上下反転」ボタン（パソコンでは I キーも）で、オンとオフを切り替えます。オンのときはボタンが赤くなります。

| 上昇・下降の操作 | ふつう | 上下反転：オン |
| --- | --- | --- |
| キー | W で上昇・S で下降 | S で上昇・W で下降 |
| マウスの位置（後ろから・背中の視点） | 上に置くと上昇 | 下に置くと上昇 |
| スマホのドラッグ（後ろから・背中の視点） | 上へドラッグで上昇 | 下へドラッグで上昇 |

- 設定はブラウザに保存されるので、次に開いたときもそのままです。
- アドレスの最後に `?invert=1` を付けると最初からオン、`?invert=0` でオフになります。例：https://kumi0708.github.io/sprite-stack-kit/examples/dragon/?invert=1

### このフォークで作ったもの

ゲームはすべて [examples/dragon](examples/dragon) にあります。元の見本ゲーム（`examples/starter`）は、手を加えずにそのまま残しています。

- **ドラゴン**：3Dエンジンを使わず、ドット絵の板を何枚も重ねて立体に見せています（スプライトスタック）。翼の形を7通り作って切り替えるので、飛びながら羽ばたきます。
- **火を吐く**：ボタンを長押ししている間、口から炎を吐いて加速します。
- **砂漠**：うねる砂丘、赤い岩の台地（メサ）、ヤシの木が生えたオアシスの池を、プログラムで自動生成しています。アドレスの最後に `?seed=3` のように数字を付けると、別の砂漠になります。
- **背中に乗った視点**：首と角のある頭、羽ばたく翼、手綱を握る手が見えます。鞍には方位磁石があり、左右の鞍袋に地図と速さ・高さ・向きが出ます。
- **日本語表示**：画面の文字はすべて日本語です。
- **上下反転モード**：飛行機のように、手前に引くと上昇する操作に切り替えられます。

### しくみ：ドラゴンは画像ではない

このゲームには、画像ファイル（PNG や JPG）が1枚もありません。3Dエンジンもポリゴンも使っていません。ドラゴンも砂漠も、プログラムが計算した数字から、1ピクセルずつ描いています。

**1. ドラゴンは「数字の入った立体の箱」**

ドラゴンは、横45 × 縦50 × 高さ16 マスの箱です。1マスに1つの数字が入っていて、`0` は空っぽ、`1` は赤いうろこ、`7` は翼の膜、`13` は角、というように色の番号を表します。

箱を埋めるのはプログラムです（[model.js](examples/dragon/src/model.js) の `sculpt()`）。「このマスが楕円の内側なら、うろこの色にする」という決まりを、頭から尾まで太さを変えながら繰り返して、体を作ります。翼、角、背中のトゲも同じように作ります。

**2. 箱を輪切りにすると、薄い板になる**

箱を高さごとに切ると、ドット絵の板が何枚もできます。下は、ドラゴンの板を一番下（足先）から上（角の先）まで並べたものです。真ん中あたりの、翼が広がった板がいちばん大きな板です。

![ドラゴンを輪切りにした板。左上が一番下、右下が一番上](examples/dragon/screenshots/slices.png)

**3. 板を少しずつずらして重ねると、立体に見える**

板を下から順に、1枚ごとに1ピクセルずつ上にずらして重ねます。板が増えるにつれて、ドラゴンが立体に見えてきます。向きを変えるときは、全部の板を同じ角度だけまとめて回します。この技法を **スプライトスタック** と呼びます。

![板を3枚、4枚、5枚、7枚、全部と重ねていったところ](examples/dragon/screenshots/pile.png)

ゲーム中に **E キー** を押すと、重なった板がばらばらに離れて見えます。

**4. プログラムで作るから、動かすのも簡単**

- **羽ばたき**：翼の角度を変えて箱を計算し直すだけで、7通りの形がすぐにできます。それを順番に切り替えています。
- **色替え**：色の表の数字を変えるだけで、青いドラゴンにもなります。
- **小ささ**：ゲーム全体のプログラムが約100KBで、画像の読み込みもありません。

**元になった記事との違い**

スプライトスタックの作り方は、SpriteCook の記事 [Sprite stacking for fake 3D pixel art cars and props](https://www.spritecook.ai/blog/sprite-stacking-pixel-art) が詳しく説明しています。記事では、板を **PNG 画像** として用意します。ボクセルエディタで作る、上・横・前・後ろの4方向の絵から切り出す、AIに4方向の絵を描かせる、の3通りです。そのうえで、Godot などのゲームエンジンで重ねて描きます。

| | 元の記事 | このドラゴン |
| --- | --- | --- |
| 板の作り方 | PNG 画像（手描き、ボクセル、AI） | プログラムで計算 |
| 描く道具 | Godot などのゲームエンジン | 自作の描画プログラム（エンジンなし） |
| 板を重ねて回す考え方 | 同じ | 同じ |

このキットでも、記事と同じように絵から作れます。上・横・前・後ろの4方向を描いた1枚の PNG を用意して、次を実行します。

```sh
bun run views 絵.png
```

立体のモデルが切り出されます。ゲームは画像を読み込まず、切り出した結果を短い文字列としてプログラムに埋め込みます。

### 自分のパソコンで動かす

[Bun](https://bun.sh) を入れてから、このリポジトリのフォルダで次を実行します。

```sh
bun start --game examples/dragon
```

表示されたアドレスをブラウザで開いてください。

### クレジット

- キット：[RayFernando1337/sprite-stack-kit](https://github.com/RayFernando1337/sprite-stack-kit)（MIT ライセンス）
- 技法の元になったゲーム：Dash（[@creativedash](https://x.com/creativedash)）の「fighter」

この下は、元のリポジトリの説明（英語）です。

---

# sprite-stack-kit

Build pixel-art games that look 3D, with no 3D engine.

![The starter game seen from above, from behind, and from the cockpit](docs/images/views.png)

Every pixel in those three pictures was worked out by plain JavaScript. There are no polygons, no graphics library and no image files. This kit explains how that is done, and gives you a working game to take apart and make your own.

## Make a game with your agent

Install [Bun](https://bun.sh), clone this repository, open the folder in your coding agent, and say:

> Read START.md and follow it. I want to make a game.

[START.md](START.md) sends your agent to one entry skill, which picks a playbook for what you asked. For a new game it studies the original, asks you a few questions about the game, its look and what makes it fun, writes down what you agreed, and builds in small steps that it checks as it goes. There are playbooks for adding a feature, changing the look, fixing a bug and learning how it works too. It works with any agent that can read files and run commands: Claude Code, Codex, Cursor, Droid and others.

If your agent has skills, you can skip the sentence above and type `/sprite-stack-game I want to make a game`. To get that command in a project of your own, install the skills there with the [skills installer](https://github.com/vercel-labs/skills):

```sh
bunx skills add RayFernando1337/sprite-stack-kit
```

The installer copies the skills only. The entry skill clones this kit beside your project the first time it needs the tools and the starter game.

## What you get

- **A game to fork.** [`examples/starter`](examples/starter/README.md) is a small flight game with three camera views: from above, from behind, and from the cockpit. It is about 2,500 lines of commented JavaScript, with no libraries and no build step.
- **Documents that teach.** A [picture tour](docs/how-it-works.md) of the ideas, a [hands-on tutorial](docs/tutorial.md), and a [deeper look](docs/deep-dive.md) at the maths and the code.
- **Skills for coding agents.** [`.agents/skills`](.agents/skills) teaches Claude Code, Codex, Cursor, Droid and other agents the same techniques, so you can ask for "a boat game in this style" and get one.
- **A prompt library.** [`prompts/`](prompts/README.md) collects prompts people have shared for building games like this, with credit to their authors.

## Where it comes from

On 15 November 2026, Dash ([@creativedash](https://x.com/creativedash)) posted [fighter](https://forge.ui8.ai/share/frag_1eb8944c-57b1-42ca-a909-5c2d7e517c24), a browser game, with the line ["No 3D engine, no polygons, 32 KB of code."](https://x.com/creativedash/status/2122000830895386680) A lot of people asked how it works and how to make their own. This kit is an answer to both questions.

It is an independent project. It is not affiliated with Dash or UI8, and it contains none of Dash's code, artwork or sound. The starter was written for this kit after studying his published build, and it follows his approach closely. [CREDITS.md](CREDITS.md) says exactly what comes from where.

## Start here

You need [Bun](https://bun.sh). There is nothing else to install.

```sh
git clone https://github.com/RayFernando1337/sprite-stack-kit.git
cd sprite-stack-kit
bun start
```

Open the address it prints (normally `http://localhost:5173`) and fly.

| Input | What it does |
| --- | --- |
| Move the pointer | Steer. From behind and in the cockpit, point up to climb and down to dive |
| Click or tap | Barrel roll |
| Hold | Thrusters |
| Arrow keys or WASD | Turn, climb (W) and dive (S) |
| Shift | Thrusters |
| Space, or the VIEW button | The next view: overhead, chase, cockpit |
| E | Pull the stack apart to see the slices |

Add `?seed=3` to the address for a different world. Add `?view=chase` or `?view=cockpit` to start in that view.

## Pick a path

| If you want to | Go to |
| --- | --- |
| See how the trick works, in pictures | [docs/how-it-works.md](docs/how-it-works.md) |
| Change the game with your own hands, one small step at a time | [docs/tutorial.md](docs/tutorial.md) |
| Understand the maths and the code properly | [docs/deep-dive.md](docs/deep-dive.md) |
| Look up a word | [docs/glossary.md](docs/glossary.md) |
| Have a coding agent build your game | [START.md](START.md) |
| Build a game from a single prompt | [prompts/](prompts/README.md) |
| Read and run Dash's original | [docs/getting-the-source.md](docs/getting-the-source.md) |

## The trick, in six ideas

![The craft built up one slice at a time](docs/images/pile.png)

1. **One small picture.** The whole game is drawn into an array of about 400 × 240 numbers, one per pixel. The page shows that picture scaled up by a whole number, with hard edges.
2. **Sprite stacking.** The craft is a pile of flat pixel pictures, one per layer of height. The picture above adds them one at a time. Drawn one pixel apart and turned together, the pile reads as a solid object.
3. **The world is stacks too.** Every ground pixel has a height. The ground is drawn from near to far, and each pixel is drawn as a column that many layers tall.
4. **One camera.** A single short formula gives the flat view from above, the view from behind and the view from the cockpit. Changing view slides a few numbers, so there is never a cut.
5. **A depth for every pixel.** The picture remembers how far away each pixel is, so a hill or a cloud can hide the craft.
6. **A turned picture.** The ground can only be drawn upright. To bank the cockpit view, the world is drawn on a bigger sheet and the sheet is turned.

[docs/how-it-works.md](docs/how-it-works.md) explains each one with pictures and points at the code.

## Build your own game

**With a coding agent.** Start with [START.md](START.md), then say what you want to see, for example:

- "Turn the craft into a hot-air balloon and make the islands a desert."
- "Add enemy boats that I can shoot."
- "Give the cockpit a radar screen that shows the boats."
- "Make a new game in `examples/` where I drive a boat between the islands."

[prompts/kit-prompts.md](prompts/kit-prompts.md) has longer requests that work well.

**By hand.** Follow [docs/tutorial.md](docs/tutorial.md). It takes you through eight small changes: a tuning number, the craft's colours and shape, the land, a tower on the map, the cockpit, and a copy of the game that is yours. Each step says which file to open and what you should see.

**From a single prompt.** [prompts/](prompts/README.md) has complete prompts you can paste into a model to build a game like this from nothing.

## Check your changes

```sh
bun run check      # runs the game with no browser and checks 42 things the kit promises
bun run states     # walks the game through every state it can reach and checks its rules
bun run snapshot   # saves frames to snapshots/ so you (or your agent) can look at them
bun test           # the same checks, through Bun's test runner
```

## Study the original

Dash's game is public, so you can read it and run it on your own computer:

```sh
bun run fetch-reference   # downloads his published build into reference/ (git-ignored)
bun run reference         # serves that copy so you can play it locally
```

[docs/getting-the-source.md](docs/getting-the-source.md) explains what the Forge link is, why saving the page does not give you a working game, and what you may and may not do with the files. [docs/reference-map.md](docs/reference-map.md) says where each feature lives in his code.

His files are not part of this repository, and they were published without a license. Read them to learn. Do not copy from them or republish them. To build on his project itself, sign in to Forge and press **Remix** on [his page](https://forge.ui8.ai/share/frag_1eb8944c-57b1-42ca-a909-5c2d7e517c24).

## What the starter has, and what it leaves for you

It is a base, not a finished game.

- **It has:** flight, three camera views with smooth moves between them, a cockpit with working instruments and a head-up display, trails, flames, shadows, and a world that wraps for ever.
- **It leaves for you:** enemies and weapons, crashes, sound, gamepad support, and on-screen touch buttons apart from VIEW. These are good first things to build, and the skills describe how.

## What is in the box

| Path | What it is |
| --- | --- |
| `START.md` | Where a person points their coding agent. It leads to the entry skill, `.agents/skills/sprite-stack-game`, and its playbooks |
| `examples/worldfight/` | A game built with the kit's own playbook: the real Earth on three levels, down to a dogfight over San Francisco |
| `examples/starter/` | The game to fork: 13 files, 99 KB with comments, 37 KB gzipped, plus its state map |
| `docs/` | The picture tour, the tutorial, the deeper look, the glossary, and how to get and read the original |
| `.agents/skills/` | Skills for coding agents, one folder each. They are plain how-to guides, so people can read them too |
| `prompts/` | Prompts for building games like this, with credit |
| `scripts/` | The local server, the checks, the state walker, the snapshot tool, the figure maker and the reference downloader |
| `tests/` | Lets `bun test` run the checks |
| `reference/` | Created by `bun run fetch-reference`. Git-ignored and never committed |

## Credits

This kit stands on other people's work. The short version:

- **Dash** ([@creativedash](https://x.com/creativedash)) made the game and the approach this kit teaches.
- **Levi 卧云** ([@Leviwoyun](https://x.com/Leviwoyun)) and **阿旭gogogo** ([@axu_ai](https://x.com/axu_ai)) shared the prompts they used to recreate it.
- **Del** ([@TheCartelDel](https://x.com/TheCartelDel)) gave the explanation, "sprite stacking", that most people learned the name from, in a thread started by **/OVRFLW** ([@overflowyouknow](https://x.com/overflowyouknow)).
- **Dilip** ([@dilip_ramirez](https://x.com/dilip_ramirez)) ported it to an ESP32-S3.
- **Lauren Tan** ([@poteto](https://x.com/poteto)) wrote [pstack](https://github.com/cursor/plugins/tree/main/pstack), whose ideas about one entry point, playbooks and how agents should verify their work shaped the entry skill and the state walker.

[CREDITS.md](CREDITS.md) has everyone, with links to their posts. If you build something with this kit, please credit Dash too.

## Contributing

Prompts, games, skills and fixes are all welcome. [CONTRIBUTING.md](CONTRIBUTING.md) has the short list of rules.

## License

The code and documents written for this kit are under the [MIT License](LICENSE).

The prompts in `prompts/` that were written by other people remain theirs. They are reproduced with credit and a link, and will be removed if their authors ask. Dash's game is not included here and the license does not cover it.
