import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('v1', { exclude: ['docs', 'health'] });
  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:3100').split(',').map((s) => s.trim());
  app.enableCors({ origin: origins, credentials: true });

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
