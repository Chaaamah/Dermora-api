import { Global, Injectable, Module, OnModuleInit } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { AuthGuard } from './auth';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}

/** Journal d'audit : chaque accès à un profil ou à une photo est tracé. */
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}
  log(actorId: string, action: string, object: string) {
    return this.prisma.auditLog.create({ data: { actorId, action, object } }).catch(() => undefined);
  }
}

@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [PrismaService, AuditService, AuthGuard],
  exports: [PrismaService, AuditService, JwtModule, AuthGuard],
})
export class CommonModule {}
