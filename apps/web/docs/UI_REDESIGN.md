# AbbasiConnect interface redesign

This change replaces the presentation of the existing community application. It covers entry, sign-in, registration, Home, Rishte, family trees, Community, Messages, Account, and all three administration tabs.

The design uses a compact deep blue masthead, white working surfaces, peacock actions, a locally served Source Sans 3 font, and member initials derived from existing names. It includes responsive navigation, mobile conversation switching, keyboard focus states, labeled form controls, native tree scrolling, and reduced-motion support. Module transitions and interaction feedback are short; there are no continuously animated decorations or animation dependencies.

## Preserved behavior

- No API, database, schema, authentication, deployment, package, or dependency changes.
- `e2ee.ts`, `realtime.ts`, and `performance.ts` are unchanged.
- The existing 35 member and administrator API call sites retain their arguments, methods, and request bodies.
- Home retains its four summary requests, three community excerpts, two recent conversation names, and domain-specific live updates. Those requests keep the original summary request headers.
- Rishte retains the same filters, listing fields, publish/pause/delete actions, interest actions, and native optional-note prompt. Canceling that prompt still submits an empty note, as before.
- Family invitations, uppercase claim codes, tree permissions, and approval actions retain their endpoints and payloads. Family events retain the existing refresh of the signed-in member's tree.
- Community publishing, likes, comments, own-post deletion, native sharing, and clipboard fallback retain their data and actions.
- Opening a conversation retains the existing read request. Returning to the mobile conversation list makes no extra read request. Encryption provisioning, ciphertext envelopes, legacy message rendering, and secure-setup restrictions are preserved.
- Account fields and the directory visibility setting are preserved. Saved-profile and invitation-code alerts use visible inline feedback.
- Administrative roles, suspension/restoration, directory controls, reports, and optional-note prompt behavior are preserved.
- The existing admin route, lazy admin loading, token storage, API preconnect, and GitHub Pages base path are preserved.

## Implementation

`Home.tsx` and `FamilyTree.tsx` replace the two scripts that changed React-owned DOM through mutation observers. The obsolete enhancer scripts and the overlapping polish/dashboard stylesheets are removed.

`familyLayout.ts` places people by stable IDs and actual relation types. Custom labels are displayed as supplied, but do not determine ancestry. Parents, children, siblings and spouses use generation constraints. Unknown or conflicting relations use neutral dashed links. Every returned person remains represented; no shared parent is invented. The relationship disclosure retains a text representation of every supplied edge, including custom labels and status.

The graph uses HTML buttons and SVG connectors. It scrolls natively, retains browser zoom, centers the tree owner on initial opening, and preserves the viewport on updates. It adds no graph library, export, filter, or editing feature.

Messages use the visual viewport height for the mobile composer and preserve a reader's position when they are reviewing earlier messages. Only newly arriving messages animate; opening a thread does not animate the entire history.

## Verification

Baseline: `0e1ef885111c7156bb35aa024017ad56efc67241`.

The production TypeScript/Vite build was checked with both the default base and `/AbbasiConnect/`. Compiled font and application asset paths were checked for the GitHub Pages base. All non-web tracked files and the three protected web transport/crypto files were compared byte for byte with the baseline.

Eight native Node regression tests cover family layout directions, duplicate names, custom labels, invited people, a non-first root, conflicting cycles, disconnected components, missing endpoints, and a 171-person tree without overlapping nodes or dropped data:

```sh
node --experimental-strip-types --test apps/web/tests/familyLayout.test.mjs
```

An isolated DOM harness passed 75 checks using mocked API responses and real Web Crypto encryption. It exercised sign-in, OTP registration, Home live refresh, all member modules, both share paths, mutation errors, mobile conversation selection/back, encrypted and legacy messages, secure-setup gating, account saving, and every administrative action. Test fixture data and test dependencies were kept outside the application; no production requests were made.

Browser screenshots, physical-device checks, and live API smoke testing have not been performed. The DOM checks validate workflows and semantics; they do not measure rendered geometry or real-device performance. Those visual checks remain part of release review, especially keyboard behavior on iOS/Android, 320–430 px layouts, large family graphs, text enlargement, and reduced motion.

## Delivery

The code is prepared on a separate review branch. Publishing this branch does not merge it or deploy it. The existing GitHub Pages workflow remains the deployment path after the normal review and merge process.
