# Bones & Brine — Pirate Liar's Dice

A pirate tabletop game of liar's dice that runs in any browser.

- **Pass & Play**: 1–5 people share one device. A "pass the device" screen hides each player's dice between turns.
- **Bots**: fill seats up to 6. There are four bot styles (Cautious, Steady, Reckless, Sly). Bots only see their own dice, and they read other players' wagers the way a person would.
- **Online**: one player hosts and gets a 5-letter room code (or an invite link). Up to 5 people plus bots. If someone drops out, a bot takes over their seat.
- **Captain's Locker**: name and pirate portrait (hat, beard, eyes, trinkets, colours).
- **Dice Forge**: 9 ready-made dice kits, or design your own (colours, pip shape, wild-1 symbol, pattern, corners). Your dice show up for everyone at the reveal.
- **Mobile**: touch controls turn on automatically on phones and tablets: large buttons, vibration, fullscreen, portrait and landscape layouts. You can override this on the main menu.
- **Desktop**: keyboard shortcuts. ←/→ or 1–6 pick a face, ↑/↓ change the count, Enter wager, L Liar, S Spot On.

- **3D pirates made in Blender**: 4 base pirates (Deckhand, Old Salt, Bones, Fishfolk), 12 hair styles plus bald, 5 tops, 3 hats, 5 trinkets and 10 cosmetics you can mix. The Locker shows a live 3D pirate you can drag to spin.
- **At the table**: every pirate sits with their arms on the table around a leather dice cup and lifts it at the reveal. Shop items are acted out: the tankard or shot goes to the lips, the cigarette sits between the fingers or the cigar in the teeth with smoke curling up, and steak is eaten with a fork.
- **Comfortable pacing**: bots take a few seconds to think, longer on tough calls. Local reveals wait for you. Choose Relaxed, Normal or Quick pace in the rules. Your own name shows as "You" throughout the game.
- **Doubloons and the Tavern**: earn 🪙 1 for every die you make another pirate lose. Spend them in the Tavern: Grog 1, Steak 1, Rum shot 1, Pack of Smokes 2 (5 uses), Pack of Cigars 3 (3 uses). Use them at the table with the 🍺 button, and everyone sees your pirate indulge.
- **Installable app**: Chrome and Edge offer "Install app". Pass & Play and bots work offline once installed.

No build step and no game server. It's plain HTML/CSS/JS.

## Accounts and the admin (Supabase, free)

Sign-in with a username and password, cloud saves, and the admin are powered by a free [Supabase](https://supabase.com) project. Until it's connected the game runs in guest mode.

1. Create a project at supabase.com (sign in with GitHub, click **New project**).
2. **Authentication → Sign In / Providers → Email**: switch **Confirm email** OFF and save. Usernames are turned into placeholder addresses, so no emails are ever sent.
3. **SQL Editor → New query**: paste all of `supabase/setup.sql` and click **Run**.
4. **Project Settings → API**: copy the **Project URL** and the **anon public** key into `js/config.js`.
5. In the game, **Create account** with the username and password you want for the admin. Then run this in the SQL Editor (with your username):
   `update public.profiles set is_admin = true where username = 'your_admin_name';`
   Sign out and back in. The 👑 Admin Desk and the in-game 👑 button appear.

6. Run `supabase/02_chat_and_reports.sql` in the SQL Editor too. It adds chat timeouts, reports and the admin inbox.

7. Run `supabase/03_daily_and_leaderboard.sql` too. It adds the daily chest, the leaderboard and the Admin Desk's live gifts, kicks and bans.

**Daily chest, leaderboard and sharing:**
- **🧰 Daily chest** on the main menu: day 1–7 of a streak pays 1, 1, 2, 2, 3, 3 and 5 doubloons. Miss a day and the streak starts over. Guests get it too (saved on their device).
- **🏆 Leaderboard**: most dice won (dice ye made other pirates lose), this week and all time. Signed-in players only.
- **📣 Share** on the main menu and **Brag** after a game. Links show a preview picture (`og.png`) in Discord, WhatsApp, Reddit and so on.
- **Quick Game crewmates**: when the queue is quiet, the table fills with bots that look and play like real people (gamer-tag names, uneven think times, the odd "gg"). Only the admin sees them marked 🤖.

**Admin Desk → 🟢 Online** shows everyone who has the game open right now (guests too). Tap a player for their device, purse, the table they are at (players, dice left, current wager, whose turn) and their recent activity. **👁 Watch** spectates their online table invisibly with every cup shown. Signed-in players can be gifted, managed, kicked to the menu or banned on the spot. Updates arrive every ~15 seconds (Supabase limits how often presence can change).

**Connection relay (TURN):** players on strict school, work or mobile networks sometimes can't connect to each other directly. Make a free account at https://www.metered.ca/stun-turn, create an app, and put its name and API key into `turnApp` / `turnKey` in `js/config.js`.

**Quick Game, chat and moderation:**
- **⚡ Quick Game** puts you in a queue (Supabase Realtime). With 4 players, or 2+ who've waited a few seconds, the longest-waiting player hosts and the rest join automatically. Empty seats get bots. After 20 s alone you can play with bots instead.
- **Chat** in online lobbies and at the table (💬). Guests can read it; signed-in players can talk. Messages are filtered for English and German swearing and slurs, including leetspeak, stretched letters and spaced-out words.
- **Timeouts** are kept on the server: 1st strike 30 s, 2nd 5 min, 3rd 15 min, then 24 h. From the 5th strike the admin gets a case with every censored message.
- **⚑ Report** a player from the lobby, the ☰ menu or next to a chat message. Their recent chat is attached. Reports and chat cases appear in the Admin Desk under **📥 Reports**, where the admin can look the player up, ban them, mark the report reviewed, or dismiss it.

**Admin powers:** kick and ban players, X-ray (see every cup), rig your own dice, and give or take doubloons and goods on any account. All of them are checked by the Supabase server or by the host against the server, so other players can't fake being admin.

## Rebuilding the 3D characters

The parts are modelled from code in `art/build_pirates.py`. To change them, edit the script and run:

```
blender --background --factory-startup --python art/build_pirates.py -- models/pirates.glb
blender --background --factory-startup --python art/render_icon.py -- .
```

After rebuilding, regenerate the embedded copy that lets the game run from a double-clicked `index.html` (Git Bash):

```
printf 'window.PIRATES_GLB_B64="%s";\n' "$(base64 -w0 models/pirates.glb)" > models/pirates.js
```

The first command rebuilds `models/pirates.glb`. The second re-renders the app icons. When you release a new version, bump `VERSION` in `sw.js` so installed apps pick up the update.

## Files

```
index.html            page + all screens
css/style.css         styles (desktop + mobile)
js/engine.js          rules engine (pure logic)
js/bot.js             bot AI
js/dice.js            dice kits + SVG dice renderer
js/avatar.js          pirate portrait renderer
js/net.js             online play (PeerJS / WebRTC)
js/app.js             UI + game controller
manifest.webmanifest  "Add to Home Screen" support
icon.svg
```

## Putting it on the internet

Upload the whole folder to any static host. Any of these work:

- **Netlify Drop**: go to https://app.netlify.com/drop and drag the folder in.
- **GitHub Pages**: push the folder to a repo, then turn on Settings → Pages → "Deploy from branch".
- **Cloudflare Pages / Vercel / itch.io (HTML game)**: upload the folder as a static site.

Use **https** (all the hosts above do). Phones need it for fullscreen and install-to-home-screen.

## How online play works

The host's browser runs the game, and other players connect straight to it over WebRTC. Players find each other through the free public PeerJS signalling server (`0.peerjs.com`), loaded from unpkg.

Things to know before a big launch:

- The public PeerJS server is a free shared service with no uptime guarantee. For a serious launch, run your own: `npx peer --port 9000` (see https://github.com/peers/peerjs-server), then pass `{ host, port, path, secure: true }` to `new Peer(...)` in `js/net.js`.
- Only Google's STUN server is configured. Some strict networks (certain corporate or mobile carrier NATs) need a TURN relay. If players report "can't connect", add a TURN server to the Peer `config.iceServers`.
- If the host leaves, the match ends for everyone.
- A player who idles 45 seconds on their turn gets an automatic wager made for them.

## Running it locally

Open `index.html` through any local web server (for example `npx serve .` or `python -m http.server`) and visit the address it prints.

## CrazyGames build

`bash tools/build-crazygames.sh` makes `builds/bones-and-brine-crazygames.zip` (upload it in the CrazyGames developer portal; `index.html` is at the root of the zip). The build adds the CrazyGames SDK v3 and `js/crazy.js`, which reports loading and gameplay, celebrates wins (happytime), shows a midgame ad after a game ends (sound muted during it), uses CrazyGames invite links and the invite button for lobbies, joins a friend straight from an invite, starts a Quick Game for "instant multiplayer", and follows the portal's mute and disable-chat settings. Share/Brag buttons are hidden there and the offline service worker is skipped. Accounts, Quick Game and the leaderboard are shared with the GitHub Pages version. Run the script again after each update and upload the new zip.
