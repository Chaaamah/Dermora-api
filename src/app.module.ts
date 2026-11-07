import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SkipThrottle, ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './common/throttle';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { MeModule } from './me/me.module';
import { CatalogModule } from './catalog/catalog.module';
import { ScansModule } from './scans/scans.module';
import { RoutinesModule } from './routines/routines.module';
import { CareModule } from './care/care.module';
import { ProModule } from './pro/pro.module';
import { AssistantModule } from './assistant/assistant.module';
import { CheckerModule } from './checker/checker.module';
import { AdminModule } from './admin/admin.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MessagingModule } from './messaging/messaging.service';
import { AdsModule } from './ads/ads.module';
import { RemindersModule } from './reminders/reminders.module';

@SkipThrottle()
@Controller()
class HealthController {
  @Get('health')
  health() {
    return { ok: true, service: 'dermora-api', time: new Date().toISOString() };
  }
}

@Module({
  imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }], errorMessage: 'Trop de tentatives : réessayez dans une minute.' }), CommonModule, NotificationsModule, MessagingModule, AdsModule, RemindersModule, AuthModule, MeModule, CatalogModule, ScansModule, RoutinesModule, CareModule, ProModule, AssistantModule, AdminModule, CheckerModule],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class AppModule {}
