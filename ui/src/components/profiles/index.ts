/**
 * Profiles Components Barrel Export
 */

// Main profile components
export { ProfileCard } from './profile-card';
export { ProfileCreateDialog } from './profile-create-dialog';
export { ProfileDeck } from './profile-deck';
export { ProfileDialog } from './profile-dialog';
export { ProfilesTable } from './profiles-table';

// Profile editor (from subdirectory)
export { ProfileEditor } from './editor';
export type { Settings, SettingsResponse, ProfileEditorProps } from './editor';

// OpenRouter components
export { OpenRouterBadge } from './openrouter-badge';
export { OpenRouterBanner } from './openrouter-banner';
export { OpenRouterModelPicker } from './openrouter-model-picker';
export { OpenRouterPromoCard } from './openrouter-promo-card';
export { OpenRouterQuickStart } from './openrouter-quick-start';
export { AlibabaCodingPlanPromoCard } from './alibaba-coding-plan-promo-card';

// CCS Bar (native macOS menu-bar app) promo components
export { CcsBarBanner } from './ccs-bar-banner';
export { CcsBarPromoCard } from './ccs-bar-promo-card';

export { ModelTierMapping } from './model-tier-mapping';
export type { TierMapping } from './model-tier-mapping';
