## [7.72.1](https://github.com/kaitranntt/ccs/compare/v7.72.0...v7.72.1) (2026-04-17)

### Bug Fixes

* **cliproxy:** pin routing config regeneration path ([d3de83e](https://github.com/kaitranntt/ccs/commit/d3de83e157b4d286cc9b684339cccbe501b911a3))

### Hotfixes

* **browser:** avoid aborting launch on missing managed profile ([41bf507](https://github.com/kaitranntt/ccs/commit/41bf5075e0ece90401dfa22fe9ffbed797825387))

### Tests

* **cliproxy:** pin routing strategy test env scope ([bc1606d](https://github.com/kaitranntt/ccs/commit/bc1606da756fdf1552029d3a74add4464caa2377))

## [7.72.0](https://github.com/kaitranntt/ccs/compare/v7.71.0...v7.72.0) (2026-04-17)

### Features

* add missing i18n keys for analytics chart empty states ([d3ef82c](https://github.com/kaitranntt/ccs/commit/d3ef82cd601732522e1b98d4c9a4035a9ab31941))
* **cli:** add browser automation commands ([4e30c9b](https://github.com/kaitranntt/ccs/commit/4e30c9b080a4e240b1fa17c3b0486dafc28224da))
* **cliproxy:** integrate missing provider support ([2d9f8c9](https://github.com/kaitranntt/ccs/commit/2d9f8c96950d2c13522c088063dd84d20c69d51c))
* **cursor:** split legacy bridge from cliproxy provider ([3b5941c](https://github.com/kaitranntt/ccs/commit/3b5941c60bf5578c49785c001f85612cfec8a7e5))
* **proxy:** add openai-compatible local proxy runtime ([074e900](https://github.com/kaitranntt/ccs/commit/074e90055789bd146d96fd3d1ad917f91e602186))
* **proxy:** complete openai routing scope ([17187c4](https://github.com/kaitranntt/ccs/commit/17187c4abd5d62552e137cd783a92e7dbd356e88))
* **settings:** refine browser automation tab ([06f6f54](https://github.com/kaitranntt/ccs/commit/06f6f5485fdae1790ac50eee3f0bdc4905b340b1))

### Bug Fixes

* **accounts:** prefer live codex plan over stale free tags ([0bfdc52](https://github.com/kaitranntt/ccs/commit/0bfdc522d5606119b5051bdabc4b8d59aaeb4891))
* **accounts:** refine codex plan badges ([25aa8bd](https://github.com/kaitranntt/ccs/commit/25aa8bdb16e04f9f81e5b54487716c7cb85728ea))
* **accounts:** show one codex plan badge ([2a3632e](https://github.com/kaitranntt/ccs/commit/2a3632e5a5efa825cdee0e03ffc26410b3c42ee9))
* **accounts:** show one codex plan tag ([25f94bb](https://github.com/kaitranntt/ccs/commit/25f94bb180cb6b50b1ee297942dbc45508184502))
* **accounts:** simplify codex free tier badges ([72ea1fc](https://github.com/kaitranntt/ccs/commit/72ea1fc9d69a8958b045c74eade7beb8cdd7b6bf))
* **browser:** address platform and port review ([8a17410](https://github.com/kaitranntt/ccs/commit/8a17410f9642911d3b74357d6bbfd16aecddad4e))
* **browser:** reset blank attach path to default ([4583ffa](https://github.com/kaitranntt/ccs/commit/4583ffa022909c4456051c6e89be791c18933eab))
* chronological ordering in usage trends chart ([#1008](https://github.com/kaitranntt/ccs/issues/1008)) ([0e8abed](https://github.com/kaitranntt/ccs/commit/0e8abed7982ed6640455b52e61fb658ba8363b2b))
* clarify docker dashboard auth setup guidance ([8edb563](https://github.com/kaitranntt/ccs/commit/8edb56331e5f847f06c72624320874c7c884b334))
* **cli:** document gitlab shortcut flags and harden cursor routing ([4e738ee](https://github.com/kaitranntt/ccs/commit/4e738ee021603e5553eafa1a5e9c61566f6979f5))
* **cli:** narrow cursor cliproxy shortcut routing ([93afdb5](https://github.com/kaitranntt/ccs/commit/93afdb50bf767087839123d1a09bda045fca34c7))
* **cliproxy:** align codex defaults with gpt-5.4 ([80847b4](https://github.com/kaitranntt/ccs/commit/80847b4e6b68eab95e08b0acadbce888799f30b0))
* **cliproxy:** align delegated gemini auth recovery ([6b53df0](https://github.com/kaitranntt/ccs/commit/6b53df0147989dac42a76ca53039fc7a714d495c))
* **cliproxy:** avoid duplicate gemini management retries ([637a591](https://github.com/kaitranntt/ccs/commit/637a591dcaa94843cd1c74e18f713b36bcf2a1f4))
* **cliproxy:** avoid network-bound local startup ([27f1416](https://github.com/kaitranntt/ccs/commit/27f1416181904cc256a8694e6e15189ca673333c))
* **cliproxy:** clear stale auth quota cache ([769b54f](https://github.com/kaitranntt/ccs/commit/769b54fb4f20e2045d1b1af42efa5eb2c920c414))
* **cliproxy:** delegate gemini refresh to upstream ([9dc6374](https://github.com/kaitranntt/ccs/commit/9dc6374851718bb971175a3ebe0ff611d584847d))
* **cliproxy:** fetch Claude OAuth quota from usage endpoint ([9e88082](https://github.com/kaitranntt/ccs/commit/9e880825e744a078fa60fdbf8dd89d267184c9cb))
* **cliproxy:** harden Claude OAuth quota window parsing ([050b41b](https://github.com/kaitranntt/ccs/commit/050b41bb554a90b5938be1e081efc033cb390f3e))
* **codex:** prefer cmd wrappers over powershell on windows ([a94de01](https://github.com/kaitranntt/ccs/commit/a94de010dbb0a3c808e813b5c9ac9ec229f37708))
* **cursor:** deprecate legacy bridge and harden gitlab auth ([87d93b6](https://github.com/kaitranntt/ccs/commit/87d93b651bccb5e085b41925ebfff0c7e0cad82e))
* **cursor:** migrate legacy settings and validate gitlab urls ([58c2c46](https://github.com/kaitranntt/ccs/commit/58c2c46ed73326d9d16f5889326150cd0965022a))
* **gitlab:** sanitize PAT auth failures across cli and web ([7f1c236](https://github.com/kaitranntt/ccs/commit/7f1c23607db9692ffcfa593930f90809f03f3af8))
* **proxy:** detect dashscope compatible-mode profiles ([a6aa576](https://github.com/kaitranntt/ccs/commit/a6aa576d5a6e11d53cdd1d85f22b57a63fbe9b47))
* **proxy:** keep stream guards active through sse piping ([841eeb4](https://github.com/kaitranntt/ccs/commit/841eeb497c274ed38ec2c653ec7c9cd02c1ea0ed))
* **shared-manager:** exclude .staging dirs from marketplace registry sync ([5b262f0](https://github.com/kaitranntt/ccs/commit/5b262f0139cf31331168b2c28304b499c3f23466))
* **shared-manager:** prune transient and malformed marketplace entries ([2293368](https://github.com/kaitranntt/ccs/commit/2293368e31f43f779a865a280513702542dc0870))
* **ui:** align cliproxy provider assets ([1bad3b0](https://github.com/kaitranntt/ccs/commit/1bad3b0305f32b13e78a8a41dba9c63a52449722))

### Documentation

* **proxy:** credit claude-code-router ([b346693](https://github.com/kaitranntt/ccs/commit/b346693c3a70205a3f6cce46e556cd6e1ceaad8b))
* **proxy:** document openai-compatible routing ([7b64852](https://github.com/kaitranntt/ccs/commit/7b6485249530c890d9bf3549221dcbd0f3f6d18f))
* **roadmap:** note private-network startup fix ([3b17bc9](https://github.com/kaitranntt/ccs/commit/3b17bc934a01b93f016e85de4c4a7a162863dcf7))

### Styles

* **ui:** format gitlab auth launch options ([dc94b9c](https://github.com/kaitranntt/ccs/commit/dc94b9c1c938b8d32bc3daf1b0bc6c5bb05b2bf0))

### Code Refactoring

* **accounts:** localize codex identity labels ([cfbc967](https://github.com/kaitranntt/ccs/commit/cfbc9672c3360ed1a5578b1cf715ea58df1b8702))
* **proxy:** internalize sse translation and cleanup handlers ([a340709](https://github.com/kaitranntt/ccs/commit/a3407093d70bef44874cdf26a06436e0d287c1a7))

### Tests

* **ci:** stabilize runner-sensitive isolated tests ([2ba3a0a](https://github.com/kaitranntt/ccs/commit/2ba3a0ab02fc4909681a36cc265e5ff2d1680426))
* **ci:** use runtime-relative isolated child scripts ([2e2ba1c](https://github.com/kaitranntt/ccs/commit/2e2ba1c09b81b5e79b7ec65bbd0979d5ce1a1204))
* **cliproxy:** stabilize routing strategy config scope ([4845b79](https://github.com/kaitranntt/ccs/commit/4845b797de4a1e326e4ebea0109e884319e1bd3e))
* **proxy:** cover proxy lifecycle and routing ([5c66c1f](https://github.com/kaitranntt/ccs/commit/5c66c1f12162306d1039ec2e255ad9894199d1f4))

## [7.71.0](https://github.com/kaitranntt/ccs/compare/v7.70.1...v7.71.0) (2026-04-14)

### Features

* **accounts:** preserve codex variant detail in dashboard cards ([32c16a3](https://github.com/kaitranntt/ccs/commit/32c16a3739a6edb8f1f36b402f0776e5ae066b48))
* **ci:** make PR-Agent reviews more verbose ([4c63f1a](https://github.com/kaitranntt/ccs/commit/4c63f1a0dbec115ce4c4ede25e6651b456032a44))

### Bug Fixes

* **ci:** restore PR-Agent reviewer bot identity ([4bd16b8](https://github.com/kaitranntt/ccs/commit/4bd16b89ce064b265c0a12535899cd49f13cf00d))

### Tests

* **accounts:** cover codex free-tier identity labels ([d5868e0](https://github.com/kaitranntt/ccs/commit/d5868e06882b302218e60496ada63ba778477434))

## [7.70.1](https://github.com/kaitranntt/ccs/compare/v7.70.0...v7.70.1) (2026-04-14)

### Bug Fixes

* **ci:** raise PR-Agent custom model budget ([c4ad2ca](https://github.com/kaitranntt/ccs/commit/c4ad2cae108acd691d70f5a0bf91d3d1464e5724))

## [7.70.0](https://github.com/kaitranntt/ccs/compare/v7.69.1...v7.70.0) (2026-04-14)

### Features

* **ci:** migrate AI review to self-hosted PR-Agent ([25216ea](https://github.com/kaitranntt/ccs/commit/25216eaf334c405ed433f800886ee541161177de))
* **ui:** complete dashboard i18n coverage across 162 files ([c3401f0](https://github.com/kaitranntt/ccs/commit/c3401f0a91135734ea8098f86c08715d90a3021c)), closes [#983](https://github.com/kaitranntt/ccs/issues/983)

### Bug Fixes

* apply api-key updates during token regeneration ([f067f39](https://github.com/kaitranntt/ccs/commit/f067f3924556968b2d0d0304455ce96284b8c74f))
* **browser:** harden browser MCP websocket startup ([d30f580](https://github.com/kaitranntt/ccs/commit/d30f5803a71bf7ab57230a840c1e180b5a8f7959))
* **ci:** allow PR-Agent dispatch bot reruns ([9a91901](https://github.com/kaitranntt/ccs/commit/9a91901a9b1ef6d4f07ce8f82500aa3669abb5e1))
* **ci:** preserve AI review variable contract ([d6ec5ee](https://github.com/kaitranntt/ccs/commit/d6ec5eeebdeebb54ffb3d3b93e395f976a6aef97))
* **ci:** restore trusted PR review dispatch ([0d2ce7d](https://github.com/kaitranntt/ccs/commit/0d2ce7d1b3449033ef61d4d74108cd91914fe077))
* **ci:** restrict self-hosted PR-Agent comment triggers ([e1271e2](https://github.com/kaitranntt/ccs/commit/e1271e2dbf4933d9a5c02ecde36cbf4ce07394bc))
* **ci:** stabilize update-command tests under parallel runners ([b148d1b](https://github.com/kaitranntt/ccs/commit/b148d1ba660774f89be3542e9dcbd62abad79b49))
* **cliproxy:** degrade gracefully on GitHub release 403s ([4e15ec5](https://github.com/kaitranntt/ccs/commit/4e15ec5387ada5f24a29d57bb70e1bc004e5c6fe))
* **ui:** finish dashboard i18n follow-up pass ([87899a4](https://github.com/kaitranntt/ccs/commit/87899a489c6bf4d81e490c8754bad89c78436a11))
* **ui:** use i18n singleton in claude extension status card ([be9a481](https://github.com/kaitranntt/ccs/commit/be9a481e75901cbf7360399b208085f64574cf23))

### Hotfixes

* stop auto-enabling stale Chrome DevTools reuse ([5c799e6](https://github.com/kaitranntt/ccs/commit/5c799e68e98fd671ad85c3665b32d796d022631a))

### Code Refactoring

* **ci:** make ai-review model/endpoint configurable via repository variables ([026ff6c](https://github.com/kaitranntt/ccs/commit/026ff6ceddefae92a2e7caa83a5d51f920d391be))

### Performance Improvements

* **hooks:** shorten feature-branch pre-push gate ([2868dcd](https://github.com/kaitranntt/ccs/commit/2868dcdaaeac719fdcec22e9aee3f4e8f5e3bb09))

### Tests

* **ci:** harden cursor models oversized-body fallback ([66e2969](https://github.com/kaitranntt/ccs/commit/66e29691b03b51910c41c2771d676a6df35da876))
* **ci:** update ai-review workflow runtime assertions ([72d8f36](https://github.com/kaitranntt/ccs/commit/72d8f36b5d1bf12a8db2ede96a058394b5384d5f))
* **hooks:** harden cross-platform MCP coverage ([3103f3f](https://github.com/kaitranntt/ccs/commit/3103f3f293b9b09114e32762e92c75770f6dcaf0))
* **tokens:** isolate auth rotation from mocked handlers ([cb1d78b](https://github.com/kaitranntt/ccs/commit/cb1d78bd9d5c157b3e27ab15631260fa515f527f))
* **update:** isolate current-install command deps ([394d7d9](https://github.com/kaitranntt/ccs/commit/394d7d94fc77144c25cdd84195805fbec2966233))

## [7.69.1](https://github.com/kaitranntt/ccs/compare/v7.69.0...v7.69.1) (2026-04-13)

### Hotfixes

* stop auto-enabling stale Chrome DevTools reuse ([33f57d3](https://github.com/kaitranntt/ccs/commit/33f57d3cac19d9978164221f30e42ea39e4f270a))

## [7.69.0](https://github.com/kaitranntt/ccs/compare/v7.68.2...v7.69.0) (2026-04-13)

### Features

* **browser:** 接入 CCS browser MCP 与最小交互闭环 ([eb8149e](https://github.com/kaitranntt/ccs/commit/eb8149e8fa476f279583136be7286dbaf1ac4361))
* **cli:** add --append-system-prompt-file support ([45c231a](https://github.com/kaitranntt/ccs/commit/45c231a71732c40046a67f1cb46f1a5bcd8e96ee))
* **cliproxy:** add --json flag to catalog command ([dceb6f6](https://github.com/kaitranntt/ccs/commit/dceb6f6d37972322a881d32c4d8b0c420e2f52db))
* **cliproxy:** add thinking config to catalog --json and test false values ([22acd96](https://github.com/kaitranntt/ccs/commit/22acd96ba40dda2c9ed596b2db2643863b3b7e4d))
* **cliproxy:** include model metadata in catalog --json output ([fbfb130](https://github.com/kaitranntt/ccs/commit/fbfb130f4d6313f10a6c757ceccfcfe2d7e69241))
* **cursor:** harden live probe and runtime contracts ([e1049e3](https://github.com/kaitranntt/ccs/commit/e1049e38d409ad32bf0c1ae41eb713f59dbdfe02))
* **ui:** persist paused account toggle state in localStorage ([18e5cd5](https://github.com/kaitranntt/ccs/commit/18e5cd5d94da8335cc01575d96693e197ea56eb0))
* **websearch:** add SearXNG provider support and configuration ([eec8c8b](https://github.com/kaitranntt/ccs/commit/eec8c8b4a3288ec29e246aac58785f642618a48f))
* **websearch:** add url property to WebSearchProviderConfig interface ([36d828f](https://github.com/kaitranntt/ccs/commit/36d828f99c4a8dae40286b72709487ae8cb49f2c))

### Bug Fixes

* **browser:** 加固 browser_click 激活语义并修复相关验证阻塞 ([74f0281](https://github.com/kaitranntt/ccs/commit/74f028168dfa4d5c8478679465bb527a7a5f8b7f))
* **ci:** sync bun.lock for browser MCP types ([a63417e](https://github.com/kaitranntt/ccs/commit/a63417e567edc1cca36a184527504ea78a45a1f8))
* **cli:** match managed prompt files by exact path ([7fc39f7](https://github.com/kaitranntt/ccs/commit/7fc39f7c0319c19ec52d21dc60248a27c128fe3f))
* **cliproxy:** guard against undefined catalog and add issueUrl field ([7bf5b4b](https://github.com/kaitranntt/ccs/commit/7bf5b4b95e0bb12afc1d23d668fb43546608db58))
* **cliproxy:** preserve explicit false values in catalog --json ([9ac1ac9](https://github.com/kaitranntt/ccs/commit/9ac1ac98040503cd395d51e4cffff123a1ace44f))
* **cursor:** align auto-detect status and CI coverage ([2719d7a](https://github.com/kaitranntt/ccs/commit/2719d7a6f7a2589dd2b9f9478f9c86d8aaea8876))
* **cursor:** resolve PR review findings ([cf5df06](https://github.com/kaitranntt/ccs/commit/cf5df0630a2360c0c145b926dc94e1775ed8d7b0))
* **docker:** delegate restart/install to supervisorctl in Docker deployments ([7776715](https://github.com/kaitranntt/ccs/commit/7776715ebadc5821167c0bf721266f43a228b3cb)), closes [#964](https://github.com/kaitranntt/ccs/issues/964)
* **test:** isolate chrome reuse home env expectations ([a68bc46](https://github.com/kaitranntt/ccs/commit/a68bc46cafd27b3a07d63df9597729b7ea6261a3))
* **ui:** clarify Gemini quota tooltip labels ([5076b21](https://github.com/kaitranntt/ccs/commit/5076b212af6a9318505e52536899af1060faf053))
* **websearch:** harden searxng url handling ([8b553c3](https://github.com/kaitranntt/ccs/commit/8b553c35c150e6411e6af0ce0a0a27305b516e6c))
* **websearch:** reject blank searxng status urls ([8d8f446](https://github.com/kaitranntt/ccs/commit/8d8f4469b6537faf0918773c52ea2b71abef11de))

### Hotfixes

* detect bun-owned installs through symlinked ccs path ([898e7a6](https://github.com/kaitranntt/ccs/commit/898e7a632125476f269d4ff34280589404d7c3ae))
* restore bun types for stable release CI ([6cfb171](https://github.com/kaitranntt/ccs/commit/6cfb17151475efbef306c4a3e2265d3212f88ee2))

### Documentation

* **cliproxy:** add catalog --json to --help output ([ea2b16b](https://github.com/kaitranntt/ccs/commit/ea2b16bb6622c7e4d668aa63b735093701313036))
* **cliproxy:** clarify catalog --json output format in JSDoc ([ac92688](https://github.com/kaitranntt/ccs/commit/ac92688cc5f14054f4bd73c15723d521baa9afb1))

### Tests

* **browser:** 修复 default profile browser launch 竞态测试 ([7754c6c](https://github.com/kaitranntt/ccs/commit/7754c6c0ff3aa8f69f17860d283c80b752d5a6cc))
* **ci:** add env isolation comment to persist-command-handler ([79251d7](https://github.com/kaitranntt/ccs/commit/79251d7af8b22a3a7fdb11ac6a357dd245df4590))
* **ci:** improve test isolation readability per review feedback ([1a7fc4a](https://github.com/kaitranntt/ccs/commit/1a7fc4a3f280e647c07c4b1a4e9eeae2d3ae3d3c))
* **ci:** isolate CCS-managed env vars from host session ([2cc92e8](https://github.com/kaitranntt/ccs/commit/2cc92e8bb80ba7239bb66b8cd24e0cb4c6ff0627))
* **cliproxy:** add catalog --json tests and clarify flag priority ([509d2e4](https://github.com/kaitranntt/ccs/commit/509d2e4dd83840775915c7297621da89a7b7fe9c))
* **ui:** 修复彩色输出下的脆弱断言 ([2527889](https://github.com/kaitranntt/ccs/commit/2527889d1d28ee1e7c58581b697e18a220f15cf3))

### Build System

* **types:** 补充 Bun 类型声明配置 ([26059c7](https://github.com/kaitranntt/ccs/commit/26059c78dc4f19e0309e96be42b4238146a34ff5))

### CI

* retrigger validation ([ef564ca](https://github.com/kaitranntt/ccs/commit/ef564cafdf4213d07914f8e2cf9a348a6fb272b3))

## [7.68.2](https://github.com/kaitranntt/ccs/compare/v7.68.1...v7.68.2) (2026-04-13)

### Bug Fixes

* **image-analysis:** wrap defaultDeps in arrow functions to fix circular dep capture ([a76265a](https://github.com/kaitranntt/ccs/commit/a76265a7c0edcae7e1b952cacd32e0eca20b6325)), closes [#973](https://github.com/kaitranntt/ccs/issues/973)

### Tests

* **image-analysis:** cover circular dependency regression ([d74b514](https://github.com/kaitranntt/ccs/commit/d74b514dc5b2d741071b13d85ac02da115ae9b9d))

## [7.68.1](https://github.com/kaitranntt/ccs/compare/v7.68.0...v7.68.1) (2026-04-12)

### Hotfixes

* detect bun-owned installs through symlinked ccs path ([5f8e66e](https://github.com/kaitranntt/ccs/commit/5f8e66ec1e1ef9cceb135c560f9bd44c9269dd6b))

## [7.68.0](https://github.com/kaitranntt/ccs/compare/v7.67.0...v7.68.0) (2026-04-11)

### Features

* **api:** add Hugging Face provider preset ([83255f4](https://github.com/kaitranntt/ccs/commit/83255f477197c9f74b472b36d9a0086030c10713))
* **cliproxy:** add entitlement evidence for gemini and agy ([bb331ff](https://github.com/kaitranntt/ccs/commit/bb331ff5d8a9ff8bc387599a491335ffe89e7a1c))
* **cliproxy:** add pinned model routing prefixes ([4d5e528](https://github.com/kaitranntt/ccs/commit/4d5e52828b9d20759bf20e7b4353192fbecfc868))
* **profiles:** add local runtime readiness checks ([63b67f1](https://github.com/kaitranntt/ccs/commit/63b67f1c1c270f3e4e6c1a676e1c9256f2577d99))
* **ui:** add paused filter to account flow viz ([a169917](https://github.com/kaitranntt/ccs/commit/a169917692016e1a01560c13c95a554da430cd38))
* **ui:** reposition providers around quality and local lanes ([ad70f93](https://github.com/kaitranntt/ccs/commit/ad70f93b1b95edb8d6f029a7613a44f3d2db83ab))

### Bug Fixes

* **api:** constrain preset target defaults ([52ac29e](https://github.com/kaitranntt/ccs/commit/52ac29e7a8a6f7450eb3c1daa357d84d0b03031f))
* **cliproxy:** align AGY preset aliases ([25dd9ab](https://github.com/kaitranntt/ccs/commit/25dd9ab9e14d7c4131c0cace99222346bfb006bc))
* **cliproxy:** attach entitlement evidence to agy failures ([7c4545e](https://github.com/kaitranntt/ccs/commit/7c4545eb1b35914a20762e14fdbd7832828b1324))
* **cliproxy:** cover managed prefix review follow-up ([b6aa6fb](https://github.com/kaitranntt/ccs/commit/b6aa6fb0d4471b68fb795ef4ba2449f2a9f72788))
* **cliproxy:** dedupe variant prefix sync ([eaddfc4](https://github.com/kaitranntt/ccs/commit/eaddfc467fa4380d5c642ad7063442b6edc22efc))
* **cliproxy:** harden pinned routing follow-up ([40c4816](https://github.com/kaitranntt/ccs/commit/40c4816acf36b3b79f13bf32862f7c88ed7debf4))
* **cliproxy:** harden routing prefix sync and UI pinning ([0c10cb6](https://github.com/kaitranntt/ccs/commit/0c10cb6f47d23db33cbce17456d46aee1843b9ae))
* **cliproxy:** keep new live provider models selectable ([34d7044](https://github.com/kaitranntt/ccs/commit/34d70442bf132c6772dc528875377e4d16a221ec))
* **cliproxy:** prefer live entitlement tier in account badges ([7330fdb](https://github.com/kaitranntt/ccs/commit/7330fdbf2830911bcac09826cabf5929cc741be8))
* **cliproxy:** preserve entitlement evidence on agy failures ([b56b58c](https://github.com/kaitranntt/ccs/commit/b56b58c0679d888baa7daa7526f8c06f2a49e16c))
* **cliproxy:** propagate agy entitlement failure metadata ([506b61e](https://github.com/kaitranntt/ccs/commit/506b61eca61381b8717d16b97be94b193e9fcbbf))
* **cliproxy:** refresh non-default gemini quota tokens ([b6fb443](https://github.com/kaitranntt/ccs/commit/b6fb443f572cc5c1bb4e3763abd1aa6fa3ba14e5))
* **cliproxy:** use type-only account provider import ([92a2478](https://github.com/kaitranntt/ccs/commit/92a24786d674ca647caa44db9ee2ce638b843b55))
* **image-analysis:** preserve default runtime deps ([e090c8b](https://github.com/kaitranntt/ccs/commit/e090c8b0d4e65eda3c9b4dcdd4ef0521c96a68b9))
* **image-analysis:** tolerate missing auth init dependency ([2f02ddf](https://github.com/kaitranntt/ccs/commit/2f02ddfb74062aefa4d006ca16bec9a94a2272c7))
* **review:** harden quota retry and tooltip edge cases ([7ac6d0a](https://github.com/kaitranntt/ccs/commit/7ac6d0a4d4a08113b48c008c1850dc6b089b66d1))
* sanitize cliproxy provider model pickers ([0e4677f](https://github.com/kaitranntt/ccs/commit/0e4677f558a2231b7eef7eb3de5c7f0336bbb041))
* **ui:** accept partial raw model records ([42d5724](https://github.com/kaitranntt/ccs/commit/42d5724f34c03c48e1d5d963a85f7cf0a164e9b0)), closes [#941](https://github.com/kaitranntt/ccs/issues/941)
* **ui:** add paused filter locale strings ([3687de0](https://github.com/kaitranntt/ccs/commit/3687de062581b9968b3858b8c51a6cdbb23edcd3))
* **ui:** address provider lane review notes ([5f9bafe](https://github.com/kaitranntt/ccs/commit/5f9bafe9cde488aed26e3c03be8ff84852723e74))
* **ui:** clarify filtered flow viz metrics ([94eda99](https://github.com/kaitranntt/ccs/commit/94eda996e3c0cee8cca50b5cc2c49f7284c7524e))
* **ui:** guard optional raw model fields ([01c1193](https://github.com/kaitranntt/ccs/commit/01c1193a994cc6efc80135590d5bacaf3b78deed)), closes [#941](https://github.com/kaitranntt/ccs/issues/941)
* **ui:** harden provider model alias editing ([92a769d](https://github.com/kaitranntt/ccs/commit/92a769d773a8ec63fd02744aff60d3691df7cf94)), closes [#941](https://github.com/kaitranntt/ccs/issues/941)
* **ui:** preserve requested provider model aliases ([49c4338](https://github.com/kaitranntt/ccs/commit/49c4338f28f5b22ea8834d103582eccd2ad54c62)), closes [#941](https://github.com/kaitranntt/ccs/issues/941)
* **ui:** type shared AGY compatibility lookup ([c078a96](https://github.com/kaitranntt/ccs/commit/c078a9633736faa2b5e45d6a7345d3d2883c6a7b))
* **update:** align no-update dependency injection ([94bcad2](https://github.com/kaitranntt/ccs/commit/94bcad2d1a7c843be5a75aba1140d997f7fcc0bd))
* **update:** harden install verification flow ([a4496ff](https://github.com/kaitranntt/ccs/commit/a4496ff1d944fbe989d1ae18f7f78eb470846731))
* **update:** isolate updater test dependencies ([59e04cb](https://github.com/kaitranntt/ccs/commit/59e04cb56f4d8c8cde6733bc15d3b8d9be94ab9f))
* **update:** target the current CCS installation ([2aaabb2](https://github.com/kaitranntt/ccs/commit/2aaabb2deb03253493a19191690c001113a44040))

### Documentation

* **cliproxy:** clarify gemini and agy tier semantics ([f9c61e0](https://github.com/kaitranntt/ccs/commit/f9c61e0faceae2532798bcfe7ff87d458024c6a3))
* **roadmap:** note cliproxy routing prefix clarity ([b8a8f84](https://github.com/kaitranntt/ccs/commit/b8a8f841536f89386e3452261037f0fdcc389059))
* **roadmap:** record Hugging Face preset support ([414e8c8](https://github.com/kaitranntt/ccs/commit/414e8c80f5ed5f4ed91766de85603abaa195bcbf))

### Code Refactoring

* **ui:** align visible provider flow data ([aedccec](https://github.com/kaitranntt/ccs/commit/aedccec0414fdffac049e4db8130e4f40b2cd744))

### Tests

* **ci:** isolate config env and cli entry fallbacks ([b8aa59a](https://github.com/kaitranntt/ccs/commit/b8aa59a8f0d56e3a2589bf7714d54392a0325dd8))
* **ci:** stop leaking update-command module mocks ([ef75172](https://github.com/kaitranntt/ccs/commit/ef751723f5088ff39184e322cb69aa8186cf2053))
* **cliproxy:** cover managed pinned route hints ([d87a126](https://github.com/kaitranntt/ccs/commit/d87a126938d9d71b3bb0de163e4265111fa09944))
* **cliproxy:** isolate session tracker config env ([4b9fa4e](https://github.com/kaitranntt/ccs/commit/4b9fa4e45787950c73d6b9792d8e1bf2c25a7f5b))
* **ui:** cover paused account flow viz filtering ([7b2743b](https://github.com/kaitranntt/ccs/commit/7b2743b845a822356f18de854ea201c72eb1f542))

## [7.67.0](https://github.com/kaitranntt/ccs/compare/v7.66.1...v7.67.0) (2026-04-09)

### Features

* **cliproxy:** add routing guidance and strategy controls ([6393249](https://github.com/kaitranntt/ccs/commit/6393249111acb54e1d388411c3349dd8ad35267c))
* **cliproxy:** source model pickers from upstream catalogs ([7bbf32a](https://github.com/kaitranntt/ccs/commit/7bbf32ae9a40b7a38ee7dc09e47feb94527c5ec0))
* **dashboard-auth:** clarify remote dashboard login flow ([d130972](https://github.com/kaitranntt/ccs/commit/d13097291604e51d1248ef7cd86ea9f930b7f103))
* **image-analysis:** make MCP-first provisioning self-healing ([64ecd8b](https://github.com/kaitranntt/ccs/commit/64ecd8b3dcf49d7aff1533721d0cc35dd81ed44d))
* **logging:** unify CCS runtime logs and dashboard viewer ([6c799b2](https://github.com/kaitranntt/ccs/commit/6c799b2e58710149deb25399ad25dcb1bf5600d7)), closes [#926](https://github.com/kaitranntt/ccs/issues/926)
* **logs-ui:** redesign the log viewer workspace ([382aa04](https://github.com/kaitranntt/ccs/commit/382aa04ca086938fac0baf66f1380f73c528df98)), closes [#926](https://github.com/kaitranntt/ccs/issues/926)

### Bug Fixes

* **ci:** track dashboard logs components ([4c15a07](https://github.com/kaitranntt/ccs/commit/4c15a072dc07841b8b5544d5d7d24b916dea8cae)), closes [#926](https://github.com/kaitranntt/ccs/issues/926)
* **cliproxy:** preserve saved codex model selections ([a39ded0](https://github.com/kaitranntt/ccs/commit/a39ded0b1a0e589046db204030bf171d94fb1ce7))
* **cliproxy:** remove dead codex reconcile settings arg ([c1d4294](https://github.com/kaitranntt/ccs/commit/c1d429470872ee726d1578797e00aac0f217554d))
* **cliproxy:** streamline sidebar routing control ([fabf3d4](https://github.com/kaitranntt/ccs/commit/fabf3d4ad3cf1643837eded96c2a0b21503c7883))
* **cliproxy:** tighten sidebar routing presentation ([5bb5faa](https://github.com/kaitranntt/ccs/commit/5bb5faa4b79c52f28875336edfc6b57306d36a7a))
* **dashboard:** gate remote read-only auth ([431c22a](https://github.com/kaitranntt/ccs/commit/431c22a16a64448c3ee70078ab403f7cb046c6e5))
* **kiro:** align auth flows with CLIProxyAPIPlus ([0fbea0f](https://github.com/kaitranntt/ccs/commit/0fbea0f33557b17d2e4fd3ef79d1a6230672d295))
* **kiro:** eliminate TOCTOU in token fingerprinting and harden tests ([d95cee1](https://github.com/kaitranntt/ccs/commit/d95cee1e84455a5cc69da106117709b8e16ae5b5))
* **kiro:** harden callback replay and auth detection ([1434c3d](https://github.com/kaitranntt/ccs/commit/1434c3d1e074c70b551ffb8c99c60eb800c4222f))
* **kiro:** harden idc and callback auth paths ([f40d435](https://github.com/kaitranntt/ccs/commit/f40d435a9291bb18c4df2692a0fdfaf55d7087dc))
* **kiro:** parse Builder ID selector dynamically ([325d8d8](https://github.com/kaitranntt/ccs/commit/325d8d861d96ddc3527751e98f7541868a2d46fb))
* **kiro:** prefer scored URL extraction for stderr manual callback ([5b1754a](https://github.com/kaitranntt/ccs/commit/5b1754a32043e667bf778180ac1d859e2c629d2f))
* **kiro:** require fresh token before auth success ([25bcee2](https://github.com/kaitranntt/ccs/commit/25bcee2fa1994fd4e74f81b007a237dfa3937d46))
* **logging:** address review feedback on cleanup and log reader ([42481c0](https://github.com/kaitranntt/ccs/commit/42481c0bb96d69f433a40003c425706e2697153b))
* **logging:** harden log storage and cleanup ([1923fce](https://github.com/kaitranntt/ccs/commit/1923fce2ed103aa6345e2f9d62a647bd7df8f0c0))
* **logs-ui:** stabilize the dashboard log layout ([6e39f33](https://github.com/kaitranntt/ccs/commit/6e39f338ce3a71a06b6f1afedad5a943dde8f297))
* **recovery:** harden shared commands startup recovery ([103f054](https://github.com/kaitranntt/ccs/commit/103f0547c97f513e6d744eef817dd200dbb8bb7f))
* **ui:** gate preset catalog reuse on query readiness ([87f00c5](https://github.com/kaitranntt/ccs/commit/87f00c524d6de26d8bee88d95b9147dd64f84777))
* **ui:** improve Kiro dashboard auth flow ([699b192](https://github.com/kaitranntt/ccs/commit/699b19213720d65d76a28f5a907751210255f956))
* **ui:** keep remote read-only notice accurate ([173149b](https://github.com/kaitranntt/ccs/commit/173149ba718503cb3b5b95ebd3fdc879e0fac9eb))
* **ui:** restore searchable-select dropdown scrolling ([a70eae5](https://github.com/kaitranntt/ccs/commit/a70eae558ef3e43e5ddf2d44315e64a3c1a219cd))
* **ui:** reuse cached cliproxy catalogs for presets ([564ed3d](https://github.com/kaitranntt/ccs/commit/564ed3def716d837e648feec82c340c1442c2878))
* **usage:** block remote refresh without auth ([1603f19](https://github.com/kaitranntt/ccs/commit/1603f1938802d1dd03b8e6b94310012dfc6ba99c))
* **web-server:** block remote dashboard writes ([5fbe731](https://github.com/kaitranntt/ccs/commit/5fbe7313416187b2393fa2bf5e7a7a583aefde5e))

### Documentation

* **dashboard-auth:** clarify remote setup guidance ([bfb8782](https://github.com/kaitranntt/ccs/commit/bfb8782c155ec5a6200c9778e0d2208e69e9313a))
* **help:** add kiro idc flag guidance ([bf5fcfc](https://github.com/kaitranntt/ccs/commit/bf5fcfc034e3e58d6dace28521adc223965520a3))
* **image-analysis:** update MCP-first behavior docs ([5d1880a](https://github.com/kaitranntt/ccs/commit/5d1880abf545410960c264196aba8939568d8d82))
* **kiro:** document idc and callback auth flows ([bb7dbd1](https://github.com/kaitranntt/ccs/commit/bb7dbd108d63cbd762e2df626ca59519f3645ec7))
* **logging:** document structured logs workspace ([548edda](https://github.com/kaitranntt/ccs/commit/548edda58bd88d47be8bd059abed052b2b152497)), closes [#926](https://github.com/kaitranntt/ccs/issues/926)
* **roadmap:** clarify codex runtime fallback behavior ([3f36c09](https://github.com/kaitranntt/ccs/commit/3f36c09064157f4afe306eef9b61d837fde91d66))
* **roadmap:** record upstream cliproxy picker sync ([002b7fe](https://github.com/kaitranntt/ccs/commit/002b7feb1e129947150aa11dbd10d5b7206c543d))

### Code Refactoring

* **dashboard:** use shared token fingerprinting for auth detection ([d4f434a](https://github.com/kaitranntt/ccs/commit/d4f434a0e7c4986778ba183c3d03e6a744fcb23f))

### Tests

* **dashboard-auth:** cover incomplete setup login copy ([a17b82d](https://github.com/kaitranntt/ccs/commit/a17b82d0c34a2b7e5b5d885fe87d09407aa2ca42))
* **logging:** stabilize log reader cache refresh coverage ([a47cf02](https://github.com/kaitranntt/ccs/commit/a47cf022c6a1afe4a87c712d98fa80f2cf76dd02))

## [7.66.1](https://github.com/kaitranntt/ccs/compare/v7.66.0...v7.66.1) (2026-04-07)

### Hotfixes

* update ai-review workflow model budget ([f954f0f](https://github.com/kaitranntt/ccs/commit/f954f0f8ab906c7e03ab27b0aa07c653d04e622c)), closes [#922](https://github.com/kaitranntt/ccs/issues/922)

## [7.66.0](https://github.com/kaitranntt/ccs/compare/v7.65.3...v7.66.0) (2026-04-05)

### Features

* **accounts:** clarify continuity and resume guidance ([57d6a44](https://github.com/kaitranntt/ccs/commit/57d6a44493d1003970afcf53103475cf1ed84d2e)), closes [#904](https://github.com/kaitranntt/ccs/issues/904)
* **auth:** add resume lane diagnostics and recovery ([2830c2a](https://github.com/kaitranntt/ccs/commit/2830c2ae9e6b57ca228d414fb166c83139c205e2))
* **cliproxy:** enrich gemini quota metadata ([a762d8d](https://github.com/kaitranntt/ccs/commit/a762d8dda0fa1c9c3d0d5f8bfa5eae56a0e2bb69))
* **cli:** refresh help and shell completion UX ([24ba2ab](https://github.com/kaitranntt/ccs/commit/24ba2abe10a59e907978dfb7335554c58a5b12e4))
* **dashboard:** show all provider presets by default in Create API Profile modal ([f61cc87](https://github.com/kaitranntt/ccs/commit/f61cc87aa2c3e9b54e07c32a04f503cdfd336ee4)), closes [#892](https://github.com/kaitranntt/ccs/issues/892)
* **image-analysis:** add provider-backed runtime ([813b2dd](https://github.com/kaitranntt/ccs/commit/813b2dd4d054a5c4cb783cfeb3c7d2d65abc4a0c))
* **ui:** show richer gemini quota details ([4c44042](https://github.com/kaitranntt/ccs/commit/4c440423758814e62169779276dbb02f446df831))

### Bug Fixes

* **auth:** harden delayed oauth token registration ([01313a5](https://github.com/kaitranntt/ccs/commit/01313a5a8e6dcaba2331865cd5999d35f7be6334))
* **auth:** keep resume lane warning non-blocking ([1b3528f](https://github.com/kaitranntt/ccs/commit/1b3528f61a91a877f55e2f29e4a3ed7a924f6acb))
* **auth:** wait for polled oauth token persistence ([e2e5d99](https://github.com/kaitranntt/ccs/commit/e2e5d994658a869f6f1baf17997f78b2aa406c07))
* **ci:** restore cursor image analyzer hook import ([748fde6](https://github.com/kaitranntt/ccs/commit/748fde659982450b86b2fbd7b1eff998830234a2))
* classify DuckDuckGo non-result HTML as failure ([a33d3f4](https://github.com/kaitranntt/ccs/commit/a33d3f4481a94e70351b9bb9600521c562578b06))
* **completion:** close shell completion review gaps ([0da7598](https://github.com/kaitranntt/ccs/commit/0da7598a843b4653f9577497e4fd6cd9e99b98fe))
* **completion:** fail closed on backend errors ([ffe3082](https://github.com/kaitranntt/ccs/commit/ffe3082528779c9fc20822d0a22b4a3753f648fc))
* **cursor:** address review feedback and translator edge cases ([27f6a67](https://github.com/kaitranntt/ccs/commit/27f6a675be6f97d6ae41e2729f2146c9b5c8ad9f))
* **cursor:** harden runtime follow-up regressions ([f7ddad6](https://github.com/kaitranntt/ccs/commit/f7ddad6c19353ae3b32e82541526a2149160ee36))
* **cursor:** make bare cursor command useful and harden tool-result translation ([d7b907e](https://github.com/kaitranntt/ccs/commit/d7b907ed9fb16668694e09cc43ed8eada67a4a2a))
* **cursor:** route bare cursor through runtime profile ([2d67f40](https://github.com/kaitranntt/ccs/commit/2d67f40175705eafba2476256f171413696a89a2))
* **cursor:** tear down oversized daemon model responses ([e3074ae](https://github.com/kaitranntt/ccs/commit/e3074ae60e02786a6fb790f9a42d2dbcf0258866))
* **dashboard:** bootstrap cliproxy control panel session ([5432163](https://github.com/kaitranntt/ccs/commit/5432163c8fd9e4afb731277e18a5d55be4319436))
* **dashboard:** clear control panel bootstrap state ([68417c0](https://github.com/kaitranntt/ccs/commit/68417c05a3693ecfaa627181ab1ed9d04e422743))
* **dashboard:** scope auth monitor summary by provider ([5746e43](https://github.com/kaitranntt/ccs/commit/5746e43a36a40e9332709f6234b5d8dcdef183fa))
* **image-analysis:** handle installer lock contention ([afc8b0b](https://github.com/kaitranntt/ccs/commit/afc8b0bb6ea51dd6432bd0f248a4043ab86e2311))
* **image-analysis:** harden runtime and provisioning ([77b488f](https://github.com/kaitranntt/ccs/commit/77b488f8b185e2427a3777f12bc3ed2d8f8cc522))
* **image-analysis:** stabilize mcp config locking ([0347f5a](https://github.com/kaitranntt/ccs/commit/0347f5a973577c0888d9013babbc1fa98304c459))

### Documentation

* add community projects section and fix header link ([dc56e55](https://github.com/kaitranntt/ccs/commit/dc56e55f5280fa262646e6231938dbc41d8cff55))
* **image-analysis:** document managed runtime flow ([6d1c895](https://github.com/kaitranntt/ccs/commit/6d1c8957212cd0a7412ca0e6a888ce70c9adbdfb))
* **readme:** broaden CCS runtime positioning ([0e37033](https://github.com/kaitranntt/ccs/commit/0e37033f339b79b7294887ae7293b6d12d9fdfdf))
* **readme:** preserve opencode contributor guidance ([217e71f](https://github.com/kaitranntt/ccs/commit/217e71f9f8bfbe07202d799fe74d581963fe0f1a))
* **roadmap:** note CLI help and completion refresh ([86b30eb](https://github.com/kaitranntt/ccs/commit/86b30eb9f50bb6fade97ddca604f5e198416fb4d))

### Code Refactoring

* **accounts:** consolidate continuity guidance layout ([d9f78ad](https://github.com/kaitranntt/ccs/commit/d9f78ad490ccff3bab4138ef9d4dbbadfde88611)), closes [#904](https://github.com/kaitranntt/ccs/issues/904)
* **cli:** slim cursor completion imports ([3dcf879](https://github.com/kaitranntt/ccs/commit/3dcf879c9f2ec681f58f3be7a3c13deda666b511))

### Performance Improvements

* **cliproxy:** overlap gemini quota metadata fetches ([c9bbc58](https://github.com/kaitranntt/ccs/commit/c9bbc58dd4de1c116f862119c8f9278e22ff5081))

### Tests

* **cli:** isolate root router completion coverage ([2d5bda7](https://github.com/kaitranntt/ccs/commit/2d5bda7f769a23db3ac5df5d2a56c19113dd996c))
* **cliproxy:** stabilize tunnel localhost binding check ([71c4b18](https://github.com/kaitranntt/ccs/commit/71c4b184f9fad612f3a133b67cd9d7dec895c855))
* **image-analysis:** cover runtime auth and fallback ([f379a40](https://github.com/kaitranntt/ccs/commit/f379a4001f768cb7885fbffb322e63d678244aec))

## [7.65.3](https://github.com/kaitranntt/ccs/compare/v7.65.2...v7.65.3) (2026-04-02)

### Hotfixes

* **ci:** restore default ai review output ([58a0fc4](https://github.com/kaitranntt/ccs/commit/58a0fc43e6ce89be7288bb14d4a20ac4165320f0))

## [7.65.2](https://github.com/kaitranntt/ccs/compare/v7.65.1...v7.65.2) (2026-04-02)

### Hotfixes

* **ci:** clean up ai review reruns and logging ([f47e7ae](https://github.com/kaitranntt/ccs/commit/f47e7ae5a752f20138d6a06b8760143608e18509))
* **ci:** compact ai review comments and switch to glm-5-turbo ([25dddf4](https://github.com/kaitranntt/ccs/commit/25dddf47073673625e51106ab614f8a49ce3b758))
* **ci:** expand ai review comment layout ([0be4ef7](https://github.com/kaitranntt/ccs/commit/0be4ef7a0d747db28f0db029f10a25ca18a6182d))
* **ci:** improve ai review comment formatting ([164a8af](https://github.com/kaitranntt/ccs/commit/164a8af82a9661d2aa3bcd8e2aeca862f343c547))
* **ci:** preserve literal snippet indentation in ai review comments ([f6779a5](https://github.com/kaitranntt/ccs/commit/f6779a503aa13e616d7d642f7c2cc3d769e97efb))
* **ci:** render fenced evidence snippets in ai review comments ([07b4275](https://github.com/kaitranntt/ccs/commit/07b4275543f7431cad349fabccce9d4149089b90))
* **ci:** restore reliable structured ai review comments ([5b9427f](https://github.com/kaitranntt/ccs/commit/5b9427f8a02b583222be0772d2e1b45a5eb43ba7))
* **ci:** separate ai review evidence blocks ([80e2251](https://github.com/kaitranntt/ccs/commit/80e22515b016c4661ed1cdbdd432e5c0068afc03))

## [7.65.1](https://github.com/kaitranntt/ccs/compare/v7.65.0...v7.65.1) (2026-04-02)

### Hotfixes

* **ci:** keep ai review feedback fast and deterministic ([4e05488](https://github.com/kaitranntt/ccs/commit/4e05488c195161792cdc0e74cbd21ed032697a3a))

## [7.65.0](https://github.com/kaitranntt/ccs/compare/v7.64.0...v7.65.0) (2026-04-02)

### Features

* **ci:** bound ai review runtime for large PRs ([7396179](https://github.com/kaitranntt/ccs/commit/7396179c72f6df24e9348b929cd96093e873ce7e)), closes [#880](https://github.com/kaitranntt/ccs/issues/880)
* **codex-dashboard:** add manual long-context controls ([3246c40](https://github.com/kaitranntt/ccs/commit/3246c40319b0f9329c375ae3fe73ee02261579bb))
* **codex-dashboard:** refine control center boundary card ([c1ab210](https://github.com/kaitranntt/ccs/commit/c1ab210095c723b8ae5c6cb88cf5f62867a6e84e))
* **image-analysis:** add dedicated dashboard settings ([9d1d281](https://github.com/kaitranntt/ccs/commit/9d1d281e34392b55f04565c62fa01ee4362c92ff))
* **image-analysis:** resolve backend status per profile ([ae459fc](https://github.com/kaitranntt/ccs/commit/ae459fc3d7ee85bffc43494e7a4d7b06263e6982))
* **image:** add native-read controls and autosave settings ([982ffc5](https://github.com/kaitranntt/ccs/commit/982ffc5895102f03de718cb31f87edc23cfc09e8))
* **ui:** clarify image-analysis target status ([0246e32](https://github.com/kaitranntt/ccs/commit/0246e327feea99f2c2f5e089caa05faddabeb7fb))

### Bug Fixes

* **account-flow:** restore grouped quota hover details ([e852013](https://github.com/kaitranntt/ccs/commit/e8520133f98c58a254e0581de0efd83dd67fec23))
* **ci:** degrade timed-out ai reviews gracefully ([3935574](https://github.com/kaitranntt/ccs/commit/393557449455386b76c48092b125d43eafe37b0b))
* **ci:** repair ai review fallback scope script ([0927651](https://github.com/kaitranntt/ccs/commit/09276518a76d2d42988de4ff31104e4d3d77bc67))
* **ci:** resolve self-hosted Claude path dynamically ([44e2a49](https://github.com/kaitranntt/ccs/commit/44e2a4965017db670a54de3ab1572d7cd47d7b49))
* **ci:** restore prepack script and stabilize cursor timeout ([037ed63](https://github.com/kaitranntt/ccs/commit/037ed632fddec7d92af85001a8e09aa89ba9051c))
* **ci:** use self-hosted Claude binary for ai review ([0883b9a](https://github.com/kaitranntt/ccs/commit/0883b9a8fe3fbda912b136fd8b4577554d263dea))
* **cliproxy:** preserve image-analysis runtime readiness ([3b61673](https://github.com/kaitranntt/ccs/commit/3b61673ad2753e67928e000daa6c396dde72fe80))
* **image-analysis:** preview backend status safely ([d394772](https://github.com/kaitranntt/ccs/commit/d394772f7cf8acd2fb2051bda5aec8bd2622c141))
* **image-analysis:** reject unknown backend mappings ([6656685](https://github.com/kaitranntt/ccs/commit/665668579d39ab5d092ec6aaabca73dec9b9e856))
* **image-analysis:** surface runtime readiness ([1a01c6f](https://github.com/kaitranntt/ccs/commit/1a01c6fc685f105d35bdd59b0647841b3b44c792))
* **packaging:** remove duplicate prepack script ([2844704](https://github.com/kaitranntt/ccs/commit/2844704b5d79b91970e948de24b28ff6be9745dd))
* **packaging:** restore prepack contract ([7dd0edb](https://github.com/kaitranntt/ccs/commit/7dd0edb8cd8e9bd33a692f5b8dffb5f6b64595d0))
* **settings:** restore image tab scrolling and dev websocket routing ([7a783d0](https://github.com/kaitranntt/ccs/commit/7a783d07145443b941f31a767ba0f8abb8fb304f))

### Documentation

* **codex-dashboard:** streamline Codex guidance copy ([7fd2aca](https://github.com/kaitranntt/ccs/commit/7fd2acadbe727a839e44f99081d42687322ee791))
* **readme:** document image-analysis backend visibility ([d40cc60](https://github.com/kaitranntt/ccs/commit/d40cc60a1da520e9591803e07f26864013ada730))
* **roadmap:** note codex long-context controls ([0af38c8](https://github.com/kaitranntt/ccs/commit/0af38c85913f987c9bd6d78a0712fd99965a1ff7))

### Tests

* **image-analysis:** cover resolver and dashboard status ([9277b4a](https://github.com/kaitranntt/ccs/commit/9277b4a087db20e067b163341b3add43c9c49c29))

## [7.64.0](https://github.com/kaitranntt/ccs/compare/v7.63.1...v7.64.0) (2026-04-01)

### Features

* add first-class CCS WebSearch runtime ([e260df7](https://github.com/kaitranntt/ccs/commit/e260df7178dd030efe3d490b4cd9421b386c43c2))
* **cliproxy:** support duplicate-email codex accounts ([c73f338](https://github.com/kaitranntt/ccs/commit/c73f33872abc165aaaba8a240c06cc4ccbb6f5b4))
* **ui:** unify duplicate-email account surfaces ([80341f1](https://github.com/kaitranntt/ccs/commit/80341f18c3c93dd4cdca92f6965136cff90be6f7))
* **websearch:** add managed mcp runtime and provider cooldowns ([7f83e04](https://github.com/kaitranntt/ccs/commit/7f83e041b7fa8907a5d9484acd21ea88edac67e7))
* **websearch:** finish managed third-party rollout ([de7171d](https://github.com/kaitranntt/ccs/commit/de7171d81076ecfd4e5e6474ce062c44a4c8be9a)), closes [#862](https://github.com/kaitranntt/ccs/issues/862)

### Bug Fixes

* bootstrap explicit CODEX_HOME for ccsxp ([b6717c5](https://github.com/kaitranntt/ccs/commit/b6717c55295dadeeff87ec356bc19d7b1b1d3733))
* **ci:** harden ai review output ([4950be7](https://github.com/kaitranntt/ccs/commit/4950be7fc025877dd6744b9c8c87b4714ec49de2))
* **codex:** harden duplicate-email account actions ([22f0916](https://github.com/kaitranntt/ccs/commit/22f091689fadf485d24fc46510f211a489680a2b))
* **codex:** harden native runtime detection ([ca54bad](https://github.com/kaitranntt/ccs/commit/ca54bad2aa774c9dc3de9429d3e1440d179796a7))
* **dashboard:** use shared base time for connection timeline events ([d76ef5b](https://github.com/kaitranntt/ccs/commit/d76ef5bcb30bd87ea487894586978473fcc8fead)), closes [#856](https://github.com/kaitranntt/ccs/issues/856)
* **docker:** harden cliproxy local proxy with auth guard, dynamic port, and body handling ([6471cc5](https://github.com/kaitranntt/ccs/commit/6471cc55d72deeebcbca70d54983b90ae32c999a))
* **docker:** harden proxy with timeout, Bun compat, and test coverage ([27409b7](https://github.com/kaitranntt/ccs/commit/27409b789b29a1d008f621f55aab7eed9861d6d4))
* **docker:** proxy CLIProxy management panel through dashboard to avoid cross-origin errors ([881b061](https://github.com/kaitranntt/ccs/commit/881b061dfec497d7120b15d2045cf8e1a8f04bcc))
* harden ai review comment formatting ([fa37f39](https://github.com/kaitranntt/ccs/commit/fa37f391c17c51c74a5bfe109225caf01798dc96))
* merge existing disallowed tool flags for websearch ([b087c02](https://github.com/kaitranntt/ccs/commit/b087c02738c7e588491f84c8f2318c2ef5b03eca))
* normalize websearch hook output for local providers ([a5d71e3](https://github.com/kaitranntt/ccs/commit/a5d71e35606ebaf16f97d860405800e9a9454659))
* probe Codex config override support directly ([014a844](https://github.com/kaitranntt/ccs/commit/014a844844c76fe5dfce7763ed62e071ee063f58))
* **ui:** normalize grouped account audience order ([498448a](https://github.com/kaitranntt/ccs/commit/498448a43181280dc06035d80b694f7522a1b28a))
* use type-only import in instance manager ([f0cd44e](https://github.com/kaitranntt/ccs/commit/f0cd44e016c2c4a33ad06edcf6b13d8cbf1920bf))
* **websearch:** close review gaps in managed runtime ([cae5b71](https://github.com/kaitranntt/ccs/commit/cae5b710b86a6bd985424cce028a502265051d09))

### Hotfixes

* restore prepack packaging contract ([78f6c5d](https://github.com/kaitranntt/ccs/commit/78f6c5d7156e1fb447e523b355c302a45d5b71bd))

### Documentation

* **architecture:** document codex duplicate-email identity ([be0c597](https://github.com/kaitranntt/ccs/commit/be0c597d255a21a7e935f033dfcc4de4e19c8c8e))

### Code Refactoring

* remove duplicate copilot websearch sync ([2c15304](https://github.com/kaitranntt/ccs/commit/2c153045f33e02cc821a623f6594fb4a6bebb321))

### Tests

* **dashboard:** add regression tests for connection timeline event generation ([4ab5194](https://github.com/kaitranntt/ccs/commit/4ab51945a412321e3e56d0c6860d0121761dcbfa))

## [7.63.1](https://github.com/kaitranntt/ccs/compare/v7.63.0...v7.63.1) (2026-04-01)

### Hotfixes

* **ci:** harden ai review workflow for release PRs ([0b72ecd](https://github.com/kaitranntt/ccs/commit/0b72ecd36f0277f1c5407ff4bbe442305477a60e))

## [7.63.0](https://github.com/kaitranntt/ccs/compare/v7.62.2...v7.63.0) (2026-03-30)

### Features

* add codex dashboard parity ([8c5da9f](https://github.com/kaitranntt/ccs/commit/8c5da9f9e878196356e33a799b921b67e3396252))
* **codex-ui:** surface cliproxy setup guidance ([0ffde4f](https://github.com/kaitranntt/ccs/commit/0ffde4f3a2688ea1864fab3c94d3d020d4b33a93))
* **codex:** add ccsxp runtime shortcut ([deb1e9d](https://github.com/kaitranntt/ccs/commit/deb1e9d71eaa226494ec2f60a52cab20b4b0a546))
* **codex:** add dashboard control center ([b47aa0d](https://github.com/kaitranntt/ccs/commit/b47aa0d28d55260e0db6d0e12791ea4a57fcd54b))
* **codex:** harden runtime targeting and dashboard editing ([9e43bee](https://github.com/kaitranntt/ccs/commit/9e43beec40608f178e502d1751723465189528a9))
* **profiles:** expose codex runtime across surfaces ([f9c1238](https://github.com/kaitranntt/ccs/commit/f9c1238483b0c91d701547c9ad330261a2b51fbb)), closes [#773](https://github.com/kaitranntt/ccs/issues/773)
* **targets:** add native codex runtime target ([8f60820](https://github.com/kaitranntt/ccs/commit/8f60820f3358d878e0f4b9cd448b00690d9b4406)), closes [#773](https://github.com/kaitranntt/ccs/issues/773)

### Bug Fixes

* **ai-review:** increase max-turns to 40 and add hotfix commitlint type ([04c4d61](https://github.com/kaitranntt/ccs/commit/04c4d61018ec7b108d8b93d0d11a549a0cd52c71))
* **ai-review:** revert to single-job review with enhanced prompt ([f98530b](https://github.com/kaitranntt/ccs/commit/f98530bc73866f57cd0ba4b51d0515eda707e039))
* **cliproxy:** narrow legacy gemini alias cleanup ([c4428e4](https://github.com/kaitranntt/ccs/commit/c4428e4176bb7244d597b5f75240aa39bf536bbf))
* **cliproxy:** preserve manual high-minor alias clusters ([6707b7d](https://github.com/kaitranntt/ccs/commit/6707b7d5b470375c3068950894fb7b96b8fa4bf4))
* **cliproxy:** prune stale control panel alias clusters ([061cd96](https://github.com/kaitranntt/ccs/commit/061cd9679fc56a8a0711877f57eebcd998df10b6))
* **codex:** align cliproxy guidance with runtime behavior ([bd1ff02](https://github.com/kaitranntt/ccs/commit/bd1ff02521ac75d6e06b336bc9030da084d6a8df))
* **codex:** align runtime compatibility and dashboard types ([3c52b1a](https://github.com/kaitranntt/ccs/commit/3c52b1ab6d0ef8fccff14113c40c287320d5b547))
* **codex:** harden dashboard config editing ([ebc9acf](https://github.com/kaitranntt/ccs/commit/ebc9acf8e41fccc9ae968d40be75f1f7e4382929))
* **codex:** harden native alias launches ([f47ab48](https://github.com/kaitranntt/ccs/commit/f47ab484f3d8abd12a6d771a21beb9d50403a014))
* **codex:** restore version context for override failures ([643bd2a](https://github.com/kaitranntt/ccs/commit/643bd2a5ac10e63c7ca4e0e91a856145f1935455))

### Documentation

* **codex:** clarify ccsxp and cliproxy setup ([318b57b](https://github.com/kaitranntt/ccs/commit/318b57bedc12f5c3602916418b8ce08bb46d4218))
* **codex:** document control center behavior ([ca98184](https://github.com/kaitranntt/ccs/commit/ca981847b2ee889b350c78c0e691aec56cd7787d))
* **codex:** document runtime target support ([da4bb29](https://github.com/kaitranntt/ccs/commit/da4bb29fd71434f2e9179a34c37257c2c5e9df30)), closes [#773](https://github.com/kaitranntt/ccs/issues/773)

### Styles

* **codex:** use monochrome sidebar icon ([09b7f66](https://github.com/kaitranntt/ccs/commit/09b7f66c0b69b31d2662f102fe2fb2f928cb24cd))

### Tests

* **codex:** cover alias passthrough gaps ([c0f0f17](https://github.com/kaitranntt/ccs/commit/c0f0f173e07124c0875940e0d430dacadf38704c))

## [7.62.2](https://github.com/kaitranntt/ccs/compare/v7.62.1...v7.62.2) (2026-03-29)

### Bug Fixes

* **ai-review:** increase max-turns to 40 and add hotfix commitlint type ([bcbf8a2](https://github.com/kaitranntt/ccs/commit/bcbf8a236d0f90b3f7b85348e01bde95da03f42b))
* **ai-review:** revert to single-job review with enhanced prompt ([fb8b26c](https://github.com/kaitranntt/ccs/commit/fb8b26c6947c5c0359cdc6898a5a6f17fdfef703))

## [7.62.1](https://github.com/kaitranntt/ccs/compare/v7.62.0...v7.62.1) (2026-03-29)

### Bug Fixes

* **ai-review:** bump orchestrator max-turns 20→25 for large PR merges ([106067f](https://github.com/kaitranntt/ccs/commit/106067fefb99844a0ee83b79cccc803fe660e664))
* **ai-review:** increase turn budget and improve fallback extraction ([1c4fc96](https://github.com/kaitranntt/ccs/commit/1c4fc96d33413efdae0223a3b7db0cab2a14bcec))

## [7.62.0](https://github.com/kaitranntt/ccs/compare/v7.61.1...v7.62.0) (2026-03-29)

### Features

* **ai-review:** parallel subagent review pipeline ([ce023aa](https://github.com/kaitranntt/ccs/commit/ce023aa8f40bad7b6851779700bf59b8739cfb5c)), closes [#837](https://github.com/kaitranntt/ccs/issues/837)
* **ai-review:** workflow-level parallel review jobs ([8c371e7](https://github.com/kaitranntt/ccs/commit/8c371e73a38389b579fb2ecbfea20c1f4b8d630a)), closes [#843](https://github.com/kaitranntt/ccs/issues/843)

### Bug Fixes

* **ai-review:** address all review findings — restore allowedTools, add fallbacks ([36e8cc4](https://github.com/kaitranntt/ccs/commit/36e8cc47d934ca798d92637079ba39d101eba164))
* **ai-review:** use printf for subagent prompt outputs, match existing pattern ([d2510fc](https://github.com/kaitranntt/ccs/commit/d2510fc860628ea8c10c30da8d9fb7a6d2d86297))
* **auth:** signal auth-required for remote access in /api/auth/check ([5a09547](https://github.com/kaitranntt/ccs/commit/5a09547532754da21faacb5351cc3538a9db05a4))
* **cliproxy:** align gemini 3.1 preset compatibility ([5ac91e0](https://github.com/kaitranntt/ccs/commit/5ac91e0cac6cb4acc9f26f9461943788d5c43ae6))
* **cliproxy:** align gemini flash pricing and dashboard imports ([2423864](https://github.com/kaitranntt/ccs/commit/2423864817bd045e04f76f5905c2e09c6748a687))
* **cliproxy:** centralize gemini compatibility and fallback hints ([2251312](https://github.com/kaitranntt/ccs/commit/2251312411f1e2b8f04844efa4a6ca2a07229a4e))
* **cliproxy:** guard binary install against ETXTBSY when running ([5eac9c5](https://github.com/kaitranntt/ccs/commit/5eac9c584ac67382c71510489578644c81ed01f8))
* **cliproxy:** resolve gemini presets from live models ([934e6ab](https://github.com/kaitranntt/ccs/commit/934e6ab52b7bc80dd3876b6fe7c75803f0392d82))
* **docker:** address review findings — PID guard, deleteBinary guard, blocked fallback ([7d410b2](https://github.com/kaitranntt/ccs/commit/7d410b26d04b72bfa77b98334a8b3fcbb4dfb3d8))
* **docker:** address review findings — test, docs, bcrypt path ([cd09b84](https://github.com/kaitranntt/ccs/commit/cd09b845daed75dde6fd4248fac8450837974513))
* **docker:** include docker/ assets in npm package ([50b5660](https://github.com/kaitranntt/ccs/commit/50b56600ddc38b85c9308cb9d541b15720aaf5ce)), closes [#829](https://github.com/kaitranntt/ccs/issues/829)
* **docker:** print auth setup reminder after remote deployment ([59be7f8](https://github.com/kaitranntt/ccs/commit/59be7f8682c4be95886728555fd1567ea1faf7cf))
* **docker:** register session lock from bootstrap for proxy discovery ([a0f28f8](https://github.com/kaitranntt/ccs/commit/a0f28f8807dff5036f94183e8f12cd0cd36505af))
* **docker:** use export for remote env vars and increase build timeout ([60167d3](https://github.com/kaitranntt/ccs/commit/60167d3f2b3a1d94392d888e7cc5859372beac39)), closes [#832](https://github.com/kaitranntt/ccs/issues/832)
* **docker:** use HTTP-first proxy detection in health checks ([d7a80ed](https://github.com/kaitranntt/ccs/commit/d7a80ed38d61204479bd8fb971b656a35e705d42))
* **docker:** wrap session registration in try-catch and narrow ETXTBSY guard ([e8b7ac7](https://github.com/kaitranntt/ccs/commit/e8b7ac730f108a2ef9393767e070c7703c16e557))
* harden CCS backlog sync pagination and recovery ([e661772](https://github.com/kaitranntt/ccs/commit/e6617726cb9fcbeefd64d57d3f001fe381099607))
* **ui:** hide version badge when API fails instead of showing v5.0.0 ([efe6953](https://github.com/kaitranntt/ccs/commit/efe6953da06263d4fdb03468f0c0f7385523cb17))
* **ui:** redirect to login when auth check fails from remote access ([e9fceed](https://github.com/kaitranntt/ccs/commit/e9fceed80716b4e032e4ad0eca65b5fb005f02ae))
* **websearch:** avoid partial settings-hook migration ([fbbdd80](https://github.com/kaitranntt/ccs/commit/fbbdd8083028ee6eb43d2f939212e8f63910453c))
* **websearch:** harden settings-profile hook setup ([0e6965d](https://github.com/kaitranntt/ccs/commit/0e6965d205c06667e9fe43205d8fadcfa4278aa7))
* **websearch:** install hook for settings profiles ([39a3e9d](https://github.com/kaitranntt/ccs/commit/39a3e9dfc09eacddd1ca2e11fbc8ea7585e64bbb))
* **websearch:** restore hook recovery and force register ([0821c68](https://github.com/kaitranntt/ccs/commit/0821c68559d7dac6dc3cd0bd1062f0b2889fc774))

### Documentation

* **docker:** add post-deployment guide for auth, token migration, and verification ([c26efae](https://github.com/kaitranntt/ccs/commit/c26efae72ad664f9c8b5a85168704bc7fee7533f)), closes [#841](https://github.com/kaitranntt/ccs/issues/841)
* **docker:** use docker cp for token migration and fix bcrypt command ([f8c43a3](https://github.com/kaitranntt/ccs/commit/f8c43a374d68b1e8bd1c4fd18b1ab1a903116a60))

### Styles

* **ai-review:** add emojis to orchestrator output format sections ([86f45c2](https://github.com/kaitranntt/ccs/commit/86f45c22741841db64937bc98b9a5d211340f2e4))

### Code Refactoring

* **ai-review:** matrix strategy + orchestrator AI merge ([97f07c2](https://github.com/kaitranntt/ccs/commit/97f07c2b121b85ad05a931b16fe2f348755a5e55))
* **ai-review:** remove redundant allowedTools, enforce subagent dispatch ([d67fa35](https://github.com/kaitranntt/ccs/commit/d67fa350b8bd1c2ada0577c22a70908284adcb1c))
* **ai-review:** switch --allowedTools to --tools for actual restriction ([53ad283](https://github.com/kaitranntt/ccs/commit/53ad2836c4cedca8dcc819f003f1526b2cc0a31c))

### Tests

* **auth:** verify effectiveAuthRequired logic for remote vs local access ([a23caf0](https://github.com/kaitranntt/ccs/commit/a23caf00513411132a7d28b12f40a51476a69790))
* **docker:** add regression test for bundled asset availability ([13254f2](https://github.com/kaitranntt/ccs/commit/13254f28a6d6170fe0a46ed2ed2326441cc2d717))
* **docker:** add tests for health check port detection and ETXTBSY guard ([a517c50](https://github.com/kaitranntt/ccs/commit/a517c506cbcb7e6993f458b24048c9ccccb9faf5))
* **docker:** update executor tests for export syntax and build timeout ([cbe93d4](https://github.com/kaitranntt/ccs/commit/cbe93d4f7643091fbdc1c0073c5e05bef4b2eac5))

## [7.61.1](https://github.com/kaitranntt/ccs/compare/v7.61.0...v7.61.1) (2026-03-28)

### Bug Fixes

* **ci:** require explicit /review command for AI review reruns ([3ebf17f](https://github.com/kaitranntt/ccs/commit/3ebf17f1701f9d7fd60aade0ec6bd8147b91e761))

## [7.61.0](https://github.com/kaitranntt/ccs/compare/v7.60.1...v7.61.0) (2026-03-27)

### Features

* **docker:** add integrated deployment commands ([23f767b](https://github.com/kaitranntt/ccs/commit/23f767b0c557affd2cdaaf20226a530db252b558)), closes [#812](https://github.com/kaitranntt/ccs/issues/812)

### Bug Fixes

* **docker:** bound blocking command execution ([5ad4303](https://github.com/kaitranntt/ccs/commit/5ad430334539356b2a5805ee02d7178d3ee0aa16))
* **websearch:** align provider validation metadata ([dff40b5](https://github.com/kaitranntt/ccs/commit/dff40b5e24bd26cb103fae53e7746456bf38d996))
* **websearch:** restrict dashboard secrets routes ([4ccc3ed](https://github.com/kaitranntt/ccs/commit/4ccc3edcbbfeb5d148c9ff505f9cad26c80f441b))

### Documentation

* **docker:** document integrated deployment flow ([6ac8f59](https://github.com/kaitranntt/ccs/commit/6ac8f59a78675c35dd6be3cd76365ce16101716c)), closes [#812](https://github.com/kaitranntt/ccs/issues/812) [#812](https://github.com/kaitranntt/ccs/issues/812)

### Tests

* **docker:** cover docker subcommand rendering paths ([5b9954c](https://github.com/kaitranntt/ccs/commit/5b9954cfad2dfdb8c7857083252ff6eb512db4c1))
* **websearch:** assert parser-layer null body errors ([1fd7f81](https://github.com/kaitranntt/ccs/commit/1fd7f8122181f84eb585f7809e75325462729b8b))

## [7.60.1](https://github.com/kaitranntt/ccs/compare/v7.60.0...v7.60.1) (2026-03-27)

### Hotfixes

* add hotfix commit type to semantic-release config ([0473f63](https://github.com/kaitranntt/ccs/commit/0473f636237a4e7e808a576eb75525d7ed8d929b))
* **ci:** fix AI review performance — bypass permissions, cap turns, reduce thinking ([0a7fef0](https://github.com/kaitranntt/ccs/commit/0a7fef0368b10701737d0f54f50fd1b4ed5d46f6)), closes [#818](https://github.com/kaitranntt/ccs/issues/818)
* **ci:** increase max-turns to 30 and enforce Write tool for review output ([179fa33](https://github.com/kaitranntt/ccs/commit/179fa338b8da2b62853931218df8ce1ed34836dd)), closes [#818](https://github.com/kaitranntt/ccs/issues/818)

## [7.60.0](https://github.com/kaitranntt/ccs/compare/v7.59.0...v7.60.0) (2026-03-27)

### Features

* **websearch:** manage provider API keys in dashboard ([20c48c6](https://github.com/kaitranntt/ccs/commit/20c48c61050c9c15b07df1a996ec1d3b73328217))

### Bug Fixes

* **settings:** prevent config panel flash on refresh ([5782edf](https://github.com/kaitranntt/ccs/commit/5782edf62706427c985d03f115726ca765c369ac))
* **websearch:** narrow provider key handlers for build ([a3ca496](https://github.com/kaitranntt/ccs/commit/a3ca496fa814e7c711b610ced79694e9489dfa4f))
* **websearch:** narrow provider key summary access ([d883951](https://github.com/kaitranntt/ccs/commit/d883951c9e4738b33bc057fe9230727a9bf5c25f))

### Documentation

* **websearch:** document inline provider key flow ([f462b9f](https://github.com/kaitranntt/ccs/commit/f462b9fed107e506488356dc7384fa22485e40cf))

### Styles

* **ui:** format files for enforced prettier rules ([1c8246a](https://github.com/kaitranntt/ccs/commit/1c8246a60edfff8ca9ea03793505bb8d9e4a6b23))

### CI

* **ai-review:** enable show_full_output for review visibility ([6dca069](https://github.com/kaitranntt/ccs/commit/6dca069c7d4642b24c2270cd51e0f0c0d2c900d8))
* **ai-review:** remove custom Claude CLI path to prevent version drift ([0334f70](https://github.com/kaitranntt/ccs/commit/0334f70991a926dfff5b097284f12bf2aa04e3d1)), closes [#810](https://github.com/kaitranntt/ccs/issues/810)
* **ai-review:** upgrade model, add fallback extraction, preserve logs ([bb5862f](https://github.com/kaitranntt/ccs/commit/bb5862f0a01772f975cc95bc2b6581c8b1bb454a))

## [7.59.0](https://github.com/kaitranntt/ccs/compare/v7.58.0...v7.59.0) (2026-03-26)

### Features

* **auth:** let power user mode skip Gemini auth gate ([ce4401e](https://github.com/kaitranntt/ccs/commit/ce4401e84ea11a0b5518b9eca4d4a44a304e8878))

### Bug Fixes

* **ci:** resolve flaky api-command module resolution and migrate to self-hosted runner ([41a31c8](https://github.com/kaitranntt/ccs/commit/41a31c8a4ffb49c6cf046de0b437961f4422a4e1))
* **cliproxy:** harden gemini quota error fallbacks ([31b7d45](https://github.com/kaitranntt/ccs/commit/31b7d45b58a6929f168a25f724c56ccbd1dcc9fa))
* **cliproxy:** preserve auth-file source fallback ([63c8ec5](https://github.com/kaitranntt/ccs/commit/63c8ec5d7c8d5830bd514f812081fb31804564a8))
* **cliproxy:** preserve explicit Claude long-context intent ([c05189b](https://github.com/kaitranntt/ccs/commit/c05189b4b1e2d90ee6bb88a4024feef1f8dbe1b1)), closes [#789](https://github.com/kaitranntt/ccs/issues/789)
* **cliproxy:** restore live monitor provider attribution ([368a625](https://github.com/kaitranntt/ccs/commit/368a625d925a176a42e426d363aeb355a4f0657b))
* **cliproxy:** scope account stats by provider ([75ccbb3](https://github.com/kaitranntt/ccs/commit/75ccbb3ad13ee6d8b84ad7ef3aacb6b8994256c5))
* **cliproxy:** surface gemini quota failure details ([99f78f1](https://github.com/kaitranntt/ccs/commit/99f78f156a8bc329ee6524f2113a5fc643c0e131))
* **cliproxy:** surface quota metadata in CLI ([19f6b3c](https://github.com/kaitranntt/ccs/commit/19f6b3c4e65c514b42b331380065f34db9dc5405))
* **tests:** stabilize command help CI validation ([be4ba13](https://github.com/kaitranntt/ccs/commit/be4ba13e9654f177a417a7956228653efe1a6210))
* **ui:** clarify antigravity and gemini power mode copy ([4d49d13](https://github.com/kaitranntt/ccs/commit/4d49d13931537ad32a5588880e09212696354609))
* **ui:** constrain bounded code editor scroll viewports ([aeab284](https://github.com/kaitranntt/ccs/commit/aeab2840de0c69122c49dba1b6f286597e4d606a))
* **ui:** harden power user mode auth checks ([604f9fc](https://github.com/kaitranntt/ccs/commit/604f9fc78a72b6ee76cf0ecc44ea91a372c4a114))
* **ui:** resolve cliproxy account stats by provider ([1edc103](https://github.com/kaitranntt/ccs/commit/1edc10362adf1be3a6f06041929e2548614c73a6))
* **ui:** restore scrolling in bounded code editors ([44d4df1](https://github.com/kaitranntt/ccs/commit/44d4df12544a02572e5c1c68f70f73c80795fb29))

### Tests

* **cliproxy:** cover Claude long-context parity flows ([5e11bba](https://github.com/kaitranntt/ccs/commit/5e11bba5149d061879002ad88ca91f404c09522a)), closes [#789](https://github.com/kaitranntt/ccs/issues/789)
* **ui:** cover bounded code editor scroll mode ([823cf96](https://github.com/kaitranntt/ccs/commit/823cf96e7788cc9f69d65b97688c56df84e6b632))
* **ui:** cover bounded editor height contracts ([92d067d](https://github.com/kaitranntt/ccs/commit/92d067d0622c9a02c11b4b20b7416901a0929b4f))
* **ui:** cover Gemini power user auth bypass ([a15c729](https://github.com/kaitranntt/ccs/commit/a15c729079643344d130d4d522de3e874b6d0d03))

### CI

* **ai-review:** add --bare flag to prevent CLAUDE.md pollution in reviews ([57019c1](https://github.com/kaitranntt/ccs/commit/57019c1105e92f74ca4e556c7a3a03f7468b853e))

## [7.58.0](https://github.com/kaitranntt/ccs/compare/v7.57.2...v7.58.0) (2026-03-26)

### Features

* **channels:** auto-enable official Claude channels ([a97fc42](https://github.com/kaitranntt/ccs/commit/a97fc42b10d3ce783b2bf84bce499b7bb9dca141))
* **channels:** auto-enable official discord plugin ([4bce155](https://github.com/kaitranntt/ccs/commit/4bce1559dd96971c3ad34a5fab4ab22d7663fc1e)), closes [#783](https://github.com/kaitranntt/ccs/issues/783)
* **channels:** support telegram and imessage ([6f1f032](https://github.com/kaitranntt/ccs/commit/6f1f032c6393f2dbb61452f56b331bbc05c1f051)), closes [#783](https://github.com/kaitranntt/ccs/issues/783)

### Bug Fixes

* **channels:** reject oversized official channel tokens ([ec1417a](https://github.com/kaitranntt/ccs/commit/ec1417ab7c1144491a277c3248d947e30ab02dc3))
* **cliproxy:** harden corrupted registry recovery ([313e244](https://github.com/kaitranntt/ccs/commit/313e244302c174fb9fa84706d6e1ab0003bf2fc5))
* **cliproxy:** log clean registry recovery and harden email fallback ([63f4862](https://github.com/kaitranntt/ccs/commit/63f48622e54bb84fd320982f2fe0930ad80ff6f1))
* **cliproxy:** recover corrupted account registries from token files ([d53873b](https://github.com/kaitranntt/ccs/commit/d53873bddd358e89121166c89e4f95d2cfcf8ac3))
* **docker:** add index annotations to link GHCR package to repository ([9c0dd34](https://github.com/kaitranntt/ccs/commit/9c0dd3489629014f2fa716a7854ac7dc39a7bb56))
* **settings:** stabilize websearch and quota checks ([3ea9d2f](https://github.com/kaitranntt/ccs/commit/3ea9d2fc346ca7c3cd64785b067aeeefbe2145b5))

### Documentation

* **channels:** document official Claude channel support ([58891d3](https://github.com/kaitranntt/ccs/commit/58891d368d95ca6a48aed6e2de00257462b89de4))

### Styles

* **channels:** format official token guard for ci parity ([3c638b0](https://github.com/kaitranntt/ccs/commit/3c638b02bacd325c793d35d929d3565f34c08692))
* format official channel files ([0e2f478](https://github.com/kaitranntt/ccs/commit/0e2f47802bf112e925f1cf8ce9156b1ce0602de7))

### Tests

* isolate shared-state test suites for CI stability ([3af5542](https://github.com/kaitranntt/ccs/commit/3af554275e2829669dfb82bd30f94575302928f1))

## [7.57.2](https://github.com/kaitranntt/ccs/compare/v7.57.1...v7.57.2) (2026-03-25)

### Bug Fixes

* **ci:** reuse runner bun for AI review ([0e2a2a0](https://github.com/kaitranntt/ccs/commit/0e2a2a01521f18a7206c291a3c8cb815da17e6a8))
* **config:** close dashboard secret redaction gaps ([e983bed](https://github.com/kaitranntt/ccs/commit/e983bed1da27d0b2eeca29f4d9a7980b7d0ebc91))
* **config:** harden dashboard config and rollback paths ([37251cd](https://github.com/kaitranntt/ccs/commit/37251cd1f855f0f6235db952e429a0cde8fcc11d))
* **config:** preserve hidden auth secrets and block scalars ([6ccf53e](https://github.com/kaitranntt/ccs/commit/6ccf53ec7dc88a1297bfbb9518a937cdf2b6348d))
* **shared-manager:** allow external claude symlink chains ([05dea22](https://github.com/kaitranntt/ccs/commit/05dea222382c06f6bc2d1ee229b0854e7a708c07))
* **shared-manager:** guard inverse shared symlink loops ([c923f51](https://github.com/kaitranntt/ccs/commit/c923f51cf5e29df77b3af54dbfbc95893ee67fb5))

## [7.57.1](https://github.com/kaitranntt/ccs/compare/v7.57.0...v7.57.1) (2026-03-24)

### Bug Fixes

* **ci:** dedupe AI review comments ([d24efd2](https://github.com/kaitranntt/ccs/commit/d24efd2863e71a7663de8e046e41982b20c7eb27))
* **ci:** export review runtime paths at run time ([ba41008](https://github.com/kaitranntt/ccs/commit/ba4100878c7d6a268cfc2fec422f01f9dd4aa460))

## [7.57.0](https://github.com/kaitranntt/ccs/compare/v7.56.0...v7.57.0) (2026-03-24)

### Features

* add explicit droid runtime alias surface ([160be31](https://github.com/kaitranntt/ccs/commit/160be319d0b1982c05dc2984673a81aa6ec245b5))
* **cliproxy:** allow optional provider nicknames ([bdb7ac2](https://github.com/kaitranntt/ccs/commit/bdb7ac2937d144dc2564d09b01e717e8a4bc44eb))
* make cliproxy provider nicknames optional by default ([4df08f6](https://github.com/kaitranntt/ccs/commit/4df08f6d99e3006107a0431609b7651f13ebc083))
* **websearch:** add real provider chain ([6c7d215](https://github.com/kaitranntt/ccs/commit/6c7d215ecc7d2a986e922400eb6787f1b402931d))

### Bug Fixes

* **auth:** verify polled oauth account persistence ([09eb01f](https://github.com/kaitranntt/ccs/commit/09eb01f16e0a374198031079d22eeae2a3135810))
* **ci:** close release automation edge cases ([e06e13a](https://github.com/kaitranntt/ccs/commit/e06e13ad0db514ef6b3ef3af2062cc2ee28a2170))
* **ci:** harden release automation workflows ([5616c68](https://github.com/kaitranntt/ccs/commit/5616c68471c052e68e65578ac3a48c8998036c86))
* **ci:** publish docker image from releases ([5c1553e](https://github.com/kaitranntt/ccs/commit/5c1553e6f5722e5f61780a389d4729428529fdc3))
* **dashboard:** refine api profile quick start state ([aef58d6](https://github.com/kaitranntt/ccs/commit/aef58d66ce69777cf8aba6f43f615560ef820b62))
* **dashboard:** remove the unnecessary blank on api config page ([3a7e778](https://github.com/kaitranntt/ccs/commit/3a7e778bec13869bf03d3c4c39d2934473eb9fce))
* harden droid runtime alias resolution ([1f667b5](https://github.com/kaitranntt/ccs/commit/1f667b5953297189dfe8e88112088b11641ba676))
* **ui:** guard auth success on registered account ([a3478ac](https://github.com/kaitranntt/ccs/commit/a3478ace447d0a9c99c8266e3c0723c0ae29d5f5))
* **ui:** remove stale dashboard footer gap ([0d59c7a](https://github.com/kaitranntt/ccs/commit/0d59c7a3af35ff5af6768d5d4083abf1ab29d8af))

### Documentation

* **repo:** add security reporting and issue routing ([#769](https://github.com/kaitranntt/ccs/issues/769)) ([185f7f4](https://github.com/kaitranntt/ccs/commit/185f7f469e62a0a86aebf1d9fe98aaa101a3a19b))

### Styles

* **auth:** format cliproxy auth route ([06d098a](https://github.com/kaitranntt/ccs/commit/06d098ae0e981abd9b0dd15397cdac297e7bfc22))
* **websearch:** format routes after rebase ([83dab7f](https://github.com/kaitranntt/ccs/commit/83dab7fea7ed906da93ea4946fb41c1cec829547))

### Tests

* **cliproxy:** cover optional nickname auth flows ([8347049](https://github.com/kaitranntt/ccs/commit/834704938db14635b87e3a2e337a9d75e3f43d6b))
* **dashboard:** cover api profile quick start states ([10f2845](https://github.com/kaitranntt/ccs/commit/10f284585f1473f3198288bc0419c58b058442b3))

## [7.56.0](https://github.com/kaitranntt/ccs/compare/v7.55.0...v7.56.0) (2026-03-22)

### Features

* **cliproxy:** add dedicated ai providers workspace ([50c55bb](https://github.com/kaitranntt/ccs/commit/50c55bb108dd03e7e9443a7abea9e2c48b7f3e64))
* **cliproxy:** redesign ai providers configuration ([77fcd45](https://github.com/kaitranntt/ccs/commit/77fcd45173d4f6074503da33af15c986843b1f91)), closes [#649](https://github.com/kaitranntt/ccs/issues/649)
* **profiles:** add cliproxy api profile bridge ([287691f](https://github.com/kaitranntt/ccs/commit/287691fa04d3aba136650c55fa13644fe31ef76c)), closes [#649](https://github.com/kaitranntt/ccs/issues/649)

### Bug Fixes

* **cliproxy:** remove control panel setup notice ([e2ca9c2](https://github.com/kaitranntt/ccs/commit/e2ca9c240727893a6ec10fa25c00c0e8ada88623)), closes [#649](https://github.com/kaitranntt/ccs/issues/649)
* **codex:** recover unsupported live model switches ([9fac214](https://github.com/kaitranntt/ccs/commit/9fac214051a2e30fd58ea7341ebd7f9de112f426))
* **management:** harden marketplace state transitions ([fc02c4b](https://github.com/kaitranntt/ccs/commit/fc02c4b9682af6205735bdfd221dfb668f1821ae))
* **management:** localize marketplace registry per instance ([54ea36f](https://github.com/kaitranntt/ccs/commit/54ea36fd18955778a8c15bd825df22618593d9ed))
* **management:** serialize lifecycle maintenance paths ([36e8ed5](https://github.com/kaitranntt/ccs/commit/36e8ed5d878be13b1dfd7ea1a6e890d575a09360))
* **management:** serialize marketplace registry reconciliation ([68a5d17](https://github.com/kaitranntt/ccs/commit/68a5d17327e4fc5e3bd5c9fcb48e1bcd96dd92c4))
* restore parallel-safe validate pipeline ([04fd8ff](https://github.com/kaitranntt/ccs/commit/04fd8ff01997c7475cab0247f8e2ab86e9f0588c))
* stabilize validate pipeline and cliproxy route tests ([0d90f04](https://github.com/kaitranntt/ccs/commit/0d90f04f3e45c3bc90a74bb8b48677c4d0dd0376))
* **ui:** reflect cliproxy preset plan tiers ([ef36ad4](https://github.com/kaitranntt/ccs/commit/ef36ad4600282aae7680316a084ec1eb2d74ab63))
* **ui:** sync codex model catalog defaults ([2114a4b](https://github.com/kaitranntt/ccs/commit/2114a4b96e1b78e8e4f5a00bd29a866cd147348e))

### Documentation

* **architecture:** document marketplace registry ownership ([242a095](https://github.com/kaitranntt/ccs/commit/242a095edb9e32a51fa3f487e9c1fd98dc127e1f))
* **cliproxy:** document api profile bridge flow ([7d87cfa](https://github.com/kaitranntt/ccs/commit/7d87cfa4482de239a3c2a23257885a882ef53192)), closes [#649](https://github.com/kaitranntt/ccs/issues/649) [#649](https://github.com/kaitranntt/ccs/issues/649)

### Tests

* **management:** cover plugin layout sync lock ([fab0501](https://github.com/kaitranntt/ccs/commit/fab05011f19f5059a09292d2fbb09e8b5cc62f24))

## [7.55.0](https://github.com/kaitranntt/ccs/compare/v7.54.0...v7.55.0) (2026-03-17)

### Features

* add dashboard host binding option ([553f8ac](https://github.com/kaitranntt/ccs/commit/553f8ac1e51cd128bb8605cce68447a5fe015817))
* **cursor:** add Anthropic daemon endpoint ([daad5d1](https://github.com/kaitranntt/ccs/commit/daad5d1f50c20ffa9a7bd886c0ddcf25e00e84f3))
* deprecate GLMT user-facing surfaces ([5525098](https://github.com/kaitranntt/ccs/commit/55250984002a0021890f47097a540b5bc6122f26))
* **novita:** add Novita AI provider preset ([a1a8cad](https://github.com/kaitranntt/ccs/commit/a1a8cad2b3e7a0129c5972be70775961f6777f36))
* **ui:** add searchable model comboboxes ([d056878](https://github.com/kaitranntt/ccs/commit/d05687853990dd5c4f3474195bcad8cd46481d82))
* **ui:** improve API profile provider selector UX ([0337a32](https://github.com/kaitranntt/ccs/commit/0337a32d991ae2099447e43f67f6d14bf4267e25))

### Bug Fixes

* add novita preset icon asset ([eeadff3](https://github.com/kaitranntt/ccs/commit/eeadff3e52fe5f154ad647a990fef8603be2bc51))
* align dashboard host warnings with effective bind ([dcc6747](https://github.com/kaitranntt/ccs/commit/dcc67477ecdc1166413236d434fbb9485f9d9e27))
* **cliproxy:** make codex defaults free-plan safe ([551591e](https://github.com/kaitranntt/ccs/commit/551591ef18eda0a3cbd5a9ed99c5865d2bb20dfb))
* **cliproxy:** remap codex haiku fallback on free plans ([e6b3635](https://github.com/kaitranntt/ccs/commit/e6b363524bc28c5b9d3b1b675cb2cf9f749a936a))
* **commands:** follow up command routing hardening regressions ([d524650](https://github.com/kaitranntt/ccs/commit/d52465058e3d8f06895e70d74183cbb0d8700312))
* correct novita preset endpoint and asset handling ([94fa96a](https://github.com/kaitranntt/ccs/commit/94fa96aa81f83a29aedde2abaa369ebe33d58f8f))
* **cursor:** avoid empty user turns after tool results ([b068fb2](https://github.com/kaitranntt/ccs/commit/b068fb26214b60e3e11ae6dba92294bef7d3c05e))
* **cursor:** harden anthropic daemon contract handling ([a35859a](https://github.com/kaitranntt/ccs/commit/a35859aba57de1212298fb9524dd912ac2be5c3a))
* **cursor:** harden anthropic response fallback paths ([eaee4a9](https://github.com/kaitranntt/ccs/commit/eaee4a92cad9776ac67b2aecf0a01d13880155a7))
* **cursor:** harden anthropic translation edge cases ([9ff021e](https://github.com/kaitranntt/ccs/commit/9ff021e42b4739b2721ec4f1bd28a0a526686255))
* normalize plugin metadata across shared launch flows ([1043a43](https://github.com/kaitranntt/ccs/commit/1043a433f6c78d536353dd5b63cd439a41deb83c))
* **proxy:** support portable undici dispatcher typings ([ee06f83](https://github.com/kaitranntt/ccs/commit/ee06f83988bd472b93351ff7f86a17ad8484ba92))
* restore route target parser exports ([eb9e9a8](https://github.com/kaitranntt/ccs/commit/eb9e9a8c839fa8b5d73707057f90d9e72508aba2))
* **shared-manager:** normalize marketplace registry paths ([2cb5b4e](https://github.com/kaitranntt/ccs/commit/2cb5b4ebecc34aa13603a0dfd2ca873afcbb7cdb))
* **ui:** add llama.cpp provider icon ([93d94b5](https://github.com/kaitranntt/ccs/commit/93d94b597f94b34c1a89479bb94e5b8b08c440cc))
* **ui:** keep provider names readable ([3954e44](https://github.com/kaitranntt/ccs/commit/3954e445f331ee8e269c5bb3f74af7d8c196d322))
* **ui:** rebalance API profile provider chooser ([8c0d75a](https://github.com/kaitranntt/ccs/commit/8c0d75a454c923f8a592a5abbf82c03763c295bc))
* **ui:** restore searchable combobox keyboard navigation ([5fe96b7](https://github.com/kaitranntt/ccs/commit/5fe96b74b9ab7fdd9e658fc967139f5d182d9305))
* **ui:** simplify provider chooser cards ([a999adc](https://github.com/kaitranntt/ccs/commit/a999adc776029adebc3b67b16dfea2046bb9f73a))

### Documentation

* **community:** add GitHub contribution templates ([462d382](https://github.com/kaitranntt/ccs/commit/462d382c9391a17677095c9646954bf57668c802))
* **community:** soften contributor requirements ([f0f5a9c](https://github.com/kaitranntt/ccs/commit/f0f5a9cf98ca5bc342f2ab2b47c35ebd8e4abee9))
* **contributing:** refresh contributor workflow ([5f97316](https://github.com/kaitranntt/ccs/commit/5f973162f4a24af8dd6cea120c7e5bb126b6d205))
* **readme:** highlight hosted docs hub ([9a44f53](https://github.com/kaitranntt/ccs/commit/9a44f53c15014499ebc132ffde8619b4be92df91))
* **roadmap:** mention llama.cpp icon polish ([ea15e5e](https://github.com/kaitranntt/ccs/commit/ea15e5eb50528fa241e76e34630838c1e3e049a1))
* **roadmap:** record issue 744 provider selector update ([0819de2](https://github.com/kaitranntt/ccs/commit/0819de2f9f2cbf7f369c8c05647893191610e506))
* **roadmap:** record issue 748 chooser follow-up ([098416a](https://github.com/kaitranntt/ccs/commit/098416aefd7659b9afbd212f864b3443dbb4e265))

### Code Refactoring

* **commands:** split CLI command routing ([2044756](https://github.com/kaitranntt/ccs/commit/204475627a950e677c7c4d15e6219d6ede5299c9))

### Tests

* **cliproxy:** cover codex plan fallback edge cases ([ce600a7](https://github.com/kaitranntt/ccs/commit/ce600a7f229ee06418e1cff37648e74ed74f4a8f))
* cover invalid novita preset ids ([334f369](https://github.com/kaitranntt/ccs/commit/334f3697f939f81032965f31007ece2cedb33018))
* **cursor:** reclassify daemon lifecycle smoke coverage ([67290e8](https://github.com/kaitranntt/ccs/commit/67290e85c0c513f31f8f648a33817d1f71dcd835))
* restore config command host mock ([a4c1031](https://github.com/kaitranntt/ccs/commit/a4c10313243f531e943850339fd1f98ca96a289d))

## [7.54.0](https://github.com/kaitranntt/ccs/compare/v7.53.0...v7.54.0) (2026-03-16)

### Features

* add proxy setup using undici and update undici version ([c542606](https://github.com/kaitranntt/ccs/commit/c54260658232215ccc6c23fc1df29db62c591ab6))
* **ci:** harden AI review with adversarial red-team prompt ([19f7091](https://github.com/kaitranntt/ccs/commit/19f70914a987bef9278d5e5e2dc77d31ef00c0b7)), closes [#731](https://github.com/kaitranntt/ccs/issues/731)
* **claude-extension:** add binding workflow ([a2f5310](https://github.com/kaitranntt/ccs/commit/a2f531016d29093c957c1000860fc83e2dc55cb4))
* **config:** add Claude IDE extension setup flow ([b82f10e](https://github.com/kaitranntt/ccs/commit/b82f10e63952db82ebe2e66fc584c5da231efb1d))
* **docker:** publish release images on stable tags ([25bb806](https://github.com/kaitranntt/ccs/commit/25bb806ecdbf7e7b3b68e20b3f0557f9503edefa))
* **i18n:** add Japanese dashboard locale ([8b5158b](https://github.com/kaitranntt/ccs/commit/8b5158bec5574c884c2937ac804bc9cb2f977538))

### Bug Fixes

* add missing newline at end of fetch-proxy-setup.ts ([3324053](https://github.com/kaitranntt/ccs/commit/33240534c3927eac037c0ebc703ffd44d4a3a65e))
* align proxy routing across fetch and downloader ([fd5d16f](https://github.com/kaitranntt/ccs/commit/fd5d16f3f3cebe9b965d30bbc5a05d73011f500e))
* **ci:** address code review findings for hardened AI review ([b528bcb](https://github.com/kaitranntt/ccs/commit/b528bcbf35bed16bc711ad903c41788e7cf4ad52))
* **ci:** load review prompt from base branch to prevent prompt injection ([dcb4635](https://github.com/kaitranntt/ccs/commit/dcb46356f3fb65dfe065433472d73f5707bd2ce3))
* **ci:** remove maintainability baseline gate blocking releases ([e6ae052](https://github.com/kaitranntt/ccs/commit/e6ae0525271eb631b0c8fff9c18f570f1dcb5b14))
* **ci:** use full path in warning and add workflows/ to deep review triggers ([7828780](https://github.com/kaitranntt/ccs/commit/78287807f8c441db74d17630b7dad3fede42e997))
* **cliproxy:** validate tier thinking against model caps ([88d1dc1](https://github.com/kaitranntt/ccs/commit/88d1dc1ddb6dc2807edf89045b808cdb77c0bf3b))
* **config:** guard Claude extension metadata ([56ba379](https://github.com/kaitranntt/ccs/commit/56ba37911a2fc1465c1f793614ac19e4d7bcf004))
* **copilot:** stop mutating config on read ([7bd4049](https://github.com/kaitranntt/ccs/commit/7bd404960270fddf29e1c2129c64d033221362cc))
* **docker:** harden release image publishing ([314053b](https://github.com/kaitranntt/ccs/commit/314053b35ce9a25ca216b711fcec5b87d0cd89fe))
* harden global fetch proxy handling ([f50c962](https://github.com/kaitranntt/ccs/commit/f50c9625de6cc4d93c5db439af9349cb5e36f14b))
* **i18n:** polish Japanese dashboard copy ([e28f87b](https://github.com/kaitranntt/ccs/commit/e28f87bc9c7067e4c3a8c2105c42bb9f5266f7e4))
* normalize stale copilot raptor-mini model ([c409a45](https://github.com/kaitranntt/ccs/commit/c409a4522c21d439657026aab2b915c4817142ea))
* **sidebar:** move claude extension to compatible ([337dd18](https://github.com/kaitranntt/ccs/commit/337dd188cc240e74ea2e434ca99280360c3f9ce1))

### Documentation

* **readme:** clarify copilot config save behavior ([298b591](https://github.com/kaitranntt/ccs/commit/298b591d1499ff0da16c00decbddb1e74cb5a0b2))
* **readme:** document Claude IDE extension setup ([56db603](https://github.com/kaitranntt/ccs/commit/56db6035f51058a6ff7e3e245448b8e6fbf35f91))

### Styles

* **claude-extension:** apply formatter output ([6724ea5](https://github.com/kaitranntt/ccs/commit/6724ea52c2cb41ca3d71e663fafce00e040b5425))

## [7.53.0](https://github.com/kaitranntt/ccs/compare/v7.52.2...v7.53.0) (2026-03-11)

### Features

* add API profile lifecycle discover/copy/export/import parity ([02c8174](https://github.com/kaitranntt/ccs/commit/02c81743a09cc54447f953e5b4d4f95ad85f1ad9))
* **api:** add Anthropic direct API key support ([fedb4d4](https://github.com/kaitranntt/ccs/commit/fedb4d4cde4c9027f95364e66daa77b700a5c470)), closes [#688](https://github.com/kaitranntt/ccs/issues/688)
* **api:** add llama.cpp support as local model provider ([0ca6428](https://github.com/kaitranntt/ccs/commit/0ca6428554be9057926988ef4af0b95a958ca17e)), closes [#690](https://github.com/kaitranntt/ccs/issues/690)
* **auth:** add --bare flag and MCP server sync for profiles ([bc9b044](https://github.com/kaitranntt/ccs/commit/bc9b04444e0dbeb3db72b4814ca6694595abf0cd)), closes [#691](https://github.com/kaitranntt/ccs/issues/691) [#692](https://github.com/kaitranntt/ccs/issues/692)

### Bug Fixes

* **api:** complete anthropic direct profile support ([1f29fa0](https://github.com/kaitranntt/ccs/commit/1f29fa0b6ab366e558eadbe050e79e294f2eaa43))
* **auth:** preserve bare profile behavior across runtime and sync ([8f8684c](https://github.com/kaitranntt/ccs/commit/8f8684ce852f527a019e0a32d94922d15b078633))
* **ci:** remove LOC count from maintainability gate ([d3ede45](https://github.com/kaitranntt/ccs/commit/d3ede45c9612bb2415d24798fe43d6cba188f142))
* **ci:** remove maintainability baseline gate blocking releases ([03a0fb2](https://github.com/kaitranntt/ccs/commit/03a0fb27ca8ed41326f306c5364e1228117f72b0))
* clarify CLIProxy dashboard install lifecycle ([a4b626a](https://github.com/kaitranntt/ccs/commit/a4b626aedef2a0cf690a955bf4abd31c5284047a))
* **cliproxy:** handle Claude OAuth quota 401 ([7e8f9e8](https://github.com/kaitranntt/ccs/commit/7e8f9e82c113490d95b0a9f9bedf627bc11dc76a))
* **cliproxy:** poll paste-callback auth urls ([b25b165](https://github.com/kaitranntt/ccs/commit/b25b1653b047c588a95c6f4e47aa3214e0e370aa))
* **cliproxy:** preserve Claude fallback when quota is unavailable ([6ed95a2](https://github.com/kaitranntt/ccs/commit/6ed95a2a861f1031d0d49cd8d53a2ccd5c4214a6))
* **cliproxy:** preserve kiro paste-callback start route ([86ca180](https://github.com/kaitranntt/ccs/commit/86ca18003a033be976b787811db16bf38bf82a91))
* **cliproxy:** sync claude 4.6 selector defaults ([3d183fe](https://github.com/kaitranntt/ccs/commit/3d183fe0e891886bbd51a3c5b30b301e966cce03))
* **cliproxy:** use management auth-url route in paste callback ([6fcd924](https://github.com/kaitranntt/ccs/commit/6fcd924b1c8743484823b958ff403c4c37379eab))
* **cliproxy:** use management oauth-callback in paste flow ([fa02702](https://github.com/kaitranntt/ccs/commit/fa027022a8faf886c7f5891ec8cb2d3879c783e8))
* **codex:** standardize haiku defaults on gpt-5.1-codex-mini ([f4a7d4d](https://github.com/kaitranntt/ccs/commit/f4a7d4dc2c84b094192dba30522c475ced3293d6))
* complete codex tool sanitization coverage ([4baed01](https://github.com/kaitranntt/ccs/commit/4baed01d4905ecf3fbbfb2f4e8ac7dca34ebf907))
* **config:** align claude defaults across catalogs ([bea3084](https://github.com/kaitranntt/ccs/commit/bea3084d5e4f7bc691503cffee8a235f94c3b87d))
* **config:** update claude base models to latest ([09aeec5](https://github.com/kaitranntt/ccs/commit/09aeec57633828f9225591e090d8f442abc9d322))
* **config:** use correct codex haiku model ID (gpt-5-codex-mini) ([8a9751a](https://github.com/kaitranntt/ccs/commit/8a9751a819e41c527ec413e988b18f48df62332a)), closes [#602](https://github.com/kaitranntt/ccs/issues/602)
* confirm risky cliproxy installs in dashboard ([aed7beb](https://github.com/kaitranntt/ccs/commit/aed7beb075c2f31263423005c34e690af3463039))
* **copilot:** surface upstream model limits ([8a5ed65](https://github.com/kaitranntt/ccs/commit/8a5ed656eec08ccaae44ddde72cb0ca954b05875))
* harden profile lifecycle validation and dashboard UX flows ([d6fc5dd](https://github.com/kaitranntt/ccs/commit/d6fc5dd64c3232e9c95a54b0e433f3e057fd7fa4))
* **hooks:** handle thinking blocks in image analyzer response parsing ([0060c77](https://github.com/kaitranntt/ccs/commit/0060c77c257a64c57f4c704d2f32af415434022f)), closes [#511](https://github.com/kaitranntt/ccs/issues/511)
* improve quota diagnostics and oauth refresh handling ([fc3600e](https://github.com/kaitranntt/ccs/commit/fc3600e9228790179c8c51162924187ec994c49a))
* restart CLIProxy after dashboard version install ([e14df1f](https://github.com/kaitranntt/ccs/commit/e14df1fe05ce1fcbe515f6b1d969132ace91ed24))
* stop untracked CLIProxy installs safely ([ad01196](https://github.com/kaitranntt/ccs/commit/ad01196964bfdbdd0696cc845f3b3d3901b3be2f))
* strip unsupported gemini and codex tool fields ([8cfd86f](https://github.com/kaitranntt/ccs/commit/8cfd86f1d18356b6bfef931d24c1745e11e1db62))
* sync error code docs links ([2be5c5a](https://github.com/kaitranntt/ccs/commit/2be5c5a706bc659491decd66c3f21a8839f35e9c))
* **ui:** update copilot default claude model ([4d0ded3](https://github.com/kaitranntt/ccs/commit/4d0ded339f12abb4fec1c8596fac07c67581351f))
* **ui:** use preset apiKeyPlaceholder when creating profiles ([6078de7](https://github.com/kaitranntt/ccs/commit/6078de78f2a7e31ec141a49c057a8b4cb1a6d601))

### Tests

* cover llama.cpp help parity ([9bcb195](https://github.com/kaitranntt/ccs/commit/9bcb195e7c82a85e94e9de39530f185efad60ecd))
* **hooks:** add image analyzer regression coverage ([5097375](https://github.com/kaitranntt/ccs/commit/50973752bac0eabea57e76e5d0c64b460fd525a7))

### CI

* harden AI review for external PRs ([becfc57](https://github.com/kaitranntt/ccs/commit/becfc573c9a63b7b53153882973aca8be9b3b4cf))

## [7.52.2](https://github.com/kaitranntt/ccs/compare/v7.52.1...v7.52.2) (2026-03-04)

### Bug Fixes

* **ci:** remove LOC count from maintainability gate ([619c47d](https://github.com/kaitranntt/ccs/commit/619c47d89ae405690cddc849dcf15e8cc3240ab5))
* **ci:** strip ANSI codes before detecting published release ([a8d7f7c](https://github.com/kaitranntt/ccs/commit/a8d7f7caafb361e961aa2f17e0084d551b4674f7))
* **cliproxy:** reduce gemini alias model bloat ([276649f](https://github.com/kaitranntt/ccs/commit/276649f05d8da2948b10db5ab1d7a78c60e1e654))
* **copilot:** harden daemon lifecycle and validate config updates ([1fd128e](https://github.com/kaitranntt/ccs/commit/1fd128e50feb3fe779ac30e8706c722024e77543))
* **copilot:** improve daemon liveness and flag aliases ([4b1cda2](https://github.com/kaitranntt/ccs/commit/4b1cda25d945e6482be68804907177a8ad38489e))
* **copilot:** refine ownership checks and command error handling ([930d66f](https://github.com/kaitranntt/ccs/commit/930d66fc0d31468ecc53fc50bd6db81aaed1fb7b))
* **copilot:** sync alias UX and harden daemon stop safety ([f4678d6](https://github.com/kaitranntt/ccs/commit/f4678d639772699d9f3504dcd05bc9e311f67527))

### Code Refactoring

* **daemon:** share process ownership guard for safe shutdown ([5ad2416](https://github.com/kaitranntt/ccs/commit/5ad2416a863e8190351a1ee42e00646093e3e70f))

### Tests

* **cliproxy:** strengthen alias non-enrichment assertions ([e28d9c8](https://github.com/kaitranntt/ccs/commit/e28d9c8abcea772b8fff7e6587582aac692a2726))

### CI

* **release:** use PAT_TOKEN for semantic-release branch protection bypass ([91280e3](https://github.com/kaitranntt/ccs/commit/91280e3043bd981b86b187fbfbead5ca6f31139d))

## [7.52.1](https://github.com/kaitranntt/ccs/compare/v7.52.0...v7.52.1) (2026-03-03)

### Bug Fixes

* **ci:** strip ANSI codes before detecting published release ([6e16f1c](https://github.com/kaitranntt/ccs/commit/6e16f1cf3e2a3d43fa600a6fbadd35a513bf5db7))

## [7.52.0](https://github.com/kaitranntt/ccs/compare/v7.51.0...v7.52.0) (2026-03-03)

### Features

* **analytics:** integrate CLIProxy multi-provider usage into dashboard ([c5124a9](https://github.com/kaitranntt/ccs/commit/c5124a9cee7e37caaef811051852946467ee97e1))
* **api:** add Alibaba Coding Plan preset and providers promotion ([8811e53](https://github.com/kaitranntt/ccs/commit/8811e5320fe6d5340ad2bcdca24fd98599ceb716))
* **continuity:** support cross-profile continuity inheritance from account profiles ([0b9f982](https://github.com/kaitranntt/ccs/commit/0b9f9826e2c838e19c4bf9bc406ab14a5456fbcc))
* **i18n:** add comprehensive Vietnamese dashboard locale ([7893436](https://github.com/kaitranntt/ccs/commit/789343603803cd6fc90b5e162df969b25ad858da))
* **i18n:** Added support for Chinese language pack ([7ffb8a4](https://github.com/kaitranntt/ccs/commit/7ffb8a42340abc7e36282b2d67665c226203c5af))
* **pricing:** fix claude sonnet 4.6 and claude opus 4.6 pricing ([9a7ca3f](https://github.com/kaitranntt/ccs/commit/9a7ca3f1c0f6e5518d8f130d9d061599d3c27ad0))

### Bug Fixes

* **agy:** harden preset canonicalization and migration coverage ([747c706](https://github.com/kaitranntt/ccs/commit/747c70636950e72fcbdf0bf92fe54f7800fa0a8a))
* **agy:** harden self-migration across settings load/update paths ([3a26aba](https://github.com/kaitranntt/ccs/commit/3a26abac71e36d6f1d95333a47feb3c3cd08cce5))
* **agy:** normalize sonnet 4.6 model ids and migrate legacy thinking alias ([8a2b554](https://github.com/kaitranntt/ccs/commit/8a2b55449bd12df5183587fd801aa87581800b0a))
* **agy:** remove deprecated 4.5 selector options ([5913f73](https://github.com/kaitranntt/ccs/commit/5913f730ac370720febd31ad874bcbfa040a2671))
* **api-profiles:** keep AGY denylist when droid provider is set ([2710139](https://github.com/kaitranntt/ccs/commit/27101390fe3e6c2020088e83e004f4b5037b59c5))
* **auth:** harden continuity inheritance resolution ([8a45727](https://github.com/kaitranntt/ccs/commit/8a45727b314194af42533ec0cad95a3314ada162))
* **auth:** scope km alias mapping to settings profiles ([d827c3a](https://github.com/kaitranntt/ccs/commit/d827c3ab0baaacaf116e81c7aabf7f426f5201da))
* **ci:** harden release workflows against PAT checkout failures ([b35c85d](https://github.com/kaitranntt/ccs/commit/b35c85d308ef2ddff8f04e46bd005eae5983bc91))
* **ci:** remove PAT dependency from release workflow checkouts ([a259d95](https://github.com/kaitranntt/ccs/commit/a259d957b15c97381c86570080a4b173d657aefa))
* **cliproxy:** denylist deprecated agy 4.5 models ([f63e2cd](https://github.com/kaitranntt/ccs/commit/f63e2cd5a31a73c980d199b65eb3a320094c46ae))
* **cliproxy:** harden agy model canonicalization and migration paths ([0b57e41](https://github.com/kaitranntt/ccs/commit/0b57e41b3a0c1d277d202dc84f6c9c13be76e222))
* **cliproxy:** normalize iflow aliases for explicit routing ([7e471e6](https://github.com/kaitranntt/ccs/commit/7e471e663c8b0a8f7cdee10a9146e5a9b6035411))
* **cliproxy:** normalize stale iflow model aliases ([546c4ee](https://github.com/kaitranntt/ccs/commit/546c4ee4ee006589f179b544c6b73e362b7ebbe6))
* **cliproxy:** restore agy legacy 4.5 lookup compatibility ([ed05cfc](https://github.com/kaitranntt/ccs/commit/ed05cfc5a7bc6e7335d360acca88b86d521826c8))
* **config:** merge legacy and unified continuity maps ([1eb41cc](https://github.com/kaitranntt/ccs/commit/1eb41cc4e217554021be4d0c20d8ff2f13ebedcd))
* **ghcp:** improve oauth failure diagnostics in device flow ([c2f564a](https://github.com/kaitranntt/ccs/commit/c2f564ac662534e7abb6d090e75820581cf46012))
* **i18n:** complete Vietnamese dashboard copy QA polish ([b07c62c](https://github.com/kaitranntt/ccs/commit/b07c62cc219d02005ca2e308fbe6c30308ca7a59))
* **i18n:** harden unstable dialog and complete cursor locale key ([552eee3](https://github.com/kaitranntt/ccs/commit/552eee31692d9150e429abbc2ec2dff076ed740a))
* **i18n:** polish remaining Vietnamese copy for dashboard context ([f3f315e](https://github.com/kaitranntt/ccs/commit/f3f315e86aad3f65075b503026657f30718e0e06))
* **i18n:** refine Vietnamese dashboard translation quality ([758fcc7](https://github.com/kaitranntt/ccs/commit/758fcc7754b20faf1bf48ca564eb86283c231ac9))
* **pricing:** handle date-stamped 4.6 thinking model IDs ([d31f85b](https://github.com/kaitranntt/ccs/commit/d31f85b0d4ccbf0edddcd2f58a49c1f9777cc6e1))
* respect auto_update preference by disabling Claude auto-updater ([4cdb659](https://github.com/kaitranntt/ccs/commit/4cdb6594f80df8f40118202ae285d3f03adfadab))
* **security:** harden API endpoints and resolve PR [#674](https://github.com/kaitranntt/ccs/issues/674) review findings ([a4c5bb7](https://github.com/kaitranntt/ccs/commit/a4c5bb7421748e744c07eb7ab5c7cfb3a55b8081))
* **ui:** improve providers badge readability and albb preset ([3b38f1a](https://github.com/kaitranntt/ccs/commit/3b38f1ac90ac027011711d00fe7d545be717ddc4))
* **ui:** restore scrolling in API profile create dialog ([6f8514b](https://github.com/kaitranntt/ccs/commit/6f8514b74b4383e94788224e25e78b9ede7c56d0))
* **usage:** coalesce refresh and force live sync on refresh ([09ce1a9](https://github.com/kaitranntt/ccs/commit/09ce1a93797da942629f504821a3303afd5e2e4f))
* **web-server:** run usage cleanup during dashboard shutdown ([e8519b6](https://github.com/kaitranntt/ccs/commit/e8519b6ac3465738cb7a09059d095fbdab94d36c))

### Documentation

* **i18n:** add dashboard localization guide and links ([2dddf02](https://github.com/kaitranntt/ccs/commit/2dddf02a216d14c53af6d5bcb585aa2ce346f36f))

### Code Refactoring

* **routes:** resolve DRY violations, config race, and error leaks ([e255855](https://github.com/kaitranntt/ccs/commit/e255855775c59dab3ad5b39a97d8176c77e0e889))

### Tests

* **auth:** cover legacy alias isolation for continuity ([26f4fb3](https://github.com/kaitranntt/ccs/commit/26f4fb3a99035dff9ef5e012b2e169bee9a9587b))
* **pricing:** cover Claude 4.6 cache token cost rates ([91050bf](https://github.com/kaitranntt/ccs/commit/91050bfebf15fa39eefdc819af3cd0450c79889e))
* **usage:** add cliproxy sync and integration coverage ([383ac94](https://github.com/kaitranntt/ccs/commit/383ac94623f69fc024e12008c6d40f059ae12491))

### CI

* **release:** use PAT_TOKEN for semantic-release branch protection bypass ([343c36f](https://github.com/kaitranntt/ccs/commit/343c36f97d949dfb85ee92a7161c60197413cf11))

## [7.51.0](https://github.com/kaitranntt/ccs/compare/v7.50.0...v7.51.0) (2026-02-26)

### Features

* **accounts-ui:** add history sync learning visualization ([6cfc8d4](https://github.com/kaitranntt/ccs/commit/6cfc8d4a45fcaf80f413dd1b397e5f7f46f889d0))
* **accounts-ui:** redesign accounts dashboard to column layout ([12c7a21](https://github.com/kaitranntt/ccs/commit/12c7a218b709cd1a93709b6f36c6afa0afdb2697))
* **accounts:** add advanced deeper continuity mode and claude pool discoverability ([b6475ba](https://github.com/kaitranntt/ccs/commit/b6475baab3380328da9293905572d2b1274d6dfa))
* **agy:** add power-user bypass for responsibility acknowledgement ([d3c271a](https://github.com/kaitranntt/ccs/commit/d3c271ab2c6bcf85e14faffb16e7f976c86c0312))
* **api:** add --target to api command ([3dacb39](https://github.com/kaitranntt/ccs/commit/3dacb39deb5cf88978c7d98e3cd95c5a12dca455))
* **api:** persist profile target metadata ([461236e](https://github.com/kaitranntt/ccs/commit/461236e5decc88e3488781cd94528d2ef99a3e9d))
* **api:** support profile target in routes ([e833054](https://github.com/kaitranntt/ccs/commit/e8330546429803a1a94cc508e3dc6a1572ecef9c))
* **cliproxy:** accept target in variant routes ([5b60784](https://github.com/kaitranntt/ccs/commit/5b60784eb82e51c0356cf416ba6323094e04d19c))
* **cliproxy:** add target support to subcommands ([d2d1d59](https://github.com/kaitranntt/ccs/commit/d2d1d599cd220fb1e2c1eae9a501148b97f0770b))
* **cliproxy:** persist target on variants ([f4a6927](https://github.com/kaitranntt/ccs/commit/f4a692729300d0ec7894b985c57a9d3a5cfc5a52))
* **config:** support legacy profile target overrides ([9a63f9b](https://github.com/kaitranntt/ccs/commit/9a63f9bd36d6c53131b1a7681c7c7658516cce46))
* **dashboard:** add dedicated Factory Droid diagnostics page ([bc079bc](https://github.com/kaitranntt/ccs/commit/bc079bc88656435da1d5b4b2329f89c90c910d1b))
* **dashboard:** enrich droid docs and quick settings controls ([031dcd9](https://github.com/kaitranntt/ccs/commit/031dcd99c3978ca6d00a402a2cb2ce5e9d2306a2))
* **droid:** align BYOK provider mapping for ccsd ([60b1c04](https://github.com/kaitranntt/ccs/commit/60b1c043c7e721ca576f9b4f4188468a3ddea846)), closes [#632](https://github.com/kaitranntt/ccs/issues/632)
* **droid:** sync reasoning effort across CLI and dashboard ([eedb53b](https://github.com/kaitranntt/ccs/commit/eedb53b49e41b044f570a7273c6b6a9231cd75d2))
* **pricing:** add MiniMax M2.5/M2.5-lightning and Qwen3 series (max/plus/flash/coder) model pricing ([089aa08](https://github.com/kaitranntt/ccs/commit/089aa081361f8375a951579ee4f80230efcac904))
* **runtime:** run cliproxy profiles on droid ([8a2a7c3](https://github.com/kaitranntt/ccs/commit/8a2a7c3eb0c86aa1207099d9f67fb57840860673))
* **ui:** add target controls to cliproxy variants ([543ec5f](https://github.com/kaitranntt/ccs/commit/543ec5f0502e6c9cb24e0837b72e6c4d82f15c4d))
* **ui:** add target support to API profile dashboard ([ca78e63](https://github.com/kaitranntt/ccs/commit/ca78e63205aeb7cbd6c059c7f70fffcc509f860d))
* **ui:** add updates center with support matrix ([e9d2515](https://github.com/kaitranntt/ccs/commit/e9d2515a7fdb6864d00a97d90e3cd55c18fc1e4b))
* **ui:** redesign updates center into action inbox ([78eac7d](https://github.com/kaitranntt/ccs/commit/78eac7d500669fbba43ff4e17e84d9ca9fc52961))
* **ui:** support editing profile default target ([db38ccc](https://github.com/kaitranntt/ccs/commit/db38ccc117e59fdc9f70c584aaa569b7f70cbe4a))
* **ui:** surface cliproxy target in provider editor ([6aae3ba](https://github.com/kaitranntt/ccs/commit/6aae3ba998c8463f5cda6b216c15dec3f1c6a443))
* **ui:** surface updates center across dashboard ([c7c4c87](https://github.com/kaitranntt/ccs/commit/c7c4c87fb43c631564ba25900fef43e1768a1a06))

### Bug Fixes

* **accounts-ui:** add actionable continuity controls and claude deep-link ([a974efb](https://github.com/kaitranntt/ccs/commit/a974efb8b11e02d26234d8cd9303ae9aef420d67))
* **accounts-ui:** condense sync guidance and remove redundant controls ([286180e](https://github.com/kaitranntt/ccs/commit/286180e4653a1b2a467f2fd87ed1a192545a9496))
* **accounts-ui:** move action center content into left column ([cfdad81](https://github.com/kaitranntt/ccs/commit/cfdad81beef1fbd5051e3daf0ff9ba8240eb66bb))
* **accounts-ui:** remove extra left-column wrapper layers ([5996f9d](https://github.com/kaitranntt/ccs/commit/5996f9df7a06064ee01aa6fa032d266a2c6edfba))
* **accounts-ui:** simplify left action column hierarchy ([7fccb18](https://github.com/kaitranntt/ccs/commit/7fccb1843d85efe3f01198aabf71ba71d35321ca))
* **accounts-ui:** soften details trigger hover state ([1708128](https://github.com/kaitranntt/ccs/commit/1708128a6201de8758a6632e732bf9fb5e50fff3))
* **accounts:** focus dashboard on auth profiles and legacy context onboarding ([10c08b9](https://github.com/kaitranntt/ccs/commit/10c08b9be83d176e04034509ccf20d56a3adc861))
* **accounts:** improve shared-context editing and discoverability ([5c6fe20](https://github.com/kaitranntt/ccs/commit/5c6fe20d3f223fccdebeb781df6f363901666e72))
* **agy:** align responsibility flow with issue [#509](https://github.com/kaitranntt/ccs/issues/509) ([3148014](https://github.com/kaitranntt/ccs/commit/3148014c6c23d088a5dad097eb0539a72bfec27d)), closes [622/#619](https://github.com/622/ccs/issues/619)
* **agy:** enforce multi-step responsibility acknowledgement for antigravity oauth ([3b1271b](https://github.com/kaitranntt/ccs/commit/3b1271b5e4bd48e65d599323c07eebdffd7c8995))
* **agy:** use type-only import for ui checklist value ([7b4bd80](https://github.com/kaitranntt/ccs/commit/7b4bd804c88d1f9355600d8945ef683c45d854bc))
* **api:** remove stale legacy profile target mappings ([e32dedc](https://github.com/kaitranntt/ccs/commit/e32dedcf4c0f45470303eba6ed66e10c21097c72))
* **auth:** close shared-context isolation edge cases ([0b070a3](https://github.com/kaitranntt/ccs/commit/0b070a3f343846cb8082fcd351f0bcb3fc2f109d))
* **auth:** harden agy safety endpoints and config writes ([b602ab9](https://github.com/kaitranntt/ccs/commit/b602ab99ab6a1da755d1c8fedfdae4e15a926a8a))
* **auth:** harden shared-context isolation and config safety ([0309630](https://github.com/kaitranntt/ccs/commit/0309630193a222c0d03dbcdad749101af1ee5433))
* **auth:** harden shared-context isolation edge cases ([7d5e604](https://github.com/kaitranntt/ccs/commit/7d5e604e53b47811557baf4b1a6c4a11ed70af9a))
* **ci:** align maintainability baseline for PR merge checks ([a8b8e63](https://github.com/kaitranntt/ccs/commit/a8b8e633efd06399f120baf2128b1c2921ac4e99))
* **ci:** refresh maintainability baseline for dev release ([d6fd598](https://github.com/kaitranntt/ccs/commit/d6fd5985bc329ff5efdc83f51e44bc0ecea67745))
* **cli:** improve cliproxy target parsing edge cases ([8d95de9](https://github.com/kaitranntt/ccs/commit/8d95de9fd37cfbe8be9e83481cce07dedc418106))
* **cliproxy-sync:** honor profile settings paths and targets ([ac1c744](https://github.com/kaitranntt/ccs/commit/ac1c744239d57fb52441dde32cd5cb7f41e9f2b5))
* **cliproxy:** normalize deprecated antigravity Claude aliases ([ff9dbb3](https://github.com/kaitranntt/ccs/commit/ff9dbb30614263b1f0b0751f1277728b636ef236))
* **dashboard:** align droid config diagnostics with factory paths ([c6d2e71](https://github.com/kaitranntt/ccs/commit/c6d2e71ec2f4e2587b13e1bb7d01d53499cd0cdf))
* **dashboard:** guard droid docs links for older API payloads ([e7f3b3f](https://github.com/kaitranntt/ccs/commit/e7f3b3ffcf4d020ac20561e1d2c24d7aaa33e494))
* **dashboard:** make droid docs links always clickable ([1704b80](https://github.com/kaitranntt/ccs/commit/1704b802ee4f32218d6c5707dd0dc2b617064dde))
* **droid:** add structural exec passthrough for ccsd ([5963ba9](https://github.com/kaitranntt/ccs/commit/5963ba973e8fd2a9deef26a713159e4af0d3670e))
* **droid:** avoid interactive model arg prompt pollution ([f1567c0](https://github.com/kaitranntt/ccs/commit/f1567c0090c03d6b95d8cee94ce8dc29d57d3359))
* **droid:** harden exec passthrough and add integration coverage ([ce44d2e](https://github.com/kaitranntt/ccs/commit/ce44d2ece0393e70b5f9c0df942c102298aa6ca9))
* **droid:** restore tabbed layout and stabilize save state ([a88fd68](https://github.com/kaitranntt/ccs/commit/a88fd68c34ea94555ab9efe89ead8dbe9d72a8a5))
* **help:** align cliproxy status and provider filter docs ([b658b20](https://github.com/kaitranntt/ccs/commit/b658b20709e4b8b1766442cbc4b9c944d34fc0bc))
* **iflow:** replace placeholder model defaults to prevent 406 ([03bc414](https://github.com/kaitranntt/ccs/commit/03bc4140a1c668fa96476319fb8f780661620417))
* **maintainability:** make gate parallel-pr friendly ([fdb32e2](https://github.com/kaitranntt/ccs/commit/fdb32e2c535e541e1d7336099aed94a180711bcb))
* **pricing:** normalize model aliases for MiniMax and Qwen ([7ac5e3e](https://github.com/kaitranntt/ccs/commit/7ac5e3edab0e06d817933b3597038561e4995392))
* **proxy:** harden AGY risk persistence and confirm UX ([36d5cb7](https://github.com/kaitranntt/ccs/commit/36d5cb723e39ec44926bec9a713ba7dbc121332d)), closes [#509](https://github.com/kaitranntt/ccs/issues/509)
* **safety:** unify add-account typed risk phrase ([c0eb786](https://github.com/kaitranntt/ccs/commit/c0eb786127d7552254efc170be040d162c8d8b09))
* **shared:** harden markdown traversal and parsing ([46b4f9c](https://github.com/kaitranntt/ccs/commit/46b4f9c1cf36febe578c996c8e7ffcc7948993cb))
* **shared:** polish shared data UX and route persistence ([f9f063c](https://github.com/kaitranntt/ccs/commit/f9f063ca011ce3a2ce421b0516a030b4aa505052))
* **shared:** resolve strict ui build typing errors ([787ebbc](https://github.com/kaitranntt/ccs/commit/787ebbc7f9a144aa10967d791d248220c01be130))
* **shared:** support file-based agents and recursive commands ([346fa5f](https://github.com/kaitranntt/ccs/commit/346fa5fcda7f740b01a219575f466452adbfdfb2))
* **targets:** sanitize invalid persisted target values ([2bd3c40](https://github.com/kaitranntt/ccs/commit/2bd3c40c7ad4072634b395c0c5cfa7a29a2657a2))
* **ui:** align cliproxy log polling with existing API routes ([a7db16c](https://github.com/kaitranntt/ccs/commit/a7db16c12959e4acd62f2d73e31dfc3e77e864d6))
* **ui:** align cliproxy target schema typing ([1c7e4e1](https://github.com/kaitranntt/ccs/commit/1c7e4e116f05fff4802c5b2b228cdffebe4e2228))
* **ui:** align updates page with dashboard layout patterns ([d47efc7](https://github.com/kaitranntt/ccs/commit/d47efc783ea606d6d9d4238d7b16bfadd0a1e25d))
* **ui:** de-surface updates center from primary navigation ([69378ad](https://github.com/kaitranntt/ccs/commit/69378ada3e779e8e731b4681486648a166482beb))
* **ui:** harden target update flows in profile editors ([d385bd1](https://github.com/kaitranntt/ccs/commit/d385bd19f2206db98571a184eba7960edb382afa))
* **ui:** improve agy auth UX and flow resilience ([6e20cdc](https://github.com/kaitranntt/ccs/commit/6e20cdcdff18abc176d09acfe7b4a98e3475f54e))
* **ui:** keep home route at root without last-route redirect ([c130e9a](https://github.com/kaitranntt/ccs/commit/c130e9a0cca0409a3731569db56768d37178aebf))
* **ui:** move agy power-user mode to proxy settings ([30dccb1](https://github.com/kaitranntt/ccs/commit/30dccb14fe03eacad2c42cb90c932492ab958e35)), closes [#509](https://github.com/kaitranntt/ccs/issues/509)
* **ui:** redesign updates page as changelog-first layout ([4736445](https://github.com/kaitranntt/ccs/commit/473644564d4ef7785fe06bac3d6c6d5baef16ca3))
* **ui:** remove nested sidebar list markup ([1698ead](https://github.com/kaitranntt/ccs/commit/1698eadc943fbeca97e32a5857f95507fe62106e))
* **ui:** tighten updates action row type narrowing ([ae7ab59](https://github.com/kaitranntt/ccs/commit/ae7ab59746172419eba5b7a5ab9773e7e0c199a7))
* **ui:** unify gemini and agy safety warning banner ([e22d331](https://github.com/kaitranntt/ccs/commit/e22d331bf19131c47ec59522c8fc573e257d4381)), closes [#509](https://github.com/kaitranntt/ccs/issues/509)
* **websearch:** support Gemini positional prompt mode ([0d09604](https://github.com/kaitranntt/ccs/commit/0d09604bb98cf8e9cfbe2f35adec65277fcf1003))

### Documentation

* **cli:** document target defaults and ccsd cliproxy usage ([172e599](https://github.com/kaitranntt/ccs/commit/172e5995747c31acce3da4ab395e5581d7130e65))
* **readme:** document dashboard updates center ([0a5b12b](https://github.com/kaitranntt/ccs/commit/0a5b12b46bd587d0651524da4ea6eb5f8d787201))

### Code Refactoring

* **dashboard:** reuse compatible CLI settings editor stack ([e9eab71](https://github.com/kaitranntt/ccs/commit/e9eab712b3f60d1dcf45746df69dabac29beb299))
* **dashboard:** switch droid settings I/O to async fs ([20e48b3](https://github.com/kaitranntt/ccs/commit/20e48b3dc0e91fd0984ff1d059169aa6b64a84ce))
* **ui:** remove unused last-route restore helpers ([766cc1b](https://github.com/kaitranntt/ccs/commit/766cc1b43e251db2f166073d2a173ebd2d2cbd5f))

### Tests

* **web-server:** cover profile and variant target parsing ([2e8c7a3](https://github.com/kaitranntt/ccs/commit/2e8c7a36915e86e697b358db68aa029a200627da))

## [7.50.0](https://github.com/kaitranntt/ccs/compare/v7.49.1...v7.50.0) (2026-02-24)

### Features

* **auth:** add opt-in shared context groups across accounts ([4fed74c](https://github.com/kaitranntt/ccs/commit/4fed74c64b302ea70772894d52c6f3fad1e60c67))

### Bug Fixes

* **cliproxy:** prevent agy model reset and add sonnet 4.6 models ([bebb758](https://github.com/kaitranntt/ccs/commit/bebb7582cf4e168628e171b48954bd1d982a129e))

## [7.49.1](https://github.com/kaitranntt/ccs/compare/v7.49.0...v7.49.1) (2026-02-24)

### Bug Fixes

* **cliproxy:** prevent blank page in remote mode ([4eb2be7](https://github.com/kaitranntt/ccs/commit/4eb2be79fcf8c8e04007cc33a83c2e693fb0072f))
* **cliproxy:** strengthen account safety warning and redesign alert UI ([00495b6](https://github.com/kaitranntt/ccs/commit/00495b667533a4a1fbb3560a3391c2547bc228f9))

## [7.49.0](https://github.com/kaitranntt/ccs/compare/v7.48.1...v7.49.0) (2026-02-23)

### Features

* **memory:** share project memory across account instances ([e2623e6](https://github.com/kaitranntt/ccs/commit/e2623e632c057dc88f7ee1061864b44efbe2e03a))

### Bug Fixes

* **ci:** auto-close released issues in stable release workflow ([b6f2d5d](https://github.com/kaitranntt/ccs/commit/b6f2d5d249dde80a3288a79e9dc783756296e79c))
* **codex:** canonicalize dashboard presets and migrate suffixed settings ([be96b84](https://github.com/kaitranntt/ccs/commit/be96b84e613ac4be217ea05c8090318df1114469))
* **codex:** preserve codex tier efforts in auto thinking ([db80f85](https://github.com/kaitranntt/ccs/commit/db80f85e38abe7ace0c25b774cdf65ed4913b8df))
* **codex:** validate tier thinking values before suffixing ([57e14cf](https://github.com/kaitranntt/ccs/commit/57e14cf3a69e5106a0a29ffda77f8aa134aa435d))
* **memory:** use async fs APIs to satisfy maintainability gate ([c6c44d0](https://github.com/kaitranntt/ccs/commit/c6c44d03411a85034ab452ac8fc82b35b50c3c27))
* resolve package.json version conflict from main merge ([6840523](https://github.com/kaitranntt/ccs/commit/68405239cdc848b934a185139226cd286f43ea9d))
* **web-server:** detect symlinked shared entries ([e3dbc67](https://github.com/kaitranntt/ccs/commit/e3dbc6763436e97b6ae2ec6687174fb6c6904dc7))
* **web-server:** harden shared route symlink scanning ([498b66d](https://github.com/kaitranntt/ccs/commit/498b66d9cceaf34a36e81403fa15b73093eda2c9))

## [7.48.1](https://github.com/kaitranntt/ccs/compare/v7.48.0...v7.48.1) (2026-02-23)

### Bug Fixes

* **ci:** enforce parity gate and stabilize test execution ([0aed60f](https://github.com/kaitranntt/ccs/commit/0aed60febb1752fab3b3f765fc2233f013af971f))

## [7.48.0](https://github.com/kaitranntt/ccs/compare/v7.47.0...v7.48.0) (2026-02-22)

### Features

* **cliproxy:** add Claude quota windows and account failover ([2385d90](https://github.com/kaitranntt/ccs/commit/2385d9028ae37d00200516c9728cb29b9c45fd21))

### Bug Fixes

* **cliproxy:** add gemini 3.1 preview alias compatibility ([653f809](https://github.com/kaitranntt/ccs/commit/653f8092aea7e9b0d0e3f7ca7d6fd2a42f87e4a5))
* **cliproxy:** close remaining quota edge-case gaps ([8c790f4](https://github.com/kaitranntt/ccs/commit/8c790f41ffba9a09467899b8b641dcbe2b692ae3))
* **cliproxy:** harden antigravity alias generation ([63619cb](https://github.com/kaitranntt/ccs/commit/63619cb9dc7b4eb35b4904322b5fe02d36278638))
* **cliproxy:** harden quota guards and review follow-ups ([ca58cb5](https://github.com/kaitranntt/ccs/commit/ca58cb5a088d0f4e714d0936d5b339de8f5ad053))
* **cliproxy:** keep canonical codex model ids in settings ([a81176d](https://github.com/kaitranntt/ccs/commit/a81176da79568189a686f748d3f76b2c3e1a4240))
* **cliproxy:** keep remote-proxy client under maintainability limit ([88be99f](https://github.com/kaitranntt/ccs/commit/88be99f8a071c8f5786800a958218948286cbba0))
* **cliproxy:** normalize codex effort aliases without reasoning proxy ([742b5ed](https://github.com/kaitranntt/ccs/commit/742b5ed5803dc7937547fc5cf78c8b23c6b3d10f))
* **cliproxy:** normalize provider-aware Claude model IDs ([6429781](https://github.com/kaitranntt/ccs/commit/6429781e8fc7ec5d72aedb7b2409f26f0c739e00))
* **cliproxy:** prevent false remote timeout on reachable proxy ([34292ca](https://github.com/kaitranntt/ccs/commit/34292ca7f8d1cb51b7aaa5a59383e8ff2a381bd4))
* **cliproxy:** split claude quota fetcher for maintainability gate ([9371a72](https://github.com/kaitranntt/ccs/commit/9371a72c1638d72f2a3e1fcb3fe9416c79f7cd1a))
* **core:** resolve edge cases and hardcoded drift ([343ec95](https://github.com/kaitranntt/ccs/commit/343ec959fc8ea26c3e2b75d88613627cdad3b223))
* **persist:** add auto-approve permission flags ([e3255e5](https://github.com/kaitranntt/ccs/commit/e3255e5615df121831f626300510c934518d2cca))
* **persist:** harden persist restore safety and edge cases ([29cceb3](https://github.com/kaitranntt/ccs/commit/29cceb3a881600d70511bcc6d11b63f5b809f04b))
* **persist:** resolve CI gate and review test gaps ([61bcd4d](https://github.com/kaitranntt/ccs/commit/61bcd4df5e343a34c3089c939ee23ce9a815c029))
* **refactor:** address PR review follow-up findings ([6074fcb](https://github.com/kaitranntt/ccs/commit/6074fcb0b628c801b3a579c2673f79e829270dc1))
* **types:** use type-only import for composite tier config ([af6aa2d](https://github.com/kaitranntt/ccs/commit/af6aa2d7b2b40f144b7e53b3f69a63e92cbb10c6))

### Documentation

* **cliproxy:** add normalizer API usage examples ([187c6f7](https://github.com/kaitranntt/ccs/commit/187c6f7f130d6f425dfcdd00c1a760b63c83afb4))

### Code Refactoring

* **core:** centralize claude paths and command parsing ([8d2ec86](https://github.com/kaitranntt/ccs/commit/8d2ec861551a68d30442a2e548e08578d511cb49))

## [7.47.0](https://github.com/kaitranntt/ccs/compare/v7.46.0...v7.47.0) (2026-02-20)

### Features

* **quota:** add GitHub Copilot quota checks for ghcp and copilot ([8d9d498](https://github.com/kaitranntt/ccs/commit/8d9d4987dc42415ebe53760e1ac06c9c024ce17f))
* **thinking:** complete thinking UX/DX for all providers ([c48ed2e](https://github.com/kaitranntt/ccs/commit/c48ed2ea7fe7fcf0725805274233bd5760f284d8)), closes [#583](https://github.com/kaitranntt/ccs/issues/583)

### Bug Fixes

* **api:** sanitize preset help text rendering ([5b12ce7](https://github.com/kaitranntt/ccs/commit/5b12ce7f0065ff19eff46f61171db20f6e1170a3))
* **cliproxy:** add Kimi model catalog, sync, and pricing to dashboard ([3767b95](https://github.com/kaitranntt/ccs/commit/3767b95735950b506e2470a0454d4d0db7f00764)), closes [#581](https://github.com/kaitranntt/ccs/issues/581)
* **cliproxy:** add kimi-k2 pricing and kimi catalog tests ([dd38df6](https://github.com/kaitranntt/ccs/commit/dd38df6b8d7a5367c06b14b0258a271af8545fd4))
* **cliproxy:** address review feedback on kimi catalog ([c73a26c](https://github.com/kaitranntt/ccs/commit/c73a26c51c5340598aacf25f48fb2851bf61d5a8))
* **cliproxy:** harden provider alias and refresh edge cases ([a71496c](https://github.com/kaitranntt/ccs/commit/a71496cc3d7db499780c2b257d74bb6cc101f450))
* **cliproxy:** normalize codex model and provider routing ([ecc4a3f](https://github.com/kaitranntt/ccs/commit/ecc4a3fe58721b47f3c248053d06dcec8a5c2fbf))
* **cliproxy:** warn gemini and agy users about issue 509 ([476eabe](https://github.com/kaitranntt/ccs/commit/476eabe08f06284fed3d35ed546534f9f73ef9d2))
* **delegation:** strip CLAUDECODE env var to bypass nested session guard ([4303ee4](https://github.com/kaitranntt/ccs/commit/4303ee48c9849f6ba1cdfb420eddca4d9ae2d541)), closes [#588](https://github.com/kaitranntt/ccs/issues/588)
* **delegation:** strip claudecode in core delegation spawn paths ([50412dc](https://github.com/kaitranntt/ccs/commit/50412dc6799921a3e536ab2fd86b011f8849e99c)), closes [#588](https://github.com/kaitranntt/ccs/issues/588)
* **execution:** strip claudecode in remaining claude paths ([8e57d59](https://github.com/kaitranntt/ccs/commit/8e57d5947901c56ac39071dee14938551ad49c84)), closes [#588](https://github.com/kaitranntt/ccs/issues/588)
* **profile:** close km legacy kimi compatibility gaps ([0bf00b2](https://github.com/kaitranntt/ccs/commit/0bf00b23d9085dde7fedfbed30f7924fee41da92))
* **profile:** handle km compatibility for legacy kimi api users ([cf8070b](https://github.com/kaitranntt/ccs/commit/cf8070b5f00d8fa13f86d7324a7bfd85cfc8f78e))
* **profiles:** reset form state on preset transitions ([14242b5](https://github.com/kaitranntt/ccs/commit/14242b568190920bd954ec9e093a9f9a2f766480))
* **quota:** address ghcp review follow-ups ([8201204](https://github.com/kaitranntt/ccs/commit/8201204380ac5d3981d9c84a609b1c823f6696e6))
* **spawn:** sanitize claudecode in shared claude env builders ([d25eda8](https://github.com/kaitranntt/ccs/commit/d25eda8435c72c24f16f28a84d6bfffb31b67174)), closes [#588](https://github.com/kaitranntt/ccs/issues/588)
* **test:** pin real child_process passthrough refs ([04e4e61](https://github.com/kaitranntt/ccs/commit/04e4e61b686b50dd685917646af97b7d47e81ba1))
* **test:** prevent child_process mock cross-test leakage ([5b164a6](https://github.com/kaitranntt/ccs/commit/5b164a64864a548192578eacd4bb149253d4be95))
* **test:** scope child_process mock to test lifecycle ([873b7ad](https://github.com/kaitranntt/ccs/commit/873b7adb701f01d1686fab2ad98cb294c4143405))
* **thinking:** handle clear no-op and tighten override coverage ([954baec](https://github.com/kaitranntt/ccs/commit/954baecfe429aad1c6fc4f60601b578af04ff37f))
* **thinking:** harden codex reasoning controls across cli and dashboard ([92e2ec1](https://github.com/kaitranntt/ccs/commit/92e2ec111d08aecb55e4461fccebc93c544439eb))
* **ui:** harden cliproxy panel and proxy edge handling ([c18adc9](https://github.com/kaitranntt/ccs/commit/c18adc90c33b45577422de4929edb9034e854941))
* **ui:** harden provider preset/icon typing ([b317717](https://github.com/kaitranntt/ccs/commit/b3177179b11b55cb3ba0a660adade4f5898c11dd))
* **ui:** make api profile dialog scrollable on small screens ([faa610f](https://github.com/kaitranntt/ccs/commit/faa610f843bae381aaa6553370fd1ae294a144e9))
* **ui:** normalize ghcp quota tooltip and labels ([2c5b2af](https://github.com/kaitranntt/ccs/commit/2c5b2af55a9a7cf87716b98432c2c6d40311d860))
* **ui:** replace stale BASE_URL references in api client ([5a78626](https://github.com/kaitranntt/ccs/commit/5a786263bc2501684593c2c1aa0b56b1d20a56ed))

### Documentation

* **spawn:** document claudecode env sanitization behavior ([f2ffb81](https://github.com/kaitranntt/ccs/commit/f2ffb815ab059e8f48b309ab4af05b2cde8b3215)), closes [#588](https://github.com/kaitranntt/ccs/issues/588)

### Code Refactoring

* **cliproxy:** address review feedback on parity and refresh flow ([39593c1](https://github.com/kaitranntt/ccs/commit/39593c161b4cbbfc6a5a125f6ef100922b73ef9b))
* **cliproxy:** centralize provider auth capability metadata ([bd8daac](https://github.com/kaitranntt/ccs/commit/bd8daac094404bf834d77f5c4bebd9470d88c55f))
* **cliproxy:** resolve remaining review parity and cleanup nits ([7e527af](https://github.com/kaitranntt/ccs/commit/7e527af777f1ca8ea36570f97aada469c77299ee))
* **cliproxy:** use shared default port in management paths ([90b8d04](https://github.com/kaitranntt/ccs/commit/90b8d04d71c78b8a120ac8cd091ea0936ba5bb6f))
* **commands:** share cliproxy default port for setup and help ([688f3e3](https://github.com/kaitranntt/ccs/commit/688f3e3889843931cde2e34fd56ec51df454b0a6))
* **presets:** centralize shared provider preset catalog ([21d6754](https://github.com/kaitranntt/ccs/commit/21d6754ec6ae59002c2d393d41515dd105de692a))
* **ui:** centralize default ports and add parity test ([63f4221](https://github.com/kaitranntt/ccs/commit/63f422179ed34678a8abc0f763a2a3e3525bac16))
* **ui:** centralize provider metadata and fallbacks ([9ad8e64](https://github.com/kaitranntt/ccs/commit/9ad8e64e85458a0154c1cac7bac2e3f082f9c7ac))
* **ui:** centralize provider metadata for setup wizard ([a53e6cb](https://github.com/kaitranntt/ccs/commit/a53e6cbd2505c2dab5c5e8fd940b75af5584d600))
* **ui:** replace remaining hardcoded port defaults ([70116cb](https://github.com/kaitranntt/ccs/commit/70116cb3a15694532e57d370245176b905c8f375))
* **ui:** unify api base path for cursor and copilot hooks ([feb556d](https://github.com/kaitranntt/ccs/commit/feb556dc90dab593e79aaf6145dd5b9a38eb6831))
* **ui:** use shared default proxy port in settings cards ([5788ddc](https://github.com/kaitranntt/ccs/commit/5788ddc3b7747df898571470318d5df774603b95))

### Tests

* **delegation:** add regression coverage for claudecode stripping ([80a84ed](https://github.com/kaitranntt/ccs/commit/80a84edf1f7a7514dfb3fbd8c3786b0571b528bf)), closes [#588](https://github.com/kaitranntt/ccs/issues/588)

## [7.46.0](https://github.com/kaitranntt/ccs/compare/v7.45.0...v7.46.0) (2026-02-17)

### Features

* **cliproxy:** add Kimi as OAuth CLIProxy provider ([08b2a67](https://github.com/kaitranntt/ccs/commit/08b2a6791398912ff5ea6b3cce18b37552c1ef10)), closes [#574](https://github.com/kaitranntt/ccs/issues/574)
* **cliproxy:** expose codex weekly reset schedule in quota views ([4fc19c4](https://github.com/kaitranntt/ccs/commit/4fc19c43902330da31b49b6296082fb13e22bebf))
* **cliproxy:** rename kimi API preset to km, add kimi to UI ([f451f4e](https://github.com/kaitranntt/ccs/commit/f451f4e4214396f59c0e8482be0be2f7376d5388))
* **cursor:** harden daemon integration and model discovery ([c639cef](https://github.com/kaitranntt/ccs/commit/c639cefa7bd33807e96d96fd566c64a89166f22f))
* **targets:** add multi-target CLI adapter system (Droid support) ([7d7054e](https://github.com/kaitranntt/ccs/commit/7d7054e2c096768c42fa4be1db5d111bb8e56b8a))
* **targets:** support CCS_DROID_ALIASES argv0 mapping ([025218a](https://github.com/kaitranntt/ccs/commit/025218a706d30ca75163153293ce0920d9c3917d))
* **ui:** add Kimi provider logo with dark background ([6961fb0](https://github.com/kaitranntt/ccs/commit/6961fb0ec35b326bb77ffea9f8828708d2a40cb7))

### Bug Fixes

* **cliproxy:** add kimi to wizard constants and image analysis config ([ddd5b15](https://github.com/kaitranntt/ccs/commit/ddd5b159d21efe436aa2bf82a190d3b284abe4a8))
* **cliproxy:** log unknown codex quota window labels ([9031e5a](https://github.com/kaitranntt/ccs/commit/9031e5a085e8c1b4b58e4e871e4d98dbd48bcfc3))
* **core:** prevent GLMT proxy leaks in child lifecycle ([53e18d4](https://github.com/kaitranntt/ccs/commit/53e18d4c8d60ed0d13a1cb034f53c5c2ef91bdad))
* **cursor:** fallback when requested model is unavailable ([fae8716](https://github.com/kaitranntt/ccs/commit/fae87169008b704c319f78fcac958dda435985d0))
* **cursor:** resolve review feedback and harden edge cases ([4798741](https://github.com/kaitranntt/ccs/commit/4798741a99eb60190c6ba09215f50d3bc67db6e4))
* **targets:** close all remaining multi-target droid edge cases ([0431adf](https://github.com/kaitranntt/ccs/commit/0431adf3061388b5b984cbcbbf336a09bab85be3))
* **targets:** DRY signal handling, remove redundant guards, harden config manager ([02af8d5](https://github.com/kaitranntt/ccs/commit/02af8d5737d9c3db4172b094b1bfae13ccdccbb1))
* **targets:** harden adapter lifecycle and droid model edge cases ([3da3407](https://github.com/kaitranntt/ccs/commit/3da3407f9a3470f34aaf03c19d3410e5b33caa36))
* **targets:** harden edge cases from parallel code review ([3191a4a](https://github.com/kaitranntt/ccs/commit/3191a4ab3887b79c598c31de278a45361c587a48))
* **targets:** run cleanup before adapter launch exits ([812bb5c](https://github.com/kaitranntt/ccs/commit/812bb5c0a5b60041d1928189019cc75183ae525d))
* **targets:** snapshot active profiles during droid prune ([15d6c06](https://github.com/kaitranntt/ccs/commit/15d6c06dbc8de72379330c43031a5660b4bc0338))
* **test:** add kimi to provider tests, remove merge conflict marker ([0fe195c](https://github.com/kaitranntt/ccs/commit/0fe195cdc38c26b93f0f269bd384c7ef3a6c289c))

### Documentation

* **provider:** clarify kimi base profile endpoint ([e33164f](https://github.com/kaitranntt/ccs/commit/e33164f42e96ec6826728c47b615286bb13bfdd6))
* **targets:** document built-in and env droid aliases ([91edc95](https://github.com/kaitranntt/ccs/commit/91edc9565bbd6bf4fe6992b0c7e2457a90a87949))

### Styles

* format source and test files ([539afea](https://github.com/kaitranntt/ccs/commit/539afea7374f2c931ab5cbb1e04e0845c57729b5))

### Code Refactoring

* **cliproxy:** DRY provider lists into single source of truth ([94b03c7](https://github.com/kaitranntt/ccs/commit/94b03c7f75fd398282a0737c497f882aeb708724))

### CI

* **ai-review:** switch from CLIProxy to GLM API for code reviews ([55ecbce](https://github.com/kaitranntt/ccs/commit/55ecbce3f523c034a854bc741c4c3a5b5e7851d4))
* **ai-review:** switch from CLIProxy to GLM API for code reviews ([f81c562](https://github.com/kaitranntt/ccs/commit/f81c56204cd981e265b1ed072b887ac80114f5c3))

## [7.45.0](https://github.com/kaitranntt/ccs/compare/v7.44.0...v7.45.0) (2026-02-14)

### Features

* **cursor-ui:** restore Cursor dashboard UX and icon assets ([7ab7a15](https://github.com/kaitranntt/ccs/commit/7ab7a156ebfb696e1d2f275b58c32115800283c2)), closes [#555](https://github.com/kaitranntt/ccs/issues/555)
* **cursor:** sync model mapping across config and raw settings ([7b73658](https://github.com/kaitranntt/ccs/commit/7b73658f8700c7d6f3804f00df29de4c14243028)), closes [#555](https://github.com/kaitranntt/ccs/issues/555)

### Bug Fixes

* **cursor-settings:** remove sync fs calls in settings sync ([4f086aa](https://github.com/kaitranntt/ccs/commit/4f086aa34adb32be42527e0f3a77c4369e88df72))
* **cursor-ui:** label cursor dashboard as beta ([b40fe86](https://github.com/kaitranntt/ccs/commit/b40fe866ec293fc08dbb877a000a87addd3ab16d))
* **cursor-ui:** restore info card order and list scrolling ([decdffe](https://github.com/kaitranntt/ccs/commit/decdffea61f543beca508ce209b543bbeee81a4c))

## [7.44.0](https://github.com/kaitranntt/ccs/compare/v7.43.0...v7.44.0) (2026-02-14)

### Features

* **cliproxy:** add CLI edit command for composite variants ([43e73f3](https://github.com/kaitranntt/ccs/commit/43e73f335f85f051b7294b0d9f4bdae405780a26))
* **cliproxy:** add composite variant CLI wizard ([4926c20](https://github.com/kaitranntt/ccs/commit/4926c200f2601655e0a93f73c9dd8d03c44e12da)), closes [#506](https://github.com/kaitranntt/ccs/issues/506)
* **cliproxy:** add composite variant runtime execution ([44b30b8](https://github.com/kaitranntt/ccs/commit/44b30b875328bf795dfc5783948f81da018c2f2e)), closes [#506](https://github.com/kaitranntt/ccs/issues/506)
* **cliproxy:** add composite variant type definitions ([3d207fa](https://github.com/kaitranntt/ccs/commit/3d207faac5ca3389572b88eb0881b2dca040c6fb)), closes [#506](https://github.com/kaitranntt/ccs/issues/506)
* **cliproxy:** add dashboard CRUD for composite variants ([1ebd9f4](https://github.com/kaitranntt/ccs/commit/1ebd9f43d6e5fe76f50be31458955b1a53312b25))
* **cliproxy:** add explicit start and restart commands ([8395364](https://github.com/kaitranntt/ccs/commit/83953649704c5957a2522e3b8cf041fd2725510e))
* **cliproxy:** add per-tier thinking config for composite variants ([ed22c1a](https://github.com/kaitranntt/ccs/commit/ed22c1aa1ec9d3c3bf6e161b31326e603e299620))
* **cliproxy:** add provider error detection for composite fallback ([478e9e8](https://github.com/kaitranntt/ccs/commit/478e9e8f7342300ec5368c606bc7619ed497c481))
* **cliproxy:** clarify codex effort mapping and preset UX ([945db1d](https://github.com/kaitranntt/ccs/commit/945db1d6909e546fef988f7823d60e03adcffd44))
* **cliproxy:** extend composite schema with fallback and thinking fields ([20d6079](https://github.com/kaitranntt/ccs/commit/20d60791ffc5c805a2d2d88fc95c5e734dbcbc67)), closes [#506](https://github.com/kaitranntt/ccs/issues/506)
* **cliproxy:** implement composite variant CRUD and settings ([c58fdc9](https://github.com/kaitranntt/ccs/commit/c58fdc931e40026322419d6353535e95308e9a8e)), closes [#506](https://github.com/kaitranntt/ccs/issues/506)
* **cliproxy:** wire composite variant into main execution flow ([07bef9f](https://github.com/kaitranntt/ccs/commit/07bef9f50eeb3a8fe4beace38de04784f6bdda1e)), closes [#506](https://github.com/kaitranntt/ccs/issues/506)
* **codex:** add gpt-5.3 preset defaults ([7fddb63](https://github.com/kaitranntt/ccs/commit/7fddb63ab9ffb826eee514e791ac923067938a04))
* **codex:** keep gpt-5.2 catalog entry ([d6aa1d9](https://github.com/kaitranntt/ccs/commit/d6aa1d90a6d7722829f5cdb0d9208a22fc4ae7e3))
* **cursor:** add auth module with SQLite auto-detect and types ([56270d9](https://github.com/kaitranntt/ccs/commit/56270d99f3511058bb71390df4c0b85f4a0e54e0)), closes [#519](https://github.com/kaitranntt/ccs/issues/519) [#517](https://github.com/kaitranntt/ccs/issues/517)
* **cursor:** add config integration and dashboard routes ([93dafa0](https://github.com/kaitranntt/ccs/commit/93dafa04d53367653aadb6d32c59d85a0502865e))
* **cursor:** add core protobuf encoder/decoder and executor ([9daf943](https://github.com/kaitranntt/ccs/commit/9daf9430bb76f175e34a9aa05c6060b4a959312e))
* **cursor:** add daemon lifecycle, models catalog, and CLI commands ([aaa31c6](https://github.com/kaitranntt/ccs/commit/aaa31c64270d0e718ad82d584c8c76692e39dbf4)), closes [#520](https://github.com/kaitranntt/ccs/issues/520) [#521](https://github.com/kaitranntt/ccs/issues/521) [#522](https://github.com/kaitranntt/ccs/issues/522)
* **cursor:** complete daemon wiring and add dedicated dashboard page ([be9d7cf](https://github.com/kaitranntt/ccs/commit/be9d7cf73e10ede766affe932881969788eadfb7))
* **cursor:** namespace FIELD constants and implement true streaming SSE ([#531](https://github.com/kaitranntt/ccs/issues/531), [#535](https://github.com/kaitranntt/ccs/issues/535)) ([4e5b502](https://github.com/kaitranntt/ccs/commit/4e5b502fc9b2b8e576105dddb5c9d068db5b73d2))

### Bug Fixes

* **analytics:** stabilize responsive row alignment ([0cc1f11](https://github.com/kaitranntt/ccs/commit/0cc1f111f7032fa6685ed59161b43d60a9f39f67))
* **cli:** add kiro auth-method flag wiring and help ([e425f47](https://github.com/kaitranntt/ccs/commit/e425f477a44fa030a8dc5a6c28bed14d9bdfd762)), closes [#552](https://github.com/kaitranntt/ccs/issues/552) [#233](https://github.com/kaitranntt/ccs/issues/233)
* **cliproxy:** add circular fallback and empty model validation in API ([ef77607](https://github.com/kaitranntt/ccs/commit/ef77607c41cbf7e7529581071d03bea158bad44f))
* **cliproxy:** add defensive null checks for composite tier config ([0c7dc39](https://github.com/kaitranntt/ccs/commit/0c7dc398f77806a1aa47ed73f0828f36ad88d948))
* **cliproxy:** add session check on delete and atomic settings writes ([7486897](https://github.com/kaitranntt/ccs/commit/74868972ddbc9c4dcb689ea6a3e27a52893f6935))
* **cliproxy:** address 3 code review issues in composite variants ([399d7e1](https://github.com/kaitranntt/ccs/commit/399d7e163a30568ae6ec8070c517c54225eb1307))
* **cliproxy:** address 3 functional regressions in composite variants ([61f46e7](https://github.com/kaitranntt/ccs/commit/61f46e738d1935f9db5afb030e34daba2e95ac59))
* **cliproxy:** address 4 functional regressions in composite variants ([27d22e8](https://github.com/kaitranntt/ccs/commit/27d22e836ffc83c62eefbeeb2ef29aefcb36c834))
* **cliproxy:** address code review feedback (attempt 1/5) ([854b198](https://github.com/kaitranntt/ccs/commit/854b198b64c0feb5cfe6f7ecdf87980d18c0fda6))
* **cliproxy:** address code review feedback (attempt 2/5) ([ac574e0](https://github.com/kaitranntt/ccs/commit/ac574e0bafaf5a7124857e7f38fe3c44f5d67a8a))
* **cliproxy:** address code review feedback (attempt 3/5) ([6cfbdd6](https://github.com/kaitranntt/ccs/commit/6cfbdd649b6b2e1d5038c42e69f74e2c744d2bb4))
* **cliproxy:** address code review feedback (attempt 4/5) ([4c002ca](https://github.com/kaitranntt/ccs/commit/4c002caee1d64b2b90967a67a18db8f097bbac80))
* **cliproxy:** address lifecycle port and thinking regressions ([f02e7dc](https://github.com/kaitranntt/ccs/commit/f02e7dc5c62084fc7fb73e08d3ca667210d17317))
* **cliproxy:** align kiro auth methods with upstream contracts ([fd46ad0](https://github.com/kaitranntt/ccs/commit/fd46ad022aae1a4d2fe6dbb8304f691465860214)), closes [#552](https://github.com/kaitranntt/ccs/issues/552) [#233](https://github.com/kaitranntt/ccs/issues/233)
* **cliproxy:** fix edit dialog empty model and composite guidance ([8e6b67b](https://github.com/kaitranntt/ccs/commit/8e6b67bf99204f4fe187ba59e739491d4a2ab193))
* **cliproxy:** fix thinking off regression and composite error handling ([e914fe9](https://github.com/kaitranntt/ccs/commit/e914fe977895c7d036e6cd81f48d833ac29bb9f7))
* **cliproxy:** harden composite validation and runtime safeguards ([1a23f91](https://github.com/kaitranntt/ccs/commit/1a23f912a4629cb73d83351f6c1f4acf18f7a214))
* **cliproxy:** harden composite variant routing and validation ([0a8adb2](https://github.com/kaitranntt/ccs/commit/0a8adb22fcdffc993b06ed577217ccb8e55253c9))
* **cliproxy:** harden kiro device-code auth flow consistency ([826a42d](https://github.com/kaitranntt/ccs/commit/826a42d8d6c4877431474c27e14f0f1d4ec092d7))
* **cliproxy:** improve multi-provider auth with continue-on-error pattern ([6ff17d8](https://github.com/kaitranntt/ccs/commit/6ff17d848091e1087ce2631ef2363e628346a8a2))
* **cliproxy:** keep daemon running after parent exit ([3136f24](https://github.com/kaitranntt/ccs/commit/3136f24b9b4a879199e272cf8d1e52c919270f10))
* **cliproxy:** keep variant updates atomic and persisted ([7bb9ceb](https://github.com/kaitranntt/ccs/commit/7bb9ceb4aff0d806ec19b3e97486a96d667834d2))
* **cliproxy:** mark Kiro as device_code flow for dashboard auth ([6c20839](https://github.com/kaitranntt/ccs/commit/6c2083949f887a9f1a1d37bf8cc2a27c3bd650d7)), closes [#552](https://github.com/kaitranntt/ccs/issues/552)
* **cliproxy:** resolve merge-duplicate lifecycle handlers ([9268c05](https://github.com/kaitranntt/ccs/commit/9268c05ee526e9c12b7ad33e180d3b8818443e62))
* **cliproxy:** restore POST tier validation and guard null payloads ([a99180f](https://github.com/kaitranntt/ccs/commit/a99180fa22c83db51b3ff2f7b4dbadab0f79fbbc))
* **cliproxy:** strip thinking suffix in detectFailedTier matching ([efd3f21](https://github.com/kaitranntt/ccs/commit/efd3f21e29dd17c287f4e569670d80c9d0f85d5a))
* **cliproxy:** unify codex reasoning flags and thinking flow ([f9df3cf](https://github.com/kaitranntt/ccs/commit/f9df3cfa7ad5fe3668780b714edd33f17529083f))
* **codex:** align quota display to 5h and weekly windows ([f8af5a8](https://github.com/kaitranntt/ccs/commit/f8af5a8c3cb9e2c0de09f0a1ffde942c642cdca0))
* **codex:** infer code review cadence from reset window ([1d2ee82](https://github.com/kaitranntt/ccs/commit/1d2ee827fe38204d8d4ceb376c604abcff130836))
* **codex:** preserve sonnet high alias on variant model updates ([3410c52](https://github.com/kaitranntt/ccs/commit/3410c52f7ed0af34428e0265b1ff510e3f3dafdf))
* **codex:** preserve xhigh default effort for gpt-5.3 ([164d195](https://github.com/kaitranntt/ccs/commit/164d1953679392772506defc6024cf514fbbb188))
* **codex:** reduce quota timeout flakes in dashboard ([b3d9dce](https://github.com/kaitranntt/ccs/commit/b3d9dce6e1e7b631d24bb98111a14b239074db2b))
* **codex:** stabilize code review window labeling ([40512fe](https://github.com/kaitranntt/ccs/commit/40512fe3388e0e517838926438c8ae4559cc09d3))
* **codex:** type cast provider in model update path ([41d9978](https://github.com/kaitranntt/ccs/commit/41d99788da96b7f59144d391d672d070e34ace00))
* **commands:** await async command validation ([b98335c](https://github.com/kaitranntt/ccs/commit/b98335c1620bda79a3e27e5392f5e77f6bdd7f03))
* **config:** serialize cursor section in generateYamlWithComments ([4b7de69](https://github.com/kaitranntt/ccs/commit/4b7de69d9bd330c07d834e610ca36e657a7ab2eb))
* **cursor:** add enabled field to tests, simplify cursor routing ([f9834c8](https://github.com/kaitranntt/ccs/commit/f9834c81c947315ebe2527135e6df4bdc4da37c7))
* **cursor:** add input validation on dashboard settings routes ([1bebf16](https://github.com/kaitranntt/ccs/commit/1bebf163575dc3f0a8a936d630714f48292655e4))
* **cursor:** add resolve guard, port validation, and daemon tests ([7d4e6d6](https://github.com/kaitranntt/ccs/commit/7d4e6d6b65d467cf182710805b4ee15f44a4f5f0))
* **cursor:** add response body handling and size limit ([36f0308](https://github.com/kaitranntt/ccs/commit/36f0308a72141e0481c9044a4e49b35b3065cf73))
* **cursor:** add subcommand parity comment and raw settings TODO ([4ca4a9d](https://github.com/kaitranntt/ccs/commit/4ca4a9d2ab55eb0b339ac62e7a11d517ada1aff3))
* **cursor:** address CI gate and review regressions ([0e55db8](https://github.com/kaitranntt/ccs/commit/0e55db88a5b92ecde8528ee8bf396ce411c93296))
* **cursor:** address code review edge cases in protobuf and executor ([cc5a903](https://github.com/kaitranntt/ccs/commit/cc5a9039e40d952bd769b8b2dce7df9ecfd0cfa8))
* **cursor:** address code review feedback (attempt 1/5) ([31f5741](https://github.com/kaitranntt/ccs/commit/31f574118d6c1f293dd8dc59c311079bde9b0bd1))
* **cursor:** address code review feedback on auth module ([7e4f080](https://github.com/kaitranntt/ccs/commit/7e4f08004c00771ee624a09c045f920a5e105358))
* **cursor:** address fourth-round review feedback for protobuf module ([c5e8241](https://github.com/kaitranntt/ccs/commit/c5e82413932f83958bb56f37aee5dc82ab5207d3))
* **cursor:** address PR [#527](https://github.com/kaitranntt/ccs/issues/527) review feedback ([9f0ea25](https://github.com/kaitranntt/ccs/commit/9f0ea25448a8e4ca3019052812452885a4058190))
* **cursor:** address PR [#528](https://github.com/kaitranntt/ccs/issues/528) review feedback ([d58e988](https://github.com/kaitranntt/ccs/commit/d58e98815b5ccf0aa62f9fc929f88d43b4905d8e))
* **cursor:** address remaining LOW review items in protobuf module ([f3d532a](https://github.com/kaitranntt/ccs/commit/f3d532afd971e998ee7f72fcfc8a2940ff735ff4))
* **cursor:** address remaining PR [#527](https://github.com/kaitranntt/ccs/issues/527) review feedback ([afb5e74](https://github.com/kaitranntt/ccs/commit/afb5e746b3c11951147c381b298bc562a078685c))
* **cursor:** address remaining PR [#528](https://github.com/kaitranntt/ccs/issues/528) review feedback ([b8aaa58](https://github.com/kaitranntt/ccs/commit/b8aaa58d6ebf2b715fd9f53cf42ea363bbb55042))
* **cursor:** address remaining review items in auth module ([b412ba2](https://github.com/kaitranntt/ccs/commit/b412ba2a9eb6e92630de3c4b98bb95a1375927a0)), closes [#526](https://github.com/kaitranntt/ccs/issues/526)
* **cursor:** address second-round review feedback for auth module ([84a256d](https://github.com/kaitranntt/ccs/commit/84a256d0ac8ac2c3be6c4ffdbd422eda47f3abcc))
* **cursor:** address second-round review feedback for protobuf module ([e177a4b](https://github.com/kaitranntt/ccs/commit/e177a4b09796cfc48a4932428449809d8ab68015)), closes [#531](https://github.com/kaitranntt/ccs/issues/531) [#531](https://github.com/kaitranntt/ccs/issues/531)
* **cursor:** address third-round review feedback for auth module ([a8a68c9](https://github.com/kaitranntt/ccs/commit/a8a68c95992614e7c7ea1e3f65c85e29713ed746))
* **cursor:** address third-round review feedback for protobuf module ([66a93ee](https://github.com/kaitranntt/ccs/commit/66a93ee46f26a226294cdfd25abeac78af614aff)), closes [#535](https://github.com/kaitranntt/ccs/issues/535)
* **cursor:** align daemon routes, add enabled field, handle bare command ([6af7186](https://github.com/kaitranntt/ccs/commit/6af718626ff9db1e58a132972d08abbc3aece5bd))
* **cursor:** clean up PID file on startDaemon failure and improve daemon robustness ([cda037e](https://github.com/kaitranntt/ccs/commit/cda037e7e5a9a77bb6bb9768e3d601008d102b70))
* **cursor:** clean up settings validation and route consistency ([1e4cae3](https://github.com/kaitranntt/ccs/commit/1e4cae34900b307aaa7d9ddb20e624bbbf17bfb4))
* **cursor:** close ReadableStream controller on abort to prevent consumer hangs ([36a67c4](https://github.com/kaitranntt/ccs/commit/36a67c48377a0fbd325d2ed9a267de5c5357b52f))
* **cursor:** export missing symbols, eliminate subcommand sync risk, improve tests ([9342387](https://github.com/kaitranntt/ccs/commit/934238740e124f6b89d04f571fe201153dbf85af))
* **cursor:** fix router fall-through, add daemon marker, use random test port ([bfc9361](https://github.com/kaitranntt/ccs/commit/bfc9361701376b0a2d5541f2c8e48e95e2637539))
* **cursor:** fix test isolation and daemon exit handling ([fe97d72](https://github.com/kaitranntt/ccs/commit/fe97d720d41f83a35acf90307ef4471fb02a4cc6))
* **cursor:** guard raw-settings save race and enforce daemon preconditions ([9a76f86](https://github.com/kaitranntt/ccs/commit/9a76f866b09bfb7b864da236011658046f24f150))
* **cursor:** harden auth security and add token expiry warning ([aeb5802](https://github.com/kaitranntt/ccs/commit/aeb580281fc4b9f0d585a99e95730e65bd6fae6f))
* **cursor:** harden stopDaemon PID validation, tighten regex, add lifecycle test ([760a5c3](https://github.com/kaitranntt/ccs/commit/760a5c3ca4fb10f408ddafc2bcd9a1c20e805e23))
* **cursor:** kill orphaned daemon on timeout and fix exit codes ([88ad13e](https://github.com/kaitranntt/ccs/commit/88ad13ee7ba7957a6d1756e994b707d6f7402e2a))
* **cursor:** pass all args to handler, use getCursorConfig in routes ([d7e0d1c](https://github.com/kaitranntt/ccs/commit/d7e0d1cacff827ee1cd0015cbf8143e0a5346680))
* **cursor:** save credentials after auto-detect and fix signal hang ([9f9db7d](https://github.com/kaitranntt/ccs/commit/9f9db7dcea29f8ed0e2b8d52dc8ade81f8ab050d))
* **cursor:** show auto-detect error message, add subcommand sync comment ([887efa4](https://github.com/kaitranntt/ccs/commit/887efa406957bb88f0dfdfe12732b1ac0e1cfae1))
* **cursor:** split daemon helpers to satisfy maintainability gate ([08a3e0b](https://github.com/kaitranntt/ccs/commit/08a3e0bae68aeefdb9e5cfaf4cb879363b16e056))
* **cursor:** tighten rate limit detection string matching ([79ba1de](https://github.com/kaitranntt/ccs/commit/79ba1de4e237f126a65b981660755a0845925ce9))
* **cursor:** use getCursorConfig(), fix help text and stub messages ([2ba826b](https://github.com/kaitranntt/ccs/commit/2ba826bb722c75bc773dd132095d6a42abb36691))
* **cursor:** use process.execPath and add safeResolve to model fetcher ([9478967](https://github.com/kaitranntt/ccs/commit/94789676b9642d539e9365fc03a961691981ed12))
* **cursor:** use stdio ignore, sequential polling, move CursorConfig to types ([ce19153](https://github.com/kaitranntt/ccs/commit/ce1915366d5012097b5b6814c2c672d04f16ab61))
* **cursor:** validate fetch status before streaming fallback and register abort early ([27badb2](https://github.com/kaitranntt/ccs/commit/27badb2584a9131b9408dacc1f58417745968dbe))
* **cursor:** validate request body on settings endpoints ([f5a912b](https://github.com/kaitranntt/ccs/commit/f5a912b114107bdc26fdcacb936ac6bf4d9f50c5))
* **format:** align image analysis check with pinned prettier ([ae83be1](https://github.com/kaitranntt/ccs/commit/ae83be159052e064ab639db2bde140326d42769f))
* **hardening:** count executable sync fs call sites ([d21b5c4](https://github.com/kaitranntt/ccs/commit/d21b5c44ee736a4fea6473a32071d289fa43202e))
* **hardening:** handle regex literals after else/do ([65a1d8a](https://github.com/kaitranntt/ccs/commit/65a1d8ae2cd2027eb6e6992daf15466a000c48d2))
* **hardening:** handle regex literals in sync-call scanner ([bb9d846](https://github.com/kaitranntt/ccs/commit/bb9d846a549642c8b90de96a8f2377546dc2d11c))
* **hardening:** ignore literal text in sync-call metrics ([8193e9d](https://github.com/kaitranntt/ccs/commit/8193e9d67fef073c221f470559faa5b19db65056))
* **maintainability:** enforce gate and correct loc metric ([2610971](https://github.com/kaitranntt/ccs/commit/2610971d2e023af24c3364d94fc1a7be7e00843f))
* **maintainability:** harden tracked scan and baseline checks ([33e9a88](https://github.com/kaitranntt/ccs/commit/33e9a8849420b2cdf68f1ddd5ef93d22fafc50f7))
* **maintainability:** require git-tracked scan for gate ([b7481cf](https://github.com/kaitranntt/ccs/commit/b7481cf346c80fc3b178cb7c60c9459865a52f8c))
* **maintainability:** scan tracked src files for stable gate ([8f0ba48](https://github.com/kaitranntt/ccs/commit/8f0ba481edf22fd87da1ad44e4eea2c257695d75))
* **test:** avoid global ui mock leakage in shell completion tests ([851f870](https://github.com/kaitranntt/ccs/commit/851f870fa8cce523205f547712ad5596e96bf3d6))
* **ui:** add method-aware kiro auth flow parity ([6a21f39](https://github.com/kaitranntt/ccs/commit/6a21f3921b618ba61949cf1eeccc2251dd3f6719)), closes [#552](https://github.com/kaitranntt/ccs/issues/552) [#233](https://github.com/kaitranntt/ccs/issues/233)
* **ui:** add trim validation for composite tier model fields ([b6e1d0c](https://github.com/kaitranntt/ccs/commit/b6e1d0c4810581bd5a4e68b990601ac3c1f90cc8))
* **ui:** fix TypeScript error in composite edit dialog tier mapping ([240dfe2](https://github.com/kaitranntt/ccs/commit/240dfe29cf2aefead7850c03b5da592d3ebd04b0))
* **ui:** use default tier provider instead of hardcoded 'gemini' ([f3618c5](https://github.com/kaitranntt/ccs/commit/f3618c51d77512993dbe6a587c03db18d799cc32))
* **ui:** use type-only import for KiroAuthMethod ([e3f0860](https://github.com/kaitranntt/ccs/commit/e3f0860750e9213572727b8c3f5deb3c57615937))
* **web-server:** make kiro auth routes method-aware ([577991c](https://github.com/kaitranntt/ccs/commit/577991c282fb3646f42d5c657c94dd5c07f6b4e3)), closes [#552](https://github.com/kaitranntt/ccs/issues/552) [#233](https://github.com/kaitranntt/ccs/issues/233)

### Documentation

* **guidelines:** add AGENTS symlink and neutral wording ([fca5ca2](https://github.com/kaitranntt/ccs/commit/fca5ca203f03d918ae3557754715a535a9ea85c4))
* **kiro:** document method-aware auth behavior ([14dd341](https://github.com/kaitranntt/ccs/commit/14dd34187d94fc07419175c17cd893e3f0081537)), closes [#552](https://github.com/kaitranntt/ccs/issues/552) [#233](https://github.com/kaitranntt/ccs/issues/233)

### Code Refactoring

* **cliproxy:** centralize provider capability registry ([924e368](https://github.com/kaitranntt/ccs/commit/924e3686c8741986def8474d079cc60ea13eee29))
* **commands:** add command contract and migrate shell completion ([fc4b77b](https://github.com/kaitranntt/ccs/commit/fc4b77bc520da688af6e26add33fc7b25ff4d5c0))

### Tests

* **cliproxy:** add composite variant v2 unit tests ([e0ae5f2](https://github.com/kaitranntt/ccs/commit/e0ae5f20ff60fb8c94788a04b9c63ddb4b01b884))
* **cliproxy:** add regression coverage for update consistency ([7dd4ce5](https://github.com/kaitranntt/ccs/commit/7dd4ce5453b7e22ff1d378f396e4f8d61300a543))
* **cliproxy:** add thinking suffix test and document exit 0 behavior ([c35de7e](https://github.com/kaitranntt/ccs/commit/c35de7ec9ab1eac166fc1a74bb9da3be61975ee8))
* **cliproxy:** stabilize path-sensitive CI test assertions ([c9faf6c](https://github.com/kaitranntt/ccs/commit/c9faf6cdc9d5e34b1e69ed055b4e845657444c87))
* **cliproxy:** stabilize thinking override assertion ([d28fb2c](https://github.com/kaitranntt/ccs/commit/d28fb2cdbd9d585f2d045fb0a64f9ec41ab5776b))
* use getCcsDir() instead of os.homedir() for test isolation ([ca7bb23](https://github.com/kaitranntt/ccs/commit/ca7bb23970ba66c9b5f7ce68e96700bca8303656))

## [7.43.0](https://github.com/kaitranntt/ccs/compare/v7.42.0...v7.43.0) (2026-02-11)

### Features

* **cliproxy:** add account safety guards to prevent Google account bans ([#516](https://github.com/kaitranntt/ccs/issues/516)) ([e055dac](https://github.com/kaitranntt/ccs/commit/e055dac1996bd3cd3c4e5ee0f11dad22d8d2a838)), closes [#509](https://github.com/kaitranntt/ccs/issues/509) [#512](https://github.com/kaitranntt/ccs/issues/512)
* **cliproxy:** runtime quota monitoring during active sessions ([#529](https://github.com/kaitranntt/ccs/issues/529)) ([c6c94a0](https://github.com/kaitranntt/ccs/commit/c6c94a0c1e7bf82dd56295a76d833d7d52694718)), closes [#524](https://github.com/kaitranntt/ccs/issues/524)
* **glm:** update default model to GLM-5 and fix all GLM pricing ([3e26dee](https://github.com/kaitranntt/ccs/commit/3e26dee0134fa576a57f216f232a0215084e74a3)), closes [#532](https://github.com/kaitranntt/ccs/issues/532)

### Bug Fixes

* **cliproxy:** add fork:true for Claude model aliases in config generator ([#523](https://github.com/kaitranntt/ccs/issues/523)) ([4065399](https://github.com/kaitranntt/ccs/commit/4065399d8aa46ccdb115081e461c5651d0afaa2e)), closes [#522](https://github.com/kaitranntt/ccs/issues/522)
* **cliproxy:** address all review feedback (Low + informational) ([7d049d8](https://github.com/kaitranntt/ccs/commit/7d049d8f1e8655856a1a9636d21f6eb3992752a0))
* **cliproxy:** mask email in ban detection and fix JSDoc default ([fcc605b](https://github.com/kaitranntt/ccs/commit/fcc605bc1f02af4da518d21c10f8c77b38a793ad))
* **cliproxy:** migrate deprecated gemini-claude-* model names to upstream claude-* names ([#515](https://github.com/kaitranntt/ccs/issues/515)) ([6afbb72](https://github.com/kaitranntt/ccs/commit/6afbb72b472029358fc3d9b2fed488fd4779695b)), closes [#513](https://github.com/kaitranntt/ccs/issues/513)
* **glm:** fix missed help text reference and glm-4.5-air pricing ([7d9c538](https://github.com/kaitranntt/ccs/commit/7d9c538248f93089ae6483af4ea1d01e555e2e20))
* **hooks:** isolate image type check before error-prone processing ([#514](https://github.com/kaitranntt/ccs/issues/514)) ([19de427](https://github.com/kaitranntt/ccs/commit/19de42704f683a29134982dfb643e97c3123bf7c)), closes [#511](https://github.com/kaitranntt/ccs/issues/511)

## [7.42.0](https://github.com/kaitranntt/ccs/compare/v7.41.0...v7.42.0) (2026-02-11)

### Features

* account safety, quota monitoring, and stability fixes ([#530](https://github.com/kaitranntt/ccs/issues/530)) ([0518050](https://github.com/kaitranntt/ccs/commit/051805074eb80db839a4deb8ab1dcb89f29766de)), closes [#515](https://github.com/kaitranntt/ccs/issues/515) [#513](https://github.com/kaitranntt/ccs/issues/513) [#514](https://github.com/kaitranntt/ccs/issues/514) [#511](https://github.com/kaitranntt/ccs/issues/511) [#523](https://github.com/kaitranntt/ccs/issues/523) [#522](https://github.com/kaitranntt/ccs/issues/522) [#516](https://github.com/kaitranntt/ccs/issues/516) [#509](https://github.com/kaitranntt/ccs/issues/509) [#512](https://github.com/kaitranntt/ccs/issues/512) [#529](https://github.com/kaitranntt/ccs/issues/529) [#524](https://github.com/kaitranntt/ccs/issues/524)

## [7.41.0](https://github.com/kaitranntt/ccs/compare/v7.40.0...v7.41.0) (2026-02-11)

### Features

* **config:** add CCS_DIR env var and --config-dir flag for config directory override ([7a0e6a4](https://github.com/kaitranntt/ccs/commit/7a0e6a4112b50dad14bf48004b07a77d1a5fd4d8)), closes [#507](https://github.com/kaitranntt/ccs/issues/507)
* **env:** add ccs env command for third-party tool integration ([2e85064](https://github.com/kaitranntt/ccs/commit/2e85064b8a6a3eed694abb56bef70bf889f648d3)), closes [#503](https://github.com/kaitranntt/ccs/issues/503)
* update cliproxy, config loader, glmt transformer, and provider routes ([8c6afe2](https://github.com/kaitranntt/ccs/commit/8c6afe2e73049ecfbb12cb29a894e83eb2576354))

### Bug Fixes

* **cliproxy:** prevent OAuth process hang on Qwen device code flow ([086bf95](https://github.com/kaitranntt/ccs/commit/086bf958e9c6c9d6d745e78a29a95a9a58490bf1)), closes [#314](https://github.com/kaitranntt/ccs/issues/314)
* **cliproxy:** strip Gemini-unsupported schema fields including "examples" ([505d6d0](https://github.com/kaitranntt/ccs/commit/505d6d0f111b11e4e231742d65d2a3bbfb73864a)), closes [#155](https://github.com/kaitranntt/ccs/issues/155)
* **config:** dynamic health message, cache getters, static imports, cloud hint ([706cca8](https://github.com/kaitranntt/ccs/commit/706cca8b3e57c1f9e6c559dc4c1a18ed6854a96d))
* **config:** lazy-evaluate paths, fix TOCTOU, segment-boundary cloud detection ([d5abc7d](https://github.com/kaitranntt/ccs/commit/d5abc7d69170132cc5c604c453e45f54fa2973b6))
* **config:** migrate all hardcoded paths to getCcsDir() and improve validation ([60d6bbd](https://github.com/kaitranntt/ccs/commit/60d6bbd0271a4bad4df1eaa705c11d34f7abd464))
* **config:** resolve remaining hardcoded paths and improve readability ([c8800b4](https://github.com/kaitranntt/ccs/commit/c8800b418a8ee2143366a2e199c42384ff5693f4))
* **delegation:** use exitCode instead of killed for process termination checks ([4b1fcac](https://github.com/kaitranntt/ccs/commit/4b1fcacf307e0bb8935495202f0322210eb395ea))
* **env:** add key sanitization and shell completions ([76457a5](https://github.com/kaitranntt/ccs/commit/76457a567d7d1fe52a983a3c6e37b49d503071c9))
* **env:** add missing CLIProxy profiles to bash completion and shell validation ([6d9351d](https://github.com/kaitranntt/ccs/commit/6d9351dcbc1baa4135d75361301e36cafc3556a3))
* **env:** address all PR review feedback ([44b3152](https://github.com/kaitranntt/ccs/commit/44b3152d347a7f0c96af4e2e4cd8027ea30634fc))
* **env:** address P1-P3 review items from code review ([3f5ecd4](https://github.com/kaitranntt/ccs/commit/3f5ecd4d6963a25ce909cd7e17fcca610d9dc978))
* **env:** fix fish escaping, profile parsing, and add OPENAI_MODEL mapping ([d5c03d1](https://github.com/kaitranntt/ccs/commit/d5c03d1f2d2ad600b4106a9a2fb38a028d099338))
* **env:** improve empty profile UX and consolidate shell validation constants ([b96eacf](https://github.com/kaitranntt/ccs/commit/b96eacfc06a97e89796620c1ea675aaac290e427))
* **env:** sync CLIProxy profiles across all shell completions and improve error messages ([a98f4a5](https://github.com/kaitranntt/ccs/commit/a98f4a54278f9f8d9e4b30ccccc900514c08b32f))
* **env:** use single quotes to prevent shell injection via eval ([a5dc15d](https://github.com/kaitranntt/ccs/commit/a5dc15d174dec2e39b251d63bc4a4093003fc0cb))
* separate type-only exports and migrate test imports from dist/ to src/ ([0483444](https://github.com/kaitranntt/ccs/commit/048344486456bd561c03a1441060bfc4ca650655))

### Documentation

* update local docs for ccs env command ([38bd562](https://github.com/kaitranntt/ccs/commit/38bd562687865c2cb523734509143390f83a5dcc))

### Code Refactoring

* **config:** DRY precedence logic, dynamic recovery messages, CCS_HOME cloud warning ([9699e01](https://github.com/kaitranntt/ccs/commit/9699e01725c3b33ca1bf24a4eeea7ec7f7e9c220))
* **utils:** extract killWithEscalation to shared process-utils ([90b4627](https://github.com/kaitranntt/ccs/commit/90b4627740ae90374b06e0013c09bd583e1ddb39))

### Tests

* **cliproxy:** add edge case coverage for Gemini schema sanitizer ([917f0bb](https://github.com/kaitranntt/ccs/commit/917f0bbef7b7132dca0c37e474a82a9bb07f0df1))
* **utils:** add unit tests for killWithEscalation ([dc9b276](https://github.com/kaitranntt/ccs/commit/dc9b27623bd3cd92dd1b556329d20fd62043b37b))

## [7.40.0](https://github.com/kaitranntt/ccs/compare/v7.39.0...v7.40.0) (2026-02-07)

### Features

* **cliproxy:** add hybrid catalog sync with CLIProxyAPI ([#485](https://github.com/kaitranntt/ccs/issues/485)) ([c8a0995](https://github.com/kaitranntt/ccs/commit/c8a099509a878f24a211f01ee0000f01020c4d6b)), closes [#477](https://github.com/kaitranntt/ccs/issues/477)
* **cliproxy:** delegate kiro/ghcp token refresh to CLIProxyAPIPlus ([#488](https://github.com/kaitranntt/ccs/issues/488)) ([215c00e](https://github.com/kaitranntt/ccs/commit/215c00e9830e4a604231dd64c01154c91574ace9)), closes [#487](https://github.com/kaitranntt/ccs/issues/487)

### Bug Fixes

* **cliproxy:** disable 1M extended context for opus 4.6 (256k limit) ([#492](https://github.com/kaitranntt/ccs/issues/492)) ([43cd19a](https://github.com/kaitranntt/ccs/commit/43cd19a52b128363c7202590869fb4bd9349b859)), closes [#490](https://github.com/kaitranntt/ccs/issues/490)
* **cliproxy:** guard against empty upstream SSE responses in agy profile ([#489](https://github.com/kaitranntt/ccs/issues/489)) ([545c8b9](https://github.com/kaitranntt/ccs/commit/545c8b9515d5afeda17976f418e22037cc9acef9)), closes [#350](https://github.com/kaitranntt/ccs/issues/350)
* **hooks:** add image analysis env vars for settings-based profiles ([#484](https://github.com/kaitranntt/ccs/issues/484)) ([b0dff7a](https://github.com/kaitranntt/ccs/commit/b0dff7a148c795994c2e3f871db9f60dd1cc737a)), closes [#440](https://github.com/kaitranntt/ccs/issues/440)
* **teams:** propagate CLAUDE_CONFIG_DIR to tmux session for agent teammates ([db88290](https://github.com/kaitranntt/ccs/commit/db88290b9110ba78f484d707ae3e64521db4e622))

### Code Refactoring

* **cliproxy:** check lifecycle events in remaining SSE buffer ([42a3eb1](https://github.com/kaitranntt/ccs/commit/42a3eb150630b3a466b7ec9063a2256ecc38c60e))
* **cliproxy:** deduplicate message_delta/message_stop in synthetic SSE response ([152f543](https://github.com/kaitranntt/ccs/commit/152f5432ae26e42e07ea422b882298033ed66c7f)), closes [#491](https://github.com/kaitranntt/ccs/issues/491)
* **cliproxy:** extract SSE lifecycle tracker and add backpressure handling ([1b3440b](https://github.com/kaitranntt/ccs/commit/1b3440b93962e347797105b9bf92c2aaeb954a27))
* **teams:** use spawnSync array args instead of execSync string ([0f7d5f9](https://github.com/kaitranntt/ccs/commit/0f7d5f97576d68b9c73ea952a4ea5853b0993467))

## [7.39.0](https://github.com/kaitranntt/ccs/compare/v7.38.0...v7.39.0) (2026-02-07)

### Features

* hybrid CLIProxy catalog sync + agent teams env fix ([#486](https://github.com/kaitranntt/ccs/issues/486)) ([0b39493](https://github.com/kaitranntt/ccs/commit/0b394933aec723f77a552b7d951afaf065399a92)), closes [#485](https://github.com/kaitranntt/ccs/issues/485) [#477](https://github.com/kaitranntt/ccs/issues/477)

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
