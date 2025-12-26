# Changelog

## [2.0.0] - BREAKING CHANGE: Vitest 4.0 Support

### Changed

- **BREAKING**: Updated to support Vitest v4.0.16
- Updated `onTestRunEnd` method signature to match new Vitest v4 Reporter API (added `unhandledErrors` and `reason` parameters)
- Updated peer dependency from `vitest: ^3.0.0` to `vitest: ^4.0.16`

### Migration Guide

This version requires Vitest v4.0.16 or higher. Update your Vitest dependency to v4:

```bash
npm install vitest@^4.0.16
# or
yarn add vitest@^4.0.16
```

The reporter API is backward compatible for basic usage, but the internal methods have been updated to match Vitest v4's new reporter lifecycle.

## [1.0.5] - Previous Release

### Fixed

- Everything works as expected
- All core functionality is operational
- Minor bug fixes and improvements

## [1.0.2] - Previous Release

### Fixed

- Everything works as expected
- All core functionality is operational

- Minor bug fixes and improvements

## [1.0.0] - Initial version

### Added

- Initial release of Vitest Azure Reporter
- Core reporting functionality for Azure DevOps
- Basic test result reporting to Azure Pipelines
- Integration with Vitest test framework

[2.0.0]: https://github.com/akshaybheda/vitest-azure-reporter/compare/v1.0.5...v2.0.0
[1.0.5]: https://github.com/akshaybheda/vitest-azure-reporter/compare/v1.0.2...v1.0.5
[1.0.3]: https://github.com/akshaybheda/vitest-azure-reporter/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/akshaybheda/vitest-azure-reporter/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/akshaybheda/vitest-azure-reporter/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/akshaybheda/vitest-azure-reporter/releases/tag/v1.0.0
