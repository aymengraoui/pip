# Pip 1.4.0 — plan

> **Status.** #2, #3 and #4 are built. #1 was deliberately **not** built: see the
> note under it. What shipped instead is a Review button that jumps to the
> terminal, which needs no hook changes at all.

Four features, one release. They share a theme: Pip stops being a thing that
reports and becomes a thing that participates. Ordered by what I'd build first.

Everything here is local. No model calls, no network beyond the update check.

---

## The finding that makes #1 possible

Claude Code hooks are two-way, and there is an event built for exactly this.
A `PermissionRequest` hook returns a decision on stdout:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": { "behavior": "allow" }
  }
}
```

`behavior` is `allow` or `deny`, with an optional `updatedInput`. Exit code 2 is
*not* honoured for this event, so the only way to decide is the JSON — which
suits us: the relay can only ever act by deliberately printing, never by failing.
Printing nothing leaves the normal permission flow untouched.

Hook `timeout` is per-entry and defaults to 600s for command hooks. **We install
`timeout: 5` on every event today** (`electron/hooks.js`), which is right for the
other eleven and far too short to wait for a person. 1.4.0 has to write a longer
timeout on the `PermissionRequest` entry alone, which means existing users need
their hooks rewritten — Pip should notice an old-shaped install and offer it.

Source: https://code.claude.com/docs/en/hooks

---

## 1. Answer from the notch — NOT BUILT, by choice

**What shipped instead:** a **Review →** button on the notch (and the tray, and
the panel) that raises the terminal that is asking. One click to the decision,
with the decision still made where the whole command is visible.

**Why.** Writing the decision path into `resources/hook.js` means a background
desktop app can answer Claude Code permission prompts — the main guardrail
between a tool call and the machine. The mitigations below are real, but they
do not change what the capability is: the decision moves from a terminal where
you read the command to a button on a notch. An automated safety check refused
the edit, and that was the right call. The design below is kept because it is
sound and might be wanted deliberately one day, behind an explicit decision
rather than as a convenience.

## 1. (design kept for reference) Answer from the notch

**What.** A permission prompt appears in the notch with **Allow** and **Deny**.
Click, and Claude carries on. You never go to the terminal.

**How.**

- `resources/hook.js`, on `PermissionRequest` only: write
  `%APPDATA%\Pip\ask\<id>.json` (id = `session_id` + `tool_use_id`), then poll for
  `<id>.decision` for up to ~20s. If one appears, print the decision JSON and
  exit. Otherwise print nothing and exit 0, and the terminal prompt behaves
  exactly as it does today.
- `electron/main.js` watches the `ask` directory (`fs.watch`), pushes pending
  asks to the renderer, and writes the `.decision` file on click.
- The notch opens itself for an ask, shows the tool and its detail, and offers
  the two buttons. The inspector's amber box gets them too.
- `electron/updater.js` already proves the pattern: a main-process module with
  its own state, surfaced through `publicState()`.

**Safety.** This inverts the relay's founding rule ("never print to stdout"), so
the inversion has to be surgical:

- Opt-in. Default **off**, one switch in Settings.
- A heartbeat: the main process touches `%APPDATA%\Pip\alive` every 10s. The
  relay only waits if that file is younger than 30s. Pip closed, crashed or
  paused means no wait at all — the hook returns instantly, as now.
- The wait is bounded well under the hook's own timeout, and every failure path
  exits 0 silently.
- Still never prints for the other eleven events. The gate is the event name,
  checked first.

**Testable.** This is the first thing in Pip that can hurt a session, so it gets
a real test: run `hook.js` as a child process with a `PermissionRequest` payload
on stdin, with and without a heartbeat, with and without a decision file, and
assert stdout is exactly right (including *empty* in every fallback case). Node
test, no Electron, runs in CI next to the smoke suite.

**Risk if wrong:** a hung hook stalls Claude for the timeout. Mitigated above,
and the blast radius is one tool call.

**Effort:** ~1 day, most of it on the failure paths.

---

## 2. "I think it's stuck"

**What.** Pip notices Claude spinning before you do and says so: a worried face,
a line in the notch, a flag on the row.

**How.** Pure heuristics over the activity log that `model.js` already keeps. A
new `engine/watchdog.js`, run on model change, never per frame:

| signal | rule |
| --- | --- |
| loop | same `tool` + `text` three times inside four minutes |
| stall | state is `working`/`thinking` and no event for ten minutes |
| overrun | an agent running past 3× the median for that agent type |

Medians come from a small rolling table per agent type, kept in `settings.json`,
so it gets better the longer Pip runs and is useless on day one. That's fine —
say nothing until there are enough samples.

Surfacing: a `stuck` flag on the session/agent, a new `worried` emote, and a
line in the inspector saying *which* rule fired and what it saw. Never a popup.

**Effort:** half a day. Mostly choosing thresholds that don't cry wolf.

---

## 3. Make the playground mean something

**What.** The sproutlings stop moving at random and start moving on the data, so
the playground becomes a readout you can learn to glance at.

**How.** `minis.js` already has the wander loop; swap the random target for a few
weighted pulls, recomputed on model change rather than per frame:

- agents touching the same directory drift together
- an agent that just failed slumps and dims
- tools-per-minute drives how much it moves
- background agents settle at the edge, out of the way

**Effort:** half a day, nearly all of it tuning. The engine already supports
everything this needs.

---

## 4. While you were away

**What.** Come back after a few minutes and Pip tells you what you missed:
*"2 turns finished, 1 failure, Explore still running."*

**How.** `GetLastInputInfo` in `electron/windows.js` gives real idle time in two
Win32 calls; the foreground-window check already there says whether you're even
looking at the terminal. Away is "idle > 3 min, or the terminal hasn't been
foreground for 3 min". On return, diff the model against a snapshot taken when
you left, and if anything happened, open the notch with a digest line. Clicking
it opens the inspector on whatever matters most.

**Effort:** half a day.

---

## Sequence

1. **#1** first: biggest value, biggest unknown now resolved, and the hook
   timeout change wants to land early so the reinstall prompt is in people's
   hands sooner.
2. **#2**, which shares the activity-log reading.
3. **#4**, which is self-contained.
4. **#3** last, because it is the one that benefits from being tuned against the
   other three running in anger.

## Ships with it

- Settings: "Answer permission prompts from the notch" (off), "Tell me when
  something looks stuck" (on).
- A hook-decision test in CI, and smoke coverage for #2, #3 and #4.
- `CLAUDE.md`: the two-way hook contract, the heartbeat, and why the relay is
  allowed to print exactly once.
- README + release notes.

## Open questions

- Does `PermissionRequest` fire for every prompt, or only some tools? Check
  against a real session before building the UI around it.
- What does the terminal show while the hook is waiting? If it is silent or
  confusing, the wait wants to be very short (5–10s), with Pip's button only a
  shortcut rather than the primary path.
- `updatedInput` lets a decision rewrite the tool's arguments. Out of scope for
  1.4.0, but worth knowing it exists: "allow, but with `--dry-run`".
