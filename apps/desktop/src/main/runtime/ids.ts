import { randomUUID } from "node:crypto";

export function createProjectId(): string {
  return `project_${randomUUID()}`;
}

export function createDocumentId(): string {
  return `doc_${randomUUID()}`;
}
