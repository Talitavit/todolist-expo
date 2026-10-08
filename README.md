# To-Do (Expo / React Native)

Mobile to-do app with SQLite persistence, categories, filters, optional due date/time and
scheduled **local** notifications. Built with Expo SDK 57, Expo Router, `expo-sqlite` and
`expo-notifications`.

The full development history (decisions, errors, fixes) is in [BUILD_LOG.md](BUILD_LOG.md).

## Features

- **Task List** (`src/app/index.tsx`): status filter (All / Pending / Completed), category filter
  (All / each category / Uncategorized), tap the circle to complete/reopen, tap a task to edit,
  `+` to create, "Categories" in the header.
- **Task Editor** (`src/app/task/[id].tsx`): title (required), description, category, due date,
  due time, completed switch; Save / Cancel / Delete.
- **Categories** (`src/app/categories.tsx`): list with task counts, create, rename (and recolor),
  delete. Tasks of a deleted category become *uncategorized*.
- **Reminders**: a local notification is scheduled at the due date/time of pending tasks; it is
  rescheduled or cancelled when the task is edited, completed, reopened or deleted. Tapping the
  notification opens the task.

## Requirements

- Node.js 20+ (developed with Node 24) and npm
- Android SDK with an emulator or a device with USB debugging enabled
- JDK 17 (`JAVA_HOME`)

> **Expo Go is not supported.** Since SDK 53, `expo-notifications` throws on import inside
> Expo Go on Android, so the app must run as a **development build** (see BUILD_LOG Entry 4).

## Running (Android)

```bash
npm install
```

```bash
npx expo run:android
```

This generates the native `android/` project (git-ignored, Continuous Native Generation), builds a
debug APK, installs it on the running emulator/device and starts Metro. Next time, if only
JavaScript changed, `npx expo start` is enough (the installed development build connects to it).

If port 8081 is busy, use `npx expo run:android --port 8082`.

### Physical Android phone (USB debugging)

`--device` takes the device **name** (model), not the adb serial. List devices with `adb devices -l`.

```bash
npx expo run:android --device 23129RA5FL --port 8082
```

If the app's launcher can't reach Metro over Wi-Fi (e.g. on a restricted network), tunnel it over USB
and enter `http://127.0.0.1:8082` in the launcher's URL field:

```bash
adb -s <serial> reverse tcp:8082 tcp:8082
```

### Known build note: `react-native-gesture-handler` is excluded from autolinking

`package.json` → `expo.autolinking.exclude` skips `react-native-gesture-handler`. On Windows its C++
codegen paths exceed 260 characters ("Filename longer than 260 characters"). The app doesn't use it
(it's an optional peer of `expo-router`, needed only by `expo-router/js-stack`). See BUILD_LOG Entry 6.

### Windows troubleshooting: `Unable to establish loopback connection`

On some Windows machines (e.g. lab PCs with managed user profiles) Gradle fails with
`java.io.IOException: Unable to establish loopback connection`. The JDK cannot use Unix-domain
sockets inside the user profile's temp folder. Point it to a folder outside the profile
(PowerShell):

```powershell
New-Item -ItemType Directory -Force C:\gtmp
$env:JAVA_TOOL_OPTIONS = '-Djdk.net.unixdomain.tmpdir=C:\gtmp'
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.16.8-hotspot'   # adjust to your JDK 17
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
npx expo run:android
```

## Known limitations

- Tested on Android only (emulator API 37 and a Redmi Note 13). iOS code paths exist but were not run.
- Reminders use inexact alarms, so Android may deliver them a few minutes after the due time.
- Reminders don't repeat and there's no snooze. Tasks with a past due date get no reminder (the editor
  shows a warning).
- The development build's floating "Tools" button can cover the "Categories" header link.

## Checks

```bash
npm run typecheck
```

```bash
npx expo lint
```

```bash
npx expo-doctor
```

## Project structure

```
src/
  app/                 Expo Router screens
    _layout.tsx        SQLiteProvider, Stack navigator, notification setup
    index.tsx          Task List
    task/[id].tsx      Task Editor ("new" or task id)
    categories.tsx     Category Management
  db/                  schema/migrations + repositories (plain SQL)
  notifications/       expo-notifications wrapper
  services/            task operations that keep SQLite and reminders in sync
  components/ hooks/ utils/ theme.ts types.ts
```
