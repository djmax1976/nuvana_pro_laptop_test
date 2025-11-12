import jwt from "jsonwebtoken";

/**
 * JWT token payload structure
 */
export interface JWTPayload {
  user_id: string;
  email: string;
  roles: string[];
  permissions: string[];
  iat?: number;
  exp?: number;
}

/**
 * Token generation result
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * JWT service for token generation and validation
 * Implements secure JWT token generation with access and refresh tokens
 */
export class AuthService {
  private readonly jwtSecret: string;
  private readonly jwtRefreshSecret: string;
  private readonly accessTokenExpiry: string = "15m"; // 15 minutes
  private readonly refreshTokenExpiry: string = "7d"; // 7 days

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || "";
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || "";

    if (!this.jwtSecret || !this.jwtRefreshSecret) {
      throw new Error(
        "JWT_SECRET and JWT_REFRESH_SECRET must be set in environment variables",
      );
    }
  }

  /**
   * Generate access token with 15 minute expiry
   * @param user_id - User ID from database
   * @param email - User email
   * @param roles - User roles array (empty array if no roles assigned yet)
   * @param permissions - User permissions array (empty array if no permissions assigned yet)
   * @returns Signed JWT access token
   */
  generateAccessToken(
    user_id: string,
    email: string,
    roles: string[] = [],
    permissions: string[] = [],
  ): string {
    const payload: JWTPayload = {
      user_id,
      email,
      roles,
      permissions,
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.accessTokenExpiry as string,
      issuer: "nuvana-backend",
      audience: "nuvana-api",
    } as jwt.SignOptions);
  }

  /**
   * Generate refresh token with 7 day expiry
   * @param user_id - User ID from database
   * @param email - User email
   * @returns Signed JWT refresh token
   */
  generateRefreshToken(user_id: string, email: string): string {
    const payload: Omit<JWTPayload, "roles" | "permissions"> = {
      user_id,
      email,
    };

    return jwt.sign(payload, this.jwtRefreshSecret, {
      expiresIn: this.refreshTokenExpiry as string,
      issuer: "nuvana-backend",
      audience: "nuvana-api",
    } as jwt.SignOptions);
  }

  /**
   * Generate both access and refresh tokens
   * @param user_id - User ID from database
   * @param email - User email
   * @param roles - User roles array
   * @param permissions - User permissions array
   * @returns Token pair with access and refresh tokens
   */
  generateTokenPair(
    user_id: string,
    email: string,
    roles: string[] = [],
    permissions: string[] = [],
  ): TokenPair {
    return {
      accessToken: this.generateAccessToken(user_id, email, roles, permissions),
      refreshToken: this.generateRefreshToken(user_id, email),
    };
  }

  /**
   * Verify and decode access token
   * @param token - JWT access token
   * @returns Decoded token payload
   * @throws Error if token is invalid, expired, or missing
   */
  verifyAccessToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, this.jwtSecret, {
        issuer: "nuvana-backend",
        audience: "nuvana-api",
      }) as JWTPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error("Access token has expired");
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error("Invalid access token");
      }
      throw new Error("Token verification failed");
    }
  }

  /**
   * Verify and decode refresh token
   * @param token - JWT refresh token
   * @returns Decoded token payload with user_id and email
   * @throws Error if token is invalid, expired, or missing
   */
  verifyRefreshToken(token: string): { user_id: string; email: string } {
    try {
      const decoded = jwt.verify(token, this.jwtRefreshSecret, {
        issuer: "nuvana-backend",
        audience: "nuvana-api",
      }) as { user_id: string; email: string };

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error("Refresh token has expired");
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error("Invalid refresh token");
      }
      throw new Error("Token verification failed");
    }
  }
}
