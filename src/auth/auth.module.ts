import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard, SupabaseJwtAuthGuard } from './guards';
import { SupabaseService } from './supabase.service';

/**
 * Authentication Module
 * 
 * Supabase-based authentication.
 * 
 * FEATURES:
 * - JWT verification using Supabase JWT secret (HS256)
 * - OAuth support (GitHub, Google, etc.)
 * - User sync to Supabase Postgres
 * - WebSocket AUTH with Supabase tokens
 */
@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const supabaseUrl = configService.get<string>('SUPABASE_URL', '');
        const jwtSecret = configService.get<string>('SUPABASE_JWT_SECRET', '');
        
        return {
          secret: jwtSecret,
          signOptions: {
            algorithm: 'HS256',
            expiresIn: '1h',
            issuer: `${supabaseUrl}/auth/v1`,
            audience: 'authenticated',
          },
          verifyOptions: {
            algorithms: ['HS256'],
            issuer: `${supabaseUrl}/auth/v1`,
            audience: 'authenticated',
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [SupabaseService, AuthService, JwtStrategy, JwtAuthGuard, SupabaseJwtAuthGuard],
  exports: [AuthService, SupabaseService, JwtAuthGuard, SupabaseJwtAuthGuard],
})
export class AuthModule {}
