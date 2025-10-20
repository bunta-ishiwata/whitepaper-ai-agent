import { google, Auth } from 'googleapis';
import { Logger } from '../utils/logger.js';

const logger = new Logger('AuthService');

/**
 * Authentication Service
 * Handles OAuth2 authentication flow for Google APIs
 */
export class AuthService {
  private oauth2Client: Auth.OAuth2Client;

  /**
   * Initializes the AuthService with OAuth2 credentials
   * @throws {Error} If required environment variables are missing
   */
  constructor() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error(
        'Missing required OAuth2 credentials: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI must be set'
      );
    }

    this.oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    logger.info('AuthService initialized with OAuth2 credentials');
  }

  /**
   * Generates the Google OAuth2 consent URL
   * @returns The authorization URL to redirect users to
   * @example
   * ```typescript
   * const authService = new AuthService();
   * const url = authService.getAuthUrl();
   * // Redirect user to: https://accounts.google.com/o/oauth2/v2/auth?...
   * ```
   */
  getAuthUrl(): string {
    const scopes = [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/script.projects',
    ];

    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent', // Force consent screen to ensure refresh token
    });

    logger.info('Generated OAuth2 authorization URL');
    return authUrl;
  }

  /**
   * Exchanges an authorization code for access and refresh tokens
   * @param code - The authorization code from the OAuth2 callback
   * @returns Promise resolving to the token response
   * @throws {Error} If token exchange fails
   * @example
   * ```typescript
   * const authService = new AuthService();
   * const tokens = await authService.getToken('4/0AY0e-g7...');
   * // tokens: { access_token, refresh_token, expiry_date, ... }
   * ```
   */
  async getToken(code: string): Promise<Auth.Credentials> {
    try {
      logger.info('Exchanging authorization code for tokens');
      const { tokens } = await this.oauth2Client.getToken(code);
      logger.info('Successfully obtained tokens');
      return tokens;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to exchange authorization code', error instanceof Error ? error : new Error(errorMessage));
      throw new Error(`Failed to exchange authorization code: ${errorMessage}`);
    }
  }

  /**
   * Creates an authenticated OAuth2Client with the provided tokens
   * @param tokens - The OAuth2 credentials (access token, refresh token, etc.)
   * @returns An authenticated OAuth2Client instance
   * @example
   * ```typescript
   * const authService = new AuthService();
   * const authenticatedClient = authService.getAuthenticatedClient(tokens);
   * // Use with Google APIs: google.sheets({ version: 'v4', auth: authenticatedClient })
   * ```
   */
  getAuthenticatedClient(tokens: Auth.Credentials): Auth.OAuth2Client {
    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    client.setCredentials(tokens);
    logger.info('Created authenticated OAuth2 client');
    return client;
  }

  /**
   * Refreshes the access token using the refresh token
   * @param tokens - The current OAuth2 credentials with a refresh token
   * @returns Promise resolving to the refreshed tokens
   * @throws {Error} If token refresh fails
   * @example
   * ```typescript
   * const authService = new AuthService();
   * const newTokens = await authService.refreshToken(oldTokens);
   * ```
   */
  async refreshToken(tokens: Auth.Credentials): Promise<Auth.Credentials> {
    try {
      logger.info('Refreshing access token');
      const client = this.getAuthenticatedClient(tokens);
      const { credentials } = await client.refreshAccessToken();
      logger.info('Successfully refreshed access token');
      return credentials;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to refresh access token', error instanceof Error ? error : new Error(errorMessage));
      throw new Error(`Failed to refresh access token: ${errorMessage}`);
    }
  }

  /**
   * Validates if the tokens are still valid or need refreshing
   * @param tokens - The OAuth2 credentials to validate
   * @returns True if tokens are valid, false if they need refreshing
   */
  isTokenValid(tokens: Auth.Credentials): boolean {
    if (!tokens.expiry_date) {
      logger.warn('No expiry date found in tokens');
      return false;
    }

    const expiryDate = new Date(tokens.expiry_date);
    const now = new Date();
    const bufferTime = 5 * 60 * 1000; // 5 minutes buffer

    const isValid = expiryDate.getTime() - now.getTime() > bufferTime;
    logger.debug(`Token validity check: ${isValid ? 'valid' : 'expired/expiring soon'}`);
    return isValid;
  }
}
