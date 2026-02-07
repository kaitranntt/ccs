## [7.38.0](https://github.com/kaitranntt/ccs/compare/v7.37.1...v7.38.0) (2026-02-07)

### Features

* **release:** v7.38.0 - Extended Context, Qwen Models, Bug Fixes ([#480](https://github.com/kaitranntt/ccs/issues/480)) ([b454834](https://github.com/kaitranntt/ccs/commit/b4548341750804339c87c48259dd8741425d2acf)), closes [#472](https://github.com/kaitranntt/ccs/issues/472) [#474](https://github.com/kaitranntt/ccs/issues/474) [#103](https://github.com/kaitranntt/ccs/issues/103) [#478](https://github.com/kaitranntt/ccs/issues/478) [#482](https://github.com/kaitranntt/ccs/issues/482)

## [7.37.1](https://github.com/kaitranntt/ccs/compare/v7.37.0...v7.37.1) (2026-02-05)

### Bug Fixes

* **cliproxy:** fix discoverExistingAccounts test failures ([759f289](https://github.com/kaitranntt/ccs/commit/759f28911958689ff2b56f03409545b6fec81dec))
* **ui:** display device code for GitHub Copilot OAuth in Dashboard ([13f6c3f](https://github.com/kaitranntt/ccs/commit/13f6c3f14bd0d1c920e339b2486dcd6e37ce50f4)), closes [#460](https://github.com/kaitranntt/ccs/issues/460)

### Code Refactoring

* **cliproxy:** modularize top 4 giant files ([b149e25](https://github.com/kaitranntt/ccs/commit/b149e252ebe3fc355e3e47772de4820810b8000f))
* **ui:** address PR review feedback for device code auth ([a08d0cf](https://github.com/kaitranntt/ccs/commit/a08d0cfece85ebb8c5960ad66ee48131af6ded05))

## [7.37.0](https://github.com/kaitranntt/ccs/compare/v7.36.0...v7.37.0) (2026-02-05)

### Features

* **oauth:** add interactive mode prompt for VPS/headless environments ([7a1b4d6](https://github.com/kaitranntt/ccs/commit/7a1b4d6f20176957892e217979062ba542e90343)), closes [#461](https://github.com/kaitranntt/ccs/issues/461)
* **oauth:** add interactive mode prompt for VPS/headless environments ([#462](https://github.com/kaitranntt/ccs/issues/462)) ([2777202](https://github.com/kaitranntt/ccs/commit/2777202caa37db8c48f116ad256a3c183bb7eb1c)), closes [#461](https://github.com/kaitranntt/ccs/issues/461)

### Bug Fixes

* **auth:** show command checks unified config for accounts ([0e140f8](https://github.com/kaitranntt/ccs/commit/0e140f83e40e1f21b3c52504e85639c90435e61e)), closes [#458](https://github.com/kaitranntt/ccs/issues/458)
* **cliproxy:** add NO_PROXY support and error handling for proxy URLs ([bcde5f4](https://github.com/kaitranntt/ccs/commit/bcde5f4878731d45f4867d52300dcca623e0915f))
* **cliproxy:** respect http_proxy env vars for binary downloads ([9c527b7](https://github.com/kaitranntt/ccs/commit/9c527b7d1501deb9aefff6ab95debb18adee87f0)), closes [#266](https://github.com/kaitranntt/ccs/issues/266)
* **cliproxy:** sanitize MCP tool input_schema to remove non-standard properties ([#459](https://github.com/kaitranntt/ccs/issues/459)) ([f8c179f](https://github.com/kaitranntt/ccs/commit/f8c179f6da47f6a0d0cb65fe3be12ea44a05bdef)), closes [#456](https://github.com/kaitranntt/ccs/issues/456)
* **dashboard:** delete accounts from unified config mode ([8d5f7d2](https://github.com/kaitranntt/ccs/commit/8d5f7d2d8365bc8b02d3c0b72c4945673580b090)), closes [#455](https://github.com/kaitranntt/ccs/issues/455)
* **doctor:** use cmd.exe compatible quoting for Windows shell execution ([ff92c66](https://github.com/kaitranntt/ccs/commit/ff92c66b64cb902e6faf9cc54f2973a96d29173a))
* **shell:** escape ! for cmd.exe delayed expansion ([61bc54a](https://github.com/kaitranntt/ccs/commit/61bc54af0504d21bdf1e6a7e29dcf9ef322b89c7))
* **shell:** escape cmd.exe special chars (%, ^, newlines) ([ed91f21](https://github.com/kaitranntt/ccs/commit/ed91f21994a3aa35a9e40539015676466b794144))
* **ui:** allow backend switching in remote mode ([28e776d](https://github.com/kaitranntt/ccs/commit/28e776d58e7b738a7fbedacb5385c0c423196cea)), closes [#463](https://github.com/kaitranntt/ccs/issues/463)

### Tests

* **cliproxy:** add comprehensive proxy support unit tests ([713ee93](https://github.com/kaitranntt/ccs/commit/713ee936065d6b1f7f61a9aa07282c5f82d81774))
* **shell:** add unit tests for escapeShellArg ([48aa3cc](https://github.com/kaitranntt/ccs/commit/48aa3cca30b2c5e7ff0b5faff865918759b048d1))

## [7.36.0](https://github.com/kaitranntt/ccs/compare/v7.35.1...v7.36.0) (2026-02-04)

### Features

* **detector:** add Windows native installer fallback detection ([3336736](https://github.com/kaitranntt/ccs/commit/333673615465727d2b25fef7a35203424859584d)), closes [#447](https://github.com/kaitranntt/ccs/issues/447)

### Bug Fixes

* **detector:** use expandPath helper and add tests ([7f83a7d](https://github.com/kaitranntt/ccs/commit/7f83a7d43574e12ae3685caa0f6cf682ea9631ca)), closes [#449](https://github.com/kaitranntt/ccs/issues/449) [#447](https://github.com/kaitranntt/ccs/issues/447)
* **hooks:** deduplicate WebSearch hooks when saving via Dashboard ([57d4b04](https://github.com/kaitranntt/ccs/commit/57d4b04c682aac6246d2678a8104ed64e3bbd39a)), closes [#450](https://github.com/kaitranntt/ccs/issues/450)
* **ui:** prevent settings tab truncation with grid layout ([bfb2a06](https://github.com/kaitranntt/ccs/commit/bfb2a062682be3bfb4a03d3a2e0b534829a37899))

### Tests

* add stress test and PostToolUse preservation tests ([2fe6c33](https://github.com/kaitranntt/ccs/commit/2fe6c336d71cd36e7983603491601307a5f674e7)), closes [#452](https://github.com/kaitranntt/ccs/issues/452)
* **glmt:** increase timeout for retry-logic tests on CI ([aa83b4d](https://github.com/kaitranntt/ccs/commit/aa83b4db4e00296bd02ff1699ee7782d291f012a))
* **uploader:** fix flaky timeout test with 5ms tolerance ([36c5605](https://github.com/kaitranntt/ccs/commit/36c560532331a6d12ec0d52e7f559004f241beea))

## [7.35.1](https://github.com/kaitranntt/ccs/compare/v7.35.0...v7.35.1) (2026-02-04)

### Bug Fixes

* **cliproxy:** use os.homedir() for cross-platform path expansion ([39f77bd](https://github.com/kaitranntt/ccs/commit/39f77bd9efffd97fb76fbb7bb550bfe25c58e6a7)), closes [#445](https://github.com/kaitranntt/ccs/issues/445)

## [7.35.0](https://github.com/kaitranntt/ccs/compare/v7.34.1...v7.35.0) (2026-02-04)

### ⚠ BREAKING CHANGES

* **hooks:** config.yaml image_analysis section now uses
provider_models instead of providers/model fields.

Provider-to-model mappings:
- agy → gemini-2.5-flash
- gemini → gemini-2.5-flash
- codex → gpt-5.1-codex-mini
- kiro → kiro-claude-haiku-4-5
- ghcp → claude-haiku-4.5
- claude → claude-haiku-4-5-20251001

Hook checks CCS_CURRENT_PROVIDER against provider_models and skips
if no vision model configured for that provider.

### Features

* **hooks:** add ANTHROPIC_MODEL fallback for image analysis ([ae3eb28](https://github.com/kaitranntt/ccs/commit/ae3eb282b4a6a0754f90be27e259af45d0d09d9b))
* **hooks:** add block-image-read hook to prevent context overflow ([38eb740](https://github.com/kaitranntt/ccs/commit/38eb74043c7f9e613e308392b2c159ebfc2a05c1)), closes [#426](https://github.com/kaitranntt/ccs/issues/426)
* **hooks:** add image/PDF analysis via CLIProxy transformer ([d5f2aca](https://github.com/kaitranntt/ccs/commit/d5f2acaa6e9ee5d12a6035c2da1f975551b6a989)), closes [#426](https://github.com/kaitranntt/ccs/issues/426)
* **hooks:** add UX improvements for image analysis hook ([2b0717e](https://github.com/kaitranntt/ccs/commit/2b0717ed53011dcb67cc03ad09a00cfabb682f1e))
* **hooks:** extend image analyzer to all CLIProxy providers ([3252228](https://github.com/kaitranntt/ccs/commit/3252228e5c230d291fc705fb5f1f4b3f58cb2d99))
* **hooks:** inject image analyzer hooks into all profile types ([a8ddf8b](https://github.com/kaitranntt/ccs/commit/a8ddf8bd565ac82131dc4ca02ecadd3b04a61197))
* **hooks:** skip image analyzer for Claude Sub accounts ([26f4021](https://github.com/kaitranntt/ccs/commit/26f40217703800cb412af74195e350090d39e435))
* **ui:** improve settings page UX and responsiveness ([4d87a64](https://github.com/kaitranntt/ccs/commit/4d87a649de3873786926dad0f598d4f481b1b563))

### Bug Fixes

* **backup:** create backups only when settings content changes ([c324e92](https://github.com/kaitranntt/ccs/commit/c324e92eb442669656b53a8f685030f5cb15ce3d)), closes [#433](https://github.com/kaitranntt/ccs/issues/433)
* **checks:** use configurable CLIProxy port in health check ([bfb5350](https://github.com/kaitranntt/ccs/commit/bfb535037ad297b3d838754af74d30b8a88b34f2))
* **cli:** improve network handling and shell escaping ([3c1cf91](https://github.com/kaitranntt/ccs/commit/3c1cf91da4a27e55578a975f02222120a5d3064c))
* **config:** remove unused forceReload parameter in showStatus ([8dfd9e9](https://github.com/kaitranntt/ccs/commit/8dfd9e937599305dcdeab453bb866f16ad582020))
* **delegation:** dynamic model display from settings ([f6b7045](https://github.com/kaitranntt/ccs/commit/f6b7045023e5de52f57fa79445a29de5bfe5a5ff)), closes [#431](https://github.com/kaitranntt/ccs/issues/431)
* **glmt:** gate retry rate limit logs behind verbose flag ([73824bc](https://github.com/kaitranntt/ccs/commit/73824bc99eec2701164837588a231b56b943c536))
* **hooks:** add defensive validation for env var generation ([9662490](https://github.com/kaitranntt/ccs/commit/9662490a74297fe1c992e30beb212222abe77799))
* **hooks:** add edge case validation in image analyzer ([0e7b9c9](https://github.com/kaitranntt/ccs/commit/0e7b9c91900c319a58ec698306be01bb1f665432))
* **hooks:** add network errors to noRetryPatterns, update E2E test ([1201b4b](https://github.com/kaitranntt/ccs/commit/1201b4bb4b0b207d1c170fc3dcf39e79bbc545bd))
* **hooks:** enable image-read blocking by default for third-party profiles ([9f3edc5](https://github.com/kaitranntt/ccs/commit/9f3edc5dafb3aeb72f3d1cf2da80ccbda1690e48))
* **hooks:** improve error handling and edge cases for image analysis ([cb8de2c](https://github.com/kaitranntt/ccs/commit/cb8de2c8e8da2ac5e97b8e1893fc4586d0bf5c8c))
* **hooks:** improve image analysis output format ([70caaa0](https://github.com/kaitranntt/ccs/commit/70caaa00a090fe6a1cfcff3ff47bcb355427ff42))
* **ui:** add missing animate property to connection indicator ([57f7a70](https://github.com/kaitranntt/ccs/commit/57f7a70d67cb7bc854fa3aa4c0a932134dc1278c))
* **update:** pre-remove package on Windows bun before reinstall ([a55e0af](https://github.com/kaitranntt/ccs/commit/a55e0af8ef440d2cbfa7d9a487727fb1ee874bc6)), closes [#435](https://github.com/kaitranntt/ccs/issues/435)

### Documentation

* update documentation for v7.34 release ([c6be09b](https://github.com/kaitranntt/ccs/commit/c6be09b55b9df21be551f4844b4fba3dfd9a6b3f))

### Code Refactoring

* **hooks:** consolidate getCcsHooksDir to config-manager ([b014c4e](https://github.com/kaitranntt/ccs/commit/b014c4e8725c484d37827ea6f2a2e5df59464ce8))
* **hooks:** deprecate block-image-read, add CLIProxy fallback ([51b719e](https://github.com/kaitranntt/ccs/commit/51b719ef3463950983244d708f1b9bca45774976)), closes [#442](https://github.com/kaitranntt/ccs/issues/442) [#426](https://github.com/kaitranntt/ccs/issues/426)
* **hooks:** use provider_models mapping for image analysis ([40caff1](https://github.com/kaitranntt/ccs/commit/40caff13ad5e8eaca71bddb05368d2218ce94453))

### Performance Improvements

* **config:** replace busy-wait with Atomics.wait in lock retry ([ec4e1ae](https://github.com/kaitranntt/ccs/commit/ec4e1ae31c882e8422e8defca6c10a9c79addc5d))

## [7.34.1](https://github.com/kaitranntt/ccs/compare/v7.34.0...v7.34.1) (2026-02-03)

### Bug Fixes

* **dashboard:** cross-browser OAuth with manual callback fallback ([#417](https://github.com/kaitranntt/ccs/issues/417)) ([#423](https://github.com/kaitranntt/ccs/issues/423)) ([24b0312](https://github.com/kaitranntt/ccs/commit/24b03121fd43121f229bd4c07cbd7e3ee5a0234a))
* **dashboard:** detect popup blocked during OAuth flow ([441870d](https://github.com/kaitranntt/ccs/commit/441870d38e5e7d8069df5f4695cb28275f0d48b6))
* **jsonl:** add explicit UTF-8 BOM stripping ([09b5239](https://github.com/kaitranntt/ccs/commit/09b5239f58213b24f2e13116cb2384748bf8913f))
* **quota:** add explicit 429 rate limit handling ([e596ab4](https://github.com/kaitranntt/ccs/commit/e596ab487d9782e4cd9633be081dc42e4a176668))
* **quota:** improve 403 error messaging for forbidden accounts ([5a308db](https://github.com/kaitranntt/ccs/commit/5a308db409392d88e637ee66b9c693b8b7557198))
* **websearch:** add type guards and deduplication for global settings ([847aad0](https://github.com/kaitranntt/ccs/commit/847aad00fee1fd920ddf8ea3a4b0e85aa1f3dfa4))
* **websearch:** normalize double-slash paths in hook detection ([66f5fe6](https://github.com/kaitranntt/ccs/commit/66f5fe6b2c2a955b4b616c38042ab3c9ead199a1))
* **websearch:** normalize Windows path separators in hook detection ([d61c940](https://github.com/kaitranntt/ccs/commit/d61c940a087d4e9134fa0a9ae32dc8d79d42648d))
* **websocket:** add maxPayload limit to prevent DoS attacks ([4fd2f60](https://github.com/kaitranntt/ccs/commit/4fd2f601f676c0710b078960ad1d6c45fba8a6ca))

### Code Refactoring

* **oauth:** align box chars with CCS standard and add JSDoc ([258220b](https://github.com/kaitranntt/ccs/commit/258220b7e8ec833efe772bf32b61800e20439ddb))
* **websearch:** extract shared hook utils to DRY module ([1f8d9b8](https://github.com/kaitranntt/ccs/commit/1f8d9b82d5ad89cefe73966e9c1ef57692dd9284)), closes [#420](https://github.com/kaitranntt/ccs/issues/420)

### Tests

* **websearch:** add unit tests for hook-utils module ([deb6249](https://github.com/kaitranntt/ccs/commit/deb62490dbe797369460ac07ad42a0790463a460))

## [7.34.0](https://github.com/kaitranntt/ccs/compare/v7.33.0...v7.34.0) (2026-02-01)

### Features

* **glmt:** add rate limit resilience with exponential backoff retry ([3afdcea](https://github.com/kaitranntt/ccs/commit/3afdcea379a6527657ba326895f328c219ad6a88)), closes [#402](https://github.com/kaitranntt/ccs/issues/402)

### Bug Fixes

* **claude:** update base config to Claude 4.5 model IDs ([09dd701](https://github.com/kaitranntt/ccs/commit/09dd7016eb2570ef9946f9e7be0bbc300f75337a))
* **cliproxy:** load WebSearch hooks via --settings flag ([7aaf568](https://github.com/kaitranntt/ccs/commit/7aaf568c3f15ae0a5c9dcab14f3e61d811515c9a)), closes [#412](https://github.com/kaitranntt/ccs/issues/412)
* **glmt:** add env var validation and max delay cap ([67a8e2c](https://github.com/kaitranntt/ccs/commit/67a8e2cefcedad2f5a26f0d43952219379be5cc0))
* **glmt:** extract Retry-After from HTTP headers and cap maxRetries ([62ac3e2](https://github.com/kaitranntt/ccs/commit/62ac3e2ae9b941adaa35cc3962c4de54f917e065))
* **sync:** prevent duplicate backup folders on Windows ([a8b0547](https://github.com/kaitranntt/ccs/commit/a8b054781f9c18165e985de801500f31d87a88a8)), closes [#409](https://github.com/kaitranntt/ccs/issues/409)
* **update:** add line-buffering and unit tests for stderr filter ([b39726f](https://github.com/kaitranntt/ccs/commit/b39726fc0713451679b26d3467e70e835c784851))
* **update:** filter npm cleanup warnings on Windows ([c9f8ed1](https://github.com/kaitranntt/ccs/commit/c9f8ed1a04faa95af68650dca4371804391daef8)), closes [#405](https://github.com/kaitranntt/ccs/issues/405)

## [7.33.0](https://github.com/kaitranntt/ccs/compare/v7.32.0...v7.33.0) (2026-01-30)

### Features

* **cliproxy:** add backend caching and reauth indicator for quota endpoints ([7947a7a](https://github.com/kaitranntt/ccs/commit/7947a7ac89b977a34adc9ab72b89b38a61fb5200))
* **cliproxy:** add Codex/Gemini quota API routes ([2f5a50b](https://github.com/kaitranntt/ccs/commit/2f5a50b801a48314b76f102ccdd4f71c4d1cf87d))
* **cliproxy:** add proactive token refresh for Gemini quota (match AGY pattern) ([606bb72](https://github.com/kaitranntt/ccs/commit/606bb7272318bea9f294d9b563369d595b336cf4))
* **ui:** add Codex/Gemini quota API client and hooks ([19a57c3](https://github.com/kaitranntt/ccs/commit/19a57c395c29beb83661edb28286e01211b80261))
* **ui:** display Codex/Gemini quota in dashboard ([387c010](https://github.com/kaitranntt/ccs/commit/387c01026731d251459420d70830df418fd1311f))

### Code Refactoring

* **ui:** address code review feedback ([32ef233](https://github.com/kaitranntt/ccs/commit/32ef23314a517bcda1816ce0c55691b3dd2616de))
* **ui:** extract duplicated quota helpers to shared utils ([8ce7495](https://github.com/kaitranntt/ccs/commit/8ce749581ef7667bec29bdfe17d02f824e06bed4)), closes [#400](https://github.com/kaitranntt/ccs/issues/400)
* **ui:** extract shared QuotaTooltipContent component ([eeb0dde](https://github.com/kaitranntt/ccs/commit/eeb0dde8cabf0db5eea758d50ca7fd0b126a6404))

### Tests

* **quota:** add extensive test suite for quota caching system ([3df2619](https://github.com/kaitranntt/ccs/commit/3df2619023abee095901636310818a676e02d639))
* **ui:** add comprehensive tests for quota utility functions ([0b8635d](https://github.com/kaitranntt/ccs/commit/0b8635d3ba47cf954ad9cc5fe4d30c64ec77779c))

## [7.32.0](https://github.com/kaitranntt/ccs/compare/v7.31.1...v7.32.0) (2026-01-30)

### Features

* **cliproxy:** add ToolSanitizationProxy for Gemini 64-char limit ([6363350](https://github.com/kaitranntt/ccs/commit/63633507d2eeeff7c76b73481894dd9f1148ba93)), closes [#219](https://github.com/kaitranntt/ccs/issues/219)

### Bug Fixes

* **cliproxy:** address PR [#399](https://github.com/kaitranntt/ccs/issues/399) review suggestions ([98b7f6f](https://github.com/kaitranntt/ccs/commit/98b7f6f4545daca18b3c76619bd7c6a6496cc1ed))
* **cliproxy:** route proxy logs to file instead of stderr ([4d292c6](https://github.com/kaitranntt/ccs/commit/4d292c62e46497411b8e151fe96e3e335a5be1c3))

### Code Refactoring

* **cliproxy:** address PR review suggestions ([d86c531](https://github.com/kaitranntt/ccs/commit/d86c53146ad7302600ad803faf0649391fa8f4e1))

### Tests

* **cliproxy:** add integration tests for ToolSanitizationProxy ([bf19002](https://github.com/kaitranntt/ccs/commit/bf190024f6d3b322ff945655fe65af665181a779))

## [7.31.1](https://github.com/kaitranntt/ccs/compare/v7.31.0...v7.31.1) (2026-01-29)

### Bug Fixes

* **cliproxy:** read Gemini tokens from CLIProxy auth directory ([9d96535](https://github.com/kaitranntt/ccs/commit/9d96535d28bf7070e8eccde6af16ef79262a65cf)), closes [#368](https://github.com/kaitranntt/ccs/issues/368)

### Code Refactoring

* **cliproxy:** address code review feedback for token handling ([cddf931](https://github.com/kaitranntt/ccs/commit/cddf931fe6fb8b4c2b6b9edeb9d4e41a25e29535)), closes [#396](https://github.com/kaitranntt/ccs/issues/396)

## [7.31.0](https://github.com/kaitranntt/ccs/compare/v7.30.1...v7.31.0) (2026-01-29)

### Features

* **cliproxy:** add multi-provider quota display for Codex and Gemini CLI ([30e611f](https://github.com/kaitranntt/ccs/commit/30e611fc28e10f89d6aabb2cdbf9450d6ce748a1))

### Bug Fixes

* **cliproxy:** resolve regex escape bug and complete DRY refactor ([38ba6a9](https://github.com/kaitranntt/ccs/commit/38ba6a9fea564d3c48a083e6594c2c6e5cc82b20)), closes [#395](https://github.com/kaitranntt/ccs/issues/395)
* **config:** add missing base-claude.settings.json ([643232f](https://github.com/kaitranntt/ccs/commit/643232f58e4a1954553f761cbad9863dab3133fa))

### Code Refactoring

* **cliproxy:** extract shared auth utils and remove unused parameter ([e31d00f](https://github.com/kaitranntt/ccs/commit/e31d00f0b99f51bd8768d351b2b38604d221935b)), closes [#395](https://github.com/kaitranntt/ccs/issues/395)

### Tests

* **cliproxy:** add unit tests for quota fetchers and auth utilities ([ad8327d](https://github.com/kaitranntt/ccs/commit/ad8327d17e8182d71f0c784e2ef6db30cb3877bb)), closes [#395](https://github.com/kaitranntt/ccs/issues/395)

## [7.30.1](https://github.com/kaitranntt/ccs/compare/v7.30.0...v7.30.1) (2026-01-29)

### Bug Fixes

* **cliproxy:** update Claude model catalog to latest CLIProxy models ([d238a5d](https://github.com/kaitranntt/ccs/commit/d238a5d43aa50e0629609349c6eb053170f2b586)), closes [#392](https://github.com/kaitranntt/ccs/issues/392)
* **copilot:** update fallback model ID to match catalog default ([2501843](https://github.com/kaitranntt/ccs/commit/25018431a50fae1a45121b28a0d16fa1731deace))

## [7.30.0](https://github.com/kaitranntt/ccs/compare/v7.29.0...v7.30.0) (2026-01-28)

### Features

* **cliproxy:** add auto_sync config option ([fc23afd](https://github.com/kaitranntt/ccs/commit/fc23afdfc78a955fc0a1ce7f55d2e2bd098fc6c4))
* **cliproxy:** add granular account tier prioritization (ultra/pro/free) ([aeb9abc](https://github.com/kaitranntt/ccs/commit/aeb9abc998a5114007e34c478cf5c79213ea1fe7)), closes [#387](https://github.com/kaitranntt/ccs/issues/387)
* **cliproxy:** add local config sync module ([9de2682](https://github.com/kaitranntt/ccs/commit/9de26820629f5e95a487028a64c1a8a782674448))
* **cliproxy:** add Management API client for CLIProxy ([4cc89ea](https://github.com/kaitranntt/ccs/commit/4cc89eaf8745d67548f032408cd284fd23c3bd5e))
* **cliproxy:** add sync and alias CLI commands ([cb6c212](https://github.com/kaitranntt/ccs/commit/cb6c21216dcaf0536530f110af75dc20ee7c7738))
* **cliproxy:** add sync API routes ([56500fe](https://github.com/kaitranntt/ccs/commit/56500fee98042fb333bd723818d2a3881cd28481))
* **cliproxy:** auto-sync on profile create ([b2ba402](https://github.com/kaitranntt/ccs/commit/b2ba402d0fb4204457ae1f09016cb21bd9b5a6e2))
* **cliproxy:** enable auto_sync by default ([28b0e89](https://github.com/kaitranntt/ccs/commit/28b0e89b34787f42d63e2dd1a036b75a761bcf6b))
* **ui:** add CLIProxy sync components ([75a4e68](https://github.com/kaitranntt/ccs/commit/75a4e68f95ba5f8c7c8b647b8d5cf0d013dc425a))
* **ui:** add granular account tier types (pro/ultra/free) ([890fd14](https://github.com/kaitranntt/ccs/commit/890fd140f2ede728f212ed0bfc77bc8609b3a09b))
* **ui:** add tier badges to account cards ([31a91f6](https://github.com/kaitranntt/ccs/commit/31a91f609fad4af17f0e4bd3b0f0dbabe8bf2b77))
* **ui:** add toast feedback for sync actions ([f972a4e](https://github.com/kaitranntt/ccs/commit/f972a4ee80ebdec7b0a645d29eba4d65ca847caf))
* **ui:** allow custom model names in Quick Setup wizard ([ab9bbed](https://github.com/kaitranntt/ccs/commit/ab9bbedfa92555d0502b064145c0cfd5bf24065c))
* **ui:** mount SyncStatusCard to CLIProxy page ([afa3bda](https://github.com/kaitranntt/ccs/commit/afa3bdafceb1829e0fef2994bcb51c731797657f))

### Bug Fixes

* **cliproxy:** address edge cases in sync module ([9924b2f](https://github.com/kaitranntt/ccs/commit/9924b2fb25650803c34d26eae151c53a007fa0bb))
* **cliproxy:** address PR review feedback ([4967693](https://github.com/kaitranntt/ccs/commit/496769383979fb0b08bb03a57acd4ad2c10221c6))
* **cliproxy:** address sync review feedback ([e80d2d2](https://github.com/kaitranntt/ccs/commit/e80d2d2d05c00522cdaac03e6f55ecf10a938fc7))
* **cliproxy:** correct sync terminology and add unit tests ([c3f85bc](https://github.com/kaitranntt/ccs/commit/c3f85bc4a8c1351b09d463bd1687e17fa8a989d5))
* **cliproxy:** harden sync against edge cases ([bbad73b](https://github.com/kaitranntt/ccs/commit/bbad73b55450d04902b90a4fc4c006a8c7a3c5c1))
* **cliproxy:** improve sync robustness and consistency ([4124780](https://github.com/kaitranntt/ccs/commit/4124780ce07201f166971216fd48e5b072ec9dd5))
* **cliproxy:** preserve config comments during sync ([68a63a7](https://github.com/kaitranntt/ccs/commit/68a63a776812c7026a38f7dc7d5bb6996bc30190))
* **cliproxy:** use paidTier for account tier detection instead of allowedTiers ([de23029](https://github.com/kaitranntt/ccs/commit/de23029b572c9e1db1c8a004ec214ce5a465570a))
* **ui:** add scroll boundary for account list in Quick Setup ([85aa747](https://github.com/kaitranntt/ccs/commit/85aa747aebccbde21111730f6eb63e047ac0b91d))
* **ui:** fix account card layout overflow ([87cced8](https://github.com/kaitranntt/ccs/commit/87cced81952c168eaa4c6fd98059f089d765bcb3))
* **ui:** update sync card for local sync design ([e2b9c46](https://github.com/kaitranntt/ccs/commit/e2b9c465e4485c13086b82d282d9c67ae640dc77))

### Code Refactoring

* **cliproxy:** remove model alias functionality ([32dbd5e](https://github.com/kaitranntt/ccs/commit/32dbd5e174338d7627637667c63162ea4b9ffe7f))
* **ui:** merge sync into ProxyStatusWidget ([3761634](https://github.com/kaitranntt/ccs/commit/37616348f8e0edf934e68854faf6c783d4ff7aca))

### Tests

* **cliproxy:** add management-api-client unit tests ([6611142](https://github.com/kaitranntt/ccs/commit/6611142dcc60180dbaa4b987c3fb801ce753ffb1))

## [7.29.0](https://github.com/kaitranntt/ccs/compare/v7.28.2...v7.29.0) (2026-01-28)

### Features

* **cliproxy:** add Claude (Anthropic) OAuth provider support ([28d8bd8](https://github.com/kaitranntt/ccs/commit/28d8bd84a5ac912b79416aeced95f74fd71876bb)), closes [#380](https://github.com/kaitranntt/ccs/issues/380)
* skip local OAuth when using remote proxy with auth token ([1f5d119](https://github.com/kaitranntt/ccs/commit/1f5d11930ee19c0f00b46d7994ea99c7be8e55c6))

### Bug Fixes

* add claude provider to statsProviderMap, UI types, and provider arrays ([4a2abc7](https://github.com/kaitranntt/ccs/commit/4a2abc74cac93e17ee12fab3fcf8fc0693552347))
* **cliproxy:** add Claude to all provider lists for sidebar display ([d212995](https://github.com/kaitranntt/ccs/commit/d2129957d7e954701be973725545f475711d0468))
* **cliproxy:** address PR review feedback ([2091a90](https://github.com/kaitranntt/ccs/commit/2091a90b7710e7cb0b565577a5e659473126a541)), closes [#D97757](https://github.com/kaitranntt/ccs/issues/D97757)
* **cliproxy:** improve skip-local-auth edge case handling ([21e819b](https://github.com/kaitranntt/ccs/commit/21e819b59062b77c2686ecc5f24e9c3436e42f84))
* **cliproxy:** use correct --claude-login flag for Claude OAuth ([8017ce8](https://github.com/kaitranntt/ccs/commit/8017ce8f8639ffc282203d6809091df83e0c8f18)), closes [#382](https://github.com/kaitranntt/ccs/issues/382)
* replace hardcoded provider validation arrays with CLIPROXY_PROFILES import ([9cd9c42](https://github.com/kaitranntt/ccs/commit/9cd9c423e929579c86da3f409d74927c3c7dedc1)), closes [#382](https://github.com/kaitranntt/ccs/issues/382)
* **test:** use correct provider name 'ghcp' instead of 'copilot' ([838cd1d](https://github.com/kaitranntt/ccs/commit/838cd1d460de68acb571bb44bc12f91bd0636ff7))
* **ui:** add iFlow to PROVIDER_ASSETS + sync validation test ([5c62e06](https://github.com/kaitranntt/ccs/commit/5c62e06d0236b5080ccfb3ca2ff55407cbb414e1)), closes [#384](https://github.com/kaitranntt/ccs/issues/384)
* **ui:** truncate long account emails in provider editor ([a9c5520](https://github.com/kaitranntt/ccs/commit/a9c5520b8b4b7d49d1afe0e63b4facab3142db1b))

### Code Refactoring

* **cliproxy:** reorder providers - Antigravity first, then Claude ([b385ab1](https://github.com/kaitranntt/ccs/commit/b385ab131d2b179c7b7bd014859f9118afd6ce5c))
* **cliproxy:** use CLIPROXY_PROFILES for provider arrays (DRY) ([9fd9395](https://github.com/kaitranntt/ccs/commit/9fd93955880fd1b90d15f45d9738d413d04769ca)), closes [#384](https://github.com/kaitranntt/ccs/issues/384)
* **oauth:** derive auth-code providers from OAUTH_FLOW_TYPES (DRY) ([c713d48](https://github.com/kaitranntt/ccs/commit/c713d48d08af5044cb0fab4505365fd98e31b9d6)), closes [#384](https://github.com/kaitranntt/ccs/issues/384)
* **ui:** centralize provider list in provider-config.ts (DRY) ([5a4c8e0](https://github.com/kaitranntt/ccs/commit/5a4c8e009ce1cc355d6fa2f05001cab6c9b684c4))

## [7.28.2](https://github.com/kaitranntt/ccs/compare/v7.28.1...v7.28.2) (2026-01-27)

### Bug Fixes

* **websearch:** add shell option for Windows spawnSync compatibility ([3c534f4](https://github.com/kaitranntt/ccs/commit/3c534f48cb60448875c02bc0a8444277ca7c89eb)), closes [#378](https://github.com/kaitranntt/ccs/issues/378)

## [7.28.1](https://github.com/kaitranntt/ccs/compare/v7.28.0...v7.28.1) (2026-01-26)

### Bug Fixes

* **cliproxy:** pin version to 6.7.25, add disable-cooling ([fb77d72](https://github.com/kaitranntt/ccs/commit/fb77d72a3080d0fa096247c71a9cc1336445aa38))
* **websearch:** stop polluting global ~/.claude/settings.json with hooks ([0216341](https://github.com/kaitranntt/ccs/commit/0216341b2c45e0b0387947f30213d277e1893584))

## [7.28.0](https://github.com/kaitranntt/ccs/compare/v7.27.0...v7.28.0) (2026-01-26)

### Features

* **cli:** implement --uninstall handler ([c44a5c2](https://github.com/kaitranntt/ccs/commit/c44a5c221f2046b84e6a556f0ffed706964dac6f))
* **cli:** inject hooks into profile settings on launch ([0099ab5](https://github.com/kaitranntt/ccs/commit/0099ab5a1c6d3201850b44bc51b06ceb8847f1d2))
* **npm:** add postuninstall script ([4f28de9](https://github.com/kaitranntt/ccs/commit/4f28de9c90cbd8b6bacbd6cf73b3f664db64eee3))
* **websearch:** add per-profile hook injection module ([242ab76](https://github.com/kaitranntt/ccs/commit/242ab7645384516db0c05c7139ae652733acf271))
* **websearch:** add removeHookConfig function ([9159aa5](https://github.com/kaitranntt/ccs/commit/9159aa52cbe99c0820c30a19843043ea141c1106)), closes [#317](https://github.com/kaitranntt/ccs/issues/317)
* **websearch:** call removeHookConfig on uninstall ([fc4d987](https://github.com/kaitranntt/ccs/commit/fc4d987d205bb2bd86d2cf2698858f052a740cce))
* **websearch:** inject hooks on profile creation ([fca8dbd](https://github.com/kaitranntt/ccs/commit/fca8dbd6cfdcb8a229051b840733b0769e61368a))

### Bug Fixes

* address PR [#373](https://github.com/kaitranntt/ccs/issues/373) review feedback ([e98a92f](https://github.com/kaitranntt/ccs/commit/e98a92fded2eeb32cd74ee25279b59e51237c67a))
* address PR review feedback ([cd7a112](https://github.com/kaitranntt/ccs/commit/cd7a1121d4f0072a4b15dc11b4864ec3aad26758))
* **config:** persist setup_completed flag to YAML file ([a8c46cc](https://github.com/kaitranntt/ccs/commit/a8c46cc8ed6743f3cfb07bbe621b644c9b2d6830))
* **isolation:** add getCcsDir/getCcsHome to more files ([6a2c829](https://github.com/kaitranntt/ccs/commit/6a2c82917dea1fb7c5c7a9e4e134ac3227e0edaa))
* **isolation:** use getCcsDir() for test isolation ([9b61f53](https://github.com/kaitranntt/ccs/commit/9b61f5318eedfd1f1a25ec5f3f3a39619174567b))
* **setup:** persist setup_completed flag to prevent repeated first-time notice ([85e41a5](https://github.com/kaitranntt/ccs/commit/85e41a56e94e17ab7aeb729f50404eb6c0708df9))
* **websearch:** use getCcsDir() for test isolation ([b33674b](https://github.com/kaitranntt/ccs/commit/b33674b3b225dd8d07fa48f916c3400cd0685dec))

### Code Refactoring

* **uninstall:** stop modifying global settings.json ([ba1fb7e](https://github.com/kaitranntt/ccs/commit/ba1fb7eeb3855db50eff5cfb5999d77ffd66f17f))
* **websearch:** address PR review recommendations ([21b18d0](https://github.com/kaitranntt/ccs/commit/21b18d0c4e7dbdf9e7070458ec5c5fb54ac6a410))

### Tests

* **setup:** add unit tests for setup_completed flag detection ([596a9c6](https://github.com/kaitranntt/ccs/commit/596a9c68439a2c668a7c6243594a5fd2e57e8b04))
* **uninstall:** add hook cleanup tests ([6838ac0](https://github.com/kaitranntt/ccs/commit/6838ac0fa1ae0578cf84a451ed628cd8ded31562))
* **uninstall:** update tests for per-profile hook behavior ([ce59eb6](https://github.com/kaitranntt/ccs/commit/ce59eb6269ad65efb27e373b592596355f9dc313))

## [7.27.0](https://github.com/kaitranntt/ccs/compare/v7.26.3...v7.27.0) (2026-01-25)

### Features

* **ui:** add bulk account controls to provider editor ([1427d36](https://github.com/kaitranntt/ccs/commit/1427d36f869f8b0eb64d2c5d6893810515d2d4d4))
* **ui:** add expandable provider cards with account controls ([87226e0](https://github.com/kaitranntt/ccs/commit/87226e05c40be83299187b35ba1ca4ca2113fbe3))
* **ui:** add tiered visual grouping to quota tooltip ([ebfc554](https://github.com/kaitranntt/ccs/commit/ebfc554f5f8733b811c1ba8610a1bf11d0154510))
* **ui:** add visible pause toggle button to account item cards ([56dfb24](https://github.com/kaitranntt/ccs/commit/56dfb2429bc93772e260aa6ecaed50ebf714be06))
* **ui:** persist provider selection in cliproxy and auth-monitor ([7fc9ff0](https://github.com/kaitranntt/ccs/commit/7fc9ff0d77ddf89c13e8ec168b700bee38cabc12))

### Bug Fixes

* **api:** add race condition prevention and input validation for account control ([d1b579a](https://github.com/kaitranntt/ccs/commit/d1b579ad1b8c58da352f1a2c803256a427e3f669))
* **hooks:** add stats invalidation to account control mutations ([7086617](https://github.com/kaitranntt/ccs/commit/708661744fa8463ae919cb597bd9c43cca21c336))
* **quota:** fetch quota for paused accounts + simplify exhausted display ([27e8813](https://github.com/kaitranntt/ccs/commit/27e8813cae5379dbd8f9e700155812e59fe99389))
* **quota:** return exhausted models with resetTime from API ([e3920e0](https://github.com/kaitranntt/ccs/commit/e3920e077610b3d31b7e533a629c6b09e8b6d427))
* **ui:** add pause toggle to flow viz account cards, remove dropdown redundancy ([56dfada](https://github.com/kaitranntt/ccs/commit/56dfada31c36425a11d4eff397c925980a43b94c))
* **ui:** display exhausted Claude/GPT models in quota tooltip ([ce16517](https://github.com/kaitranntt/ccs/commit/ce1651714473b0d7484efbbb45ecb503d7490a3b))
* **ui:** improve bulk actions UX in provider editor ([6021c10](https://github.com/kaitranntt/ccs/commit/6021c10ddce84536f01dd8e9bb8a59f279dfc3cc))
* **ui:** improve model quota tooltip tier sorting ([de71381](https://github.com/kaitranntt/ccs/commit/de7138166ca2dca765c05ab59e9d9b1b154277bb))
* **ui:** improve pause toggle position in flow-viz account cards ([eb05342](https://github.com/kaitranntt/ccs/commit/eb053425c074ab150f67181ba7cf62668e0e7b49))
* **ui:** improve tier header contrast in quota tooltip ([41d17e7](https://github.com/kaitranntt/ccs/commit/41d17e7cae7949dbb169963b3a0e71516afa91b3))
* **ui:** remove dead 'Account is paused' error handling from flow-viz ([a84cc03](https://github.com/kaitranntt/ccs/commit/a84cc036df8179442498531fa0b4383f0b96d904))
* **ui:** show 0% quota when Claude/GPT models exhausted ([1f323f0](https://github.com/kaitranntt/ccs/commit/1f323f082c92bd8e740fa519b196f2ed957a0b68))
* **ui:** show Claude reset time for quota display (not earliest) ([9516e71](https://github.com/kaitranntt/ccs/commit/9516e71f17c112eb71d7e0283e5c9d8c654fa2f9))
* **ui:** simplify quota tooltip - delimiter lines only, full model names ([b2b8a85](https://github.com/kaitranntt/ccs/commit/b2b8a85af6c860c2e76d1f0198c2d8bc25f2ff2e))

### Code Refactoring

* **ui:** update cliproxy page for account control flow ([118ce46](https://github.com/kaitranntt/ccs/commit/118ce46e7287aa929f489e218ef30609fb1348c8))

## [7.26.3](https://github.com/kaitranntt/ccs/compare/v7.26.2...v7.26.3) (2026-01-24)

### Bug Fixes

* **cliproxy:** propagate backend parameter to version check functions ([2a0efbd](https://github.com/kaitranntt/ccs/commit/2a0efbd954d5126d29920e4992f2f9a6be74fce6))
* **tests:** address edge cases in mock infrastructure ([2b91c40](https://github.com/kaitranntt/ccs/commit/2b91c40e37d5b28420ba9fa45f5b7bcbde6e29d5))
* **tests:** remove undefined MockRoute export and unused imports ([aaa6feb](https://github.com/kaitranntt/ccs/commit/aaa6feb8db6a31e598204448d6f45520313140f3))

### Documentation

* clarify no-emoji rule applies only to CLI terminal output ([0902211](https://github.com/kaitranntt/ccs/commit/0902211d409712f00bc5582e50660f6d76ef4e4c))

### Performance Improvements

* **tests:** replace real network ops with mock infrastructure ([5c83429](https://github.com/kaitranntt/ccs/commit/5c83429a79e178283654ee5d401cd8814d7ed599))

## [7.26.2](https://github.com/kaitranntt/ccs/compare/v7.26.1...v7.26.2) (2026-01-23)

### Bug Fixes

* display correct project names in session stats ([8ee87c7](https://github.com/kaitranntt/ccs/commit/8ee87c7452d3b3f71d4dd15031350fdcb2c4a8dc)), closes [#348](https://github.com/kaitranntt/ccs/issues/348) [#103](https://github.com/kaitranntt/ccs/issues/103)
* **glmt:** respect user-configured model instead of hardcoding glm-4.6 ([bd343f3](https://github.com/kaitranntt/ccs/commit/bd343f3f028bf1c5b0648a7566291fa4b94a09c3)), closes [#358](https://github.com/kaitranntt/ccs/issues/358)
* resolve test import paths and vi.mock hoisting issues ([84ec434](https://github.com/kaitranntt/ccs/commit/84ec43430d666ffd26505431d76fd1a8d1d4aaae))
* **ui:** display correct project names in session stats ([01f9610](https://github.com/kaitranntt/ccs/commit/01f96104e65ae02f7a20bad44730922a61b21c02)), closes [#348](https://github.com/kaitranntt/ccs/issues/348) [#103](https://github.com/kaitranntt/ccs/issues/103)

### Tests

* add project name display tests ([c5911dd](https://github.com/kaitranntt/ccs/commit/c5911dde38fedea1eb231a85de96c92dd79aec4e)), closes [#348](https://github.com/kaitranntt/ccs/issues/348) [#103](https://github.com/kaitranntt/ccs/issues/103)

## [7.26.1](https://github.com/kaitranntt/ccs/compare/v7.26.0...v7.26.1) (2026-01-23)

### Bug Fixes

* **cliproxy:** complete backend param propagation per code review ([388ab69](https://github.com/kaitranntt/ccs/commit/388ab69a970e7bbd249948f34d7ab3e7ab5ddcb9))
* **cliproxy:** complete backend switching with proper binary extraction ([2794a54](https://github.com/kaitranntt/ccs/commit/2794a548a57c94002ab8c4f926bd47f04de3f8ff))
* **cliproxy:** make backend switching work with version pins and status ([628148c](https://github.com/kaitranntt/ccs/commit/628148c3590e09dcb04fb205bd41880c3f295e87))
* **cliproxy:** make version cache backend-specific for proper switching ([a41fd2a](https://github.com/kaitranntt/ccs/commit/a41fd2a093d207d9216cde2a58da8669c09c7c04))
* **cliproxy:** use backend-aware labels in error messages and API ([f0c845c](https://github.com/kaitranntt/ccs/commit/f0c845c32e7f389d8427941dd685898a3f894faa))
* **cliproxy:** use backend-specific GitHub repos for version fetching ([0a1cbcc](https://github.com/kaitranntt/ccs/commit/0a1cbcc612d81ec8dc837cdada7c943ffedd4483))
* **ui:** add backend fields to CliproxyUpdateCheckResult type ([c916356](https://github.com/kaitranntt/ccs/commit/c9163568391208c346a6ca0e04562d2931e8092a))
* **ui:** align alert icon vertically with text when using py-2 ([0511c5e](https://github.com/kaitranntt/ccs/commit/0511c5e2fd008d953b357861a7941c3176280ecd))
* **ui:** correct warning text to reference Instance Status section ([46e75e2](https://github.com/kaitranntt/ccs/commit/46e75e2a746ab46801d4d731a08405dc029fdf5a))
* **ui:** display dynamic backend label in dashboard ([dad4349](https://github.com/kaitranntt/ccs/commit/dad434999469b6ed6e87c186c690004b83676420))
* **ui:** integrate ProxyStatusWidget in Settings & block backend switch when running ([6458173](https://github.com/kaitranntt/ccs/commit/64581734c61f3ad31e52c3decc6de10a6f983050))
* **ui:** prevent race conditions during backend switch ([498175e](https://github.com/kaitranntt/ccs/commit/498175e9fbc70010aececc276749356e8f8a8070))
* **ui:** sync backend state across all CLIProxy UI components ([88560c7](https://github.com/kaitranntt/ccs/commit/88560c71194b66093410cd5189a84d1224b16b2a))

## [7.26.0](https://github.com/kaitranntt/ccs/compare/v7.25.0...v7.26.0) (2026-01-23)

### Features

* add Ollama provider support ([bd3be23](https://github.com/kaitranntt/ccs/commit/bd3be23355f48269d5ce74dbf2b5aaf0eda8cf22))
* **ui:** add Ollama logo and make API key optional ([2cb77f2](https://github.com/kaitranntt/ccs/commit/2cb77f2dfd8376905e76cdd951830d24f2d29bbf))
* **ui:** add Ollama provider presets to dashboard ([2b7d18c](https://github.com/kaitranntt/ccs/commit/2b7d18c4c6631cb949c82a3eecc83beb0c885319))
* **ui:** add provider logos for alternative API presets ([5074122](https://github.com/kaitranntt/ccs/commit/5074122d4af705933c60527d34f5ec9bc168990b))

### Bug Fixes

* **api:** skip API key prompt for local Ollama preset ([ef2c8bb](https://github.com/kaitranntt/ccs/commit/ef2c8bba12e9ab164fa5b4be4c8fbb60617a20a1))
* **api:** skip API key prompt for local Ollama using noApiKey flag ([dc6977d](https://github.com/kaitranntt/ccs/commit/dc6977d32e5511b24f6a403f609507e9cd19af19))
* **ollama:** align property naming and descriptions ([3ce698c](https://github.com/kaitranntt/ccs/commit/3ce698c5fe3bc013371b51f6c13d01f32611f9a3))
* **presets:** make requiresApiKey required boolean, add sentinel docs ([8e29c48](https://github.com/kaitranntt/ccs/commit/8e29c48c6dd689794adaf740634823914e609c9d))

### Documentation

* add Ollama to Built-in Providers table and usage examples ([c9604be](https://github.com/kaitranntt/ccs/commit/c9604be5e1089c38d10047f65ab531a25ea14fc5))

## [7.25.0](https://github.com/kaitranntt/ccs/compare/v7.24.2...v7.25.0) (2026-01-22)

### Features

* **api:** add /api/thinking endpoints for budget config ([9a2598f](https://github.com/kaitranntt/ccs/commit/9a2598fb61904e1124f5142a179f0407a1f1c13a)), closes [#307](https://github.com/kaitranntt/ccs/issues/307)
* **cli:** add --thinking flag for runtime budget override ([4d361b2](https://github.com/kaitranntt/ccs/commit/4d361b2ecf9032271eb4fa292b82a2205139b81b)), closes [#307](https://github.com/kaitranntt/ccs/issues/307)
* **cliproxy:** add model-specific reasoning effort caps ([eec44d5](https://github.com/kaitranntt/ccs/commit/eec44d54e2ba8d2f4e5f0bc48a7e9a03f25de2d9)), closes [#344](https://github.com/kaitranntt/ccs/issues/344)
* **cliproxy:** add thinking budget validator module ([82ef680](https://github.com/kaitranntt/ccs/commit/82ef6804bbfd207522dde4bb4626fad2aaecb9ec)), closes [#307](https://github.com/kaitranntt/ccs/issues/307)
* **cliproxy:** add ThinkingSupport to model catalog ([ebf7e04](https://github.com/kaitranntt/ccs/commit/ebf7e04b725d09d2fae10e36b9a45b57f8272069)), closes [#307](https://github.com/kaitranntt/ccs/issues/307)
* **cliproxy:** inject thinking suffix into model config ([014b5e6](https://github.com/kaitranntt/ccs/commit/014b5e68b8d9486ed697509e6e6fc506671af36a)), closes [#307](https://github.com/kaitranntt/ccs/issues/307)
* **config:** add ThinkingConfig to unified config ([0c2fd9c](https://github.com/kaitranntt/ccs/commit/0c2fd9cf5f4142a5a096cfa030b489ba9b6260bc)), closes [#307](https://github.com/kaitranntt/ccs/issues/307)
* **thinking:** improve config validation and codex support ([19b7a49](https://github.com/kaitranntt/ccs/commit/19b7a49eee3a3487e8026a165c0961d60fe4cb43))
* **ui:** add Thinking settings tab to dashboard ([0a95f36](https://github.com/kaitranntt/ccs/commit/0a95f361a25415fb06bda06a16b0419ce2651119)), closes [#307](https://github.com/kaitranntt/ccs/issues/307)

### Bug Fixes

* **api:** add optimistic locking for thinking config ([ba19e1f](https://github.com/kaitranntt/ccs/commit/ba19e1fcda0b360f0ca4e02d24f8fad47f249b48))
* **api:** add override type and provider_overrides validation ([31b9520](https://github.com/kaitranntt/ccs/commit/31b9520d54d5fda607bace8f87a7a0989bbb3d23))
* **api:** add type guard for tier_defaults and extract tiers constant ([299d96c](https://github.com/kaitranntt/ccs/commit/299d96c01186fd065e5454edb7cb9aee6ab12bb0)), closes [#351](https://github.com/kaitranntt/ccs/issues/351)
* **cli:** add --thinking=value format and improve flag handling ([3060373](https://github.com/kaitranntt/ccs/commit/3060373797871ce2dc1394a5176d3a4693905921))
* **cliproxy:** add case-insensitive model lookup ([36bcc04](https://github.com/kaitranntt/ccs/commit/36bcc04133f6a0b0775d5edf897bc915b8a3efc5))
* **cliproxy:** add NaN/Infinity and empty string validation ([5f8d23c](https://github.com/kaitranntt/ccs/commit/5f8d23c60bae72cde1f281a24312813211c39140))
* **cliproxy:** handle edge cases in thinking validation ([ca490a9](https://github.com/kaitranntt/ccs/commit/ca490a9f4e96dd2da7e6c76b466328ca4aa4dc6c))
* **cliproxy:** improve thinking flag validation and warnings ([d5652de](https://github.com/kaitranntt/ccs/commit/d5652de63423ebad7afe8f8a428c271d29edb427))
* **config:** add null guard and document nested paren limitation ([19e5239](https://github.com/kaitranntt/ccs/commit/19e52399fe4a9707dbf2878117d2db09cfa5d467))
* **config:** improve YAML error messages and thinking validation ([f7cc9f4](https://github.com/kaitranntt/ccs/commit/f7cc9f465312ec5005edb2671f235286f31718d6))
* **ui:** add fetch timeout and abort controller cleanup ([b634f36](https://github.com/kaitranntt/ccs/commit/b634f365f3c80199516fb798a5a4aba6cb36512d))
* **ui:** add missing useThinkingConfig export to barrel file ([b996153](https://github.com/kaitranntt/ccs/commit/b996153e7fe92e786ae0c1335472cbb470a03327))
* **ui:** add provider indicator, retry button, and optimistic locking ([35f28a6](https://github.com/kaitranntt/ccs/commit/35f28a6e7733675813b34a3e6e2bda5907cdc393))
* **ui:** add spacing between Port label and input field ([1eeb8f9](https://github.com/kaitranntt/ccs/commit/1eeb8f922ddb25cb8caebe01a9239eb4529efc5e))
* **ui:** add thinking tab to URL sync conditional ([3ea549a](https://github.com/kaitranntt/ccs/commit/3ea549addddeba2c8c100d3fc7b892205904da44))
* **ui:** reduce excessive AGY quota API requests ([c8c1894](https://github.com/kaitranntt/ccs/commit/c8c189427221707832fa5257ece259321ee3bb52))

### Documentation

* **cli:** add extended thinking section to help ([7c5f365](https://github.com/kaitranntt/ccs/commit/7c5f36580ac357e7f63d70ed084e99c2fa24c6c4))

### Tests

* **cliproxy:** add unit tests for thinking validator ([3bd3e37](https://github.com/kaitranntt/ccs/commit/3bd3e379fe9573929bf24e1c3a925daac8578eaf)), closes [#307](https://github.com/kaitranntt/ccs/issues/307)
* update tests for codex catalog inclusion ([fbb71a2](https://github.com/kaitranntt/ccs/commit/fbb71a228ed232035f1e14cf858b590492720b1c))

## [7.24.2](https://github.com/kaitranntt/ccs/compare/v7.24.1...v7.24.2) (2026-01-18)

### Bug Fixes

* **ci:** disable track_progress for workflow_dispatch events ([65c325d](https://github.com/kaitranntt/ccs/commit/65c325d33e3e55f7214f2d4b786f4204751722b6))

## [7.24.1](https://github.com/kaitranntt/ccs/compare/v7.24.0...v7.24.1) (2026-01-18)

### Bug Fixes

* **ci:** use placeholder API key to pass claude-code-action validation ([a83a87b](https://github.com/kaitranntt/ccs/commit/a83a87bbc2f7542d793edff910dc833bda40f9c8))

## [7.24.0](https://github.com/kaitranntt/ccs/compare/v7.23.0...v7.24.0) (2026-01-18)

### Features

* **cliproxy:** add backend selection for CLIProxyAPI vs CLIProxyAPIPlus ([8ade4a6](https://github.com/kaitranntt/ccs/commit/8ade4a6b26a7870b730094ca47085cf4dc1bc411))

### Bug Fixes

* **cliproxy:** address PR review issues for backend selection ([a019ed2](https://github.com/kaitranntt/ccs/commit/a019ed2cf88a0e458d220fa0e9117c1490e9e6a6))

### Documentation

* add Docker support documentation ([90bced9](https://github.com/kaitranntt/ccs/commit/90bced95a42178c5bafae259285413552740cb54))

### Code Refactoring

* **ci:** simplify ai-review to use claude-code-action directly ([5e22547](https://github.com/kaitranntt/ccs/commit/5e22547f3fc19202039dc855a4516e12253960c6))
* **ci:** simplify ai-review to vanilla claude-code-action ([bdfc409](https://github.com/kaitranntt/ccs/commit/bdfc40966a316b36b3689c8cdc3e6326ba789399))

## [7.23.0](https://github.com/kaitranntt/ccs/compare/v7.22.0...v7.23.0) (2026-01-18)

### Features

* **docker:** add Docker/Compose setup for CCS dashboard ([a14c7f3](https://github.com/kaitranntt/ccs/commit/a14c7f3f6ba0d694dda622a59c9f878f648976b4))

### Bug Fixes

* **docker:** address security and reproducibility issues ([b386410](https://github.com/kaitranntt/ccs/commit/b38641002fadc8732c81aa9c7bd01bee826095a5))
* **docker:** use bun 1.2.21 ([1dee718](https://github.com/kaitranntt/ccs/commit/1dee71897e89cc20bc1e78a57e29176ddacdb321))

## [7.22.0](https://github.com/kaitranntt/ccs/compare/v7.21.0...v7.22.0) (2026-01-15)

### Features

* **cliproxy:** add HTTPS tunnel for remote proxy mode ([#1](https://github.com/kaitranntt/ccs/issues/1)) ([9e9cbd4](https://github.com/kaitranntt/ccs/commit/9e9cbd48585200c890fe6bb83539fe3a99b25cdc))
* **dashboard:** add project_id display for Antigravity accounts ([ed2ce13](https://github.com/kaitranntt/ccs/commit/ed2ce138e41f07997eb6fa7e650cb4f16849b3df))
* **dashboard:** show projectId warning in Live Account Monitor ([28b0faa](https://github.com/kaitranntt/ccs/commit/28b0faa0cb842737c9a2b0409822b1339078cf0d))

### Bug Fixes

* address PR [#4](https://github.com/kaitranntt/ccs/issues/4) review - HTTPS tests and timeout handling ([e055890](https://github.com/kaitranntt/ccs/commit/e055890e16fa6d79411faae5f04794807db39c87))
* address PR [#4](https://github.com/kaitranntt/ccs/issues/4) review suggestions ([c3bfa34](https://github.com/kaitranntt/ccs/commit/c3bfa34703a501b502508dbf41cff75d2cd84dbe))
* **cliproxy:** add try-catch for file operations in pause/resume ([d87a653](https://github.com/kaitranntt/ccs/commit/d87a6531952313b1e3795feb67ab152f2bfbb1e9))
* **cliproxy:** move token files when pausing/resuming accounts ([9d2442f](https://github.com/kaitranntt/ccs/commit/9d2442f9fa772e1048b8153b8a2d586a4ec032ce)), closes [#337](https://github.com/kaitranntt/ccs/issues/337)
* **cliproxy:** show clear message for paused accounts in Live Monitor ([a931bc9](https://github.com/kaitranntt/ccs/commit/a931bc9745572c0b5ddb488f568f1bec62d69a25))
* **cliproxy:** use sibling auth-paused/ dir to prevent token refresh loops ([4d31128](https://github.com/kaitranntt/ccs/commit/4d31128b63ad3996dcb783cd08d956d53ff7face))
* **dashboard:** harden projectId handling with edge case fixes ([bc02ecc](https://github.com/kaitranntt/ccs/commit/bc02ecc94c5120bb0a4491fd9f88c71fb9f26b7f))
* **dashboard:** update projectId for existing accounts during discovery ([36367d4](https://github.com/kaitranntt/ccs/commit/36367d49f0f51f4ecba9a32adf54308af153bdb2))
* increase timeout in connection tracking test for CI ([e7e95e6](https://github.com/kaitranntt/ccs/commit/e7e95e69700ed4c94c89d88bdf7d674a55053961))
* make connection tracking test deterministic ([b735234](https://github.com/kaitranntt/ccs/commit/b735234beb6c9559c2798ab48d8b876cf5e6c495))
* resolve CI test timing and merge conflict with dev ([504b1b3](https://github.com/kaitranntt/ccs/commit/504b1b3974c2538a692a54a7d83b1dea7e500433))
* **ui:** improve paused account display in Live Account Monitor ([502b30a](https://github.com/kaitranntt/ccs/commit/502b30a589c8aef948e8d58ffc543fcb4e0248ad))

## [7.21.0](https://github.com/kaitranntt/ccs/compare/v7.20.1...v7.21.0) (2026-01-14)

### Features

* **dashboard:** implement full parity UX improvements ([bd5e9d2](https://github.com/kaitranntt/ccs/commit/bd5e9d2b78b7348443770de3f4e5848390ff34fd))

### Bug Fixes

* **dashboard:** address code review feedback for PR [#336](https://github.com/kaitranntt/ccs/issues/336) ([e808972](https://github.com/kaitranntt/ccs/commit/e808972df0e3ce1987bb3b5a346add3e6d592b56))
* **dashboard:** resolve 6 critical security and UX edge cases ([623a314](https://github.com/kaitranntt/ccs/commit/623a3146d775b9666218343a0dc39434b77dd24d))
* **dashboard:** resolve edge cases in backup restore and settings UI ([2e45447](https://github.com/kaitranntt/ccs/commit/2e45447bb7c6bb48337076871d78a152bfb79880))
* **persist:** add rate limiting, tests, and code quality improvements ([7b80dcc](https://github.com/kaitranntt/ccs/commit/7b80dccdd312fc6651ce03524699a30b8310c998)), closes [#339](https://github.com/kaitranntt/ccs/issues/339)

### Documentation

* update minimax preset references to 'mm' ([eee62a4](https://github.com/kaitranntt/ccs/commit/eee62a46a23f925e7ee891ef0c0ee5ca2271a462))

## [7.20.1](https://github.com/kaitranntt/ccs/compare/v7.20.0...v7.20.1) (2026-01-14)

### Bug Fixes

* **ci:** expand ai-review allowedTools to prevent token waste ([ac7b324](https://github.com/kaitranntt/ccs/commit/ac7b324d4989883c7a8e92030891e51bfc040cc3))
* **cliproxy:** address PR review feedback ([04c9b08](https://github.com/kaitranntt/ccs/commit/04c9b087ca3466c4b2871a777906f87b19566d3c))
* **cliproxy:** return null for unknown quota, add verbose diagnostics ([1ac1941](https://github.com/kaitranntt/ccs/commit/1ac19415ce835df15f3fcefbb698f12ec89ec5e9))
* **deps:** add express-rate-limit to production dependencies ([d9631be](https://github.com/kaitranntt/ccs/commit/d9631be81a018d9e007f241bcb6b928664cc6991)), closes [#333](https://github.com/kaitranntt/ccs/issues/333)

## [7.20.0](https://github.com/kaitranntt/ccs/compare/v7.19.2...v7.20.0) (2026-01-14)

### Features

* **config:** add ccs config auth CLI subcommand ([39c1ee2](https://github.com/kaitranntt/ccs/commit/39c1ee2ca0f01a1254812a4a8fe8f6c2ed052fe0)), closes [#319](https://github.com/kaitranntt/ccs/issues/319)
* **dashboard:** add optional login authentication ([#319](https://github.com/kaitranntt/ccs/issues/319)) ([464b410](https://github.com/kaitranntt/ccs/commit/464b410e8b3e017689ce7de6b6fc06b3f04c7fdd))
* **persist:** add --list-backups and --restore options for backup management ([ef7e595](https://github.com/kaitranntt/ccs/commit/ef7e595b6fa4c96ac88e2e98f992fd05f7525e2e))
* **persist:** add backup management for settings.json ([#312](https://github.com/kaitranntt/ccs/issues/312)) ([3ac687e](https://github.com/kaitranntt/ccs/commit/3ac687ec9fab6ad4ce11bd3af6af5c596958a5e2)), closes [#248](https://github.com/kaitranntt/ccs/issues/248)

### Bug Fixes

* **auth:** add security hardening per code review ([a3a167e](https://github.com/kaitranntt/ccs/commit/a3a167e62aaa555c71379e91a9dfd0b7f5ddf145))
* **auth:** move redirect to useEffect and validate bcrypt hash format ([37e3468](https://github.com/kaitranntt/ccs/commit/37e3468d4dece26d35ef6b5ad9683312473e1ca9))
* **ci:** add full CLIProxy env vars for AI review ([7cfd3c1](https://github.com/kaitranntt/ccs/commit/7cfd3c1f9dbd387d4fc6388382727222bd8475bd))
* **ci:** add Write tool to allowedTools for PR comment posting ([e7dca48](https://github.com/kaitranntt/ccs/commit/e7dca480d313b2227638a3e8a53554b3d28d2c8e))
* **persist:** harden security and edge case handling ([#328](https://github.com/kaitranntt/ccs/issues/328)) ([397331e](https://github.com/kaitranntt/ccs/commit/397331ec8995b261e0b6916874d59947ede0a88f)), closes [#312](https://github.com/kaitranntt/ccs/issues/312)
* **ui:** use wss:// for WebSocket on HTTPS pages ([#315](https://github.com/kaitranntt/ccs/issues/315)) ([db58c6b](https://github.com/kaitranntt/ccs/commit/db58c6bbcabdb1edc1748212ad0b85af682ac597))

## [7.19.2](https://github.com/kaitranntt/ccs/compare/v7.19.1...v7.19.2) (2026-01-13)

### Bug Fixes

* **ci:** expand allowedTools patterns for flexible comment posting ([0a27c6a](https://github.com/kaitranntt/ccs/commit/0a27c6a12f53dd050dc8104ce8d82e2cb4bcef3f))

## [7.19.1](https://github.com/kaitranntt/ccs/compare/v7.19.0...v7.19.1) (2026-01-13)

### Bug Fixes

* **ci:** update allowedTools pattern to prevent token waste on retries ([edec6f6](https://github.com/kaitranntt/ccs/commit/edec6f6df242a092545a3c7ffd2856aad4f3f2af))

## [7.19.0](https://github.com/kaitranntt/ccs/compare/v7.18.3...v7.19.0) (2026-01-13)

### Features

* **doctor:** add --help flag with comprehensive command documentation ([22c7d4a](https://github.com/kaitranntt/ccs/commit/22c7d4a20d96d12a2c38ec60d226a6bc26dce9b0))

### Bug Fixes

* **ci:** prevent AI review self-cancellation with smart concurrency ([25d31ce](https://github.com/kaitranntt/ccs/commit/25d31ce4329daf9512df4e0236e02d89d05b0842))
* **ci:** trigger AI review on follow-up commits to PR ([a2a13fb](https://github.com/kaitranntt/ccs/commit/a2a13fb16ec3d655a817e548a5cb72a21c6c774e))

## [7.18.3](https://github.com/kaitranntt/ccs/compare/v7.18.2...v7.18.3) (2026-01-13)

### Bug Fixes

* **ci:** simplify AI review workflow by disabling progress tracking ([4ef2d48](https://github.com/kaitranntt/ccs/commit/4ef2d4848cf12d197ba1f8cd5dac66b55c82c8be))
* **ci:** simplify AI review workflow by disabling progress tracking ([#323](https://github.com/kaitranntt/ccs/issues/323)) ([39b37ca](https://github.com/kaitranntt/ccs/commit/39b37caa892f8b723f003c8ed0c6d8f2fe96d799))

## [7.18.2](https://github.com/kaitranntt/ccs/compare/v7.18.1...v7.18.2) (2026-01-13)

### Bug Fixes

* **ci:** isolate concurrency groups by comment author ([3163509](https://github.com/kaitranntt/ccs/commit/316350905233d776968f53732974a77997513f24))
* **ci:** isolate concurrency groups by comment author ([#322](https://github.com/kaitranntt/ccs/issues/322)) ([1d33012](https://github.com/kaitranntt/ccs/commit/1d33012b4e5ad02bac63f9b559f64c3efdf26044))

## [7.18.1](https://github.com/kaitranntt/ccs/compare/v7.18.0...v7.18.1) (2026-01-13)

### Bug Fixes

* **ci:** add explicit instruction to post review as PR comment ([85f6bc0](https://github.com/kaitranntt/ccs/commit/85f6bc07d44f54673163ad4fed6045a37ccabad0))
* **ci:** exclude bot comments from triggering AI review ([ce70617](https://github.com/kaitranntt/ccs/commit/ce70617ee94645399ba05af581240a696ca9cfed))
* **ci:** prevent self-cancelling AI review workflow ([120aca4](https://github.com/kaitranntt/ccs/commit/120aca466d646ee1c770b2712a0d2742d5dd62d6))
* **ci:** prevent self-cancelling AI review workflow ([#321](https://github.com/kaitranntt/ccs/issues/321)) ([fa1899f](https://github.com/kaitranntt/ccs/commit/fa1899f4611d570b2a8bf5e1a5342d5392466263))
* **delegation:** improve profile discovery and CI workflow ([#310](https://github.com/kaitranntt/ccs/issues/310)) ([affdaea](https://github.com/kaitranntt/ccs/commit/affdaead80c3635f49ef562cac81bde8db0cab23))
* **delegation:** only check profiles defined in config.yaml ([0075248](https://github.com/kaitranntt/ccs/commit/0075248273e2d4912c4e277deebd6e668c5b3466))
* **doctor:** use dynamic profile discovery for delegation check ([f88ad8e](https://github.com/kaitranntt/ccs/commit/f88ad8e78198302f68ee0b420075d704ab01d8ff))
* **ui:** improve sidebar navigation for collapsible menu items ([12b68f9](https://github.com/kaitranntt/ccs/commit/12b68f9f136c3529ac976eaec9e8903b43185e89))
* **ui:** improve sidebar navigation for collapsible menu items ([#313](https://github.com/kaitranntt/ccs/issues/313)) ([e2e2ecd](https://github.com/kaitranntt/ccs/commit/e2e2ecda3c1948fb90f9b47b1e31782ef30cc31f))

## [7.18.0](https://github.com/kaitranntt/ccs/compare/v7.17.0...v7.18.0) (2026-01-08)

### Features

* **codex:** inject OpenAI reasoning.effort per tier ([204eea0](https://github.com/kaitranntt/ccs/commit/204eea00ce006fd667ce8c9e71dad397423dae2d))

### Bug Fixes

* **ci:** only auto-review on PR opened, not synchronize ([6f65697](https://github.com/kaitranntt/ccs/commit/6f65697d74772751eb515d76c356f117aaa017d9))
* **cliproxy:** remove stable version cap, only v81-88 are faulty ([0abd021](https://github.com/kaitranntt/ccs/commit/0abd021d256513b88145f88c7a6a2d3a03e0746e))
* **codex-proxy:** security hardening and edge case fixes ([87cfcc5](https://github.com/kaitranntt/ccs/commit/87cfcc5b3cbecfdccaa56c1a02b24fb8b84eb654))

### Styles

* **ci:** enhance ai-review prompt with rich emoji formatting ([6dcc8b2](https://github.com/kaitranntt/ccs/commit/6dcc8b28601cba9067b248c9a6befb3f9c3e1d34))

## [7.17.0](https://github.com/kaitranntt/ccs/compare/v7.16.0...v7.17.0) (2026-01-08)

### Features

* **ci:** migrate ai-review to claude-code-action with fork PR support ([#304](https://github.com/kaitranntt/ccs/issues/304)) ([5651935](https://github.com/kaitranntt/ccs/commit/5651935797f71e9cfcf658c701f48d6efa0d9fea)), closes [#298](https://github.com/kaitranntt/ccs/issues/298) [#302](https://github.com/kaitranntt/ccs/issues/302) [#289](https://github.com/kaitranntt/ccs/issues/289)

### Bug Fixes

* **ci:** only auto-review on PR opened, not synchronize ([211e642](https://github.com/kaitranntt/ccs/commit/211e6424f015242ee393b4227dfc649c81115369))

## [7.16.0](https://github.com/kaitranntt/ccs/compare/v7.15.0...v7.16.0) (2026-01-08)

### Features

* **ci:** add workflow_dispatch for AI review ([#291](https://github.com/kaitranntt/ccs/issues/291)) ([b6d6520](https://github.com/kaitranntt/ccs/commit/b6d65209cd9ba8616179c6c75c38b47732bb8858)), closes [#289](https://github.com/kaitranntt/ccs/issues/289)
* **ci:** AI code review workflow with Claude Code CLI ([#295](https://github.com/kaitranntt/ccs/issues/295)) ([c915ca5](https://github.com/kaitranntt/ccs/commit/c915ca5922e2ed5b8169a91b480136856885ae80)), closes [#289](https://github.com/kaitranntt/ccs/issues/289) [#293](https://github.com/kaitranntt/ccs/issues/293) [#294](https://github.com/kaitranntt/ccs/issues/294) [#296](https://github.com/kaitranntt/ccs/issues/296)
* **ci:** Claude Code CLI for AI reviews ([#290](https://github.com/kaitranntt/ccs/issues/290)) ([49c4d29](https://github.com/kaitranntt/ccs/commit/49c4d299c03d477c5492e82d559f0f3a1831f062))

### Bug Fixes

* **cliproxy:** update version range and add persistent AI review logging ([#303](https://github.com/kaitranntt/ccs/issues/303)) ([6e0bf7c](https://github.com/kaitranntt/ccs/commit/6e0bf7cb1b07d1a9960f7a44a24c80a08b2df3c3)), closes [#298](https://github.com/kaitranntt/ccs/issues/298) [#302](https://github.com/kaitranntt/ccs/issues/302) [#289](https://github.com/kaitranntt/ccs/issues/289)

## [7.15.0](https://github.com/kaitranntt/ccs/compare/v7.14.0...v7.15.0) (2026-01-06)

### Features

* **api:** add pause/resume account endpoints ([c13003d](https://github.com/kaitranntt/ccs/commit/c13003d940a217d22b2b5a027815053ef93d9046)), closes [#282](https://github.com/kaitranntt/ccs/issues/282)
* **cli:** add pause, resume, status subcommands ([cfd8dd9](https://github.com/kaitranntt/ccs/commit/cfd8dd974e875b858f78bb73e74e44062b72d38e)), closes [#282](https://github.com/kaitranntt/ccs/issues/282)
* **cliproxy:** add hybrid quota management core ([11ffca3](https://github.com/kaitranntt/ccs/commit/11ffca33bdeb30b2b3631295ca64a17a480d8954)), closes [#282](https://github.com/kaitranntt/ccs/issues/282)
* **cliproxy:** integrate pre-flight quota check ([10e3eec](https://github.com/kaitranntt/ccs/commit/10e3eec16f46b3318dfef5d33dc903cfbf9cae1d)), closes [#282](https://github.com/kaitranntt/ccs/issues/282)
* **ui:** add pause/resume API hooks ([b92a35d](https://github.com/kaitranntt/ccs/commit/b92a35d09b203427a105bc28a487302c8a726f21)), closes [#282](https://github.com/kaitranntt/ccs/issues/282)
* **ui:** add pause/resume toggle and tier badges ([4ad7292](https://github.com/kaitranntt/ccs/commit/4ad7292700c991e1d2f8478da4d6ed33ce14982d)), closes [#282](https://github.com/kaitranntt/ccs/issues/282)

### Bug Fixes

* **cliproxy:** harden nickname validation and race condition handling ([5970e70](https://github.com/kaitranntt/ccs/commit/5970e70e2641e7d77b6f77d9624cd6990a1b81ba))
* **cliproxy:** prevent race in promptNickname close handler ([107e281](https://github.com/kaitranntt/ccs/commit/107e2813f96624c105bab7d227336b0779648f12))
* **cliproxy:** update lastUsedAt on normal execution ([b55cd79](https://github.com/kaitranntt/ccs/commit/b55cd795ab5da18ea5363aa378712b467a17bf22))
* **cliproxy:** use nickname as accountId for kiro/ghcp providers ([d96c67b](https://github.com/kaitranntt/ccs/commit/d96c67ba810fb933f4a26bf43b6c011e44ed5d47)), closes [#258](https://github.com/kaitranntt/ccs/issues/258) [#267](https://github.com/kaitranntt/ccs/issues/267)
* **quota:** address edge cases from code review ([a32fdc8](https://github.com/kaitranntt/ccs/commit/a32fdc8cfb2160771762ca07c62c30905a817d1d)), closes [#30](https://github.com/kaitranntt/ccs/issues/30) [#31](https://github.com/kaitranntt/ccs/issues/31) [#8](https://github.com/kaitranntt/ccs/issues/8) [#26](https://github.com/kaitranntt/ccs/issues/26)
* **quota:** correct tier detection - remove 2.5-pro from ultra indicators ([0af185f](https://github.com/kaitranntt/ccs/commit/0af185f6a0b40d3a10215ba183f583b25a3d9967))
* **quota:** handle 'standard-tier' as free in tier mapping ([a5f1472](https://github.com/kaitranntt/ccs/commit/a5f1472047fc7e70329d066b41a5ba051b412051))
* **quota:** use API tier detection instead of model-based heuristics ([aad0d44](https://github.com/kaitranntt/ccs/commit/aad0d44069b78f395285e3b71c0a9563b7abe4eb))

### Documentation

* **CLAUDE.md:** add help location reference and documentation requirements ([113cc06](https://github.com/kaitranntt/ccs/commit/113cc06add969879148d4541fe0517b1046c74f3))
* **cli:** add cliproxy pause/resume/status to --help ([4b7328b](https://github.com/kaitranntt/ccs/commit/4b7328b3880a3fa1d71a21f6b73616968cd8737a))
* update documentation for CCS v7.14.x with quota management ([ec4c2c2](https://github.com/kaitranntt/ccs/commit/ec4c2c2f7b5314d4d45968805126f581da7db3d7))

### Code Refactoring

* **quota:** simplify AccountTier to free|paid|unknown ([db071e2](https://github.com/kaitranntt/ccs/commit/db071e2ff2de3c880651445f1f9094a4a43bec74))

## [7.14.0](https://github.com/kaitranntt/ccs/compare/v7.13.1...v7.14.0) (2026-01-06)

### Features

* **agy:** add preflight quota check with auto-switch ([c85ff74](https://github.com/kaitranntt/ccs/commit/c85ff74f3cdd9b346d1d4d929c29104ab16c658f))
* **agy:** promote gemini-claude-sonnet-4-5 as default Haiku model ([c9cdfd9](https://github.com/kaitranntt/ccs/commit/c9cdfd98792cc6d272aa22e2317a3a3bb32105de)), closes [#270](https://github.com/kaitranntt/ccs/issues/270)
* **cliproxy:** add background token refresh worker ([f98bb24](https://github.com/kaitranntt/ccs/commit/f98bb24a98618df132857b414e30997eb3cf0b90))
* **cliproxy:** add dashboard UI parity for version stability ([c5621da](https://github.com/kaitranntt/ccs/commit/c5621dab515ea290e2740cc1fce79e9d65081579)), closes [#269](https://github.com/kaitranntt/ccs/issues/269)
* **cliproxy:** add doctor subcommand for quota diagnostics ([944f5c0](https://github.com/kaitranntt/ccs/commit/944f5c0fb07bcf293a164b81886595aeb8217703)), closes [#252](https://github.com/kaitranntt/ccs/issues/252)
* **cliproxy:** add version management UI with install/restart controls ([a69b2e9](https://github.com/kaitranntt/ccs/commit/a69b2e9d109130abf8a2a99d76bf4560d64c831c))
* **dev:** add symlink setup for testing dev version ([981cef8](https://github.com/kaitranntt/ccs/commit/981cef82119359384e7385aff1791b0afa4f4fc1))
* **quota:** add fetchAllProviderQuotas and findAvailableAccount ([24847f5](https://github.com/kaitranntt/ccs/commit/24847f5804ca258b597b7f367750315b9abfa9f8)), closes [#252](https://github.com/kaitranntt/ccs/issues/252)
* **ui:** add stability warning to ProxyStatusWidget ([8a56a43](https://github.com/kaitranntt/ccs/commit/8a56a43989eb26b22ba28aa091a2bcef97701a20))

### Bug Fixes

* **agy:** edge case handling for quota failover ([5b58bd3](https://github.com/kaitranntt/ccs/commit/5b58bd35c9e2dfd7163bc8eff7804506b49b4872))
* **cliproxy:** add edge case handling for version capping ([212aef8](https://github.com/kaitranntt/ccs/commit/212aef81bc68a2d0d146d410d18f7778b8c2c100))
* **cliproxy:** add missing OAuth callback ports for codex, agy, iflow ([cfe604a](https://github.com/kaitranntt/ccs/commit/cfe604a97c5ef79fbfb1f020579e0b5541d49b27))
* **cliproxy:** cap auto-update to v80 due to v81+ context bugs ([869ab3e](https://github.com/kaitranntt/ccs/commit/869ab3eecd97de2a84c18c5ad25fe2abf0bdb088)), closes [#269](https://github.com/kaitranntt/ccs/issues/269)
* **oauth:** add stdin keepalive to prevent blocking on manual URL prompt ([0557f93](https://github.com/kaitranntt/ccs/commit/0557f93f2fdb17972324f05c9e216785f893ad16))
* **oauth:** harden cleanup for edge cases in auth process ([472497f](https://github.com/kaitranntt/ccs/commit/472497fb0324a92993b2a7e7fd27c8f071a9e7c6))
* **shared-manager:** normalize plugin registry paths to canonical ~/.claude/ ([1067afb](https://github.com/kaitranntt/ccs/commit/1067afbea713625713e72c1738ef06a21bd04d62)), closes [#276](https://github.com/kaitranntt/ccs/issues/276)
* **ui:** add missing isStable and maxStableVersion to type ([4fd4d6c](https://github.com/kaitranntt/ccs/commit/4fd4d6c264b5dbcb9f3e181b46a82090764f46c6))
* **ui:** clean up ProxyStatusWidget layout spacing ([4f69abb](https://github.com/kaitranntt/ccs/commit/4f69abbe88fb0bd6782373b5eeebd665dfcafd4b))
* **ui:** update/downgrade button now installs correct version ([48d4a96](https://github.com/kaitranntt/ccs/commit/48d4a96a62fecde105f58bd68ca130571ef0daa4))
* **websearch:** use 'where' command on Windows for CLI detection ([e03d9b7](https://github.com/kaitranntt/ccs/commit/e03d9b77437575a39af0dca14c2a6b5967ae4f09)), closes [#273](https://github.com/kaitranntt/ccs/issues/273)

### Documentation

* **agy:** add quota management and failover documentation ([8ea1e33](https://github.com/kaitranntt/ccs/commit/8ea1e333bc2b365b7f058201f714e41e822b815f))

### Code Refactoring

* **ui:** redesign ProxyStatusWidget with two-state UX ([8072b93](https://github.com/kaitranntt/ccs/commit/8072b93b3b2d4bc721fece815c8edf45da67b34b))

## [7.13.1](https://github.com/kaitranntt/ccs/compare/v7.13.0...v7.13.1) (2026-01-05)

### Bug Fixes

* **cliproxy:** add management_key support for remote proxy auth separation ([0e58d0e](https://github.com/kaitranntt/ccs/commit/0e58d0e8b7fd07004990e99fbdc6a080380c0304))
* **cliproxy:** add missing kiro/ghcp provider mappings in remote-auth-fetcher ([dea0e87](https://github.com/kaitranntt/ccs/commit/dea0e872bd529b2c6f825dc1d9e901d0896b7f41))
* **cliproxy:** extract unique accountId from token filename for Kiro/GHCP ([7bb7ccc](https://github.com/kaitranntt/ccs/commit/7bb7ccc27fe0d9885c4dd7f23de664e2c8b4866f)), closes [#258](https://github.com/kaitranntt/ccs/issues/258)
* **cliproxy:** proactive token refresh to prevent UND_ERR_SOCKET ([a6a653f](https://github.com/kaitranntt/ccs/commit/a6a653f14580888bcdccbf6b83b90d41b6b52136)), closes [#256](https://github.com/kaitranntt/ccs/issues/256)
* **validation:** add Windows reserved name validation and version format edge cases ([ae1847d](https://github.com/kaitranntt/ccs/commit/ae1847d9011c8bff9caff206cf1d7082c61faf40))

## [7.13.0](https://github.com/kaitranntt/ccs/compare/v7.12.2...v7.13.0) (2026-01-03)

### Features

* **minimax:** Add full MiniMax M2.1 support ([bd5c9a0](https://github.com/kaitranntt/ccs/commit/bd5c9a0033e1c4df8aef90db194a768f55e9eab8))
* **minimax:** Add mm profile and migration support ([267599d](https://github.com/kaitranntt/ccs/commit/267599d09d691cb38b7a9f3b201ce1e3761bfe08))

### Bug Fixes

* **accounts:** integrate CLIProxy OAuth accounts into API endpoint ([eebcb7b](https://github.com/kaitranntt/ccs/commit/eebcb7b10351ce9c939ffcc769d354bc463a8ee1))
* **migrate:** Add rename-profile flag handling ([4dace51](https://github.com/kaitranntt/ccs/commit/4dace513eab3ffc28cf67fc1db652f5908403973))
* **minimax:** Add MiniMax placeholder to DEFAULT_PLACEHOLDERS ([46e0995](https://github.com/kaitranntt/ccs/commit/46e09950e8f9f612ce819e6191e63279b2fb3b1f))
* **minimax:** prevent double-resolve race condition and align placeholder ([a59ad0e](https://github.com/kaitranntt/ccs/commit/a59ad0e8c63b4159a35558dcae03ed4a7ca42c6f))
* **minimax:** restore migrate-command, remove broken migration file, fix validator typo ([c48f798](https://github.com/kaitranntt/ccs/commit/c48f798f3e375a25cf012f7b6f9c1853c8f99836))

### Documentation

* **minimax:** Update review_pr.md with fix status ([5d34bd6](https://github.com/kaitranntt/ccs/commit/5d34bd6ec2cd6a1a43fa3c62af820edb29442325))

### Code Refactoring

* **api-key-validator:** extract shared validation logic, remove unnecessary comments ([a00cf36](https://github.com/kaitranntt/ccs/commit/a00cf3691ef551f24dcac149c4473d9fdcf28043))
* **minimax:** Rename to 'mm' for brevity ([2b549f5](https://github.com/kaitranntt/ccs/commit/2b549f5b3dddbd17f40ef987badf4715d89297c7))

## [7.12.2](https://github.com/kaitranntt/ccs/compare/v7.12.1...v7.12.2) (2026-01-01)

### Bug Fixes

* **cliproxy:** add kiro/ghcp provider mappings to discoverExistingAccounts ([4386e91](https://github.com/kaitranntt/ccs/commit/4386e9122d92c7c32d8f11c4216631a473b5c5dd)), closes [#242](https://github.com/kaitranntt/ccs/issues/242)
* **ui:** show min Claude quota instead of avg all models ([a011908](https://github.com/kaitranntt/ccs/commit/a011908b3cf439b4a6e0a88ebaef03b8e527fb68))

### Tests

* **cliproxy:** add unit tests for discoverExistingAccounts ([43f1a98](https://github.com/kaitranntt/ccs/commit/43f1a9890e20387fdd8f059a778e345e9c3eacc2))

## [7.12.1](https://github.com/kaitranntt/ccs/compare/v7.12.0...v7.12.1) (2026-01-01)

### Bug Fixes

* **cliproxy:** add comprehensive port validation across proxy system ([e0a1f8f](https://github.com/kaitranntt/ccs/commit/e0a1f8f312c1eb7621b3ea2af2edb4df44a51f64))
* **cliproxy:** filter undefined config values to preserve defaults ([4c35e8a](https://github.com/kaitranntt/ccs/commit/4c35e8a39ed03ab026a1dff230e06f5d9449fbef))

## [7.12.0](https://github.com/kaitranntt/ccs/compare/v7.11.1...v7.12.0) (2026-01-01)

### Features

* **cliproxy:** add --allow-self-signed flag for HTTPS connections ([#227](https://github.com/kaitranntt/ccs/issues/227)) ([709976e](https://github.com/kaitranntt/ccs/commit/709976e897dfd71dbfb13dc1cfb2189076262db0))
* **delegation:** add Claude Code CLI flag passthrough ([6b74243](https://github.com/kaitranntt/ccs/commit/6b74243dc5b612168e7278e35768547358089f4a)), closes [#89](https://github.com/kaitranntt/ccs/issues/89)
* **release:** CLI flag passthrough, proxy fixes, and UI improvements ([#239](https://github.com/kaitranntt/ccs/issues/239)) ([b3ef76a](https://github.com/kaitranntt/ccs/commit/b3ef76a07b4f1e6d9852e851abff059bb7049a91)), closes [#228](https://github.com/kaitranntt/ccs/issues/228) [#89](https://github.com/kaitranntt/ccs/issues/89) [#234](https://github.com/kaitranntt/ccs/issues/234) [#227](https://github.com/kaitranntt/ccs/issues/227)

### Bug Fixes

* **cliproxy:** pass variant port to executor for isolation ([e58afd7](https://github.com/kaitranntt/ccs/commit/e58afd77905d40ce4526a85e4f59cea4fc33ff50)), closes [#228](https://github.com/kaitranntt/ccs/issues/228)
* **cliproxy:** propagate port in unified config and UI preset handlers ([2625389](https://github.com/kaitranntt/ccs/commit/26253891207d06c52530605f1f2246f366e70f7b))
* **cliproxy:** use correct default port (8317) for remote HTTP connections ([76aab09](https://github.com/kaitranntt/ccs/commit/76aab09616f2efbf186b2c3700cc84f4bb6c50f4))
* **prompt:** add stdin.pause() to prevent process hang after password input ([f30d0c1](https://github.com/kaitranntt/ccs/commit/f30d0c12396218bee61ee227d940a647123012ff))
* **ui:** enable cancel button during OAuth authentication ([86200eb](https://github.com/kaitranntt/ccs/commit/86200eb698565f4d0c86291bde4e9c221fa293e9)), closes [#234](https://github.com/kaitranntt/ccs/issues/234)

### Tests

* **delegation:** add comprehensive CLI flag passthrough tests ([d5e485b](https://github.com/kaitranntt/ccs/commit/d5e485b4099f65fe8b95bd03af8f05d2bb9abd05))

## [7.11.1](https://github.com/kaitranntt/ccs/compare/v7.11.0...v7.11.1) (2025-12-29)

### Bug Fixes

* validate required config fields before save ([#225](https://github.com/kaitranntt/ccs/issues/225)) ([388428b](https://github.com/kaitranntt/ccs/commit/388428bba935393f7619b9c682cf43c3dfb966af)), closes [#224](https://github.com/kaitranntt/ccs/issues/224) [#224](https://github.com/kaitranntt/ccs/issues/224)

## [7.11.0](https://github.com/kaitranntt/ccs/compare/v7.10.0...v7.11.0) (2025-12-29)

### Features

* **cliproxy:** add --proxy-timeout CLI option ([#220](https://github.com/kaitranntt/ccs/issues/220)) ([4cd9bec](https://github.com/kaitranntt/ccs/commit/4cd9bec9e1b88ebd6b83c6faf9c01399865c639b))

## [7.10.0](https://github.com/kaitranntt/ccs/compare/v7.9.0...v7.10.0) (2025-12-29)

### Features

* **cliproxy:** add account quota display for Antigravity provider ([205b5ab](https://github.com/kaitranntt/ccs/commit/205b5ab71fe560cdc8eed046ae133d40343df156))
* **error-logs:** extract model and quota reset info from error logs ([e3a71fc](https://github.com/kaitranntt/ccs/commit/e3a71fc89372e81af3c425c5bf8e42630b4c1b6b))
* **quota:** add OAuth token refresh for independent quota fetching ([4be8e92](https://github.com/kaitranntt/ccs/commit/4be8e927a08bbdcca02d000a9780e8466f0fc1f0))
* **quota:** implement proactive token refresh (5-min lead time) ([00597b3](https://github.com/kaitranntt/ccs/commit/00597b335887b9280b22d78d522146ee65e7037e))
* **ui:** replace misleading token expiry with runtime-based status ([6ccf6c5](https://github.com/kaitranntt/ccs/commit/6ccf6c5e138f6fdc847d47ef885dde39bc7aeeb1))

### Bug Fixes

* **cliproxy:** resolve merge conflicts and add edge case fixes ([7861b63](https://github.com/kaitranntt/ccs/commit/7861b63a5d977921bb0d726e7954b5c10cf74c1f))
* **error-logs:** fix endpoint regex for v1/messages URL format ([19550b2](https://github.com/kaitranntt/ccs/commit/19550b28f0087ec81925076d10205ce333c37799))
* **quota,error-logs:** match CLIProxyAPI headers and enhance error log display ([ac6f382](https://github.com/kaitranntt/ccs/commit/ac6f382f6a6cd64aa3fa0727d11bcf498aae28fc))
* **quota:** add unprovisioned account detection with actionable message ([ecfdcde](https://github.com/kaitranntt/ccs/commit/ecfdcdef782c429e2e125598d11ef7d974e68ae2))
* **quota:** remove misleading token expiration check in quota fetcher ([739270a](https://github.com/kaitranntt/ccs/commit/739270aac40f23239bd85a07dab30c20a3fab80a))
* **ui:** remove duplicate provider prop in ModelConfigTab ([3531991](https://github.com/kaitranntt/ccs/commit/3531991b5ddeb9678927c140383c1588a3898d16))
* **ui:** replace misleading 'Expires' with 'Last used' in credential health ([4233415](https://github.com/kaitranntt/ccs/commit/4233415095d7a56ebd98cb0f76a95e37ce25ddea))

## [7.9.0](https://github.com/kaitranntt/ccs/compare/v7.8.0...v7.9.0) (2025-12-27)

### Features

* **dashboard:** add Import from Kiro IDE button ([5f59d71](https://github.com/kaitranntt/ccs/commit/5f59d710a687aa23b22f470114fc763bf1412fbd))
* **ui:** add auth profile management to Dashboard ([fa8830e](https://github.com/kaitranntt/ccs/commit/fa8830e1ce97b6f0bb5f89c93325414a15412369))

### Bug Fixes

* **cliproxy:** ensure version sync after binary update ([29f1930](https://github.com/kaitranntt/ccs/commit/29f19308e627f46a5144521f8f2c75e9ff746f6a))
* **config:** use safe inline logic in getSettingsPath() legacy fallback ([a4a473a](https://github.com/kaitranntt/ccs/commit/a4a473ac93a3adf9b51a0e9371bbd48fa7363157))
* **dashboard:** support unified config.yaml in web server routes ([0c69740](https://github.com/kaitranntt/ccs/commit/0c697406947ef37f194db26e31d5822cc7e12463)), closes [#206](https://github.com/kaitranntt/ccs/issues/206)
* improve type safety and error handling in config-manager ([8a3c5a4](https://github.com/kaitranntt/ccs/commit/8a3c5a446beb197148a132900a88f09043cbab55)), closes [#215](https://github.com/kaitranntt/ccs/issues/215)
* **kiro:** add fallback import from Kiro IDE when OAuth callback redirects ([add4aa5](https://github.com/kaitranntt/ccs/commit/add4aa55c752be54164b42b0c108f54c24944570)), closes [#212](https://github.com/kaitranntt/ccs/issues/212)
* run RecoveryManager before early-exit commands and improve config handling ([0be3977](https://github.com/kaitranntt/ccs/commit/0be397784525275d0bbcc94877942f8963ca3d33)), closes [#214](https://github.com/kaitranntt/ccs/issues/214)
* **test:** remove redundant build from beforeAll hook ([67a48a8](https://github.com/kaitranntt/ccs/commit/67a48a8305125959ecab468f117cc9de0badddd5))
* **tests:** update test files for renamed getCliproxyConfigPath function ([ec2ee0a](https://github.com/kaitranntt/ccs/commit/ec2ee0a36d8498fb596d2e3ef793ce89a9f254f8))
* wrap RecoveryManager in try-catch to prevent blocking CLI commands ([2fff770](https://github.com/kaitranntt/ccs/commit/2fff770b6bc67616e855cc8dc940751bd1267a67)), closes [#215](https://github.com/kaitranntt/ccs/issues/215)

### Documentation

* update design principles and add feature interface requirements ([c200334](https://github.com/kaitranntt/ccs/commit/c20033473b150689ff4c581d5b4b2a6e12adb758))

## [7.8.0](https://github.com/kaitranntt/ccs/compare/v7.7.1...v7.8.0) (2025-12-26)

### Features

* **api:** add auth tokens REST endpoints ([ffd4996](https://github.com/kaitranntt/ccs/commit/ffd499698e03f1849a0deef3d289c08079a0951e))
* **cli:** add tokens command for auth token management ([0c6491c](https://github.com/kaitranntt/ccs/commit/0c6491c9d27a3bfb1ecc8c1627d1e1a70f59220a))
* **cliproxy:** add customizable auth token manager ([c4f0916](https://github.com/kaitranntt/ccs/commit/c4f09168ff35e52c8613a3181a86e4e4e5392dfc))
* **cliproxy:** add variant port isolation for concurrent proxy instances ([0bcaf4b](https://github.com/kaitranntt/ccs/commit/0bcaf4bc681e26bd13485678c88b55f4ac471eed))
* **ui:** add auth tokens settings tab ([71335a6](https://github.com/kaitranntt/ccs/commit/71335a61935971c7621fefcef973cc2b42e313fd))
* **ui:** add Settings link to control panel key hint ([7a6341f](https://github.com/kaitranntt/ccs/commit/7a6341f0d9a8dffdcbb318cf34f3dbbfbea70cb5))

### Bug Fixes

* **cliproxy:** use auth inheritance in stats-fetcher and config-generator ([133aeba](https://github.com/kaitranntt/ccs/commit/133aebaabc2295b75c13a14a448c2cc60d471363))
* **dashboard:** read accounts from unified config ([8d7845d](https://github.com/kaitranntt/ccs/commit/8d7845d67fb156671713888726d631415d0f4f9c)), closes [#203](https://github.com/kaitranntt/ccs/issues/203)
* **dashboard:** support unified config across health checks and settings ([9722e19](https://github.com/kaitranntt/ccs/commit/9722e1905dd25b9dd4d602e860ba36586db043b9)), closes [#203](https://github.com/kaitranntt/ccs/issues/203)
* **dashboard:** support unified config in overview and file watcher ([25f0ddb](https://github.com/kaitranntt/ccs/commit/25f0ddb9ddb19f9eb75c880b7c878d840cb2a494)), closes [#203](https://github.com/kaitranntt/ccs/issues/203)
* **doctor:** comprehensive health check fixes ([ac74550](https://github.com/kaitranntt/ccs/commit/ac745503e2a1644b2cb3542b917dbce5e6109200))
* **doctor:** prefer config.yaml and make settings files optional ([4fca7d1](https://github.com/kaitranntt/ccs/commit/4fca7d16edc6985d14422a21d45dccd619ef9aba))
* **ui:** initialize colors early for consistent status output ([e38af6a](https://github.com/kaitranntt/ccs/commit/e38af6ad6e2f65a73b4d16f6b4f0cead2eb7374d)), closes [#201](https://github.com/kaitranntt/ccs/issues/201)
* **ui:** simplify config header and add explicit save button ([7e031b5](https://github.com/kaitranntt/ccs/commit/7e031b5097b49f0cfc07334d31b83af41fac9669))
* **ui:** use effective management secret in control panel embed ([a762563](https://github.com/kaitranntt/ccs/commit/a762563f1b1fa8d984b7c9abf6b3b3c7f8ab6f97))

### Tests

* **cliproxy:** add comprehensive auth token test suite ([ed6776a](https://github.com/kaitranntt/ccs/commit/ed6776aadcf06c0c8572babe1ddc1de4e0902a17))
* **cliproxy:** add integration tests for variant port isolation ([8f120b5](https://github.com/kaitranntt/ccs/commit/8f120b515f0b71a2730c7affb50c9b148c00e502)), closes [#184](https://github.com/kaitranntt/ccs/issues/184)

## [7.7.1](https://github.com/kaitranntt/ccs/compare/v7.7.0...v7.7.1) (2025-12-26)

### Bug Fixes

* **health:** correct CLIProxy port detection on macOS/Linux ([d1a0ebe](https://github.com/kaitranntt/ccs/commit/d1a0ebee61b8987df85c328d359967e46d1e5226))
* **health:** use prefix matching for Linux process name truncation ([91e7b9f](https://github.com/kaitranntt/ccs/commit/91e7b9f93787e5b2d45bffdaed75e75c151281e4))

## [7.7.0](https://github.com/kaitranntt/ccs/compare/v7.6.0...v7.7.0) (2025-12-25)

### Features

* **api:** add Minimax, DeepSeek, Qwen provider presets ([e7066b9](https://github.com/kaitranntt/ccs/commit/e7066b99972129114fb223c6cde40f3127599ae6)), closes [#123](https://github.com/kaitranntt/ccs/issues/123)
* **kiro:** add UI toggle and auth hint for --no-incognito option ([083e674](https://github.com/kaitranntt/ccs/commit/083e67426c382ce534bed4830bedbede94cfdca7))
* **kiro:** improve auth UX with normal browser default and URL display ([df0c947](https://github.com/kaitranntt/ccs/commit/df0c94781e5f198f867723e1b5bccf17d6c4b250))

### Bug Fixes

* **cliproxy:** preserve user API keys during config regeneration ([2b4d21e](https://github.com/kaitranntt/ccs/commit/2b4d21e8ae615c840d76007d733017d375e6036f)), closes [#200](https://github.com/kaitranntt/ccs/issues/200)
* **core:** address all code review issues from PR [#199](https://github.com/kaitranntt/ccs/issues/199) ([f2a4200](https://github.com/kaitranntt/ccs/commit/f2a4200625e13754c7f79738dba0562e8ff27895))
* **kiro:** add --no-incognito option for normal browser auth ([13e4bac](https://github.com/kaitranntt/ccs/commit/13e4baca228313462b3e0e83d0b97594654a989b))
* **profiles:** prevent GLM auth regression from first-time install detection ([cc2d62d](https://github.com/kaitranntt/ccs/commit/cc2d62db38977fd5a0597388c2882e3600e5e179)), closes [#195](https://github.com/kaitranntt/ccs/issues/195)
* **qwen:** inherit stdin for Device Code flows to enable interactive prompts ([c811fdf](https://github.com/kaitranntt/ccs/commit/c811fdfc7914cc3bde3811ea04281055ebb3e273)), closes [#188](https://github.com/kaitranntt/ccs/issues/188)
* **ui:** add gemini-3-flash-preview to model dropdowns ([50653d1](https://github.com/kaitranntt/ccs/commit/50653d1054f89f0eaff24a6d8f471266269383b6)), closes [#194](https://github.com/kaitranntt/ccs/issues/194)
* **ui:** respect initialMode in profile create dialog ([db3662b](https://github.com/kaitranntt/ccs/commit/db3662b47986269ba9c12385021f4aa4bd1633f6))

### Code Refactoring

* **paths:** use expandPath() consistently for cross-platform path handling ([adb6222](https://github.com/kaitranntt/ccs/commit/adb6222bc671c3c4ade1bb019705a985de1947fa))

### Tests

* **auth:** add comprehensive tests for GLM auth persistence fix ([92a79aa](https://github.com/kaitranntt/ccs/commit/92a79aa78ba14aaf2b22f10eaab23f6e04220b17))

## [7.6.0](https://github.com/kaitranntt/ccs/compare/v7.5.1...v7.6.0) (2025-12-24)

### Features

* **cli:** add config command hints to help and error messages ([e981c39](https://github.com/kaitranntt/ccs/commit/e981c391a26d51de749099ca844915ffc06976e2))
* **setup:** add first-time setup wizard for config initialization ([cec616d](https://github.com/kaitranntt/ccs/commit/cec616d530d9cf61a3a45032465b01e9a4037558)), closes [#142](https://github.com/kaitranntt/ccs/issues/142)

### Bug Fixes

* **cliproxy:** respect enabled:false and use protocol-based port defaults ([a99b6eb](https://github.com/kaitranntt/ccs/commit/a99b6eb93f06c6788bbf13a196bbca908fa06f4c))
* **config:** improve edge case handling for config initialization ([ca78993](https://github.com/kaitranntt/ccs/commit/ca78993e7612143b3193e3cec3f8976be909e2d6))
* **ghcp:** display device code during OAuth device code flow ([46f1699](https://github.com/kaitranntt/ccs/commit/46f1699b1c6f716d06c1eaa3dc6aac94dd5761ec)), closes [#189](https://github.com/kaitranntt/ccs/issues/189)

### Code Refactoring

* **config:** migrate to config.yaml as primary format ([b34469d](https://github.com/kaitranntt/ccs/commit/b34469d75fd2c2b7fd4f4cc4c0cc28885001649b)), closes [#142](https://github.com/kaitranntt/ccs/issues/142)
* **ghcp:** remove unused device code session management ([5de6ccc](https://github.com/kaitranntt/ccs/commit/5de6cccee08aa06d6533181a1db189a595c5e123))

## [7.5.1](https://github.com/kaitranntt/ccs/compare/v7.5.0...v7.5.1) (2025-12-23)

### Bug Fixes

* **ui:** use UI color system for consistent CLI indicators ([91cd9ff](https://github.com/kaitranntt/ccs/commit/91cd9ffc16e46737d190b3858340e7c745021ef4))

### Code Refactoring

* **cliproxy:** enhance binary downloader with robust error handling ([c2dd026](https://github.com/kaitranntt/ccs/commit/c2dd0261b7c2a8e4b9bd11b04df16ed3ba6e93be))

## [7.5.0](https://github.com/kaitranntt/ccs/compare/v7.4.0...v7.5.0) (2025-12-22)

### Features

* **glm:** add GLM 4.7 model support ([a827b73](https://github.com/kaitranntt/ccs/commit/a827b73eef72f58705a6ebced0cf8620dda09399)), closes [#179](https://github.com/kaitranntt/ccs/issues/179)

## [7.4.0](https://github.com/kaitranntt/ccs/compare/v7.3.0...v7.4.0) (2025-12-22)

### Features

* **api:** add Azure Foundry preset ([31bafaa](https://github.com/kaitranntt/ccs/commit/31bafaab8dbff03c984df3b2d0b0d743d71b012b))

## [7.3.0](https://github.com/kaitranntt/ccs/compare/v7.2.0...v7.3.0) (2025-12-22)

### Features

* **auth:** add Kiro and GitHub Copilot OAuth providers ([2b441f6](https://github.com/kaitranntt/ccs/commit/2b441f64982c74174cb350537956e24970ef69f4))
* **cliproxy:** add ghcp settings and update variant adapter ([fae1ee2](https://github.com/kaitranntt/ccs/commit/fae1ee2b3139a22a753b55908305c5d4303be560))
* **cliproxy:** add kiro and ghcp OAuth configurations ([a01abe1](https://github.com/kaitranntt/ccs/commit/a01abe181b63d88fcf7e7fa9404071a69e7727d7))
* **cliproxy:** add kiro and ghcp providers to CLIProxyProvider type ([036714c](https://github.com/kaitranntt/ccs/commit/036714c77447c4887da038b7979495c80f171c88))
* **cliproxy:** add kiro and ghcp to OAuth diagnostics and account manager ([49bc0a4](https://github.com/kaitranntt/ccs/commit/49bc0a44cc58cafdb74d008e32500a6154460246))
* **cliproxy:** migrate from CLIProxyAPI to CLIProxyAPIPlus ([6f8587d](https://github.com/kaitranntt/ccs/commit/6f8587db6881dd3638320882e2eadcbf943c3945))
* **config:** add base settings for Kiro and Copilot providers ([b15ff7f](https://github.com/kaitranntt/ccs/commit/b15ff7f2355bf88f5867fe97475690a5affcbe10))
* **config:** add kiro and ghcp to unified config and auth routes ([d04bcc1](https://github.com/kaitranntt/ccs/commit/d04bcc117f5fd79bf52ab97ce597173a9c40ff00))
* **ui:** add Kiro and Copilot provider icons ([9ca20e7](https://github.com/kaitranntt/ccs/commit/9ca20e70de856f5cadb2cf8d1aeb60f1e725052a))
* **ui:** add kiro and ghcp to provider types and configs ([bf3d51a](https://github.com/kaitranntt/ccs/commit/bf3d51ade33620653a9dff297b394d1f3eaa2cf3))
* **ui:** add kiro and ghcp to wizard, auth flow, and settings ([9221545](https://github.com/kaitranntt/ccs/commit/92215457f0226695a0d57b25fba4744b85401bac))
* **ui:** integrate Kiro and Copilot providers, rename to CLIProxy Plus ([0f029f9](https://github.com/kaitranntt/ccs/commit/0f029f960a835f307f045eb9b7e01b448d4b539e))
* **ui:** update cliproxy components with kiro and ghcp providers ([099b712](https://github.com/kaitranntt/ccs/commit/099b712d4a1cd64388e669493851750f072f6d98))

### Bug Fixes

* update download URLs and binary names for CLIProxyAPIPlus ([4829902](https://github.com/kaitranntt/ccs/commit/48299028268a95587e5dbcb8285ab449b83b23ff))

### Documentation

* add CLIProxyAPIPlus attribution for Kiro and Copilot ([743d34a](https://github.com/kaitranntt/ccs/commit/743d34a881dbe3adccaca5d8a8e80529cb061eb7))
* **cli:** add ccs kiro and ccs ghcp to help text ([8c8a15f](https://github.com/kaitranntt/ccs/commit/8c8a15f1e14a71d0359a9d3a93abb29fee36633c))
* update documentation for kiro and ghcp providers ([b93b91c](https://github.com/kaitranntt/ccs/commit/b93b91c92596a747aae6b083819b1ec8162c1f5d))

### Code Refactoring

* complete CLIProxy Plus branding across CLI and UI ([af92bc3](https://github.com/kaitranntt/ccs/commit/af92bc30bf45a7816b07b4dfa6a5f0a42b9b03f4))
* rename CLIProxyAPI to CLIProxy Plus across UI and CLI ([670993d](https://github.com/kaitranntt/ccs/commit/670993d3644e9551c474c27014c25351d0e3c92a))

## [7.2.0](https://github.com/kaitranntt/ccs/compare/v7.1.1...v7.2.0) (2025-12-22)

### Features

* **cliproxy:** add localhost URL rewriting for remote proxy mode ([d0599e8](https://github.com/kaitranntt/ccs/commit/d0599e8d2c990ad02b270b8ada700db2d1d2e510))
* **cliproxy:** add proxy target resolver for remote/local routing ([9e2fd09](https://github.com/kaitranntt/ccs/commit/9e2fd096e4a30c29a9c909284234d129a577b853))
* **cliproxy:** add remote routing for stats and auth endpoints ([17bb6f9](https://github.com/kaitranntt/ccs/commit/17bb6f9836a56eddcb5e683e9d8f3d262f48d0cd))
* **ui:** add remote mode indicator to provider editor header ([3bf9ebe](https://github.com/kaitranntt/ccs/commit/3bf9ebe32a8cebe2bcf5f405bb2c04611b30f997))
* **ui:** dynamic control panel embed for remote CLIProxy ([bfa55e0](https://github.com/kaitranntt/ccs/commit/bfa55e041cb33b689d95b492abd637a98eab5b42))
* **ui:** show remote server info in ProxyStatusWidget ([d86dfab](https://github.com/kaitranntt/ccs/commit/d86dfab2e76416ea0e662f0702c854f2e11ac541))

### Bug Fixes

* **api:** add try-catch error handling to route handlers ([85b0f17](https://github.com/kaitranntt/ccs/commit/85b0f171105ecd2e12839718a80ae91e427f9b5a))
* **api:** complete error handling and add missing endpoints ([3ed961f](https://github.com/kaitranntt/ccs/commit/3ed961fce9ee7793b714abcbb6eef3346bd9098b))
* **api:** resolve route path mismatches ([557926f](https://github.com/kaitranntt/ccs/commit/557926ffe3f72e601758fc1c98279591c660440c))
* **cliproxy:** add gemini-cli provider mapping for remote auth ([068d577](https://github.com/kaitranntt/ccs/commit/068d5772f24510f61ed96fd632e06a08532f2615))
* **cliproxy:** address code review findings for remote routing ([cdb4653](https://github.com/kaitranntt/ccs/commit/cdb465342e6461cd7ff36f59f2d3873e50092210))
* **cliproxy:** load remote config from config.yaml for proxy resolution ([a2d01bc](https://github.com/kaitranntt/ccs/commit/a2d01bcc8a15e75c598854c7ddd314f5f17015f6))
* **cliproxy:** merge dev with proper remote mode integration ([28c6262](https://github.com/kaitranntt/ccs/commit/28c62625b36e74db7b5b07f475cf4df0072c9a27))
* **cliproxy:** respect user model settings in remote proxy mode ([4ee3100](https://github.com/kaitranntt/ccs/commit/4ee31006225ccec03ba6cf46a2257e122e1af79a))
* **ui:** correct cliproxy account API paths ([e84df00](https://github.com/kaitranntt/ccs/commit/e84df007409b21680bb2b10bfed841e3f5173c38))
* **ui:** hide local paths in remote CLIProxy mode ([883d9fa](https://github.com/kaitranntt/ccs/commit/883d9fa585f9df3f99c303555115fc53c03724ac))

### Documentation

* update documentation for v7.1 remote CLIProxy feature ([ec7781b](https://github.com/kaitranntt/ccs/commit/ec7781bbc85437e9c9ea3be84c01dff54129c99c)), closes [#142](https://github.com/kaitranntt/ccs/issues/142)

### CI

* improve issue tagging and label management in release workflows ([3638620](https://github.com/kaitranntt/ccs/commit/36386209bea64794bbbc0c3c2770d512fcc6fe83))

## [7.1.1](https://github.com/kaitranntt/ccs/compare/v7.1.0...v7.1.1) (2025-12-21)

### Bug Fixes

* **hooks:** memoize return objects to prevent infinite render loops ([f15b989](https://github.com/kaitranntt/ccs/commit/f15b98950865c01ec6d8d846e3a197bb04e6cf6e))
* **settings:** memoize useSettingsActions to prevent infinite render loop ([4f75e10](https://github.com/kaitranntt/ccs/commit/4f75e105a9ab0c498fb1748829396d695836be65))

### Documentation

* update documentation for modularization phases 6-9 ([e45b46d](https://github.com/kaitranntt/ccs/commit/e45b46d20708e29e770307dbfcce33d84465f137))

### Code Refactoring

* **ui:** modularize analytics page into directory structure ([03d9bf7](https://github.com/kaitranntt/ccs/commit/03d9bf76c474f93f12fcc5dbdaa55c1f215b1e39))
* **ui:** modularize auth-monitor into directory structure ([8ead6fa](https://github.com/kaitranntt/ccs/commit/8ead6fa0bf05fc8d37563a618c473d7eae808920))
* **ui:** modularize settings page into directory structure ([104a404](https://github.com/kaitranntt/ccs/commit/104a40414437a4f32492e4bcc33fdfbbec386e2f))

### Tests

* **ui:** add vitest testing infrastructure with 99 unit tests ([3fca933](https://github.com/kaitranntt/ccs/commit/3fca9338f9a77ac202dde6095bf70b5094199888))

## [7.1.0](https://github.com/kaitranntt/ccs/compare/v7.0.0...v7.1.0) (2025-12-21)

### Features

* **ui:** add visual feedback for WebSearch model auto-save ([eaf566b](https://github.com/kaitranntt/ccs/commit/eaf566beac65284d0809ca8a29f6ce2d03b79af8)), closes [#164](https://github.com/kaitranntt/ccs/issues/164)

### Bug Fixes

* **ci:** use commit-based changelog for dev release Discord notifications ([1129ec6](https://github.com/kaitranntt/ccs/commit/1129ec6ef570e7b922d2831c53bad83a68311b88))
* **ui:** add unsaved changes confirmation when switching profiles ([b790005](https://github.com/kaitranntt/ccs/commit/b790005c85e9f25fd14a14ac01b79e7562f1a1ea)), closes [#163](https://github.com/kaitranntt/ccs/issues/163)
* **ui:** fix profile switching and improve UX ([86d992f](https://github.com/kaitranntt/ccs/commit/86d992fce623a8378d5f53b1aff7b53d2f80e3c4))

### Documentation

* **readme:** add OpenRouter to built-in providers ([676929f](https://github.com/kaitranntt/ccs/commit/676929fc87c4cc450e3dc6e3f05ff60dfcead255))
* **standards:** add input state persistence patterns ([53a7ba8](https://github.com/kaitranntt/ccs/commit/53a7ba8d3ffe81f87306e84357fce4f6ec9d7135)), closes [#165](https://github.com/kaitranntt/ccs/issues/165)

## [7.0.0](https://github.com/kaitranntt/ccs/compare/v6.7.1...v7.0.0) (2025-12-21)

### ⚠ BREAKING CHANGES

* **install:** GLM/GLMT/Kimi profiles no longer auto-created

- remove glm.settings.json auto-creation
- remove glmt.settings.json auto-creation
- remove kimi.settings.json auto-creation
- config.json now starts with empty profiles
- users create via: ccs api create --preset glm
- or via UI: Profile Create Dialog → Provider Presets
- existing profiles preserved for backward compatibility

### Features

* **api:** unify profile management with config-aware services ([4c74e92](https://github.com/kaitranntt/ccs/commit/4c74e92cc46afed9c8232944a2a443709b130a2c))
* **cli:** add --preset option to ccs api create command ([418d121](https://github.com/kaitranntt/ccs/commit/418d121577098722a35b060a37388ea2d267dffd))
* **cli:** add interactive OpenRouter model picker for api create ([d193626](https://github.com/kaitranntt/ccs/commit/d193626e3bfb8962809e2a6daf9697d302a70ff7))
* **install:** remove auto-creation of GLM/GLMT/Kimi profiles ([f96116d](https://github.com/kaitranntt/ccs/commit/f96116d280d1addcaf5ea5ba5e605f8a3f058ad7))
* **openrouter:** prioritize Exacto models for better agentic performance ([ebc8ee2](https://github.com/kaitranntt/ccs/commit/ebc8ee2638a10500c85f0af862f9d99589429b89))
* **proxy:** improve remote proxy UX defaults ([116b6a1](https://github.com/kaitranntt/ccs/commit/116b6a15b0bf7db3a11fb428706dde126814004d))
* **ui:** add dynamic newest models detection for OpenRouter ([a1cbd4d](https://github.com/kaitranntt/ccs/commit/a1cbd4d92397bc15a9cb627bda5cd360603a2bf5))
* **ui:** add OpenRouter badge to API Profiles sidebar item ([a08aef9](https://github.com/kaitranntt/ccs/commit/a08aef9fb79c8cf8c1109414394da43d6e35db31))
* **ui:** add OpenRouter model catalog core infrastructure ([80beb1d](https://github.com/kaitranntt/ccs/commit/80beb1dadafff283c713d8a7ae556e06a7935882))
* **ui:** add OpenRouter model picker and tier mapping components ([3cd21bb](https://github.com/kaitranntt/ccs/commit/3cd21bb67b1e357992e662fe666bd35a4062de04))
* **ui:** add provider preset categories with helper function ([10cfe0f](https://github.com/kaitranntt/ccs/commit/10cfe0fefad9892d1e6314122027dc05bea1a6bf))
* **ui:** add provider presets and OpenRouter promo components ([9c90e1d](https://github.com/kaitranntt/ccs/commit/9c90e1dc2cdc8aa11bb82ae4b337f7fed2f4c373))
* **ui:** add streamlined OpenRouter profile editor ([7788137](https://github.com/kaitranntt/ccs/commit/7788137f1c407854d7d8aa5c10c18fd98dbafa2f))
* **ui:** add value input for new environment variables ([f947aeb](https://github.com/kaitranntt/ccs/commit/f947aeb21b0a3a73c8b401de263deb68c69769ce))
* **ui:** integrate OpenRouter model picker into profile editor ([677f9d1](https://github.com/kaitranntt/ccs/commit/677f9d1e72990e51ed88e00b228369c8be520bbe))
* **ui:** rewrite profile create dialog with provider presets ([adcc323](https://github.com/kaitranntt/ccs/commit/adcc3235f0fcd328f3729125e5c5988f9db0937d))

### Bug Fixes

* **ci:** use custom dev versioning to preserve stable version coupling ([dce4b36](https://github.com/kaitranntt/ccs/commit/dce4b36fc658cb1a692f44152002fe5e1e79f24f))
* **cliproxy:** correct remote proxy URL building for default port ([294d8d5](https://github.com/kaitranntt/ccs/commit/294d8d55e517ce064601ec7fd54827da61e0d0f2))
* **cliproxy:** improve remote proxy error messages ([55464c5](https://github.com/kaitranntt/ccs/commit/55464c5c5cb67b1cc4c2352130384dc6bc013f4c)), closes [#142](https://github.com/kaitranntt/ccs/issues/142)
* **cliproxy:** use /v1/models for remote proxy health check ([5e1d290](https://github.com/kaitranntt/ccs/commit/5e1d290865876a7e002b1e6c3c2911e1ac7e49b2)), closes [#142](https://github.com/kaitranntt/ccs/issues/142)
* **config:** add missing cliproxy_server section to YAML serialization ([b322203](https://github.com/kaitranntt/ccs/commit/b32220364eb3b023b6d62fd12a4cc4cd60da85e5))
* **openrouter:** add ANTHROPIC_API_KEY="" default for OpenRouter profiles ([70bc44e](https://github.com/kaitranntt/ccs/commit/70bc44eb11a28ec3e338d9ef45d33d9beaac6873))
* **openrouter:** correct ANTHROPIC_BASE_URL to https://openrouter.ai/api ([7d4961e](https://github.com/kaitranntt/ccs/commit/7d4961e7a955dd48075aae7e215b3f0aaf4367ef))
* **openrouter:** show all env vars except API key in Additional Variables ([f41d361](https://github.com/kaitranntt/ccs/commit/f41d361fe547c0201b4d49c542391b4e5d96b93e))
* **ui:** deduplicate API key and restore add variable input ([3f7add5](https://github.com/kaitranntt/ccs/commit/3f7add5c10be5485567e2462754c145e94c19d78))
* **ui:** model selection now updates all tiers correctly ([723ce28](https://github.com/kaitranntt/ccs/commit/723ce284314272f05b0413c3f9fdd4bcdb298618))
* **ui:** resolve Radix ScrollArea viewport overflow ([2b6600a](https://github.com/kaitranntt/ccs/commit/2b6600abd74d369dfd245b8f77c26786006e46cb))
* **ui:** show OpenRouterQuickStart by default on API page ([05380e2](https://github.com/kaitranntt/ccs/commit/05380e21b435d09d0105bee3868d4c73028e558d))
* **ui:** use current input values for test connection and persist across tabs ([12b534c](https://github.com/kaitranntt/ccs/commit/12b534cc495337f2c6e24884cde7d7296a34f380)), closes [#142](https://github.com/kaitranntt/ccs/issues/142) [#163](https://github.com/kaitranntt/ccs/issues/163) [#164](https://github.com/kaitranntt/ccs/issues/164) [#165](https://github.com/kaitranntt/ccs/issues/165)
* **update:** correct dev version comparison semantic ([df77745](https://github.com/kaitranntt/ccs/commit/df77745eca747e6877c754f0002a4ba9fd50eb85))

### Code Refactoring

* **config:** remove secrets.yaml architecture ([4f4ab43](https://github.com/kaitranntt/ccs/commit/4f4ab43eb39576b5bd3dfc16ced306d0653e72f0))
* **ui:** rename /api route to /providers ([9382278](https://github.com/kaitranntt/ccs/commit/93822787045188e3e006b8671ea5ae24f94459ce))
* **ui:** reorganize profile create dialog with preset categories ([96310dd](https://github.com/kaitranntt/ccs/commit/96310dd1acd5d6265cd2d68d970b79409d988c1f))
* **ui:** replace hardcoded orange colors with accent tokens ([b9f6823](https://github.com/kaitranntt/ccs/commit/b9f6823fc93c42f0f9af85750386149635428aa0))

### Tests

* **npm:** update tests for preset-based profile creation ([de45fa0](https://github.com/kaitranntt/ccs/commit/de45fa0da9d1345dff5871a71af7bbedb235076f))

## [6.8.0-dev.1](https://github.com/kaitranntt/ccs/compare/v6.7.2-dev.1...v6.8.0-dev.1) (2025-12-20)

### Features

* **proxy:** improve remote proxy UX defaults ([116b6a1](https://github.com/kaitranntt/ccs/commit/116b6a15b0bf7db3a11fb428706dde126814004d))

### Bug Fixes

* **cliproxy:** use /v1/models for remote proxy health check ([5e1d290](https://github.com/kaitranntt/ccs/commit/5e1d290865876a7e002b1e6c3c2911e1ac7e49b2)), closes [#142](https://github.com/kaitranntt/ccs/issues/142)

## [6.7.2-dev.1](https://github.com/kaitranntt/ccs/compare/v6.7.1...v6.7.2-dev.1) (2025-12-20)

### Code Refactoring

* **ui:** rename /api route to /providers ([9382278](https://github.com/kaitranntt/ccs/commit/93822787045188e3e006b8671ea5ae24f94459ce))

## [6.7.1](https://github.com/kaitranntt/ccs/compare/v6.7.0...v6.7.1) (2025-12-20)

### Documentation

* add comprehensive documentation suite for modular architecture ([1ffd169](https://github.com/kaitranntt/ccs/commit/1ffd169b98560bf59b03653937ff479e96b47800))
* **readme:** update providers, websearch, and add star history ([0dc2da6](https://github.com/kaitranntt/ccs/commit/0dc2da6e5ae55c2c99de92037bdc9f1f43a3eeec))

### Code Refactoring

* add barrel exports for commands and utils directories ([50c427d](https://github.com/kaitranntt/ccs/commit/50c427d339f008e628c05b3f150843425174b425))
* add barrel exports to api/, glmt/, management/ ([6372b3d](https://github.com/kaitranntt/ccs/commit/6372b3d303fbd1eced272526b882984c784f0358))
* **api:** extract service layer from api-command ([ecb6bb4](https://github.com/kaitranntt/ccs/commit/ecb6bb448a74c1f9bc4220c3674e9b4669093a3e))
* **auth:** modularize auth-commands into commands/ directory ([0341f4f](https://github.com/kaitranntt/ccs/commit/0341f4f86f5598dc3a86c06d2a05e22b2af3342d))
* **cliproxy:** extract service layer from cliproxy-command ([b49b7d1](https://github.com/kaitranntt/ccs/commit/b49b7d17b20e6f470e0315ad777f61e0f266b246))
* **cliproxy:** modularize auth handler and binary ([5c28935](https://github.com/kaitranntt/ccs/commit/5c28935d1e893b643556daf4ff4127d543082fab))
* **cliproxy:** modularize binary-manager into binary/ directory ([d3c94fe](https://github.com/kaitranntt/ccs/commit/d3c94fe6a2344aac6215fb12952e42ac17837daa))
* **delegation:** modularize headless-executor into executor/ directory ([c3baaa8](https://github.com/kaitranntt/ccs/commit/c3baaa8251e2f4f54b10e68a0a5eb886ec271ace))
* **errors:** centralize error handling infrastructure ([22dbfd9](https://github.com/kaitranntt/ccs/commit/22dbfd91c5862c91988cba6cd07eef22e6bf97bf))
* **glmt:** modularize transformer pipeline ([cd107e3](https://github.com/kaitranntt/ccs/commit/cd107e354c0faff7582d55fadccee0135ea685fe))
* **management:** modularize doctor health checks ([0eb2030](https://github.com/kaitranntt/ccs/commit/0eb2030dc2af6e351a88801dc42ce739208bfc2e))
* remove unused deprecated code ([4a5b832](https://github.com/kaitranntt/ccs/commit/4a5b832a6ed5990d4621e79f17f5f81e8a0c87d1))
* **types:** add generic types and consolidate ExecutionResult ([6c78b63](https://github.com/kaitranntt/ccs/commit/6c78b63908dd258770beb74abc25b62b56f6fcd5))
* **ui:** add barrel exports for analytics and components root ([b911db8](https://github.com/kaitranntt/ccs/commit/b911db8b5fd66e4b4a9e1a9261dfcfa4d74bb1ba))
* **ui:** organize health components into health/ directory ([a106aa2](https://github.com/kaitranntt/ccs/commit/a106aa2ee63178e1635df09be5bc2cf2a9da04d7))
* **ui:** organize layout components into layout/ directory ([bef9955](https://github.com/kaitranntt/ccs/commit/bef99551230a04831e9a45c5f765ef341ee48b0d))
* **ui:** organize shared components into shared/ directory ([3c7b0e7](https://github.com/kaitranntt/ccs/commit/3c7b0e7a651cd81fc38a907c9f480f173df5c785))
* **ui:** remove old flat component files after reorganization ([e1fd394](https://github.com/kaitranntt/ccs/commit/e1fd3945fc146997691aea2dcac1b03e3005dd69))
* **ui:** split account-flow-viz into account/flow-viz/ directory ([8fd35c8](https://github.com/kaitranntt/ccs/commit/8fd35c8dd619c56a7562c34172a8de3e736be4c8))
* **ui:** split copilot-config-form into copilot/config-form/ directory ([1b1015c](https://github.com/kaitranntt/ccs/commit/1b1015cf506a55393e6a48c99711c3ffa7dac37c))
* **ui:** split error-logs-monitor into monitoring/error-logs/ directory ([946030c](https://github.com/kaitranntt/ccs/commit/946030c8363ed5e4ac6ebe8b6860d0f8fb006c41))
* **ui:** split profile-editor into profiles/editor/ directory ([6778c4d](https://github.com/kaitranntt/ccs/commit/6778c4d637ca936110107672ff65c02b1366a607))
* **ui:** split provider-editor into cliproxy/provider-editor/ directory ([4bea5a3](https://github.com/kaitranntt/ccs/commit/4bea5a33468813d9382d6e7cc4270ca97fc965f8))
* **ui:** split quick-setup-wizard into setup/wizard/ directory ([81196b0](https://github.com/kaitranntt/ccs/commit/81196b0ff14a2b119cdd55d49f8a7eeb63abc8f6))
* **ui:** update imports to use new domain directories ([c70ba89](https://github.com/kaitranntt/ccs/commit/c70ba89b43a177907592d6dd62ef35cf39e691e0))
* **utils:** extract formatRelativeTime to utils/time.ts ([e1f135a](https://github.com/kaitranntt/ccs/commit/e1f135a93a77f66947ac95b76017e00a5a750c5f))
* **utils:** modularize ui.ts into ui/ directory ([c1e5ec7](https://github.com/kaitranntt/ccs/commit/c1e5ec70b5052f19dc6a2d339cd4317b44e10e34))
* **utils:** modularize websearch-manager into websearch/ directory ([5e4fa20](https://github.com/kaitranntt/ccs/commit/5e4fa200df87861e9b078f1696b95569c570ea84))
* **utils:** remove deprecated color and error functions from helpers.ts ([99afb3e](https://github.com/kaitranntt/ccs/commit/99afb3e011cae46369753e36b2fe1ef231c2f535))
* **utils:** use canonical ValidationResult from types/utils ([18424cb](https://github.com/kaitranntt/ccs/commit/18424cba89120c61348d03195d00c00aa8cfcbe4))
* **web-server:** extract usage aggregator service ([9346ff2](https://github.com/kaitranntt/ccs/commit/9346ff2be96bc5b8660774a814f1113de6b6ee36))
* **web-server:** extract usage module to usage/ directory ([bae323c](https://github.com/kaitranntt/ccs/commit/bae323c0d35051c75cc0224a3000823c43f5d875))
* **web-server:** modularize health-service into health/ directory ([c1f30ae](https://github.com/kaitranntt/ccs/commit/c1f30ae80076e12d1ed536d992c3dc8fad8248ca))
* **web-server:** modularize routes into dedicated files ([a12c3d8](https://github.com/kaitranntt/ccs/commit/a12c3d800aedbfd232651cd69c9fcad7b702087d))
* **websearch:** unify CLI status types with ComponentStatus ([a8f7dad](https://github.com/kaitranntt/ccs/commit/a8f7dad4e39cadf7453059fb982561170d7efb3b))

### Performance Improvements

* **assets:** convert screenshots to WebP, add new feature images ([a9d21c2](https://github.com/kaitranntt/ccs/commit/a9d21c21f2bb94b83d829286ad0338fc81f27975))

## [6.7.1-dev.1](https://github.com/kaitranntt/ccs/compare/v6.7.0...v6.7.1-dev.1) (2025-12-20)

### Documentation

* add comprehensive documentation suite for modular architecture ([1ffd169](https://github.com/kaitranntt/ccs/commit/1ffd169b98560bf59b03653937ff479e96b47800))
* **readme:** update providers, websearch, and add star history ([0dc2da6](https://github.com/kaitranntt/ccs/commit/0dc2da6e5ae55c2c99de92037bdc9f1f43a3eeec))

### Code Refactoring

* add barrel exports for commands and utils directories ([50c427d](https://github.com/kaitranntt/ccs/commit/50c427d339f008e628c05b3f150843425174b425))
* add barrel exports to api/, glmt/, management/ ([6372b3d](https://github.com/kaitranntt/ccs/commit/6372b3d303fbd1eced272526b882984c784f0358))
* **api:** extract service layer from api-command ([ecb6bb4](https://github.com/kaitranntt/ccs/commit/ecb6bb448a74c1f9bc4220c3674e9b4669093a3e))
* **auth:** modularize auth-commands into commands/ directory ([0341f4f](https://github.com/kaitranntt/ccs/commit/0341f4f86f5598dc3a86c06d2a05e22b2af3342d))
* **cliproxy:** extract service layer from cliproxy-command ([b49b7d1](https://github.com/kaitranntt/ccs/commit/b49b7d17b20e6f470e0315ad777f61e0f266b246))
* **cliproxy:** modularize auth handler and binary ([5c28935](https://github.com/kaitranntt/ccs/commit/5c28935d1e893b643556daf4ff4127d543082fab))
* **cliproxy:** modularize binary-manager into binary/ directory ([d3c94fe](https://github.com/kaitranntt/ccs/commit/d3c94fe6a2344aac6215fb12952e42ac17837daa))
* **delegation:** modularize headless-executor into executor/ directory ([c3baaa8](https://github.com/kaitranntt/ccs/commit/c3baaa8251e2f4f54b10e68a0a5eb886ec271ace))
* **errors:** centralize error handling infrastructure ([22dbfd9](https://github.com/kaitranntt/ccs/commit/22dbfd91c5862c91988cba6cd07eef22e6bf97bf))
* **glmt:** modularize transformer pipeline ([cd107e3](https://github.com/kaitranntt/ccs/commit/cd107e354c0faff7582d55fadccee0135ea685fe))
* **management:** modularize doctor health checks ([0eb2030](https://github.com/kaitranntt/ccs/commit/0eb2030dc2af6e351a88801dc42ce739208bfc2e))
* remove unused deprecated code ([4a5b832](https://github.com/kaitranntt/ccs/commit/4a5b832a6ed5990d4621e79f17f5f81e8a0c87d1))
* **types:** add generic types and consolidate ExecutionResult ([6c78b63](https://github.com/kaitranntt/ccs/commit/6c78b63908dd258770beb74abc25b62b56f6fcd5))
* **ui:** add barrel exports for analytics and components root ([b911db8](https://github.com/kaitranntt/ccs/commit/b911db8b5fd66e4b4a9e1a9261dfcfa4d74bb1ba))
* **ui:** organize health components into health/ directory ([a106aa2](https://github.com/kaitranntt/ccs/commit/a106aa2ee63178e1635df09be5bc2cf2a9da04d7))
* **ui:** organize layout components into layout/ directory ([bef9955](https://github.com/kaitranntt/ccs/commit/bef99551230a04831e9a45c5f765ef341ee48b0d))
* **ui:** organize shared components into shared/ directory ([3c7b0e7](https://github.com/kaitranntt/ccs/commit/3c7b0e7a651cd81fc38a907c9f480f173df5c785))
* **ui:** remove old flat component files after reorganization ([e1fd394](https://github.com/kaitranntt/ccs/commit/e1fd3945fc146997691aea2dcac1b03e3005dd69))
* **ui:** split account-flow-viz into account/flow-viz/ directory ([8fd35c8](https://github.com/kaitranntt/ccs/commit/8fd35c8dd619c56a7562c34172a8de3e736be4c8))
* **ui:** split copilot-config-form into copilot/config-form/ directory ([1b1015c](https://github.com/kaitranntt/ccs/commit/1b1015cf506a55393e6a48c99711c3ffa7dac37c))
* **ui:** split error-logs-monitor into monitoring/error-logs/ directory ([946030c](https://github.com/kaitranntt/ccs/commit/946030c8363ed5e4ac6ebe8b6860d0f8fb006c41))
* **ui:** split profile-editor into profiles/editor/ directory ([6778c4d](https://github.com/kaitranntt/ccs/commit/6778c4d637ca936110107672ff65c02b1366a607))
* **ui:** split provider-editor into cliproxy/provider-editor/ directory ([4bea5a3](https://github.com/kaitranntt/ccs/commit/4bea5a33468813d9382d6e7cc4270ca97fc965f8))
* **ui:** split quick-setup-wizard into setup/wizard/ directory ([81196b0](https://github.com/kaitranntt/ccs/commit/81196b0ff14a2b119cdd55d49f8a7eeb63abc8f6))
* **ui:** update imports to use new domain directories ([c70ba89](https://github.com/kaitranntt/ccs/commit/c70ba89b43a177907592d6dd62ef35cf39e691e0))
* **utils:** extract formatRelativeTime to utils/time.ts ([e1f135a](https://github.com/kaitranntt/ccs/commit/e1f135a93a77f66947ac95b76017e00a5a750c5f))
* **utils:** modularize ui.ts into ui/ directory ([c1e5ec7](https://github.com/kaitranntt/ccs/commit/c1e5ec70b5052f19dc6a2d339cd4317b44e10e34))
* **utils:** modularize websearch-manager into websearch/ directory ([5e4fa20](https://github.com/kaitranntt/ccs/commit/5e4fa200df87861e9b078f1696b95569c570ea84))
* **utils:** remove deprecated color and error functions from helpers.ts ([99afb3e](https://github.com/kaitranntt/ccs/commit/99afb3e011cae46369753e36b2fe1ef231c2f535))
* **utils:** use canonical ValidationResult from types/utils ([18424cb](https://github.com/kaitranntt/ccs/commit/18424cba89120c61348d03195d00c00aa8cfcbe4))
* **web-server:** extract usage aggregator service ([9346ff2](https://github.com/kaitranntt/ccs/commit/9346ff2be96bc5b8660774a814f1113de6b6ee36))
* **web-server:** extract usage module to usage/ directory ([bae323c](https://github.com/kaitranntt/ccs/commit/bae323c0d35051c75cc0224a3000823c43f5d875))
* **web-server:** modularize health-service into health/ directory ([c1f30ae](https://github.com/kaitranntt/ccs/commit/c1f30ae80076e12d1ed536d992c3dc8fad8248ca))
* **web-server:** modularize routes into dedicated files ([a12c3d8](https://github.com/kaitranntt/ccs/commit/a12c3d800aedbfd232651cd69c9fcad7b702087d))
* **websearch:** unify CLI status types with ComponentStatus ([a8f7dad](https://github.com/kaitranntt/ccs/commit/a8f7dad4e39cadf7453059fb982561170d7efb3b))

### Performance Improvements

* **assets:** convert screenshots to WebP, add new feature images ([a9d21c2](https://github.com/kaitranntt/ccs/commit/a9d21c21f2bb94b83d829286ad0338fc81f27975))

## [6.7.0](https://github.com/kaitranntt/ccs/compare/v6.6.1...v6.7.0) (2025-12-19)

### Features

* **cliproxy:** auto-apply default preset when adding first account ([4036c42](https://github.com/kaitranntt/ccs/commit/4036c42687c0e5124825998350431f17ce617442))
* **env:** add debug logging for global env injection ([68eab56](https://github.com/kaitranntt/ccs/commit/68eab562ce404ac1933c76520e5597327348bff2))
* **recovery:** add lazy initialization for bun/pnpm users ([2d2cd3e](https://github.com/kaitranntt/ccs/commit/2d2cd3eca21a49af04ca0b1c1d549e62b6ff5cc9))

### Bug Fixes

* **ci:** use built-in GITHUB_TOKEN for release comments ([cff38ac](https://github.com/kaitranntt/ccs/commit/cff38ac53d392317325e2cbf5281956ff59174be))
* **cliproxy:** include BASE_URL and AUTH_TOKEN when applying presets ([598454c](https://github.com/kaitranntt/ccs/commit/598454c931267082ba80c4ef426d0ef2c0370f55))
* **cliproxy:** prevent port race condition with unified detection and startup lock ([96f17e3](https://github.com/kaitranntt/ccs/commit/96f17e3afba93288b041f6c2883753692b4e9ca1))
* **cliproxy:** prevent variant names matching reserved provider names ([7ea64bd](https://github.com/kaitranntt/ccs/commit/7ea64bdb4392d8cd41bc871892466d30c50b58fd))
* **remote-proxy:** fix TypeError and make port optional with protocol defaults ([03aea4e](https://github.com/kaitranntt/ccs/commit/03aea4eac233caf00736ceec80b4cc841bce948a)), closes [#142](https://github.com/kaitranntt/ccs/issues/142)
* **update-checker:** resolve dev channel update and duplicate comments ([b6b1817](https://github.com/kaitranntt/ccs/commit/b6b18173cc41788328ef1c8831de9527898f06a1))
* **web-server:** add comprehensive reserved name validation ([2373100](https://github.com/kaitranntt/ccs/commit/2373100c177654910922c6ef0e5ffc7cfe087b26))

## [6.7.0-dev.5](https://github.com/kaitranntt/ccs/compare/v6.7.0-dev.4...v6.7.0-dev.5) (2025-12-19)

### Features

* **cliproxy:** auto-apply default preset when adding first account ([4036c42](https://github.com/kaitranntt/ccs/commit/4036c42687c0e5124825998350431f17ce617442))

## [6.7.0-dev.4](https://github.com/kaitranntt/ccs/compare/v6.7.0-dev.3...v6.7.0-dev.4) (2025-12-19)

### Bug Fixes

* **cliproxy:** prevent port race condition with unified detection and startup lock ([96f17e3](https://github.com/kaitranntt/ccs/commit/96f17e3afba93288b041f6c2883753692b4e9ca1))

## [6.7.0-dev.3](https://github.com/kaitranntt/ccs/compare/v6.7.0-dev.2...v6.7.0-dev.3) (2025-12-19)

### Features

* **recovery:** add lazy initialization for bun/pnpm users ([2d2cd3e](https://github.com/kaitranntt/ccs/commit/2d2cd3eca21a49af04ca0b1c1d549e62b6ff5cc9))

## [6.7.0-dev.2](https://github.com/kaitranntt/ccs/compare/v6.7.0-dev.1...v6.7.0-dev.2) (2025-12-19)

### Bug Fixes

* **cliproxy:** include BASE_URL and AUTH_TOKEN when applying presets ([598454c](https://github.com/kaitranntt/ccs/commit/598454c931267082ba80c4ef426d0ef2c0370f55))
* **cliproxy:** prevent variant names matching reserved provider names ([7ea64bd](https://github.com/kaitranntt/ccs/commit/7ea64bdb4392d8cd41bc871892466d30c50b58fd))
* **web-server:** add comprehensive reserved name validation ([2373100](https://github.com/kaitranntt/ccs/commit/2373100c177654910922c6ef0e5ffc7cfe087b26))

## [6.7.0-dev.1](https://github.com/kaitranntt/ccs/compare/v6.6.2-dev.3...v6.7.0-dev.1) (2025-12-19)

### Features

* **env:** add debug logging for global env injection ([68eab56](https://github.com/kaitranntt/ccs/commit/68eab562ce404ac1933c76520e5597327348bff2))

## [6.6.2-dev.3](https://github.com/kaitranntt/ccs/compare/v6.6.2-dev.2...v6.6.2-dev.3) (2025-12-19)

### Bug Fixes

* **update-checker:** resolve dev channel update and duplicate comments ([b6b1817](https://github.com/kaitranntt/ccs/commit/b6b18173cc41788328ef1c8831de9527898f06a1))

## [6.6.2-dev.2](https://github.com/kaitranntt/ccs/compare/v6.6.2-dev.1...v6.6.2-dev.2) (2025-12-19)

### Bug Fixes

* **remote-proxy:** fix TypeError and make port optional with protocol defaults ([03aea4e](https://github.com/kaitranntt/ccs/commit/03aea4eac233caf00736ceec80b4cc841bce948a)), closes [#142](https://github.com/kaitranntt/ccs/issues/142)

## [6.6.2-dev.1](https://github.com/kaitranntt/ccs/compare/v6.6.1...v6.6.2-dev.1) (2025-12-19)

### Bug Fixes

* **ci:** use built-in GITHUB_TOKEN for release comments ([cff38ac](https://github.com/kaitranntt/ccs/commit/cff38ac53d392317325e2cbf5281956ff59174be))

## [6.6.1](https://github.com/kaitranntt/ccs/compare/v6.6.0...v6.6.1) (2025-12-19)

### Bug Fixes

* **cliproxy:** register session on dashboard start and add port-based stop fallback ([a3b172c](https://github.com/kaitranntt/ccs/commit/a3b172cc437c4a00612667edf44f8aa3b3ffa1ae))

## [6.6.1-dev.1](https://github.com/kaitranntt/ccs/compare/v6.6.0...v6.6.1-dev.1) (2025-12-19)

### Bug Fixes

* **cliproxy:** register session on dashboard start and add port-based stop fallback ([a3b172c](https://github.com/kaitranntt/ccs/commit/a3b172cc437c4a00612667edf44f8aa3b3ffa1ae))

## [6.6.0](https://github.com/kaitranntt/ccs/compare/v6.5.0...v6.6.0) (2025-12-19)

### ⚠ BREAKING CHANGES

* Native shell installers (curl/irm) no longer work.
Use `npm install -g @kaitranntt/ccs` instead.

### Features

* **ci:** add Discord notifications for releases ([ee76d66](https://github.com/kaitranntt/ccs/commit/ee76d663aec59a86a236156dbc163d0d291c0446))
* **ci:** add semantic-release for dev branch with rich Discord notifications ([0f590c8](https://github.com/kaitranntt/ccs/commit/0f590c80d689c39cea7c94937ed398941dddb533))
* **cleanup:** add age-based error log cleanup ([45207b4](https://github.com/kaitranntt/ccs/commit/45207b4e7f92c09d7464dd5c954718254ddfd43a))
* **cliproxy:** add getRemoteEnvVars for remote proxy mode ([f4a50d0](https://github.com/kaitranntt/ccs/commit/f4a50d006c1f6bd284fe743f9a322540763e1848))
* **cliproxy:** add proxy config resolver with CLI flag support ([68a93f0](https://github.com/kaitranntt/ccs/commit/68a93f0500f396ebcc65cc133c1a444ae5a0f220))
* **cliproxy:** add remote proxy client for health checks ([30d564c](https://github.com/kaitranntt/ccs/commit/30d564cda66a54c2ac12788559624cb0736cdeb3))
* **cliproxy:** integrate remote proxy mode in executor ([bd1ff2f](https://github.com/kaitranntt/ccs/commit/bd1ff2f059d01d4371b2230d4902bc5ab210055e))
* **cliproxy:** set WRITABLE_PATH for log storage in ~/.ccs/cliproxy/ ([6b9396f](https://github.com/kaitranntt/ccs/commit/6b9396fbc6d464bc3e3d6d3bb639e70fe5306074))
* **config:** add proxy configuration types and schema ([eff2e2d](https://github.com/kaitranntt/ccs/commit/eff2e2d29f3f227c05103c252823fb9e040b6e49))
* **config:** add proxy section to unified config loader ([1971744](https://github.com/kaitranntt/ccs/commit/197174441f6eeca5e3c98e88af43d91ee081f734))
* **dashboard:** add error log viewer for CLIProxy diagnostics ([5b3d565](https://github.com/kaitranntt/ccs/commit/5b3d56548a8dfb2e6bb22e14b13f0fb038f2d1fb)), closes [#132](https://github.com/kaitranntt/ccs/issues/132)
* **global-env:** add global environment variables injection for third-party profiles ([5d34326](https://github.com/kaitranntt/ccs/commit/5d343260c7307c2d7ac8da92eb5f94c7f764d08c))
* **ui:** add absolute path copy for error logs ([5d4f49e](https://github.com/kaitranntt/ccs/commit/5d4f49e4bb6f9748efa89e96c342dfae3e35d02b))
* **ui:** add Proxy settings tab to dashboard ([9a9ef98](https://github.com/kaitranntt/ccs/commit/9a9ef98542bb766087b711fc39e928e347ad9b86))
* **ui:** add Stop and Restart buttons to ProxyStatusWidget ([c9ad0b0](https://github.com/kaitranntt/ccs/commit/c9ad0b077934ae8418d4e97b9b02a09044ff898b))
* **ui:** add version sync timestamp to ProxyStatusWidget ([d43079b](https://github.com/kaitranntt/ccs/commit/d43079b72414d7b841a35a934ea39a91527f4172))
* **ui:** redesign error logs monitor with split view layout ([8f47b87](https://github.com/kaitranntt/ccs/commit/8f47b8775f2c2493c05ee2be861ca3f8667cfc0e))
* **ui:** show CLIProxyAPI update availability in dashboard ([96762a9](https://github.com/kaitranntt/ccs/commit/96762a9f6ee096570b2fe6136a4431e6ce1d1a47))
* **web-server:** add proxy configuration API routes ([8decdfb](https://github.com/kaitranntt/ccs/commit/8decdfb515075b772970de7c85b34c31baf93754))

### Bug Fixes

* **ci:** remove deprecated installer references from dev-release workflow ([4b969b6](https://github.com/kaitranntt/ccs/commit/4b969b6870aae6b5859b9a1be0cf98b9d537ce00))
* **ci:** remove sync-version.js that depends on deleted VERSION file ([18729c9](https://github.com/kaitranntt/ccs/commit/18729c9983ecd1f9d857b0de2753e99c675c624a))
* **cliproxy:** prevent misleading update message when proxy is running ([2adc272](https://github.com/kaitranntt/ccs/commit/2adc272f278b1d80d160ad4d6e1f35e3b61cb156)), closes [#143](https://github.com/kaitranntt/ccs/issues/143)
* **error-logs-monitor:** properly handle status loading state ([1ef625e](https://github.com/kaitranntt/ccs/commit/1ef625ee863c517a5fbba21f16cf991bb77be7d7))
* **profiles:** prevent env var inheritance for settings-based profiles ([903bc10](https://github.com/kaitranntt/ccs/commit/903bc10fea11694474f772356f301b8e4b37298e))

### Documentation

* **cliproxy:** add remote proxy documentation ([196422c](https://github.com/kaitranntt/ccs/commit/196422cee1f7410d385581f2a28df3faa87d68e3))

### Styles

* **ui:** use sidebar accent colors for proxy update button ([eeb6913](https://github.com/kaitranntt/ccs/commit/eeb6913d96fe1a9a0d8721627a07c7f772b67b88))
* **ui:** widen cliproxy sidebar from w-64 to w-80 ([248d970](https://github.com/kaitranntt/ccs/commit/248d970cba8671b7c20dc99f8d1a70e4fe113605))

### Code Refactoring

* remove deprecated native shell installers ([126cffc](https://github.com/kaitranntt/ccs/commit/126cffc6dcf434abeee883a4109d3705cdb92a67))
* rename proxy to cliproxy_server and update API routes ([8d8d4c2](https://github.com/kaitranntt/ccs/commit/8d8d4c248ad890413d5c4e7e72f9f2a16305f74f))

## [6.6.0-dev.4](https://github.com/kaitranntt/ccs/compare/v6.6.0-dev.3...v6.6.0-dev.4) (2025-12-19)

### Bug Fixes

* **profiles:** prevent env var inheritance for settings-based profiles ([903bc10](https://github.com/kaitranntt/ccs/commit/903bc10fea11694474f772356f301b8e4b37298e))

## [6.6.0-dev.3](https://github.com/kaitranntt/ccs/compare/v6.6.0-dev.2...v6.6.0-dev.3) (2025-12-19)

### Features

* **cliproxy:** add getRemoteEnvVars for remote proxy mode ([f4a50d0](https://github.com/kaitranntt/ccs/commit/f4a50d006c1f6bd284fe743f9a322540763e1848))
* **cliproxy:** add proxy config resolver with CLI flag support ([68a93f0](https://github.com/kaitranntt/ccs/commit/68a93f0500f396ebcc65cc133c1a444ae5a0f220))
* **cliproxy:** add remote proxy client for health checks ([30d564c](https://github.com/kaitranntt/ccs/commit/30d564cda66a54c2ac12788559624cb0736cdeb3))
* **cliproxy:** integrate remote proxy mode in executor ([bd1ff2f](https://github.com/kaitranntt/ccs/commit/bd1ff2f059d01d4371b2230d4902bc5ab210055e))
* **config:** add proxy configuration types and schema ([eff2e2d](https://github.com/kaitranntt/ccs/commit/eff2e2d29f3f227c05103c252823fb9e040b6e49))
* **config:** add proxy section to unified config loader ([1971744](https://github.com/kaitranntt/ccs/commit/197174441f6eeca5e3c98e88af43d91ee081f734))
* **ui:** add Proxy settings tab to dashboard ([9a9ef98](https://github.com/kaitranntt/ccs/commit/9a9ef98542bb766087b711fc39e928e347ad9b86))
* **web-server:** add proxy configuration API routes ([8decdfb](https://github.com/kaitranntt/ccs/commit/8decdfb515075b772970de7c85b34c31baf93754))

### Documentation

* **cliproxy:** add remote proxy documentation ([196422c](https://github.com/kaitranntt/ccs/commit/196422cee1f7410d385581f2a28df3faa87d68e3))

### Styles

* **ui:** use sidebar accent colors for proxy update button ([eeb6913](https://github.com/kaitranntt/ccs/commit/eeb6913d96fe1a9a0d8721627a07c7f772b67b88))

### Code Refactoring

* rename proxy to cliproxy_server and update API routes ([8d8d4c2](https://github.com/kaitranntt/ccs/commit/8d8d4c248ad890413d5c4e7e72f9f2a16305f74f))

## [6.6.0-dev.2](https://github.com/kaitranntt/ccs/compare/v6.6.0-dev.1...v6.6.0-dev.2) (2025-12-19)

### Bug Fixes

* **ci:** remove sync-version.js that depends on deleted VERSION file ([18729c9](https://github.com/kaitranntt/ccs/commit/18729c9983ecd1f9d857b0de2753e99c675c624a))

## [6.6.0-dev.1](https://github.com/kaitranntt/ccs/compare/v6.5.0...v6.6.0-dev.1) (2025-12-19)

### ⚠ BREAKING CHANGES

* Native shell installers (curl/irm) no longer work.
Use `npm install -g @kaitranntt/ccs` instead.

### Features

* **ci:** add Discord notifications for releases ([ee76d66](https://github.com/kaitranntt/ccs/commit/ee76d663aec59a86a236156dbc163d0d291c0446))
* **ci:** add semantic-release for dev branch with rich Discord notifications ([0f590c8](https://github.com/kaitranntt/ccs/commit/0f590c80d689c39cea7c94937ed398941dddb533))
* **cleanup:** add age-based error log cleanup ([45207b4](https://github.com/kaitranntt/ccs/commit/45207b4e7f92c09d7464dd5c954718254ddfd43a))
* **cliproxy:** set WRITABLE_PATH for log storage in ~/.ccs/cliproxy/ ([6b9396f](https://github.com/kaitranntt/ccs/commit/6b9396fbc6d464bc3e3d6d3bb639e70fe5306074))
* **dashboard:** add error log viewer for CLIProxy diagnostics ([5b3d565](https://github.com/kaitranntt/ccs/commit/5b3d56548a8dfb2e6bb22e14b13f0fb038f2d1fb)), closes [#132](https://github.com/kaitranntt/ccs/issues/132)
* **global-env:** add global environment variables injection for third-party profiles ([5d34326](https://github.com/kaitranntt/ccs/commit/5d343260c7307c2d7ac8da92eb5f94c7f764d08c))
* **ui:** add absolute path copy for error logs ([5d4f49e](https://github.com/kaitranntt/ccs/commit/5d4f49e4bb6f9748efa89e96c342dfae3e35d02b))
* **ui:** add Stop and Restart buttons to ProxyStatusWidget ([c9ad0b0](https://github.com/kaitranntt/ccs/commit/c9ad0b077934ae8418d4e97b9b02a09044ff898b))
* **ui:** add version sync timestamp to ProxyStatusWidget ([d43079b](https://github.com/kaitranntt/ccs/commit/d43079b72414d7b841a35a934ea39a91527f4172))
* **ui:** redesign error logs monitor with split view layout ([8f47b87](https://github.com/kaitranntt/ccs/commit/8f47b8775f2c2493c05ee2be861ca3f8667cfc0e))
* **ui:** show CLIProxyAPI update availability in dashboard ([96762a9](https://github.com/kaitranntt/ccs/commit/96762a9f6ee096570b2fe6136a4431e6ce1d1a47))

### Bug Fixes

* **ci:** remove deprecated installer references from dev-release workflow ([4b969b6](https://github.com/kaitranntt/ccs/commit/4b969b6870aae6b5859b9a1be0cf98b9d537ce00))
* **cliproxy:** prevent misleading update message when proxy is running ([2adc272](https://github.com/kaitranntt/ccs/commit/2adc272f278b1d80d160ad4d6e1f35e3b61cb156)), closes [#143](https://github.com/kaitranntt/ccs/issues/143)
* **error-logs-monitor:** properly handle status loading state ([1ef625e](https://github.com/kaitranntt/ccs/commit/1ef625ee863c517a5fbba21f16cf991bb77be7d7))

### Styles

* **ui:** widen cliproxy sidebar from w-64 to w-80 ([248d970](https://github.com/kaitranntt/ccs/commit/248d970cba8671b7c20dc99f8d1a70e4fe113605))

### Code Refactoring

* remove deprecated native shell installers ([126cffc](https://github.com/kaitranntt/ccs/commit/126cffc6dcf434abeee883a4109d3705cdb92a67))

# [6.5.0](https://github.com/kaitranntt/ccs/compare/v6.4.0...v6.5.0) (2025-12-18)


### Bug Fixes

* **cli:** allow ccs copilot as profile by routing only known subcommands ([2c6dfe7](https://github.com/kaitranntt/ccs/commit/2c6dfe746b19dcbc43492dc8a03870b18a0b03f6))
* **cli:** route 'ccs copilot' without subcommand to help ([671a9e7](https://github.com/kaitranntt/ccs/commit/671a9e76fb1dc4b58099e82d94f63fd346b52146))
* **copilot:** use gpt-4.1 as default model and 127.0.0.1 for local connections ([ec6face](https://github.com/kaitranntt/ccs/commit/ec6face8db78e9c5cad4f91dcfd39e08665e1415))
* **copilot:** use token file check for instant auth status ([4783632](https://github.com/kaitranntt/ccs/commit/47836329580711bc551ebc52e20136a38bf15320))
* **copilot:** widen sidebar and balance split-view layout ([63bdc3a](https://github.com/kaitranntt/ccs/commit/63bdc3ae3990472d91c190bd29ee95c5181e4d12))
* **ui:** add install button to copilot page sidebar ([3865747](https://github.com/kaitranntt/ccs/commit/386574715470b8ff10e8d0ffae9231e001810e99))
* **ui:** constrain copilot config left panel width to 540px ([da5dc31](https://github.com/kaitranntt/ccs/commit/da5dc31ec4e94d98c17aa750f23e079145ac040c))
* **ui:** handle 404 errors in profile settings fetch ([60c01c7](https://github.com/kaitranntt/ccs/commit/60c01c7e60f850a28cb995e92aad21dbb09a1acf))
* **ui:** improve copilot sidebar logical order and remove redundancy ([f9b89de](https://github.com/kaitranntt/ccs/commit/f9b89dee12acdec5bf2b53e04eb60708bfee8340))


### Features

* **api:** add copilot install and info endpoints ([fee241d](https://github.com/kaitranntt/ccs/commit/fee241d00be4a573e04011dd84712f90ed2d4a1f))
* **api:** add copilot REST API endpoints ([c84db38](https://github.com/kaitranntt/ccs/commit/c84db38f6a16598955334fc02e0ccbe50187655f))
* **auth:** add copilot profile detection ([e5a1f60](https://github.com/kaitranntt/ccs/commit/e5a1f60bb6f97dba5ccd021087941ddf733292d5))
* **cli:** add copilot CLI commands ([d25db1f](https://github.com/kaitranntt/ccs/commit/d25db1fce10ea9c37b949a8c3c39115f357812d8))
* **config:** add copilot configuration types and loader ([b87aeae](https://github.com/kaitranntt/ccs/commit/b87aeaeb01800b11640b14fafa36412d82d0f522))
* **copilot:** add complete model catalog with plan tiers ([7653cab](https://github.com/kaitranntt/ccs/commit/7653caba710f847ff4c25fcc5b68f1b0381dd2d2))
* **copilot:** add copilot manager module ([3b8a85c](https://github.com/kaitranntt/ccs/commit/3b8a85c9ef1d4a227b8ea77f9c892ba547e92eed))
* **copilot:** add model tier mapping support ([d21908a](https://github.com/kaitranntt/ccs/commit/d21908ab63aca6e96f14f6e0c78eb882de1177b9))
* **copilot:** add raw settings API and model mapping routes ([a3e2153](https://github.com/kaitranntt/ccs/commit/a3e2153498ac8a1a9b84319f6b0835fa8f085b3d))
* **copilot:** add raw settings support to useCopilot hook ([882792a](https://github.com/kaitranntt/ccs/commit/882792a4fbdd48b81840b4bb3f093831fe60de76))
* **copilot:** add self-managed package manager for copilot-api ([ecdad1d](https://github.com/kaitranntt/ccs/commit/ecdad1d6d0c21f47547573f666d68bb6d1164437))
* **copilot:** redesign config form to match CLIProxy pattern ([7886259](https://github.com/kaitranntt/ccs/commit/7886259c363914224b6717ff4d4a74104141d696))
* **ui:** add copilot dashboard page ([6b04532](https://github.com/kaitranntt/ccs/commit/6b04532f419622f9bfcd99d9e499445310f850d8))
* **ui:** add copilot-api install button and version display ([f813ad0](https://github.com/kaitranntt/ccs/commit/f813ad06f61ad6146698d82c4aed4b3a8e90dc5d))
* **ui:** display plan tiers and presets in copilot model selector ([87c2acc](https://github.com/kaitranntt/ccs/commit/87c2acc416c35b15377e4bce2ee45bc6d20d761a))
* **ui:** expose auth result with device code in hook ([5f0fde9](https://github.com/kaitranntt/ccs/commit/5f0fde9a612e7ec1ea13dd5fc807d033bf215fb8))
* **update:** add automatic update check on startup ([8a0ad53](https://github.com/kaitranntt/ccs/commit/8a0ad5308262ba14fb0fe23ff8a87f3c5ecaa139))

# [6.4.0](https://github.com/kaitranntt/ccs/compare/v6.3.1...v6.4.0) (2025-12-18)


### Bug Fixes

* **websearch:** detect Gemini CLI auth status before showing Ready ([98c21ef](https://github.com/kaitranntt/ccs/commit/98c21efb5a3b7a39b27fda958691837545235f2d))


### Features

* **cliproxy:** implement interactive project selection for OAuth flows ([a66abba](https://github.com/kaitranntt/ccs/commit/a66abba174eb77555b4443f3e930be30264da7e4))

## [6.3.1](https://github.com/kaitranntt/ccs/compare/v6.3.0...v6.3.1) (2025-12-18)


### Bug Fixes

* **ui:** limit Connection Timeline to 100 events to prevent lag ([170dcdc](https://github.com/kaitranntt/ccs/commit/170dcdc44f825bb64bedd7eb53fff6127ca94bce))

# [6.3.0](https://github.com/kaitranntt/ccs/compare/v6.2.1...v6.3.0) (2025-12-18)


### Bug Fixes

* **dashboard:** detect legacy proxy instances without session lock ([85cfbde](https://github.com/kaitranntt/ccs/commit/85cfbde5fd95850a28e962be01fc8655a69e8b1c))


### Features

* **cliproxy:** default session persistence for CLIProxy ([a7450bd](https://github.com/kaitranntt/ccs/commit/a7450bdffeb9679a02608cb76686e006afa6455f)), closes [#129](https://github.com/kaitranntt/ccs/issues/129)
* **dashboard:** add CLIProxy status widget with start button ([589cd2c](https://github.com/kaitranntt/ccs/commit/589cd2c2b7607b1092f6ee1ce4bf044269ba05e5))

## [6.2.1](https://github.com/kaitranntt/ccs/compare/v6.2.0...v6.2.1) (2025-12-18)


### Bug Fixes

* **ui:** add error state handling to API Profiles page ([2e77646](https://github.com/kaitranntt/ccs/commit/2e77646d607676fee1297948878cd4ba1939c58f)), closes [#125](https://github.com/kaitranntt/ccs/issues/125)
* **websearch:** pass through to native WebSearch for account profiles ([6bd1f42](https://github.com/kaitranntt/ccs/commit/6bd1f420d994e799125f338940689e969e524991))

# [6.2.0](https://github.com/kaitranntt/ccs/compare/v6.1.0...v6.2.0) (2025-12-18)


### Bug Fixes

* **ui:** improve account flow viz layout to fill available width ([7b876d2](https://github.com/kaitranntt/ccs/commit/7b876d23647eb190156e832df0b9bac6b7a6935f))
* **ui:** improve account-flow-viz layout and styling ([ee85a1f](https://github.com/kaitranntt/ccs/commit/ee85a1fd82c570e4c9296c746673c57a140f1677))
* **ui:** optimize bundle size and fix calendar crash ([572703f](https://github.com/kaitranntt/ccs/commit/572703f4399ae49dc73c3e1bdf00611a859a0f0f))
* **ui:** unify account card padding and fix SVG glow filter ([ab4c95b](https://github.com/kaitranntt/ccs/commit/ab4c95bac9a64145ab24ccc1f8f143be4f64d06b))


### Features

* **cliproxy:** remove thinking token cap and update agy haiku model ([925ac8e](https://github.com/kaitranntt/ccs/commit/925ac8e1d47066bf6bfa2e9a36a31ee972a1beb8))
* **ui:** add ClaudeKit badge and Sponsor buttons to navbar ([9028b74](https://github.com/kaitranntt/ccs/commit/9028b742f8f764217ccb04335d94c88966cbbb71))
* **ui:** add multi-zone layout and enhanced drag features to account flow viz ([365f820](https://github.com/kaitranntt/ccs/commit/365f820c55106b7a4c1e2af40637144fb58c7644))
* **ui:** extend privacy mode to blur cost/token values in analytics ([2bf7992](https://github.com/kaitranntt/ccs/commit/2bf7992a8a6cb316b252c6b6e20df7860b1b2b8e))

# [6.1.0](https://github.com/kaitranntt/ccs/compare/v6.0.0...v6.1.0) (2025-12-17)


### Bug Fixes

* **cliproxy:** prevent shared proxy termination on multi-session exit ([3629e3e](https://github.com/kaitranntt/ccs/commit/3629e3e2fbe78e890ee8f618437660fbcf7a9901)), closes [#118](https://github.com/kaitranntt/ccs/issues/118)


### Features

* **privacy:** add privacy/demo mode for personal info blurring ([6f3fb54](https://github.com/kaitranntt/ccs/commit/6f3fb54cc3104eac8033137a9a9b297895fd93c0))
* **ui:** add iflow provider logo support ([cefb3a5](https://github.com/kaitranntt/ccs/commit/cefb3a59d2264f64d21a7f051c121011b7e16366))

# [6.0.0](https://github.com/kaitranntt/ccs/compare/v5.20.0...v6.0.0) (2025-12-17)


### Bug Fixes

* **config:** force shutdown immediately instead of waiting ([6d69379](https://github.com/kaitranntt/ccs/commit/6d69379ead87dbf89d8b4d257e5134f45afc2e27))
* **dev-install:** prevent duplicate entries in bun global package.json ([13824b6](https://github.com/kaitranntt/ccs/commit/13824b61caa2905f267a2b0fdbeaeb1886352b46))
* **websearch:** preserve opencode and grok in mergeWithDefaults ([110925e](https://github.com/kaitranntt/ccs/commit/110925e72e1a4a50dd641992c0b92429913b5309))
* **websearch:** update config.yaml comments to match CLI implementation ([81e46bd](https://github.com/kaitranntt/ccs/commit/81e46bd0e12d1cae3755f556a8f8890f6d9c33ac))
* **websearch:** update existing hook config when filename changes ([4959928](https://github.com/kaitranntt/ccs/commit/4959928a8e2152916f4639bf0824e25518001bf4))
* **websearch:** use correct @vibe-kit/grok-cli package ([b6c1ae4](https://github.com/kaitranntt/ccs/commit/b6c1ae48bab13c4c60084bec2d1f854b80a685b8))


### Features

* **build:** add preinstall script to manage UI dependencies ([78fb459](https://github.com/kaitranntt/ccs/commit/78fb459d956308a5a965c87d0382151eb5f8bd89))
* **cliproxy-stats:** Implement detailed stats fetching and integrate into UI ([3216a0e](https://github.com/kaitranntt/ccs/commit/3216a0e8478ba9224b1c8ea36582a5166c8c01e0))
* **monitor:** Enhance auth monitor and account flow visualization ([994bd77](https://github.com/kaitranntt/ccs/commit/994bd7765acd735635d0c324acac1aea0bb8a165))
* **ui:** add connection timeline and improve account flow layout ([27de6af](https://github.com/kaitranntt/ccs/commit/27de6af8aa5a5de72b2c34137cd1a5343e175bc9))
* **ui:** add documentation button to header ([6e4ee80](https://github.com/kaitranntt/ccs/commit/6e4ee805da23ac8969f4161d27047b5b82a07abc))
* **ui:** enhance light theme contrast and animations ([197848a](https://github.com/kaitranntt/ccs/commit/197848a71bbb26cbbd31ea5457ac917b82688d05))
* **ui:** implement auth monitor components & pages ([b97c3bf](https://github.com/kaitranntt/ccs/commit/b97c3bfda4ad47787fbce53617a7ee5d5267c2bf))
* **websearch:** add advanced configuration and custom MCP support ([cadd2e8](https://github.com/kaitranntt/ccs/commit/cadd2e824105d7beb0ccb04f554efda82470d29c))
* **websearch:** add Grok CLI support and improve install guidance ([c0938e1](https://github.com/kaitranntt/ccs/commit/c0938e1c8286b0f9c262cc36472e3600a2b044bb))
* **websearch:** add MCP fallback and Gemini CLI hook for third-party profiles ([fd99ebc](https://github.com/kaitranntt/ccs/commit/fd99ebca983970b5fa1d5d366b0af5d136f9433e))
* **websearch:** add model config + improve hook UX ([14c53d5](https://github.com/kaitranntt/ccs/commit/14c53d575f5eda6e49861d23c9eb22bfa6bf7058))
* **websearch:** add multi-tier MCP fallback for third-party profiles ([071ec04](https://github.com/kaitranntt/ccs/commit/071ec041ed7e2cfa21cadb7f55bfa93d9fe8cb1b))
* **websearch:** add OpenCode CLI as third WebSearch provider ([482cda0](https://github.com/kaitranntt/ccs/commit/482cda0f8e61fa0bb63672db74b7e5efb1c3f1c8))
* **websearch:** dynamic hook timeout from config + grok-code default ([d33fefd](https://github.com/kaitranntt/ccs/commit/d33fefd1336129572a03d983fae5c32bf5f4998f))
* **websearch:** enhance Gemini CLI integration, package manager detection, and WebSearch status ([f7a1a40](https://github.com/kaitranntt/ccs/commit/f7a1a40b42a17e18a69c241614cf3f5853deace3))
* **websearch:** implement fallback chain for CLI providers ([e6aa8ac](https://github.com/kaitranntt/ccs/commit/e6aa8ac453c70995307ea1fc5c819e0f891f1d61))
* **websearch:** respect config provider settings and consolidate prompts ([e71cb62](https://github.com/kaitranntt/ccs/commit/e71cb6227cfb114ca1864eea5198854604d83c52))
* **web:** update account manager and web routes ([127e0e6](https://github.com/kaitranntt/ccs/commit/127e0e60437f47cd445c1ce9ddf03415d51a06c7))


### BREAKING CHANGES

* **websearch:** Hook no longer falls back to all installed CLIs. It now
strictly respects config.yaml settings.

# [5.20.0](https://github.com/kaitranntt/ccs/compare/v5.19.2...v5.20.0) (2025-12-15)


### Bug Fixes

* **auth:** improve default account hint and add reset-default command ([2fb266c](https://github.com/kaitranntt/ccs/commit/2fb266c01f0a6a5bf10a0fe1662e1f315b732a61)), closes [#106](https://github.com/kaitranntt/ccs/issues/106)
* resolve ESM/CJS compatibility for Node.js 18 ([b915127](https://github.com/kaitranntt/ccs/commit/b915127b3a775667c171fd12a9756fc3d5d321d0)), closes [#110](https://github.com/kaitranntt/ccs/issues/110)


### Features

* **oauth:** enhance auth flow with detailed pre-flight checks and real-time progress ([e80c48c](https://github.com/kaitranntt/ccs/commit/e80c48c55f8b74614d0bebb3336163588018ebd6))

## [5.19.2](https://github.com/kaitranntt/ccs/compare/v5.19.1...v5.19.2) (2025-12-14)


### Bug Fixes

* **auth:** handle Windows spawn for profile creation ([5efab53](https://github.com/kaitranntt/ccs/commit/5efab53eb7f048b2a29a088508e1fcb19c4acd91))

## [5.19.1](https://github.com/kaitranntt/ccs/compare/v5.19.0...v5.19.1) (2025-12-14)


### Bug Fixes

* **auth:** include unified config accounts in auth list command ([3cdf84b](https://github.com/kaitranntt/ccs/commit/3cdf84b1ba232ec6e68a40cf90558afeee21154e))

# [5.19.0](https://github.com/kaitranntt/ccs/compare/v5.18.0...v5.19.0) (2025-12-14)


### Bug Fixes

* **auth:** use unified config for account profile touch in ccs.ts ([4ccde8a](https://github.com/kaitranntt/ccs/commit/4ccde8a3f07d5ebb658213dfe9f69a7b11ec3aac)), closes [#98](https://github.com/kaitranntt/ccs/issues/98)
* **ci:** prevent shell injection from PR body markdown ([5a8db2c](https://github.com/kaitranntt/ccs/commit/5a8db2c1ee87b2a252f61759273863c0c521f27b))
* **cliproxy:** add SSH port forwarding instructions for headless OAuth ([a6b95db](https://github.com/kaitranntt/ccs/commit/a6b95dbac5f97a870c7ef58701726ad9733ea75d))


### Features

* **cliproxy:** disable logging by default and add cleanup command ([e5cdf7c](https://github.com/kaitranntt/ccs/commit/e5cdf7c083b1b220627dad711df6f6f1c746d9ad)), closes [#96](https://github.com/kaitranntt/ccs/issues/96)

# [5.18.0](https://github.com/kaitranntt/ccs/compare/v5.17.0...v5.18.0) (2025-12-13)


### Bug Fixes

* **analytics:** fill hourly gaps with zero values in 24H view ([4412d22](https://github.com/kaitranntt/ccs/commit/4412d22f3eee8f0b664f9fdad3562cb414aacacf))
* **analytics:** guard against undefined data arrays in filtering ([e08935b](https://github.com/kaitranntt/ccs/commit/e08935b411caec21abc1bd795f6af8a889687f03))
* **analytics:** use UTC dates and cap hourly chart at current time ([9fd0c1c](https://github.com/kaitranntt/ccs/commit/9fd0c1cc074c2d14b6978aba001b3b6552b06642))


### Features

* **ui:** implement operational hub core components ([a2d049c](https://github.com/kaitranntt/ccs/commit/a2d049c6045ab18a732171cd852b6c116f80e46f))
* **ui:** premium home page with gradient glass design ([dbc1371](https://github.com/kaitranntt/ccs/commit/dbc13718ef4d194795fe1370aab005d971f96af0))
* **ui:** redesign home page as Interactive Status Board ([cf567bb](https://github.com/kaitranntt/ccs/commit/cf567bb9246c50de446c47f426c4ad8790ee928c))

# [5.17.0](https://github.com/kaitranntt/ccs/compare/v5.16.0...v5.17.0) (2025-12-12)


### Bug Fixes

* **ci:** improve issue tagging - use bot, skip duplicates, simpler msg ([27f9ea8](https://github.com/kaitranntt/ccs/commit/27f9ea8f0f518c40096404f11f5964d0c42fdfdc))
* **ci:** resolve YAML syntax error in dev-release workflow ([763928f](https://github.com/kaitranntt/ccs/commit/763928f2820f1c018e127e506c0d1590aecbeafa))
* **cliproxy:** inherit stdin for OAuth interactive prompts ([84484c0](https://github.com/kaitranntt/ccs/commit/84484c06c33b19a198d876bc7c071d9f83f3741f)), closes [#91](https://github.com/kaitranntt/ccs/issues/91)
* **cliproxy:** respect version pin when user installs specific version ([a7ba1a1](https://github.com/kaitranntt/ccs/commit/a7ba1a198398c33af23f43fc07ff871ce068b4e7)), closes [#88](https://github.com/kaitranntt/ccs/issues/88)
* **config:** prevent profile loss from strict config validation ([d343abc](https://github.com/kaitranntt/ccs/commit/d343abca53eb0fd238d0ff2c59f674a05a651721)), closes [#82](https://github.com/kaitranntt/ccs/issues/82)
* **update:** add shell option for Windows npm/cache spawn ([8c1b8e4](https://github.com/kaitranntt/ccs/commit/8c1b8e49aecf3b7901c3ddf8b2f1ba69233671ec)), closes [#85](https://github.com/kaitranntt/ccs/issues/85)
* **update:** avoid Node deprecation warning on Windows spawn ([bace084](https://github.com/kaitranntt/ccs/commit/bace084e75442a4321659fceea19b89ffdfa9b6b))
* **update:** suppress Node deprecation warnings on Windows ([d616e61](https://github.com/kaitranntt/ccs/commit/d616e613c857176a0cfb3f5f0dc9485b11326344))


### Features

* **analytics:** add 24H hourly chart with caching and UI improvements ([d64115f](https://github.com/kaitranntt/ccs/commit/d64115f91a7005f2c4ff09a63831da2aac050ba2))
* **cli:** standardize UI output with ui.ts abstraction layer ([4005f1c](https://github.com/kaitranntt/ccs/commit/4005f1c01ca9fa921978664a0a1b929689513456))


### Performance Improvements

* **ci:** add HUSKY=0 to release workflow ([99f3a67](https://github.com/kaitranntt/ccs/commit/99f3a674b858021e577edd7650afd872a1e251ae))
* **ci:** reduce test redundancy from 4x to 1x per release ([d39095c](https://github.com/kaitranntt/ccs/commit/d39095c7d6923219d7ade0fca59cc555a4489cc9))

# [5.16.0](https://github.com/kaitranntt/ccs/compare/v5.15.0...v5.16.0) (2025-12-12)


### Features

* **cliproxy:** add provider editor with presets and control panel ([92b7065](https://github.com/kaitranntt/ccs/commit/92b7065e10618285988b4a539b503f54e5cf4baf))
* **cliproxy:** add stats fetcher and OpenAI-compatible model manager ([a94c3d6](https://github.com/kaitranntt/ccs/commit/a94c3d66004ba0921835bddd8ca5c168868e72d5))
* **ui:** add cliproxy stats overview and enhance analytics components ([c3b2d50](https://github.com/kaitranntt/ccs/commit/c3b2d50269b5ad515409cc562e204d94ab65dd87))
* **ui:** redesign cliproxy page with master-detail layout ([f8648be](https://github.com/kaitranntt/ccs/commit/f8648be6d9a9e6e94624fe700dfd9bcd1e2dbc5b))

# [5.15.0](https://github.com/kaitranntt/ccs/compare/v5.14.0...v5.15.0) (2025-12-11)


### Bug Fixes

* **cache:** use ~/.ccs/cache/ for usage and update-check files ([790ac3c](https://github.com/kaitranntt/ccs/commit/790ac3c862c81539a048db5b3f67ed8d86a86cfb))
* **migrate:** include backup path in rollback command ([0aa9131](https://github.com/kaitranntt/ccs/commit/0aa913164211b6cd0ad65b3b546e49edaa0bcc30))
* **migrate:** skip autoMigrate when running migrate command ([05a6199](https://github.com/kaitranntt/ccs/commit/05a6199d839c26ebff6278448825174466fc6518))
* **ui:** resolve layout and theme issues in profile editor ([46ee1df](https://github.com/kaitranntt/ccs/commit/46ee1df0836fac4bb6b4b75413846163ced2fc6f))


### Features

* **api-profile-ux:** Implement API & UI for profile management ([8357005](https://github.com/kaitranntt/ccs/commit/83570050ef9b68746405df8588e400faa2007c0a))
* **api-profile-ux:** implement tabbed profile editor and fix disclaimer visibility ([8c9d669](https://github.com/kaitranntt/ccs/commit/8c9d669ccec6d2c56c37f4421e5ca6d4c95703e3))
* **api:** improve create UX with URL validation and model mapping ([f83051b](https://github.com/kaitranntt/ccs/commit/f83051be40514a2084ceb06007eea37b31dd3062)), closes [#72](https://github.com/kaitranntt/ccs/issues/72)
* **cliproxy:** implement --nickname flag for account management ([0d70708](https://github.com/kaitranntt/ccs/commit/0d70708658efb4b7e431f95d69c742a28d254ca6))
* **config:** add unified YAML config with migration support ([b621b8e](https://github.com/kaitranntt/ccs/commit/b621b8e47bc63f2939b45a243173ce6b414a3ec2)), closes [#75](https://github.com/kaitranntt/ccs/issues/75)
* **dashboard:** add code editor for raw JSON settings editing ([2b1a3b4](https://github.com/kaitranntt/ccs/commit/2b1a3b48799eae30b5d0493e5af65edab204f4d8)), closes [#73](https://github.com/kaitranntt/ccs/issues/73)
* **profile:** refactor create UX with dialog-based interface ([720ff9d](https://github.com/kaitranntt/ccs/commit/720ff9d7d6eb881a73547daab262030fb619e5ee))

# [5.14.0](https://github.com/kaitranntt/ccs/compare/v5.13.0...v5.14.0) (2025-12-10)


### Features

* **ui:** replace anomaly alert badge with usage insights card ([824c3ba](https://github.com/kaitranntt/ccs/commit/824c3baecfb7795f848909240b95bfeb9e6c1b87))
* **usage-analytics:** implement token cost breakdown and anomaly detection ([d81a5e6](https://github.com/kaitranntt/ccs/commit/d81a5e6266731f203c3de1100362fb0822156a39))
* **usage:** add internal data aggregation and cost tracking ([49b4065](https://github.com/kaitranntt/ccs/commit/49b4065186bc223af1b589395808e962b3cf6bb3))

# [5.13.0](https://github.com/kaitranntt/ccs/compare/v5.12.1...v5.13.0) (2025-12-09)


### Features

* **analytics:** aggregate usage from all CCS auth profiles ([1e11d2e](https://github.com/kaitranntt/ccs/commit/1e11d2e40af20386e5e26677021440f35a7e7217))
* **analytics:** refactor model color management and fix UI display issues ([f255a20](https://github.com/kaitranntt/ccs/commit/f255a20a931babc45e8a4c9e34d733f8a9eed83f))
* **cliproxy:** add --add flag and nickname support for multi-account auth ([493492f](https://github.com/kaitranntt/ccs/commit/493492fa7e88746f47240026ac16fae0575ff223))
* **cliproxy:** add --use and --accounts flags for multi-account switching ([8f6684f](https://github.com/kaitranntt/ccs/commit/8f6684f948b0905d0dd7b558c3d0d4023e042970))
* **cliproxy:** add multi-account support phases 02-03 ([d868dc4](https://github.com/kaitranntt/ccs/commit/d868dc4c32948db27e4b6073e9a7d28966a54971))
* **dashboard:** add Environment and OAuth Readiness groups to health page ([96d9fc6](https://github.com/kaitranntt/ccs/commit/96d9fc68e9cf2af8b0b0d237d1ef094269cebb38))
* **doctor:** add OAuth diagnostics for Windows headless false positives ([92007d7](https://github.com/kaitranntt/ccs/commit/92007d7c0468db969bd481c6517f0b3a851d8433))
* **ui:** simplify CLIProxy page UX with dedicated Add Account dialog ([8f5c006](https://github.com/kaitranntt/ccs/commit/8f5c006f07f0ad93a7c7009df377b292076af55a))

## [5.12.1](https://github.com/kaitranntt/ccs/compare/v5.12.0...v5.12.1) (2025-12-09)


### Performance Improvements

* **analytics:** instant dashboard loading with disk cache persistence ([abb156d](https://github.com/kaitranntt/ccs/commit/abb156d9f4064d078a953966082e06059ad52d80))

# [5.12.0](https://github.com/kaitranntt/ccs/compare/v5.11.0...v5.12.0) (2025-12-09)


### Bug Fixes

* **security:** improve API key detection patterns to prevent false positives ([efb42ba](https://github.com/kaitranntt/ccs/commit/efb42ba8f6adfa5128c4974d43140fd640b826a1))
* **ui:** reduce focus ring size to prevent overlapping content ([639eec7](https://github.com/kaitranntt/ccs/commit/639eec7930c4f34dacd0fb2326de87ed640d8e74))
* **ui:** update dropdown menu item SVG color on focus ([ed5c3fc](https://github.com/kaitranntt/ccs/commit/ed5c3fc83ab4117263e74aaf29a4df8d63a8e5c1))
* **web:** correct skill detection to look for SKILL.md instead of prompt.md ([13194fe](https://github.com/kaitranntt/ccs/commit/13194fecbe575e83bd6f366e2aca1d92922ccd24))


### Features

* **analytics:** add usage analytics page with caching layer ([a721af3](https://github.com/kaitranntt/ccs/commit/a721af3cf3ff618603e982aa2fda47980251c4e4))
* **cli:** Introduce version utility and command updates ([d77f07e](https://github.com/kaitranntt/ccs/commit/d77f07e09376e410bf693d40d3ac646e2f35465c))
* **cliproxy:** promote thinking models as default for agy provider ([1475adb](https://github.com/kaitranntt/ccs/commit/1475adb61649fc9ac5d7e66845649f3eb63f88b0))
* **ui:** add modular health dashboard components ([4ff6f08](https://github.com/kaitranntt/ccs/commit/4ff6f085122c20209e73fcbda457175fb47958de))
* **ui:** Enhance web overview with new components and data ([cc16556](https://github.com/kaitranntt/ccs/commit/cc1655624c08e8f0f20cd0416831272affe9fdf0))
* **ui:** redesign health dashboard to match ccs doctor output ([8aae0db](https://github.com/kaitranntt/ccs/commit/8aae0db7da9e691e9a35d222d6828d6e658c49c4))


### Performance Improvements

* **analytics:** add cache pre-warming and SWR pattern for instant page load ([69e6a32](https://github.com/kaitranntt/ccs/commit/69e6a322248d3952156784520a9e264b7f24c0e8))

# [5.11.0](https://github.com/kaitranntt/ccs/compare/v5.10.0...v5.11.0) (2025-12-08)


### Bug Fixes

* **cliproxy:** map token type values to provider names for account discovery ([17caf80](https://github.com/kaitranntt/ccs/commit/17caf804ba02cab878b3f1476ec02f0f0697d6f1))
* **ui:** improve cliproxy dashboard layout and dropdown styling ([10d0550](https://github.com/kaitranntt/ccs/commit/10d05502f305f5f351562da8b0aa2b64dca41a4c))
* **ui:** remove padding from cliproxy card ([3a1e8c0](https://github.com/kaitranntt/ccs/commit/3a1e8c0afc69b1ca612a267e373b62f80a34c8ce))


### Features

* **cliproxy:** add multi-account support for CLIProxy providers ([4dc17fa](https://github.com/kaitranntt/ccs/commit/4dc17fac4f655e31afc0e491aa43f7a9c3f64df1))

# [5.10.0](https://github.com/kaitranntt/ccs/compare/v5.9.0...v5.10.0) (2025-12-08)


### Bug Fixes

* **glmt:** add bearer prefix for openai-compatible endpoints ([077a406](https://github.com/kaitranntt/ccs/commit/077a406df6f79fdd0e343c3b6b3d0860a3d41a87)), closes [#61](https://github.com/kaitranntt/ccs/issues/61)
* **glmt:** pass env vars to proxy subprocess ([e17a068](https://github.com/kaitranntt/ccs/commit/e17a068a58c7dee67a33852860e5bcae051a7f37))
* **ui:** adjust layout of localhost disclaimer ([ad5859c](https://github.com/kaitranntt/ccs/commit/ad5859c157271c111f1bbc437060770746d3394e))
* **ui:** improve table column widths and spacing ([9b4a5d8](https://github.com/kaitranntt/ccs/commit/9b4a5d80c5c398c7165426dac2a88a8e9443ff3a))
* **ui:** prettier formatting for documentation link ([d11071a](https://github.com/kaitranntt/ccs/commit/d11071ad90d6ed3886b437b3ac15b3818d5b2585))
* **ui:** suppress react compiler warning in profiles-table ([cf072c0](https://github.com/kaitranntt/ccs/commit/cf072c03b269d9df93ec014905b50d41a78a83bd))


### Features

* **build:** disable commitlint subject-case rule and add clean-dist script ([5947532](https://github.com/kaitranntt/ccs/commit/5947532fc65ba39a70f422b314fad103603e00af))
* **cliproxy:** add authentication status display to web dashboard ([a283f94](https://github.com/kaitranntt/ccs/commit/a283f942a9712f97c5789ea39a508da1d5305a79))
* **cliproxy:** deprecate claude thinking models in agy provider ([63b3ca7](https://github.com/kaitranntt/ccs/commit/63b3ca776079634fcf59f231e51ad8947795b2a0))
* **completions:** enhance cliproxy help and update shell completion scripts ([59a2f2b](https://github.com/kaitranntt/ccs/commit/59a2f2b717a97447759ff68fdb8eca81908a9d88))
* **doctor:** improve port detection with process identification ([98fd1be](https://github.com/kaitranntt/ccs/commit/98fd1bedb9b38c4900f8cc4049d74347d407d499))
* **ui:** add accounts and cliproxy management dashboard ([03059db](https://github.com/kaitranntt/ccs/commit/03059dbdccaca9736ae45c0754543e59c2a3e0f6))
* **ui:** add ccs branding assets and logo component ([1b16305](https://github.com/kaitranntt/ccs/commit/1b163050f795f1a7a75be203895f1addd6d21f8e))
* **ui:** add comprehensive quality gates and fix linting issues ([707af2f](https://github.com/kaitranntt/ccs/commit/707af2f01a67264f7722afcd53ac3f6246aefc89))
* **ui:** enhance settings dialog with tabbed interface and scrollable areas ([4adb94b](https://github.com/kaitranntt/ccs/commit/4adb94b90cf9e16929fef14ed46d474e07e9c131))
* **ui:** enhance visual contrast and update project link ([c65d9c9](https://github.com/kaitranntt/ccs/commit/c65d9c9c3484f8053e2b4315198ee29a4c3be2b0))
* **ui:** redesign sidebar and fix disclaimer ([c8890f3](https://github.com/kaitranntt/ccs/commit/c8890f33c2e9e15fdf89bb2b467eda2c836d95d2))
* **ui:** reorganize theme colors and add dev script ([235bd6b](https://github.com/kaitranntt/ccs/commit/235bd6b36a28e63661123344c983f5d06ee1b3aa))
* **ui:** update theme colors to match brand palette ([b5f22e4](https://github.com/kaitranntt/ccs/commit/b5f22e415b865eba59c6458488409f2db4e29f5a))
* **web-dashboard:** add dev mode with hmr and optimize build ([23a3382](https://github.com/kaitranntt/ccs/commit/23a33820c03fe26bcf12bd3b2432ce50a88b90d1))
* **web-dashboard:** add express server and react ui scaffolding ([6a6f2a2](https://github.com/kaitranntt/ccs/commit/6a6f2a24638cdaeec7868e9742da066c0d8cdc6b))
* **web-dashboard:** add rest api and real-time sync ([56502ab](https://github.com/kaitranntt/ccs/commit/56502ab6a8deae4d7cafe76de46b5cc156398f85))
* **web-dashboard:** complete settings, health, shared data and build integration ([5975802](https://github.com/kaitranntt/ccs/commit/59758024c92005016087264ed5caa0738cbcb1b2))
* **web:** enhance dashboard functionality and ui components ([6e2da64](https://github.com/kaitranntt/ccs/commit/6e2da6458a0f574dbe32e555c9725d766e3c861c))
* **web:** update shared routes and home page for dashboard ([e078f15](https://github.com/kaitranntt/ccs/commit/e078f152976661c410ca0a8cd502a6bd3b56e056))

# [5.9.0](https://github.com/kaitranntt/ccs/compare/v5.8.0...v5.9.0) (2025-12-06)


### Features

* **cliproxy:** add crud commands for variant profiles ([6427ecf](https://github.com/kaitranntt/ccs/commit/6427ecf5af4a9be40f39c2a64bf72ac4e861d349))

# [5.8.0](https://github.com/kaitranntt/ccs/compare/v5.7.0...v5.8.0) (2025-12-05)


### Bug Fixes

* **agy:** enable claude model thinking via antigravity profile ([6f19440](https://github.com/kaitranntt/ccs/commit/6f194404722e63990f64d250d08c5f5e33235e05))
* **agy:** preserve user settings during model switch ([f5c31da](https://github.com/kaitranntt/ccs/commit/f5c31dab55033cd8db99247ca9eab8a47fcb24fb))
* **agy:** remove max_thinking_tokens when switching to non-claude model ([6decd15](https://github.com/kaitranntt/ccs/commit/6decd157e5e7b4d19ed3dac2cfdcb0131ce9d782))
* **cliproxy:** consolidate download ui to single spinner ([ace5ba8](https://github.com/kaitranntt/ccs/commit/ace5ba87502c51a7e8fe35df5fe4a8f7aaacd173))
* **cliproxy:** only remove provider-specific auth files on logout ([4770047](https://github.com/kaitranntt/ccs/commit/47700474a40539fad85c58fc5c971b85ddab45c4))
* **skill:** use yaml block scalar for ccs-delegation description ([26154c3](https://github.com/kaitranntt/ccs/commit/26154c3e13b14d76fee87473b84365457139c553))


### Features

* **agy:** disable thinking toggle for claude models via antigravity ([f5a1b81](https://github.com/kaitranntt/ccs/commit/f5a1b81e553d2d057dc1f49fabac1945a83fc361)), closes [#415](https://github.com/kaitranntt/ccs/issues/415)
* **delegation:** add passthrough args for claude cli flags ([26d72cf](https://github.com/kaitranntt/ccs/commit/26d72cfa5bbd7ea5d4a42dc7d5c4010ae5247711))

# [5.7.0](https://github.com/kaitranntt/ccs/compare/v5.6.0...v5.7.0) (2025-12-05)


### Bug Fixes

* **ci:** add path filtering to deploy-ccs-worker pull request trigger ([64a8e86](https://github.com/kaitranntt/ccs/commit/64a8e86db4be7dd96d19654e1e91827ae62e0f7e))
* **doctor:** repair shared settings.json symlink broken by claude cli ([1471bd2](https://github.com/kaitranntt/ccs/commit/1471bd2152b8eec376b7c0b5d13499546477c0cb)), closes [#57](https://github.com/kaitranntt/ccs/issues/57)
* **types:** add forceversion to binarymanagerconfig interface ([3bb1ea7](https://github.com/kaitranntt/ccs/commit/3bb1ea7541fcf1bd38818b941ef3c5997d8daeb5))


### Features

* **cliproxy:** add iFlow OAuth provider support ([#55](https://github.com/kaitranntt/ccs/issues/55)) ([20bf626](https://github.com/kaitranntt/ccs/commit/20bf6266d2817bbceb8a9b5b7914f3ffc9164275))

# [5.6.0](https://github.com/kaitranntt/ccs/compare/v5.5.0...v5.6.0) (2025-12-04)


### Bug Fixes

* **cliproxy:** clarify paid tier messaging to reference google account tier ([848fbf4](https://github.com/kaitranntt/ccs/commit/848fbf4686b49305c26ef85da339b12dffa51b5b))
* **cliproxy:** correct model selection default and update fallback version ([fdb8761](https://github.com/kaitranntt/ccs/commit/fdb8761cfac416831a8c3ae64f5718179517e3d0))
* **dev-release:** find next available dev version from npm ([482f3a7](https://github.com/kaitranntt/ccs/commit/482f3a7fc66f1b93a1b7e24e00a87c9858574ebd))
* **doctor:** use actual installed clipproxy version instead of hardcoded ([e3edcf6](https://github.com/kaitranntt/ccs/commit/e3edcf613e28a48fb7cb5c2c90ffed3c80cb0c62))
* **prompt:** strip bracketed paste escape sequences from password input ([df31ffc](https://github.com/kaitranntt/ccs/commit/df31ffcee7872b8d263451807818b368a9ba1eb4))
* **update:** add --help support and --dev alias for update command ([b18163c](https://github.com/kaitranntt/ccs/commit/b18163c57b59cabbd7d18165b28933155d94d74a))


### Features

* **cliproxy:** add model catalog with configuration management ([4654c15](https://github.com/kaitranntt/ccs/commit/4654c15577307457f8eb86ca9718b527460c7c40))
* **cliproxy:** add version management command ([7e07615](https://github.com/kaitranntt/ccs/commit/7e07615eedb7263aa359651abef8660ff0dcd95a))
* **cliproxy:** add warning for broken claude proxy models on agy ([0e11426](https://github.com/kaitranntt/ccs/commit/0e11426daa8896ba58aa9d53889818ab3577e250)), closes [CLIProxyAPI#415](https://github.com/CLIProxyAPI/issues/415)
* **prompt:** add password input utility with masking ([3bdbff9](https://github.com/kaitranntt/ccs/commit/3bdbff9345c2eb21d861621e56430de5bac61fc4))
* **release:** simplify dev versioning with stable base ([942b4b9](https://github.com/kaitranntt/ccs/commit/942b4b92cfce054c0886d8508f1c15ad18fd4400))

# [5.5.0](https://github.com/kaitranntt/ccs/compare/v5.4.3...v5.5.0) (2025-12-04)


### Bug Fixes

* **changelog:** restore full changelog history from main ([2e5b1f2](https://github.com/kaitranntt/ccs/commit/2e5b1f212abe5611c164cc84388002686175bc8b))
* **tests:** migrate test suite from mocha to bun test runner ([bd46c8d](https://github.com/kaitranntt/ccs/commit/bd46c8de1237e3a76c774b00a1c9e026f4c0cd4b))


### Features

* **kimi:** update default model to kimi-k2-thinking-turbo ([134511c](https://github.com/kaitranntt/ccs/commit/134511c38b581a720da6b9d7e6608ca6b3c63fb1))

## [5.4.4-dev.2](https://github.com/kaitranntt/ccs/compare/v5.4.4-dev.1...v5.4.4-dev.2) (2025-12-04)


### Bug Fixes

* **changelog:** restore full changelog history from main ([2e5b1f2](https://github.com/kaitranntt/ccs/commit/2e5b1f212abe5611c164cc84388002686175bc8b))

## [5.4.3](https://github.com/kaitranntt/ccs/compare/v5.4.2...v5.4.3) (2025-12-03)


### Bug Fixes

* **postinstall:** handle broken symlinks during npm install ([81add5a](https://github.com/kaitranntt/ccs/commit/81add5a05eeb8297ceef840071f11b6a194df707))

## [5.4.2](https://github.com/kaitranntt/ccs/compare/v5.4.1...v5.4.2) (2025-12-03)


### Bug Fixes

* **merge:** resolve conflicts between dev and main ([8347ea6](https://github.com/kaitranntt/ccs/commit/8347ea64c6b919a79f5ab63c398b6c36f012ca2d))
* **sync:** implement copy fallback for windows when symlinks unavailable ([6b3f93a](https://github.com/kaitranntt/ccs/commit/6b3f93a80a0232e8c964d73e51aa0afb0768b00f)), closes [#45](https://github.com/kaitranntt/ccs/issues/45)

## [5.4.2-dev.1](https://github.com/kaitranntt/ccs/compare/v5.4.1...v5.4.2-dev.1) (2025-12-03)


### Bug Fixes

* **merge:** resolve conflicts between dev and main ([8347ea6](https://github.com/kaitranntt/ccs/commit/8347ea64c6b919a79f5ab63c398b6c36f012ca2d))
* **sync:** implement copy fallback for windows when symlinks unavailable ([6b3f93a](https://github.com/kaitranntt/ccs/commit/6b3f93a80a0232e8c964d73e51aa0afb0768b00f)), closes [#45](https://github.com/kaitranntt/ccs/issues/45)

## [5.4.1](https://github.com/kaitranntt/ccs/compare/v5.4.0...v5.4.1) (2025-12-03)


### Bug Fixes

* **cliproxy:** resolve windows auth browser not opening ([af4d6cf](https://github.com/kaitranntt/ccs/commit/af4d6cff89395a74e2eaf56551d3f56b95e0a6ce)), closes [#42](https://github.com/kaitranntt/ccs/issues/42)
* **doctor:** resolve windows claude cli detection failure ([cfe9ba0](https://github.com/kaitranntt/ccs/commit/cfe9ba05a4351302fbb330ca00b6025cb65a8f20)), closes [#41](https://github.com/kaitranntt/ccs/issues/41)
* **sync:** implement copy fallback for windows when symlinks unavailable ([6b3f93a](https://github.com/kaitranntt/ccs/commit/6b3f93a80a0232e8c964d73e51aa0afb0768b00f)), closes [#45](https://github.com/kaitranntt/ccs/issues/45)

## [5.4.1-dev.1](https://github.com/kaitranntt/ccs/compare/v5.4.0...v5.4.1-dev.1) (2025-12-03)


### Bug Fixes

* **cliproxy:** resolve windows auth browser not opening ([af4d6cf](https://github.com/kaitranntt/ccs/commit/af4d6cff89395a74e2eaf56551d3f56b95e0a6ce)), closes [#42](https://github.com/kaitranntt/ccs/issues/42)
* **doctor:** resolve windows claude cli detection failure ([cfe9ba0](https://github.com/kaitranntt/ccs/commit/cfe9ba05a4351302fbb330ca00b6025cb65a8f20)), closes [#41](https://github.com/kaitranntt/ccs/issues/41)

# [5.4.0](https://github.com/kaitranntt/ccs/compare/v5.3.0...v5.4.0) (2025-12-02)


### Bug Fixes

* **auth:** prevent default profile from using stale glm env vars ([13d13da](https://github.com/kaitranntt/ccs/commit/13d13dab516332bc17345dc77afd44ae48bdd2aa)), closes [#37](https://github.com/kaitranntt/ccs/issues/37)
* **cliproxy:** convert windows backslashes to forward slashes in config.yaml auth-dir ([a6663cb](https://github.com/kaitranntt/ccs/commit/a6663cbd0471d1a08e8bbcdea897760b434ae937)), closes [#36](https://github.com/kaitranntt/ccs/issues/36)
* **cliproxy:** improve qwen oauth error handling ([7e0b0fe](https://github.com/kaitranntt/ccs/commit/7e0b0feca8ce2ed5d505c5bf6c84e54c6df8839e)), closes [#29](https://github.com/kaitranntt/ccs/issues/29)
* **cliproxy:** use double-dash flags for cliproxyapi auth ([#24](https://github.com/kaitranntt/ccs/issues/24)) ([4c81f28](https://github.com/kaitranntt/ccs/commit/4c81f28f0b67ef92cf74d0f5c13a5943ff0a7f00))
* **deps:** add chalk, boxen, gradient-string, listr2 as dependencies ([a214749](https://github.com/kaitranntt/ccs/commit/a214749725cfe05612e2c84cefa2ab3f619c6a2e))
* **glmt:** handle 401 errors and headers-already-sent exception ([#30](https://github.com/kaitranntt/ccs/issues/30)) ([c953382](https://github.com/kaitranntt/ccs/commit/c95338232a37981b95b785b47185ce18d6d94b7a)), closes [#26](https://github.com/kaitranntt/ccs/issues/26)
* **prompt:** improve password input handling with raw mode and buffer support ([bc56d2e](https://github.com/kaitranntt/ccs/commit/bc56d2e135532b2ae443144dd42217b26bcba951))


### Features

* **cliproxy:** add qwen code oauth provider support ([#31](https://github.com/kaitranntt/ccs/issues/31)) ([a3f1e52](https://github.com/kaitranntt/ccs/commit/a3f1e52ac68600ba0806d67aacceb6477ffa3543)), closes [#29](https://github.com/kaitranntt/ccs/issues/29)
* **cliproxy:** auto-update cliproxyapi to latest release on startup ([8873ccd](https://github.com/kaitranntt/ccs/commit/8873ccd981679e8acff8965accdc22215c6e4aa2))
* **profile:** add profile command with configuration display ([53d7a15](https://github.com/kaitranntt/ccs/commit/53d7a15c047e760723e051dc0f7be3c0dd42d087))
* **shell-completion:** add --force flag and fix zsh profile coloring ([7faed1d](https://github.com/kaitranntt/ccs/commit/7faed1d84ba29ba02bf687bae5b3458617512e67))
* **ui:** add central ui abstraction layer for cli styling ([6e49e0e](https://github.com/kaitranntt/ccs/commit/6e49e0e7e157abd4a38c98553dbe3c16473b57d9))
* **ui:** enhance auth commands with new ui layer ([6f42a65](https://github.com/kaitranntt/ccs/commit/6f42a6527b1bf02cbf29ec23525c9f27af6f0c98))
* **ui:** enhance delegation with listr2 task lists and styled output ([716193a](https://github.com/kaitranntt/ccs/commit/716193a682a1504767c7f32409a0de51278242eb))
* **ui:** enhance doctor and error manager with new ui layer ([57016f3](https://github.com/kaitranntt/ccs/commit/57016f3f765f207915161514e1827b18c0b03d5c))
* **ui:** enhance help and profile commands with new ui layer ([f3ed359](https://github.com/kaitranntt/ccs/commit/f3ed359050ce66d96c0109cf60c242bfd092114d))
* **ui:** enhance section headers with gradient and rename profile to api ([073a5e1](https://github.com/kaitranntt/ccs/commit/073a5e15ee8f895d7485864526d8946b774bb728))

# [5.4.0-beta.3](https://github.com/kaitranntt/ccs/compare/v5.4.0-beta.2...v5.4.0-beta.3) (2025-12-02)


### Bug Fixes

* **cliproxy:** convert windows backslashes to forward slashes in config.yaml auth-dir ([a6663cb](https://github.com/kaitranntt/ccs/commit/a6663cbd0471d1a08e8bbcdea897760b434ae937)), closes [#36](https://github.com/kaitranntt/ccs/issues/36)

# [5.4.0-beta.2](https://github.com/kaitranntt/ccs/compare/v5.4.0-beta.1...v5.4.0-beta.2) (2025-12-02)


### Bug Fixes

* **auth:** prevent default profile from using stale glm env vars ([13d13da](https://github.com/kaitranntt/ccs/commit/13d13dab516332bc17345dc77afd44ae48bdd2aa)), closes [#37](https://github.com/kaitranntt/ccs/issues/37)

# [5.4.0-beta.1](https://github.com/kaitranntt/ccs/compare/v5.3.0...v5.4.0-beta.1) (2025-12-02)


### Bug Fixes

* **cliproxy:** improve qwen oauth error handling ([7e0b0fe](https://github.com/kaitranntt/ccs/commit/7e0b0feca8ce2ed5d505c5bf6c84e54c6df8839e)), closes [#29](https://github.com/kaitranntt/ccs/issues/29)
* **cliproxy:** use double-dash flags for cliproxyapi auth ([#24](https://github.com/kaitranntt/ccs/issues/24)) ([4c81f28](https://github.com/kaitranntt/ccs/commit/4c81f28f0b67ef92cf74d0f5c13a5943ff0a7f00))
* **deps:** add chalk, boxen, gradient-string, listr2 as dependencies ([a214749](https://github.com/kaitranntt/ccs/commit/a214749725cfe05612e2c84cefa2ab3f619c6a2e))
* **glmt:** handle 401 errors and headers-already-sent exception ([#30](https://github.com/kaitranntt/ccs/issues/30)) ([c953382](https://github.com/kaitranntt/ccs/commit/c95338232a37981b95b785b47185ce18d6d94b7a)), closes [#26](https://github.com/kaitranntt/ccs/issues/26)
* **prompt:** improve password input handling with raw mode and buffer support ([bc56d2e](https://github.com/kaitranntt/ccs/commit/bc56d2e135532b2ae443144dd42217b26bcba951))


### Features

* **cliproxy:** add qwen code oauth provider support ([#31](https://github.com/kaitranntt/ccs/issues/31)) ([a3f1e52](https://github.com/kaitranntt/ccs/commit/a3f1e52ac68600ba0806d67aacceb6477ffa3543)), closes [#29](https://github.com/kaitranntt/ccs/issues/29)
* **cliproxy:** auto-update cliproxyapi to latest release on startup ([8873ccd](https://github.com/kaitranntt/ccs/commit/8873ccd981679e8acff8965accdc22215c6e4aa2))
* **profile:** add profile command with configuration display ([53d7a15](https://github.com/kaitranntt/ccs/commit/53d7a15c047e760723e051dc0f7be3c0dd42d087))
* **shell-completion:** add --force flag and fix zsh profile coloring ([7faed1d](https://github.com/kaitranntt/ccs/commit/7faed1d84ba29ba02bf687bae5b3458617512e67))
* **ui:** add central ui abstraction layer for cli styling ([6e49e0e](https://github.com/kaitranntt/ccs/commit/6e49e0e7e157abd4a38c98553dbe3c16473b57d9))
* **ui:** enhance auth commands with new ui layer ([6f42a65](https://github.com/kaitranntt/ccs/commit/6f42a6527b1bf02cbf29ec23525c9f27af6f0c98))
* **ui:** enhance delegation with listr2 task lists and styled output ([716193a](https://github.com/kaitranntt/ccs/commit/716193a682a1504767c7f32409a0de51278242eb))
* **ui:** enhance doctor and error manager with new ui layer ([57016f3](https://github.com/kaitranntt/ccs/commit/57016f3f765f207915161514e1827b18c0b03d5c))
* **ui:** enhance help and profile commands with new ui layer ([f3ed359](https://github.com/kaitranntt/ccs/commit/f3ed359050ce66d96c0109cf60c242bfd092114d))
* **ui:** enhance section headers with gradient and rename profile to api ([073a5e1](https://github.com/kaitranntt/ccs/commit/073a5e15ee8f895d7485864526d8946b774bb728))

# [5.3.0](https://github.com/kaitranntt/ccs/compare/v5.2.1...v5.3.0) (2025-12-01)


### Features

* **profile,shell-completion,prompt:** add profile commands and improve input handling ([#34](https://github.com/kaitranntt/ccs/issues/34)) ([7ec8cc8](https://github.com/kaitranntt/ccs/commit/7ec8cc83690a595bba9bb5f62fb3b9fa6b6a2f8f)), closes [#24](https://github.com/kaitranntt/ccs/issues/24) [#30](https://github.com/kaitranntt/ccs/issues/30) [#26](https://github.com/kaitranntt/ccs/issues/26) [#31](https://github.com/kaitranntt/ccs/issues/31) [#29](https://github.com/kaitranntt/ccs/issues/29) [#29](https://github.com/kaitranntt/ccs/issues/29)

# [5.3.0-beta.4](https://github.com/kaitranntt/ccs/compare/v5.3.0-beta.3...v5.3.0-beta.4) (2025-12-01)


### Bug Fixes

* **cliproxy:** improve qwen oauth error handling ([#33](https://github.com/kaitranntt/ccs/issues/33)) ([1c3374f](https://github.com/kaitranntt/ccs/commit/1c3374f6a7e4440e299d49b58808c6454b4547c2)), closes [#29](https://github.com/kaitranntt/ccs/issues/29)

# [5.3.0-beta.3](https://github.com/kaitranntt/ccs/compare/v5.3.0-beta.2...v5.3.0-beta.3) (2025-12-01)


### Bug Fixes

* **prompt:** improve password input handling with raw mode and buffer support ([bc56d2e](https://github.com/kaitranntt/ccs/commit/bc56d2e135532b2ae443144dd42217b26bcba951))


### Features

* **profile:** add profile command with configuration display ([53d7a15](https://github.com/kaitranntt/ccs/commit/53d7a15c047e760723e051dc0f7be3c0dd42d087))
* **shell-completion:** add --force flag and fix zsh profile coloring ([7faed1d](https://github.com/kaitranntt/ccs/commit/7faed1d84ba29ba02bf687bae5b3458617512e67))

## [5.2.1](https://github.com/kaitranntt/ccs/compare/v5.2.0...v5.2.1) (2025-12-01)


### Bug Fixes

* **cliproxy:** improve qwen oauth error handling ([#33](https://github.com/kaitranntt/ccs/issues/33)) ([1c3374f](https://github.com/kaitranntt/ccs/commit/1c3374f6a7e4440e299d49b58808c6454b4547c2)), closes [#29](https://github.com/kaitranntt/ccs/issues/29)

# [5.3.0-beta.2](https://github.com/kaitranntt/ccs/compare/v5.3.0-beta.1...v5.3.0-beta.2) (2025-12-01)


### Bug Fixes

* **cliproxy:** improve qwen oauth error handling ([7e0b0fe](https://github.com/kaitranntt/ccs/commit/7e0b0feca8ce2ed5d505c5bf6c84e54c6df8839e)), closes [#29](https://github.com/kaitranntt/ccs/issues/29)

# [5.3.0-beta.1](https://github.com/kaitranntt/ccs/compare/v5.2.0...v5.3.0-beta.1) (2025-12-01)


### Bug Fixes

* **cliproxy:** use double-dash flags for cliproxyapi auth ([#24](https://github.com/kaitranntt/ccs/issues/24)) ([4c81f28](https://github.com/kaitranntt/ccs/commit/4c81f28f0b67ef92cf74d0f5c13a5943ff0a7f00))
* **glmt:** handle 401 errors and headers-already-sent exception ([#30](https://github.com/kaitranntt/ccs/issues/30)) ([c953382](https://github.com/kaitranntt/ccs/commit/c95338232a37981b95b785b47185ce18d6d94b7a)), closes [#26](https://github.com/kaitranntt/ccs/issues/26)


### Features

* **cliproxy:** add qwen code oauth provider support ([#31](https://github.com/kaitranntt/ccs/issues/31)) ([a3f1e52](https://github.com/kaitranntt/ccs/commit/a3f1e52ac68600ba0806d67aacceb6477ffa3543)), closes [#29](https://github.com/kaitranntt/ccs/issues/29)
* **cliproxy:** auto-update cliproxyapi to latest release on startup ([8873ccd](https://github.com/kaitranntt/ccs/commit/8873ccd981679e8acff8965accdc22215c6e4aa2))

# [5.2.0](https://github.com/kaitranntt/ccs/compare/v5.1.1...v5.2.0) (2025-12-01)


### Features

* **release:** trigger v5.2.0 release ([7b65374](https://github.com/kaitranntt/ccs/commit/7b65374100196562a4f83705c8626fc7e6bb35d6))

## [5.1.1](https://github.com/kaitranntt/ccs/compare/v5.1.0...v5.1.1) (2025-12-01)


### Bug Fixes

* **cliproxy:** use double-dash flags for cliproxyapi auth ([9489884](https://github.com/kaitranntt/ccs/commit/94898848ea4533dcfc142e1b6c9bf939ba655537))

## [5.1.1-beta.1](https://github.com/kaitranntt/ccs/compare/v5.1.0...v5.1.1-beta.1) (2025-12-01)


### Bug Fixes

* **cliproxy:** use double-dash flags for cliproxyapi auth ([#24](https://github.com/kaitranntt/ccs/issues/24)) ([4c81f28](https://github.com/kaitranntt/ccs/commit/4c81f28f0b67ef92cf74d0f5c13a5943ff0a7f00))

# [5.1.0](https://github.com/kaitranntt/ccs/compare/v5.0.2...v5.1.0) (2025-12-01)


### Bug Fixes

* **ci:** use pat token to bypass branch protection ([04af7e7](https://github.com/kaitranntt/ccs/commit/04af7e7c09edbc4207f332e7a613d92df1f2fea1))


### Features

* **release:** implement semantic versioning automation with conventional commits ([d3d9637](https://github.com/kaitranntt/ccs/commit/d3d96371def7b5b44d6133ad50d86c934cdf1ad4))

# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/)

## [5.0.0] - 2025-11-28

### Added
- **CLIProxy OAuth Profiles**: Three new zero-config profiles powered by CLIProxyAPI
  - `ccs gemini` - Google Gemini via OAuth (zero config)
  - `ccs codex` - OpenAI Codex via OAuth (zero config)
  - `ccs agy` - Antigravity (AGY) via OAuth (zero config)

- **Download-on-Demand Binary**: CLIProxyAPI binary (~15MB) downloads automatically on first use
  - Supports 6 platforms: darwin/linux/windows × amd64/arm64
  - SHA256 checksum verification
  - 3x retry with exponential backoff
  - No npm package size impact

- **OAuth Authentication System** (`src/cliproxy/auth-handler.ts`):
  - Browser-based OAuth flow with automatic token storage
  - Headless mode fallback (`ccs gemini --auth --headless`)
  - Token storage in `~/.ccs/cliproxy-auth/<provider>/`
  - 2-minute OAuth timeout protection

- **CLIProxy Diagnostics** in `ccs doctor`:
  - Binary installation status + version
  - Config file validation
  - OAuth status per provider (gemini/codex/agy)
  - Port 8317 availability check

- **Enhanced Error Messages** (`src/utils/error-manager.ts`):
  - OAuth timeout troubleshooting
  - Port conflict resolution
  - Binary download failure with manual URL

- **New CLIProxy Module** (`src/cliproxy/`):
  - `binary-manager.ts` - Download, verify, extract binary
  - `platform-detector.ts` - OS/arch detection for 6 platforms
  - `cliproxy-executor.ts` - Spawn/kill proxy pattern
  - `config-generator.ts` - Generate config.yaml per provider
  - `auth-handler.ts` - OAuth token management
  - `types.ts` - TypeScript type definitions
  - `index.ts` - Central exports

### Changed
- **Profile Detection**: New priority order
  1. CLIProxy profiles (gemini, codex, agy)
  2. Settings-based profiles (glm, glmt, kimi)
  3. Account-based profiles (work, personal)
  4. Default Claude CLI
- **Help Text**: Updated with new OAuth profiles (alphabetically sorted)
- **Profile Detector**: Added `cliproxy` profile type

### Technical Details
- **Binary Version**: CLIProxyAPI v6.5.27
- **Default Port**: 8317 (TCP polling for readiness, no PROXY_READY signal)
- **Model Mappings**:
  - Gemini: gemini-2.0-flash (opus: thinking-exp, haiku: flash-lite)
  - Codex: gpt-4o (opus: o1, haiku: gpt-4o-mini)
  - Antigravity: agy (sonnet: agy-pro, haiku: agy-turbo)
- **Storage**:
  - Binary: `~/.ccs/bin/cliproxyapi`
  - Tokens: `~/.ccs/cliproxy-auth/<provider>/`
  - Config: `~/.ccs/cliproxy.config.yaml`

### Migration
- **No breaking changes**: All existing profiles (glm, glmt, kimi, accounts) work unchanged
- **Zero configuration**: OAuth profiles work out-of-box after browser login
- **Backward compatible**: v4.x commands and workflows unchanged

---

## [4.5.0] - 2025-11-27 (Phase 02 Complete)

### Changed
- **Modular Command Architecture**: Complete refactoring of command handling system
  - Main entry point (src/ccs.ts) reduced from 1,071 to 593 lines (**44.6% reduction**)
  - 6 command handlers extracted to dedicated modules in `src/commands/`
  - Enhanced maintainability through single responsibility principle
  - Command handlers can now be developed and tested independently

### Added
- **Modular Command Handlers** (`src/commands/`):
  - `version-command.ts` (3.0KB) - Version display functionality
  - `help-command.ts` (4.9KB) - Comprehensive help system
  - `install-command.ts` (957B) - Installation/uninstallation workflows
  - `doctor-command.ts` (415B) - System diagnostics
  - `sync-command.ts` (1.0KB) - Configuration synchronization
  - `shell-completion-command.ts` (2.1KB) - Shell completion management

- **New Utility Modules** (`src/utils/`):
  - `shell-executor.ts` (1.5KB) - Cross-platform shell command execution
  - `package-manager-detector.ts` (3.8KB) - Package manager detection (npm, yarn, pnpm, bun)

- **TypeScript Type System**:
  - `src/types/` directory with comprehensive type definitions
  - Standardized `CommandHandler` interface for all commands
  - 100% TypeScript coverage across all new modules

### Improved
- **Maintainability**: Each command now has focused, dedicated module
- **Testing Independence**: Command handlers can be unit tested in isolation
- **Development Workflow**: Multiple developers can work on different commands simultaneously
- **Code Navigation**: Developers can quickly locate specific command logic
- **Future Extension**: New commands can be added without modifying main orchestrator

### Technical Details
- **Zero Breaking Changes**: All existing functionality preserved
- **Performance**: No degradation, minor improvement due to smaller main file
- **Quality Gates**: All Phase 01 ESLint strictness rules maintained
- **Type Safety**: Comprehensive TypeScript coverage with zero `any` types
- **Interface Consistency**: All commands follow standardized `CommandHandler` interface

## [4.4.0] - 2025-11-23

### Changed
- **BREAKING**: settings.json now shared across profiles via symlinks
  - Each profile previously had isolated settings.json
  - Now all profiles share ~/.claude/settings.json
  - Migration automatic on install (uses ~/.claude/settings.json)
  - Backups created: `<instance>/settings.json.pre-shared-migration`
  - Rollback: restore backup manually if needed

### Added
- Doctor validates settings.json symlink integrity
- Sync repairs broken settings.json symlinks
- Migration from isolated to shared settings (automatic)

### Fixed
- Consistent shared data architecture across all .claude/ items

## [4.3.10] - 2025-11-23

### Fixed
- **Update Cache Issue**: Fixed `ccs update` serving cached package versions instead of fresh downloads
- Package manager cache is now automatically cleared before updating
- Update now ensures users always receive the latest version from registry

### Technical Details
- **Node.js (bin/ccs.js)**: Added cache clearing for npm, yarn, pnpm before update
  - npm: `npm cache clean --force`
  - yarn: `yarn cache clean`
  - pnpm: `pnpm store prune`
  - bun: No explicit cache clearing needed
- **Bash (lib/ccs)**: Added `npm cache clean --force` before npm update
- **PowerShell (lib/ccs.ps1)**: Added `npm cache clean --force` before npm update
- **Non-blocking**: Update continues even if cache clearing fails (with warning)
- **Manual fallback commands**: Updated to include cache clearing step

### Impact
- Users no longer need to manually run `npm cache clean --force` before `ccs update`
- Resolves issue where update reported success but installed cached/outdated version
- Ensures fresh package downloads from npm registry on every update

## [4.3.8] - 2025-11-23

### Fixed
- **ora v9 Compatibility**: Fixed "ora is not a function" errors in `ccs doctor` and installer utilities
- Properly handle ora v9+ ES module format when using CommonJS `require()`
- All spinner-based operations now work correctly with ora v9.0.0

### Technical Details
- ora v9+ is an ES module, requiring `.default` property access in CommonJS
- Updated import: `const oraModule = require('ora'); ora = oraModule.default || oraModule`
- Fallback spinner implementation ensures graceful degradation when ora is unavailable
- Affects: `bin/management/doctor.js`, `bin/utils/claude-dir-installer.js`, `bin/utils/claude-symlink-manager.js`
- Impact: `ccs doctor` command and postinstall scripts now work correctly with latest ora version

## [4.3.7] - 2025-11-23

### Fixed
- **Postinstall Script**: Fixed missing `~/.ccs/.claude/` directory during `npm install`
- Made `ora` dependency optional in `ClaudeDirInstaller` and `ClaudeSymlinkManager`
- Postinstall script now gracefully handles missing `ora` module during installation
- Ensures `.claude/` directory and symlinks are properly created even when `ora` is unavailable

### Technical Details
- Root cause: `ora` module not available during `npm install` postinstall execution
- Solution: Optional require with fallback to `console.log` when `ora` is unavailable
- Affects: `bin/utils/claude-dir-installer.js`, `bin/utils/claude-symlink-manager.js`
- Impact: All npm installations now properly create `~/.ccs/.claude/` and CCS symlinks

## [4.3.6] - 2025-11-23

### Added
- **Plugin Support**: Claude Code plugins now shared across all CCS profiles via `~/.ccs/shared/plugins/`
- Symlink architecture: `~/.claude/plugins/` ← `~/.ccs/shared/plugins/` ← `instance/plugins/`
- Install plugins once, use across GLM, GLMT, Kimi, and all Claude accounts
- Cross-platform support with Windows fallback (copy mode)

## [4.3.5] - 2025-11-22

### Changed
- **Deprecated Agent Cleanup**: Removed deprecated `ccs-delegator.md` agent file from installations
- Enhanced installation process to automatically clean up obsolete files
- Improved `ccs sync` command with migration logic for deprecated components

### Removed
- **ccs-delegator.md**: Agent file deprecated in favor of `ccs-delegation` skill (v4.3.2)
- Clean up of package copy in `~/.ccs/.claude/agents/ccs-delegator.md`
- Clean up of user symlink in `~/.claude/agents/ccs-delegator.md`

### Added
- Automatic migration marker system for tracking cleanup completion
- Intelligent backup system for user-modified deprecated files
- Version-aware migration logic following existing patterns

### Migration
- **Automatic**: Users upgrading from v4.3.2 or earlier will have deprecated files cleaned up automatically
- **Manual**: Run `ccs sync` to trigger cleanup manually
- **Backups**: User-modified files are backed up with timestamp before removal
- **Idempotent**: Cleanup is safe to run multiple times

### Technical Details
- Integrated into `npm postinstall` script for automatic cleanup on package updates
- Added to `ccs sync` command for manual cleanup operations
- Uses migration markers in `~/.ccs/.migrations/v435-delegator-cleanup`
- Follows existing SharedManager migration patterns for consistency

## [4.3.4] - 2025-11-22

### Fixed
- **CCS Update Command**: Enhanced `ccs update` to support multiple package managers
- Added automatic detection for npm, yarn, pnpm, and bun package managers
- Update commands now use the appropriate package manager automatically
- Improved installation method detection for more reliable updates

## [4.3.3] - 2025-11-21

### ⚠️ BREAKING CHANGES

- **CCS Delegation Commands Consolidated**: Replaced 4 hardcoded commands with 2 intelligent commands
  - Old: `/ccs:glm`, `/ccs:kimi`, `/ccs:glm:continue`, `/ccs:kimi:continue`
  - New: `/ccs` (auto-selects profile), `/ccs:continue` (auto-detects profile)
  - Override with flags: `/ccs --glm "task"`, `/ccs --kimi "task"`

### Changed
- Updated `--help` text across Node.js, Bash, and PowerShell implementations
- Updated delegation examples in README.md and workflow documentation
- Fixed CCS Doctor health checks to validate new command files
- Updated user configuration templates with new command syntax

### Added
- Intelligent profile selection based on task analysis (reasoning, long-context, cost-optimized)
- Support for custom profiles without creating new commands
- Enhanced session management with automatic profile detection

### Migration
| Old Command | New Command |
|-------------|-------------|
| `/ccs:glm "task"` | `/ccs "task"` (or `/ccs --glm "task"`) |
| `/ccs:kimi "task"` | `/ccs "task"` (or `/ccs --kimi "task"`) |
| `/ccs:glm:continue` | `/ccs:continue` |
| `/ccs:kimi:continue` | `/ccs:continue` |

---

## [4.1.5] - 2025-11-17

### Added
- **Sync command** (`ccs sync`) for updating delegation commands and skills
- **Short flag** `-sc` for `--shell-completion` command
- **Enhanced version display** with delegation status information

### Changed
- **Auth help text** now emphasizes concurrent account usage across all platforms
- **Help text standardization** ensures consistent messaging across bash, PowerShell, and Node.js
- **Description text** emphasizes running different Claude CLI sessions concurrently
- **GitHub documentation links** updated to stable permalinks
- **Shell completions** updated to include sync command and -sc flag

### Fixed
- **Inconsistent help text** across different platform implementations
- **Outdated description** text to emphasize concurrent sessions over specific examples

---

## [4.1.4] - 2025-11-17

### Fixed
- **Shell completion ENOTDIR errors** when parent path conflicts with existing files
- **Zsh completion syntax errors** with _alternative and _describe functions
- **Reversed color application** in zsh completion (commands vs descriptions)

### Added
- **Enhanced shell completion UI/UX** with descriptions and grouping
- **Color-coded completions** for zsh and fish shells
- **Custom settings profile support** in shell completions
- **Improved completion formatting** with section headers and separators

### Changed
- **Generalized help text** removed specific account examples for broader applicability
- **Delegation help section** clarified context and removed non-existent commands
- **Shell completion organization** grouped by categories (commands, model profiles, account profiles)

---

## [4.1.3] - 2025-11-17

### Fixed
- **Doctor command delegation check false positive**
  - Fixed `ccs doctor` incorrectly checking for delegation commands in `~/.ccs/shared/commands/ccs/` instead of `~/.ccs/.claude/commands/ccs/`
  - Removed check for non-existent `create.md` file
  - Now correctly detects installed delegation commands (glm.md, kimi.md) after npm install
  - Users will no longer see "[!] Delegation commands not found" warning when delegation is properly installed

---

## [4.1.2] - 2025-11-16

### Fixed
- **Kimi API 401 errors** caused by deprecated model fields
  - Removed `ANTHROPIC_MODEL`, `ANTHROPIC_SMALL_FAST_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL` from Kimi settings
  - Kimi API update now rejects requests with these fields (previously optional, now break authentication)
  - Automatic migration removes deprecated fields from existing `~/.ccs/kimi.settings.json`
  - Preserves user API keys and custom settings during migration
  - Updated `config/base-kimi.settings.json` template
  - Users experiencing 401 errors will be automatically fixed on next install/update

### Changed
- Kimi settings now minimal: only `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` required

---

## [4.1.1] - 2025-11-16

### Fixed
- **npm install fails to copy .claude/ directory** to `~/.ccs/.claude/`
  - Error: "[!] CCS .claude/ directory not found, skipping symlink installation"
  - Created `bin/utils/claude-dir-installer.js` utility to copy `.claude/` from package
  - Updated `scripts/postinstall.js` to copy `.claude/` before creating symlinks
  - Updated `ccs update` command to re-install `.claude/` directory
  - Supports Node.js 14+ with fallback for versions < 16.7.0

### Added
- `ClaudeDirInstaller` utility class for managing `.claude/` directory installation

---

## [4.1.0] - 2025-11-16

### Added
- **Selective .claude/ directory symlinking** for shared resources across profiles
- `claude-symlink-manager.js` utility for managing symlinks with Windows fallback
- Enhanced `ccs doctor` command to verify .claude/ directory health
- Postinstall script for automatic .claude/ directory setup
- **Stream-JSON output** for real-time delegation visibility (`--output-format stream-json --verbose`)
- **Real-time tool tracking** with verbose context (shows file paths, commands, patterns)
- **Smart slash command detection** (preserves /cook, /plan, /commit in delegated prompts)
- **Signal handling** (Ctrl+C/Esc kills delegated child processes, prevents orphans)
- **Comprehensive tool support** (13 Claude Code tools: Bash, Read, Write, Edit, Glob, Grep, NotebookEdit, NotebookRead, SlashCommand, Task, TodoWrite, WebFetch, WebSearch)
- **Active task display** for TodoWrite (shows current task instead of count)
- Documentation: Stream-JSON workflow diagrams

### Changed
- Installers now create selective symlinks (commands/, skills/, agents/) instead of full directory copies
- Windows support: Falls back to directory copying when symlinks unavailable
- Profile-specific files (settings.json, sessions/, todolists/, logs/) remain isolated
- Improved README with symlink architecture documentation
- **BREAKING**: Delegation now uses stream-json instead of single JSON blob
- **Time-based limits** replace turn-based limits (10min default timeout vs 20 max-turns)
- **Graceful termination** with SIGTERM → SIGKILL fallback (2s grace period)
- Removed `--max-turns` flag (deprecated, use timeout instead)
- Simplified slash command docs (removed over-prescriptive instructions)
- Internal tools (TodoWrite, Skill) now show meaningful progress

### Fixed
- Duplicate .claude/ resources across multiple profiles
- Installer logic now handles symlink creation during setup
- Orphaned `claude -p` processes after parent termination
- Slash commands broken by IMPORTANT safety prefix
- Slash commands detected as file paths (/home vs /cook)
- Stream-json requires `--verbose` flag with `-p`
- Tool output spam (filtered internal tools, show active tasks)

### Removed
- IMPORTANT safety prefix (broke slash command positioning)
- Outdated test files (json-output.test.js, max-turns.test.js)
- TTY detection (now shows progress unless CCS_QUIET=1)

---

## [3.5.0] - 2025-11-15

### Added
- Shell auto-completion (bash, zsh, PowerShell, Fish)
- `--shell-completion` command (auto-installs for detected shell with proper comment markers, cross-platform)
- Error codes (E101-E901) with documentation at docs/errors/
- Fuzzy matching "Did you mean?" suggestions (Levenshtein distance)
- Progress indicators (doctor command: [n/9] counter, GLMT proxy startup spinner)
- Interactive confirmation prompts for destructive operations
- `--yes/-y` flag for automation (skips confirmations)
- `--json` flag for auth commands (list, show)
- Impact display (session count, paths) before profile deletion
- Comprehensive test suite (15 tests, 100% pass rate)

### Changed
- Error boxes: Unicode (╔═╗) → ASCII (===) for cross-platform compatibility
- JSON output uses CCS version (3.5.0) instead of separate schema version
- Help text includes EXAMPLES section across all platforms
- Test suite properly counts test cases (not assertions)

### Fixed
- Standalone installer dependency handling (now downloads error-codes, progress-indicator, prompt files)
- `--yes` flag bug (returned false instead of true, preventing auto-confirmation)
- Help text consistency between Node.js and bash versions (added Uninstall section to bash)
- Test pass rate calculation (now excludes skipped tests from denominator)
- Help section comparison (locale-specific sort order)

---

## [3.4.6] - 2025-11-12

### Added
- GLMT ReasoningEnforcer: Prompt injection + API params hybrid (4 effort levels, always enabled)

### Changed
- Added GLMT production warnings (NOT PRODUCTION READY)
- Streamlined CLAUDE.md (-337 lines)
- Simplified GLMT controls: 4 mechanisms → 3 automatic
- Locale + reasoning enforcement now always enabled

### Removed
- GLMT Budget Calculator mechanism (consolidated into automatic controls)
- Deprecated GLMT environment variables (`CCS_GLMT_FORCE_ENGLISH`, `CCS_GLMT_THINKING_BUDGET`, `CCS_GLMT_STREAMING`)
- Outdated test scenarios for removed environment variables

---

## [3.4.5] - 2025-11-11

### Fixed
- Thinking block signature timing race (blocks appeared blank in Claude CLI UI)
- Content verification guard in `_createSignatureDeltaEvent()` returns null if empty

### Changed
- Consolidated debug flags: `CCS_DEBUG_LOG`, `CCS_GLMT_DEBUG` → `CCS_DEBUG` only

### Added
- 6 regression tests for thinking signature race (`test-thinking-signature-race.js`)

---

## [3.4.4] - 2025-11-11

### Fixed
- Postinstall symlink creation (fixed require path to shared-manager.js)

---

## [3.4.3] - 2025-11-11

### Added
- Keyword thinking control: `think` < `think hard` < `think harder` < `ultrathink`
- Streaming auto-fallback on error

### Changed
- YAGNI/KISS: Removed budget-calculator.js, task-classifier.js (-272 LOC)
- `CCS_DEBUG_LOG` → `CCS_DEBUG` (backward compatible)

### Removed
- `CCS_GLMT_THINKING_BUDGET`, `CCS_GLMT_STREAMING`, `CCS_GLMT_FORCE_ENGLISH` env vars

### Fixed
- GLMT proxy path (glmt/glmt-proxy.js)
- `ultrathink` effort: `high` → `max`

---

## [3.4.2] - 2025-11-11

### Changed
- Version bump for npm CI workaround

---

## [3.4.1] - 2025-11-11

### Added
- GLMT loop prevention (locale enforcer, budget calculator, task classifier, loop detector)
- Env vars: `CCS_GLMT_FORCE_ENGLISH`, `CCS_GLMT_THINKING_BUDGET`
- 110 GLMT tests (all passing)

### Changed
- Directory structure: bin/{glmt,auth,management,utils}, tests/{unit,integration}
- Token savings: 50-80% for execution tasks

### Fixed
- Thinking parameter processing from Claude CLI
- GLMT tool support (MCP tools, function calling)
- Unbounded planning loops (20+ min → <2 min)
- Chinese output issues

---

## [3.4.0] - 2025-11-11

### Added
- GLMT streaming (5-20x faster TTFB: <500ms vs 2-10s)
- SSEParser, DeltaAccumulator classes
- Security limits (1MB SSE, 10MB content, 100 blocks)

---

## [3.3.0] - 2025-11-11

### Added
- Debug mode: `CCS_DEBUG_LOG=1`
- Verbose flag: `ccs glmt --verbose`
- GLMT config defaults

---

## [3.2.0] - 2025-11-10

### Changed
- **BREAKING**: Symlink-based shared data (was copy-based)
- ~/.ccs/shared/ → ~/.claude/ symlinks
- 60% faster installs

---

## [3.1.1] - 2025-11-10

### Fixed
- Migration now runs during install (not on first `ccs` execution)

---

## [3.1.0] - 2025-11-10

### Added
- Shared data architecture (commands/skills/agents shared across profiles)

---

## [3.0.2] - 2025-11-10

### Fixed
- Profile creation no longer auto-sets as default
- Help text simplified (40% shorter)

---

## [3.0.1] - 2025-11-10

### Added
- Auto-recovery system for missing/corrupted configs
- `ccs doctor` health check command
- ErrorManager class

---

## [3.0.0] - 2025-11-09

### Added
- **Multi-account switching**: Run multiple Claude accounts concurrently
- Auth commands: create, list, show, remove, default
- Profile isolation (sessions, todos, logs per profile)

### BREAKING
- Removed v2.x vault encryption
- Login-per-profile model

---

## [2.5.1] - 2025-11-07
### Added
- Kimi `ANTHROPIC_SMALL_FAST_MODEL` support

## [2.5.0] - 2025-11-07
### Added
- Kimi integration

## [2.4.9] - 2025-11-05
### Fixed
- Node.js DEP0190 warning

## [2.4.8] - 2025-11-05
### Fixed
- Deprecation warning (platform-specific shell)

## [2.4.7] - 2025-11-05
### Fixed
- Windows spawn EINVAL error

## [2.4.6] - 2025-11-05
### Fixed
- Color detection, TTY handling

## [2.4.5] - 2025-11-05
### Added
- Performance benchmarks (npm vs shell)

## [2.4.3] - 2025-11-04
### Fixed
- **CRITICAL**: DEP0190 command injection vulnerability

## [2.4.2] - 2025-11-04
### Changed
- Version bump for republish

## [2.4.1] - 2025-11-04
### Fixed
- **CRITICAL**: Windows PATH detection
- PowerShell terminal termination

## [2.4.0] - 2025-11-04
### Added
- npm package support
### BREAKING
- Executables moved to lib/

## [2.3.1] - 2025-11-04
### Fixed
- PowerShell syntax errors

## [2.3.0] - 2025-11-04
### Added
- Custom Claude CLI path: `CCS_CLAUDE_PATH`

## [2.2.3] - 2025-11-03
### Added
- `ccs --uninstall` command

## [2.2.2] - 2025-11-03
### Fixed
- `ccs --install` via symlinks

## [2.2.1] - 2025-11-03
### Changed
- Hardcoded versions (no VERSION file)

## [2.2.0] - 2025-11-03
### Added
- Auto PATH configuration
- Terminal colors (NO_COLOR support)
### Changed
- Unified install: ~/.local/bin (Unix)
### Fixed
- **CRITICAL**: Shell injection vulnerability

## [2.1.0] - 2025-11-02
### Changed
- Windows uses --settings flag (27% code reduction)

## [2.0.0] - 2025-11-02
### BREAKING
- Removed `ccs son` profile
### Added
- Config templates, installers/ folder
### Fixed
- **CRITICAL**: PowerShell env var crash

## [1.1.0] - 2025-11-01
### Added
- Git worktrees support

## [1.0.0] - 2025-10-31
### Added
- Initial release
