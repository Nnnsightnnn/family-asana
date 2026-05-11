# Invite message — copy/paste for new family members

Send this in iMessage / SMS when adding someone new. **Before sending**, do this once on your side:

1. Tailscale admin → Users → "Invite users" → enter their email → send. (They'll get a Tailscale email separate from your text.)
2. Then text them the message below.

---

## The text (plain — no markdown, iMessage-safe)

```
Hey! Made a little task app for our family — projects, lists, board view, works on your phone. No App Store download for it; it's a website behind our home network.

Two-step setup:

1. Install Tailscale (App Store / Play Store). When you open it, sign in with the link I'm sending you in a sec. That puts you on our family network.

2. Open http://ncit:4000 in Safari (or Chrome). Type your email, tap "Send sign-in link." Check your inbox (from no-reply@mail.nnnsightnnn.com) — tap the link. You're in.

Bookmark it, or tap Share → "Add to Home Screen" and it lives on your dock like a real app.

If the page won't load later: open Tailscale, make sure the toggle is on. That's almost always the answer.
```

---

## Images to attach

- **Login screenshot** — a shot of the "Welcome home" screen at `http://ncit:4000/login`. Shows them what to expect on step 2. (Open the URL on your Mac/phone, take a screenshot, attach.)
- **(Optional) Dashboard screenshot** — once you have a couple of projects populated, swap in a list/board view shot. Much stronger than the empty login screen.

---

## After they're in

- They'll show up in the sidebar / task assignee list with whatever name their email maps to (e.g. `carrie@example.com` → "Carrie"). To set a nicer name or pick an avatar color: `tailscale ssh ncit`, then
  ```powershell
  sqlite3 C:\family-asana\server\data\family-asana.db "UPDATE users SET name='Carrie', avatar_color='#6B8A6E' WHERE email='carrie@example.com';"
  ```
  (Stoop Light colors: `#A86A4B` clay, `#6B8A6E` sage, `#5A7A8E` slate.)

- To verify they signed in: `C:\family-asana\scripts\admin.ps1 list-users`.

- If their magic-link email doesn't arrive: check Resend → Emails tab; the send attempt will show there with delivery status.
