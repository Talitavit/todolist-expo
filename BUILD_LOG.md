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
