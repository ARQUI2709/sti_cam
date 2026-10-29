---
description: How to commit changes with SemVer version bump in Footer
---

# Commit Workflow

Follow these exact steps every time a commit is requested.

---

## Step 1 — Classify the change using SemVer

Before doing anything else, analyze ALL changes made in the session and classify them as the highest-impact type:

| Type | When to use |
|------|-------------|
| **PATCH** (Z) | Bug fixes, text corrections, minor style adjustments, prompt tuning — no new features, no breaking changes |
| **MINOR** (Y) | New features, new UI sections, new integrations, new validations — backward compatible |
| **MAJOR** (X) | Breaking changes: API contract changes, data structure changes, auth flow changes, anything that breaks existing behavior |

**If multiple changes coexist, use the highest-impact type.**

### Version format: `X.Y.Z`
- No leading zeros. Integers only.
- Pre-release suffix allowed: `X.Y.Z-alpha`, `X.Y.Z-beta`, `X.Y.Z-rc.1`
- Build metadata allowed: `X.Y.Z+build.N`

---

## Step 2 — Read the current version

Read `src/components/Footer.jsx` and extract the current version from the string `ver X.Y.Z`.

---

## Step 3 — Calculate the new version

Apply the SemVer rule:
- **PATCH**: increment Z by 1. Keep X and Y unchanged.
- **MINOR**: increment Y by 1. Reset Z to 0. Keep X unchanged.
- **MAJOR**: increment X by 1. Reset Y and Z to 0.

---

## Step 4 — Update the footer

Edit `src/components/Footer.jsx`. Replace the version string (e.g., `ver1.0.20`) with the new version (e.g., `ver1.1.0`).

---

## Step 5 — Stage all changes

```
git add .
```

---

## Step 6 — Commit

Write a clear, concise commit message following this structure:

```
<type>: <short description>

- Change 1
- Change 2
...

Version bump: X.Y.Z → X.Y.Z (PATCH|MINOR|MAJOR)
Reason: <one sentence justifying the version type>
```

Where `<type>` is one of: `feat`, `fix`, `style`, `refactor`, `chore`, `docs`.

```
git commit -m "<message>"
```

---

## Step 7 — Push

```
git push
```

---

## Step 8 — Report to the user

After pushing, report a summary using this format:

1. **Change type**: PATCH / MINOR / MAJOR
2. **New version**: `X.Y.Z`
3. **Justification**: Brief reason why this level was chosen
4. **Changes included**: Bullet list of what was committed
5. **Compatibility risk**: Low / Medium / High
