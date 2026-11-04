import { Controller, Get, Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { MeModule } from './me/me.module';
import { CatalogModule } from './catalog/catalog.module';
import { ScansModule } from './scans/scans.module';
import { RoutinesModule } from './routines/routines.module';
import { CareModule } from './care/care.module';
import { ProModule } from './pro/pro.module';
import { AssistantModule } from './assistant/assistant.module';
import { AdminModule } from './admin/admin.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MessagingModule } from './messaging/messaging.service';
import { AdsModule } from './ads/ads.module';

@Controller()
class HealthController {
  @Get('health')
  health() {
    return { ok: true, service: 'dermora-api', time: new Date().toISOString() };
  }
}

@Module({
  imports: [CommonModule, NotificationsModule, MessagingModule, AdsModule, AuthModule, MeModule, CatalogModule, ScansModule, RoutinesModule, CareModule, ProModule, AssistantModule, AdminModule],
  controllers: [HealthController],
})
export class AppModule {}
