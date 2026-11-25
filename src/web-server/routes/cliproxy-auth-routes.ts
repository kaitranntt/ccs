/**
 * CLIProxy Auth Routes - Thin router facade and public validation helper exports.
 */

import { Router, Request, Response } from 'express';
import { requireLocalAccessWhenAuthDisabled } from '../middleware/auth-middleware';
import { registerCliproxyAuthAccountRoutes } from './cliproxy-auth-accounts-routes';
import { registerCliproxyAuthOAuthRoutes } from './cliproxy-auth-oauth-routes';
import { registerCliproxyAuthManualRoutes } from './cliproxy-auth-manual-routes';

export {
  getKiroStartIDCValidationError,
  getStartUrlUnsupportedReason,
  getStartAuthFailureMessage,
  getStartAuthUnsupportedReason,
  getStartAuthNicknameError,
  getReauthAccountTarget,
} from './cliproxy-auth-validators';

const router = Router();

router.use((req: Request, res: Response, next) => {
  if (
    requireLocalAccessWhenAuthDisabled(
      req,
      res,
      'CLIProxy auth endpoints require localhost access when dashboard auth is disabled.'
    )
  ) {
    next();
  }
});

registerCliproxyAuthAccountRoutes(router);
registerCliproxyAuthOAuthRoutes(router);
registerCliproxyAuthManualRoutes(router);

export default router;
