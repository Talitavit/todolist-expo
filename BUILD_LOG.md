# BUILD_LOG.md — Mobile To-Do App (Expo / React Native)

This file records the real development history of the project, in chronological order.
Earlier entries are never rewritten; corrections are added as new entries.

**Tooling used for the whole project**

- Coding agent: Claude Code (desktop app, "Code" tab), model **Claude Opus 5.5** (`claude-opus-5-5`).
- No other coding agents or AI models were used unless a later entry says otherwise.
- OS: Windows 11, Node.js 24.14.0, npm 11.9.0, Android SDK with AVD `Medium_Phone` (Android 37 image).

---

## Entry 1 — Project initialization

### Prompt / Request

The user pasted the full "Mobile To-Do App — Implementation Specification" plus the activity statement:

> "The goal of this activity is to implement the provided specification using Expo and React Native and then answer the proposed questionnaire based on the resulting project. [...] For this activity, do not write code manually. [...] The complete project must be hosted in a GitHub repository. [...] You may also instruct the coding agent to create Git commits throughout the development process."

Spec highlights: SQLite persistence, 3 screens (Task List, Task Editor, Category Management), categories, status + category filtering, optional due date/time, scheduled local notifications, and "KEEP `BUILD_LOG.md` UPDATED".

### Decision Summary

- Scaffolded with `npx create-expo-app@latest . --template blank-typescript`. This produced **Expo SDK 57** (`expo ~57.0.27`, `react-native 0.86.3`, `react 19.2.3`, TypeScript 6).
- The template ships an `AGENTS.md` that warns Expo APIs change every SDK release. Following it, the agent fetched the **v57 docs** for `expo-sqlite`, `expo-notifications`, the date-time picker, and Expo Router *before* writing code, instead of relying on memory. Findings that shaped the design:
  - `expo-sqlite` exposes an async API (`runAsync`, `getAllAsync`, `getFirstAsync`, `withTransactionAsync`) and a React `SQLiteProvider` with an `onInit` migration hook based on `PRAGMA user_version`.
  - `expo-notifications`: push notifications are not available in Expo Go on Android since SDK 53, but **local scheduled notifications still work in Expo Go**. Date triggers use `{ type: SchedulableTriggerInputTypes.DATE, date }`. `setNotificationHandler` now uses `shouldShowBanner`/`shouldShowList` (`shouldShowAlert` is deprecated). On Android 13+ a channel must exist before the permission prompt appears.
  - `@react-native-community/datetimepicker` is included in Expo Go.
  - Expo Router is the recommended navigation library (file-based routes in `src/app/`).
- Validation target: Android emulator (`Medium_Phone` AVD found in the local Android SDK) running the app in **Expo Go**. Since all chosen native modules are in Expo Go, no custom development build is needed.

### Actions Performed

- Created the Expo project in the (empty) working directory.
- Created this `BUILD_LOG.md`.
- Started the Android emulator in the background for later testing.

### Result

Project scaffold created; template app not yet modified.

### Problems / Errors

None.

### Fixes Attempted

N/A.

### Current Status

Completed.

---

## Entry 2 — Dependencies and Expo Router setup

### Prompt / Request

Same initial request (spec sections 5, 7, 10, 17, 18: "initialize project → create basic navigation → configure SQLite").

### Decision Summary

Dependencies (all installed with `npx expo install` so versions match SDK 57):

| Dependency | Purpose | Why |
|---|---|---|
| `expo-router` (+ `react-native-screens`, `react-native-safe-area-context`, `expo-linking`, `expo-constants`) | Stack navigation between the 3 screens | Recommended by Expo / the template's `AGENTS.md`; file-based routes keep navigation simple. |
| `expo-sqlite` | Local SQLite database | First-party Expo module, works in Expo Go, has a React provider and async API. No ORM needed for 2 tables. |
| `expo-notifications` | Scheduled **local** notifications | First-party; local DATE triggers work in Expo Go and need no push server. |
| `@react-native-community/datetimepicker` | Native date and time pickers | Included in Expo Go; native dialogs on Android. |
| `react-dom` | Peer dependency (see Problems) | Required so `npm` stops trying to pull an incompatible version. |

- `package.json` `main` changed to `expo-router/entry`; template `App.tsx`/`index.ts` removed.
- Routes live in `src/app/`; `tsconfig.json` got the `@/*` → `src/*` alias.
- `app.json`: `scheme: "todolist"`, typed routes, Android package id, `expo-notifications` plugin, and `SCHEDULE_EXACT_ALARM` / `POST_NOTIFICATIONS` Android permissions. (These manifest entries only matter for a future development/production build; Expo Go uses its own manifest.)

### Actions Performed

- Installed the packages above, edited `package.json`, `app.json`, `tsconfig.json`.
- Set a repository-local git identity (no global git user was configured on the lab machine).

### Result

`npx expo-doctor`: 21/21 checks passed.

### Problems / Errors

1. `git commit` failed: "Author identity unknown".
2. `npx expo lint` (first run, which auto-installs ESLint) failed with `ERESOLVE`: npm tried to install the optional peer `react-dom@19.3.0`, which requires `react@^19.3.0`, but SDK 57 pins `react@19.2.3`.
3. The Android emulator started from a background shell shut itself down twice right after booting ("Not saving state", adb "device offline").

### Fixes Attempted

- (1) Set `user.name`/`user.email` in the repo-local git config only.
- (2) `npx expo install react-dom` installed the SDK-matching `react-dom@19.2.3`; afterwards ESLint (`eslint`, `eslint-config-expo`) installed successfully and `eslint.config.js` was generated.
- (3) First retry with `Start-Process` (detached) still died. Second retry with `-gpu swiftshader_indirect` and stdout/stderr redirected to a log file kept the emulator alive (WHPX acceleration operational).

### Current Status

Completed.

---

## Entry 3 — Data model, SQLite layer, notifications, screens (first full implementation)

### Prompt / Request

Same initial request (spec sections 3–16).

### Decision Summary

**Architecture** — small layered / repository-style structure, no extra state library:

```
src/
  app/                  Expo Router screens (UI only)
    _layout.tsx         SQLiteProvider + Stack navigator + notification side effects
    index.tsx           Screen 1 — Task List (filters)
    task/[id].tsx       Screen 2 — Task Editor ("new" or numeric id)
    categories.tsx      Screen 3 — Category Management
  db/                   SQL only (schema/migrations, task + category repositories)
  notifications/        expo-notifications wrapper (permission, schedule, cancel)
  services/taskService  Orchestrates DB + notifications for task writes
  components/           Chip, TaskItem, DueDateField
  hooks/, utils/, theme.ts, types.ts
```

**Task model** (`tasks` table) — required fields plus extras:
- `id INTEGER PK AUTOINCREMENT`, `title TEXT NOT NULL` (CHECK non-blank), `description TEXT NULL`, `completed INTEGER 0/1`, `due_date_time INTEGER NULL` (epoch ms), `created_at INTEGER`, `category_id INTEGER NULL REFERENCES categories ON DELETE SET NULL`.
- **Additional fields**: `updated_at` (last modification time) and `notification_id` (identifier returned by `scheduleNotificationAsync`, used to cancel/reschedule the reminder).
- Dates are stored as integers (epoch ms) to avoid time-zone/string parsing issues and to sort/compare easily in SQL.

**Category model** (`categories` table): `id`, `name` (UNIQUE, case-insensitive via `COLLATE NOCASE`), and an extra `color` field for the badge. Four default categories (Personal, Work, Study, Shopping) are seeded on first launch.

**SQLite approach**: `expo-sqlite` async API with plain SQL in small repository modules (`src/db/tasks.ts`, `src/db/categories.ts`); no ORM. `<SQLiteProvider onInit={migrateDbIfNeeded}>` opens `todo.db` once; migrations are versioned with `PRAGMA user_version`. `PRAGMA foreign_keys = ON` is executed on every open because it is a per-connection setting. WAL journal mode is enabled. Screens get the DB with `useSQLiteContext()`.

**Category deletion policy**: tasks become **uncategorized**. Implemented with `ON DELETE SET NULL` *and* an explicit `UPDATE tasks SET category_id = NULL` inside the same transaction (defensive, in case FK enforcement were off). The confirmation dialog tells the user how many tasks will be affected. Alternatives considered: blocking deletion (annoying for the user) or reassigning (needs an extra picker UI).

**Navigation / data transfer**: Stack navigator. Editor route is `/task/[id]`; only the **task id** is passed (`"new"` for creation). The editor re-reads the task from SQLite, so it always shows the persisted state and route params stay small/serializable. Task list header has a "Categories" button; the editor also has a "Manage categories" link.

**State management**: SQLite is the single source of truth. Each screen keeps local `useState` and reloads from the DB in `useFocusEffect` (so returning from the editor or categories screen refreshes the list) and whenever a filter changes. After an action (toggle, delete, rename…) the screen re-queries. No Redux/Zustand/context store — unnecessary for 3 screens.

**Filtering**: done in **SQL** (`WHERE t.completed = ?` / `t.category_id = ?` / `IS NULL`) in `listTasks(db, status, category)`. Category filter options: All, each category, and "Uncategorized". If the selected category is deleted, the filter falls back to "All".

**Notification strategy** (`src/services/taskService.ts`):
- One rule for every write (create, edit, complete, reopen): *cancel the task's stored `notification_id` (if any), then schedule a new DATE-trigger notification if the task is pending and its due date is in the future, and store the new id (or NULL)*. This covers: created with future date, date changed, date removed, completed, reopened-with-future-date.
- Delete: row deleted, then its reminder is cancelled.
- Notification content: title "Task reminder", body = task title, `data.taskId`. Tapping the notification opens that task in the editor (`useLastNotificationResponse`).
- Android channel `task-reminders` (HIGH importance) created at startup.
- Startup repair: pending future tasks whose reminder is missing from `getAllScheduledNotificationsAsync()` are rescheduled (without prompting).

**Permissions**: requested *in context*, the first time the user saves a task that actually needs a reminder (not on app launch). `canAskAgain` is respected. If denied, the task is still saved and an alert explains that no reminder will be shown. Toggling completion from the list never prompts. All permission/schedule/cancel calls are wrapped in try/catch and never crash the app.

**Error handling**: `ValidationError` for user-input problems (empty/too-long title or category name, duplicate category name mapped from SQLite `UNIQUE constraint failed`, invalid date) shown inline; other errors (SQLite) shown with `Alert`. Due dates in the past are allowed but show a warning ("no reminder will be scheduled"). Overdue pending tasks are highlighted in red in the list.

**Date picker**: v9 of `@react-native-community/datetimepicker` deprecates `onChange`; the new `onValueChange` + `onDismiss` props are used. Android shows separate date and time dialogs; iOS uses compact inline pickers.

### Actions Performed

- Created all files listed above.

### Result

`npx tsc --noEmit` passed on the first try.

### Problems / Errors

`npx expo lint` reported 2 errors (`react-hooks/purity`): `Date.now()` was called during render in `TaskItem` (overdue check) and `DueDateField` (past-date warning).

### Fixes Attempted

Added `src/hooks/useNow.ts` (current time kept in state, refreshed every 30 s) and passed `now` into those components. Side benefit: "Overdue" labels update while the screen stays open. Lint and typecheck now pass with 0 problems.

### Current Status

Needs testing (runtime test on the Android emulator is next).

---

## Entry 4 — First runtime test in Expo Go: app fails to load (expo-notifications)

### Prompt / Request

Spec section 19 ("Do not assume that generated code is correct. Whenever possible: build the project; run it; ...").

### Decision Summary

Run the app on the Android emulator with Expo Go (`npx expo start --android`), as planned in Entry 1.

### Actions Performed

- `npx expo start --android` → port 8081 was already used by another (unrelated) Node process, so the server was started on port **8082**.
- Expo CLI installed Expo Go on the emulator and Metro bundled successfully (`Android Bundled 24683ms ... (1532 modules)`).

### Result

**Broken.** The app never rendered.

### Problems / Errors

1. The device stayed on "Bundling 56%..." even though Metro reported the bundle as done. The device was loading from the LAN IP (`exp://10.35.23.13:8082`), which appears to be blocked/stalled on the lab network.
2. After fixing (1), the app showed a red screen:
   ```
   Uncaught Error: expo-notifications: Android Push notifications (remote notifications)
   functionality provided by expo-notifications was removed from Expo Go with the release
   of SDK 53. Use a development build instead of Expo Go.
   ```
   followed by `Route "./_layout.tsx" is missing the required default export` and
   `TypeError: Cannot read property 'ErrorBoundary' of undefined`.
   The error is thrown while *importing* the module, so every route that imports it fails to load.
   Root cause (found by reading `node_modules/expo-notifications/build`): the package entry point imports the side-effect module `DevicePushTokenAutoRegistration.fx.js`, which calls `addPushTokenListener()` at import time; that function calls `warnOfExpoGoPushUsage()`, which **throws on Android when running in Expo Go**.
   **Incorrect assumption:** Entry 1 assumed (from the docs page) that local notifications still work in Expo Go on Android. With `expo-notifications@57.0.22` the module cannot even be imported there.

### Fixes Attempted

- (1) `adb reverse tcp:8082 tcp:8082` and opened `exp://127.0.0.1:8082` → bundle loaded.
- (2) Alternatives considered:
  - deep-importing individual files from `expo-notifications/build/...` to skip the side-effect module — rejected: relies on private package internals and could break on any update;
  - disabling notifications when running in Expo Go — rejected: the spec requires working notifications;
  - **chosen:** switch to a **development build** (`npx expo run:android`), the approach recommended by the error message, the Expo docs and the template's `AGENTS.md`. Added `expo-dev-client` (`~57.0.19`) so the debug app has the dev launcher and can connect to Metro on port 8082. Build uses the local Android SDK and JDK 17 (`JAVA_HOME` set explicitly because JDK 25 is first on `PATH`). The generated `android/` folder stays git-ignored (Continuous Native Generation): the `app.json` permissions/plugins from Entry 2 now actually take effect.

### Current Status

Blocked → fix in progress (development build).

---

## Entry 5 — Development build: Gradle "Unable to establish loopback connection"

### Prompt / Request

Continuation of Entry 4. Mid-way the user asked (in Portuguese): *"deu uns erro ai, tai fazendo oq agora"* ("there were some errors there, what are you doing now?"). The agent summarized the two blocking errors and the fix in progress.

### Decision Summary

Keep the development-build approach; diagnose the Gradle failure rather than going back to Expo Go.

### Actions Performed

1. `npx expo run:android --port 8082` → `expo prebuild` generated `android/`, then Gradle failed.
2. Port 8082 was still held by the orphaned Expo Go Metro process from Entry 4; that process (started by the agent) was stopped.
3. Gradle run with `--stacktrace` to get the root cause.

### Result

Gradle could not even start its daemon connection.

### Problems / Errors

```
* What went wrong:
java.io.IOException: Unable to establish loopback connection
Caused by: java.net.SocketException: Invalid argument: connect
    at sun.nio.ch.UnixDomainSockets.connect0(Native Method)
    at sun.nio.ch.PipeImpl$Initializer$LoopbackConnector.run(PipeImpl.java:133)
```

On Windows, JDK 16+ implements NIO `Selector` wake-up pipes with **AF_UNIX sockets** created in the temp directory. Reading `PipeImpl.java` / `UnixDomainSocketsUtil.java` from the JDK's `src.zip` showed: the socket *binds* successfully but `connect` fails with EINVAL, and the JDK does not fall back to TCP in that case. The temp dir is resolved from `jdk.net.unixdomain.tmpdir`, then `%TEMP%`.

### Fixes Attempted

| Attempt | Result |
|---|---|
| Run Gradle from PowerShell instead of Git Bash | Same error |
| `TEMP`/`TMP` changed from the 8.3 short path (`C:\Users\ALUNO~2.LAB\...`) to the long path | Same error |
| Run outside the agent's command sandbox | Same error → not caused by the agent tooling |
| JDK 25 instead of JDK 17 | Same error |
| `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:\gtmp` (directory **outside the lab user profile**) | **Fixed** — Gradle started; next error was only `SDK location not found` because `ANDROID_HOME` had not been exported in that test shell. |

Conclusion: AF_UNIX sockets do not work inside this lab machine's user-profile directory (probably a profile/file-system policy of the lab environment). The workaround is documented in `README.md`. It is only needed on machines with this problem.

### Current Status

Partially completed — full `npx expo run:android` build in progress with `JAVA_HOME` (JDK 17), `ANDROID_HOME` and `JAVA_TOOL_OPTIONS` set.
