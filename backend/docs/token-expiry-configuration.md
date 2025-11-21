# Token Expiry Configuration Guide

## Overview

The authentication system uses role-based JWT token expiration to balance security and user experience. This document provides production-grade configuration guidance.

## Configuration

### Environment Variables

```bash
# Regular user access token expiry (default: 1h)
ACCESS_TOKEN_EXPIRY=1h

# Super admin access token expiry (default: 8h)
SUPER_ADMIN_TOKEN_EXPIRY=8h

# Refresh token expiry for all users (default: 7d)
REFRESH_TOKEN_EXPIRY=7d
```

### Time Format

Use standard JWT expiry time formats:
- **Seconds**: `3600` or `"3600"`
- **Minutes**: `"15m"` (15 minutes)
- **Hours**: `"1h"` (1 hour)
- **Days**: `"7d"` (7 days)

## Token Types & Behavior

### Access Tokens

**Regular Users (1 hour default)**
- Used for API authentication
- Stored in httpOnly cookies
- Automatically refreshed when expired
- Shorter duration = better security

**Super Admins (8 hours default)**
- Extended session for administrative tasks
- Reduces interruptions during complex operations
- Audit logged for security compliance

### Refresh Tokens (7 days default)

- Used to obtain new access tokens
- Stored in Redis for revocation capability
- Determines total session length
- Rotated on each use for security

## Production Recommendations

### Security Tiers

#### High Security (Financial, Healthcare)
```bash
ACCESS_TOKEN_EXPIRY=15m
SUPER_ADMIN_TOKEN_EXPIRY=1h
REFRESH_TOKEN_EXPIRY=1d
```

#### Standard Business Application (Recommended)
```bash
ACCESS_TOKEN_EXPIRY=1h
SUPER_ADMIN_TOKEN_EXPIRY=8h
REFRESH_TOKEN_EXPIRY=7d
```

#### Low Security (Internal Tools)
```bash
ACCESS_TOKEN_EXPIRY=4h
SUPER_ADMIN_TOKEN_EXPIRY=24h
REFRESH_TOKEN_EXPIRY=30d
```

## Security Features

### Audit Logging

Super admin token generation is automatically logged:

```
[AUDIT] Super admin token generated: {
  user_id: "abc-123",
  email: "admin@example.com",
  expiresIn: "8h",
  timestamp: "2025-01-21T10:30:00.000Z",
  client_id: "N/A"
}
```

**Production Recommendations:**
1. Send audit logs to a SIEM system (Datadog, Splunk, etc.)
2. Set up alerts for unusual patterns:
   - Multiple super admin logins from different IPs
   - Super admin logins outside business hours
   - High frequency of token generation

### Token Rotation

Refresh tokens are automatically rotated on each use:
- Old refresh token is invalidated in Redis
- New refresh token is issued
- Prevents replay attacks

### Redis Dependency

**Critical:** Refresh token validation requires Redis. If Redis is unavailable:
- Token verification fails securely
- Users must re-authenticate
- Ensure Redis high availability in production

## Monitoring & Alerting

### Recommended Metrics

1. **Token Generation Rate**
   - Monitor super admin token generation frequency
   - Alert on spikes (possible credential compromise)

2. **Token Refresh Patterns**
   - Track refresh token usage
   - High refresh rates may indicate UX issues

3. **Failed Authentications**
   - Monitor 401 responses
   - Alert on brute force attempts

### Implementation Example

```typescript
// Add to your monitoring service
metrics.increment('auth.token.generated', {
  role: isSuperAdmin ? 'super_admin' : 'user',
  expiry: expiresIn
});
```

## Compliance Considerations

### GDPR / Privacy

- Token expiry affects data retention
- Shorter expiry = better privacy compliance
- Document token lifetime in privacy policy

### SOC 2 / ISO 27001

- Audit logs satisfy access control requirements
- Role-based expiry demonstrates least privilege
- Regular token rotation meets security standards

### PCI-DSS (if handling payments)

- Consider 15-minute access tokens
- Implement MFA for super admins
- Log all token operations

## Troubleshooting

### Users Logged Out Too Frequently

**Symptom:** Users complain about re-authentication
**Solution:**
1. Check `ACCESS_TOKEN_EXPIRY` - increase to 1h-4h
2. Check `REFRESH_TOKEN_EXPIRY` - increase to 7d-30d
3. Verify refresh token rotation is working

### Super Admins Session Timeout

**Symptom:** Admins lose sessions during long operations
**Solution:**
1. Increase `SUPER_ADMIN_TOKEN_EXPIRY` to 8h-24h
2. Consider implementing "remember me" functionality
3. Add activity-based token refresh

### Security Audit Flags

**Symptom:** Audit flags long-lived tokens as risk
**Solution:**
1. Reduce `ACCESS_TOKEN_EXPIRY` to 15m-30m
2. Keep `REFRESH_TOKEN_EXPIRY` at 7d max
3. Implement automatic logout on inactivity

## Migration Guide

### Updating Token Expiry

1. Update environment variables
2. Restart backend service
3. Existing tokens maintain their original expiry
4. New tokens use updated configuration
5. No database migration required

### Rolling Back

Simply revert environment variables and restart. No data loss occurs.

## Testing

Verify configuration with the test suite:

```bash
npm run test tests/api/role-based-token-expiry.api.spec.ts
```

Expected results:
- ✅ Super admin receives 8 hour token (or configured value)
- ✅ Regular user receives 1 hour token (or configured value)
- ✅ Multi-role users with SUPER_ADMIN get extended expiry
- ✅ Users with no roles get default expiry

## Support & Questions

For issues or questions about token configuration:
1. Check application logs for `[AuthService]` configuration output
2. Verify environment variables are loaded correctly
3. Review audit logs for token generation patterns
4. Contact security team for compliance questions
