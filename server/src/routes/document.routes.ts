import { Router, raw } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import { idSchema } from '../validators/core.js';
import { accessibleProject, projectScope } from '../services/project.service.js';
import { taskScope, canManageProject } from '../services/task.service.js';
import { audit, notFound, conflict, pageResult } from '../services/core.service.js';
import {
  localStorage,
  inspectUpload,
  uploadLimit,
  type PrivateStorage,
} from '../services/storage.service.js';
import { AppError } from '../utils/errors.js';
type User = NonNullable<Express.Request['user']>;
const scope = (user: User): Prisma.ProjectDocumentWhereInput => ({
  project: { ...projectScope(user), archivedAt: null },
  OR: [{ taskId: null }, { task: { ...taskScope(user), archivedAt: null } }],
});
const include = {
  uploadedBy: { select: { id: true, name: true } },
  task: { select: { id: true, title: true } },
} as const;
export function documentRoutes(db: PrismaClient, storage: PrivateStorage = localStorage()) {
  const router = Router();
  router.get('/projects/:id/documents', async (req, res) => {
    const projectId = idSchema.parse(req.params.id);
    await accessibleProject(db, projectId, req.user!);
    const q = z
      .object({
        page: z.coerce.number().int().min(1).max(100000).default(1),
        pageSize: z.coerce.number().int().min(1).max(50).default(20),
        taskId: z.uuid().optional(),
      })
      .strict()
      .parse(req.query);
    const where = { projectId, archivedAt: null, ...scope(req.user!), taskId: q.taskId };
    const [items, total] = await db.$transaction([
      db.projectDocument.findMany({
        where,
        include: { ...include, project: { select: { managerId: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      db.projectDocument.count({ where }),
    ]);
    res.json({
      data: pageResult(
        items.map(({ objectKey: _key, sha256: _hash, ...item }) => {
          void _key;
          void _hash;
          return {
            ...item,
            canArchive:
              item.uploadedById === req.user!.id || canManageProject(req.user!, item.project),
          };
        }),
        total,
        q.page,
        q.pageSize,
      ),
    });
  });
  router.post(
    '/projects/:id/documents',
    rateLimit({ windowMs: 60000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false }),
    raw({ type: 'application/octet-stream', limit: uploadLimit() }),
    async (req, res) => {
      const projectId = idSchema.parse(req.params.id);
      const q = z.object({ taskId: z.uuid().optional() }).strict().parse(req.query);
      let name: string;
      try {
        name = decodeURIComponent(req.get('x-file-name') ?? '');
      } catch {
        throw new AppError(422, 'INVALID_FILENAME', 'Invalid filename.');
      }
      const data = req.body;
      if (!Buffer.isBuffer(data)) throw new AppError(415, 'INVALID_FILE', 'Send a binary file.');
      const mimeType = inspectUpload(name, data);
      // Check authorization before writing bytes; recheck under project lock before metadata commit.
      await accessibleProject(db, projectId, req.user!);
      let key: string | undefined;
      try {
        const item = await db.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId}::uuid FOR SHARE`;
            const project = await accessibleProject(tx, projectId, req.user!);
            if (project.archivedAt) conflict('Archived projects cannot receive uploads.');
            if (
              q.taskId &&
              !(await tx.task.count({
                where: { id: q.taskId, projectId, archivedAt: null, ...taskScope(req.user!) },
              }))
            )
              notFound();
            key = await storage.put(data);
            const item = await tx.projectDocument.create({
              data: {
                projectId,
                taskId: q.taskId,
                originalName: name,
                objectKey: key,
                mimeType,
                size: data.length,
                sha256: createHash('sha256').update(data).digest('hex'),
                uploadedById: req.user!.id,
              },
              include,
            });
            await audit(
              tx,
              req.user!.id,
              'document.uploaded',
              q.taskId ? 'Task' : 'Project',
              q.taskId ?? projectId,
              { documentId: item.id },
            );
            if (project.managerId !== req.user!.id)
              await tx.notification.createMany({
                data: [
                  {
                    recipientId: project.managerId,
                    projectId,
                    taskId: q.taskId,
                    entityType: q.taskId ? 'Task' : 'Project',
                    entityId: q.taskId ?? projectId,
                    type: 'document.uploaded',
                    title: 'Project document uploaded',
                    message: project.name,
                    dedupeKey: `document:${item.id}`,
                  },
                ],
                skipDuplicates: true,
              });
            const { objectKey: _key, sha256: _hash, ...result } = item;
            void _key;
            void _hash;
            return result;
          },
          { timeout: 15000 },
        );
        res.status(201).json({ data: item });
      } catch (error) {
        if (key)
          await storage.remove(key).catch(() => console.error('Orphan upload cleanup required.'));
        throw error;
      }
    },
  );
  router.get('/documents/:id/download', async (req, res) => {
    const item =
      (await db.projectDocument.findFirst({
        where: { id: idSchema.parse(req.params.id), archivedAt: null, ...scope(req.user!) },
      })) ?? notFound();
    let data: Buffer;
    try {
      data = await storage.read(item.objectKey);
    } catch {
      throw new AppError(
        503,
        'STORAGE_UNAVAILABLE',
        'Document storage is unavailable. Please try again.',
      );
    }
    res
      .set('Content-Type', item.mimeType)
      .set('X-Content-Type-Options', 'nosniff')
      .set('Content-Security-Policy', "default-src 'none'; sandbox")
      .attachment(item.originalName)
      .send(data);
  });
  router.delete('/documents/:id', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    z.object({}).strict().parse(req.body);
    await db.$transaction(async (tx) => {
      const item =
        (await tx.projectDocument.findFirst({
          where: { id, archivedAt: null, ...scope(req.user!) },
          include: { project: true },
        })) ?? notFound();
      if (item.uploadedById !== req.user!.id && !canManageProject(req.user!, item.project))
        throw new AppError(
          403,
          'FORBIDDEN',
          'Only the uploader or project management may archive this document.',
        );
      await tx.projectDocument.update({ where: { id }, data: { archivedAt: new Date() } });
      await audit(
        tx,
        req.user!.id,
        'document.archived',
        item.taskId ? 'Task' : 'Project',
        item.taskId ?? item.projectId,
        { documentId: id },
      );
    });
    res.json({ data: { message: 'Document archived.' } });
  });
  return router;
}
