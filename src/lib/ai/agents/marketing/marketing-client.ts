/**
 * Singurul import permis din interfață pentru Marketing Agent: reexportă doar
 * server functions și module pure de etichete, ca UI-ul să nu atingă niciodată
 * providerul, cheile sau prompturile.
 */
export {
  generateMarketing,
  proposeMarketingAction,
  decideMarketingAction,
  listMarketingAgentRuns,
  listPropertyMarketingDrafts,
  listMarketingProperties,
  type MarketingTurn,
  type MarketingRun,
  type MarketingDecisionResult,
  type MarketingDraft,
  type MarketingPropertyOption,
} from "./marketing.functions";

export {
  MARKETING_CHANNELS,
  MARKETING_CHANNEL_SPECS,
  MARKETING_CONTENT_TYPES,
  MARKETING_CONTENT_TYPE_LABELS,
  MARKETING_LENGTHS,
  MARKETING_LENGTH_LABELS,
  MARKETING_TONES,
  MARKETING_TONE_LABELS,
  type MarketingChannel,
  type MarketingContentType,
  type MarketingLength,
  type MarketingTone,
} from "./channels";
