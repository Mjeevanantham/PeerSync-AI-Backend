import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as fs from 'fs';
import * as path from 'path';
import { JwtPayload, AuthenticatedUser } from '../../common/types';
import { ErrorCodes, ErrorMessages } from '../../common/constants';

/**
 * JWT Strategy for Passport (HTTP requests)
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService) {
    const publicKeyPath = configService.get<string>(
      'JWT_PUBLIC_KEY_PATH',
      './keys/public.pem',
    );

    const publicKey = fs.readFileSync(
      path.resolve(process.cwd(), publicKeyPath),
      'utf8',
    );

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: publicKey,
      algorithms: ['RS256'],
      issuer: configService.get<string>('JWT_ISSUER', 'peersync-dev-connect'),
      audience: configService.get<string>('JWT_AUDIENCE', 'peersync-clients'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload.sub || !payload.email) {
      throw new UnauthorizedException(ErrorMessages[ErrorCodes.AUTH_TOKEN_INVALID]);
    }

    return {
      userId: payload.sub,
      email: payload.email,
      displayName: payload.name,
      roles: payload.roles || [],
    };
  }
}
