import { Router, Request, Response } from 'express';
import { AuthService } from '../services/auth.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger('AuthRoute');
const router = Router();

/**
 * GET /auth/login
 *
 * Initiates the OAuth2 authentication flow by redirecting the user
 * to Google's consent screen.
 *
 * @route GET /auth/login
 * @group Authentication - OAuth2 authentication operations
 *
 * @returns {void} 302 - Redirects to Google OAuth consent page
 * @returns {object} 500 - Internal server error
 *
 * @example
 * // Browser navigation or redirect
 * window.location.href = 'http://localhost:3000/auth/login';
 */
router.get('/login', (_req: Request, res: Response): void => {
  try {
    logger.info('Initiating OAuth2 login flow');
    const authService = new AuthService();
    const authUrl = authService.getAuthUrl();

    logger.info('Redirecting to Google OAuth consent screen');
    res.redirect(authUrl);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to initiate OAuth2 login', error instanceof Error ? error : new Error(errorMessage));

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to initiate authentication',
    });
  }
});

/**
 * GET /auth/callback
 *
 * Handles the OAuth2 callback from Google. Exchanges the authorization
 * code for access and refresh tokens, then saves them to the session.
 *
 * @route GET /auth/callback
 * @group Authentication - OAuth2 authentication operations
 *
 * @param {string} code - Authorization code from Google (query parameter)
 * @param {string} [error] - Error message if authentication failed (query parameter)
 *
 * @returns {object} 200 - Success response with authentication confirmation
 * @returns {object} 400 - Bad request (missing or invalid code)
 * @returns {object} 500 - Internal server error
 *
 * @example
 * // This endpoint is called automatically by Google after user consent
 * // Example callback URL:
 * // http://localhost:3000/auth/callback?code=4/0AY0e-g7...&scope=https://www.googleapis.com/auth/spreadsheets...
 */
router.get('/callback', async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, error: authError } = req.query;

    // Check for authentication errors from Google
    if (authError) {
      logger.warn(`OAuth2 authentication error: ${authError}`);
      res.status(400).json({
        error: 'Authentication Failed',
        message: `Google authentication error: ${authError}`,
      });
      return;
    }

    // Validate authorization code
    if (!code || typeof code !== 'string') {
      logger.warn('OAuth2 callback missing authorization code');
      res.status(400).json({
        error: 'Bad Request',
        message: 'Missing authorization code',
      });
      return;
    }

    logger.info('Processing OAuth2 callback with authorization code');
    const authService = new AuthService();

    // Exchange code for tokens
    const tokens = await authService.getToken(code);

    // Save tokens to session
    if (!req.session) {
      throw new Error('Session not initialized');
    }

    req.session.tokens = tokens;
    req.session.authenticated = true;

    logger.info('Successfully authenticated user and saved tokens to session');

    // Redirect to test page after successful authentication
    res.redirect('/test.html');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('OAuth2 callback failed', error instanceof Error ? error : new Error(errorMessage));

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to complete authentication',
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
    });
  }
});

/**
 * GET /auth/status
 *
 * Check the current authentication status of the user.
 *
 * @route GET /auth/status
 * @group Authentication - OAuth2 authentication operations
 *
 * @returns {object} 200 - Authentication status
 *
 * @example
 * curl http://localhost:3000/auth/status
 */
router.get('/status', (req: Request, res: Response): void => {
  try {
    const isAuthenticated = req.session?.authenticated === true;
    const hasTokens = !!req.session?.tokens;

    logger.debug(`Authentication status check: ${isAuthenticated ? 'authenticated' : 'not authenticated'}`);

    res.status(200).json({
      authenticated: isAuthenticated,
      hasTokens: hasTokens,
      message: isAuthenticated
        ? 'You are authenticated and can use the /generate endpoint'
        : 'You are not authenticated. Please visit /auth/login to authenticate',
      loginUrl: isAuthenticated ? null : '/auth/login',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to check authentication status', error instanceof Error ? error : new Error(errorMessage));

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to check authentication status',
    });
  }
});

/**
 * POST /auth/logout
 *
 * Logs out the user by destroying the session.
 *
 * @route POST /auth/logout
 * @group Authentication - OAuth2 authentication operations
 *
 * @returns {object} 200 - Logout successful
 * @returns {object} 500 - Internal server error
 *
 * @example
 * curl -X POST http://localhost:3000/auth/logout
 */
router.post('/logout', (req: Request, res: Response): void => {
  try {
    logger.info('User logout requested');

    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          logger.error('Failed to destroy session', err);
          res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to logout',
          });
          return;
        }

        logger.info('User logged out successfully');
        res.status(200).json({
          success: true,
          message: 'Logged out successfully',
        });
      });
    } else {
      res.status(200).json({
        success: true,
        message: 'No active session',
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Logout failed', error instanceof Error ? error : new Error(errorMessage));

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to logout',
    });
  }
});

export { router as authRouter };
