/**
 * Assembled Provider Model Catalog Data
 */

import type { CLIProxyProvider } from './types';
import type { ProviderCatalog } from './model-catalog-types';
import { CLAUDE_MODEL_CATALOG } from './model-catalog-data/claude';
import { CODEX_MODEL_CATALOG } from './model-catalog-data/codex';
import {
  AGY_MODEL_CATALOG,
  GEMINI_MODEL_CATALOG,
  KIMI_MODEL_CATALOG,
  QODER_MODEL_CATALOG,
  XAI_MODEL_CATALOG,
} from './model-catalog-data/other-providers';

export const MODEL_CATALOG: Partial<Record<CLIProxyProvider, ProviderCatalog>> = {
  agy: AGY_MODEL_CATALOG,
  gemini: GEMINI_MODEL_CATALOG,
  codex: CODEX_MODEL_CATALOG,
  xai: XAI_MODEL_CATALOG,
  qoder: QODER_MODEL_CATALOG,
  kimi: KIMI_MODEL_CATALOG,
  claude: CLAUDE_MODEL_CATALOG,
};
