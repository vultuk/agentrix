import { createRepositoryService } from '../services/index.js';
import { handleHeadRequest } from '../utils/http.js';
import { asyncHandler } from '../infrastructure/errors/index.js';
import { createHandler } from './base-handler.js';
import type { RequestContext } from '../types/http.js';
import {
  validateRepositoryCreate,
  validateRepositoryDelete,
  validateInitCommandUpdate,
} from '../validation/index.js';

export function createRepoHandlers(workdir: string) {
  const repositoryService = createRepositoryService(workdir);

  const list = asyncHandler(async (context: RequestContext) => {
    if (context.method === 'HEAD') {
      handleHeadRequest(context.res);
      return;
    }
    
    const data = await repositoryService.listRepositories();
    context.res.setHeader('Cache-Control', 'no-store');
    context.res.statusCode = 200;
    context.res.setHeader('Content-Type', 'application/json; charset=utf-8');
    context.res.end(JSON.stringify({ data }));
  });

  const create = createHandler({
    validator: validateRepositoryCreate,
    handler: async (input: { url: string; initCommand: string }) => 
      repositoryService.addRepository(input.url, input.initCommand),
  });

  const deleteRepo = createHandler({
    validator: validateRepositoryDelete,
    handler: async (input: { org: string; repo: string }) => {
      const data = await repositoryService.deleteRepository(input.org, input.repo);
      return { data };
    },
  });

  const updateInitCommand = createHandler({
    validator: validateInitCommandUpdate,
    handler: async (input: { org: string; repo: string; initCommand: string }) => {
      const data = await repositoryService.updateInitCommand(input.org, input.repo, input.initCommand);
      return { data };
    },
  });

  return { 
    list, 
    create, 
    delete: deleteRepo,
    // Deprecated alias for backward compatibility
    destroy: deleteRepo,
    updateInitCommand 
  };
}
