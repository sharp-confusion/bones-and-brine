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
