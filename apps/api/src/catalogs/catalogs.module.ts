import { Module } from "@nestjs/common";

import { CatalogsController } from "./catalogs.controller";
import { CATALOG_REPOSITORY } from "./catalogs.contracts";
import { CatalogsService } from "./catalogs.service";
import { SupabaseCatalogRepository } from "./supabase-catalog.repository";

@Module({
  controllers: [CatalogsController],
  providers: [
    CatalogsService,
    { provide: CATALOG_REPOSITORY, useClass: SupabaseCatalogRepository },
  ],
  exports: [CatalogsService, CATALOG_REPOSITORY],
})
export class CatalogsModule {}
