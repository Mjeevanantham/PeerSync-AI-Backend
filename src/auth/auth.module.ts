import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards';

/**
 * Authentication Module
 * 
 * JWT-based authentication using RS256.
 */
@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        signOptions: {
          algorithm: 'RS256',
          expiresIn: configService.get<string>('JWT_EXPIRATION', '1h'),
          issuer: configService.get<string>('JWT_ISSUER', 'peersync-dev-connect'),
          audience: configService.get<string>('JWT_AUDIENCE', 'peersync-clients'),
        },
        verifyOptions: {
          algorithms: ['RS256'],
          issuer: configService.get<string>('JWT_ISSUER', 'peersync-dev-connect'),
          audience: configService.get<string>('JWT_AUDIENCE', 'peersync-clients'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
