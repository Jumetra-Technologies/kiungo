# Changelog

Changes to the Kiungo desktop app. Versions are the app's (`apps/desktop/package.json`) and follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html): patch for fixes, minor for new features, major for a change that breaks saved projects. The newest section is what the release notes say (`.github/scripts/desktop-release-manifest.mjs`), and `__tests__/Version.test.ts` fails if the app's version has no section here.

Versions up to 0.13.3 were released from `jumetra-frontend`; their notes are in its CHANGELOG.

## [0.14.0] - 2026-11-10

Kiungo's desktop app now lives in its own repository, `Jumetra-Technologies/kiungo`, and updates from there.

### Changed
- **Updates come from the new repository.** Copies up to 0.13 are offered this version through the old update feed, then follow the new one.
- **The sidebar starts with your modules.** The Current workspace dropdown (Everything, Research Focus, Engineering Focus and the rest) is gone, with the footer label, the dashboard's Current focus tile and the Workspace focus buttons in Settings. Roles still decide which modules show.

[0.14.0]: https://github.com/Jumetra-Technologies/kiungo/releases/tag/desktop-v0.14.0
