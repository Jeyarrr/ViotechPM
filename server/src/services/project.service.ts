import type { Prisma, Project } from '../generated/prisma/client.js';
import type { PublicUser } from './auth.service.js';
import { conflict, notFound } from './core.service.js';
import { AppError } from '../utils/errors.js';
export const isAdmin = (user: PublicUser) => user.role.key === 'super_admin';
export function projectScope(user: PublicUser): Prisma.ProjectWhereInput {
  return isAdmin(user) ? {} : { managerId: user.id };
}
export const projectInclude = {
  client: {
    select: { id: true, name: true, code: true, contactPerson: true, email: true, phone: true },
  },
  manager: { select: { id: true, name: true, email: true } },
  category: true,
  department: { select: { id: true, name: true } },
} as const;
export async function accessibleProject(
  tx: Prisma.TransactionClient,
  id: string,
  user: PublicUser,
  write = false,
) {
  if (write) await tx.$queryRaw`SELECT id FROM projects WHERE id = ${id}::uuid FOR UPDATE`;
  const project =
    (await tx.project.findFirst({
      where: { id, ...projectScope(user) },
      include: projectInclude,
    })) ?? notFound();
  if (
    write &&
    !isAdmin(user) &&
    (user.role.key !== 'project_manager' || project.managerId !== user.id)
  )
    throw new AppError(
      403,
      'FORBIDDEN',
      'Only the project manager or Super Admin may manage this project.',
    );
  return project;
}
export async function validateProject(
  tx: Prisma.TransactionClient,
  input: {
    clientId: string;
    categoryId: string;
    managerId: string;
    departmentId?: string | null;
    startDate: Date;
    targetDate: Date;
    status: string;
  },
  user: PublicUser,
  before?: Project,
) {
  if (input.targetDate < input.startDate)
    throw new AppError(
      422,
      'INVALID_DATES',
      'Target completion must be on or after the start date.',
    );
  if (!isAdmin(user) && input.managerId !== user.id)
    throw new AppError(403, 'FORBIDDEN', 'Project Managers may only assign themselves as manager.');
  if (!before || before.clientId !== input.clientId) {
    await tx.$queryRaw`SELECT id FROM clients WHERE id = ${input.clientId}::uuid FOR SHARE`;
    if (
      !(await tx.client.findFirst({
        where: { id: input.clientId, archivedAt: null, status: 'ACTIVE' },
      }))
    )
      conflict('Select an active, unarchived client.');
  }
  if (!before || before.managerId !== input.managerId) {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${input.managerId}::uuid FOR SHARE`;
    if (
      !(await tx.user.findFirst({
        where: {
          id: input.managerId,
          status: 'ACTIVE',
          role: { key: { in: ['super_admin', 'project_manager'] } },
        },
      }))
    )
      conflict('Select an active Super Admin or Project Manager.');
  }
  if (!before || before.categoryId !== input.categoryId) {
    await tx.$queryRaw`SELECT id FROM project_categories WHERE id = ${input.categoryId}::uuid FOR SHARE`;
    if (!(await tx.projectCategory.findFirst({ where: { id: input.categoryId, active: true } })))
      conflict('Select an active project category.');
  }
  if (
    input.departmentId &&
    !(await tx.department.findUnique({ where: { id: input.departmentId } }))
  )
    conflict('Select an existing department.');
  if (input.status === 'COMPLETED')
    conflict('Complete at least one project task before completing this project.');
}
