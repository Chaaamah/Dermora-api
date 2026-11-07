import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { validateJwtSecrets } from './common/auth';

async function bootstrap() {
  validateJwtSecrets();
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('v1', { exclude: ['docs', 'health'] });
  // Tolère les erreurs de saisie (<https://…>, guillemets, / final) ; « * » autorisé dans un motif (ex. https://dermora-*.vercel.app)
  const clean = (s: string) => s.trim().replace(/^[<"'\s]+|[>"'\s]+$/g, '').replace(/\/+$/, '');
  const allowed = (process.env.CORS_ORIGINS ?? 'http://localhost:3100').split(',').map(clean).filter(Boolean)
    .map((o) => (o.includes('*') ? new RegExp(`^${o.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9-]+')}$`) : o));
  app.enableCors({ origin: allowed, credentials: true });
  // eslint-disable-next-line no-console
  console.log(`CORS autorisé : ${allowed.map(String).join(', ')}`);

  const config = new DocumentBuilder()
    .setTitle('Dermora API')
    .setDescription('Care Beyond Beauty — analyse cosmétique, routines, produits disponibles au Maroc')
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`Dermora API → http://localhost:${port}/v1  ·  Swagger → http://localhost:${port}/docs`);
}
bootstrap();
