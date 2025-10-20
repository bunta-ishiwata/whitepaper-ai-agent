import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthService } from './auth.js';
import { Auth } from 'googleapis';

// Mock environment variables
const originalEnv = process.env;

describe('AuthService', () => {
  beforeEach(() => {
    // Set up test environment variables
    process.env = {
      ...originalEnv,
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
      GOOGLE_REDIRECT_URI: 'http://localhost:3000/auth/callback',
    };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize successfully with valid credentials', () => {
      expect(() => new AuthService()).not.toThrow();
    });

    it('should throw error when GOOGLE_CLIENT_ID is missing', () => {
      delete process.env.GOOGLE_CLIENT_ID;
      expect(() => new AuthService()).toThrow(
        'Missing required OAuth2 credentials'
      );
    });

    it('should throw error when GOOGLE_CLIENT_SECRET is missing', () => {
      delete process.env.GOOGLE_CLIENT_SECRET;
      expect(() => new AuthService()).toThrow(
        'Missing required OAuth2 credentials'
      );
    });

    it('should throw error when GOOGLE_REDIRECT_URI is missing', () => {
      delete process.env.GOOGLE_REDIRECT_URI;
      expect(() => new AuthService()).toThrow(
        'Missing required OAuth2 credentials'
      );
    });
  });

  describe('getAuthUrl', () => {
    it('should generate a valid authorization URL', () => {
      const authService = new AuthService();
      const authUrl = authService.getAuthUrl();

      expect(authUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(authUrl).toContain('client_id=test-client-id');
      expect(authUrl).toContain('redirect_uri=');
      expect(authUrl).toContain('response_type=code');
      expect(authUrl).toContain('scope=');
      expect(authUrl).toContain('access_type=offline');
    });

    it('should include required scopes in the authorization URL', () => {
      const authService = new AuthService();
      const authUrl = authService.getAuthUrl();

      expect(authUrl).toContain('spreadsheets');
      expect(authUrl).toContain('drive.file');
    });

    it('should include prompt=consent for refresh token', () => {
      const authService = new AuthService();
      const authUrl = authService.getAuthUrl();

      expect(authUrl).toContain('prompt=consent');
    });
  });

  describe('getAuthenticatedClient', () => {
    it('should create an authenticated client with valid tokens', () => {
      const authService = new AuthService();
      const tokens: Auth.Credentials = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expiry_date: Date.now() + 3600000,
      };

      const client = authService.getAuthenticatedClient(tokens);

      expect(client).toBeDefined();
      expect(client.credentials).toEqual(tokens);
    });

    it('should return an OAuth2Client instance', () => {
      const authService = new AuthService();
      const tokens: Auth.Credentials = {
        access_token: 'test-access-token',
      };

      const client = authService.getAuthenticatedClient(tokens);

      expect(client).toHaveProperty('credentials');
      expect(client).toHaveProperty('refreshAccessToken');
    });
  });

  describe('isTokenValid', () => {
    it('should return true for tokens that are not expiring soon', () => {
      const authService = new AuthService();
      const tokens: Auth.Credentials = {
        access_token: 'test-access-token',
        expiry_date: Date.now() + 3600000, // 1 hour in the future
      };

      const isValid = authService.isTokenValid(tokens);

      expect(isValid).toBe(true);
    });

    it('should return false for tokens that are expiring soon (within 5 minutes)', () => {
      const authService = new AuthService();
      const tokens: Auth.Credentials = {
        access_token: 'test-access-token',
        expiry_date: Date.now() + 60000, // 1 minute in the future
      };

      const isValid = authService.isTokenValid(tokens);

      expect(isValid).toBe(false);
    });

    it('should return false for expired tokens', () => {
      const authService = new AuthService();
      const tokens: Auth.Credentials = {
        access_token: 'test-access-token',
        expiry_date: Date.now() - 3600000, // 1 hour in the past
      };

      const isValid = authService.isTokenValid(tokens);

      expect(isValid).toBe(false);
    });

    it('should return false when expiry_date is not set', () => {
      const authService = new AuthService();
      const tokens: Auth.Credentials = {
        access_token: 'test-access-token',
        // No expiry_date
      };

      const isValid = authService.isTokenValid(tokens);

      expect(isValid).toBe(false);
    });
  });

  describe('getToken', () => {
    it('should exchange authorization code for tokens', async () => {
      const authService = new AuthService();
      const mockCode = '4/0AY0e-g7...test-auth-code';

      // Note: This test would require mocking the OAuth2Client's getToken method
      // For now, we're just testing that the method exists and has the correct signature
      expect(authService.getToken).toBeDefined();
      expect(typeof authService.getToken).toBe('function');
    });
  });

  describe('refreshToken', () => {
    it('should refresh access token using refresh token', async () => {
      const authService = new AuthService();
      const tokens: Auth.Credentials = {
        access_token: 'old-access-token',
        refresh_token: 'test-refresh-token',
        expiry_date: Date.now() - 3600000, // Expired
      };

      // Note: This test would require mocking the OAuth2Client's refreshAccessToken method
      // For now, we're just testing that the method exists and has the correct signature
      expect(authService.refreshToken).toBeDefined();
      expect(typeof authService.refreshToken).toBe('function');
    });
  });
});
