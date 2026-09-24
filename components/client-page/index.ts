/**
 * Legacy wizard shell modules extracted from the former monolithic ClientPage.
 * Home UI is ViewingChatApp; these keep the wizard testable and reviewable.
 */
export { ClientPage } from "./ClientPage";
export { useBillingEntitlement } from "./useBillingEntitlement";
export {
  resolveExistingLocalSessionId,
  createStableLocalSessionId,
  ensureLocalSessionId,
} from "./local-session-id";
export { WizardHeaderBilling } from "./WizardHeaderBilling";
export { PaywallDialog } from "./PaywallDialog";
